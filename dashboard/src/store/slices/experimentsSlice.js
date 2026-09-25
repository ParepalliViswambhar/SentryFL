/**
 * Experiments Slice
 * 
 * Manages experiment state including:
 * - List of all experiments
 * - Currently selected experiment
 * - Experiment status tracking
 * - Async actions for CRUD operations
 * 
 * @module slices/experimentsSlice
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../api/client';
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from '../../utils/status';

/**
 * Normalize a raw experiment object from the API into the camelCase shape the
 * UI components (Dashboard, VirtualizedExperimentTable) expect. The API server
 * returns snake_case fields (experiment_id, current_round, total_rounds,
 * created_at) and nests the name under config.experiment_name. This tolerates
 * already-normalized input so it is safe to apply on every code path.
 *
 * @param {Object} raw - Raw experiment object from the API
 * @returns {Object} Normalized experiment
 */
const normalizeExperiment = (raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    ...raw,
    id: raw.id ?? raw.experiment_id,
    name: raw.name ?? raw.config?.experiment_name ?? raw.experiment_name,
    status: raw.status ?? 'queued',
    currentRound: raw.currentRound ?? raw.current_round,
    totalRounds: raw.totalRounds ?? raw.total_rounds,
    progress: raw.progress,
    startTime: raw.startTime ?? raw.start_time,
    endTime: raw.endTime ?? raw.end_time,
    error: raw.error,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
};

/**
 * Extract and normalize the experiments array from a list response, which may
 * be either a bare array or the API server's `{ experiments, total, ... }`
 * envelope. Always returns an array so reducers can rely on `.filter`/`.map`.
 *
 * @param {*} data - Raw response body
 * @returns {Object[]} Normalized experiments
 */
const extractExperimentList = (data) => {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.experiments)
      ? data.experiments
      : [];
  return arr.map(normalizeExperiment);
};

const clampPercent = (value) => Math.max(0, Math.min(100, value));

/**
 * Derive a progress percentage for a status update. Prefers an explicit
 * `progress`, forces 100 on completion, otherwise computes it from the
 * round counters (falling back to whatever the target already holds).
 */
const deriveProgress = (fields, target) => {
  if (typeof fields.progress === 'number' && !Number.isNaN(fields.progress)) {
    return clampPercent(fields.progress);
  }
  if (fields.status === 'completed') return 100;
  const total = fields.totalRounds ?? target?.totalRounds;
  const current = fields.currentRound ?? target?.currentRound ?? 0;
  if (total) return clampPercent((current / total) * 100);
  return undefined;
};

/**
 * Merge a partial status update into an experiment object in place, tolerating
 * both camelCase (socket) and already-normalized (poll) shapes. Only fields
 * that are actually present overwrite existing values, so a status-only event
 * never clobbers a known round count. Shared by the WebSocket reducer and the
 * REST status-poll so both stay perfectly consistent.
 */
const mergeStatusInto = (target, fields) => {
  if (!target) return;
  if (fields.status !== undefined) target.status = fields.status;
  if (fields.currentRound !== undefined) target.currentRound = fields.currentRound;
  if (fields.totalRounds !== undefined) target.totalRounds = fields.totalRounds;
  if (fields.startTime != null) target.startTime = fields.startTime;
  if (fields.endTime != null) target.endTime = fields.endTime;
  if (fields.error !== undefined && fields.error !== null) target.error = fields.error;
  const progress = deriveProgress(fields, target);
  if (progress !== undefined) target.progress = progress;
  target.updatedAt = new Date().toISOString();
  // Client-clock stamp of the last time we heard anything about this run. Drives
  // the "updated Ns ago" / stalled indicator — see utils/status isStale.
  target.lastEventAt = Date.now();
};

/**
 * Merge a liveness heartbeat into an experiment. A heartbeat proves the run is
 * alive and refreshes the round counters and the last-seen stamp, but it must
 * never resurrect a run that has already reached a terminal state (a late beat
 * could otherwise race a just-delivered completed/failed event).
 */
const mergeHeartbeatInto = (target, fields) => {
  if (!target) return;
  if (fields.status && !TERMINAL_STATUSES.includes(target.status)) target.status = fields.status;
  if (fields.currentRound != null) target.currentRound = fields.currentRound;
  if (fields.totalRounds != null) target.totalRounds = fields.totalRounds;
  const progress = deriveProgress(
    { currentRound: fields.currentRound, totalRounds: fields.totalRounds, status: target.status },
    target
  );
  if (progress !== undefined) target.progress = progress;
  target.updatedAt = new Date().toISOString();
  target.lastEventAt = Date.now();
};

