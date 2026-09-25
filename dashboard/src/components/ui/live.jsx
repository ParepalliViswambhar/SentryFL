/**
 * Live-state primitives
 *
 * The pieces that make an in-flight experiment legible at a glance: a pulsing
 * status dot, a status chip, a socket-connection pill, a ticking elapsed timer,
 * and the run-progress block (round X/Y + %, with an indeterminate
 * "initializing" state before the first round lands). These are what answer the
 * user's core complaint — "when I run experiments I see nothing".
 *
 * @module components/ui/live
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { statusMeta } from '../../utils/status';

const paletteMain = (theme, color) => theme.palette[color]?.main || theme.palette.primary.main;

/** A small dot that optionally emits a pulsing halo to signal live activity. */
export function LiveDot({ color = 'primary', size = 10, pulse = true, sx }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: `${color}.main`,
        '--pulse-color': (theme) => alpha(paletteMain(theme, color), 0.5),
        animation: pulse ? 'sentryPulse 1.8s ease-out infinite' : 'none',
        ...sx,
      }}
    />
  );
}

LiveDot.propTypes = {
  color: PropTypes.string,
  size: PropTypes.number,
  pulse: PropTypes.bool,
  sx: PropTypes.object,
};

/** Status chip driven by the shared status vocabulary; pulses when live. */
export function StatusChip({ status, size = 'small', sx }) {
  const meta = statusMeta(status);
  return (
    <Chip
      size={size}
      color={meta.color === 'default' ? 'default' : meta.color}
      variant={meta.color === 'default' ? 'outlined' : 'filled'}
      icon={meta.live ? <LiveDot color={meta.color === 'default' ? 'primary' : meta.color} size={8} sx={{ ml: 1 }} /> : undefined}
      label={meta.label}
      sx={{ fontWeight: 600, ...sx }}
    />
  );
}

StatusChip.propTypes = {
  status: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium']),
  sx: PropTypes.object,
};

const CONNECTION_META = {
  connected: { color: 'success', label: 'Live', pulse: true },
  connecting: { color: 'warning', label: 'Connecting…', pulse: true },
  reconnecting: { color: 'warning', label: 'Reconnecting…', pulse: true },
  disconnected: { color: 'default', label: 'Offline', pulse: false },
  error: { color: 'error', label: 'Connection error', pulse: false },
};

/** Compact pill showing the realtime socket connection state. */
export function ConnectionPill({ status = 'disconnected', sx }) {
  const meta = CONNECTION_META[status] || CONNECTION_META.disconnected;
  const dotColor = meta.color === 'default' ? 'text.disabled' : `${meta.color}.main`;
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={0.75}
      sx={{
        px: 1,
        py: 0.375,
        borderRadius: 999,
        border: (t) => `1px solid ${t.palette.divider}`,
        bgcolor: (t) => t.sentry?.surfaceAlt,
        ...sx,
      }}
    >
      <LiveDot color={meta.color === 'default' ? 'primary' : meta.color} size={8} pulse={meta.pulse} sx={{ bgcolor: dotColor }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {meta.label}
      </Typography>
    </Stack>
  );
}

ConnectionPill.propTypes = {
  status: PropTypes.string,
  sx: PropTypes.object,
};

/** Normalize a timestamp (epoch seconds, epoch ms, or ISO string) to ms. */
const toMs = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/**
 * A live-updating elapsed timer. Ticks once a second while `running` and no
 * end time is set; otherwise shows the frozen final duration.
 */
export function ElapsedTime({ start, end, running = false, prefix = '', variant = 'body2', color = 'text.secondary', sx }) {
  const startMs = toMs(start);
  const endMs = toMs(end);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || endMs != null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, endMs]);

  if (startMs == null) return null;
  const reference = endMs != null ? endMs : now;
  return (
    <Typography variant={variant} color={color} sx={{ fontVariantNumeric: 'tabular-nums', ...sx }}>
      {prefix}
      {formatDuration(reference - startMs)}
    </Typography>
  );
}

ElapsedTime.propTypes = {
  start: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  end: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  running: PropTypes.bool,
  prefix: PropTypes.string,
  variant: PropTypes.string,
  color: PropTypes.string,
  sx: PropTypes.object,
};

/**
 * Round progress with a live "initializing" state. Before the first round
 * lands (live status, current round 0) it shows an indeterminate bar so the
 * user can see work is starting; afterwards a determinate bar with round X/Y.
 */
export function RunProgress({ status, value = 0, current = 0, total, start, end, showElapsed = true, sx }) {
  const meta = statusMeta(status);
  const barColor = meta.color === 'default' ? 'primary' : meta.color;
  const initializing = meta.live && !current;

  let leftLabel;
  if (initializing) leftLabel = 'Initializing model & data…';
  else if (total) leftLabel = `Round ${current} / ${total}`;
  else if (current) leftLabel = `Round ${current}`;
  else leftLabel = meta.label;

  return (
    <Box sx={sx}>
      <LinearProgress
        color={barColor}
        variant={initializing ? 'indeterminate' : 'determinate'}
        value={initializing ? undefined : Math.min(100, value)}
        sx={{ mb: 0.75 }}
      />
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {leftLabel}
        </Typography>
        <Stack direction="row" alignItems="center" gap={1.5}>
          {!initializing && (
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(Math.min(100, value))}%
            </Typography>
          )}
          {showElapsed && start != null && (
            <ElapsedTime start={start} end={end} running={meta.live} variant="caption" prefix="⏱ " />
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

RunProgress.propTypes = {
  status: PropTypes.string,
  value: PropTypes.number,
  current: PropTypes.number,
  total: PropTypes.number,
  start: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  end: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  showElapsed: PropTypes.bool,
  sx: PropTypes.object,
};
