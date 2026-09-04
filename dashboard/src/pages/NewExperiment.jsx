/**
 * New Experiment Page Component
 * 
 * Form for creating and configuring new federated learning experiments
 */

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, TextField, MenuItem, Button, Stack, Alert, Divider, FormControlLabel, Switch } from '@mui/material';
import { createExperiment, selectExperimentsError, selectExperimentsStatus } from '../store/slices/experimentsSlice';
import apiClient from '../api/client';

const defaultConfig = { experiment: { name: '', seed: 42 }, data: { dataset: 'SMD', window_size: 100, stride: 1 }, model: { backbone: 'bert-base-uncased', hidden_dim: 768, dropout: 0.1 }, training: { num_rounds: 100, local_epochs: 5, batch_size: 32, learning_rate: 0.001 }, federated: { num_clients: 10, clients_per_round: 5, partition_strategy: 'iid', aggregation: 'fedavg' }, privacy: { enabled: true, epsilon: 1, delta: 0.00001 }, parameter_efficiency: { adms_enabled: true, selection_ratio: 0.05 } };
const update = (config, section, field, value) => ({ ...config, [section]: { ...config[section], [field]: value } });

const NewExperiment = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const status = useSelector(selectExperimentsStatus);
  const error = useSelector(selectExperimentsError);
  const [config, setConfig] = useState(defaultConfig);
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { apiClient.get('/configs').then(({ data }) => setTemplates(Array.isArray(data) ? data : data.configs || [])).catch(() => {}); }, []);
  const field = (section, name, label, type = 'number') => <TextField label={label} type={type} value={config[section][name]} onChange={(event) => setConfig(update(config, section, name, type === 'number' ? Number(event.target.value) : event.target.value))} inputProps={type === 'number' ? { min: 0, step: 'any' } : undefined} fullWidth />;
  const submit = async (event) => { event.preventDefault(); setMessage(''); if (!config.experiment.name.trim()) { setMessage('Experiment name is required.'); return; } const result = await dispatch(createExperiment(config)); if (createExperiment.fulfilled.match(result)) navigate(`/experiments/${result.payload.id}`); };
  const loadTemplate = async (event) => { const selected = templates.find((item) => (item.id || item.name) === event.target.value); if (selected) setConfig(selected.config || selected); setTemplate(event.target.value); };
  const saveTemplate = async () => { if (!config.experiment.name.trim()) { setMessage('Add an experiment name before saving a template.'); return; } await apiClient.post('/configs', config); setMessage('Configuration template saved.'); };
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Create New Experiment
      </Typography>
      <Typography color="text.secondary" mb={3}>Configure and start a federated learning training experiment</Typography>
      {(error || message) && <Alert severity={error ? 'error' : 'success'} sx={{ mb: 2 }}>{error ? (typeof error === 'string' ? error : error.message || 'Unable to create experiment.') : message}</Alert>}
      <Paper component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 3 } }}><Stack spacing={3}>
        <TextField select label="Load saved configuration" value={template} onChange={loadTemplate} helperText="Optional"><MenuItem value="">Start from defaults</MenuItem>{templates.map((item) => <MenuItem key={item.id || item.name} value={item.id || item.name}>{item.name || item.id}</MenuItem>)}</TextField>
        <Box><Typography variant="h6">Experiment</Typography><Divider sx={{ my: 1 }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Experiment name" required value={config.experiment.name} onChange={(e) => setConfig(update(config, 'experiment', 'name', e.target.value))} fullWidth />{field('experiment', 'seed', 'Random seed')}</Stack></Box>
        <Box><Typography variant="h6">Dataset and model</Typography><Divider sx={{ my: 1 }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField select label="Dataset" value={config.data.dataset} onChange={(e) => setConfig(update(config, 'data', 'dataset', e.target.value))} fullWidth><MenuItem value="SMD">SMD</MenuItem><MenuItem value="NSL-KDD">NSL-KDD</MenuItem></TextField>{field('data', 'window_size', 'Window size')}{field('data', 'stride', 'Stride')}</Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}><TextField label="Backbone" value={config.model.backbone} onChange={(e) => setConfig(update(config, 'model', 'backbone', e.target.value))} fullWidth />{field('model', 'hidden_dim', 'Hidden dimension')}{field('model', 'dropout', 'Dropout')}</Stack></Box>
        <Box><Typography variant="h6">Training and federation</Typography><Divider sx={{ my: 1 }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{field('training', 'num_rounds', 'Training rounds')}{field('training', 'local_epochs', 'Local epochs')}{field('training', 'batch_size', 'Batch size')}{field('training', 'learning_rate', 'Learning rate')}</Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}>{field('federated', 'num_clients', 'Clients')}{field('federated', 'clients_per_round', 'Clients per round')}<TextField select label="Partition strategy" value={config.federated.partition_strategy} onChange={(e) => setConfig(update(config, 'federated', 'partition_strategy', e.target.value))} fullWidth><MenuItem value="iid">IID</MenuItem><MenuItem value="non_iid">Non-IID</MenuItem></TextField><TextField select label="Aggregation" value={config.federated.aggregation} onChange={(e) => setConfig(update(config, 'federated', 'aggregation', e.target.value))} fullWidth><MenuItem value="fedavg">FedAvg</MenuItem><MenuItem value="trimmed_mean">Trimmed mean</MenuItem></TextField></Stack></Box>
        <Box><Typography variant="h6">Privacy and efficiency</Typography><Divider sx={{ my: 1 }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center"><FormControlLabel control={<Switch checked={config.privacy.enabled} onChange={(e) => setConfig(update(config, 'privacy', 'enabled', e.target.checked))} />} label="Differential privacy" />{field('privacy', 'epsilon', 'Epsilon')}{field('privacy', 'delta', 'Delta')}{field('parameter_efficiency', 'selection_ratio', 'ADMS selection ratio')}</Stack></Box>
        <Stack direction="row" justifyContent="space-between"><Button type="button" onClick={saveTemplate}>Save template</Button><Button type="submit" variant="contained" disabled={status === 'loading'}>{status === 'loading' ? 'Starting...' : 'Start experiment'}</Button></Stack>
      </Stack></Paper>
    </Box>
  );
};

export default NewExperiment;
