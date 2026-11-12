/** Privacy evaluation surface with explicit scope and evidence labels. */

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Box, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
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
  const selected = experiments.find((item) => item.id === selectedId) || experiments[0];
  const privacyMetrics = useSelector(selectPrivacyMetrics(selected?.id));
  const latest = latestOf(privacyMetrics);

  useEffect(() => {
    dispatch(fetchExperiments());
  }, [dispatch]);

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

  return (
    <Box>
      <PageHeader
        title="Privacy evaluation"
        subtitle="Formal accounting and empirical leakage evidence are shown separately."
        icon={<SecurityIcon />}
      />
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
    </Box>
  );
};

export default PrivacyEvaluation;
