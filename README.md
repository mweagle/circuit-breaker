circuit-breaker
====================

What Is It
===

This is a port of
[Akka's Circuit Breaker](https://github.com/akka/akka/blob/master/akka-actor/src/main/scala/akka/pattern/CircuitBreaker.scala)
to [Node.js](http://nodejs.org).  When properly configured it can aid in [preventing cascading failures
in distributed systems](http://doc.akka.io/docs/akka/snapshot/common/circuitbreaker.html).

Why Use It
===

Because you have distributed resources and you would prefer not to self-inflict a
[DOS-style attack](http://en.wikipedia.org/wiki/Denial-of-service_attack) while
minimizing call latency in the presence of errors.  See also the
[Netflix post](http://techblog.netflix.com/2011/12/making-netflix-api-more-resilient.html)
on creating resilient systems.

How to Use It
===

1. Install: `npm install circuit-breaker`
2. Determine the configuration settings.  The documentation below is largely
copied from the [Akka source](https://github.com/akka/akka/blob/master/akka-actor/src/main/scala/akka/pattern/CircuitBreaker.scala#L78).
    1. `max_failures`:  The maximum error count to accumulate
                      before the gated function is assumed to have tripped
                      the breaker into the *OPEN* state.  NOTE:  An error is indicated
                      by invoking the `callback(e, result)` with a "truthy"
                      Error value.
    2. `call_timeout_ms`: Duration (in MS) that should be used to limit the execution time
                        of a gated function.  A function that takes longer than this
                        upper bound is assumed to have failed.
    3. `reset_timeout_ms`: Duration (in MS) that must expire for a tripped breaker
                        to transition to the *HALF-OPEN* state.  When a breaker enters
                        the *HALF-OPEN* state, the next call will be attempted, but
                        subsequent calls will fail fast until the results of the
                        allowed function are evaluated.  If the allowed function
                        succeeds, the failure count is set to zero and the breaker
                        enters the *CLOSED* state.  If it fails, the breaker enters the
                        *OPEN* state and the reset timer is restarted.

3. Reference It

  The circuit-breaker wraps either free functions or logically-related
  functions defined on a single Object.  The wrapped function(s) are aliased
  by the breaker so existing code transparently benefits from the
  fail-fast behavior.

  1. For a "standalone" function

      ```javascript
        var source_function = function(callback)
        {
          setImmediate(callback, null, null);
        };
        var gated_function = circuit_breaker.new_circuit_breaker(source_function,
                                                                  5 /* max_failures */,
                                                                  10 /* call_timeout_ms */,
                                                                  10 /* reset_timeout_ms */);
        gated_function(function (error, result) {
          console.log("Whee!");
        });
      ```

  2. For a set of semantically related functions attached to an Object (*eg*,
     a set of methods that correspond to an *RPC*-ish HTTP API exposed by a single
     host) :

      ```javascript
        var RemoteServiceAPI = function()
        {
          this.do_it = function(input, callback)
          {
            ...
          };
          this.do_it_smarter = function(some, value, callback)
          {
            ...
          };
          this.copyright = function(lawyers, callback)
          {
            ...
          };
        };
        // Wrapping an 'API object' in a circuit breaker
        // makes all the source functions available on the
        // circuit-breaker instance.  All aliased functions
        // share the same circuit-breaker instance
        // so their aggregated behavior contributes to a
        // single error count.
        var gated_api_adapter = circuit_breaker.new_circuit_breaker(new RemoteServiceAPI(),
                                                                    5 /* max_failures */,
                                                                    10 /* call_timeout_ms */,
                                                                    10 /* reset_timeout_ms */);
        gated_api_adapter.do_it('with some value', function (error, callback) {
          ...
        });
      ```

Error Cases
===
There are two states that the circuit-breaker Errors-out on and interrupts the
normal control flow:
  - Breaker is in the *OPEN* state: The breaker has been tripped and all
                                    function calls made while in this state will
                                    fail-fast with a `CircuitBreakerError` instance
                                    provided to the callback.
  - Function timeout: A given call has timed out and the callback is invoked
              with a `TimeoutError` instance.
              *NOTE*: any results (or Errors) returned after a `TimeoutError` has
              been raised will be discarded.

Sounds Great - What's the Catch?
===

The circuit-breaker depends on (asynchronous-only, CPS-style) functions whose
*last* argument is a callback of the form: `callback(error, result)`.  In order
to tap the call sequence the circuit-breaker assumes that the last function argument
is a callback function whose inputs can be used to update the breaker state.  Once the
circuit-breaker state has been updated with the tapped results, the `(error, result)`
values are passed to the original callback function.

Therefore, "circuit-gatable" signatures include:

```javascript
var zero_args = function(callback) {...};
var one_arg = function(input1, callback) {...};
var two_args = function(input1, input2, callback) {...};
// turtles...
```

But, if your function parameters are ordered as in:

```javascript
var breaker_needed = function(callback, input1, input2)
```

You're on your own.

TODOs
===
* Allow alternative function signatures
* Use a [phi-accrual-detector](https://github.com/mweagle/phi-accrual-detector) instead
  of a simple error count
