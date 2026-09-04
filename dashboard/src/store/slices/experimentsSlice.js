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
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
      const response = await axios.get(`${API_BASE_URL}/api/experiments`);
      return response.data;
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
      const response = await axios.get(`${API_BASE_URL}/api/experiments/${id}`);
      return response.data;
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
      const response = await axios.post(`${API_BASE_URL}/api/experiments`, config);
      return response.data;
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
      await axios.delete(`${API_BASE_URL}/api/experiments/${id}`);
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
      const response = await axios.post(`${API_BASE_URL}/api/experiments/${id}/pause`);
      return response.data;
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
      const response = await axios.post(`${API_BASE_URL}/api/experiments/${id}/resume`);
      return response.data;
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
     * Update experiment status (typically from WebSocket)
     * 
     * @param {ExperimentsState} state - Current state
     * @param {Object} action - Action with id and status
     */
    updateExperimentStatus: (state, action) => {
      const { id, status, progress, currentRound } = action.payload;
      
      // Update in list
      const experimentInList = state.list.find(exp => exp.id === id);
      if (experimentInList) {
        experimentInList.status = status;
        if (progress !== undefined) experimentInList.progress = progress;
        if (currentRound !== undefined) experimentInList.currentRound = currentRound;
        experimentInList.updatedAt = new Date().toISOString();
      }

      // Update current if it matches
      if (state.current && state.current.id === id) {
        state.current.status = status;
        if (progress !== undefined) state.current.progress = progress;
        if (currentRound !== undefined) state.current.currentRound = currentRound;
        state.current.updatedAt = new Date().toISOString();
      }
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
        state.list = action.payload;
      })
      .addCase('experiments/fetchExperiments/fulfilled', (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload;
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
      .addCase(pauseExperiment.fulfilled, (state, action) => {
        const index = state.list.findIndex(exp => exp.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.current && state.current.id === action.payload.id) {
          state.current = action.payload;
        }
      })

      // Resume experiment
      .addCase(resumeExperiment.fulfilled, (state, action) => {
        const index = state.list.findIndex(exp => exp.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.current && state.current.id === action.payload.id) {
          state.current = action.payload;
        }
      });
  },
});

export const {
  setCurrentExperiment,
  clearCurrentExperiment,
  updateExperimentStatus,
  clearError,
} = experimentsSlice.actions;

// Selectors
export const selectAllExperiments = (state) => state.experiments.list;
export const selectCurrentExperiment = (state) => state.experiments.current;
export const selectExperimentsStatus = (state) => state.experiments.status;
export const selectExperimentsError = (state) => state.experiments.error;
export const selectRunningExperiments = (state) =>
  state.experiments.list.filter(exp => exp.status === 'running');

export default experimentsSlice.reducer;
