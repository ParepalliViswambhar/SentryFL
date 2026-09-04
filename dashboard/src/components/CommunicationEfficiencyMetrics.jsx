/**
 * Communication Efficiency Metrics Component
 * 
 * Displays communication efficiency analysis:
 * - Comparison between parameter-efficient vs full-model training
 * - Communication efficiency (bytes per accuracy point)
 * - Per-client communication statistics
 * - Clients with unusually high costs (color coded)
 * - Payload size reduction from quantization
 * 
 * Requirements: 32.5, 32.6, 32.7, 32.8, 32.9
 * 
 * @module components/CommunicationEfficiencyMetrics
 */

import { useMemo, memo } from 'react';
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
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CompressIcon from '@mui/icons-material/Compress';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningIcon from '@mui/icons-material/Warning';

/**
 * Format bytes to human-readable format
 * 
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Format percentage
 * 
 * @param {number} value - Decimal value (e.g., 0.75 for 75%)
 * @returns {string} Formatted percentage
 */
const formatPercentage = (value) => {
  return `${(value * 100).toFixed(2)}%`;
};

/**
 * Determine if client has unusually high communication cost
 * 
 * @param {number} clientBytes - Client's total bytes
 * @param {number} avgBytes - Average bytes across all clients
 * @returns {boolean} True if client cost is unusually high
 */
const isHighCost = (clientBytes, avgBytes) => {
  return clientBytes > avgBytes * 1.5; // 50% above average
};

/**
 * CommunicationEfficiencyMetrics Component
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.communicationMetrics - Communication metrics per round
 * @param {Array<Object>} props.trainingMetrics - Training metrics per round (for accuracy)
 * @param {Object} props.comparisonData - Optional comparison with baseline/full model
 * @param {number} props.comparisonData.fullModelBytes - Total bytes for full model training
 * @param {number} props.comparisonData.parameterEfficientBytes - Total bytes for parameter-efficient training
 * @param {number} props.comparisonData.reduction - Reduction percentage
 * @param {Array<Object>} props.perClientStats - Per-client communication statistics
 * @param {string} props.perClientStats[].clientId - Client identifier
 * @param {number} props.perClientStats[].totalBytes - Total bytes transferred
 * @param {number} props.perClientStats[].rounds - Number of rounds participated
 * @param {number} props.perClientStats[].avgBytesPerRound - Average bytes per round
 * @param {Object} props.quantizationData - Quantization payload size reduction
 * @param {number} props.quantizationData.fp32Size - FP32 model size
 * @param {number} props.quantizationData.int8Size - INT8 quantized model size
 * @param {number} props.quantizationData.reduction - Reduction percentage
 * @returns {JSX.Element} Communication efficiency metrics component
 */
