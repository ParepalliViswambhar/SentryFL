/**
 * Anomaly Score Analysis Component
 * 
 * Displays anomaly score analysis and interactive threshold control:
 * - Anomaly score distribution histogram
 * - Interactive threshold slider
 * - Dynamic precision/recall metrics on threshold change
 * - Per-client anomaly detection performance metrics
 * 
 * Requirements: 31.8, 31.9, 31.10, 31.11
 * 
 * @module components/AnomalyScoreAnalysis
 */

import { useMemo, useState, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Paper,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import BarChartIcon from '@mui/icons-material/BarChart';
import InfoIcon from '@mui/icons-material/Info';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

/**
 * Calculate metrics based on threshold
 * 
 * @param {Array<Object>} scores - Array of {score, isAnomaly} objects
 * @param {number} threshold - Detection threshold
 * @returns {Object} Metrics {TP, FP, TN, FN, precision, recall, f1}
 */
const calculateMetrics = (scores, threshold) => {
  let TP = 0; // True Positives
  let FP = 0; // False Positives
  let TN = 0; // True Negatives
  let FN = 0; // False Negatives

  scores.forEach(({ score, isAnomaly }) => {
    const predicted = score >= threshold;
    
    if (predicted && isAnomaly) {
      TP++;
    } else if (predicted && !isAnomaly) {
      FP++;
    } else if (!predicted && !isAnomaly) {
      TN++;
    } else if (!predicted && isAnomaly) {
      FN++;
    }
  });

  const precision = (TP + FP) > 0 ? TP / (TP + FP) : 0;
  const recall = (TP + FN) > 0 ? TP / (TP + FN) : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (TP + FP + TN + FN) > 0 ? (TP + TN) / (TP + FP + TN + FN) : 0;

  return {
    TP,
    FP,
    TN,
    FN,
    precision,
    recall,
    f1,
    accuracy,
  };
};

/**
 * AnomalyScoreAnalysis Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.anomalyScores - Array of {score, isAnomaly} for all data points
 * @param {number} [props.defaultThreshold=0.5] - Default detection threshold
 * @param {Array<Object>} props.perClientMetrics - Array of {clientId, precision, recall, f1, anomalyCount}
 * @returns {JSX.Element} Anomaly score analysis component
 */
const AnomalyScoreAnalysis = ({
  anomalyScores = [],
  defaultThreshold = 0.5,
  perClientMetrics = [],
}) => {
  const [threshold, setThreshold] = useState(defaultThreshold);

  // Calculate min and max scores for slider range
  const scoreRange = useMemo(() => {
    if (anomalyScores.length === 0) return { min: 0, max: 1 };
    
    const scores = anomalyScores.map((item) => item.score);
    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
    };
  }, [anomalyScores]);

  // Calculate current metrics based on threshold
  const currentMetrics = useMemo(() => {
    return calculateMetrics(anomalyScores, threshold);
  }, [anomalyScores, threshold]);

  // Prepare histogram data
  const histogramData = useMemo(() => {
    if (anomalyScores.length === 0) return null;

    // Create bins for histogram
    const binCount = 50;
    const binSize = (scoreRange.max - scoreRange.min) / binCount;
    
    const bins = Array(binCount).fill(0).map((_, idx) => ({
      start: scoreRange.min + idx * binSize,
      end: scoreRange.min + (idx + 1) * binSize,
      count: 0,
      anomalyCount: 0,
    }));

    // Populate bins
    anomalyScores.forEach(({ score, isAnomaly }) => {
      const binIndex = Math.min(
        Math.floor((score - scoreRange.min) / binSize),
        binCount - 1
      );
      if (binIndex >= 0 && binIndex < binCount) {
        bins[binIndex].count++;
        if (isAnomaly) {
          bins[binIndex].anomalyCount++;
        }
      }
    });

    const labels = bins.map((bin) => bin.start.toFixed(3));
    const normalCounts = bins.map((bin) => bin.count - bin.anomalyCount);
    const anomalyCounts = bins.map((bin) => bin.anomalyCount);

    return {
      labels,
      datasets: [
        {
          label: 'Normal',
          data: normalCounts,
          backgroundColor: 'rgba(25, 118, 210, 0.6)',
          borderColor: '#1976d2',
          borderWidth: 1,
        },
        {
          label: 'Anomaly',
          data: anomalyCounts,
          backgroundColor: 'rgba(211, 47, 47, 0.6)',
          borderColor: '#d32f2f',
          borderWidth: 1,
        },
      ],
    };
  }, [anomalyScores, scoreRange]);

  // Chart options for histogram
  const histogramOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
          title: (context) => `Score: ${context[0].label}`,
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value} samples`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Anomaly Score',
        },
        stacked: true,
      },
      y: {
        title: {
          display: true,
          text: 'Frequency',
        },
        stacked: true,
        beginAtZero: true,
      },
    },
  };

  // Handle threshold change
  const handleThresholdChange = (event, newValue) => {
    setThreshold(newValue);
  };

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BarChartIcon /> Anomaly Score Analysis
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Score distribution and threshold optimization
            </Typography>
          </Box>
          <Tooltip title="Adjust the threshold to balance precision and recall for your use case" arrow>
            <InfoIcon color="action" />
          </Tooltip>
        </Stack>
      </Paper>

      {/* Info Alert */}
      {anomalyScores.length > 0 && (
        <Alert severity="info">
          <strong>Threshold Tuning:</strong> Increase threshold for higher precision (fewer false positives).
          Decrease threshold for higher recall (detect more anomalies, but with more false positives).
        </Alert>
      )}

      {/* Anomaly Score Distribution Histogram */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Anomaly Score Distribution
        </Typography>
        {anomalyScores.length === 0 ? (
          <Alert severity="info">
            No anomaly score data available. Data will appear after anomaly detection evaluation is completed.
          </Alert>
        ) : (
          <Box sx={{ height: 320, mt: 2 }}>
            <Bar data={histogramData} options={histogramOptions} />
          </Box>
        )}
      </Paper>

      {/* Interactive Threshold Slider */}
      {anomalyScores.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" gap={1}>
              <TuneIcon />
              <Typography variant="h6">
                Detection Threshold Adjustment
              </Typography>
            </Stack>
            
            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>
                {`Current Threshold: ${threshold.toFixed(4)}`}
              </Typography>
              <Slider
                value={threshold}
                onChange={handleThresholdChange}
                min={scoreRange.min}
                max={scoreRange.max}
                step={(scoreRange.max - scoreRange.min) / 1000}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => value.toFixed(4)}
                marks={[
                  { value: scoreRange.min, label: scoreRange.min.toFixed(2) },
                  { value: (scoreRange.min + scoreRange.max) / 2, label: 'Mid' },
                  { value: scoreRange.max, label: scoreRange.max.toFixed(2) },
                ]}
              />
            </Box>

            {/* Dynamic Metrics Display */}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" variant="body2">
                      Precision
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#1976d2' }}>
                      {`${(currentMetrics.precision * 100).toFixed(2)}%`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {currentMetrics.TP} TP / {currentMetrics.TP + currentMetrics.FP} Predicted
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" variant="body2">
                      Recall
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#2e7d32' }}>
                      {`${(currentMetrics.recall * 100).toFixed(2)}%`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {currentMetrics.TP} TP / {currentMetrics.TP + currentMetrics.FN} Actual
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" variant="body2">
                      F1 Score
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#ed6c02' }}>
                      {currentMetrics.f1.toFixed(4)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Harmonic mean of P & R
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" variant="body2">
                      Accuracy
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#9c27b0' }}>
                      {`${(currentMetrics.accuracy * 100).toFixed(2)}%`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Overall correctness
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Confusion Matrix Summary */}
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Confusion Matrix at Current Threshold:</strong>
              </Typography>
              <Stack direction="row" spacing={3} flexWrap="wrap">
                <Typography variant="body2">
                  True Positives: <strong>{currentMetrics.TP}</strong>
                </Typography>
                <Typography variant="body2">
                  False Positives: <strong>{currentMetrics.FP}</strong>
                </Typography>
                <Typography variant="body2">
                  True Negatives: <strong>{currentMetrics.TN}</strong>
                </Typography>
                <Typography variant="body2">
                  False Negatives: <strong>{currentMetrics.FN}</strong>
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* Per-Client Performance Metrics */}
      {perClientMetrics.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Per-Client Anomaly Detection Performance
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Client ID</strong></TableCell>
                  <TableCell align="right"><strong>Precision</strong></TableCell>
                  <TableCell align="right"><strong>Recall</strong></TableCell>
                  <TableCell align="right"><strong>F1 Score</strong></TableCell>
                  <TableCell align="right"><strong>Anomalies Detected</strong></TableCell>
                  <TableCell align="right"><strong>Total Samples</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perClientMetrics.map((client, index) => (
                  <TableRow key={index} hover>
                    <TableCell>{client.clientId}</TableCell>
                    <TableCell align="right">
                      {(client.precision * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell align="right">
                      {(client.recall * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell align="right">
                      {client.f1.toFixed(4)}
                    </TableCell>
                    <TableCell align="right">
                      {client.anomalyCount || 0}
                    </TableCell>
                    <TableCell align="right">
                      {client.totalSamples || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Summary Statistics */}
          {perClientMetrics.length > 1 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Summary Across All Clients:</strong>
              </Typography>
              <Stack direction="row" spacing={3} flexWrap="wrap">
                <Typography variant="body2">
                  Avg Precision:{' '}
                  <strong>
                    {(
                      (perClientMetrics.reduce((sum, c) => sum + c.precision, 0) /
                        perClientMetrics.length) *
                      100
                    ).toFixed(2)}%
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Avg Recall:{' '}
                  <strong>
                    {(
                      (perClientMetrics.reduce((sum, c) => sum + c.recall, 0) /
                        perClientMetrics.length) *
                      100
                    ).toFixed(2)}%
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Avg F1:{' '}
                  <strong>
                    {(
                      perClientMetrics.reduce((sum, c) => sum + c.f1, 0) /
                      perClientMetrics.length
                    ).toFixed(4)}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Total Anomalies:{' '}
                  <strong>
                    {perClientMetrics.reduce((sum, c) => sum + (c.anomalyCount || 0), 0)}
                  </strong>
                </Typography>
              </Stack>
            </Box>
          )}
        </Paper>
      )}
    </Stack>
  );
};

AnomalyScoreAnalysis.propTypes = {
  anomalyScores: PropTypes.arrayOf(
    PropTypes.shape({
      score: PropTypes.number.isRequired,
      isAnomaly: PropTypes.bool.isRequired,
    })
  ),
  defaultThreshold: PropTypes.number,
  perClientMetrics: PropTypes.arrayOf(
    PropTypes.shape({
      clientId: PropTypes.string.isRequired,
      precision: PropTypes.number.isRequired,
      recall: PropTypes.number.isRequired,
      f1: PropTypes.number.isRequired,
      anomalyCount: PropTypes.number,
      totalSamples: PropTypes.number,
    })
  ),
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(AnomalyScoreAnalysis);
