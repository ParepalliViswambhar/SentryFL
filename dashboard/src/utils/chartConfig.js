/**
 * Chart configuration utilities
 * Implements Requirement 37.10: Limit chart animation duration to maintain 60 FPS
 */

/**
 * Calculate optimal animation duration based on dataset size
 * Ensures chart animations maintain 60 FPS
 * @param {number} dataPoints - Number of data points in the chart
 * @returns {number} Animation duration in milliseconds
 */
export const getOptimalAnimationDuration = (dataPoints) => {
  // At 60 FPS, each frame takes ~16.67ms
  // For smooth animations, we want the animation duration to allow
  // sufficient time for rendering without causing frame drops
  
  if (dataPoints <= 50) {
    return 300; // Small datasets can handle longer animations
  } else if (dataPoints <= 100) {
    return 200; // Medium datasets need faster animations
  } else if (dataPoints <= 500) {
    return 150; // Large datasets need minimal animation
  } else if (dataPoints <= 1000) {
    return 100; // Very large datasets - very short animation
  } else {
    return 0; // Extremely large datasets - disable animation
  }
};

/**
 * Performance-optimized chart options for Chart.js
 * Requirement 37.10: Limit chart animation duration to maintain 60 FPS
 */
export const getPerformanceOptimizedChartOptions = (baseOptions, dataPointCount = 0) => {
  const animationDuration = getOptimalAnimationDuration(dataPointCount);
  
  return {
    ...baseOptions,
    animation: {
      duration: animationDuration,
      // Use 'easeOutQuart' for smoother perception with shorter duration
      easing: animationDuration > 0 ? 'easeOutQuart' : 'linear',
      // Disable animation on resize to prevent performance issues
      resize: {
        duration: 0,
      },
      // Animate only on data changes, not on all interactions
      onComplete: undefined,
      onProgress: undefined,
    },
    // Performance optimizations
    responsive: true,
    maintainAspectRatio: false,
    // Optimize rendering
    elements: {
      ...baseOptions.elements,
      point: {
        ...baseOptions.elements?.point,
        // Reduce point radius for large datasets to improve rendering
        radius: dataPointCount > 500 ? 0 : (baseOptions.elements?.point?.radius ?? 3),
        hitRadius: 5, // Keep hit radius for interaction
        hoverRadius: dataPointCount > 500 ? 2 : 4,
      },
      line: {
        ...baseOptions.elements?.line,
        // Reduce line tension for faster rendering on large datasets
        tension: dataPointCount > 500 ? 0 : (baseOptions.elements?.line?.tension ?? 0.4),
        borderWidth: dataPointCount > 1000 ? 1 : 2,
      },
    },
    // Optimize interactions
    interaction: {
      ...baseOptions.interaction,
      mode: baseOptions.interaction?.mode ?? 'index',
      intersect: baseOptions.interaction?.intersect ?? false,
      // Disable interaction animations for performance
      animationDuration: 0,
    },
    // Optimize transitions
    transitions: {
      active: {
        animation: {
          duration: 0, // Instant transitions on hover/click
        },
      },
      zoom: {
        animation: {
          duration: dataPointCount > 500 ? 0 : 200,
        },
      },
    },
  };
};

/**
 * Base chart options with performance optimizations
 * These options should be used as a foundation for all charts
 */
