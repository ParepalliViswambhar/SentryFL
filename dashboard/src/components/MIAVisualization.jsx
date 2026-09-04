/**
 * MIA (Membership Inference Attack) Visualization Component
 * 
 * Displays membership inference attack evaluation results:
 * - MIA attack success rate vs epsilon chart
 * - Comparison of privacy leakage across privacy levels
 * - Export functionality for charts as PNG/SVG
 * - Privacy accounting method information in tooltips
 * 
 * Requirements: 30.6, 30.7, 30.9, 30.10
 * 
 * @module components/MIAVisualization
 */

import { useRef, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
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
import SecurityIcon from '@mui/icons-material/Security';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import ExportButton from './ExportButton';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ChartTooltip, Legend);

/**
 * Get privacy level label based on epsilon value
 * 
 * @param {number} epsilon - Epsilon value
 * @returns {string} Privacy level label
 */
const getPrivacyLevel = (epsilon) => {
  if (epsilon <= 1) return 'Strong';
  if (epsilon <= 5) return 'Moderate';
  return 'Weak';
};

/**
 * MIAVisualization Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.miaResults - Array of MIA results with epsilon and successRate
 * @param {string} [props.accountingMethod='RDP'] - Privacy accounting method
 * @returns {JSX.Element} MIA visualization component
 */
