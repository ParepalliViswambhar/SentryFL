/**
 * Metrics Slice
 * 
 * Manages real-time metrics from WebSocket including:
 * - Training metrics (loss, accuracy per round)
 * - Privacy metrics (epsilon, delta, MIA success rate)
 * - Communication metrics (bytes transferred, payload sizes)
 * 
 * @module slices/metricsSlice
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../api/client';
import { getCacheItem, setCacheItem } from '../../utils/cacheUtils';

/**
 * @typedef {Object} TrainingMetric
 * @property {number} round - Training round number
 * @property {number} loss - Training loss
 * @property {number} accuracy - Training accuracy
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} PrivacyMetric
 * @property {number} round - Training round number
 * @property {number} epsilon - Privacy budget (epsilon)
 * @property {number} delta - Privacy parameter (delta)
 * @property {number} miaSuccessRate - Membership inference attack success rate
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} CommunicationMetric
 * @property {number} round - Training round number
 * @property {number} bytesSent - Bytes sent to server
 * @property {number} bytesReceived - Bytes received from server
 * @property {number} payloadSize - Payload size in bytes
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Async thunk to fetch training metrics for an experiment
 * 
 * @async
 * @function fetchTrainingMetrics
 * @param {string} experimentId - Experiment ID
 * @returns {Promise<TrainingMetric[]>} Array of training metrics
 * @throws {Error} If API request fails
 */
