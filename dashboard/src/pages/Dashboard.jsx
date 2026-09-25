/**
 * Dashboard (Overview)
 *
 * The mission-control landing page. Answers "is anything running?" at a glance:
 * KPI tiles, a grid of live active-run cards (progress, elapsed heartbeat, and a
 * loss sparkline that moves as rounds land) and a recent-experiments table.
 * Metrics stream in via the app-wide {@link useLiveExperiments} subscription
 * mounted in the Layout, so these cards update without this page owning a socket.
 */

import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import InsightsIcon from '@mui/icons-material/Insights';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScienceIcon from '@mui/icons-material/Science';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import {
  fetchExperiments,
  deleteExperiment,
  pauseExperiment,
  resumeExperiment,
  selectAllExperiments,
  selectActiveExperiments,
  selectExperimentsStatus,
  selectExperimentsError,
} from '../store/slices/experimentsSlice';
import { selectTrainingMetrics } from '../store/slices/metricsSlice';
import VirtualizedExperimentTable from '../components/VirtualizedExperimentTable';
import { PageHeader, Panel, StatTile, EmptyState, StatusChip, RunProgress, Sparkline } from '../components/ui';
import { progressOf, roundsOf } from '../utils/status';
import PropTypes from 'prop-types';

export const ExperimentTable = VirtualizedExperimentTable;

/**
 * A single live-run card: name + status, an "initializing / round X/Y" progress
 * bar with a ticking elapsed heartbeat, and a loss sparkline that moves as
 * rounds land — the at-a-glance proof that a run is actually working.
 */
