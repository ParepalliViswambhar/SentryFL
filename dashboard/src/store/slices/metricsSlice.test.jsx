/**
 * Metrics Slice Tests
 * 
 * Tests for metrics slice reducers and actions
 */

import { describe, it, expect } from 'vitest';
import metricsReducer, {
  addTrainingMetric,
  addPrivacyMetric,
  addCommunicationMetric,
  addMetricUpdate,
  clearExperimentMetrics,
  clearAllMetrics,
  clearError,
  selectTrainingMetrics,
  selectPrivacyMetrics,
  selectCommunicationMetrics,
  selectLatestTrainingMetric,
  selectLatestPrivacyMetric,
} from './metricsSlice';

describe('metricsSlice', () => {
  const initialState = {
    training: {},
    privacy: {},
    communication: {},
    status: 'idle',
    error: null,
  };

  describe('reducers', () => {
    it('should return initial state', () => {
      expect(metricsReducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });

    it('should handle addTrainingMetric - add new metric', () => {
      const metric = {
        round: 1,
        loss: 0.5,
        accuracy: 0.85,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const actual = metricsReducer(
        initialState,
        addTrainingMetric({ experimentId: 'exp-1', metric })
      );

      expect(actual.training['exp-1']).toHaveLength(1);
      expect(actual.training['exp-1'][0]).toEqual(metric);
    });

    it('should handle addTrainingMetric - update existing metric', () => {
      const stateWithMetrics = {
        ...initialState,
        training: {
          'exp-1': [
            { round: 1, loss: 0.5, accuracy: 0.85 },
            { round: 2, loss: 0.4, accuracy: 0.87 },
          ],
        },
      };

      const updatedMetric = {
        round: 1,
        loss: 0.45,
        accuracy: 0.86,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const actual = metricsReducer(
        stateWithMetrics,
        addTrainingMetric({ experimentId: 'exp-1', metric: updatedMetric })
      );

      expect(actual.training['exp-1']).toHaveLength(2);
      expect(actual.training['exp-1'][0]).toEqual(updatedMetric);
    });

    it('should handle addPrivacyMetric', () => {
      const metric = {
        round: 1,
        epsilon: 0.5,
        delta: 1e-5,
        miaSuccessRate: 0.52,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const actual = metricsReducer(
        initialState,
        addPrivacyMetric({ experimentId: 'exp-1', metric })
      );

      expect(actual.privacy['exp-1']).toHaveLength(1);
      expect(actual.privacy['exp-1'][0]).toEqual(metric);
    });

    it('should handle addCommunicationMetric', () => {
      const metric = {
        round: 1,
        bytesSent: 1024,
        bytesReceived: 2048,
        payloadSize: 512,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const actual = metricsReducer(
        initialState,
        addCommunicationMetric({ experimentId: 'exp-1', metric })
      );

      expect(actual.communication['exp-1']).toHaveLength(1);
      expect(actual.communication['exp-1'][0]).toEqual(metric);
    });

    it('should handle addMetricUpdate - batch update', () => {
      const metrics = {
        training: { round: 1, loss: 0.5, accuracy: 0.85 },
        privacy: { round: 1, epsilon: 0.5, delta: 1e-5 },
        communication: { round: 1, bytesSent: 1024, bytesReceived: 2048 },
      };

      const actual = metricsReducer(
        initialState,
        addMetricUpdate({ experimentId: 'exp-1', metrics })
      );

      expect(actual.training['exp-1']).toHaveLength(1);
      expect(actual.privacy['exp-1']).toHaveLength(1);
      expect(actual.communication['exp-1']).toHaveLength(1);
    });

    it('should handle clearExperimentMetrics', () => {
      const stateWithMetrics = {
        ...initialState,
        training: { 'exp-1': [{ round: 1 }], 'exp-2': [{ round: 1 }] },
        privacy: { 'exp-1': [{ round: 1 }], 'exp-2': [{ round: 1 }] },
        communication: { 'exp-1': [{ round: 1 }], 'exp-2': [{ round: 1 }] },
      };

      const actual = metricsReducer(stateWithMetrics, clearExperimentMetrics('exp-1'));

      expect(actual.training['exp-1']).toBeUndefined();
      expect(actual.privacy['exp-1']).toBeUndefined();
      expect(actual.communication['exp-1']).toBeUndefined();
      expect(actual.training['exp-2']).toBeDefined();
      expect(actual.privacy['exp-2']).toBeDefined();
      expect(actual.communication['exp-2']).toBeDefined();
    });

    it('should handle clearAllMetrics', () => {
      const stateWithMetrics = {
        ...initialState,
        training: { 'exp-1': [{ round: 1 }] },
        privacy: { 'exp-1': [{ round: 1 }] },
        communication: { 'exp-1': [{ round: 1 }] },
        error: 'Some error',
      };

      const actual = metricsReducer(stateWithMetrics, clearAllMetrics());

      expect(actual.training).toEqual({});
      expect(actual.privacy).toEqual({});
      expect(actual.communication).toEqual({});
      expect(actual.error).toBeNull();
    });

    it('should handle clearError', () => {
      const stateWithError = {
        ...initialState,
        error: 'Something went wrong',
      };

      const actual = metricsReducer(stateWithError, clearError());
      expect(actual.error).toBeNull();
    });

    it('should keep metrics sorted by round number', () => {
      let state = initialState;

      // Add metrics out of order
      state = metricsReducer(
        state,
        addTrainingMetric({ experimentId: 'exp-1', metric: { round: 3, loss: 0.3 } })
      );
      state = metricsReducer(
        state,
        addTrainingMetric({ experimentId: 'exp-1', metric: { round: 1, loss: 0.5 } })
      );
      state = metricsReducer(
        state,
        addTrainingMetric({ experimentId: 'exp-1', metric: { round: 2, loss: 0.4 } })
      );

      const rounds = state.training['exp-1'].map(m => m.round);
      expect(rounds).toEqual([1, 2, 3]);
    });
  });

  describe('selectors', () => {
    const mockState = {
      metrics: {
        training: {
          'exp-1': [
            { round: 1, loss: 0.5 },
            { round: 2, loss: 0.4 },
          ],
        },
        privacy: {
          'exp-1': [
            { round: 1, epsilon: 0.5 },
            { round: 2, epsilon: 1.0 },
          ],
        },
        communication: {
          'exp-1': [
            { round: 1, bytesSent: 1024 },
            { round: 2, bytesSent: 2048 },
          ],
        },
        status: 'succeeded',
        error: null,
      },
    };

    it('should select training metrics for experiment', () => {
      const metrics = selectTrainingMetrics('exp-1')(mockState);
      expect(metrics).toHaveLength(2);
      expect(metrics[0].round).toBe(1);
    });

    it('should select privacy metrics for experiment', () => {
      const metrics = selectPrivacyMetrics('exp-1')(mockState);
      expect(metrics).toHaveLength(2);
      expect(metrics[0].round).toBe(1);
    });

    it('should select communication metrics for experiment', () => {
      const metrics = selectCommunicationMetrics('exp-1')(mockState);
      expect(metrics).toHaveLength(2);
      expect(metrics[0].round).toBe(1);
    });

    it('should select latest training metric', () => {
      const metric = selectLatestTrainingMetric('exp-1')(mockState);
      expect(metric.round).toBe(2);
      expect(metric.loss).toBe(0.4);
    });

    it('should select latest privacy metric', () => {
      const metric = selectLatestPrivacyMetric('exp-1')(mockState);
      expect(metric.round).toBe(2);
      expect(metric.epsilon).toBe(1.0);
    });

    it('should return empty array for non-existent experiment', () => {
      const metrics = selectTrainingMetrics('exp-999')(mockState);
      expect(metrics).toEqual([]);
    });

    it('should return null for latest metric when no metrics exist', () => {
      const metric = selectLatestTrainingMetric('exp-999')(mockState);
      expect(metric).toBeNull();
    });
  });
});
