import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import AutoGraphRoundedIcon from '@mui/icons-material/AutoGraphRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import {
  deleteExperiment,
  fetchExperiments,
  pauseExperiment,
  resumeExperiment,
  selectActiveExperiments,
  selectAllExperiments,
  selectExperimentsError,
  selectExperimentsStatus,
} from '../store/slices/experimentsSlice';
import { selectTrainingMetrics } from '../store/slices/metricsSlice';
import VirtualizedExperimentTable from '../components/VirtualizedExperimentTable';
import { progressOf, roundsOf } from '../utils/status';

const signalColor = {
  running: 'primary',
  paused: 'warning',
  completed: 'success',
  failed: 'error',
};

const Sparkline = ({ values }) => {
  if (!values.length) return <Box className="command-sparkline-empty">awaiting telemetry</Box>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 30 - ((value - min) / Math.max(max - min, 0.0001)) * 25;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="command-sparkline" viewBox="0 0 100 32" role="img" aria-label="loss trend">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const MetricCard = ({ label, value, detail, icon, tone }) => (
  <Box className={`command-metric command-metric-${tone}`}>
    <Box className="command-metric-icon">{icon}</Box>
    <Typography className="command-eyebrow">{label}</Typography>
    <Typography className="command-metric-value">{value}</Typography>
    <Typography className="command-metric-detail">{detail}</Typography>
  </Box>
);

const RunCard = ({ experiment, onOpen, onPause, onResume, onStop }) => {
  const metrics = useSelector(selectTrainingMetrics(experiment.id));
  const { current, total } = roundsOf(experiment);
  const latest = metrics.at(-1);
  const lossValues = metrics.map((metric) => Number(metric.loss)).filter(Number.isFinite);
  const progress = progressOf(experiment);
  const tone = signalColor[experiment.status] || 'info';

  return (
    <Box className="command-run-card">
      <Box className="command-run-heading">
        <Box sx={{ minWidth: 0 }}>
          <Typography className="command-run-name" noWrap onClick={() => onOpen(experiment.id)}>
            {experiment.name || experiment.id}
          </Typography>
          <Typography className="command-mono" noWrap>{experiment.id}</Typography>
        </Box>
        <Chip size="small" color={tone} label={experiment.status || 'pending'} className="command-status" />
      </Box>
      <Box className="command-progress-meta">
        <span>ROUND {current || 0} / {total || '—'}</span>
        <strong>{Math.round(progress)}%</strong>
      </Box>
      <LinearProgress variant="determinate" value={Math.min(progress, 100)} color={tone} />
      <Box className="command-run-footer">
        <Box>
          <Typography className="command-eyebrow">LOSS TELEMETRY</Typography>
          <Typography className="command-run-value">{latest?.loss == null ? '—' : Number(latest.loss).toFixed(4)}</Typography>
        </Box>
        <Sparkline values={lossValues} />
        <Stack direction="row" spacing={0.25}>
          {experiment.status === 'running' && (
            <IconButton size="small" aria-label="Pause" onClick={() => onPause(experiment.id)}><PauseRoundedIcon /></IconButton>
          )}
          {experiment.status === 'paused' && (
            <IconButton size="small" aria-label="Resume" onClick={() => onResume(experiment.id)}><PlayArrowRoundedIcon /></IconButton>
          )}
          <IconButton size="small" color="error" aria-label="Stop" onClick={() => onStop(experiment)}><StopRoundedIcon /></IconButton>
          <IconButton size="small" aria-label="Open" onClick={() => onOpen(experiment.id)}><ArrowOutwardRoundedIcon /></IconButton>
        </Stack>
      </Box>
    </Box>
  );
};

export default function CommandCenter() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const experiments = useSelector(selectAllExperiments);
  const active = useSelector(selectActiveExperiments);
  const status = useSelector(selectExperimentsStatus);
  const error = useSelector(selectExperimentsError);
  const [pendingStop, setPendingStop] = useState(null);

  useEffect(() => { dispatch(fetchExperiments()); }, [dispatch]);

  const summary = useMemo(() => ({
    running: experiments.filter((item) => item.status === 'running').length,
    completed: experiments.filter((item) => item.status === 'completed').length,
    failed: experiments.filter((item) => item.status === 'failed').length,
  }), [experiments]);

  const confirmStop = () => {
    if (pendingStop) dispatch(deleteExperiment(pendingStop.id));
    setPendingStop(null);
  };

  return (
    <Box className="command-page">
      <Box className="command-hero">
        <Box>
          <Typography className="command-kicker"><span className="command-live-dot" /> SYSTEM / FEDERATED CONTROL PLANE</Typography>
          <Typography component="h1" className="command-title">Mission control</Typography>
          <Typography className="command-subtitle">Live status of your federated learning runs</Typography>
          <Typography className="command-subtitle command-subtitle-detail">Model health, privacy posture, and distributed training activity.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => dispatch(fetchExperiments())}>Refresh feed</Button>
          <Button variant="contained" component={RouterLink} to="/experiments/new" startIcon={<AddRoundedIcon />}>Launch run</Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{typeof error === 'string' ? error : error.message || 'Unable to load experiments.'}</Alert>}

      <Box className="command-metrics-grid">
        <MetricCard label="Total experiments" value={experiments.length} detail="Tracked in this workspace" icon={<ScienceRoundedIcon />} tone="cyan" />
        <MetricCard label="Active now" value={active.length} detail={`${summary.running} training in real time`} icon={<BoltRoundedIcon />} tone="violet" />
        <MetricCard label="Completed" value={summary.completed} detail="Runs with final artifacts" icon={<CheckCircleRoundedIcon />} tone="green" />
        <MetricCard label="Failed / stopped" value={summary.failed} detail="Needs operator attention" icon={<ErrorOutlineRoundedIcon />} tone="red" />
      </Box>

      <Box className="command-section-heading">
        <Box>
          <Typography className="command-section-title">Active runs</Typography>
          <Typography className="command-section-copy">Round progress and loss telemetry arrive through the shared realtime channel.</Typography>
        </Box>
        <Button component={RouterLink} to="/monitor" endIcon={<ArrowOutwardRoundedIcon />}>Open monitor</Button>
      </Box>

      {active.length ? (
        <Box className="command-runs-grid">
          {active.map((experiment) => (
            <RunCard key={experiment.id} experiment={experiment} onOpen={(id) => navigate(`/experiments/${id}`)} onPause={(id) => dispatch(pauseExperiment(id))} onResume={(id) => dispatch(resumeExperiment(id))} onStop={setPendingStop} />
          ))}
        </Box>
      ) : (
        <Box className="command-empty">
          <AutoGraphRoundedIcon />
          <Typography variant="h6">No live runs in the queue</Typography>
          <Typography>Launch an experiment to see federated rounds appear here.</Typography>
          <Button variant="contained" component={RouterLink} to="/experiments/new" startIcon={<AddRoundedIcon />}>Create experiment</Button>
        </Box>
      )}

      <Box className="command-section-heading command-recent-heading">
        <Box>
          <Typography className="command-section-title">Recent activity</Typography>
          <Typography className="command-section-copy">The latest experiment records and their operational state.</Typography>
        </Box>
        <Button component={RouterLink} to="/privacy" startIcon={<ShieldRoundedIcon />}>Privacy posture</Button>
      </Box>
      <Box className="command-table-shell">
        {status === 'loading' && !experiments.length ? <LinearProgress /> : <VirtualizedExperimentTable experiments={experiments.slice(0, 8)} onStop={setPendingStop} onPause={(id) => dispatch(pauseExperiment(id))} onResume={(id) => dispatch(resumeExperiment(id))} />}
      </Box>

      <Dialog open={Boolean(pendingStop)} onClose={() => setPendingStop(null)}>
        <DialogTitle>Stop experiment?</DialogTitle>
        <DialogContent>Stopping <strong>{pendingStop?.name || pendingStop?.id}</strong> will end its training run.</DialogContent>
        <DialogActions><Button onClick={() => setPendingStop(null)}>Cancel</Button><Button color="error" variant="contained" onClick={confirmStop}>Stop experiment</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
