/**
 * Data Utility Functions for Performance Optimization
 * 
 * Provides data downsampling and processing utilities for large datasets
 * to improve chart rendering performance.
 * 
 * Requirements: 37.6 (Chart data downsampling for datasets >1000 points)
 */

/**
 * Largest Triangle Three Buckets (LTTB) downsampling algorithm
 * Efficiently reduces data points while preserving visual characteristics
 * 
 * @param {Array<Object>} data - Array of data points with x and y values
 * @param {number} threshold - Target number of points after downsampling
 * @returns {Array<Object>} Downsampled data points
 */
export function downsampleLTTB(data, threshold) {
  if (data.length <= threshold) {
    return data;
  }

  if (threshold <= 1) {
    return data.slice(0, 1);
  }

  if (threshold === 2) {
    return [data[0], data[data.length - 1]];
  }

  const sampled = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always include first point
  sampled.push(data[0]);

  let previousPointIndex = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate bucket range
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    // Calculate average point for next bucket (for triangle area calculation)
    const nextBucketStart = Math.min(bucketEnd, data.length - 1);
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);
    
    let avgX = 0;
    let avgY = 0;
    let avgRangeLength = nextBucketEnd - nextBucketStart;

    if (avgRangeLength === 0) {
      avgRangeLength = 1;
    }

    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      const point = data[j];
      const x = typeof point === 'object' ? (point.x !== undefined ? point.x : j) : j;
      const y = typeof point === 'object' ? (point.y !== undefined ? point.y : point) : point;
      avgX += x;
      avgY += y;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    // Find point in current bucket with largest triangle area
    let maxArea = -1;
    let maxAreaIndex = bucketStart;

    const previousPoint = data[previousPointIndex];
    const prevX = typeof previousPoint === 'object' ? (previousPoint.x !== undefined ? previousPoint.x : previousPointIndex) : previousPointIndex;
    const prevY = typeof previousPoint === 'object' ? (previousPoint.y !== undefined ? previousPoint.y : previousPoint) : previousPoint;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const point = data[j];
      const x = typeof point === 'object' ? (point.x !== undefined ? point.x : j) : j;
      const y = typeof point === 'object' ? (point.y !== undefined ? point.y : point) : point;

      // Calculate triangle area
      const area = Math.abs(
        (prevX - avgX) * (y - prevY) - (prevX - x) * (avgY - prevY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(data[maxAreaIndex]);
    previousPointIndex = maxAreaIndex;
  }

  // Always include last point
  sampled.push(data[data.length - 1]);

  return sampled;
}

/**
 * Simple downsampling by taking every nth point
 * Faster but less accurate than LTTB
 * 
 * @param {Array} data - Array of data points
 * @param {number} threshold - Target number of points
 * @returns {Array} Downsampled data points
 */
export function downsampleEveryNth(data, threshold) {
  if (data.length <= threshold) {
    return data;
  }

  const sampled = Array.from({ length: threshold }, (_, index) => {
    const sourceIndex = Math.round(index * (data.length - 1) / (threshold - 1));
    return data[sourceIndex];
  });

  return sampled;
}

/**
 * Downsample time-series data intelligently
 * Uses LTTB for better visual preservation
 * 
 * @param {Array<Object>} data - Time-series data array
 * @param {number} maxPoints - Maximum number of points (default: 1000)
 * @returns {Array<Object>} Downsampled data
 */
export function downsampleTimeSeries(data, maxPoints = 1000) {
  if (!data || data.length <= maxPoints) {
    return data;
  }

  return downsampleLTTB(data, maxPoints);
}

/**
 * Downsample chart data for multiple datasets
 * 
 * @param {Object} chartData - Chart.js data object with labels and datasets
 * @param {number} maxPoints - Maximum number of points per dataset
 * @returns {Object} Downsampled chart data
 */
export function downsampleChartData(chartData, maxPoints = 1000) {
  if (!chartData || !chartData.labels || chartData.labels.length <= maxPoints) {
    return chartData;
  }

  // Convert to array of objects for LTTB
  const dataPoints = chartData.labels.map((label, index) => ({
    x: index,
    label,
    values: chartData.datasets.map(dataset => dataset.data[index])
  }));

  // Downsample
  const sampledPoints = downsampleLTTB(dataPoints.map((p, i) => ({
    x: i,
    y: p.values[0] !== null && p.values[0] !== undefined ? p.values[0] : 0
  })), maxPoints);

  // Extract sampled indices
  const sampledIndices = sampledPoints.map(p => p.x);

  // Reconstruct chart data
  return {
    labels: sampledIndices.map(i => dataPoints[i].label),
    datasets: chartData.datasets.map((dataset, datasetIndex) => ({
      ...dataset,
      data: sampledIndices.map(i => dataPoints[i].values[datasetIndex])
    }))
  };
}

/**
 * Check if data needs downsampling
 * 
 * @param {Array|Object} data - Data to check
 * @param {number} threshold - Threshold for downsampling (default: 1000)
 * @returns {boolean} True if downsampling is needed
 */
export function needsDownsampling(data, threshold = 1000) {
  if (Array.isArray(data)) {
    return data.length > threshold;
  }
  if (data && data.labels && Array.isArray(data.labels)) {
    return data.labels.length > threshold;
  }
  return false;
}

/**
 * Throttle function execution
 * 
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = new Date().getTime();
    if (now - lastCall < delay) {
      return;
    }
    lastCall = now;
    return func(...args);
  };
}

/**
 * Debounce function execution
 * 
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
