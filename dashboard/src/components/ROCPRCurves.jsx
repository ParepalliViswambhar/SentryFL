/**
 * ROC and PR Curves Visualization Component
 * 
 * Displays ROC curve, Precision-Recall curve, and confusion matrix for anomaly detection:
 * - ROC curve with AUC score
 * - Precision-Recall curve with AUC-PR score
 * - Confusion matrix heatmap visualization
 * - Export functionality for PNG/SVG formats
 * 
 * Requirements: 31.1, 31.2, 31.3
 * 
 * @module components/ROCPRCurves
 */

import { useRef, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Grid,
  Paper,
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
import InfoIcon from '@mui/icons-material/Info';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import { Line, Bar } from 'react-chartjs-2';
import ExportButton from './ExportButton';
import { exportChartAsPNG, exportChartAsSVG, PUBLICATION_DPI } from '../utils/exportUtils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ChartTooltip, Legend, Filler);

/**
 * ROCPRCurves Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.rocCurve - Array of {fpr, tpr} points for ROC curve
 * @param {number} props.rocAuc - AUC score for ROC curve
 * @param {Array<Object>} props.prCurve - Array of {recall, precision} points for PR curve
 * @param {number} props.prAuc - AUC-PR score for PR curve
 * @param {Object} props.confusionMatrix - Confusion matrix {TP, FP, TN, FN}
 * @returns {JSX.Element} ROC and PR curves visualization component
 */
const ROCPRCurves = ({
  rocCurve = [],
  rocAuc = null,
  prCurve = [],
  prAuc = null,
  confusionMatrix = null,
}) => {
  const rocChartRef = useRef(null);
  const prChartRef = useRef(null);

  // Prepare ROC curve data
  const rocData = useMemo(() => {
    const fprValues = rocCurve.map((point) => point.fpr);
    const tprValues = rocCurve.map((point) => point.tpr);
    
    // Diagonal reference line (random classifier)
    const diagonalLine = rocCurve.map((point) => point.fpr);

    return {
      labels: fprValues,
      datasets: [
        {
          label: `ROC Curve (AUC = ${rocAuc !== null ? rocAuc.toFixed(3) : 'N/A'})`,
          data: tprValues.map((tpr, idx) => ({ x: fprValues[idx], y: tpr })),
          borderColor: '#1976d2',
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Random Classifier',
          data: diagonalLine.map((fpr, idx) => ({ x: fpr, y: diagonalLine[idx] })),
          borderColor: '#757575',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  }, [rocCurve, rocAuc]);

  // Prepare PR curve data
  const prData = useMemo(() => {
    const recallValues = prCurve.map((point) => point.recall);
    const precisionValues = prCurve.map((point) => point.precision);

    return {
      labels: recallValues,
      datasets: [
        {
          label: `PR Curve (AUC-PR = ${prAuc !== null ? prAuc.toFixed(3) : 'N/A'})`,
          data: precisionValues.map((precision, idx) => ({ x: recallValues[idx], y: precision })),
          borderColor: '#2e7d32',
          backgroundColor: 'rgba(46, 125, 50, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }, [prCurve, prAuc]);

  // ROC curve chart options
  const rocOptions = {
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
          title: () => 'ROC Curve',
          label: (context) => {
            const x = context.parsed.x.toFixed(3);
            const y = context.parsed.y.toFixed(3);
            return `FPR: ${x}, TPR: ${y}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: 'False Positive Rate (FPR)',
        },
        min: 0,
        max: 1,
      },
      y: {
        title: {
          display: true,
          text: 'True Positive Rate (TPR)',
        },
        min: 0,
        max: 1,
      },
    },
  };

  // PR curve chart options
  const prOptions = {
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
          title: () => 'Precision-Recall Curve',
          label: (context) => {
            const x = context.parsed.x.toFixed(3);
            const y = context.parsed.y.toFixed(3);
            return `Recall: ${x}, Precision: ${y}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: 'Recall',
        },
        min: 0,
        max: 1,
      },
      y: {
        title: {
          display: true,
          text: 'Precision',
        },
        min: 0,
        max: 1,
      },
    },
  };

  // Calculate confusion matrix metrics
  const confusionMetrics = useMemo(() => {
    if (!confusionMatrix) return null;

    const { TP, FP, TN, FN } = confusionMatrix;
    const total = TP + FP + TN + FN;
    const accuracy = total > 0 ? (TP + TN) / total : 0;
    const precision = (TP + FP) > 0 ? TP / (TP + FP) : 0;
    const recall = (TP + FN) > 0 ? TP / (TP + FN) : 0;
    const f1Score = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const specificity = (TN + FP) > 0 ? TN / (TN + FP) : 0;

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      specificity,
    };
  }, [confusionMatrix]);

  // Export chart helper
  const exportChart = async (chartRef, filename, format) => {
    if (!chartRef.current) {
      console.error('Chart reference not available');
      return;
    }

    try {
      if (format === 'png') {
        await exportChartAsPNG(chartRef, filename, PUBLICATION_DPI);
      } else if (format === 'svg') {
        exportChartAsSVG(chartRef, filename);
      }
    } catch (error) {
      console.error(`Export failed for ${filename}:`, error);
    }
  };

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssessmentIcon /> Anomaly Detection Performance
            </Typography>
            <Typography color="text.secondary" variant="body2">
              ROC and Precision-Recall curve analysis
            </Typography>
          </Box>
          <Tooltip title="ROC and PR curves evaluate model performance across all classification thresholds" arrow>
            <InfoIcon color="action" />
          </Tooltip>
        </Stack>
      </Paper>

      {/* Info Alert */}
      {rocCurve.length > 0 && (
        <Alert severity="info">
          <strong>Interpretation:</strong> Higher AUC scores indicate better model performance. AUC = 1.0 is perfect,
          AUC = 0.5 is random guessing. ROC curves show the trade-off between true positive and false positive rates.
          PR curves are especially useful for imbalanced datasets.
        </Alert>
      )}

      {/* ROC and PR Curves */}
      <Grid container spacing={2}>
        {/* ROC Curve */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">ROC Curve</Typography>
              <ButtonGroup size="small" variant="outlined">
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={() => exportChart(rocChartRef, 'roc-curve', 'png')}
                  disabled={rocCurve.length === 0}
                >
                  PNG
                </Button>
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={() => exportChart(rocChartRef, 'roc-curve', 'svg')}
                  disabled={rocCurve.length === 0}
                >
                  SVG
                </Button>
              </ButtonGroup>
            </Stack>
            {rocCurve.length === 0 ? (
              <Alert severity="info">
                No ROC curve data available. Data will appear after anomaly detection evaluation is completed.
              </Alert>
            ) : (
              <Box sx={{ height: 320 }}>
                <Line ref={rocChartRef} data={rocData} options={rocOptions} />
              </Box>
            )}
          </Paper>
        </Grid>

        {/* PR Curve */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Precision-Recall Curve</Typography>
              <ButtonGroup size="small" variant="outlined">
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={() => exportChart(prChartRef, 'pr-curve', 'png')}
                  disabled={prCurve.length === 0}
                >
                  PNG
                </Button>
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={() => exportChart(prChartRef, 'pr-curve', 'svg')}
                  disabled={prCurve.length === 0}
                >
                  SVG
                </Button>
              </ButtonGroup>
            </Stack>
            {prCurve.length === 0 ? (
              <Alert severity="info">
                No PR curve data available. Data will appear after anomaly detection evaluation is completed.
              </Alert>
            ) : (
              <Box sx={{ height: 320 }}>
                <Line ref={prChartRef} data={prData} options={prOptions} />
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* AUC Scores Summary */}
      {(rocCurve.length > 0 || prCurve.length > 0 || rocAuc !== null || prAuc !== null) && (
        <Grid container spacing={2}>
          {rocCurve.length > 0 || rocAuc !== null ? (
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    ROC AUC Score
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: '#1976d2' }}>
                    {rocAuc !== null ? rocAuc.toFixed(4) : 'N/A'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {rocAuc !== null && rocAuc >= 0.9 && 'Excellent performance'}
                    {rocAuc !== null && rocAuc >= 0.8 && rocAuc < 0.9 && 'Good performance'}
                    {rocAuc !== null && rocAuc >= 0.7 && rocAuc < 0.8 && 'Fair performance'}
                    {rocAuc !== null && rocAuc < 0.7 && 'Poor performance'}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          ) : null}

          {prCurve.length > 0 || prAuc !== null ? (
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    PR AUC Score
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: '#2e7d32' }}>
                    {prAuc !== null ? prAuc.toFixed(4) : 'N/A'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Higher is better for imbalanced datasets
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          ) : null}
        </Grid>
      )}

      {/* Confusion Matrix and Metrics */}
      {confusionMatrix && confusionMetrics && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Confusion Matrix and Performance Metrics
          </Typography>
          <Grid container spacing={2}>
            {/* Confusion Matrix Visualization */}
            <Grid item xs={12} md={6}>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell colSpan={2} rowSpan={2} />
                      <TableCell colSpan={2} align="center"><strong>Predicted</strong></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell align="center"><strong>Negative</strong></TableCell>
                      <TableCell align="center"><strong>Positive</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell rowSpan={2} sx={{ fontWeight: 'bold', verticalAlign: 'middle' }}>
                        Actual
                      </TableCell>
                      <TableCell><strong>Negative</strong></TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          bgcolor: 'success.light',
                          fontWeight: 'bold',
                          fontSize: '1.1rem',
                        }}
                      >
                        {confusionMatrix.TN}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          bgcolor: 'error.light',
                          fontWeight: 'bold',
                          fontSize: '1.1rem',
                        }}
                      >
                        {confusionMatrix.FP}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>Positive</strong></TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          bgcolor: 'error.light',
                          fontWeight: 'bold',
                          fontSize: '1.1rem',
                        }}
                      >
                        {confusionMatrix.FN}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          bgcolor: 'success.light',
                          fontWeight: 'bold',
                          fontSize: '1.1rem',
                        }}
                      >
                        {confusionMatrix.TP}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                TP: True Positives, FP: False Positives, TN: True Negatives, FN: False Negatives
              </Typography>
            </Grid>

            {/* Performance Metrics */}
            <Grid item xs={12} md={6}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Metric</strong></TableCell>
                      <TableCell align="right"><strong>Value</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Accuracy</TableCell>
                      <TableCell align="right">{(confusionMetrics.accuracy * 100).toFixed(2)}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Precision</TableCell>
                      <TableCell align="right">{(confusionMetrics.precision * 100).toFixed(2)}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Recall (Sensitivity)</TableCell>
                      <TableCell align="right">{(confusionMetrics.recall * 100).toFixed(2)}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>F1 Score</TableCell>
                      <TableCell align="right">{confusionMetrics.f1Score.toFixed(4)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Specificity</TableCell>
                      <TableCell align="right">{(confusionMetrics.specificity * 100).toFixed(2)}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Stack>
  );
};

ROCPRCurves.propTypes = {
  rocCurve: PropTypes.arrayOf(
    PropTypes.shape({
      fpr: PropTypes.number.isRequired,
      tpr: PropTypes.number.isRequired,
    })
  ),
  rocAuc: PropTypes.number,
  prCurve: PropTypes.arrayOf(
    PropTypes.shape({
      recall: PropTypes.number.isRequired,
      precision: PropTypes.number.isRequired,
    })
  ),
  prAuc: PropTypes.number,
  confusionMatrix: PropTypes.shape({
    TP: PropTypes.number.isRequired,
    FP: PropTypes.number.isRequired,
    TN: PropTypes.number.isRequired,
    FN: PropTypes.number.isRequired,
  }),
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(ROCPRCurves);
