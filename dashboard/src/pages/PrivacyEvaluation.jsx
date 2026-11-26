/** Privacy evaluation surface with explicit scope and evidence labels. */

import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { fetchExperiments, selectAllExperiments } from '../store/slices/experimentsSlice';
import { fetchAllMetrics, selectPrivacyMetrics } from '../store/slices/metricsSlice';
import { PrivacyBudgetGauge, MIAVisualization } from '../components/LazyCharts';
import { PageHeader, Panel, StatTile } from '../components/ui';
import apiClient from '../api/client';

const latestOf = (items) => (items.length ? items[items.length - 1] : null);
const numberOrDash = (value, digits = 4) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

const PrivacyEvaluation = () => {
  const dispatch = useDispatch();
  const experiments = useSelector(selectAllExperiments);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState(null);
  const [miaRequests, setMiaRequests] = useState([]);
  const [adminNotes, setAdminNotes] = useState({});
  const [dispatchState, setDispatchState] = useState({ loadingId: null, message: '', severity: 'info' });
  const selected = experiments.find((item) => item.id === selectedId) || experiments[0];
  const privacyMetrics = useSelector(selectPrivacyMetrics(selected?.id));
  const latest = latestOf(privacyMetrics);

  const loadMiaRequests = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/mia-reports', { skipErrorToast: true });
      setMiaRequests(data?.requests || []);
    } catch {
      // ignore if endpoint unavailable in mock unit tests
    }
  }, []);

  useEffect(() => {
    dispatch(fetchExperiments());
    loadMiaRequests();
  }, [dispatch, loadMiaRequests]);

  useEffect(() => {
    if (selected?.id) dispatch(fetchAllMetrics(selected.id));
  }, [dispatch, selected?.id]);

  useEffect(() => {
    let active = true;
    if (!selected?.id) return undefined;
    apiClient.get(`/experiments/${selected.id}/report/data`)
      .then(({ data }) => { if (active) setReport(data); })
      .catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [selected?.id]);

  const config = selected?.config || {};
  const privacyReport = report?.privacy || {};
  const mechanism = privacyReport.mechanism || config.mechanism || config.privacy_mechanism || (config.epsilon ? 'configured privacy mechanism' : 'not declared');
  const isDpFedAvg = String(mechanism).toLowerCase() === 'dp_fedavg';
  const targetEpsilon = privacyReport.target_epsilon ?? config.epsilon;
  const targetDelta = privacyReport.target_delta ?? config.delta;

  const handleSendMiaReport = async (requestId) => {
    setDispatchState({ loadingId: requestId, message: '', severity: 'info' });
    try {
      const { data } = await apiClient.post(`/mia-reports/${requestId}/send`, {
        admin_note: adminNotes[requestId] || '',
      });
      const miaRate = data?.request?.mia_report?.mia?.mia_success_rate;
      setDispatchState({
        loadingId: null,
        message: `MIA report evaluated and sent to ${data?.request?.client_username || 'client'}${
          miaRate != null ? ` (MIA success rate: ${(miaRate * 100).toFixed(1)}%)` : ''
        }.`,
        severity: 'success',
      });
      await loadMiaRequests();
    } catch (err) {
      setDispatchState({
        loadingId: null,
        message: err.response?.data?.message || 'Failed to evaluate and send MIA report.',
        severity: 'error',
      });
    }
  };

  const handleRejectMiaRequest = async (requestId) => {
    setDispatchState({ loadingId: requestId, message: '', severity: 'info' });
    try {
      await apiClient.post(`/mia-reports/${requestId}/reject`, {
        admin_note: adminNotes[requestId] || 'Declined by administrator',
      });
      setDispatchState({
        loadingId: null,
        message: 'MIA report request declined.',
        severity: 'info',
      });
      await loadMiaRequests();
    } catch (err) {
      setDispatchState({
        loadingId: null,
        message: err.response?.data?.message || 'Failed to decline MIA report request.',
        severity: 'error',
      });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Privacy evaluation"
        subtitle="Formal accounting, empirical MIA leakage evidence, and admin-to-client MIA report dispatch."
        icon={<SecurityIcon />}
        actions={(
          <Button size="small" variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={loadMiaRequests}>
            Refresh MIA requests
          </Button>
        )}
      />
      <Stack spacing={3}>
        <Panel
          title="Client MIA Report Requests (Admin Dispatch)"
          subtitle="Evaluate empirical Membership Inference Attack leakage on the current global model and send reports to requesting clients."
        >
          <Stack spacing={2}>
            {dispatchState.message && (
              <Alert severity={dispatchState.severity}>{dispatchState.message}</Alert>
            )}
            {miaRequests.length === 0 ? (
              <Typography color="text.secondary">
                No client MIA report requests have been submitted yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {miaRequests.map((reqItem) => {
                  const mia = reqItem.mia_report?.mia;
                  const loading = dispatchState.loadingId === reqItem.request_id;
                  return (
                    <Box
                      key={reqItem.request_id}
                      sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1 }}>
                        <Box>
                          <Typography fontWeight={700}>
                            Client: {reqItem.client_username} · Experiment {reqItem.experiment_id}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Requested {new Date(reqItem.requested_at).toLocaleString()}
                            {reqItem.request_note ? ` · Client note: "${reqItem.request_note}"` : ''}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={reqItem.status.toUpperCase()}
                          color={reqItem.status === 'sent' ? 'success' : reqItem.status === 'rejected' ? 'error' : 'warning'}
                        />
                      </Stack>

                      {reqItem.status === 'sent' && mia && (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                          <Chip size="small" label={`Round ${reqItem.mia_report?.round ?? 0}`} />
                          <Chip size="small" label={`MIA Rate: ${mia.mia_success_rate != null ? `${(mia.mia_success_rate * 100).toFixed(1)}%` : '—'}`} />
                          <Chip size="small" label={`MIA AUC: ${mia.mia_auc != null ? Number(mia.mia_auc).toFixed(3) : '—'}`} />
                          {mia.leakage_severity && <Chip size="small" label={`Severity: ${mia.leakage_severity}`} />}
                        </Stack>
                      )}

                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
                        <TextField
                          size="small"
                          label="Admin review note (optional)"
                          value={adminNotes[reqItem.request_id] ?? reqItem.admin_note ?? ''}
                          onChange={(e) => setAdminNotes((prev) => ({ ...prev, [reqItem.request_id]: e.target.value }))}
                          fullWidth
                        />
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
                          onClick={() => handleSendMiaReport(reqItem.request_id)}
                          disabled={loading}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {reqItem.status === 'sent' ? 'Re-evaluate & Resend' : 'Evaluate & Send MIA Report'}
                        </Button>
                        {reqItem.status === 'pending' && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleRejectMiaRequest(reqItem.request_id)}
                            disabled={loading}
                          >
                            Decline
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Panel>

      {experiments.length === 0 ? (
        <Alert severity="info">Run an experiment before reviewing privacy evidence.</Alert>
      ) : (
        <Stack spacing={3}>
          <Panel title="Evaluation target" subtitle="Choose a backend run. Missing accountant or MIA fields remain unavailable.">
            <TextField
              select
              fullWidth
              label="Experiment"
              value={selected?.id || ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {experiments.map((experiment) => (
                <MenuItem key={experiment.id} value={experiment.id}>
                  {experiment.name || experiment.id}
                </MenuItem>
              ))}
            </TextField>
          </Panel>

          <Alert severity="info" icon={<SecurityIcon />}>
            <strong>Scope:</strong>{' '}
            {isDpFedAvg
              ? 'client/silo/entity-level DP-FedAvg. This is not a record-level or natural-user guarantee for SMD/NSL-KDD.'
              : 'The selected run does not expose a verified DP-FedAvg scope in its public configuration.'}
          </Alert>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
            <StatTile label="Epsilon" value={numberOrDash(latest?.epsilon)} hint="latest backend metric" accent="primary" />
            <StatTile label="Delta" value={numberOrDash(latest?.delta, 8)} hint="latest backend metric" accent="secondary" />
            <StatTile label="Accountant" value={privacyReport.accountant || config.accountant || '—'} hint="declared configuration" accent="info" />
            <StatTile label="MIA status" value={latest?.mia_success_rate != null ? 'Measured' : '—'} hint="chance baseline is 0.50" accent="warning" />
          </Box>

          <PrivacyBudgetGauge
            privacyMetrics={privacyMetrics}
            maxEpsilon={targetEpsilon}
            maxDelta={targetDelta}
          />
          <MIAVisualization miaResults={privacyMetrics} />

          <Panel title="Limitations" subtitle="Privacy metrics do not establish deployment or record-level guarantees by themselves.">
            <Stack spacing={1}>
              {report?.evidence?.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {report.evidence.map((item) => <Chip key={item.component} label={`${item.component}: ${item.status}`} size="small" variant="outlined" />)}
                </Box>
              )}
              {(report?.limitations || []).map((item) => <Typography key={item} color="text.secondary">• {item}</Typography>)}
              <Typography color="text.secondary">• Formal accounting and MIA outcomes are separate evidence streams.</Typography>
              <Typography color="text.secondary">• Client updates and downloaded artifacts remain potentially leaky releases.</Typography>
              <Typography color="text.secondary">• Attack protocol, disjoint splits, and confidence intervals are unavailable unless the run report records them.</Typography>
              <Chip label="Evidence labels required before publication claims" variant="outlined" sx={{ alignSelf: 'flex-start', mt: 1 }} />
            </Stack>
          </Panel>
        </Stack>
      )}
      </Stack>
    </Box>
  );
};

export default PrivacyEvaluation;
