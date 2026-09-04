/**
 * Debouncing utilities for WebSocket events
 * Implements Requirement 37.3: Debounce WebSocket events to prevent excessive re-renders
 */

/**
 * Create a debounced function that delays execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @param {object} options - Options { leading: boolean, trailing: boolean, maxWait: number }
 * @returns {Function} Debounced function with cancel method
 */
export const debounce = (func, wait, options = {}) => {
  let timeout;
  let lastArgs;
  let lastThis;
  let maxWaitTimeout;
  let lastCallTime;
  let lastInvokeTime = 0;
  
  const { leading = false, trailing = true, maxWait } = options;
  
  const invokeFunc = (time) => {
    const args = lastArgs;
    const thisArg = lastThis;
    
    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    return func.apply(thisArg, args);
  };
  
  const shouldInvoke = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    
    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  };
  
  const leadingEdge = (time) => {
    lastInvokeTime = time;
    timeout = setTimeout(timerExpired, wait);
    return leading ? invokeFunc(time) : undefined;
  };
  
  const remainingWait = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;
    
    return maxWait !== undefined
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  };
  
  const trailingEdge = (time) => {
    timeout = undefined;
    
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return undefined;
  };
  
  const timerExpired = () => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timeout = setTimeout(timerExpired, remainingWait(time));
  };
  
  const cancel = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    if (maxWaitTimeout !== undefined) {
      clearTimeout(maxWaitTimeout);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timeout = maxWaitTimeout = undefined;
  };
  
  const flush = () => {
    return timeout === undefined ? undefined : trailingEdge(Date.now());
  };
  
  const pending = () => {
    return timeout !== undefined;
  };
  
  const debounced = function (...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);
    
    lastArgs = args;
    lastThis = this;
    lastCallTime = time;
    
    if (isInvoking) {
      if (timeout === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxWait !== undefined) {
        timeout = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timeout === undefined) {
      timeout = setTimeout(timerExpired, wait);
    }
    return undefined;
  };
  
  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;
  
  return debounced;
};

/**
 * Create a throttled function that executes at most once per specified time
 * @param {Function} func - Function to throttle
 * @param {number} wait - Minimum time between executions in milliseconds
 * @param {object} options - Options { leading: boolean, trailing: boolean }
 * @returns {Function} Throttled function
 */
export const throttle = (func, wait, options = {}) => {
  const { leading = true, trailing = true } = options;
  
  return debounce(func, wait, {
    leading,
    trailing,
    maxWait: wait,
  });
};

/**
 * Debounce WebSocket event handler to prevent excessive re-renders
 * Specifically tuned for real-time metric updates
 * @param {Function} handler - Event handler function
 * @param {number} delay - Debounce delay in milliseconds (default: 100ms)
 * @returns {Function} Debounced event handler
 */
export const debounceWebSocketEvent = (handler, delay = 100) => {
  return debounce(handler, delay, {
    leading: false,
    trailing: true,
    maxWait: delay * 2, // Ensure update at least every 200ms
  });
};

/**
 * Throttle WebSocket event handler to limit update frequency
 * Used for high-frequency events that need immediate response
 * @param {Function} handler - Event handler function
 * @param {number} interval - Minimum interval between calls in milliseconds (default: 100ms)
 * @returns {Function} Throttled event handler
 */
export const throttleWebSocketEvent = (handler, interval = 100) => {
  return throttle(handler, interval, {
    leading: true,
    trailing: true,
  });
};

/**
 * Batch WebSocket events and process them together
 * Useful for events that can be aggregated
 * @param {Function} processor - Function to process batched events
 * @param {number} batchDelay - Time to wait before processing batch (default: 150ms)
 * @returns {object} Object with add and flush methods
 */
export const batchWebSocketEvents = (processor, batchDelay = 150) => {
  let batch = [];
  let timeout;
  
  const processBatch = () => {
    if (batch.length > 0) {
      processor([...batch]);
      batch = [];
    }
    timeout = undefined;
  };
  
  const add = (event) => {
    batch.push(event);
    
    if (timeout === undefined) {
      timeout = setTimeout(processBatch, batchDelay);
    }
  };
  
  const flush = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    processBatch();
  };
  
  const clear = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    batch = [];
  };
  
  return { add, flush, clear };
};

/**
 * Rate limiter for WebSocket events
 * Ensures maximum number of events processed per time window
 * @param {Function} handler - Event handler function
 * @param {number} maxCalls - Maximum calls allowed
 * @param {number} timeWindow - Time window in milliseconds
 * @returns {Function} Rate-limited handler
 */
export const rateLimitWebSocketEvent = (handler, maxCalls = 10, timeWindow = 1000) => {
  let calls = [];
  
  return function (...args) {
    const now = Date.now();
    
    // Remove old calls outside the time window
    calls = calls.filter(timestamp => now - timestamp < timeWindow);
    
    // Check if we can make a new call
    if (calls.length < maxCalls) {
      calls.push(now);
      return handler.apply(this, args);
    }
    
    // Rate limit exceeded
    console.warn(`WebSocket event rate limit exceeded: ${maxCalls} calls per ${timeWindow}ms`);
    return undefined;
  };
};
