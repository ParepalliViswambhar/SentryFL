/**
 * Tests for Data Utility Functions
 * 
 * Tests downsampling algorithms and performance optimization utilities
 * 
 * Requirements: 37.6 (Chart data downsampling for datasets >1000 points)
 */

import { describe, it, expect } from 'vitest';
import {
  downsampleLTTB,
  downsampleEveryNth,
  downsampleTimeSeries,
  downsampleChartData,
  needsDownsampling,
  throttle,
  debounce,
} from './dataUtils';

describe('dataUtils - Downsampling', () => {
  describe('downsampleLTTB', () => {
    it('should return original data if below threshold', () => {
      const data = [1, 2, 3, 4, 5];
      const result = downsampleLTTB(data, 10);
      expect(result).toEqual(data);
    });

    it('should downsample data to target threshold', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const result = downsampleLTTB(data, 100);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result[0]).toBe(0); // First point preserved
      expect(result[result.length - 1]).toBe(999); // Last point preserved
    });

    it('should handle object data with x and y properties', () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: Math.sin(i / 10) }));
      const result = downsampleLTTB(data, 100);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result[0]).toEqual(data[0]);
      expect(result[result.length - 1]).toEqual(data[data.length - 1]);
    });

    it('should preserve visual characteristics of sine wave', () => {
      const data = Array.from({ length: 2000 }, (_, i) => ({
        x: i,
        y: Math.sin(i / 50) * 100,
      }));
      const result = downsampleLTTB(data, 200);
      
      // Check that peaks and troughs are roughly preserved
      const originalMax = Math.max(...data.map((p) => p.y));
      const originalMin = Math.min(...data.map((p) => p.y));
      const resultMax = Math.max(...result.map((p) => p.y));
      const resultMin = Math.min(...result.map((p) => p.y));
      
      expect(Math.abs(originalMax - resultMax)).toBeLessThan(5);
      expect(Math.abs(originalMin - resultMin)).toBeLessThan(5);
    });
  });

  describe('downsampleEveryNth', () => {
    it('should return original data if below threshold', () => {
      const data = [1, 2, 3, 4, 5];
      const result = downsampleEveryNth(data, 10);
      expect(result).toEqual(data);
    });

    it('should downsample by taking every nth point', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const result = downsampleEveryNth(data, 100);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result[0]).toBe(0);
      expect(result[result.length - 1]).toBe(999);
    });

    it('should include last point even if not on step boundary', () => {
      const data = Array.from({ length: 105 }, (_, i) => i);
      const result = downsampleEveryNth(data, 10);
      expect(result[result.length - 1]).toBe(104);
    });
  });

  describe('downsampleTimeSeries', () => {
    it('should return original data if below max points', () => {
      const data = Array.from({ length: 500 }, (_, i) => ({ timestamp: i, value: i }));
      const result = downsampleTimeSeries(data, 1000);
      expect(result).toEqual(data);
    });

    it('should downsample large time-series data', () => {
      const data = Array.from({ length: 5000 }, (_, i) => ({
        timestamp: i,
        value: Math.sin(i / 100),
      }));
      const result = downsampleTimeSeries(data, 1000);
      expect(result.length).toBeLessThanOrEqual(1000);
      expect(result[0]).toEqual(data[0]);
      expect(result[result.length - 1]).toEqual(data[data.length - 1]);
    });
  });

  describe('downsampleChartData', () => {
    it('should return original data if below max points', () => {
      const chartData = {
        labels: Array.from({ length: 500 }, (_, i) => i),
        datasets: [
          { label: 'Dataset 1', data: Array.from({ length: 500 }, (_, i) => i * 2) },
        ],
      };
      const result = downsampleChartData(chartData, 1000);
      expect(result).toEqual(chartData);
    });

    it('should downsample chart data with multiple datasets', () => {
      const chartData = {
        labels: Array.from({ length: 2000 }, (_, i) => `Round ${i}`),
        datasets: [
          {
            label: 'Loss',
            data: Array.from({ length: 2000 }, (_, i) => Math.random()),
          },
          {
            label: 'Accuracy',
            data: Array.from({ length: 2000 }, (_, i) => Math.random()),
          },
        ],
      };
      const result = downsampleChartData(chartData, 500);
      
      expect(result.labels.length).toBeLessThanOrEqual(500);
      expect(result.datasets.length).toBe(2);
      expect(result.datasets[0].data.length).toBe(result.labels.length);
      expect(result.datasets[1].data.length).toBe(result.labels.length);
    });

    it('should preserve dataset properties', () => {
      const chartData = {
        labels: Array.from({ length: 2000 }, (_, i) => i),
        datasets: [
          {
            label: 'Test Dataset',
            data: Array.from({ length: 2000 }, (_, i) => i),
            borderColor: '#ff0000',
            backgroundColor: '#00ff00',
          },
        ],
      };
      const result = downsampleChartData(chartData, 500);
      
      expect(result.datasets[0].label).toBe('Test Dataset');
      expect(result.datasets[0].borderColor).toBe('#ff0000');
      expect(result.datasets[0].backgroundColor).toBe('#00ff00');
    });
  });

  describe('needsDownsampling', () => {
    it('should return false for small arrays', () => {
      const data = Array.from({ length: 500 }, (_, i) => i);
      expect(needsDownsampling(data, 1000)).toBe(false);
    });

    it('should return true for large arrays', () => {
      const data = Array.from({ length: 1500 }, (_, i) => i);
      expect(needsDownsampling(data, 1000)).toBe(true);
    });

    it('should work with chart data objects', () => {
      const chartData = {
        labels: Array.from({ length: 1500 }, (_, i) => i),
        datasets: [],
      };
      expect(needsDownsampling(chartData, 1000)).toBe(true);
    });

    it('should return false for chart data below threshold', () => {
      const chartData = {
        labels: Array.from({ length: 500 }, (_, i) => i),
        datasets: [],
      };
      expect(needsDownsampling(chartData, 1000)).toBe(false);
    });
  });
});

