/**
 * Settings Page Component
 * 
 * Application settings and user preferences
 */

import { Box, Stack, Switch, FormControlLabel, Typography, Chip } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { PageHeader, Panel } from '../components/ui';
import { useColorMode } from '../theme/ColorModeContext';

const Settings = () => {
  const { mode, setMode } = useColorMode();
  return (
    <Box>
      <PageHeader title="Settings" subtitle="Configure application preferences and system settings" icon={<TuneIcon />} />
      <Stack spacing={3}>
        <Panel title="Appearance" subtitle="These preferences are stored locally in this browser.">
          <FormControlLabel
            control={<Switch checked={mode === 'dark'} onChange={(event) => setMode(event.target.checked ? 'dark' : 'light')} />}
            label={mode === 'dark' ? 'Dark mission-control theme' : 'Light operations theme'}
          />
        </Panel>
        <Panel title="Research display contract" subtitle="The dashboard follows the evidence rules in the product requirements.">
          <Stack spacing={1.5}>
            <Typography color="text.secondary">Live state is shown only when it comes from backend events or persisted measurements.</Typography>
            <Typography color="text.secondary">Synthetic demonstrations and unsupported capabilities are labelled in their surfaces.</Typography>
            <Typography color="text.secondary">Raw client data is never rendered or downloaded by the dashboard.</Typography>
            <Chip label="Backend source required for metrics" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
          </Stack>
        </Panel>
      </Stack>
    </Box>
  );
};

export default Settings;
