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
var assert = require('assert');
var circuit_breaker = require('../lib/circuit-breaker');

var SAMPLE_COUNT = 20;
var CALL_FREQUENCY_MS = 50;

var ObjectBreaker = function(fn_error_provider)
{
  // Add a property that must be ignored by the CircuitBreaker
  // because it's not a function.
  this.ignore_property = true;

  var error_provider = fn_error_provider || function () {return null;};
  Object.defineProperty(this, 'error_provider', {value: error_provider});

  var self = this;
  ['one', 'two', 'three'].forEach(function (eachName) {
    self[eachName] = function(callback)
    {
      assert(this === self, 'This pointer MUST be preserved!');
      setImmediate(callback, self.error_provider(), null);
    };
  });
};
var wrapped_object = null;

describe('Object-based Circuit Breakers', function() {
  this.timeout(200000);

  /////////////////////////////////////////////////////////////////////////////
  // SETUP
  //
  before(function() {

  });

  after(function() {

  });

  beforeEach(function() {
    wrapped_object = new ObjectBreaker();
  });

  afterEach(function (done) {
    done();
  });

  /////////////////////////////////////////////////////////////////////////////
  // TESTS
  //
  it ('MUST handle object-based circuit breakers', function(done) {
    var sample_count = SAMPLE_COUNT;
    var call_interval = null;

    var test_callback = function(error, results)
    {
      assert(error === null, 'Error MUST be null');
      assert(results === null, 'Results MUST be null');
      if (sample_count <= 0)
      {
        clearInterval(call_interval);
        done();
      }
    };

    // Repeatedly call the callback
    var fn_names = Object.keys(wrapped_object).filter(function (eachKey) {
      return (typeof(wrapped_object[eachKey]) === 'function');
    });
    var gated_object = circuit_breaker.new_circuit_breaker(wrapped_object,
                                                              0,
                                                              10,
                                                              10);

    call_interval = setInterval(function () {
      sample_count -= 1;
      var fn_call_idx = (sample_count % fn_names.length);
      gated_object[fn_names[fn_call_idx]](test_callback);
    },
    CALL_FREQUENCY_MS);
  });

  it ('MUST share failure state across object functions', function(done) {
    var sample_count = SAMPLE_COUNT;
    var call_interval = null;
    var error_count = 0;
    var test_callback = function(error /*, results*/)
    {
      error_count += (error ? 1 : 0);
      if (sample_count <= 0)
      {
        clearInterval(call_interval);
        assert(error_count === SAMPLE_COUNT/2, "Error count should be shared");
        done();
      }
    };
    var error_provider = function() {
      return ((sample_count % 2) === 0);
    };
    wrapped_object = new ObjectBreaker(error_provider);

    // Repeatedly call the callback
    var fn_names = Object.keys(wrapped_object).filter(function (eachKey) {
      return (typeof(wrapped_object[eachKey]) === 'function');
    });
    var gated_object = circuit_breaker.new_circuit_breaker(wrapped_object,
                                                              0,
                                                              10,
                                                              10);

    call_interval = setInterval(function () {
      sample_count -= 1;
      var fn_call_idx = (sample_count % fn_names.length);
      gated_object[fn_names[fn_call_idx]](test_callback);
    },
    CALL_FREQUENCY_MS);
  });
});