// Copyright (c) 2012 Matt Weagle (mweagle@gmail.com)

// Permission is hereby granted, free of charge, to
// any person obtaining a copy of this software and
// associated documentation files (the "Software"),
// to deal in the Software without restriction,
// including without limitation the rights to use,
// copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so,
// subject to the following conditions:

// The above copyright notice and this permission
// notice shall be included in all copies or substantial
// portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
// ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
// TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
// SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
// IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE

var util = require('util');

/*****************************************************************************/
// Privates
/*****************************************************************************/

/**
 * CircuitBreaker states
 * @type {Object} Valid CircuitBreaker states
 */
var STATE = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

/**
 * Return a time value (in MS) that is either the
 * process.hrtime() value, or if optional_base_ms_time
 * is provided, the delta between the two measurements.
 * @param  {Number} optional_base_ms_time Optional base time to use for
 *                                        delta time.
 * @return {Number}                       Time or duration, in MS
 */
var _ms_value = function(optional_base_ms_time)
{
  var now_time = process.hrtime();
  var ts = Math.floor((now_time[0] * 1000) + (now_time[1]/1000000));
  return (optional_base_ms_time ? (ts - optional_base_ms_time) : ts);
};

/*****************************************************************************/
// TimeoutError
/*****************************************************************************/
var TimeoutError = function(fn_name, duration)
{
  Error.captureStackTrace(this, TimeoutError);
  this.message = util.format('Function %s timed out after: %d ms',
                              fn_name,
                              duration);

};
util.inherits(TimeoutError, Error);
TimeoutError.prototype.name = 'Timeout Error';

/*****************************************************************************/
// CircuitBreakerError
/*****************************************************************************/
var CircuitBreakerError = function(fn_name)
{
  Error.captureStackTrace(this, CircuitBreakerError);
  this.message = util.format('Function %s failed-fast due to circuit-breaker OPEN',
                              fn_name);

};
util.inherits(CircuitBreakerError, Error);
CircuitBreakerError.prototype.name = 'CircuitBreaker Error';

/*****************************************************************************/
// CircuitBreaker
/*****************************************************************************/
/**
 * CircuitBreaker instance that gates access to underlying functions.
 * @param {Object/Function} object_or_function Either an Object whose enumerable
 *                                             functions should be grouped together
 *                                             behind a single CircuitBreaker, or
 *                                             a free function with the same behavior.
 * @param {Number} max_failures       Maximum number of failures before breaker
 *                                    transitions to the OPEN state.
 * @param {Number} call_timeout_ms    Function call timeout.  Functions
 *                                    that take longer than this value (in MS) are
 *                                    considered to have failed.
 * @param {Number} reset_timeout_ms    Duration (in MS) that must elapse before a
 *                                    breaker in the OPEN state transitions to the
 *                                    HALF_OPEN state.
 */
