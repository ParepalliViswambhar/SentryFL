/**
 * Experiment Detail Page
 *
 * Deep-dive view of a single run: a live hero header (status, round counter,
 * progress bar with a ticking elapsed heartbeat) followed by the full chart
 * suite. Realtime data arrives through the app-wide {@link useLiveExperiments}
 * subscription mounted in the Layout, which already tracks the focused
 * experiment id parsed from the URL — so this page owns no socket of its own and
 * simply renders the Redux state those live events + the REST status-poll keep
 * fresh.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Box, CircularProgress, Stack } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import {
  TrainingMetricsChart,
  CommunicationCostChart,
  CommunicationEfficiencyMetrics,
  PrivacyBudgetGauge,
  MIAVisualization,
} from '../components/LazyCharts';
import {
  fetchAllMetrics,
  selectTrainingMetrics,
  selectCommunicationMetrics,
  selectPrivacyMetrics,
} from '../store/slices/metricsSlice';
import { fetchExperimentById, selectCurrentExperiment, selectExperimentsStatus } from '../store/slices/experimentsSlice';
import { PageHeader, Panel, StatusChip, RunProgress } from '../components/ui';
import { roundsOf, progressOf, isLiveStatus } from '../utils/status';

const ExperimentDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const experiment = useSelector(selectCurrentExperiment);
  const trainingMetrics = useSelector(selectTrainingMetrics(id));
  const communicationMetrics = useSelector(selectCommunicationMetrics(id));
  const privacyMetrics = useSelector(selectPrivacyMetrics(id));
  const status = useSelector(selectExperimentsStatus);

  useEffect(() => {
    dispatch(fetchExperimentById(id));
    dispatch(fetchAllMetrics(id));
  }, [dispatch, id]);

  if (status === 'loading' && !experiment) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress aria-label="Loading experiment" />
      </Box>
    );
  }
  if (!experiment) return <Alert severity="error">Experiment {id} could not be found.</Alert>;

  const { current, total } = roundsOf(experiment);
  const live = isLiveStatus(experiment.status);

  return (
    <Box>
      <PageHeader
        title={experiment.name || 'Experiment details'}
        subtitle={id}
        icon={<ScienceIcon />}
        actions={<StatusChip status={experiment.status} />}
      />

      {/* Live proof-of-life band: initializing / round counter / progress + elapsed heartbeat. */}
      <Panel sx={{ mb: 3 }}>
        <RunProgress
          status={experiment.status}
          value={progressOf(experiment)}
          current={current}
          total={total}
          start={experiment.startTime}
          end={experiment.endTime}
        />
      </Panel>

      <Stack spacing={3}>
        {/* Training Metrics — status drives the chart's own "Live" badge from the run state. */}
        <TrainingMetricsChart
          metrics={trainingMetrics}
          totalRounds={experiment.totalRounds || experiment.total_rounds}
          status={live ? 'connected' : experiment.status || 'idle'}
        />

        {/* Privacy Budget & Membership Inference */}
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={experiment.config?.epsilon || experiment.epsilon}
          maxDelta={experiment.config?.delta || experiment.delta}
        />

        <MIAVisualization miaResults={privacyMetrics} />

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
