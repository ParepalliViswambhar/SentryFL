/**
 * Unit Tests for Cache Service
 * 
 * Tests response caching functionality
 * 
 * Requirement: 26.10
 */

const CacheService = require('./cacheService');

// Create a fresh instance for testing
let cacheService;

describe('CacheService', () => {
  beforeEach(() => {
    // Reset the cache service before each test
    cacheService = CacheService;
    cacheService.flush();
    cacheService.resetStats();
  });

  describe('generateKey', () => {
    it('should generate key with endpoint only', () => {
      const key = cacheService.generateKey('health');
      expect(key).toBe('health');
    });

    it('should generate key with endpoint and experiment ID', () => {
      const key = cacheService.generateKey('status', 'exp-123');
      expect(key).toBe('status:exp-123');
    });

    it('should generate key with endpoint, experiment ID, and params', () => {
      const key = cacheService.generateKey('metrics', 'exp-123', { round: 5 });
      expect(key).toBe('metrics:exp-123:{"round":5}');
    });

    it('should handle null experiment ID', () => {
      const key = cacheService.generateKey('experiments', null, { limit: 10 });
      expect(key).toBe('experiments:{"limit":10}');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve value', () => {
      const key = 'test-key';
      const value = { data: 'test-data' };

      const setResult = cacheService.set(key, value);
      expect(setResult).toBe(true);

      const retrieved = cacheService.get(key);
      expect(retrieved).toEqual(value);
    });

    it('should return undefined for non-existent key', () => {
      const retrieved = cacheService.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should update statistics on get', () => {
      cacheService.set('key1', 'value1');
      
      cacheService.get('key1'); // hit
      cacheService.get('key2'); // miss

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should clone values to prevent mutation', () => {
      const original = { count: 1 };
      cacheService.set('key', original);

      const retrieved = cacheService.get('key');
      retrieved.count = 2;

      const retrievedAgain = cacheService.get('key');
      expect(retrievedAgain.count).toBe(1); // Original value unchanged
    });
  });

  describe('del', () => {
    it('should delete existing key', () => {
      cacheService.set('key1', 'value1');
      
      const deleted = cacheService.del('key1');
      expect(deleted).toBe(1);

      const retrieved = cacheService.get('key1');
      expect(retrieved).toBeUndefined();
    });

    it('should return 0 for non-existent key', () => {
      const deleted = cacheService.del('non-existent');
      expect(deleted).toBe(0);
    });

    it('should update statistics on delete', () => {
      cacheService.set('key1', 'value1');
      cacheService.del('key1');

      const stats = cacheService.getStats();
      expect(stats.deletes).toBe(1);
    });
  });

  describe('flush', () => {
    it('should clear all cache entries', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');

      cacheService.flush();

      expect(cacheService.get('key1')).toBeUndefined();
      expect(cacheService.get('key2')).toBeUndefined();
    });

    it('should update statistics on flush', () => {
      cacheService.flush();

      const stats = cacheService.getStats();
      expect(stats.flushes).toBe(1);
    });
  });

  describe('invalidateExperiment', () => {
    it('should invalidate all keys for an experiment', () => {
      const experimentId = 'exp-123';
      
      cacheService.set('status:exp-123', { status: 'running' });
      cacheService.set('metrics:exp-123', { accuracy: 0.9 });
      cacheService.set('status:exp-456', { status: 'completed' });

      const deleted = cacheService.invalidateExperiment(experimentId);

      expect(deleted).toBe(2);
      expect(cacheService.get('status:exp-123')).toBeUndefined();
      expect(cacheService.get('metrics:exp-123')).toBeUndefined();
      expect(cacheService.get('status:exp-456')).toBeDefined();
    });

    it('should return 0 if no keys match', () => {
      const deleted = cacheService.invalidateExperiment('non-existent');
      expect(deleted).toBe(0);
    });
  });

  describe('invalidateByPattern', () => {
    it('should invalidate keys matching pattern', () => {
      cacheService.set('status:exp-123', { status: 'running' });
      cacheService.set('status:exp-456', { status: 'completed' });
      cacheService.set('metrics:exp-123', { accuracy: 0.9 });

      const deleted = cacheService.invalidateByPattern('status:');

      expect(deleted).toBe(2);
      expect(cacheService.get('status:exp-123')).toBeUndefined();
      expect(cacheService.get('status:exp-456')).toBeUndefined();
      expect(cacheService.get('metrics:exp-123')).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cacheService.set('key1', 'value1');
      cacheService.get('key1'); // hit
      cacheService.get('key2'); // miss
      cacheService.del('key1');

      const stats = cacheService.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.deletes).toBe(1);
      expect(stats.hitRate).toBe('50.00%');
      expect(stats.keys).toBe(0);
    });

    it('should handle zero operations', () => {
      const stats = cacheService.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe('0%');
    });
  });

  describe('getTTL', () => {
    it('should return correct TTL for known endpoints', () => {
      expect(cacheService.getTTL('status')).toBe(5);
      expect(cacheService.getTTL('metrics')).toBe(10);
      expect(cacheService.getTTL('report')).toBe(300);
      expect(cacheService.getTTL('experiments')).toBe(30);
      expect(cacheService.getTTL('health')).toBe(2);
      expect(cacheService.getTTL('configValidation')).toBe(60);
    });

    it('should return default TTL for unknown endpoints', () => {
      const ttl = cacheService.getTTL('unknown');
      expect(ttl).toBe(30); // default TTL
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', (done) => {
      const key = 'short-lived';
      const value = 'test-value';
      const ttl = 1; // 1 second

      cacheService.set(key, value, ttl);
      expect(cacheService.get(key)).toBe(value);

      // Wait for TTL to expire
      setTimeout(() => {
        expect(cacheService.get(key)).toBeUndefined();
        done();
      }, 1100); // Wait slightly longer than TTL
    }, 2000);
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      cacheService.set('key1', 'value1');
      cacheService.get('key1');
      cacheService.del('key1');

      cacheService.resetStats();

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
      expect(stats.deletes).toBe(0);
      expect(stats.flushes).toBe(0);
    });
  });
});
