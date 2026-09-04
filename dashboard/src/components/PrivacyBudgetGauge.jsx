/**
 * PrivacyBudgetGauge Component
 * 
 * Displays privacy budget consumption visualization with:
 * - Line chart showing epsilon consumption over training rounds
 * - Current epsilon and delta values
 * - Remaining budget percentage and absolute value
 * - Privacy budget threshold line
 * - Color-coded warning indicators
 * - Export functionality for charts and metrics
 * 
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.8, 39.1, 39.2, 39.3
 * 
 * @module components/PrivacyBudgetGauge
 */

import { useMemo, useRef, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
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
import ExportButton from './ExportButton';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend, Filler);

/**
 * Get color based on privacy budget utilization percentage
 * 
 * @param {number} percentage - Budget utilization percentage (0-100)
 * @returns {Object} Object with color, backgroundColor, and severity
 */
const getColorByUtilization = (percentage) => {
  if (percentage < 70) {
    return {
      color: '#2e7d32',
      backgroundColor: 'rgba(46, 125, 50, 0.12)',
      severity: 'success',
      icon: <CheckCircleIcon />,
      label: 'Strong privacy',
    };
  } else if (percentage < 90) {
    return {
      color: '#ed6c02',
      backgroundColor: 'rgba(237, 108, 2, 0.12)',
      severity: 'warning',
      icon: <WarningAmberIcon />,
      label: 'Moderate privacy',
    };
  } else {
    return {
      color: '#d32f2f',
      backgroundColor: 'rgba(211, 47, 47, 0.12)',
      severity: 'error',
      icon: <ErrorIcon />,
      label: 'Weak privacy',
    };
  }
};

/**
 * PrivacyBudgetGauge Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.privacyMetrics - Array of privacy metrics with round, epsilon, delta
 * @param {number} props.maxEpsilon - Maximum allowed epsilon (privacy budget threshold)
 * @param {number} [props.maxDelta=1e-5] - Maximum allowed delta
 * @param {string} [props.accountingMethod='RDP'] - Privacy accounting method name
 * @returns {JSX.Element} Privacy budget gauge component
 */