/** Apply a status update to both the list entry and `current` (when they match). */
const applyStatusUpdate = (state, fields) => {
  const { id } = fields;
  if (!id) return;
  mergeStatusInto(
    state.list.find((exp) => exp.id === id),
    fields
  );
  if (state.current && state.current.id === id) {
    mergeStatusInto(state.current, fields);
  }
};

/** Apply a liveness heartbeat to both the list entry and `current` (when they match). */
const applyHeartbeat = (state, fields) => {
  const { id } = fields;
  if (!id) return;
  mergeHeartbeatInto(
    state.list.find((exp) => exp.id === id),
    fields
  );
  if (state.current && state.current.id === id) {
    mergeHeartbeatInto(state.current, fields);
  }
};

/**
 * @typedef {Object} Experiment
 * @property {string} id - Unique experiment identifier
 * @property {string} name - Experiment name
 * @property {string} status - Current status (queued, running, paused, completed, failed)
 * @property {Object} config - Experiment configuration
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} updatedAt - ISO timestamp of last update
 * @property {number} progress - Progress percentage (0-100)
 * @property {number} currentRound - Current training round
 * @property {number} totalRounds - Total training rounds
 */

/**
 * Async thunk to fetch all experiments
 * 
 * @async
 * @function fetchExperiments
 * @returns {Promise<Experiment[]>} Array of experiments
 * @throws {Error} If API request fails
 */
export const fetchExperiments = createAsyncThunk(
  'experiments/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/experiments');
      return extractExperimentList(response.data);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to fetch single experiment by ID
 * 
 * @async
 * @function fetchExperimentById
 * @param {string} id - Experiment ID
 * @returns {Promise<Experiment>} Experiment details
 * @throws {Error} If API request fails
 */
