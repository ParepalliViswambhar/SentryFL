/**
 * Communication Cost Chart Component
 * 
 * Displays communication efficiency visualizations:
 * - Chart of communication bytes vs training round
 * - Chart of communication bytes vs client count
 * - Per-round communication breakdown (upload, download, overhead)
 * - Cumulative communication cost over training
 * - Support for logarithmic and linear scales
 * 
 * Requirements: 32.1, 32.2, 32.3, 32.4, 32.10
 * 
 * @module components/CommunicationCostChart
 */

import { useState, useMemo, useRef, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  ButtonGroup,
  Grid,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
  useTheme,
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import ExportButton from './ExportButton';
import { exportMetricsAsCSV, exportAsJSON } from '../utils/exportUtils';
import { downsampleChartData, needsDownsampling } from '../utils/dataUtils';
import { buildBaseChartOptions, mergeChartOptions, seriesColor, withAlpha } from '../utils/chartTheme';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

/**
 * Format bytes to human-readable format
 * 
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * CommunicationCostChart Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.metrics - Communication metrics array
 * @param {number} props.metrics[].round - Training round number
 * @param {number} props.metrics[].bytesSent - Bytes uploaded to server
 * @param {number} props.metrics[].bytesReceived - Bytes downloaded from server
 * @param {number} props.metrics[].payloadSize - Total payload size
 * @param {number} [props.metrics[].overhead] - Optional communication overhead
 * @param {string} [props.title='Communication Costs'] - Chart title
 * @returns {JSX.Element} Communication cost chart component
 */
const CommunicationCostChart = ({ metrics = [], title = 'Communication Costs' }) => {
  const theme = useTheme();
  const [scaleType, setScaleType] = useState('linear'); // 'linear' or 'logarithmic'
  const [chartView, setChartView] = useState('rounds'); // 'rounds' or 'breakdown' or 'cumulative'
  const chartRef = useRef(null);

  // Process metrics to compute derived values
  const processedMetrics = useMemo(() => {
    if (!metrics || metrics.length === 0) return [];

    return metrics.map((metric, index) => {
      const upload = metric.bytesSent || 0;
      const download = metric.bytesReceived || 0;
      const overhead = metric.overhead || 0;
      const total = upload + download + overhead;

      // Compute cumulative cost
      const cumulativeCost = metrics
        .slice(0, index + 1)
        .reduce((sum, m) => sum + (m.bytesSent || 0) + (m.bytesReceived || 0) + (m.overhead || 0), 0);

      return {
        round: metric.round,
        upload,
        download,
        overhead,
        total,
        cumulative: cumulativeCost,
      };
    });
  }, [metrics]);

  // Chart data for bytes vs training round
  const bytesVsRoundData = useMemo(() => {
    const stroke = seriesColor(theme, 0);
    const rawData = {
      labels: processedMetrics.map((m) => m.round),
      datasets: [
        {
          label: 'Total Bytes per Round',
          data: processedMetrics.map((m) => m.total),
          borderColor: stroke,
          backgroundColor: withAlpha(stroke, 0.12),
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
    // Downsample if dataset is too large (Requirement 37.6)
    return needsDownsampling(rawData, 1000) ? downsampleChartData(rawData, 1000) : rawData;
  }, [theme, processedMetrics]);

  // Chart data for communication breakdown
  const communicationBreakdownData = useMemo(() => {
    const uploadStroke = seriesColor(theme, 1);
    const downloadStroke = seriesColor(theme, 2);
    const overheadStroke = seriesColor(theme, 3);
    return {
      labels: processedMetrics.map((m) => m.round),
      datasets: [
        {
          label: 'Upload (Client → Server)',
          data: processedMetrics.map((m) => m.upload),
          borderColor: uploadStroke,
          backgroundColor: withAlpha(uploadStroke, 0.12),
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'Download (Server → Client)',
          data: processedMetrics.map((m) => m.download),
          borderColor: downloadStroke,
          backgroundColor: withAlpha(downloadStroke, 0.12),
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'Overhead',
          data: processedMetrics.map((m) => m.overhead),
          borderColor: overheadStroke,
          backgroundColor: withAlpha(overheadStroke, 0.12),
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    };
  }, [theme, processedMetrics]);

  // Chart data for cumulative communication cost
  const cumulativeCostData = useMemo(() => {
    const stroke = seriesColor(theme, 4);
    return {
      labels: processedMetrics.map((m) => m.round),
      datasets: [
        {
          label: 'Cumulative Communication Cost',
          data: processedMetrics.map((m) => m.cumulative),
          borderColor: stroke,
          backgroundColor: withAlpha(stroke, 0.12),
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [theme, processedMetrics]);

  // Handle scale type toggle
  const handleScaleChange = (event, newScale) => {
    if (newScale !== null) {
      setScaleType(newScale);
    }
  };

  // Select current chart data based on view
  const currentChartData = useMemo(() => {
    switch (chartView) {
      case 'rounds':
        return bytesVsRoundData;
      case 'breakdown':
        return communicationBreakdownData;
      case 'cumulative':
        return cumulativeCostData;
      default:
        return bytesVsRoundData;
    }
  }, [chartView, bytesVsRoundData, communicationBreakdownData, cumulativeCostData]);

  const currentYAxisLabel = useMemo(() => {
    switch (chartView) {
      case 'rounds':
        return 'Bytes per Round';
      case 'breakdown':
        return 'Bytes';
      case 'cumulative':
        return 'Cumulative Bytes';
      default:
        return 'Bytes';
    }
  }, [chartView]);

  // Themed chart chrome (re-skins on the dark/light toggle) with byte-formatted
  // ticks/tooltip and linear/log scale switching layered on top.
  const chartOptions = useMemo(() => {
    const base = buildBaseChartOptions(theme, {
      xTitle: 'Training Round',
      yTitle: currentYAxisLabel,
    });
    return mergeChartOptions(base, {
      animation: { duration: 180 },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              return `${label}: ${formatBytes(value)}`;
            },
          },
        },
      },
      scales: {
        y: {
          type: scaleType,
          ticks: {
            ...base.scales.y.ticks,
            callback: (value) => formatBytes(value),
          },
          ...(scaleType === 'logarithmic' && { min: 1 }),
        },
      },
    });
  }, [theme, currentYAxisLabel, scaleType]);

  // Compute summary statistics
  const summaryStats = useMemo(() => {
    if (processedMetrics.length === 0) return null;

    const totalBytes = processedMetrics[processedMetrics.length - 1]?.cumulative || 0;
    const avgBytesPerRound = totalBytes / processedMetrics.length;
    const maxBytesPerRound = Math.max(...processedMetrics.map((m) => m.total));

    return {
      totalBytes,
      avgBytesPerRound,
      maxBytesPerRound,
      rounds: processedMetrics.length,
    };
  }, [processedMetrics]);

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          gap={2}
        >
          <Box>
            <Typography variant="h5">{title}</Typography>
            <Typography color="text.secondary" variant="body2">
              Network communication efficiency analysis
            </Typography>
          </Box>

          {/* Controls */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            {/* Scale Toggle */}
            <ToggleButtonGroup
              value={scaleType}
              exclusive
              onChange={handleScaleChange}
              size="small"
              aria-label="scale type"
            >
              <ToggleButton value="linear" aria-label="linear scale">
                Linear
              </ToggleButton>
              <ToggleButton value="logarithmic" aria-label="logarithmic scale">
                Log
              </ToggleButton>
            </ToggleButtonGroup>

            {/* View Toggle */}
            <ButtonGroup size="small" variant="outlined">
              <Button
                onClick={() => setChartView('rounds')}
                variant={chartView === 'rounds' ? 'contained' : 'outlined'}
              >
                Per Round
              </Button>
              <Button
                onClick={() => setChartView('breakdown')}
                variant={chartView === 'breakdown' ? 'contained' : 'outlined'}
              >
                Breakdown
              </Button>
              <Button
                onClick={() => setChartView('cumulative')}
                variant={chartView === 'cumulative' ? 'contained' : 'outlined'}
              >
                Cumulative
              </Button>
            </ButtonGroup>
          </Stack>
        </Stack>

        {/* Summary Statistics */}
        {summaryStats && (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Total Transferred
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatBytes(summaryStats.totalBytes)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Avg per Round
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatBytes(summaryStats.avgBytesPerRound)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Max per Round
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatBytes(summaryStats.maxBytesPerRound)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Training Rounds
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {summaryStats.rounds}
              </Typography>
            </Grid>
          </Grid>
        )}
      </Paper>

      {/* Chart */}
      <Paper sx={{ p: 2 }}>
        {processedMetrics.length === 0 ? (
          <Alert severity="info">
            No communication metrics available. Metrics will appear after the first training round
            completes.
          </Alert>
        ) : (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                {chartView === 'rounds' && 'Communication per Round'}
                {chartView === 'breakdown' && 'Communication Breakdown'}
                {chartView === 'cumulative' && 'Cumulative Communication Cost'}
              </Typography>
              <Stack direction="row" spacing={1}>
                <ExportButton 
                  chartRef={chartRef} 
                  filename={`communication-${chartView}`}
                  showText={false}
                  disabled={processedMetrics.length === 0}
                />
                <Button
                  size="small"
                  onClick={() => exportMetricsAsCSV(metrics, 'communication-metrics')}
                  disabled={metrics.length === 0}
                >
                  Export CSV
                </Button>
                <Button
                  size="small"
                  onClick={() => exportAsJSON(metrics, 'communication-metrics')}
                  disabled={metrics.length === 0}
                >
                  Export JSON
                </Button>
              </Stack>
            </Stack>
            <Box sx={{ height: 350 }}>
              <Line ref={chartRef} data={currentChartData} options={chartOptions} />
            </Box>
          </>
        )}
      </Paper>
    </Stack>
  );
};

CommunicationCostChart.propTypes = {
  metrics: PropTypes.arrayOf(
    PropTypes.shape({
      round: PropTypes.number.isRequired,
      bytesSent: PropTypes.number,
      bytesReceived: PropTypes.number,
      payloadSize: PropTypes.number,
      overhead: PropTypes.number,
      timestamp: PropTypes.string,
    })
  ),
  title: PropTypes.string,
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(CommunicationCostChart);