describe('dataUtils - Performance Utilities', () => {
  describe('throttle', () => {
    it('should throttle function calls', (done) => {
      let callCount = 0;
      const throttled = throttle(() => {
        callCount++;
      }, 100);

      // Call multiple times rapidly
      throttled();
      throttled();
      throttled();
      throttled();

      // Should only execute once immediately
      expect(callCount).toBe(1);

      // After delay, should allow another call
      setTimeout(() => {
        throttled();
        expect(callCount).toBe(2);
        done();
      }, 150);
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', (done) => {
      let callCount = 0;
      const debounced = debounce(() => {
        callCount++;
      }, 100);

      // Call multiple times rapidly
      debounced();
      debounced();
      debounced();
      debounced();

      // Should not execute immediately
      expect(callCount).toBe(0);

      // Should execute once after delay
      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 150);
    });

    it('should reset timer on each call', (done) => {
      let callCount = 0;
      const debounced = debounce(() => {
        callCount++;
      }, 100);

      debounced();
      
      setTimeout(() => debounced(), 50);
      setTimeout(() => debounced(), 100);
      
      // Should still be 0 after 150ms
      setTimeout(() => {
        expect(callCount).toBe(0);
      }, 150);

      // Should execute once after final delay
      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 250);
    });
  });
});

describe('dataUtils - Performance Benchmarks', () => {
  it('LTTB should be faster than no downsampling for rendering', () => {
    const largeData = Array.from({ length: 10000 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 100) * 100 + Math.random() * 10,
    }));

    const startOriginal = performance.now();
    const originalLength = largeData.length;
    const endOriginal = performance.now();
    const originalTime = endOriginal - startOriginal;

    const startDownsampled = performance.now();
    const downsampled = downsampleLTTB(largeData, 1000);
    const endDownsampled = performance.now();
    const downsampledTime = endDownsampled - startDownsampled;

    // Downsampled data should be much smaller
    expect(downsampled.length).toBeLessThan(originalLength);
    expect(downsampled.length).toBeLessThanOrEqual(1000);
    
    // Downsampling should complete in reasonable time (< 100ms for 10k points)
    expect(downsampledTime).toBeLessThan(100);
  });

  it('should handle null and undefined values gracefully', () => {
    const dataWithNulls = [
      { x: 0, y: 1 },
      { x: 1, y: null },
      { x: 2, y: undefined },
      { x: 3, y: 4 },
      { x: 4, y: 5 },
    ];

    expect(() => downsampleLTTB(dataWithNulls, 3)).not.toThrow();
  });
});

describe('dataUtils - Edge Cases', () => {
  it('should handle empty data', () => {
    expect(downsampleLTTB([], 100)).toEqual([]);
    expect(downsampleEveryNth([], 100)).toEqual([]);
    expect(downsampleTimeSeries([], 100)).toEqual([]);
  });

  it('should handle single data point', () => {
    const singlePoint = [{ x: 0, y: 1 }];
    expect(downsampleLTTB(singlePoint, 100)).toEqual(singlePoint);
  });

  it('should handle threshold of 2', () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = downsampleLTTB(data, 2);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(99);
  });

  it('should handle data equal to threshold', () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = downsampleLTTB(data, 100);
    expect(result).toEqual(data);
  });
});
