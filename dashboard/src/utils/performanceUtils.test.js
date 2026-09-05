import { describe, expect, it, vi } from 'vitest';
import { batchWebSocketEvents } from './debounceUtils';
import { downsampleChartData } from './dataUtils';

describe('dashboard performance utilities', () => {
  it('keeps large chart datasets at or below 1000 points', () => {
    const chartData = {
      labels: Array.from({ length: 5000 }, (_, index) => index),
      datasets: [{ label: 'loss', data: Array.from({ length: 5000 }, (_, index) => index) }],
    };
    const startedAt = performance.now();
    const result = downsampleChartData(chartData, 1000);

    expect(result.labels).toHaveLength(1000);
    expect(result.datasets[0].data).toHaveLength(1000);
    expect(performance.now() - startedAt).toBeLessThan(100);
  });

  it('batches rapid WebSocket events into one processor call', () => {
    vi.useFakeTimers();
    const processor = vi.fn();
    const batcher = batchWebSocketEvents(processor, 16);

    batcher.add({ round: 1 });
    batcher.add({ round: 2 });
    vi.advanceTimersByTime(16);

    expect(processor).toHaveBeenCalledOnce();
    expect(processor).toHaveBeenCalledWith([{ round: 1 }, { round: 2 }]);
    vi.useRealTimers();
  });
});
