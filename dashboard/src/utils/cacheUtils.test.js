import { beforeEach, describe, expect, it } from 'vitest';
import { getCacheItem, setCacheItem } from './cacheUtils';

describe('cacheUtils', () => {
  beforeEach(() => localStorage.clear());

  it('returns cached metric data without changing its shape', () => {
    const metrics = [{ round: 1, loss: 0.2 }];
    setCacheItem('metrics_training_exp-1', metrics);

    expect(getCacheItem('metrics_training_exp-1')).toEqual(metrics);
  });

  it('expires metric data after its TTL', () => {
    setCacheItem('metrics_training_exp-1', [{ round: 1 }], 1);
    const entry = JSON.parse(localStorage.getItem('sentryfl_cache_v1_metrics_training_exp-1'));
    entry.timestamp = Date.now() - 10;
    localStorage.setItem('sentryfl_cache_v1_metrics_training_exp-1', JSON.stringify(entry));

    expect(getCacheItem('metrics_training_exp-1')).toBeNull();
  });
});
