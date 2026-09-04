/**
 * Lazy-loaded Chart Components
 * 
 * Provides lazy loading for chart components to reduce initial bundle size
 * and improve page load performance.
 * 
 * Requirements: 37.5 (Lazy-load chart components)
 * 
 * @module components/LazyCharts
 */

import { lazy, Suspense } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import PropTypes from 'prop-types';

/**
 * Loading fallback component for lazy-loaded charts
 */
const ChartLoadingFallback = ({ message = 'Loading chart...' }) => (
  <Box 
    sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      height: 300,
      gap: 2 
    }}
  >
    <CircularProgress />
    <Typography color="text.secondary">{message}</Typography>
  </Box>
);

ChartLoadingFallback.propTypes = {
  message: PropTypes.string,
};

/**
 * Lazy-loaded chart component wrapper
 * Handles suspense and error boundaries for lazy-loaded components
 * 
 * @param {Object} props - Component props
 * @param {React.LazyExoticComponent} props.Component - Lazy loaded component
 * @param {string} props.fallbackMessage - Loading message
 * @param {Object} props.componentProps - Props to pass to the lazy component
 * @returns {JSX.Element} Wrapped lazy component
 */
const LazyChartWrapper = ({ Component, fallbackMessage, ...componentProps }) => (
  <Suspense fallback={<ChartLoadingFallback message={fallbackMessage} />}>
    <Component {...componentProps} />
  </Suspense>
);

LazyChartWrapper.propTypes = {
  Component: PropTypes.elementType.isRequired,
  fallbackMessage: PropTypes.string,
};

// Lazy load chart components
const LazyTrainingMetricsChart = lazy(() => import('./TrainingMetricsChart'));
const LazyTimeSeriesAnomalyPlot = lazy(() => import('./TimeSeriesAnomalyPlot'));
const LazyCommunicationCostChart = lazy(() => import('./CommunicationCostChart'));
const LazyROCPRCurves = lazy(() => import('./ROCPRCurves'));
const LazyMIAVisualization = lazy(() => import('./MIAVisualization'));
const LazyPrivacyBudgetGauge = lazy(() => import('./PrivacyBudgetGauge'));
const LazyAnomalyScoreAnalysis = lazy(() => import('./AnomalyScoreAnalysis'));
const LazyCommunicationEfficiencyMetrics = lazy(() => import('./CommunicationEfficiencyMetrics'));

/**
 * Lazy-loaded Training Metrics Chart
 * Requirement 37.5: Lazy-load chart components
 */
export const TrainingMetricsChart = (props) => (
  <LazyChartWrapper 
    Component={LazyTrainingMetricsChart} 
    fallbackMessage="Loading training metrics..."
    {...props}
  />
);

/**
 * Lazy-loaded Time Series Anomaly Plot
 * Requirement 37.5: Lazy-load chart components
 */
export const TimeSeriesAnomalyPlot = (props) => (
  <LazyChartWrapper 
    Component={LazyTimeSeriesAnomalyPlot} 
    fallbackMessage="Loading time-series plot..."
    {...props}
  />
);

/**
 * Lazy-loaded Communication Cost Chart
 * Requirement 37.5: Lazy-load chart components
 */
export const CommunicationCostChart = (props) => (
  <LazyChartWrapper 
    Component={LazyCommunicationCostChart} 
    fallbackMessage="Loading communication metrics..."
    {...props}
  />
);

/**
 * Lazy-loaded ROC/PR Curves
 * Requirement 37.5: Lazy-load chart components
 */
export const ROCPRCurves = (props) => (
  <LazyChartWrapper 
    Component={LazyROCPRCurves} 
    fallbackMessage="Loading ROC/PR curves..."
    {...props}
  />
);

/**
 * Lazy-loaded MIA Visualization
 * Requirement 37.5: Lazy-load chart components
 */
export const MIAVisualization = (props) => (
  <LazyChartWrapper 
    Component={LazyMIAVisualization} 
    fallbackMessage="Loading MIA visualization..."
    {...props}
  />
);

/**
 * Lazy-loaded Privacy Budget Gauge
 * Requirement 37.5: Lazy-load chart components
 */
export const PrivacyBudgetGauge = (props) => (
  <LazyChartWrapper 
    Component={LazyPrivacyBudgetGauge} 
    fallbackMessage="Loading privacy gauge..."
    {...props}
  />
);

/**
 * Lazy-loaded Anomaly Score Analysis
 * Requirement 37.5: Lazy-load chart components
 */
export const AnomalyScoreAnalysis = (props) => (
  <LazyChartWrapper 
    Component={LazyAnomalyScoreAnalysis} 
    fallbackMessage="Loading anomaly analysis..."
    {...props}
  />
);

/**
 * Lazy-loaded Communication Efficiency Metrics
 * Requirement 37.5: Lazy-load chart components
 */
export const CommunicationEfficiencyMetrics = (props) => (
  <LazyChartWrapper 
    Component={LazyCommunicationEfficiencyMetrics} 
    fallbackMessage="Loading efficiency metrics..."
    {...props}
  />
);
