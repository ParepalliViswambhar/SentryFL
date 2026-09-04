/**
 * Time-Series Anomaly Plot Component
 * 
 * Displays time-series data with anomaly detection predictions:
 * - Time-series plot with predicted anomaly labels
 * - Highlighted detected anomalies in red
 * - Ground truth anomaly labels for comparison
 * - Zoom functionality for specific time ranges
 * 
 * Requirements: 31.4, 31.5, 31.6, 31.7
 * 
 * @module components/TimeSeriesAnomalyPlot
 */

import { useRef, useMemo, useState, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TimelineIcon from '@mui/icons-material/Timeline';
import InfoIcon from '@mui/icons-material/Info';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { downsampleTimeSeries, needsDownsampling } from '../utils/dataUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend, Filler, zoomPlugin);

/**
 * Export chart as image
 * 
 * @param {Object} chartRef - React ref to Chart.js instance
 * @param {string} filename - Filename for export
 * @param {string} format - Export format ('png' or 'svg')
 */
const exportChart = (chartRef, filename, format = 'png') => {
  if (!chartRef.current) return;

  const chart = chartRef.current;
  
  if (format === 'png') {
    const url = chart.toBase64Image();
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = url;
    link.click();
  } else if (format === 'svg') {
    const canvas = chart.canvas;
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <img src="${chart.toBase64Image()}" />
          </div>
        </foreignObject>
      </svg>
    `;
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${filename}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
};

/**
 * TimeSeriesAnomalyPlot Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.timeSeriesData - Array of {timestamp, value} for time-series values
 * @param {Array<number>} props.predictedAnomalies - Array of indices where anomalies were predicted
 * @param {Array<number>} props.groundTruthAnomalies - Array of indices where actual anomalies exist
 * @param {string} [props.timeSeriesLabel='Time-Series Value'] - Label for the time-series
 * @returns {JSX.Element} Time-series anomaly plot component
 */
const TimeSeriesAnomalyPlot = ({
  timeSeriesData = [],
  predictedAnomalies = [],
  groundTruthAnomalies = [],
  timeSeriesLabel = 'Time-Series Value',
}) => {
  const chartRef = useRef(null);
  const [showGroundTruth, setShowGroundTruth] = useState(true);
  const [showPredicted, setShowPredicted] = useState(true);

  // Reset zoom handler
  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  // Prepare chart data with downsampling for large datasets
  const chartData = useMemo(() => {
    const timestamps = timeSeriesData.map((point, idx) => point.timestamp || idx);
    const values = timeSeriesData.map((point) => point.value);

    // Downsample if dataset is too large (Requirement 37.6)
    const shouldDownsample = timeSeriesData.length > 1000;
    const downsampledData = shouldDownsample 
      ? downsampleTimeSeries(timeSeriesData, 1000)
      : timeSeriesData;
    
    const downsampledTimestamps = downsampledData.map((point, idx) => point.timestamp || idx);
    const downsampledValues = downsampledData.map((point) => point.value);

    // Create arrays to highlight anomalies
    const predictedAnomalySet = new Set(predictedAnomalies);
    const groundTruthAnomalySet = new Set(groundTruthAnomalies);

    // Create datasets for normal values and anomalies
    const normalValues = downsampledValues.map((value, idx) => 
      (!predictedAnomalySet.has(idx) && !groundTruthAnomalySet.has(idx)) ? value : null
    );

    const predictedAnomalyValues = downsampledValues.map((value, idx) => 
      predictedAnomalySet.has(idx) ? value : null
    );

    const groundTruthAnomalyValues = downsampledValues.map((value, idx) => 
      groundTruthAnomalySet.has(idx) && !predictedAnomalySet.has(idx) ? value : null
    );

    const datasets = [
      {
        label: 'Normal',
        data: normalValues,
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
        fill: false,
        tension: 0.2,
        pointRadius: 2,
        pointHoverRadius: 4,
        spanGaps: true,
      },
    ];

    if (showPredicted) {
      datasets.push({
        label: 'Predicted Anomaly',
        data: predictedAnomalyValues,
        borderColor: '#d32f2f',
        backgroundColor: '#d32f2f',
        fill: false,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointStyle: 'circle',
        showLine: false,
      });
    }

    if (showGroundTruth) {
      datasets.push({
        label: 'Ground Truth Anomaly',
        data: groundTruthAnomalyValues,
        borderColor: '#ed6c02',
        backgroundColor: '#ed6c02',
        fill: false,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointStyle: 'triangle',
        showLine: false,
      });
    }

    return {
      labels: downsampledTimestamps,
      datasets,
    };
  }, [timeSeriesData, predictedAnomalies, groundTruthAnomalies, showGroundTruth, showPredicted]);

  // Chart options with zoom
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      tooltip: {
        enabled: true,
        callbacks: {
          title: (context) => `Time: ${context[0].label}`,
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y !== null ? context.parsed.y.toFixed(4) : 'N/A';
            return `${label}: ${value}`;
          },
        },
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Timestamp',
        },
      },
      y: {
        title: {
          display: true,
          text: timeSeriesLabel,
        },
      },
    },
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    const totalPoints = timeSeriesData.length;
    const predictedCount = predictedAnomalies.length;
    const groundTruthCount = groundTruthAnomalies.length;

    // Calculate true positives (correctly predicted anomalies)
    const groundTruthSet = new Set(groundTruthAnomalies);
    const truePositives = predictedAnomalies.filter((idx) => groundTruthSet.has(idx)).length;

    const precision = predictedCount > 0 ? (truePositives / predictedCount) * 100 : 0;
    const recall = groundTruthCount > 0 ? (truePositives / groundTruthCount) * 100 : 0;

    return {
      totalPoints,
      predictedCount,
      groundTruthCount,
      truePositives,
      precision,
      recall,
    };
  }, [timeSeriesData, predictedAnomalies, groundTruthAnomalies]);

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimelineIcon /> Time-Series Anomaly Visualization
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Detected anomalies highlighted in time-series context
            </Typography>
          </Box>
          <Tooltip title="Red circles: predicted anomalies. Orange triangles: ground truth anomalies. Use mouse wheel to zoom." arrow>
            <InfoIcon color="action" />
          </Tooltip>
        </Stack>
      </Paper>

      {/* Info Alert */}
      {timeSeriesData.length > 0 && (
        <Alert severity="info">
          <strong>Visualization Guide:</strong> Red circles show predicted anomalies, orange triangles show ground truth.
          Use mouse wheel or pinch gestures to zoom into specific time ranges. Click and drag to pan across the timeline.
        </Alert>
      )}

      {/* Controls */}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={showPredicted}
                  onChange={(e) => setShowPredicted(e.target.checked)}
                  color="error"
                />
              }
              label="Show Predicted"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showGroundTruth}
                  onChange={(e) => setShowGroundTruth(e.target.checked)}
                  color="warning"
                />
              }
              label="Show Ground Truth"
            />
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={handleResetZoom}
              disabled={timeSeriesData.length === 0}
            >
              Reset Zoom
            </Button>
            <ButtonGroup size="small" variant="outlined">
              <Button
                startIcon={<DownloadIcon />}
                onClick={() => exportChart(chartRef, 'time-series-anomaly-plot', 'png')}
                disabled={timeSeriesData.length === 0}
              >
                PNG
              </Button>
              <Button
                startIcon={<DownloadIcon />}
                onClick={() => exportChart(chartRef, 'time-series-anomaly-plot', 'svg')}
                disabled={timeSeriesData.length === 0}
              >
                SVG
              </Button>
            </ButtonGroup>
          </Stack>
        </Stack>
      </Paper>

      {/* Time-Series Plot */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Time-Series with Anomaly Labels
        </Typography>
        {timeSeriesData.length === 0 ? (
          <Alert severity="info">
            No time-series data available. Data will appear after anomaly detection evaluation is completed.
          </Alert>
        ) : (
          <Box sx={{ height: 400, mt: 2 }}>
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </Box>
        )}
      </Paper>

      {/* Statistics */}
      {timeSeriesData.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Anomaly Detection Statistics
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Chip
              label={`Total Points: ${statistics.totalPoints}`}
              color="default"
              variant="outlined"
            />
            <Chip
              label={`Predicted Anomalies: ${statistics.predictedCount}`}
              color="error"
              variant="outlined"
            />
            <Chip
              label={`Ground Truth Anomalies: ${statistics.groundTruthCount}`}
              color="warning"
              variant="outlined"
            />
            <Chip
              label={`True Positives: ${statistics.truePositives}`}
              color="success"
              variant="outlined"
            />
            <Chip
              label={`Precision: ${statistics.precision.toFixed(2)}%`}
              color="primary"
              variant="outlined"
            />
            <Chip
              label={`Recall: ${statistics.recall.toFixed(2)}%`}
              color="primary"
              variant="outlined"
            />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

TimeSeriesAnomalyPlot.propTypes = {
  timeSeriesData: PropTypes.arrayOf(
    PropTypes.shape({
      timestamp: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      value: PropTypes.number.isRequired,
    })
  ),
  predictedAnomalies: PropTypes.arrayOf(PropTypes.number),
  groundTruthAnomalies: PropTypes.arrayOf(PropTypes.number),
  timeSeriesLabel: PropTypes.string,
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(TimeSeriesAnomalyPlot);
