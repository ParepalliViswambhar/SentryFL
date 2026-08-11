/**
 * Redux Store Integration Tests
 * 
 * Tests that Redux actions correctly update the store state
 * 
 * **Validates: Requirements 27.2, 27.5**
 * 
 * Tests:
 * - Dispatching actions updates Redux store state correctly
 * - State changes are reflected across reducers
 * - Selectors return updated values after actions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import experimentsReducer, {
  setCurrentExperiment,
  clearCurrentExperiment,
  updateExperimentStatus,
  clearError as clearExperimentsError,
} from './slices/experimentsSlice';
import metricsReducer, {
  addTrainingMetric,
  addPrivacyMetric,
  addCommunicationMetric,
  addMetricUpdate,
  clearExperimentMetrics,
  clearAllMetrics,
} from './slices/metricsSlice';
import authReducer, {
  clearError as clearAuthError,
  updateUser,
} from './slices/authSlice';

describe('Redux Store Integration - Actions Update State', () => {
  let store;

  beforeEach(() => {
    // Create a fresh store for each test
    store = configureStore({
      reducer: {
        experiments: experimentsReducer,
        metrics: metricsReducer,
        auth: authReducer,
      },
    });
  });

  describe('Experiments State Management', () => {
    it('dispatching setCurrentExperiment updates store state', () => {
      const experiment = {
        id: 'exp-123',
        name: 'Test Experiment',
        status: 'running',
        config: { dataset: 'SMD' },
        createdAt: '2024-01-01T00:00:00Z',
      };

      // Get initial state
      const initialState = store.getState().experiments;
      expect(initialState.current).toBeNull();

      // Dispatch action
      store.dispatch(setCurrentExperiment(experiment));

      // Verify state updated
      const updatedState = store.getState().experiments;
      expect(updatedState.current).toEqual(experiment);
      expect(updatedState.current.id).toBe('exp-123');
      expect(updatedState.current.name).toBe('Test Experiment');
    });

    it('dispatching clearCurrentExperiment clears current experiment', () => {
      // Set an experiment first
      const experiment = {
        id: 'exp-123',
        name: 'Test Experiment',
        status: 'running',
      };
      store.dispatch(setCurrentExperiment(experiment));
      
      // Verify it's set
      expect(store.getState().experiments.current).toEqual(experiment);

      // Clear it
      store.dispatch(clearCurrentExperiment());

      // Verify it's cleared
      expect(store.getState().experiments.current).toBeNull();
    });

    it('dispatching updateExperimentStatus updates experiment in list and current', () => {
      // Set initial state with experiment in list and as current
      const experiment = {
        id: 'exp-123',
        name: 'Test Experiment',
        status: 'queued',
        progress: 0,
        currentRound: 0,
      };

      // Manually set initial state by creating a store with preloaded state
      store = configureStore({
        reducer: {
          experiments: experimentsReducer,
          metrics: metricsReducer,
          auth: authReducer,
        },
        preloadedState: {
          experiments: {
            list: [experiment],
            current: experiment,
            status: 'idle',
            error: null,
          },
        },
      });

      // Dispatch status update
      store.dispatch(updateExperimentStatus({
        id: 'exp-123',
        status: 'running',
        progress: 50,
        currentRound: 10,
      }));

      // Verify both list and current are updated
      const state = store.getState().experiments;
      expect(state.list[0].status).toBe('running');
      expect(state.list[0].progress).toBe(50);
      expect(state.list[0].currentRound).toBe(10);
      expect(state.current.status).toBe('running');
      expect(state.current.progress).toBe(50);
      expect(state.current.currentRound).toBe(10);
    });

    it('dispatching clearError clears experiment errors', () => {
      // Create store with error
      store = configureStore({
        reducer: {
          experiments: experimentsReducer,
          metrics: metricsReducer,
          auth: authReducer,
        },
        preloadedState: {
          experiments: {
            list: [],
            current: null,
            status: 'failed',
            error: 'Failed to fetch experiments',
          },
        },
      });

      expect(store.getState().experiments.error).toBe('Failed to fetch experiments');

      // Clear error
      store.dispatch(clearExperimentsError());

      // Verify error is cleared
      expect(store.getState().experiments.error).toBeNull();
    });
  });

  describe('Metrics State Management', () => {
    it('dispatching addTrainingMetric adds metric to store', () => {
      const metric = {
        round: 1,
        loss: 0.5,
        accuracy: 0.85,
        timestamp: '2024-01-01T00:00:00Z',
      };

      // Initial state should have no metrics
      const initialState = store.getState().metrics;
      expect(initialState.training).toEqual({});

      // Dispatch action
      store.dispatch(addTrainingMetric({
        experimentId: 'exp-123',
        metric,
      }));

      // Verify metric added
      const updatedState = store.getState().metrics;
      expect(updatedState.training['exp-123']).toHaveLength(1);
      expect(updatedState.training['exp-123'][0]).toEqual(metric);
      expect(updatedState.training['exp-123'][0].loss).toBe(0.5);
      expect(updatedState.training['exp-123'][0].accuracy).toBe(0.85);
    });

    it('dispatching addPrivacyMetric adds privacy metric to store', () => {
      const metric = {
        round: 1,
        epsilon: 1.0,
        delta: 1e-5,
        miaSuccessRate: 0.52,
        timestamp: '2024-01-01T00:00:00Z',
      };

      // Dispatch action
      store.dispatch(addPrivacyMetric({
        experimentId: 'exp-123',
        metric,
      }));

      // Verify metric added
      const state = store.getState().metrics;
      expect(state.privacy['exp-123']).toHaveLength(1);
      expect(state.privacy['exp-123'][0]).toEqual(metric);
      expect(state.privacy['exp-123'][0].epsilon).toBe(1.0);
    });

    it('dispatching addCommunicationMetric adds communication metric to store', () => {
      const metric = {
        round: 1,
        bytesSent: 1024,
        bytesReceived: 2048,
        payloadSize: 512,
        timestamp: '2024-01-01T00:00:00Z',
      };

      // Dispatch action
      store.dispatch(addCommunicationMetric({
        experimentId: 'exp-123',
        metric,
      }));

      // Verify metric added
      const state = store.getState().metrics;
      expect(state.communication['exp-123']).toHaveLength(1);
      expect(state.communication['exp-123'][0]).toEqual(metric);
      expect(state.communication['exp-123'][0].bytesSent).toBe(1024);
    });

    it('dispatching addMetricUpdate adds multiple metrics at once', () => {
      const metrics = {
        training: { round: 1, loss: 0.5, accuracy: 0.85 },
        privacy: { round: 1, epsilon: 1.0, delta: 1e-5 },
        communication: { round: 1, bytesSent: 1024, bytesReceived: 2048 },
      };

      // Dispatch batch update
      store.dispatch(addMetricUpdate({
        experimentId: 'exp-123',
        metrics,
      }));

      // Verify all metrics added
      const state = store.getState().metrics;
      expect(state.training['exp-123']).toHaveLength(1);
      expect(state.privacy['exp-123']).toHaveLength(1);
      expect(state.communication['exp-123']).toHaveLength(1);
      
      expect(state.training['exp-123'][0].loss).toBe(0.5);
      expect(state.privacy['exp-123'][0].epsilon).toBe(1.0);
      expect(state.communication['exp-123'][0].bytesSent).toBe(1024);
    });

    it('dispatching multiple metrics maintains sorted order by round', () => {
      // Add metrics out of order
      store.dispatch(addTrainingMetric({
        experimentId: 'exp-123',
        metric: { round: 3, loss: 0.3 },
      }));

      store.dispatch(addTrainingMetric({
        experimentId: 'exp-123',
        metric: { round: 1, loss: 0.5 },
      }));

      store.dispatch(addTrainingMetric({
        experimentId: 'exp-123',
        metric: { round: 2, loss: 0.4 },
      }));

      // Verify metrics are sorted
      const state = store.getState().metrics;
      const rounds = state.training['exp-123'].map(m => m.round);
      expect(rounds).toEqual([1, 2, 3]);
      
      const losses = state.training['exp-123'].map(m => m.loss);
      expect(losses).toEqual([0.5, 0.4, 0.3]);
    });

    it('dispatching clearExperimentMetrics removes metrics for specific experiment', () => {
      // Add metrics for two experiments
      store.dispatch(addTrainingMetric({
        experimentId: 'exp-1',
        metric: { round: 1, loss: 0.5 },
      }));

      store.dispatch(addTrainingMetric({
        experimentId: 'exp-2',
        metric: { round: 1, loss: 0.6 },
      }));

      // Verify both exist
      let state = store.getState().metrics;
      expect(state.training['exp-1']).toBeDefined();
      expect(state.training['exp-2']).toBeDefined();

      // Clear metrics for exp-1
      store.dispatch(clearExperimentMetrics('exp-1'));

      // Verify exp-1 cleared but exp-2 remains
      state = store.getState().metrics;
      expect(state.training['exp-1']).toBeUndefined();
      expect(state.training['exp-2']).toBeDefined();
      expect(state.training['exp-2'][0].loss).toBe(0.6);
    });

    it('dispatching clearAllMetrics removes all metrics', () => {
      // Add various metrics
      store.dispatch(addTrainingMetric({
        experimentId: 'exp-1',
        metric: { round: 1, loss: 0.5 },
      }));

      store.dispatch(addPrivacyMetric({
        experimentId: 'exp-1',
        metric: { round: 1, epsilon: 1.0 },
      }));

      store.dispatch(addCommunicationMetric({
        experimentId: 'exp-1',
        metric: { round: 1, bytesSent: 1024 },
      }));

      // Verify metrics exist
      let state = store.getState().metrics;
      expect(Object.keys(state.training).length).toBeGreaterThan(0);
      expect(Object.keys(state.privacy).length).toBeGreaterThan(0);
      expect(Object.keys(state.communication).length).toBeGreaterThan(0);

      // Clear all
      store.dispatch(clearAllMetrics());

      // Verify all cleared
      state = store.getState().metrics;
      expect(state.training).toEqual({});
      expect(state.privacy).toEqual({});
      expect(state.communication).toEqual({});
      expect(state.error).toBeNull();
    });
  });

  describe('Auth State Management', () => {
    it('dispatching updateUser updates user information', () => {
      // Create store with user
      store = configureStore({
        reducer: {
          experiments: experimentsReducer,
          metrics: metricsReducer,
          auth: authReducer,
        },
        preloadedState: {
          auth: {
            token: 'test-token',
            user: {
              id: '1',
              email: 'user@example.com',
              username: 'testuser',
              role: 'user',
            },
            isAuthenticated: true,
            status: 'succeeded',
            error: null,
          },
        },
      });

      // Dispatch update
      store.dispatch(updateUser({
        username: 'updateduser',
        email: 'updated@example.com',
      }));

      // Verify user updated
      const state = store.getState().auth;
      expect(state.user.username).toBe('updateduser');
      expect(state.user.email).toBe('updated@example.com');
      expect(state.user.id).toBe('1'); // Preserved
      expect(state.user.role).toBe('user'); // Preserved
    });

    it('dispatching clearError clears auth errors', () => {
      // Create store with error
      store = configureStore({
        reducer: {
          experiments: experimentsReducer,
          metrics: metricsReducer,
          auth: authReducer,
        },
        preloadedState: {
          auth: {
            token: null,
            user: null,
            isAuthenticated: false,
            status: 'failed',
            error: 'Invalid credentials',
          },
        },
      });

      expect(store.getState().auth.error).toBe('Invalid credentials');

      // Clear error
      store.dispatch(clearAuthError());

      // Verify error cleared
      expect(store.getState().auth.error).toBeNull();
    });

    it('auth state changes are independent from experiments and metrics', () => {
      // Set up auth state
      store = configureStore({
        reducer: {
          experiments: experimentsReducer,
          metrics: metricsReducer,
          auth: authReducer,
        },
        preloadedState: {
          auth: {
            token: 'test-token',
            user: { id: '1', email: 'user@example.com' },
            isAuthenticated: true,
            status: 'succeeded',
            error: null,
          },
        },
      });

      // Dispatch experiment action
      store.dispatch(setCurrentExperiment({ id: 'exp-1', name: 'Test' }));

      // Verify auth state unchanged
      const state = store.getState();
      expect(state.auth.token).toBe('test-token');
      expect(state.auth.user.id).toBe('1');
      expect(state.experiments.current.id).toBe('exp-1');
    });
  });

  describe('Cross-Reducer State Management', () => {
    it('multiple actions from different reducers update store correctly', () => {
      // Dispatch actions from all reducers
      store.dispatch(setCurrentExperiment({
        id: 'exp-123',
        name: 'Cross-Reducer Test',
        status: 'running',
      }));

      store.dispatch(addTrainingMetric({
        experimentId: 'exp-123',
        metric: { round: 1, loss: 0.5, accuracy: 0.85 },
      }));

      // Verify all states updated independently
      const state = store.getState();
      
      expect(state.experiments.current.id).toBe('exp-123');
      expect(state.experiments.current.name).toBe('Cross-Reducer Test');
      
      expect(state.metrics.training['exp-123']).toHaveLength(1);
      expect(state.metrics.training['exp-123'][0].loss).toBe(0.5);
    });

    it('store maintains state consistency across multiple dispatches', () => {
      // Simulate real-world scenario: experiment creation and metric streaming
      
      // 1. Set current experiment
      store.dispatch(setCurrentExperiment({
        id: 'exp-456',
        name: 'Consistency Test',
        status: 'running',
        progress: 0,
        currentRound: 0,
      }));

      // 2. Add initial training metric
      store.dispatch(addTrainingMetric({
        experimentId: 'exp-456',
        metric: { round: 1, loss: 0.8, accuracy: 0.70 },
      }));

      // 3. Update experiment status
      store.dispatch(updateExperimentStatus({
        id: 'exp-456',
        status: 'running',
        progress: 10,
        currentRound: 1,
      }));

      // 4. Add more metrics
      store.dispatch(addPrivacyMetric({
        experimentId: 'exp-456',
        metric: { round: 1, epsilon: 0.5, delta: 1e-5 },
      }));

      store.dispatch(addCommunicationMetric({
        experimentId: 'exp-456',
        metric: { round: 1, bytesSent: 2048, bytesReceived: 4096 },
      }));

      // Verify complete state consistency
      const state = store.getState();
      
      // Experiment state
      expect(state.experiments.current.id).toBe('exp-456');
      expect(state.experiments.current.status).toBe('running');
      expect(state.experiments.current.progress).toBe(10);
      expect(state.experiments.current.currentRound).toBe(1);
      
      // Metrics state
      expect(state.metrics.training['exp-456']).toHaveLength(1);
      expect(state.metrics.training['exp-456'][0].loss).toBe(0.8);
      
      expect(state.metrics.privacy['exp-456']).toHaveLength(1);
      expect(state.metrics.privacy['exp-456'][0].epsilon).toBe(0.5);
      
      expect(state.metrics.communication['exp-456']).toHaveLength(1);
      expect(state.metrics.communication['exp-456'][0].bytesSent).toBe(2048);
    });
  });
});
