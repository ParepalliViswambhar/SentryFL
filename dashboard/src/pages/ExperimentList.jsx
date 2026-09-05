/**
 * Experiment List Page Component
 * 
 * Lists all experiments with status, progress, and control actions
 */

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Typography, Paper, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack } from '@mui/material';
import { deleteExperiment, fetchExperiments, pauseExperiment, resumeExperiment, selectAllExperiments, selectExperimentsError, selectExperimentsStatus } from '../store/slices/experimentsSlice';
import VirtualizedExperimentTable from '../components/VirtualizedExperimentTable';

const ExperimentList = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const error = useSelector(selectExperimentsError);
  const status = useSelector(selectExperimentsStatus);
  const [pendingStop, setPendingStop] = useState(null);
  useEffect(() => { dispatch(fetchExperiments()); }, [dispatch]);
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Experiments
      </Typography>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}><Typography color="text.secondary">{experiments.length} experiment{experiments.length === 1 ? '' : 's'}</Typography><Button href="/experiments/new" variant="contained">New experiment</Button></Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{typeof error === 'string' ? error : error.message || 'Unable to load experiments.'}</Alert>}
      <Paper sx={{ p: 2, overflowX: 'auto' }}>{status === 'loading' && !experiments.length ? <Typography sx={{ p: 3 }}>Loading experiments...</Typography> : experiments.length ? <VirtualizedExperimentTable experiments={experiments} onStop={setPendingStop} onPause={(id) => dispatch(pauseExperiment(id))} onResume={(id) => dispatch(resumeExperiment(id))} /> : <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>No experiments found.</Typography>}</Paper>
      <Dialog open={Boolean(pendingStop)} onClose={() => setPendingStop(null)}><DialogTitle>Stop experiment?</DialogTitle><DialogContent>Stopping <strong>{pendingStop?.name || pendingStop?.id}</strong> will end its training run.</DialogContent><DialogActions><Button onClick={() => setPendingStop(null)}>Cancel</Button><Button color="error" variant="contained" onClick={() => { dispatch(deleteExperiment(pendingStop.id)); setPendingStop(null); }}>Stop experiment</Button></DialogActions></Dialog>
    </Box>
  );
};

export default ExperimentList;