export const fetchExperimentById = createAsyncThunk(
  'experiments/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/experiments/${id}`);
      return normalizeExperiment(response.data);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to create new experiment
 * 
 * @async
 * @function createExperiment
 * @param {Object} config - Experiment configuration
 * @returns {Promise<Experiment>} Created experiment
 * @throws {Error} If API request fails
 */
export const createExperiment = createAsyncThunk(
  'experiments/create',
  async (config, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/experiments', config);
      return normalizeExperiment(response.data);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to delete experiment
 * 
 * @async
 * @function deleteExperiment
 * @param {string} id - Experiment ID to delete
 * @returns {Promise<string>} Deleted experiment ID
 * @throws {Error} If API request fails
 */
export const deleteExperiment = createAsyncThunk(
  'experiments/delete',
  async (id, { rejectWithValue }) => {
    try {
      await apiClient.delete(`/experiments/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to pause experiment
 * 
 * @async
 * @function pauseExperiment
 * @param {string} id - Experiment ID to pause
 * @returns {Promise<Experiment>} Updated experiment
 * @throws {Error} If API request fails
 */
export const pauseExperiment = createAsyncThunk(
  'experiments/pause',
  async (id, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(`/experiments/${id}/pause`);
      return normalizeExperiment(response.data);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to resume paused experiment
 * 
 * @async
 * @function resumeExperiment
 * @param {string} id - Experiment ID to resume
 * @returns {Promise<Experiment>} Updated experiment
 * @throws {Error} If API request fails
 */
export const resumeExperiment = createAsyncThunk(
  'experiments/resume',
  async (id, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(`/experiments/${id}/resume`);
      return normalizeExperiment(response.data);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to poll a single experiment's live status.
 *
 * This is the REST fallback behind the realtime socket: it hits the Node
 * `GET /experiments/:id/status` route (which always queries the Python backend
 * fresh, bypassing the experiment cache), so progress keeps moving even if the
 * socket is slow to connect, drops, or the very first round has not landed yet.
 * `skipErrorToast` suppresses the global error toast because a just-created
 * experiment can briefly 404 before the backend registers it — a transient the
 * user should never see as a popup.
 *
 * @async
 * @function refreshExperimentStatus
 * @param {string} id - Experiment ID to poll
 * @returns {Promise<Object>} Normalized status snapshot
 */
export const refreshExperimentStatus = createAsyncThunk(
  'experiments/refreshStatus',
  async (id, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/experiments/${id}/status`, { skipErrorToast: true });
      return normalizeExperiment(response.data);
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Initial state for experiments slice
 * 
 * @typedef {Object} ExperimentsState
 * @property {Experiment[]} list - Array of all experiments
 * @property {Experiment|null} current - Currently selected experiment
 * @property {string} status - Loading status (idle, loading, succeeded, failed)
 * @property {string|null} error - Error message if operation failed
 */
const initialState = {
  list: [],
  current: null,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
};

/**
 * Experiments slice with reducers and extra reducers for async actions
 */
const experimentsSlice = createSlice({
  name: 'experiments',
  initialState,
  reducers: {
    /**
     * Set current experiment
     * 
     * @param {ExperimentsState} state - Current state
     * @param {Object} action - Action with experiment payload
     */
    setCurrentExperiment: (state, action) => {
      state.current = action.payload;
    },

    /**
     * Clear current experiment
     * 
     * @param {ExperimentsState} state - Current state
     */
    clearCurrentExperiment: (state) => {
      state.current = null;
    },

    /**
     * Merge a live status update (from the WebSocket) into the matching list
     * entry and `current`. Delegates to {@link applyStatusUpdate} so the socket
     * path and the REST status-poll share identical merge semantics — a
     * status-only event never clobbers a known round count, and progress is
     * re-derived from whatever counters are available.
     *
     * @param {ExperimentsState} state - Current state
     * @param {Object} action - Action with { id, status, progress, currentRound, ... }
     */
    updateExperimentStatus: (state, action) => {
      applyStatusUpdate(state, action.payload);
    },

    /**
     * Merge a liveness heartbeat (from the WebSocket) into the matching list
     * entry and `current`. Delegates to {@link applyHeartbeat}: a heartbeat
     * refreshes round counters and the last-seen stamp so the "live · updated
     * Ns ago" indicator stays fresh, but never revives a run that has already
     * reached a terminal state.
     *
     * @param {ExperimentsState} state - Current state
     * @param {Object} action - Action with { id, status, currentRound, totalRounds }
     */
    recordExperimentHeartbeat: (state, action) => {
      applyHeartbeat(state, action.payload);
    },

    /**
     * Clear any errors
     * 
     * @param {ExperimentsState} state - Current state
     */
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all experiments
      .addCase(fetchExperiments.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchExperiments.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Payload is always normalized to an array by the thunk; guard anyway
        // so a malformed response can never make `state.list` non-iterable.
        state.list = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchExperiments.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Fetch single experiment
      .addCase(fetchExperimentById.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchExperimentById.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.current = action.payload;
        
        // Update in list if exists
        const index = state.list.findIndex(exp => exp.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
      })
      .addCase(fetchExperimentById.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Create experiment
      .addCase(createExperiment.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(createExperiment.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list.unshift(action.payload); // Add to beginning of list
        state.current = action.payload;
      })
      .addCase(createExperiment.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Delete experiment
      .addCase(deleteExperiment.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(deleteExperiment.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = state.list.filter(exp => exp.id !== action.payload);
        if (state.current && state.current.id === action.payload) {
          state.current = null;
        }
      })
      .addCase(deleteExperiment.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Pause experiment
      .addCase(pauseExperiment.pending, (state) => {
        state.error = null;
      })
      .addCase(pauseExperiment.fulfilled, (state, action) => {
        const index = state.list.findIndex(exp => exp.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.current && state.current.id === action.payload.id) {
          state.current = action.payload;
        }
      })
      .addCase(pauseExperiment.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Resume experiment
      .addCase(resumeExperiment.pending, (state) => {
        state.error = null;
      })
      .addCase(resumeExperiment.fulfilled, (state, action) => {
        const index = state.list.findIndex(exp => exp.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.current && state.current.id === action.payload.id) {
          state.current = action.payload;
        }
      })
      .addCase(resumeExperiment.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Refresh live status (REST poll fallback behind the socket). Merges the
      // snapshot into the list entry and `current` without touching the global
      // loading flag — this fires on an interval and must never make the page
      // flicker into a loading state or surface its transient 404s as errors.
      .addCase(refreshExperimentStatus.fulfilled, (state, action) => {
        applyStatusUpdate(state, action.payload);
      });
  },
});

export const {
  setCurrentExperiment,
  clearCurrentExperiment,
  updateExperimentStatus,
  recordExperimentHeartbeat,
  clearError,
} = experimentsSlice.actions;

// Selectors
export const selectAllExperiments = (state) => state.experiments.list;
export const selectCurrentExperiment = (state) => state.experiments.current;
export const selectExperimentsStatus = (state) => state.experiments.status;
export const selectExperimentsError = (state) => state.experiments.error;
export const selectRunningExperiments = (state) =>
  state.experiments.list.filter(exp => exp.status === 'running');

/**
 * All experiments that are not finished (running, pending/queued, or paused).
 * These are the runs the live layer subscribes to and the UI keeps "warm" with
 * pulsing indicators. Broader than {@link selectRunningExperiments} on purpose:
 * a just-created experiment is 'pending' before its first round lands, and the
 * user still needs to see that it exists and is spinning up.
 */
export const selectActiveExperiments = (state) =>
  state.experiments.list.filter((exp) => ACTIVE_STATUSES.includes(exp.status));

export default experimentsSlice.reducer;