export const performanceBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 150, // Default to 150ms for 60 FPS
    easing: 'easeOutQuart',
  },
  interaction: {
    mode: 'index',
    intersect: false,
    animationDuration: 0,
  },
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        usePointStyle: true,
        padding: 10,
      },
    },
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false,
      // Optimize tooltip rendering
      animation: {
        duration: 0, // Instant tooltip display
      },
      callbacks: {
        // Custom callbacks can be added by consumers
      },
    },
    // Decimation plugin for performance with large datasets
    decimation: {
      enabled: true,
      algorithm: 'lttb', // Largest-Triangle-Three-Buckets algorithm
      samples: 1000,
      threshold: 1000,
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'X Axis',
      },
      ticks: {
        // Limit number of ticks for performance
        maxTicksLimit: 20,
        autoSkip: true,
        autoSkipPadding: 10,
      },
      // Grid line optimization
      grid: {
        display: true,
        drawTicks: true,
        tickLength: 8,
      },
    },
    y: {
      title: {
        display: true,
        text: 'Y Axis',
      },
      ticks: {
        maxTicksLimit: 10,
        autoSkip: true,
      },
      // Grid line optimization
      grid: {
        display: true,
        drawTicks: true,
        tickLength: 8,
      },
    },
  },
  // Parsing optimization - disable parsing if data is already in correct format
  parsing: false,
  normalized: true, // Data is already normalized
};

/**
 * Get chart options optimized for real-time updates
 * Minimal animation for responsive feel with incoming WebSocket data
 */
export const getRealtimeChartOptions = (baseOptions = {}) => {
  return {
    ...performanceBaseOptions,
    ...baseOptions,
    animation: {
      duration: 100, // Very short animation for real-time feel
      easing: 'linear',
      resize: {
        duration: 0,
      },
    },
    transitions: {
      active: {
        animation: {
          duration: 0,
        },
      },
    },
    // Real-time charts often have scrolling data
    plugins: {
      ...performanceBaseOptions.plugins,
      ...baseOptions.plugins,
      streaming: baseOptions.plugins?.streaming ?? {
        // Configuration for chart.js-plugin-streaming if used
        duration: 20000, // 20 seconds visible
        refresh: 100, // Refresh every 100ms
        delay: 100, // 100ms delay
        frameRate: 60, // Target 60 FPS
      },
    },
  };
};

/**
 * Get chart options optimized for static/historical data
 * Can use slightly longer animations since data doesn't change frequently
 */
export const getStaticChartOptions = (baseOptions = {}, dataPointCount = 0) => {
  const animationDuration = getOptimalAnimationDuration(dataPointCount);
  
  return {
    ...performanceBaseOptions,
    ...baseOptions,
    animation: {
      duration: animationDuration,
      easing: 'easeOutQuart',
    },
  };
};

/**
 * Monitor chart render performance
 * Logs warnings if render time exceeds frame budget (16.67ms for 60 FPS)
 */
export const createPerformanceMonitor = (chartName) => {
  const FRAME_BUDGET_MS = 16.67; // 60 FPS
  let renderStartTime;
  
  return {
    start: () => {
      renderStartTime = performance.now();
    },
    end: () => {
      if (renderStartTime) {
        const renderTime = performance.now() - renderStartTime;
        if (renderTime > FRAME_BUDGET_MS) {
          console.warn(
            `[Performance] Chart "${chartName}" render took ${renderTime.toFixed(2)}ms ` +
            `(exceeds 60 FPS budget of ${FRAME_BUDGET_MS.toFixed(2)}ms)`
          );
        }
        renderStartTime = null;
        return renderTime;
      }
      return 0;
    },
    measure: (callback) => {
      const start = performance.now();
      const result = callback();
      const duration = performance.now() - start;
      
      if (duration > FRAME_BUDGET_MS) {
        console.warn(
          `[Performance] Chart "${chartName}" operation took ${duration.toFixed(2)}ms ` +
          `(exceeds 60 FPS budget of ${FRAME_BUDGET_MS.toFixed(2)}ms)`
        );
      }
      
      return { result, duration };
    },
  };
};

/**
 * Check if animation should be disabled based on device capabilities
 */
export const shouldDisableAnimation = () => {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }
  
  // Check for low-end devices (basic heuristic)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  const hasLimitedMemory = navigator.deviceMemory && navigator.deviceMemory < 4; // Less than 4GB RAM
  const hasSlowConnection = navigator.connection && 
    (navigator.connection.effectiveType === 'slow-2g' || 
     navigator.connection.effectiveType === '2g');
  
  return isMobile && (hasLimitedMemory || hasSlowConnection);
};
