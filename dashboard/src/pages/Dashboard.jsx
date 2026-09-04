/**
 * Dashboard Page Component
 * 
 * Main dashboard showing experiment overview and key metrics
 */

import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, Grid, Paper, Button, Stack, LinearProgress,
  Alert, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  fetchExperiments, deleteExperiment, pauseExperiment, resumeExperiment,
  selectAllExperiments, selectExperimentsStatus, selectExperimentsError,
} from '../store/slices/experimentsSlice';
import VirtualizedExperimentTable from '../components/VirtualizedExperimentTable';

export const ExperimentTable = VirtualizedExperimentTable;

const Dashboard = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const status = useSelector(selectExperimentsStatus);
  const error = useSelector(selectExperimentsError);
  const [pendingStop, setPendingStop] = useState(null);

  useEffect(() => {
    dispatch(fetchExperiments());
    const interval = setInterval(() => dispatch(fetchExperiments()), 5000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const stop = () => { dispatch(deleteExperiment(pendingStop.id)); setPendingStop(null); };
  const active = experiments.filter((experiment) => ['running', 'queued', 'paused'].includes(experiment.status));
  const completed = experiments.filter((experiment) => experiment.status === 'completed');

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}><Box><Typography variant="h4">Dashboard</Typography><Typography color="text.secondary">Experiment control center</Typography></Box><Stack direction="row" gap={1}><Tooltip title="Refresh experiments"><IconButton aria-label="Refresh experiments" onClick={() => dispatch(fetchExperiments())}><RefreshIcon /></IconButton></Tooltip><Button component={RouterLink} to="/experiments/new" variant="contained" startIcon={<AddIcon />}>New experiment</Button></Stack></Stack>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Active Experiments
            </Typography>
            <Typography variant="h3">{active.length}</Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Completed
            </Typography>
            <Typography variant="h3">{completed.length}</Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              Total Experiments
            </Typography>
            <Typography variant="h3">{experiments.length}</Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" color="text.secondary">
              System Status
            </Typography>
            <Typography variant="h3" color="success.main">●</Typography>
          </Paper>
        </Grid>
      </Grid>
      {error && <Alert severity="error" sx={{ mt: 3 }}>{typeof error === 'string' ? error : error.message || 'Unable to load experiments.'}</Alert>}
      <Paper sx={{ mt: 3, p: 2, overflowX: 'auto' }}><Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}><Typography variant="h6">Experiments</Typography><Button component={RouterLink} to="/experiments">View all</Button></Stack>{status === 'loading' && !experiments.length ? <LinearProgress /> : experiments.length ? <ExperimentTable experiments={experiments.slice(0, 8)} onStop={setPendingStop} onPause={(id) => dispatch(pauseExperiment(id))} onResume={(id) => dispatch(resumeExperiment(id))} /> : <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No experiments yet. Create one to begin training.</Typography>}</Paper>
      <Dialog open={Boolean(pendingStop)} onClose={() => setPendingStop(null)}><DialogTitle>Stop experiment?</DialogTitle><DialogContent>Stopping <strong>{pendingStop?.name || pendingStop?.id}</strong> will end its training run.</DialogContent><DialogActions><Button onClick={() => setPendingStop(null)}>Cancel</Button><Button color="error" variant="contained" onClick={stop}>Stop experiment</Button></DialogActions></Dialog>
    </Box>
  );
};

export default Dashboard;
