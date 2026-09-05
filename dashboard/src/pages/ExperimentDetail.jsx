/**
 * Experiment Detail Page Component
 * 
 * Detailed view of a single experiment with metrics, visualizations, and controls
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import { TrainingMetricsChart, CommunicationCostChart, CommunicationEfficiencyMetrics } from '../components/LazyCharts';
import useWebSocket from '../hooks/useWebSocket';
import { fetchAllMetrics, selectTrainingMetrics, selectCommunicationMetrics } from '../store/slices/metricsSlice';
import { fetchExperimentById, selectCurrentExperiment, selectExperimentsStatus } from '../store/slices/experimentsSlice';

const ExperimentDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const experiment = useSelector(selectCurrentExperiment);
  const trainingMetrics = useSelector(selectTrainingMetrics(id));
  const communicationMetrics = useSelector(selectCommunicationMetrics(id));
  const status = useSelector(selectExperimentsStatus);
  const socket = useWebSocket(id);

  useEffect(() => {
    dispatch(fetchExperimentById(id));
    dispatch(fetchAllMetrics(id));
  }, [dispatch, id]);
  
  if (status === 'loading' && !experiment) return <CircularProgress aria-label="Loading experiment" />;
  if (!experiment) return <Alert severity="error">Experiment {id} could not be found.</Alert>;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h4">{experiment.name || 'Experiment details'}</Typography>
          <Typography color="text.secondary">Experiment ID: {id}</Typography>
        </Box>
        <Typography color="text.secondary">Status: {experiment.status || 'queued'}</Typography>
      </Stack>
      
      <Stack spacing={3}>
        {/* Training Metrics */}
        <TrainingMetricsChart 
          metrics={trainingMetrics} 
          totalRounds={experiment.totalRounds || experiment.total_rounds} 
          status={socket.status} 
        />
        
        {/* Communication Efficiency Visualizations */}
        <CommunicationCostChart metrics={communicationMetrics} />
        
        <CommunicationEfficiencyMetrics 
          communicationMetrics={communicationMetrics}
          trainingMetrics={trainingMetrics}
        />
      </Stack>
    </Box>
  );
};

export default ExperimentDetail;
