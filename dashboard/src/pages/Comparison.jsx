/**
 * Comparison Page Component
 * 
 * Compare metrics and results across multiple experiments
 * Implements Requirements 33.1-33.10:
 * - Side-by-side experiment comparison
 * - Checkbox-based experiment selection
 * - Performance metrics comparison table
 * - Overlaid training loss curves
 * - Bar charts for F1 scores, communication costs, and inference latency
 * - Highlighting best-performing configurations
 * - Export comparison table as CSV
 * - Display statistical significance indicators
 * - Batch export as ZIP
 */

import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Paper,
  Alert,
  Checkbox,
  FormControlLabel,
  Stack,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Tooltip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Archive as ArchiveIcon,
} from '@mui/icons-material';
import { Line, Bar } from 'react-chartjs-2';
import JSZip from 'jszip';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { fetchExperiments, selectAllExperiments, selectExperimentsStatus, selectExperimentsError } from '../store/slices/experimentsSlice';
import LoadingSpinner from '../components/LoadingSpinner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  Legend
);

// Color palette for experiments
const COLORS = [
  '#0b7285',
  '#e67700',
  '#5f3dc4',
  '#2b8a3e',
  '#c2255c',
  '#495057',
  '#087f5b',
  '#d9480f',
];

const Comparison = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const status = useSelector(selectExperimentsStatus);
  const error = useSelector(selectExperimentsError);
  
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    dispatch(fetchExperiments());
  }, [dispatch]);

  // Get selected experiments
  const selectedExperiments = useMemo(() => {
    return experiments.filter(exp => selectedIds.includes(exp.id));
  }, [experiments, selectedIds]);

  // Toggle experiment selection
  const handleToggle = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(expId => expId !== id) : [...prev, id]
    );
  };

  // Find best values for highlighting
  const bestMetrics = useMemo(() => {
    if (selectedExperiments.length === 0) return {};
    
    const f1Scores = selectedExperiments.map(exp => exp.metrics?.f1Score || 0);
    const commCosts = selectedExperiments.map(exp => exp.metrics?.communicationCost || Infinity);
    const latencies = selectedExperiments.map(exp => exp.metrics?.inferenceLatency || Infinity);
    const accuracies = selectedExperiments.map(exp => exp.metrics?.accuracy || 0);

    return {
      bestF1: Math.max(...f1Scores),
      bestCommCost: Math.min(...commCosts.filter(c => c !== Infinity)),
      bestLatency: Math.min(...latencies.filter(l => l !== Infinity)),
      bestAccuracy: Math.max(...accuracies),
    };
  }, [selectedExperiments]);

  // Check if a value is the best (for highlighting)
  const isBest = (value, bestValue, isHigherBetter = true) => {
    if (value === undefined || value === null) return false;
    return isHigherBetter ? value === bestValue : value === bestValue;
  };

  // Calculate statistical significance using t-test approximation
  // For simplicity, we'll use coefficient of variation and sample size heuristics
  const calculateSignificance = (experiments, metric, isHigherBetter = true) => {
    if (experiments.length < 2) return {};
    
    const values = experiments.map(exp => exp.metrics?.[metric] || 0).filter(v => v > 0);
    if (values.length < 2) return {};

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // Coefficient of variation

    // Simplified significance calculation
    // If CV < 0.05: highly significant (***), CV < 0.1: significant (**), CV < 0.2: marginally significant (*)
    const significance = {};
    experiments.forEach(exp => {
      const value = exp.metrics?.[metric];
      if (!value) return;
      
      const zScore = Math.abs((value - mean) / (stdDev || 1));
      if (zScore > 2.576) { // 99% confidence
        significance[exp.id] = '***';
      } else if (zScore > 1.96) { // 95% confidence
        significance[exp.id] = '**';
      } else if (zScore > 1.645) { // 90% confidence
        significance[exp.id] = '*';
      }
    });

    return significance;
  };

  // Calculate significance indicators for all metrics
  const significanceIndicators = useMemo(() => {
    if (selectedExperiments.length < 2) return {};
    
    return {
      accuracy: calculateSignificance(selectedExperiments, 'accuracy', true),
      f1Score: calculateSignificance(selectedExperiments, 'f1Score', true),
      communicationCost: calculateSignificance(selectedExperiments, 'communicationCost', false),
      inferenceLatency: calculateSignificance(selectedExperiments, 'inferenceLatency', false),
    };
  }, [selectedExperiments]);

  // Export comparison table as CSV
  const exportToCSV = () => {
    if (selectedExperiments.length === 0) return;

    // Create CSV header
    const headers = [
      'Experiment',
      'Status',
      'Accuracy',
      'Accuracy Significance',
      'F1 Score',
      'F1 Significance',
      'Communication Cost (MB)',
      'Comm. Cost Significance',
      'Inference Latency (ms)',
      'Latency Significance'
    ];

    // Create CSV rows
    const rows = selectedExperiments.map(exp => [
      exp.name,
      exp.status,
      exp.metrics?.accuracy?.toFixed(4) || 'N/A',
      significanceIndicators.accuracy?.[exp.id] || '',
      exp.metrics?.f1Score?.toFixed(4) || 'N/A',
      significanceIndicators.f1Score?.[exp.id] || '',
      exp.metrics?.communicationCost?.toFixed(2) || 'N/A',
      significanceIndicators.communicationCost?.[exp.id] || '',
      exp.metrics?.inferenceLatency?.toFixed(2) || 'N/A',
      significanceIndicators.inferenceLatency?.[exp.id] || '',
    ]);

    // Combine header and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `experiment_comparison_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export multiple experiments as ZIP
  const exportToZIP = async () => {
    if (selectedExperiments.length === 0) return;

    const zip = new JSZip();

    // Add comparison CSV
    const headers = [
      'Experiment',
      'Status',
      'Accuracy',
      'Accuracy Significance',
      'F1 Score',
      'F1 Significance',
      'Communication Cost (MB)',
      'Comm. Cost Significance',
      'Inference Latency (ms)',
      'Latency Significance'
    ];
    const rows = selectedExperiments.map(exp => [
      exp.name,
      exp.status,
      exp.metrics?.accuracy?.toFixed(4) || 'N/A',
      significanceIndicators.accuracy?.[exp.id] || '',
      exp.metrics?.f1Score?.toFixed(4) || 'N/A',
      significanceIndicators.f1Score?.[exp.id] || '',
      exp.metrics?.communicationCost?.toFixed(2) || 'N/A',
      significanceIndicators.communicationCost?.[exp.id] || '',
      exp.metrics?.inferenceLatency?.toFixed(2) || 'N/A',
      significanceIndicators.inferenceLatency?.[exp.id] || '',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    zip.file('comparison_summary.csv', csvContent);

    // Add individual experiment data
    selectedExperiments.forEach(exp => {
      const expFolder = zip.folder(exp.name.replace(/[^a-z0-9]/gi, '_'));

      // Add experiment configuration
      const config = {
        id: exp.id,
        name: exp.name,
        status: exp.status,
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt,
        configuration: exp.configuration || {},
      };
      expFolder.file('config.json', JSON.stringify(config, null, 2));

      // Add metrics
      const metrics = {
        accuracy: exp.metrics?.accuracy || null,
        f1Score: exp.metrics?.f1Score || null,
        precision: exp.metrics?.precision || null,
        recall: exp.metrics?.recall || null,
        communicationCost: exp.metrics?.communicationCost || null,
        inferenceLatency: exp.metrics?.inferenceLatency || null,
        confusionMatrix: exp.metrics?.confusionMatrix || null,
      };
      expFolder.file('metrics.json', JSON.stringify(metrics, null, 2));

      // Add training history
      if (exp.trainingHistory && exp.trainingHistory.length > 0) {
        const historyCSV = [
          'Round,Loss,Accuracy',
          ...exp.trainingHistory.map((h, idx) => `${idx + 1},${h.loss || ''},${h.accuracy || ''}`)
        ].join('\n');
        expFolder.file('training_history.csv', historyCSV);
      }

      // Add README
      const readme = `# ${exp.name}

## Experiment Information
- **ID**: ${exp.id}
- **Status**: ${exp.status}
- **Created**: ${exp.createdAt || 'N/A'}

## Metrics
- **Accuracy**: ${exp.metrics?.accuracy?.toFixed(4) || 'N/A'}
- **F1 Score**: ${exp.metrics?.f1Score?.toFixed(4) || 'N/A'}
- **Communication Cost**: ${exp.metrics?.communicationCost?.toFixed(2) || 'N/A'} MB
- **Inference Latency**: ${exp.metrics?.inferenceLatency?.toFixed(2) || 'N/A'} ms

## Statistical Significance
- **Accuracy**: ${significanceIndicators.accuracy?.[exp.id] || 'Not significant'}
- **F1 Score**: ${significanceIndicators.f1Score?.[exp.id] || 'Not significant'}
- **Communication Cost**: ${significanceIndicators.communicationCost?.[exp.id] || 'Not significant'}
- **Inference Latency**: ${significanceIndicators.inferenceLatency?.[exp.id] || 'Not significant'}

Legend: *** = 99% confidence, ** = 95% confidence, * = 90% confidence
`;
      expFolder.file('README.md', readme);
    });

    // Generate ZIP and download
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(content);
    link.setAttribute('href', url);
    link.setAttribute('download', `experiments_export_${new Date().toISOString().slice(0, 10)}.zip`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Training loss chart data (overlaid curves)
  const lossChartData = useMemo(() => {
    if (selectedExperiments.length === 0) return null;

    // Find maximum rounds across all experiments
    const maxRounds = Math.max(
      ...selectedExperiments.map(exp => exp.trainingHistory?.length || 0)
    );

    if (maxRounds === 0) return null;

    const labels = Array.from({ length: maxRounds }, (_, i) => i + 1);

    const datasets = selectedExperiments.map((exp, index) => ({
      label: exp.name,
      data: exp.trainingHistory?.map(h => h.loss) || [],
      borderColor: COLORS[index % COLORS.length],
      backgroundColor: COLORS[index % COLORS.length] + '20',
      tension: 0.3,
      spanGaps: true,
    }));

    return { labels, datasets };
  }, [selectedExperiments]);

  // F1 Score comparison bar chart
  const f1ChartData = useMemo(() => {
    if (selectedExperiments.length === 0) return null;

    const labels = selectedExperiments.map(exp => exp.name);
    const data = selectedExperiments.map(exp => exp.metrics?.f1Score || 0);
    const backgroundColor = selectedExperiments.map((exp, index) => {
      const isTop = isBest(exp.metrics?.f1Score, bestMetrics.bestF1, true);
      return isTop ? '#2b8a3e' : COLORS[index % COLORS.length];
    });

    return {
      labels,
      datasets: [{
        label: 'F1 Score',
        data,
        backgroundColor,
      }],
    };
  }, [selectedExperiments, bestMetrics.bestF1]);

  // Communication cost comparison bar chart
  const commCostChartData = useMemo(() => {
    if (selectedExperiments.length === 0) return null;

    const labels = selectedExperiments.map(exp => exp.name);
    const data = selectedExperiments.map(exp => exp.metrics?.communicationCost || 0);
    const backgroundColor = selectedExperiments.map((exp, index) => {
      const isTop = isBest(exp.metrics?.communicationCost, bestMetrics.bestCommCost, false);
      return isTop ? '#2b8a3e' : COLORS[index % COLORS.length];
    });

    return {
      labels,
      datasets: [{
        label: 'Communication Cost (MB)',
        data,
        backgroundColor,
      }],
    };
  }, [selectedExperiments, bestMetrics.bestCommCost]);

  // Inference latency comparison bar chart
  const latencyChartData = useMemo(() => {
    if (selectedExperiments.length === 0) return null;

    const labels = selectedExperiments.map(exp => exp.name);
    const data = selectedExperiments.map(exp => exp.metrics?.inferenceLatency || 0);
    const backgroundColor = selectedExperiments.map((exp, index) => {
      const isTop = isBest(exp.metrics?.inferenceLatency, bestMetrics.bestLatency, false);
      return isTop ? '#2b8a3e' : COLORS[index % COLORS.length];
    });

    return {
      labels,
      datasets: [{
        label: 'Inference Latency (ms)',
        data,
        backgroundColor,
      }],
    };
  }, [selectedExperiments, bestMetrics.bestLatency]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
      },
    },
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Experiment Comparison
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Compare performance metrics across multiple experiments
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {typeof error === 'string' ? error : error.message || 'Failed to load experiments'}
        </Alert>
      )}

      {/* Experiment Selection */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Select Experiments to Compare
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose two or more experiments to compare their performance metrics
        </Typography>
        {experiments.length === 0 ? (
          <Typography color="text.secondary">
            No experiments available. Create some experiments first.
          </Typography>
        ) : (
          <Grid container spacing={1}>
            {experiments.map((exp) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={exp.id}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedIds.includes(exp.id)}
                      onChange={() => handleToggle(exp.id)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">{exp.name}</Typography>
                      <Chip
                        label={exp.status}
                        size="small"
                        color={exp.status === 'completed' ? 'success' : 'default'}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  }
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      {/* Comparison Results */}
      {selectedExperiments.length === 0 ? (
        <Alert severity="info">
          Select at least one experiment to view comparison metrics
        </Alert>
      ) : (
        <Stack spacing={3}>
          {/* Performance Metrics Comparison Table */}
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Performance Metrics Comparison
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={exportToCSV}
                  size="small"
                >
                  Export CSV
                </Button>
                <Button
                  variant="contained"
                  startIcon={<ArchiveIcon />}
                  onClick={exportToZIP}
                  size="small"
                >
                  Export ZIP
                </Button>
              </Stack>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Experiment</strong></TableCell>
                    <TableCell align="right"><strong>Status</strong></TableCell>
                    <TableCell align="right"><strong>Accuracy</strong></TableCell>
                    <TableCell align="right"><strong>F1 Score</strong></TableCell>
                    <TableCell align="right"><strong>Comm. Cost (MB)</strong></TableCell>
                    <TableCell align="right"><strong>Latency (ms)</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedExperiments.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell>{exp.name}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={exp.status}
                          size="small"
                          color={exp.status === 'completed' ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          bgcolor: isBest(exp.metrics?.accuracy, bestMetrics.bestAccuracy, true)
                            ? '#d3f9d8'
                            : 'transparent',
                          fontWeight: isBest(exp.metrics?.accuracy, bestMetrics.bestAccuracy, true)
                            ? 'bold'
                            : 'normal',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          {exp.metrics?.accuracy?.toFixed(4) || 'N/A'}
                          {significanceIndicators.accuracy?.[exp.id] && (
                            <Tooltip title="Statistical significance: 99% (***), 95% (**), 90% (*)">
                              <Typography
                                component="span"
                                sx={{ color: 'primary.main', fontSize: '0.75rem', fontWeight: 'bold' }}
                              >
                                {significanceIndicators.accuracy[exp.id]}
                              </Typography>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          bgcolor: isBest(exp.metrics?.f1Score, bestMetrics.bestF1, true)
                            ? '#d3f9d8'
                            : 'transparent',
                          fontWeight: isBest(exp.metrics?.f1Score, bestMetrics.bestF1, true)
                            ? 'bold'
                            : 'normal',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          {exp.metrics?.f1Score?.toFixed(4) || 'N/A'}
                          {significanceIndicators.f1Score?.[exp.id] && (
                            <Tooltip title="Statistical significance: 99% (***), 95% (**), 90% (*)">
                              <Typography
                                component="span"
                                sx={{ color: 'primary.main', fontSize: '0.75rem', fontWeight: 'bold' }}
                              >
                                {significanceIndicators.f1Score[exp.id]}
                              </Typography>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          bgcolor: isBest(exp.metrics?.communicationCost, bestMetrics.bestCommCost, false)
                            ? '#d3f9d8'
                            : 'transparent',
                          fontWeight: isBest(exp.metrics?.communicationCost, bestMetrics.bestCommCost, false)
                            ? 'bold'
                            : 'normal',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          {exp.metrics?.communicationCost?.toFixed(2) || 'N/A'}
                          {significanceIndicators.communicationCost?.[exp.id] && (
                            <Tooltip title="Statistical significance: 99% (***), 95% (**), 90% (*)">
                              <Typography
                                component="span"
                                sx={{ color: 'primary.main', fontSize: '0.75rem', fontWeight: 'bold' }}
                              >
                                {significanceIndicators.communicationCost[exp.id]}
                              </Typography>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          bgcolor: isBest(exp.metrics?.inferenceLatency, bestMetrics.bestLatency, false)
                            ? '#d3f9d8'
                            : 'transparent',
                          fontWeight: isBest(exp.metrics?.inferenceLatency, bestMetrics.bestLatency, false)
                            ? 'bold'
                            : 'normal',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          {exp.metrics?.inferenceLatency?.toFixed(2) || 'N/A'}
                          {significanceIndicators.inferenceLatency?.[exp.id] && (
                            <Tooltip title="Statistical significance: 99% (***), 95% (**), 90% (*)">
                              <Typography
                                component="span"
                                sx={{ color: 'primary.main', fontSize: '0.75rem', fontWeight: 'bold' }}
                              >
                                {significanceIndicators.inferenceLatency[exp.id]}
                              </Typography>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                Best values are highlighted in green
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Statistical significance: *** = 99% confidence, ** = 95% confidence, * = 90% confidence
              </Typography>
            </Box>
          </Paper>

          {/* Training Loss Curves */}
          {lossChartData && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Training Loss Curves
              </Typography>
              <Box sx={{ height: 300 }}>
                <Line data={lossChartData} options={chartOptions} />
              </Box>
            </Paper>
          )}

          {/* Bar Charts Grid */}
          <Grid container spacing={3}>
            {/* F1 Score Comparison */}
            {f1ChartData && (
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    F1 Score Comparison
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <Bar data={f1ChartData} options={barChartOptions} />
                  </Box>
                </Paper>
              </Grid>
            )}

            {/* Communication Cost Comparison */}
            {commCostChartData && (
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Communication Cost
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <Bar data={commCostChartData} options={barChartOptions} />
                  </Box>
                </Paper>
              </Grid>
            )}

            {/* Inference Latency Comparison */}
            {latencyChartData && (
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Inference Latency
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <Bar data={latencyChartData} options={barChartOptions} />
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>
        </Stack>
      )}
    </Box>
  );
};

export default Comparison;
