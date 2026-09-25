/**
 * Experiment status helpers
 *
 * A single source of truth for how a status string maps to a human label, a
 * MUI colour, and whether it represents a "live" run (one worth pulsing and
 * keeping subscribed to). Every surface — sidebar counts, chips, hero badges,
 * the live activity strip — reads from here so the vocabulary stays consistent
 * with the backend runner (pending → running → completed/stopped/failed/paused).
 *
 * @module utils/status
 */

/** Statuses that mean "this experiment is not finished" — subscribe + count. */
export const ACTIVE_STATUSES = ['running', 'pending', 'queued', 'paused'];

/** Statuses that mean "this experiment is done" — no live updates expected. */
export const TERMINAL_STATUSES = ['completed', 'failed', 'stopped'];

export const isActiveStatus = (status) => ACTIVE_STATUSES.includes(status);
export const isTerminalStatus = (status) => TERMINAL_STATUSES.includes(status);

/** Live = actively working right now, so the UI pulses/animates for it. */
export const isLiveStatus = (status) =>
  status === 'running' || status === 'pending' || status === 'queued';

const capitalize = (value) =>
  typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/**
 * Static metadata per status. `color` is a MUI palette key usable by Chip,
 * Button, etc. `live` drives the pulsing indicator.
 */
export const STATUS_META = {
  running: { label: 'Running', color: 'primary', live: true },
  pending: { label: 'Queued', color: 'default', live: true },
  queued: { label: 'Queued', color: 'default', live: true },
  paused: { label: 'Paused', color: 'warning', live: false },
  completed: { label: 'Completed', color: 'success', live: false },
  failed: { label: 'Failed', color: 'error', live: false },
  stopped: { label: 'Stopped', color: 'default', live: false },
};

/** Resolve metadata for any status, tolerating unknown/missing values. */
export const statusMeta = (status) =>
  STATUS_META[status] || { label: capitalize(status) || 'Unknown', color: 'default', live: false };

const clampPercent = (value) => Math.max(0, Math.min(100, value));

/**
 * Best-effort progress percentage (0–100) for an experiment, tolerating both
 * camelCase (UI-normalized) and snake_case (raw API) shapes. Prefers an
 * explicit `progress`, else derives it from current/total rounds.
 */
export const progressOf = (experiment = {}) => {
  if (typeof experiment.progress === 'number' && !Number.isNaN(experiment.progress)) {
    return clampPercent(experiment.progress);
  }
  const total = experiment.totalRounds ?? experiment.total_rounds;
  const current = experiment.currentRound ?? experiment.current_round ?? 0;
  if (total) return clampPercent((current / total) * 100);
  return 0;
};

export const roundsOf = (experiment = {}) => ({
  current: experiment.currentRound ?? experiment.current_round ?? 0,
  total: experiment.totalRounds ?? experiment.total_rounds ?? null,
});

/**
 * A live run whose last signal (socket event or status poll) is older than this
 * is treated as possibly stalled — we've lost contact rather than seeing fresh
 * progress. Chosen well above the 5s heartbeat / 4–15s poll cadence so a single
 * missed beat never trips it.
 */
export const STALE_AFTER_MS = 30000;

/**
 * Whether a live run has gone quiet past {@link STALE_AFTER_MS}. Tolerates epoch
 * ms/seconds and ISO strings; returns false when no timestamp is known (nothing
 * to judge yet) so we never flag a just-started run as stale.
 */
export const isStale = (lastEventAt, now = Date.now()) => {
  if (lastEventAt == null) return false;
  const t = typeof lastEventAt === 'number'
    ? (lastEventAt < 1e12 ? lastEventAt * 1000 : lastEventAt)
    : Date.parse(lastEventAt);
  if (Number.isNaN(t)) return false;
  return now - t > STALE_AFTER_MS;
};