const MIAVisualization = ({ miaResults = [], accountingMethod = 'RDP' }) => {
  const successRateChartRef = useRef(null);
  const comparisonChartRef = useRef(null);

  // Sort MIA results by epsilon for proper display
  const sortedResults = useMemo(() => {
    return [...miaResults].sort((a, b) => a.epsilon - b.epsilon);
  }, [miaResults]);

  // Prepare success rate vs epsilon chart data
  const successRateData = useMemo(() => {
    const epsilonValues = sortedResults.map((r) => r.epsilon.toFixed(2));
    const successRates = sortedResults.map((r) => r.successRate * 100); // Convert to percentage
    const baselineRates = sortedResults.map(() => 50); // 50% baseline (random guessing)

    return {
      labels: epsilonValues,
      datasets: [
        {
          label: 'MIA Success Rate',
          data: successRates,
          borderColor: '#d32f2f',
          backgroundColor: 'rgba(211, 47, 47, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Baseline (Random Guessing)',
          data: baselineRates,
          borderColor: '#757575',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  }, [sortedResults]);

  // Prepare privacy level comparison data
  const comparisonData = useMemo(() => {
    const groupedByLevel = sortedResults.reduce((acc, result) => {
      const level = getPrivacyLevel(result.epsilon);
      if (!acc[level]) {
        acc[level] = [];
      }
      acc[level].push(result);
      return acc;
    }, {});

    const levels = ['Strong', 'Moderate', 'Weak'];
    const avgSuccessRates = levels.map((level) => {
      const results = groupedByLevel[level] || [];
      if (results.length === 0) return 0;
      const avg = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;
      return avg * 100; // Convert to percentage
    });

    return {
      labels: levels,
      datasets: [
        {
          label: 'Average MIA Success Rate',
          data: avgSuccessRates,
          backgroundColor: [
            'rgba(46, 125, 50, 0.8)',  // Strong - Green
            'rgba(237, 108, 2, 0.8)',  // Moderate - Orange
            'rgba(211, 47, 47, 0.8)',  // Weak - Red
          ],
          borderColor: [
            '#2e7d32',
            '#ed6c02',
            '#d32f2f',
          ],
          borderWidth: 2,
        },
      ],
    };
  }, [sortedResults]);

  // Chart options for success rate chart
  const successRateOptions = {
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
          title: (context) => `ε = ${context[0].label}`,
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y.toFixed(2);
            return `${label}: ${value}%`;
          },
          afterLabel: (context) => {
            const epsilon = parseFloat(context.label);
            return `Privacy Level: ${getPrivacyLevel(epsilon)}`;
          },
          footer: () => `Accounting Method: ${accountingMethod}`,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Privacy Budget (ε)',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Attack Success Rate (%)',
        },
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
        },
      },
    },
  };

  // Chart options for comparison chart
  const comparisonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y.toFixed(2);
            return `Average Success Rate: ${value}%`;
          },
          footer: () => `Lower is better (closer to 50% baseline)`,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Privacy Level',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Average Attack Success Rate (%)',
        },
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
        },
      },
    },
  };

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon /> Membership Inference Attack Analysis
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Empirical privacy leakage evaluation
            </Typography>
          </Box>
          <Tooltip
            title={`Privacy accounting method: ${accountingMethod}. Lower success rates indicate stronger privacy protection.`}
            arrow
          >
            <InfoIcon color="action" />
          </Tooltip>
        </Stack>
      </Paper>

      {/* Info Alert */}
      {miaResults.length > 0 && (
        <Alert severity="info">
          <strong>Interpretation:</strong> MIA success rates close to 50% indicate strong privacy
          (similar to random guessing). Higher rates suggest privacy leakage. The baseline of 50%
          represents random guessing performance.
        </Alert>
      )}

      {/* MIA Success Rate vs Epsilon Chart */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Attack Success Rate vs Privacy Budget</Typography>
          <ExportButton 
            chartRef={successRateChartRef} 
            filename="mia-success-rate-vs-epsilon" 
            disabled={sortedResults.length === 0}
            showText={false}
          />
        </Stack>
        {sortedResults.length === 0 ? (
          <Alert severity="info">
            No MIA evaluation results available. Results will appear after membership inference
            attack evaluation is completed.
          </Alert>
        ) : (
          <Box sx={{ height: 320 }}>
            <Line ref={successRateChartRef} data={successRateData} options={successRateOptions} />
          </Box>
        )}
      </Paper>

      {/* Privacy Level Comparison Chart */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Privacy Leakage by Privacy Level</Typography>
          <ExportButton 
            chartRef={comparisonChartRef} 
            filename="mia-privacy-level-comparison" 
            disabled={sortedResults.length === 0}
            showText={false}
          />
        </Stack>
        {sortedResults.length === 0 ? (
          <Alert severity="info">
            Privacy level comparison will appear after MIA evaluation results are available.
          </Alert>
        ) : (
          <Box sx={{ height: 320 }}>
            <Bar ref={comparisonChartRef} data={comparisonData} options={comparisonOptions} />
          </Box>
        )}
      </Paper>

      {/* Detailed Results Table */}
      {sortedResults.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Detailed MIA Results
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Epsilon (ε)</strong></TableCell>
                  <TableCell><strong>Privacy Level</strong></TableCell>
                  <TableCell align="right"><strong>Success Rate</strong></TableCell>
                  <TableCell align="right"><strong>Above Baseline</strong></TableCell>
                  <TableCell><strong>Interpretation</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedResults.map((result, index) => {
                  const level = getPrivacyLevel(result.epsilon);
                  const successRatePercent = (result.successRate * 100).toFixed(2);
                  const aboveBaseline = (result.successRate - 0.5) * 100;
                  const isGood = aboveBaseline < 5; // Less than 5% above baseline is good

                  return (
                    <TableRow key={index} hover>
                      <TableCell>{result.epsilon.toFixed(4)}</TableCell>
                      <TableCell>
                        <Chip
                          label={level}
                          size="small"
                          color={
                            level === 'Strong' ? 'success' :
                            level === 'Moderate' ? 'warning' : 'error'
                          }
                        />
                      </TableCell>
                      <TableCell align="right">{successRatePercent}%</TableCell>
                      <TableCell align="right" sx={{ color: isGood ? 'success.main' : 'error.main' }}>
                        {aboveBaseline > 0 ? '+' : ''}{aboveBaseline.toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        {isGood ? 'Good privacy protection' : 'Privacy leakage detected'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Summary Statistics */}
      {sortedResults.length > 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Lowest Success Rate
                  </Typography>
                  <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 600 }}>
                    {(Math.min(...sortedResults.map(r => r.successRate)) * 100).toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Best privacy protection achieved
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Highest Success Rate
                  </Typography>
                  <Typography variant="h5" sx={{ color: 'error.main', fontWeight: 600 }}>
                    {(Math.max(...sortedResults.map(r => r.successRate)) * 100).toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Weakest privacy protection
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Average Success Rate
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {(sortedResults.reduce((sum, r) => sum + r.successRate, 0) / sortedResults.length * 100).toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Across all privacy levels
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Stack>
  );
};

MIAVisualization.propTypes = {
  miaResults: PropTypes.arrayOf(
    PropTypes.shape({
      epsilon: PropTypes.number.isRequired,
      successRate: PropTypes.number.isRequired,
      delta: PropTypes.number,
      timestamp: PropTypes.string,
    })
  ),
  accountingMethod: PropTypes.string,
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(MIAVisualization);