const CommunicationEfficiencyMetrics = ({
  communicationMetrics = [],
  trainingMetrics = [],
  comparisonData = null,
  perClientStats = [],
  quantizationData = null,
}) => {
  // Compute total communication cost
  const totalBytes = useMemo(() => {
    return communicationMetrics.reduce(
      (sum, m) => sum + (m.bytesSent || 0) + (m.bytesReceived || 0) + (m.overhead || 0),
      0
    );
  }, [communicationMetrics]);

  // Compute final accuracy
  const finalAccuracy = useMemo(() => {
    if (trainingMetrics.length === 0) return 0;
    return trainingMetrics[trainingMetrics.length - 1]?.accuracy || 0;
  }, [trainingMetrics]);

  // Compute bytes per accuracy point
  const bytesPerAccuracyPoint = useMemo(() => {
    if (finalAccuracy === 0) return 0;
    return totalBytes / finalAccuracy;
  }, [totalBytes, finalAccuracy]);

  // Compute average bytes per client
  const avgBytesPerClient = useMemo(() => {
    if (perClientStats.length === 0) return 0;
    const sum = perClientStats.reduce((acc, client) => acc + client.totalBytes, 0);
    return sum / perClientStats.length;
  }, [perClientStats]);

  // Identify high-cost clients
  const highCostClients = useMemo(() => {
    return perClientStats.filter((client) => isHighCost(client.totalBytes, avgBytesPerClient));
  }, [perClientStats, avgBytesPerClient]);

  return (
    <Stack spacing={2}>
      {/* Summary Cards */}
      <Grid container spacing={2}>
        {/* Communication Efficiency Card */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Bytes per Accuracy
                  </Typography>
                  <SpeedIcon color="primary" fontSize="small" />
                </Stack>
                <Typography variant="h5" fontWeight={600}>
                  {formatBytes(bytesPerAccuracyPoint)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Lower is better
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Communication Card */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography color="text.secondary" variant="body2">
                    Total Communication
                  </Typography>
                  <TrendingUpIcon color="action" fontSize="small" />
                </Stack>
                <Typography variant="h5" fontWeight={600}>
                  {formatBytes(totalBytes)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {communicationMetrics.length} rounds
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Parameter Efficiency Savings Card */}
        {comparisonData && (
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography color="text.secondary" variant="body2">
                      Efficiency Savings
                    </Typography>
                    <TrendingDownIcon color="success" fontSize="small" />
                  </Stack>
                  <Typography variant="h5" fontWeight={600} color="success.main">
                    {formatPercentage(comparisonData.reduction)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    vs full-model training
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Quantization Savings Card */}
        {quantizationData && (
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography color="text.secondary" variant="body2">
                      Quantization Savings
                    </Typography>
                    <CompressIcon color="info" fontSize="small" />
                  </Stack>
                  <Typography variant="h5" fontWeight={600} color="info.main">
                    {formatPercentage(quantizationData.reduction)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBytes(quantizationData.fp32Size)} → {formatBytes(quantizationData.int8Size)}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Parameter-Efficient vs Full Model Comparison */}
      {comparisonData && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Communication Cost Comparison
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'error.main',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Full Model Training
                </Typography>
                <Typography variant="h6" color="error.main">
                  {formatBytes(comparisonData.fullModelBytes)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'success.main',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Parameter-Efficient Training
                </Typography>
                <Typography variant="h6" color="success.main">
                  {formatBytes(comparisonData.parameterEfficientBytes)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'primary.main',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Bytes Saved
                </Typography>
                <Typography variant="h6" color="primary.main">
                  {formatBytes(comparisonData.fullModelBytes - comparisonData.parameterEfficientBytes)}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* High Cost Clients Warning */}
      {highCostClients.length > 0 && (
        <Alert severity="warning" icon={<WarningIcon />}>
          <strong>High Communication Cost Detected:</strong> {highCostClients.length} client(s) with
          unusually high communication costs (50%+ above average)
        </Alert>
      )}

      {/* Per-Client Communication Statistics */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Per-Client Communication Statistics
        </Typography>
        {perClientStats.length === 0 ? (
          <Alert severity="info">
            No per-client statistics available. Statistics will appear after clients complete training
            rounds.
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <strong>Client ID</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>Total Bytes</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>Rounds</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>Avg per Round</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Status</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perClientStats.map((client, index) => {
                  const isHigh = isHighCost(client.totalBytes, avgBytesPerClient);

                  return (
                    <TableRow
                      key={client.clientId || index}
                      hover
                      sx={{
                        backgroundColor: isHigh ? 'rgba(237, 108, 2, 0.08)' : 'inherit',
                      }}
                    >
                      <TableCell>{client.clientId}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: isHigh ? 600 : 400 }}>
                        {formatBytes(client.totalBytes)}
                      </TableCell>
                      <TableCell align="right">{client.rounds}</TableCell>
                      <TableCell align="right">{formatBytes(client.avgBytesPerRound)}</TableCell>
                      <TableCell>
                        {isHigh ? (
                          <Tooltip title="Communication cost is 50%+ above average">
                            <Chip
                              label="High Cost"
                              size="small"
                              color="warning"
                              icon={<WarningIcon />}
                            />
                          </Tooltip>
                        ) : (
                          <Chip label="Normal" size="small" color="success" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Average Stats Summary */}
        {perClientStats.length > 0 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  Avg Bytes per Client
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatBytes(avgBytesPerClient)}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  Total Clients
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {perClientStats.length}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  High Cost Clients
                </Typography>
                <Typography variant="body2" fontWeight={600} color={highCostClients.length > 0 ? 'warning.main' : 'inherit'}>
                  {highCostClients.length}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  Total Communication
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatBytes(perClientStats.reduce((sum, c) => sum + c.totalBytes, 0))}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
    </Stack>
  );
};

CommunicationEfficiencyMetrics.propTypes = {
  communicationMetrics: PropTypes.arrayOf(
    PropTypes.shape({
      round: PropTypes.number.isRequired,
      bytesSent: PropTypes.number,
      bytesReceived: PropTypes.number,
      overhead: PropTypes.number,
    })
  ),
  trainingMetrics: PropTypes.arrayOf(
    PropTypes.shape({
      round: PropTypes.number.isRequired,
      accuracy: PropTypes.number,
    })
  ),
  comparisonData: PropTypes.shape({
    fullModelBytes: PropTypes.number.isRequired,
    parameterEfficientBytes: PropTypes.number.isRequired,
    reduction: PropTypes.number.isRequired,
  }),
  perClientStats: PropTypes.arrayOf(
    PropTypes.shape({
      clientId: PropTypes.string.isRequired,
      totalBytes: PropTypes.number.isRequired,
      rounds: PropTypes.number.isRequired,
      avgBytesPerRound: PropTypes.number.isRequired,
    })
  ),
  quantizationData: PropTypes.shape({
    fp32Size: PropTypes.number.isRequired,
    int8Size: PropTypes.number.isRequired,
    reduction: PropTypes.number.isRequired,
  }),
};

export default memo(CommunicationEfficiencyMetrics);