export const fetchTrainingMetrics = createAsyncThunk(
  'metrics/fetchTraining',
  async (experimentId, { rejectWithValue }) => {
    try {
      const cacheKey = `metrics_training_${experimentId}`;
      const cached = getCacheItem(cacheKey);
      if (cached !== null) return { experimentId, data: cached };
      const response = await apiClient.get(`/experiments/${experimentId}/metrics/training`);
      setCacheItem(cacheKey, response.data);
      return { experimentId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to fetch privacy metrics for an experiment
 * 
 * @async
 * @function fetchPrivacyMetrics
 * @param {string} experimentId - Experiment ID
 * @returns {Promise<PrivacyMetric[]>} Array of privacy metrics
 * @throws {Error} If API request fails
 */
export const fetchPrivacyMetrics = createAsyncThunk(
  'metrics/fetchPrivacy',
  async (experimentId, { rejectWithValue }) => {
    try {
      const cacheKey = `metrics_privacy_${experimentId}`;
      const cached = getCacheItem(cacheKey);
      if (cached !== null) return { experimentId, data: cached };
      const response = await apiClient.get(`/experiments/${experimentId}/metrics/privacy`);
      setCacheItem(cacheKey, response.data);
      return { experimentId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to fetch communication metrics for an experiment
 * 
 * @async
 * @function fetchCommunicationMetrics
 * @param {string} experimentId - Experiment ID
 * @returns {Promise<CommunicationMetric[]>} Array of communication metrics
 * @throws {Error} If API request fails
 */
export const fetchCommunicationMetrics = createAsyncThunk(
  'metrics/fetchCommunication',
  async (experimentId, { rejectWithValue }) => {
    try {
      const cacheKey = `metrics_communication_${experimentId}`;
      const cached = getCacheItem(cacheKey);
      if (cached !== null) return { experimentId, data: cached };
      const response = await apiClient.get(`/experiments/${experimentId}/metrics/communication`);
      setCacheItem(cacheKey, response.data);
      return { experimentId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to fetch all metrics for an experiment
 * 
 * @async
 * @function fetchAllMetrics
 * @param {string} experimentId - Experiment ID
 * @returns {Promise<Object>} Object with training, privacy, and communication metrics
 * @throws {Error} If API request fails
 */
export const fetchAllMetrics = createAsyncThunk(
  'metrics/fetchAll',
  async (experimentId, { rejectWithValue }) => {
    try {
      const cacheKey = `metrics_all_${experimentId}`;
      const cached = getCacheItem(cacheKey);
      if (cached !== null) return { experimentId, data: cached };
      const response = await apiClient.get(`/experiments/${experimentId}/metrics`);
      setCacheItem(cacheKey, response.data);
      return { experimentId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Initial state for metrics slice
 * 
 * @typedef {Object} MetricsState
 * @property {Object.<string, TrainingMetric[]>} training - Training metrics by experiment ID
 * @property {Object.<string, PrivacyMetric[]>} privacy - Privacy metrics by experiment ID
 * @property {Object.<string, CommunicationMetric[]>} communication - Communication metrics by experiment ID
 * @property {string} status - Loading status (idle, loading, succeeded, failed)
 * @property {string|null} error - Error message if operation failed
 */
const initialState = {
  training: {}, // { experimentId: [metrics] }
  privacy: {},   // { experimentId: [metrics] }
  communication: {}, // { experimentId: [metrics] }
  status: 'idle',
  error: null,
};

/**
 * Metrics slice with reducers for real-time updates and async actions
 */
const metricsSlice = createSlice({
  name: 'metrics',
  initialState,
  reducers: {
    /**
     * Add training metric update (typically from WebSocket)
     * 
     * @param {MetricsState} state - Current state
     * @param {Object} action - Action with experimentId and metric data
     */
    addTrainingMetric: (state, action) => {
      const { experimentId, metric } = action.payload;
      
      if (!state.training[experimentId]) {
        state.training[experimentId] = [];
      }
      
      // Add new metric, ensuring uniqueness by round
      const existingIndex = state.training[experimentId].findIndex(
        m => m.round === metric.round
      );
      
      if (existingIndex !== -1) {
        state.training[experimentId][existingIndex] = metric;
      } else {
        state.training[experimentId].push(metric);
        // Keep sorted by round
        state.training[experimentId].sort((a, b) => a.round - b.round);
      }
    },

    /**
     * Add privacy metric update (typically from WebSocket)
     * 
     * @param {MetricsState} state - Current state
     * @param {Object} action - Action with experimentId and metric data
     */
    addPrivacyMetric: (state, action) => {
      const { experimentId, metric } = action.payload;
      
      if (!state.privacy[experimentId]) {
        state.privacy[experimentId] = [];
      }
      
      // Add new metric, ensuring uniqueness by round
      const existingIndex = state.privacy[experimentId].findIndex(
        m => m.round === metric.round
      );
      
      if (existingIndex !== -1) {
        state.privacy[experimentId][existingIndex] = metric;
      } else {
        state.privacy[experimentId].push(metric);
        // Keep sorted by round
        state.privacy[experimentId].sort((a, b) => a.round - b.round);
      }
    },

    /**
     * Add communication metric update (typically from WebSocket)
     * 
     * @param {MetricsState} state - Current state
     * @param {Object} action - Action with experimentId and metric data
     */
    addCommunicationMetric: (state, action) => {
      const { experimentId, metric } = action.payload;
      
      if (!state.communication[experimentId]) {
        state.communication[experimentId] = [];
      }
      
      // Add new metric, ensuring uniqueness by round
      const existingIndex = state.communication[experimentId].findIndex(
        m => m.round === metric.round
      );
      
      if (existingIndex !== -1) {
        state.communication[experimentId][existingIndex] = metric;
      } else {
        state.communication[experimentId].push(metric);
        // Keep sorted by round
        state.communication[experimentId].sort((a, b) => a.round - b.round);
      }
    },

    /**
     * Add multiple metric updates at once (batch update)
     * 
     * @param {MetricsState} state - Current state
     * @param {Object} action - Action with experimentId and metrics object
     */
    addMetricUpdate: (state, action) => {
      const { experimentId, metrics } = action.payload;
      
      // Update training metrics if provided
      if (metrics.training) {
        if (!state.training[experimentId]) {
          state.training[experimentId] = [];
        }
        state.training[experimentId].push(metrics.training);
        state.training[experimentId].sort((a, b) => a.round - b.round);
      }
      
      // Update privacy metrics if provided
      if (metrics.privacy) {
        if (!state.privacy[experimentId]) {
          state.privacy[experimentId] = [];
        }
        state.privacy[experimentId].push(metrics.privacy);
        state.privacy[experimentId].sort((a, b) => a.round - b.round);
      }
      
      // Update communication metrics if provided
      if (metrics.communication) {
        if (!state.communication[experimentId]) {
          state.communication[experimentId] = [];
        }
        state.communication[experimentId].push(metrics.communication);
        state.communication[experimentId].sort((a, b) => a.round - b.round);
      }
    },

    /**
     * Clear metrics for specific experiment
     * 
     * @param {MetricsState} state - Current state
     * @param {Object} action - Action with experimentId
     */
    clearExperimentMetrics: (state, action) => {
      const experimentId = action.payload;
      delete state.training[experimentId];
      delete state.privacy[experimentId];
      delete state.communication[experimentId];
    },

    /**
     * Clear all metrics
     * 
     * @param {MetricsState} state - Current state
     */
    clearAllMetrics: (state) => {
      state.training = {};
      state.privacy = {};
      state.communication = {};
      state.error = null;
    },

    /**
     * Clear any errors
     * 
     * @param {MetricsState} state - Current state
     */
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch training metrics
      .addCase(fetchTrainingMetrics.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchTrainingMetrics.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const { experimentId, data } = action.payload;
        state.training[experimentId] = data;
      })
      .addCase(fetchTrainingMetrics.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Fetch privacy metrics
      .addCase(fetchPrivacyMetrics.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchPrivacyMetrics.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const { experimentId, data } = action.payload;
        state.privacy[experimentId] = data;
      })
      .addCase(fetchPrivacyMetrics.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Fetch communication metrics
      .addCase(fetchCommunicationMetrics.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchCommunicationMetrics.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const { experimentId, data } = action.payload;
        state.communication[experimentId] = data;
      })
      .addCase(fetchCommunicationMetrics.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      // Fetch all metrics
      .addCase(fetchAllMetrics.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAllMetrics.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const { experimentId, data } = action.payload;
        if (data.training) state.training[experimentId] = data.training;
        if (data.privacy) state.privacy[experimentId] = data.privacy;
        if (data.communication) state.communication[experimentId] = data.communication;
      })
      .addCase(fetchAllMetrics.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const {
  addTrainingMetric,
  addPrivacyMetric,
  addCommunicationMetric,
  addMetricUpdate,
  clearExperimentMetrics,
  clearAllMetrics,
  clearError,
} = metricsSlice.actions;

// Selectors
export const selectTrainingMetrics = (experimentId) => (state) =>
  state.metrics.training[experimentId] || [];

export const selectPrivacyMetrics = (experimentId) => (state) =>
  state.metrics.privacy[experimentId] || [];

export const selectCommunicationMetrics = (experimentId) => (state) =>
  state.metrics.communication[experimentId] || [];

export const selectLatestTrainingMetric = (experimentId) => (state) => {
  const metrics = state.metrics.training[experimentId];
  return metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;
};

export const selectLatestPrivacyMetric = (experimentId) => (state) => {
  const metrics = state.metrics.privacy[experimentId];
  return metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;
};

export const selectMetricsStatus = (state) => state.metrics.status;
export const selectMetricsError = (state) => state.metrics.error;

export default metricsSlice.reducer;
