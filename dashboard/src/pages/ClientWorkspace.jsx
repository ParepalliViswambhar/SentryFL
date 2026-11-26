import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeviceHubRoundedIcon from '@mui/icons-material/DeviceHubRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import { fetchFederatedExperiments, selectFederatedExperiments } from '../store/slices/experimentsSlice';
import { selectCurrentUser } from '../store/slices/authSlice';
import apiClient from '../api/client';
import { PageHeader, Panel, StatTile, StatusChip } from '../components/ui';

const severityColor = (severity) => {
  if (severity === 'HIGH') return 'error';
  if (severity === 'MEDIUM') return 'warning';
  return 'success';
};

const ClientWorkspace = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector(selectCurrentUser);
  const experiments = useSelector(selectFederatedExperiments);
  const [selectedExpId, setSelectedExpId] = useState('');

  // Active experiment
  const activeExperiment = experiments.find((exp) => exp.id === selectedExpId) || experiments[0];
  const expId = activeExperiment?.id;

  const [federatedStatus, setFederatedStatus] = useState(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [clientId, setClientId] = useState(currentUser?.username || 'client_remote_1');
  const [numSamples, setNumSamples] = useState(250);
  const [uploadStatus, setUploadStatus] = useState({ state: 'idle', message: '', details: null });

  // Download state
  const [downloadStatus, setDownloadStatus] = useState({ state: 'idle', message: '' });
  const [scriptStatus, setScriptStatus] = useState({ state: 'idle', message: '' });

  // MIA Report Request state
  const [miaNote, setMiaNote] = useState('');
  const [miaRequests, setMiaRequests] = useState([]);
  const [miaReqState, setMiaReqState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (currentUser?.username) {
      setClientId(currentUser.username);
    }
  }, [currentUser?.username]);

  const loadWorkspaceData = useCallback(async () => {
    dispatch(fetchFederatedExperiments());
    if (expId) {
      try {
        const { data } = await apiClient.get(`/experiments/${expId}/federated-status`, { skipErrorToast: true });
        setFederatedStatus(data);
      } catch {
        // Non-fatal if Python runner is not initialized yet
      }
    }
    try {
      const { data } = await apiClient.get('/mia-reports', { skipErrorToast: true });
      setMiaRequests(data?.requests || []);
    } catch {
      // ignore on mount if endpoint unavailable
    }
  }, [dispatch, expId]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const trainingEntries = federatedStatus?.training || [];
  const ownClientId = currentUser?.username || clientId;
  const mySubmissions = trainingEntries.flatMap((entry) => {
    const roundNum = entry?.round ?? entry?.round_number;
    const rows = Array.isArray(entry?.data) ? entry.data : [entry];
    return rows.flatMap((rec) =>
      (rec?.client_metrics || [])
        .filter((c) => c?.client_id === ownClientId)
        .map((c) => ({ ...c, round: c.round ?? rec?.round ?? roundNum }))
    );
  });

  const commEntries = federatedStatus?.communication || [];
  const latestComm = commEntries.length ? commEntries[commEntries.length - 1] : null;
  const latestCommRecord = latestComm?.data?.[0] || latestComm || {};

  const currentRound = federatedStatus?.current_round ?? activeExperiment?.currentRound ?? 0;

  const handleDownload = async () => {
    if (!expId) return;
    setDownloadStatus({ state: 'loading', message: '' });
    try {
      const response = await apiClient.get(`/experiments/${expId}/model`, {
        responseType: 'blob',
        timeout: 180000,
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${expId}-round-${currentRound}-global-model.pt`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadStatus({
        state: 'success',
        message: `Global model (Round ${currentRound}) downloaded successfully.`,
      });
    } catch (err) {
      setDownloadStatus({
        state: 'error',
        message: err.response?.data?.message || 'Global model is still initializing or not yet ready.',
      });
    }
  };

  const handleDownloadClientScript = async () => {
    if (!expId) return;
    setScriptStatus({ state: 'loading', message: '' });
    try {
      const response = await apiClient.get(`/experiments/${expId}/client-script`, {
        responseType: 'blob',
        timeout: 30000,
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sentryfl_client_${String(expId).slice(0, 8)}.py`;
      link.click();
      URL.revokeObjectURL(url);
      setScriptStatus({
        state: 'success',
        message: 'Downloaded standalone interactive Python client script. Run it locally to load your dataset and finetune or predict.',
      });
    } catch (err) {
      setScriptStatus({
        state: 'error',
        message: err.response?.data?.message || 'Unable to download client script.',
      });
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadStatus({ state: 'idle', message: '', details: null });
    }
  };

  const handleUpload = async () => {
    if (!expId || !selectedFile) return;

    setUploadStatus({ state: 'loading', message: 'Reading and uploading model update...', details: null });

    const reader = new FileReader();
    reader.onerror = () => {
      setUploadStatus({ state: 'error', message: 'Failed to read the local model file.', details: null });
    };

    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1];
        const payload = {
          client_id: clientId.trim() || currentUser?.username || 'client_remote',
          num_samples: Math.max(1, parseInt(numSamples, 10) || 100),
          update_base64: base64Data,
          metrics: {
            loss: 0.05,
            client_id: clientId.trim() || currentUser?.username || 'client_remote',
          },
          auto_aggregate: true,
        };

        const res = await apiClient.post(`/experiments/${expId}/model/upload`, payload, { timeout: 180000 });
        setUploadStatus({
          state: 'success',
          message: `Model update accepted! Server updated global model weights to Round ${res.data?.round ?? 'next'}. New global model is now available for all clients.`,
          details: res.data,
        });

        await loadWorkspaceData();
        setSelectedFile(null);
      } catch (err) {
        setUploadStatus({
          state: 'error',
          message: err.response?.data?.message || err.response?.data?.detail || 'Failed to upload and aggregate model update.',
          details: null,
        });
      }
    };

    reader.readAsDataURL(selectedFile);
  };

  const handleRequestMia = async () => {
    if (!expId) return;
    setMiaReqState({ status: 'loading', message: '' });
    try {
      await apiClient.post('/mia-reports/request', {
        experiment_id: expId,
        note: miaNote.trim(),
      });
      setMiaNote('');
      setMiaReqState({
        status: 'success',
        message: 'MIA report request sent to administrator. You will see it below once the admin evaluates and dispatches it.',
      });
      await loadWorkspaceData();
    } catch (err) {
      setMiaReqState({
        status: 'error',
        message: err.response?.data?.message || 'Unable to submit MIA report request.',
      });
    }
  };

  const handleDownloadMiaReport = async (requestId) => {
    try {
      const response = await apiClient.get(`/mia-reports/${requestId}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mia-report-${requestId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMiaReqState({
        status: 'error',
        message: err.response?.data?.message || 'Unable to download MIA report.',
      });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Client Workspace & Federated Hub"
        subtitle="Log in, download the latest global model, run local inference or finetuning on private data, upload updates, and request MIA privacy reports."
        icon={<DeviceHubRoundedIcon />}
        actions={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={loadWorkspaceData}>
              Refresh state
            </Button>
            {activeExperiment && <StatusChip status={activeExperiment.status} />}
          </Stack>
        )}
      />

      {/* Overview Stat Tiles */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatTile label="Architecture" value="DECOUPLED" hint="Separate Client & Server Systems" accent="info" />
        <StatTile label="Private Data" value="LOCAL ONLY" hint="Zero sensitive raw records transmitted" accent="success" />
        <StatTile label="Current Global Model" value={activeExperiment ? `Round ${currentRound}` : '—'} hint="Shared across all clients" accent="primary" />
        <StatTile label="Payload Transferred" value={latestCommRecord?.round_upload_bytes ? `${(latestCommRecord.round_upload_bytes / 1024).toFixed(1)} KiB` : 'Weights only'} hint="Only model parameters uploaded" accent="warning" />
      </Box>

      <Stack spacing={3}>
        {/* Experiment Selector if multiple exist */}
        {experiments.length > 0 && (
          <Panel title="Active Global Experiment">
            <TextField
              select
              fullWidth
              size="small"
              label="Selected Experiment"
              value={expId || ''}
              onChange={(e) => setSelectedExpId(e.target.value)}
            >
              {experiments.map((exp) => (
                <MenuItem key={exp.id} value={exp.id}>
                  {exp.name || exp.id} · {exp.status} · Round {exp.currentRound ?? 0}
                </MenuItem>
              ))}
            </TextField>
          </Panel>
        )}

        {experiments.length === 0 && (
          <Alert severity="info">
            No federated experiments have been started yet. Ask the administrator to create an experiment to begin.
          </Alert>
        )}

        {/* 1. Global Model Download */}
        <Panel
          title="1. Download Latest Global Model"
          subtitle="Download the current global model artifact (.pt) to use locally for anomaly prediction OR finetune on your private dataset."
        >
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Whenever any client uploads local updates, the server aggregates them and makes the updated global weights available right here for every client.
            </Typography>

            {downloadStatus.message && (
              <Alert severity={downloadStatus.state === 'error' ? 'error' : 'success'}>
                {downloadStatus.message}
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<DownloadRoundedIcon />}
                onClick={handleDownload}
                disabled={!activeExperiment || downloadStatus.state === 'loading'}
              >
                {downloadStatus.state === 'loading' ? 'Preparing Download…' : `Download Global Model (Round ${currentRound})`}
              </Button>
              {activeExperiment && (
                <Typography variant="caption" color="text.secondary">
                  Artifact: {activeExperiment.id}-round-{currentRound}-global-model.pt
                </Typography>
              )}
            </Box>
          </Stack>
        </Panel>

        {/* 2. Use or Finetune Locally */}
        <Panel
          title="2. Use Locally OR Finetune on Private Data"
          subtitle="Choose inference-only (use the model) or local finetuning + upload on your machine without exposing raw data."
        >
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <ShieldRoundedIcon color="success" sx={{ fontSize: 28 }} />
              <Box>
                <Typography fontWeight={700}>Complete Data Privacy by Design</Typography>
                <Typography variant="body2" color="text.secondary">
                  Both local anomaly detection and local finetuning happen strictly inside your client computer.
                  Raw telemetry never leaves your environment.
                </Typography>
              </Box>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <TerminalRoundedIcon color="primary" sx={{ fontSize: 28 }} />
              <Box sx={{ width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1.5 }}>
                  <Box>
                    <Typography fontWeight={700}>
                      Client Training &amp; Inference Code (Run on your device)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Download the self-contained script pre-configured for this experiment — it prompts you to load your local CSV/NumPy dataset.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadRoundedIcon />}
                    onClick={handleDownloadClientScript}
                    disabled={!activeExperiment || scriptStatus.state === 'loading'}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {scriptStatus.state === 'loading' ? 'Generating…' : 'Download Finetuning Script (.py)'}
                  </Button>
                </Stack>
                {scriptStatus.message && (
                  <Alert severity={scriptStatus.state === 'error' ? 'error' : 'success'} sx={{ mb: 1.5 }}>
                    {scriptStatus.message}
                  </Alert>
                )}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'grey.900',
                    color: 'grey.100',
                    borderRadius: 1.5,
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    overflowX: 'auto',
                  }}
                >
                  <div># Option 0 — Interactive guided script (prompts to load your dataset &amp; choose predict/finetune):</div>
                  <div style={{ color: '#4ade80' }}>
                    python sentryfl_client_{expId ? String(expId).slice(0, 8) : '<EXP>'}.py
                  </div>
                  <br />
                  <div># Option A — Use global model directly for local anomaly detection:</div>
                  <div style={{ color: '#4ade80' }}>
                    python sentryfl_client.py predict --model {expId || '<EXP_ID>'}-global-model.pt --data private_telemetry.csv
                  </div>
                  <br />
                  <div># Option B — Finetune locally on private data and upload weights in one command:</div>
                  <div style={{ color: '#4ade80' }}>
                    python sentryfl_client.py auto --server http://localhost --username {currentUser?.username || 'client1'} --password &lt;PASSWORD&gt; --experiment {expId || '<EXP_ID>'} --data private_telemetry.csv --epochs 2
                  </div>
                </Box>
              </Box>
            </Box>
          </Stack>
        </Panel>

        {/* 3. Upload Model Update and Aggregate */}
        <Panel
          title="3. Upload Model Update & Aggregate Weights"
          subtitle="Upload your locally trained weights (.pt) to update the global model on the server."
        >
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              When you upload your model update, the server applies the federated aggregation formula:
            </Typography>

            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Federated Learning Aggregation Formulas:
              </Typography>
              <Typography variant="body2" fontFamily="monospace" sx={{ mb: 1 }}>
                • FedAvg: θ(t+1) = ∑ [ (n_k / N) * θ_k ]
              </Typography>
              <Typography variant="body2" fontFamily="monospace">
                • DP-FedAvg: Δ_k = θ_k - θ(t), clip(Δ_k, C) + Gaussian Noise, θ(t+1) = θ(t) + Δ_avg
              </Typography>
            </Box>

            {uploadStatus.message && (
              <Alert
                severity={uploadStatus.state === 'error' ? 'error' : uploadStatus.state === 'success' ? 'success' : 'info'}
              >
                {uploadStatus.message}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Client ID / Node Name"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Local Sample Count (n_k)"
                type="number"
                value={numSamples}
                onChange={(e) => setNumSamples(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                helperText="Weight factor for FedAvg formula"
              />
            </Stack>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <input
                id="model-file-input"
                type="file"
                accept=".pt,.bin,.pth"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <label htmlFor="model-file-input">
                  <Button variant="outlined" component="span" startIcon={<CloudUploadRoundedIcon />}>
                    Select Update File (.pt)
                  </Button>
                </label>
                <Typography variant="body2" color={selectedFile ? 'text.primary' : 'text.secondary'}>
                  {selectedFile ? selectedFile.name : 'No file chosen'}
                </Typography>
              </Box>

              <Button
                variant="contained"
                color="primary"
                onClick={handleUpload}
                disabled={!selectedFile || uploadStatus.state === 'loading'}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
                startIcon={uploadStatus.state === 'loading' ? <CircularProgress size={18} color="inherit" /> : <CheckCircleRoundedIcon />}
              >
                {uploadStatus.state === 'loading' ? 'Aggregating Weights…' : 'Upload & Aggregate into Global Model'}
              </Button>
            </Box>
          </Stack>
        </Panel>

        {/* 4. Request & Receive MIA Reports from Admin */}
        <Panel
          title="4. Membership Inference Attack (MIA) Privacy Reports"
          subtitle="Request an official MIA privacy leakage report from the administrator and download completed reports."
        >
          <Stack spacing={2}>
            {miaReqState.message && (
              <Alert severity={miaReqState.status === 'error' ? 'error' : 'success'}>
                {miaReqState.message}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <TextField
                label="Request Note (Optional)"
                placeholder="e.g., Requesting MIA privacy leakage evaluation after Round upload"
                value={miaNote}
                onChange={(e) => setMiaNote(e.target.value)}
                size="small"
                fullWidth
              />
              <Button
                variant="outlined"
                color="secondary"
                startIcon={miaReqState.status === 'loading' ? <CircularProgress size={16} /> : <SecurityRoundedIcon />}
                onClick={handleRequestMia}
                disabled={!expId || miaReqState.status === 'loading'}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Request MIA Report from Admin
              </Button>
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              My MIA Report Requests &amp; Received Reports
            </Typography>
            {miaRequests.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No MIA report requests submitted yet. Click &ldquo;Request MIA Report from Admin&rdquo; above to request a privacy audit.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {miaRequests.map((reqItem) => {
                  const mia = reqItem.mia_report?.mia;
                  const priv = reqItem.mia_report?.privacy;
                  return (
                    <Box
                      key={reqItem.request_id}
                      sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                        <Box>
                          <Typography fontWeight={700}>
                            Experiment {reqItem.mia_report?.experiment_name || reqItem.experiment_id}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Requested {new Date(reqItem.requested_at).toLocaleString()}
                            {reqItem.request_note ? ` · Note: "${reqItem.request_note}"` : ''}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={reqItem.status === 'sent' ? 'Sent by Admin' : reqItem.status === 'rejected' ? 'Declined' : 'Pending Admin'}
                          color={reqItem.status === 'sent' ? 'success' : reqItem.status === 'rejected' ? 'error' : 'warning'}
                        />
                      </Stack>

                      {reqItem.status === 'sent' && reqItem.mia_report && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                            <Chip size="small" label={`Round ${reqItem.mia_report.round ?? 0}`} />
                            <Chip
                              size="small"
                              label={`MIA Success Rate: ${mia?.mia_success_rate != null ? `${(mia.mia_success_rate * 100).toFixed(1)}%` : '—'}`}
                            />
                            <Chip
                              size="small"
                              label={`MIA AUC: ${mia?.mia_auc != null ? Number(mia.mia_auc).toFixed(3) : '—'}`}
                            />
                            {mia?.leakage_severity && (
                              <Chip size="small" color={severityColor(mia.leakage_severity)} label={`Leakage: ${mia.leakage_severity}`} />
                            )}
                            {priv?.current_epsilon != null && (
                              <Chip size="small" label={`ε = ${Number(priv.current_epsilon).toFixed(3)}`} />
                            )}
                          </Stack>
                          {reqItem.admin_note && (
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                              Admin ({reqItem.admin_username || 'admin'}): {reqItem.admin_note}
                            </Typography>
                          )}
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<DownloadRoundedIcon />}
                            onClick={() => handleDownloadMiaReport(reqItem.request_id)}
                          >
                            Download MIA Report (JSON)
                          </Button>
                        </Box>
                      )}

                      {reqItem.status === 'rejected' && reqItem.admin_note && (
                        <Typography variant="caption" display="block" color="error.main" sx={{ mt: 1 }}>
                          Admin response: {reqItem.admin_note}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Panel>

        {/* 5. My Submitted Updates (Strict client isolation: hides other clients' runs/metrics) */}
        <Panel title="My Submitted Updates" subtitle="Weight updates submitted by your account for this global model.">
          {mySubmissions.length === 0 ? (
            <Typography color="text.secondary">
              No updates submitted by {ownClientId} yet. Run your downloaded finetuning script or upload weights above.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {mySubmissions.map((client, idx) => (
                <Box
                  key={`${client.client_id}-${client.round ?? idx}-${idx}`}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    alignItems: 'center',
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Box>
                    <Typography fontWeight={700}>{client.client_id} · Round {client.round ?? '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {client.num_samples} local samples · loss {client.loss == null ? '—' : Number(client.loss).toFixed(4)}
                    </Typography>
                  </Box>
                  <Chip size="small" label={client.status || 'accepted'} color={client.status === 'accepted' ? 'success' : 'primary'} />
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
