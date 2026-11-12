/** Authorized artifact onboarding surface. */

import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { fetchExperiments, selectAllExperiments } from '../store/slices/experimentsSlice';
import apiClient from '../api/client';
import { PageHeader, Panel, StatTile } from '../components/ui';

const Artifacts = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const [selectedId, setSelectedId] = useState('');
  const [downloadState, setDownloadState] = useState({ status: 'idle', message: '' });
  const selected = experiments.find((item) => item.id === selectedId) || experiments[0];

  useEffect(() => {
    dispatch(fetchExperiments());
  }, [dispatch]);

  const download = async () => {
    if (!selected?.id) return;
    setDownloadState({ status: 'loading', message: '' });
    try {
      const response = await apiClient.get(`/experiments/${selected.id}/model`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selected.id}-global-model.pt`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadState({ status: 'success', message: 'Artifact download started.' });
    } catch (error) {
      setDownloadState({ status: 'error', message: error.response?.data?.message || 'Artifact is not available yet.' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Artifacts & client onboarding"
        subtitle="Download an authorized global model and verify compatibility locally."
        icon={<Inventory2Icon />}
      />
      <Stack spacing={3}>
        {downloadState.message && <Alert severity={downloadState.status === 'error' ? 'error' : downloadState.status === 'success' ? 'success' : 'info'}>{downloadState.message}</Alert>}
        <Panel title="Artifact selection" subtitle="Authorization is enforced by the API for the selected experiment owner or administrator.">
          <TextField select fullWidth label="Experiment" value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>
            {experiments.map((experiment) => <MenuItem key={experiment.id} value={experiment.id}>{experiment.name || experiment.id} · {experiment.status}</MenuItem>)}
          </TextField>
          <Button sx={{ mt: 2 }} variant="contained" startIcon={<DownloadIcon />} onClick={download} disabled={!selected || downloadState.status === 'loading'}>
            {downloadState.status === 'loading' ? 'Preparing…' : 'Download global model'}
          </Button>
        </Panel>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
          <StatTile label="Artifact type" value="Tensor" hint="server-provided model bundle" />
          <StatTile label="Experiment" value={selected ? 'Selected' : '—'} hint="compatibility source" accent="info" />
          <StatTile label="Checksum" value="API metadata pending" hint="verify before local load" accent="warning" />
          <StatTile label="Raw records" value="Local only" hint="never included in download" accent="success" />
        </Box>

        <Panel title="Local-only setup" subtitle="The downloaded artifact is not a substitute for an approved client protocol.">
          <Stack spacing={1.5}>
            <Typography>1. Confirm the experiment ID, dataset, model revision, and configuration match the local client.</Typography>
            <Typography>2. Verify the checksum from the authorized artifact metadata before loading.</Typography>
            <Typography>3. Load the tensor state in a trusted local environment; never execute uploaded Python.</Typography>
            <Chip label="Remote client enrollment is not implemented" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
          </Stack>
        </Panel>
      </Stack>
    </Box>
  );
};

export default Artifacts;