var CircuitBreaker = function(object_or_function,
                              max_failures,
                              call_timeout_ms,
                              reset_timeout_ms)
{
  Object.defineProperty(this, '_gated_max_failures', {value: max_failures});
  Object.defineProperty(this, '_gated_call_timeout_ms', {value: call_timeout_ms});
  Object.defineProperty(this, '_gated_reset_timeout_ms', {value: reset_timeout_ms});
  var failure_counter = 0;
  Object.defineProperty(this, '_gated_failure_counter',
                                {
                                  get :function () {
                                    return failure_counter;
                                  },
                                  set: function(new_value) {
                                    failure_counter = new_value;
                                  }
                                });
  var breaker_state = STATE.CLOSED;
  Object.defineProperty(this, '_gated_breaker_state',
                                {
                                  get :function () {
                                    return breaker_state;
                                  },
                                  set: function(new_state) {
                                    breaker_state = new_state;
                                  }
                                });
  var last_call_time = null;
  Object.defineProperty(this, '_gated_last_call_time',
                                {
                                  get :function () {
                                    return last_call_time || _ms_value();
                                  },
                                  set: function(new_call_time) {
                                    last_call_time = new_call_time;
                                  }
                                });

  var self = this;
  var gate_function = function(this_ptr, fn_name, fn_impl)
  {
    self[fn_name] = function(/* arguments*, callback */)
    {
      var call_timeout_id = null;
      var callback_invoked = false;

      // This is the tapped callback that will update the
      // circuit breaker before passing the results onto the
      // target_callback
      var tapped_callback = function(error, results)
      {
        if (!callback_invoked)
        {
          callback_invoked = true;
          clearTimeout(call_timeout_id);
          if (!error)
          {
            self._gated_breaker_state = STATE.CLOSED;
            self._gated_failure_counter = 0;
          }
          else
          {
            self._gated_failure_counter = (self._gated_failure_counter + 1);
            self._gated_breaker_state = (self._gated_failure_counter >= self._gated_max_failures) ?
                                          STATE.OPEN : STATE.CLOSED;

            // If we're open, set a timeout so that we can update our
            // state to half-open after the configured timeout.  Once this is
            // triggered, the next call will be executed to see
            // if the service is back online...
            if (self._gated_breaker_state === STATE.OPEN)
            {
              setTimeout(function onHalfOpen()
              {
                self._gated_breaker_state = STATE.HALF_OPEN;
              },
              self._gated_reset_timeout_ms);
            }
          }
          // Pass it on...
          target_callback.call(this_ptr, error, results);
        }
        else
        {
          // NOP - callback already executed
        }
      };

      // Get the arguments, swapping our tapped callback for the
      // supplied one.
      // This automatic aliasing requires that the target function
      // has the signature:
      //  fn(args*, callback)
      //
      var tapped_arguments = Array.prototype.slice.call(arguments);
      var target_callback = tapped_arguments.pop();

      // Hard to gate if we don't know where to go...
      if (typeof(target_callback) !== 'function')
      {
        throw new Error('circuit-breaker functions must have signatures where the last argument is callback(e, result)');
      }
      // Push our tapped_callback onto the argument
      // array so we can manage the circuit breaker
      tapped_arguments.push(tapped_callback);

      /////////////////////////////////////////////////////////////////////////
      //
      // Call the function, failing immediately if we're in
      // an unsupported call state
      //
      var call_function = (self._gated_breaker_state !== STATE.OPEN);

      // Guard so that only first call attempt after reset timeout has triggered
      if (self._gated_breaker_state === STATE.HALF_OPEN)
      {
        self._gated_breaker_state = STATE.OPEN;
      }

      /////////////////////////////////////////////////////////////////////////
      // At this point we're either going to call or fail fast
      if (call_function)
      {
        var call_time = _ms_value();
        self._gated_last_call_time = call_time;
        call_timeout_id = setTimeout(function onTimeout()
                                      {
                                        var error = new TimeoutError(fn_name, _ms_value(call_time));
                                        tapped_callback(error, null);
                                      },
                                      self._gated_call_timeout_ms);
        fn_impl.apply(this_ptr, tapped_arguments);
      }
      else
      {
        setImmediate(target_callback, new CircuitBreakerError(fn_name), null);
      }
    };
  };

  ///////////////////////////////////////////////////////////////////////////
  //
  // Tap the functions that we're supposed to circuit-break on
  //
  if (typeof(object_or_function) === 'function')
  {
    gate_function(null, 'call', object_or_function);
  }
  else
  {
    Object.keys(object_or_function).forEach(function (eachKey) {
      var object_value = object_or_function[eachKey];
      if (typeof(object_value) === 'function')
      {
        gate_function(object_or_function, eachKey, object_value);
      }
    });
  }
};

/*****************************************************************************/
// Exports
/*****************************************************************************/
module.exports.new_circuit_breaker = function(object_or_function,
                                              max_failures,
                                              call_timeout_ms,
                                              reset_timeout_ms)
{
  var breaker = new CircuitBreaker(object_or_function,
                                max_failures,
                                call_timeout_ms,
                                reset_timeout_ms);

  return ((typeof(object_or_function) === 'function') ? breaker.call : breaker);
};

module.exports.TimeoutError = TimeoutError;
module.exports.CircuitBreakerError = CircuitBreakerError;