const PrivacyBudgetGauge = ({
  privacyMetrics = [],
  maxEpsilon = 10.0,
  maxDelta = 1e-5,
  accountingMethod = 'RDP',
}) => {
  // Get latest privacy metric
  const latestMetric = useMemo(() => {
    return privacyMetrics.length > 0 ? privacyMetrics[privacyMetrics.length - 1] : null;
  }, [privacyMetrics]);

  // Calculate current values
  const currentEpsilon = latestMetric?.epsilon || 0;
  const currentDelta = latestMetric?.delta || 0;
  const currentRound = latestMetric?.round || 0;

  // Calculate remaining budget
  const remainingEpsilon = Math.max(0, maxEpsilon - currentEpsilon);
  const utilizationPercentage = maxEpsilon > 0 ? (currentEpsilon / maxEpsilon) * 100 : 0;

  // Get color theme based on utilization
  const colorTheme = getColorByUtilization(utilizationPercentage);

  // Chart ref for export
  const chartRef = useRef(null);

  // Prepare chart data
  const chartData = useMemo(() => {
    const rounds = privacyMetrics.map((m) => m.round);
    const epsilonValues = privacyMetrics.map((m) => m.epsilon);
    const thresholdLine = rounds.map(() => maxEpsilon);

    return {
      labels: rounds,
      datasets: [
        {
          label: 'Epsilon consumed',
          data: epsilonValues,
          borderColor: colorTheme.color,
          backgroundColor: colorTheme.backgroundColor,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: 'Privacy budget threshold',
          data: thresholdLine,
          borderColor: '#d32f2f',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  }, [privacyMetrics, maxEpsilon, colorTheme]);

  // Chart options
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
          title: (context) => `Round ${context[0].label}`,
          label: (context) => {
            const label = context.dataset.label || '';
            const value = typeof context.parsed.y === 'number' ? context.parsed.y.toFixed(4) : '';
            return `${label}: ε = ${value}`;
          },
          footer: () => `Accounting: ${accountingMethod}`,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Training Round',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Epsilon (ε)',
        },
        beginAtZero: true,
        suggestedMax: maxEpsilon * 1.1,
      },
    },
  };

  // Show warning if budget is near exhaustion
  const showWarning = utilizationPercentage > 90;

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5">Privacy Budget Monitor</Typography>
            <Typography color="text.secondary" variant="body2">
              Differential privacy guarantee tracking
            </Typography>
          </Box>
          <Chip
            icon={colorTheme.icon}
            label={colorTheme.label}
            color={colorTheme.severity}
            sx={{ fontWeight: 500 }}
          />
        </Stack>
      </Paper>

      {/* Warning Alert */}
      {showWarning && (
        <Alert severity="error" icon={<ErrorIcon />}>
          <strong>Privacy budget near exhaustion!</strong> Training has consumed over 90% of the
          allocated privacy budget. Consider stopping training or adjusting privacy parameters.
        </Alert>
      )}

      {/* Current Values */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography color="text.secondary" variant="body2">
                  Current Epsilon (ε)
                </Typography>
                <Typography variant="h4" sx={{ color: colorTheme.color, fontWeight: 600 }}>
                  {currentEpsilon.toFixed(4)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  of {maxEpsilon.toFixed(2)} max
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography color="text.secondary" variant="body2">
                  Current Delta (δ)
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {currentDelta.toExponential(2)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  of {maxDelta.toExponential(0)} max
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography color="text.secondary" variant="body2">
                  Remaining Budget
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {remainingEpsilon.toFixed(4)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(100 - utilizationPercentage).toFixed(1)}% remaining
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Tooltip title={`Using ${accountingMethod} accounting method`} arrow>
                  <Typography color="text.secondary" variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Current Round <InfoIcon fontSize="small" />
                  </Typography>
                </Tooltip>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {currentRound}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {privacyMetrics.length} metrics recorded
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Budget Utilization Progress */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Budget Utilization</Typography>
            <Typography variant="body2" sx={{ color: colorTheme.color, fontWeight: 600 }}>
              {utilizationPercentage.toFixed(1)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, utilizationPercentage)}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: colorTheme.color,
                borderRadius: 5,
              },
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {utilizationPercentage < 70 && 'Privacy budget is healthy'}
            {utilizationPercentage >= 70 && utilizationPercentage < 90 && 'Privacy budget utilization is moderate'}
            {utilizationPercentage >= 90 && 'CRITICAL: Privacy budget near exhaustion'}
          </Typography>
        </Stack>
      </Paper>

      {/* Epsilon Consumption Chart */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Privacy Budget Consumption Over Time
          </Typography>
          <ExportButton 
            chartRef={chartRef} 
            filename="privacy-budget-consumption" 
            disabled={privacyMetrics.length === 0}
          />
        </Stack>
        {privacyMetrics.length === 0 ? (
          <Alert severity="info" icon={<InfoIcon />}>
            No privacy metrics available. Metrics will appear once differential privacy is enabled
            and training begins.
          </Alert>
        ) : (
          <Box sx={{ height: 320, mt: 2 }}>
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </Box>
        )}
      </Paper>
    </Stack>
  );
};

PrivacyBudgetGauge.propTypes = {
  privacyMetrics: PropTypes.arrayOf(
    PropTypes.shape({
      round: PropTypes.number.isRequired,
      epsilon: PropTypes.number.isRequired,
      delta: PropTypes.number,
      timestamp: PropTypes.string,
    })
  ),
  maxEpsilon: PropTypes.number,
  maxDelta: PropTypes.number,
  accountingMethod: PropTypes.string,
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(PrivacyBudgetGauge);
