/**
 * Cache Service for Python Backend Responses
 * 
 * Implements response caching to reduce backend load
 * Cache invalidation on state changes
 * Configurable TTL per endpoint type
 * 
 * Requirement: 26.10
 */

const NodeCache = require('node-cache');

/**
 * TTL Configuration per endpoint type (in seconds)
 * 
 * Requirement: 26.10
 */
const TTL_CONFIG = {
  // Status changes frequently during training
  status: parseInt(process.env.CACHE_TTL_STATUS) || 5,
  
  // Metrics update every round
  metrics: parseInt(process.env.CACHE_TTL_METRICS) || 10,
  
  // Reports are static once completed
  report: parseInt(process.env.CACHE_TTL_REPORT) || 300,
  
  // Experiment list changes infrequently
  experiments: parseInt(process.env.CACHE_TTL_EXPERIMENTS) || 30,
  
  // Health check should be fresh
  health: parseInt(process.env.CACHE_TTL_HEALTH) || 2,
  
  // Config validation can be cached longer
  configValidation: parseInt(process.env.CACHE_TTL_CONFIG_VALIDATION) || 60,
  
  // Default TTL for other endpoints
  default: parseInt(process.env.CACHE_TTL_SECONDS) || 30,
};

/**
 * Cache Service
 * 
 * Provides caching functionality for Python backend responses
 * with automatic TTL management and invalidation
 */
class CacheService {
  constructor() {
    // Initialize cache with check period for expired keys
    this.cache = new NodeCache({
      stdTTL: TTL_CONFIG.default,
      checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD) || 10,
      useClones: true, // Return cloned values to prevent mutation
    });

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      flushes: 0,
    };
  }

  /**
   * Generate cache key for endpoint
   * 
   * @param {string} endpoint - Endpoint name (status, metrics, etc.)
   * @param {string} experimentId - Experiment ID
   * @param {Object} params - Additional parameters
   * @returns {string} Cache key
   */
  generateKey(endpoint, experimentId = null, params = {}) {
    const parts = [endpoint];
    
    if (experimentId) {
      parts.push(experimentId);
    }
    
    // Include params in key if provided
    if (params && Object.keys(params).length > 0) {
      const paramsStr = JSON.stringify(params);
      parts.push(paramsStr);
    }
    
    return parts.join(':');
  }

  /**
   * Get value from cache
   * 
   * @param {string} key - Cache key
   * @returns {any|undefined} Cached value or undefined
   */
  get(key) {
    const value = this.cache.get(key);
    
    if (value !== undefined) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    
    return value;
  }

  /**
   * Set value in cache with TTL
   * 
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {boolean} Success
   */
  set(key, value, ttl = null) {
    const success = this.cache.set(key, value, ttl || TTL_CONFIG.default);
    
    if (success) {
      this.stats.sets++;
    }
    
    return success;
  }

  /**
   * Delete value from cache
   * 
   * @param {string} key - Cache key
   * @returns {number} Number of deleted entries
   */
  del(key) {
    const deleted = this.cache.del(key);
    
    if (deleted > 0) {
      this.stats.deletes += deleted;
    }
    
    return deleted;
  }

  /**
   * Flush all cache entries
   * 
   * @returns {void}
   */
  flush() {
    this.cache.flushAll();
    this.stats.flushes++;
  }

  /**
   * Invalidate cache for specific experiment
   * 
   * Removes all cached entries related to an experiment
   * Use when experiment state changes (start, stop, pause, resume)
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {number} Number of deleted entries
   * 
   * Requirement: 26.10
   */
  invalidateExperiment(experimentId) {
    const keys = this.cache.keys();
    const experimentKeys = keys.filter(key => key.includes(experimentId));
    
    let deleted = 0;
    experimentKeys.forEach(key => {
      deleted += this.cache.del(key);
    });
    
    this.stats.deletes += deleted;
    return deleted;
  }

  /**
   * Invalidate cache by pattern
   * 
   * @param {string} pattern - Pattern to match (e.g., 'status:', 'metrics:')
   * @returns {number} Number of deleted entries
   */
  invalidateByPattern(pattern) {
    const keys = this.cache.keys();
    const matchingKeys = keys.filter(key => key.includes(pattern));
    
    let deleted = 0;
    matchingKeys.forEach(key => {
      deleted += this.cache.del(key);
    });
    
    this.stats.deletes += deleted;
    return deleted;
  }

  /**
   * Get cache statistics
   * 
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      keys: this.cache.keys().length,
    };
  }

  /**
   * Get TTL for endpoint type
   * 
   * @param {string} endpoint - Endpoint name
   * @returns {number} TTL in seconds
   */
  getTTL(endpoint) {
    return TTL_CONFIG[endpoint] || TTL_CONFIG.default;
  }

  /**
   * Reset statistics
   * 
   * @returns {void}
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      flushes: 0,
    };
  }
}

module.exports = new CacheService();