const ActiveRunCard = ({ experiment, onOpen, onPause, onResume, onStop }) => {
  const metrics = useSelector(selectTrainingMetrics(experiment.id));
  const { current, total } = roundsOf(experiment);
  const lossData = metrics
    .map((m) => (typeof m.loss === 'number' ? m.loss : null))
    .filter((v) => v !== null);
  const latest = metrics.length ? metrics[metrics.length - 1] : null;

  return (
    <Panel
      sx={{ height: '100%' }}
      contentSx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            noWrap
            sx={{ fontWeight: 700, cursor: 'pointer' }}
            onClick={() => onOpen(experiment.id)}
          >
            {experiment.name || experiment.id}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {experiment.id}
          </Typography>
        </Box>
        <StatusChip status={experiment.status} />
      </Stack>

      <RunProgress
        status={experiment.status}
        value={progressOf(experiment)}
        current={current}
        total={total}
        start={experiment.startTime}
        end={experiment.endTime}
      />
      <Box
        sx={{
          mt: 'auto',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Loss {latest?.loss != null ? Number(latest.loss).toFixed(4) : '—'}
            {latest?.accuracy != null ? ` · acc ${Number(latest.accuracy).toFixed(3)}` : ''}
          </Typography>
          <Sparkline data={lossData} width={140} height={34} />
        </Box>
        <Stack direction="row" spacing={0.5}>
          {experiment.status === 'running' && (
            <Tooltip title="Pause">
              <IconButton size="small" aria-label="Pause" onClick={() => onPause(experiment.id)}>
                <PauseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {experiment.status === 'paused' && (
            <Tooltip title="Resume">
              <IconButton size="small" aria-label="Resume" onClick={() => onResume(experiment.id)}>
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Stop">
            <IconButton size="small" color="error" aria-label="Stop" onClick={() => onStop(experiment)}>
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open">
            <IconButton size="small" aria-label="Open" onClick={() => onOpen(experiment.id)}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Panel>
  );
};

ActiveRunCard.propTypes = {
  experiment: PropTypes.object.isRequired,
  onOpen: PropTypes.func.isRequired,
  onPause: PropTypes.func.isRequired,
  onResume: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
};

/**
 * The mission-control overview: KPI tiles, a grid of live active-run cards, and
 * a recent-experiments table. Live data flows in from the app-wide
 * {@link useLiveExperiments} subscription mounted in the Layout.
 */
const Dashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const experiments = useSelector(selectAllExperiments);
  const active = useSelector(selectActiveExperiments);
  const status = useSelector(selectExperimentsStatus);
  const error = useSelector(selectExperimentsError);
  const [pendingStop, setPendingStop] = useState(null);

  useEffect(() => {
    dispatch(fetchExperiments());
  }, [dispatch]);

  const runningCount = experiments.filter((e) => e.status === 'running').length;
  const completedCount = experiments.filter((e) => e.status === 'completed').length;
  const failedCount = experiments.filter((e) => e.status === 'failed').length;
  const recent = experiments.slice(0, 8);

  const handleOpen = (id) => navigate(`/experiments/${id}`);
  const handlePause = (id) => dispatch(pauseExperiment(id));
  const handleResume = (id) => dispatch(resumeExperiment(id));
  const confirmStop = () => {
    if (pendingStop) dispatch(deleteExperiment(pendingStop.id));
    setPendingStop(null);
  };

  return (
    <Box>
      <PageHeader
        title="Overview"
        subtitle="Live status of your federated learning runs"
        icon={<InsightsIcon />}
        actions={(
          <>
            <Tooltip title="Refresh">
              <IconButton aria-label="Refresh experiments" onClick={() => dispatch(fetchExperiments())}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button component={RouterLink} to="/experiments/new" variant="contained" startIcon={<AddIcon />}>
              New Experiment
            </Button>
          </>
        )}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {typeof error === 'string' ? error : error.message || 'Unable to load experiments.'}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          mb: 3,
        }}
      >
        <StatTile label="Experiments" value={experiments.length} icon={<ScienceIcon />} accent="primary" hint="Total tracked" />
        <StatTile label="Active" value={active.length} icon={<BoltIcon />} accent="info" hint={`${runningCount} running now`} />
        <StatTile label="Completed" value={completedCount} icon={<CheckCircleIcon />} accent="success" />
        <StatTile label="Failed" value={failedCount} icon={<StopIcon />} accent="error" />
      </Box>

      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Active runs {active.length > 0 && `· ${active.length}`}
      </Typography>
      {active.length === 0 ? (
        <Panel sx={{ mb: 3 }}>
          <EmptyState
            icon={<BoltIcon />}
            title="Nothing running right now"
            description="Start an experiment and its live progress, round counter and loss trend will appear here."
            action={(
              <Button component={RouterLink} to="/experiments/new" variant="contained" startIcon={<AddIcon />}>
                New Experiment
              </Button>
            )}
          />
        </Panel>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            mb: 3,
          }}
        >
          {active.map((exp) => (
            <ActiveRunCard
              key={exp.id}
              experiment={exp}
              onOpen={handleOpen}
              onPause={handlePause}
              onResume={handleResume}
              onStop={setPendingStop}
            />
          ))}
        </Box>
      )}
      <Panel
        title="Recent experiments"
        action={(
          <Button component={RouterLink} to="/experiments" size="small" endIcon={<OpenInNewIcon />}>
            View all
          </Button>
        )}
        contentSx={{ p: 0 }}
      >
        {status === 'loading' && experiments.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <RunProgress status="pending" />
          </Box>
        ) : recent.length ? (
          <VirtualizedExperimentTable
            experiments={recent}
            onStop={setPendingStop}
            onPause={handlePause}
            onResume={handleResume}
          />
        ) : (
          <EmptyState
            icon={<ScienceIcon />}
            title="No experiments yet"
            description="Create your first experiment to get started."
            action={(
              <Button component={RouterLink} to="/experiments/new" variant="contained" startIcon={<AddIcon />}>
                New Experiment
              </Button>
            )}
          />
        )}
      </Panel>

      <Dialog open={Boolean(pendingStop)} onClose={() => setPendingStop(null)}>
        <DialogTitle>Stop experiment?</DialogTitle>
        <DialogContent>
          Stopping <strong>{pendingStop?.name || pendingStop?.id}</strong> will end its training run.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingStop(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmStop}>
            Stop experiment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
