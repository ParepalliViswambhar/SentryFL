import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Chip, Stack, Typography } from '@mui/material';
import DeviceHubRoundedIcon from '@mui/icons-material/DeviceHubRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import { fetchExperiments, selectAllExperiments } from '../store/slices/experimentsSlice';
import { fetchAllMetrics, selectCommunicationMetrics, selectTrainingMetrics } from '../store/slices/metricsSlice';
import { PageHeader, Panel, StatTile, StatusChip } from '../components/ui';

const ClientWorkspace = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const latest = experiments[0];
  const training = useSelector(selectTrainingMetrics(latest?.id));
  const communication = useSelector(selectCommunicationMetrics(latest?.id));
  const latestTraining = training[training.length - 1];
  const latestCommunication = communication[communication.length - 1];

  useEffect(() => {
    dispatch(fetchExperiments());
  }, [dispatch]);

  useEffect(() => {
    if (latest?.id) dispatch(fetchAllMetrics(latest.id));
  }, [dispatch, latest?.id]);

  const clientMetrics = latestTraining?.client_metrics || [];
  const uploaded = clientMetrics.filter((client) => client.status === 'accepted').length;

  return (
    <Box>
      <PageHeader
        title="Client workspace"
        subtitle="Train locally, upload only model updates, and track the server acknowledgement."
        icon={<DeviceHubRoundedIcon />}
        actions={latest && <StatusChip status={latest.status} />}
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatTile label="Client mode" value="SIMULATED" hint="Process-local demo client" accent="info" />
        <StatTile label="Local windows" value={clientMetrics[0]?.num_samples ?? '—'} hint="Never uploaded as raw data" accent="success" />
        <StatTile label="Updates uploaded" value={uploaded || '—'} hint="Latest completed round" accent="primary" />
        <StatTile label="Payload" value={latestCommunication?.round_upload_bytes ? `${(latestCommunication.round_upload_bytes / 1024).toFixed(1)} KiB` : '—'} hint="Serialized model updates" accent="warning" />
      </Box>

      <Stack spacing={3}>
        <Panel title="Your local training boundary" subtitle="This view is intentionally different from the administrator control plane.">
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <ShieldRoundedIcon color="success" />
              <Box>
                <Typography fontWeight={700}>Raw synthetic records stay in the client shard</Typography>
                <Typography variant="body2" color="text.secondary">The client trains locally and sends a serialized parameter update to the aggregation server.</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <CloudUploadRoundedIcon color="primary" />
              <Box>
                <Typography fontWeight={700}>Uploads are acknowledged per round</Typography>
                <Typography variant="body2" color="text.secondary">The latest run is {latest ? `${latest.name || latest.id} · ${latest.status}` : 'waiting for an assigned run'}.</Typography>
              </Box>
            </Box>
          </Stack>
        </Panel>

        <Panel title="Latest client uploads" subtitle="Only client telemetry and upload status are exposed here.">
          {clientMetrics.length === 0 ? (
            <Typography color="text.secondary">No client upload telemetry is available yet.</Typography>
          ) : (
            <Stack spacing={1}>
              {clientMetrics.map((client) => (
                <Box key={client.client_id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Box>
                    <Typography fontWeight={700}>{client.client_id}</Typography>
                    <Typography variant="caption" color="text.secondary">{client.num_samples} local windows · loss {client.loss == null ? '—' : Number(client.loss).toFixed(4)}</Typography>
                  </Box>
                  <Chip size="small" label={client.status} color={client.status === 'accepted' ? 'success' : 'warning'} />
                </Box>
              ))}
            </Stack>
          )}
        </Panel>
      </Stack>
    </Box>
  );
};

export default ClientWorkspace;
