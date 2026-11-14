/**
 * Federated monitor: a backend-sourced operational view of one run.
 * Missing values stay visibly unavailable; this page never invents progress or
 * resource measurements.
 */

import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import { fetchExperiments, selectAllExperiments } from '../store/slices/experimentsSlice';
import { fetchAllMetrics, selectCommunicationMetrics, selectTrainingMetrics, selectPrivacyMetrics } from '../store/slices/metricsSlice';
import { PageHeader, Panel, StatTile, StatusChip, RunProgress } from '../components/ui';
import { isStale, progressOf, roundsOf } from '../utils/status';

const valueOrDash = (value, formatter = (item) => item) =>
  value === undefined || value === null || Number.isNaN(value) ? '—' : formatter(value);

const Monitor = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const [selectedId, setSelectedId] = useState('');
  const selected = experiments.find((item) => item.id === selectedId) || experiments[0];
  const training = useSelector(selectTrainingMetrics(selected?.id));
  const communication = useSelector(selectCommunicationMetrics(selected?.id));
  const privacy = useSelector(selectPrivacyMetrics(selected?.id));

  useEffect(() => {
    dispatch(fetchExperiments());
  }, [dispatch]);

  useEffect(() => {
    if (selected?.id) dispatch(fetchAllMetrics(selected.id));
  }, [dispatch, selected?.id]);

  const latestCommunication = communication[communication.length - 1];
  const { current, total } = roundsOf(selected || {});
  const stale = selected && !['completed', 'failed', 'stopped'].includes(selected.status)
    ? isStale(selected.lastEventAt)
    : false;
  const participants = latestCommunication?.num_clients ?? latestCommunication?.participating_clients;
  const payload = latestCommunication?.round_upload_bytes ?? latestCommunication?.bytes_transferred;
  const rejected = typeof latestCommunication?.rejected_updates === 'object'
    ? Object.keys(latestCommunication.rejected_updates || {}).length
    : latestCommunication?.rejected_updates;
  const accepted = latestCommunication?.accepted_updates ?? participants;
  const activity = useMemo(() => training.slice(-8).reverse(), [training]);
  const latestTraining = training[training.length - 1];
  const clientMetrics = latestTraining?.client_metrics || [];
  const latestPrivacy = privacy[privacy.length - 1];

  return (
    <Box>
      <PageHeader
        title="Federated monitor"
        subtitle="Observe backend state, round participation, payloads, and resource signals."
        icon={<MonitorHeartIcon />}
        actions={selected && <StatusChip status={selected.status} />}
      />

      {experiments.length === 0 ? (
        <Alert severity="info">No experiments are available to monitor yet.</Alert>
      ) : (
        <Stack spacing={3}>
          <Panel title="Run focus" subtitle="Select a run to inspect its persisted round events.">
            <TextField
              select
              fullWidth
              label="Experiment"
              value={selected?.id || ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {experiments.map((experiment) => (
                <MenuItem key={experiment.id} value={experiment.id}>
                  {experiment.name || experiment.id} · {experiment.status}
                </MenuItem>
              ))}
            </TextField>
            {selected && (
              <Box sx={{ mt: 3 }}>
                <RunProgress
                  status={selected.status}
                  value={progressOf(selected)}
                  current={current}
                  total={total}
                  start={selected.startTime}
                  end={selected.endTime}
                />
                {stale && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    No backend event has been observed recently. The displayed state may be stale.
                  </Alert>
                )}
              </Box>
            )}
          </Panel>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
            <StatTile label="Round" value={valueOrDash(current)} hint={total ? `of ${total}` : 'target unavailable'} />
            <StatTile label="Accepted updates" value={valueOrDash(accepted)} hint="latest persisted event" accent="success" />
            <StatTile label="Rejected updates" value={valueOrDash(rejected)} hint="latest persisted event" accent="warning" />
            <StatTile label="Upload payload" value={valueOrDash(payload, (item) => `${(item / 1024).toFixed(1)} KiB`)} hint="serialized bytes when reported" accent="info" />
          </Box>

          <Panel title="Client upload ledger" subtitle="Local training results and serialized updates from the latest round.">
            {clientMetrics.length === 0 ? (
              <Typography color="text.secondary">No client upload telemetry has arrived yet.</Typography>
            ) : (
              <Stack spacing={1}>
                {clientMetrics.map((client) => (
                  <Box key={client.client_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{client.client_id}</Typography>
                      <Typography variant="caption" color="text.secondary">{client.num_samples} local windows · {client.status}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Chip size="small" label={`loss ${valueOrDash(client.loss, (item) => Number(item).toFixed(4))}`} />
                      <Chip size="small" label={`${valueOrDash(client.upload_bytes, (item) => `${(item / 1024).toFixed(1)} KiB`)} uploaded`} />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Panel>

          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' } }}>
            <Panel title="Recent round activity" subtitle="Only rounds returned by the backend are shown.">
              {activity.length === 0 ? (
                <Typography color="text.secondary">No round events have been recorded for this run.</Typography>
              ) : (
                <Stack spacing={1}>
                  {activity.map((metric) => (
                    <Box
                      key={`${metric.round}-${metric.timestamp || ''}`}
                      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight={700}>Round {valueOrDash(metric.round)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {metric.timestamp ? new Date(metric.timestamp).toLocaleString() : 'timestamp unavailable'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Chip size="small" label={`loss ${valueOrDash(metric.loss, (item) => Number(item).toFixed(4))}`} />
                        <Chip size="small" label={`accuracy ${valueOrDash(metric.accuracy, (item) => Number(item).toFixed(3))}`} />
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Panel>

            <Panel title="Operational truth" subtitle="Provenance labels for this surface.">
              <Stack spacing={2}>
                <Box>
                  <Typography variant="overline" color="text.secondary">Data source</Typography>
                  <Typography>{selected?.data_source || selected?.config?.data_source || 'Backend run state'}</Typography>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">Federation mode</Typography>
                  <Typography>{selected?.config?.client_data_mode === 'disjoint' ? 'Process-local, disjoint client shards' : 'Process-local, redundant synthetic client shards'}</Typography>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">Live MIA</Typography>
                  <Typography>{latestPrivacy?.mia_success_rate == null ? 'Awaiting attack telemetry' : `${(latestPrivacy.mia_success_rate * 100).toFixed(1)}% threshold-attack accuracy`}</Typography>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">Resource telemetry</Typography>
                  <Typography color={latestCommunication?.memory_mb != null ? 'text.primary' : 'text.secondary'}>
                    {latestCommunication?.memory_mb != null ? 'Reported by backend' : 'Not reported by this run'}
                  </Typography>
                </Box>
              </Stack>
            </Panel>
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default Monitor;
