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

describe('Single function Circuit Breakers', function() {
  this.timeout(200000);

  /////////////////////////////////////////////////////////////////////////////
  // SETUP
  //
  before(function() {

  });

  after(function() {

  });

  beforeEach(function() {

  });

  afterEach(function (done) {
    done();
  });

  /////////////////////////////////////////////////////////////////////////////
  // TESTS
  //
  it ('MUST handle well-behaved functions', function(done) {
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

    var wrapped_function = function(callback)
    {
      setImmediate(callback, null, null);
    };
    // Repeatedly call the callback
    var gated_function = circuit_breaker.new_circuit_breaker(wrapped_function,
                                                              0,
                                                              10,
                                                              10);
    call_interval = setInterval(function () {
      sample_count -= 1;
      gated_function(test_callback);
    },
    CALL_FREQUENCY_MS);
  });

  it ('MUST handle well-behaved functions that accept arguments', function(done) {
    var sample_count = SAMPLE_COUNT;
    var call_interval = null;
    var PASS_THROUGH_VALUE = 'hello world';

    var test_callback = function(error, results)
    {
      assert(error === null, 'Error MUST be null');
      assert(results === PASS_THROUGH_VALUE, 'Arguments MUST be propagated');
      if (sample_count <= 0)
      {
        clearInterval(call_interval);
        done();
      }
    };
    var wrapped_function = function(some_value, some_value2, callback)
    {
      assert(some_value === PASS_THROUGH_VALUE, 'Arguments MUST be propagated');
      setImmediate(callback, null, some_value2);
    };
    // Repeatedly call the callback
    var gated_function = circuit_breaker.new_circuit_breaker(wrapped_function,
                                                              0,
                                                              10,
                                                              10);
    call_interval = setInterval(function () {
      sample_count -= 1;
      gated_function(PASS_THROUGH_VALUE, PASS_THROUGH_VALUE, test_callback);
    },
    CALL_FREQUENCY_MS);
  });

  it ('MUST handle functions that fail', function(done) {
    var sample_count = SAMPLE_COUNT;
    var call_interval = null;
    var error_count = 0;
    var test_callback = function(error)
    {
      error_count += (error ? 1 : 0);
      // Exit condition
      if (sample_count <= 0)
      {
        // Should get non-zero errors
        clearInterval(call_interval);
        assert(error_count > 0, 'Should be non-zero errors due to failing functions.');
        done();
      }
    };

    var wrapped_function = function(callback)
    {
      var error = (sample_count >= 5 && sample_count <= 15) ? 'Expected failure' : null;
      setImmediate(callback, error, null);
    };
    // Repeatedly call the callback
    var gated_function = circuit_breaker.new_circuit_breaker(wrapped_function,
                                                              0,
                                                              100,
                                                              100);
    call_interval = setInterval(function () {
      sample_count -= 1;
      gated_function(test_callback);
    },
    CALL_FREQUENCY_MS);
  });

  it ('MUST handle functions that timeout', function(done) {
    var sample_count = SAMPLE_COUNT;
    var call_interval = null;
    var error_count = 0;
    var test_callback = function(error)
    {
      error_count += (error ? 1 : 0);
    };

    var wrapped_function = function(/* callback */)
    {
      // Just don't call anything, ever...
      // Exit condition
      if (sample_count <= 0)
      {
        // Should get non-zero errors
        clearInterval(call_interval);
        assert(error_count > 0, 'Should be non-zero errors due to timeouts.');
        done();
      }
    };
    // Repeatedly call the callback
    var gated_function = circuit_breaker.new_circuit_breaker(wrapped_function,
                                                              0,
                                                              50,
                                                              75);
    call_interval = setInterval(function () {
      sample_count -= 1;
      gated_function(test_callback);
    },
    CALL_FREQUENCY_MS);
  });
});