/**
 * Cache utilities for browser-based metric data caching
 * Implements Requirement 37.7: Cache metric data in browser to reduce API calls
 */

const CACHE_PREFIX = 'sentryfl_cache_';
const CACHE_VERSION = 'v1';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Generate cache key with versioning
 * @param {string} key - Cache key
 * @returns {string} Versioned cache key
 */
const getCacheKey = (key) => `${CACHE_PREFIX}${CACHE_VERSION}_${key}`;

/**
 * Check if cache entry is expired
 * @param {number} timestamp - Cached timestamp
 * @param {number} ttl - Time to live in milliseconds
 * @returns {boolean} True if expired
 */
const isExpired = (timestamp, ttl) => {
  return Date.now() - timestamp > ttl;
};

/**
 * Set data in cache with TTL
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
 */
export const setCacheItem = (key, data, ttl = DEFAULT_TTL) => {
  try {
    const cacheEntry = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    const cacheKey = getCacheKey(key);
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
  } catch (error) {
    console.warn('Failed to cache data:', error);
    // Quota exceeded - clear old cache entries
    if (error.name === 'QuotaExceededError') {
      clearExpiredCache();
    }
  }
};

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {*|null} Cached data or null if not found/expired
 */
export const getCacheItem = (key) => {
  try {
    const cacheKey = getCacheKey(key);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }

    const cacheEntry = JSON.parse(cached);
    
    // Check if expired
    if (isExpired(cacheEntry.timestamp, cacheEntry.ttl)) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return cacheEntry.data;
  } catch (error) {
    console.warn('Failed to retrieve cached data:', error);
    return null;
  }
};

/**
 * Remove specific item from cache
 * @param {string} key - Cache key
 */
export const removeCacheItem = (key) => {
  try {
    const cacheKey = getCacheKey(key);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to remove cache item:', error);
  }
};

/**
 * Clear all expired cache entries
 */
export const clearExpiredCache = () => {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX + CACHE_VERSION));
    
    cacheKeys.forEach(cacheKey => {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cacheEntry = JSON.parse(cached);
          if (isExpired(cacheEntry.timestamp, cacheEntry.ttl)) {
            localStorage.removeItem(cacheKey);
          }
        }
      } catch (error) {
        // Remove corrupted cache entry
        localStorage.removeItem(cacheKey);
      }
    });
  } catch (error) {
    console.warn('Failed to clear expired cache:', error);
  }
};

/**
 * Clear all cache entries for this version
 */
export const clearAllCache = () => {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX + CACHE_VERSION));
    
    cacheKeys.forEach(cacheKey => {
      localStorage.removeItem(cacheKey);
    });
  } catch (error) {
    console.warn('Failed to clear all cache:', error);
  }
};

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
export const getCacheStats = () => {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX + CACHE_VERSION));
    
    let totalSize = 0;
    let expiredCount = 0;
    let activeCount = 0;
    
    cacheKeys.forEach(cacheKey => {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        totalSize += cached.length;
        try {
          const cacheEntry = JSON.parse(cached);
          if (isExpired(cacheEntry.timestamp, cacheEntry.ttl)) {
            expiredCount++;
          } else {
            activeCount++;
          }
        } catch (error) {
          expiredCount++;
        }
      }
    });

    return {
      totalEntries: cacheKeys.length,
      activeEntries: activeCount,
      expiredEntries: expiredCount,
      totalSizeBytes: totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
    };
  } catch (error) {
    console.warn('Failed to get cache stats:', error);
    return {
      totalEntries: 0,
      activeEntries: 0,
      expiredEntries: 0,
      totalSizeBytes: 0,
      totalSizeKB: '0.00',
    };
  }
};

/**
 * Cache experiment metrics
 * @param {string} experimentId - Experiment ID
 * @param {array} metrics - Metrics array
 * @param {number} ttl - Time to live (default: 2 minutes for real-time data)
 */
export const cacheExperimentMetrics = (experimentId, metrics, ttl = 2 * 60 * 1000) => {
  setCacheItem(`experiment_metrics_${experimentId}`, metrics, ttl);
};

/**
 * Get cached experiment metrics
 * @param {string} experimentId - Experiment ID
 * @returns {array|null} Cached metrics or null
 */
export const getCachedExperimentMetrics = (experimentId) => {
  return getCacheItem(`experiment_metrics_${experimentId}`);
};

/**
 * Cache experiment details
 * @param {string} experimentId - Experiment ID
 * @param {object} experiment - Experiment details
 * @param {number} ttl - Time to live (default: 5 minutes)
 */
export const cacheExperiment = (experimentId, experiment, ttl = DEFAULT_TTL) => {
  setCacheItem(`experiment_${experimentId}`, experiment, ttl);
};

/**
 * Get cached experiment details
 * @param {string} experimentId - Experiment ID
 * @returns {object|null} Cached experiment or null
 */
export const getCachedExperiment = (experimentId) => {
  return getCacheItem(`experiment_${experimentId}`);
};

/**
 * Cache experiment list
 * @param {array} experiments - Experiments array
 * @param {number} ttl - Time to live (default: 3 minutes)
 */
export const cacheExperimentList = (experiments, ttl = 3 * 60 * 1000) => {
  setCacheItem('experiment_list', experiments, ttl);
};

/**
 * Get cached experiment list
 * @returns {array|null} Cached experiments or null
 */
export const getCachedExperimentList = () => {
  return getCacheItem('experiment_list');
};

// Auto-cleanup on module load
clearExpiredCache();
