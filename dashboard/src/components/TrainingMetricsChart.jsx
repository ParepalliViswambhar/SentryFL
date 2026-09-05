import { useMemo, useState, useRef, memo } from 'react';
import { Alert, Box, Button, Chip, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import ExportButton from './ExportButton';
import { exportMetricsAsCSV, exportAsJSON } from '../utils/exportUtils';
import { downsampleChartData, needsDownsampling } from '../utils/dataUtils';
import { getRealtimeChartOptions, getOptimalAnimationDuration } from '../utils/chartConfig';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin);

const COLORS = ['#0b7285', '#e67700', '#5f3dc4', '#2b8a3e', '#c2255c', '#495057'];
const chartHeight = { height: 280 };

const numeric = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const getClientLosses = (metric) => metric?.clientLosses || metric?.perClientLoss || metric?.client_loss || {};

// Base options with performance optimization (Requirement 37.10: 60 FPS animation)
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  // Animation duration optimized for 60 FPS - will be further adjusted based on data size
  animation: { duration: 150 },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'bottom' },
    tooltip: { enabled: true },
    zoom: {
      pan: { enabled: true, mode: 'x' },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
    },
  },
  scales: { x: { title: { display: true, text: 'Training round' } } },
};

const TrainingMetricsChart = ({ metrics = [], totalRounds = 0, status = 'disconnected', onReset }) => {
  const [windowSize, setWindowSize] = useState(null);
  const lossChartRef = useRef(null);
  const accuracyChartRef = useRef(null);
  const clientChartRef = useRef(null);
  
  const rounds = metrics.map((metric) => metric.round).filter(Number.isFinite);
  const visibleMetrics = windowSize ? metrics.slice(-windowSize) : metrics;
  const visibleRounds = visibleMetrics.map((metric) => metric.round);
  const lastMetric = metrics[metrics.length - 1];
  const progress = totalRounds ? Math.min(100, ((lastMetric?.round || 0) / totalRounds) * 100) : 0;

  const lossData = useMemo(() => {
    const rawData = {
      labels: visibleRounds,
      datasets: [{ label: 'Training loss', data: visibleMetrics.map((metric) => numeric(metric.loss)), borderColor: '#0b7285', backgroundColor: 'rgba(11,114,133,.12)', fill: true, tension: 0.25 }],
    };
    // Downsample if dataset is too large (Requirement 37.6)
    return needsDownsampling(rawData, 1000) ? downsampleChartData(rawData, 1000) : rawData;
  }, [visibleMetrics, visibleRounds]);

  const accuracyData = useMemo(() => {
    const rawData = {
      labels: visibleRounds,
      datasets: [{ label: 'Global accuracy', data: visibleMetrics.map((metric) => numeric(metric.accuracy)), borderColor: '#e67700', backgroundColor: 'rgba(230,119,0,.12)', fill: true, tension: 0.25 }],
    };
    // Downsample if dataset is too large (Requirement 37.6)
    return needsDownsampling(rawData, 1000) ? downsampleChartData(rawData, 1000) : rawData;
  }, [visibleMetrics, visibleRounds]);

  const clientData = useMemo(() => {
    const clientIds = [...new Set(metrics.flatMap((metric) => Object.keys(getClientLosses(metric))))];
    const rawData = {
      labels: visibleRounds,
      datasets: clientIds.map((clientId, index) => ({
        label: clientId,
        data: visibleMetrics.map((metric) => numeric(getClientLosses(metric)[clientId])),
        borderColor: COLORS[index % COLORS.length],
        tension: 0.25,
        spanGaps: true,
      })),
    };
    // Downsample if dataset is too large (Requirement 37.6)
    return needsDownsampling(rawData, 1000) ? downsampleChartData(rawData, 1000) : rawData;
  }, [metrics, visibleMetrics, visibleRounds]);

  // Optimize chart options based on data size (Requirement 37.10: maintain 60 FPS)
  const optimizedLossOptions = useMemo(() => {
    return getRealtimeChartOptions({
      ...baseOptions,
      animation: { duration: getOptimalAnimationDuration(visibleRounds.length) },
    });
  }, [visibleRounds.length]);

  const optimizedAccuracyOptions = useMemo(() => {
    return getRealtimeChartOptions({
      ...baseOptions,
      animation: { duration: getOptimalAnimationDuration(visibleRounds.length) },
      scales: { ...baseOptions.scales, y: { min: 0, max: 1 } },
    });
  }, [visibleRounds.length]);

  const optimizedClientOptions = useMemo(() => {
    return getRealtimeChartOptions({
      ...baseOptions,
      animation: { duration: getOptimalAnimationDuration(visibleRounds.length) },
    });
  }, [visibleRounds.length]);

  const divergentClients = useMemo(() => {
    const averageLoss = metrics.reduce((sum, metric) => sum + (numeric(metric.loss) || 0), 0) / (metrics.length || 1);
    const latest = getClientLosses(lastMetric);
    return Object.entries(latest).filter(([, loss]) => numeric(loss) !== null && loss > averageLoss * 2).map(([id]) => id);
  }, [metrics, lastMetric]);

  const zoom = (direction) => setWindowSize((current) => {
    const size = current || rounds.length;
    return Math.max(3, Math.min(rounds.length, direction === 'in' ? Math.ceil(size * 0.7) : Math.ceil(size / 0.7)));
  });
  const reset = () => { setWindowSize(null); onReset?.(); };

  const handleExportMetrics = (format) => {
    if (format === 'csv') {
      exportMetricsAsCSV(metrics, 'training-metrics');
    } else if (format === 'json') {
      exportAsJSON(metrics, 'training-metrics');
    }
  };

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
          <Box><Typography variant="h5">Training telemetry</Typography><Typography color="text.secondary">Live convergence from federated rounds</Typography></Box>
          <Chip label={status === 'connected' ? 'Live' : status} color={status === 'connected' ? 'success' : 'default'} />
        </Stack>
        <Box sx={{ mt: 2 }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2">Round {lastMetric?.round || 0} of {totalRounds || '—'}</Typography><Typography variant="body2">{Math.round(progress)}%</Typography></Stack><LinearProgress variant="determinate" value={progress} /></Box>
        {divergentClients.length > 0 && <Alert severity="warning" sx={{ mt: 2 }}>Divergent client loss detected: {divergentClients.join(', ')}</Alert>}
      </Paper>
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button aria-label="Zoom in" startIcon={<ZoomInIcon />} onClick={() => zoom('in')} disabled={rounds.length < 4}>Zoom in</Button>
        <Button aria-label="Zoom out" startIcon={<ZoomOutIcon />} onClick={() => zoom('out')} disabled={!windowSize}>Zoom out</Button>
        <Button aria-label="Reset chart zoom" startIcon={<RestartAltIcon />} onClick={reset} disabled={!windowSize}>Reset</Button>
        <Button onClick={() => handleExportMetrics('csv')} disabled={!metrics.length}>Export CSV</Button>
        <Button onClick={() => handleExportMetrics('json')} disabled={!metrics.length}>Export JSON</Button>
      </Stack>
      {!metrics.length ? <Alert severity="info">Waiting for the first completed training round.</Alert> : <Grid container spacing={2}>
        <Grid item xs={12} md={6}><Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">Loss by round</Typography>
            <ExportButton chartRef={lossChartRef} filename="training-loss" disabled={!metrics.length} />
          </Stack>
          <Box sx={chartHeight}><Line ref={lossChartRef} data={lossData} options={optimizedLossOptions} /></Box>
        </Paper></Grid>
        <Grid item xs={12} md={6}><Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">Global accuracy</Typography>
            <ExportButton chartRef={accuracyChartRef} filename="global-accuracy" disabled={!metrics.length} />
          </Stack>
          <Box sx={chartHeight}><Line ref={accuracyChartRef} data={accuracyData} options={optimizedAccuracyOptions} /></Box>
        </Paper></Grid>
        <Grid item xs={12}><Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">Per-client loss</Typography>
            <ExportButton chartRef={clientChartRef} filename="per-client-loss" disabled={!clientData.datasets.length} />
          </Stack>
          {clientData.datasets.length ? <Box sx={chartHeight}><Line ref={clientChartRef} data={clientData} options={optimizedClientOptions} /></Box> : <Typography color="text.secondary">Per-client loss will appear when the backend includes client loss values.</Typography>}
        </Paper></Grid>
      </Grid>}
    </Stack>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders (Requirement 37.4)
export default memo(TrainingMetricsChart);
