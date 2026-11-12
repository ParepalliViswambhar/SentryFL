/**
 * Formula-first aggregation visualizer. The values are deliberately synthetic
 * and labelled as such; this surface is a correctness demonstration, not live
 * experiment telemetry.
 */

import { useMemo, useState } from 'react';
import { Box, Chip, Divider, Slider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { PageHeader, Panel, StatTile } from '../components/ui';

const clamp = (value) => Math.max(1, Math.min(100, value));

const AggregationVisualizer = () => {
  const [secondSamples, setSecondSamples] = useState(30);
  const firstSamples = 10;
  const firstTheta = 1;
  const secondTheta = 3;
  const weighted = useMemo(
    () => (firstSamples * firstTheta + secondSamples * secondTheta) / (firstSamples + secondSamples),
    [secondSamples],
  );
  const incorrect = (firstTheta + secondTheta) / 2;

  return (
    <Box>
      <PageHeader
        title="Aggregation visualizer"
        subtitle="A synthetic correctness check for weighted FedAvg. No live client update is displayed here."
        icon={<AccountTreeIcon />}
      />
      <Stack spacing={3}>
        <AlertLike />
        <Panel title="Scenario controls" subtitle="Adjust the second synthetic client's sample count.">
          <Typography gutterBottom>Client B samples: {secondSamples}</Typography>
          <Slider
            aria-label="Client B samples"
            value={secondSamples}
            min={1}
            max={100}
            onChange={(_, value) => setSecondSamples(clamp(value))}
            valueLabelDisplay="auto"
          />
        </Panel>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          <StatTile label="Weighted FedAvg" value={weighted.toFixed(3)} hint="sum(nᵢ · θᵢ) / sum(nᵢ)" accent="success" />
          <StatTile label="Incorrect unweighted mean" value={incorrect.toFixed(3)} hint="included as a negative control" accent="warning" />
          <StatTile label="Difference" value={Math.abs(weighted - incorrect).toFixed(3)} hint="should change with sample imbalance" accent="info" />
        </Box>

        <Panel title="Synthetic client updates" subtitle="Ground truth is the formula below; values are not collected from a backend run.">
          <Table size="small">
            <TableHead><TableRow><TableCell>Client</TableCell><TableCell align="right">Samples nᵢ</TableCell><TableCell align="right">Synthetic θᵢ</TableCell><TableCell align="right">Weight nᵢ / N</TableCell></TableRow></TableHead>
            <TableBody>
              <TableRow><TableCell>Client A</TableCell><TableCell align="right">{firstSamples}</TableCell><TableCell align="right">{firstTheta}</TableCell><TableCell align="right">{(firstSamples / (firstSamples + secondSamples)).toFixed(3)}</TableCell></TableRow>
              <TableRow><TableCell>Client B</TableCell><TableCell align="right">{secondSamples}</TableCell><TableCell align="right">{secondTheta}</TableCell><TableCell align="right">{(secondSamples / (firstSamples + secondSamples)).toFixed(3)}</TableCell></TableRow>
            </TableBody>
          </Table>
          <Divider sx={{ my: 2 }} />
          <Typography component="code" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
            θ_next = (10 × 1 + {secondSamples} × 3) / (10 + {secondSamples}) = {weighted.toFixed(3)}
          </Typography>
        </Panel>
      </Stack>
    </Box>
  );
};

const AlertLike = () => (
  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'warning.main', color: 'warning.contrastText' }}>
    <Stack direction="row" spacing={1} alignItems="center">
      <Chip label="SYNTHETIC DEMONSTRATION" size="small" sx={{ bgcolor: 'rgba(0,0,0,.18)', color: 'inherit', fontWeight: 800 }} />
      <Typography variant="body2">This view compares a correct weighted result with an explicitly incorrect unweighted result.</Typography>
    </Stack>
  </Box>
);

export default AggregationVisualizer;
