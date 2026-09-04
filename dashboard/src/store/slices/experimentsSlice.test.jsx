/**
 * Experiments Slice Tests
 * 
 * Tests for experiments slice reducers and actions
 */

import { describe, it, expect } from 'vitest';
import experimentsReducer, {
  setCurrentExperiment,
  clearCurrentExperiment,
  updateExperimentStatus,
  clearError,
  selectAllExperiments,
  selectCurrentExperiment,
  selectRunningExperiments,
  selectExperimentsStatus,
  selectExperimentsError,
} from './experimentsSlice';

describe('experimentsSlice', () => {
  const initialState = {
    list: [],
    current: null,
    status: 'idle',
    error: null,
  };

  describe('reducers', () => {
    it('should return initial state', () => {
      expect(experimentsReducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });

    it('should handle setCurrentExperiment', () => {
      const experiment = {
        id: 'exp-1',
        name: 'Test Experiment',
        status: 'running',
        config: {},
      };

      const actual = experimentsReducer(initialState, setCurrentExperiment(experiment));
      expect(actual.current).toEqual(experiment);
    });

    it('should handle clearCurrentExperiment', () => {
      const stateWithCurrent = {
        ...initialState,
        current: { id: 'exp-1', name: 'Test' },
      };

      const actual = experimentsReducer(stateWithCurrent, clearCurrentExperiment());
      expect(actual.current).toBeNull();
    });

    it('should handle updateExperimentStatus - update in list', () => {
      const stateWithExperiments = {
        ...initialState,
        list: [
          { id: 'exp-1', status: 'queued', progress: 0, currentRound: 0 },
          { id: 'exp-2', status: 'running', progress: 50, currentRound: 10 },
        ],
      };

      const update = {
        id: 'exp-1',
        status: 'running',
        progress: 25,
        currentRound: 5,
      };

      const actual = experimentsReducer(stateWithExperiments, updateExperimentStatus(update));
      
      expect(actual.list[0].status).toBe('running');
      expect(actual.list[0].progress).toBe(25);
      expect(actual.list[0].currentRound).toBe(5);
      expect(actual.list[0].updatedAt).toBeDefined();
    });

    it('should handle updateExperimentStatus - update current experiment', () => {
      const stateWithCurrent = {
        ...initialState,
        current: { id: 'exp-1', status: 'queued', progress: 0, currentRound: 0 },
        list: [{ id: 'exp-1', status: 'queued', progress: 0, currentRound: 0 }],
      };

      const update = {
        id: 'exp-1',
        status: 'completed',
        progress: 100,
        currentRound: 20,
      };

      const actual = experimentsReducer(stateWithCurrent, updateExperimentStatus(update));
      
      expect(actual.current.status).toBe('completed');
      expect(actual.current.progress).toBe(100);
      expect(actual.current.currentRound).toBe(20);
      expect(actual.list[0].status).toBe('completed');
    });

    it('should handle clearError', () => {
      const stateWithError = {
        ...initialState,
        error: 'Something went wrong',
      };

      const actual = experimentsReducer(stateWithError, clearError());
      expect(actual.error).toBeNull();
    });
  });

  describe('selectors', () => {
    const mockState = {
      experiments: {
        list: [
          { id: '1', name: 'Exp 1', status: 'completed' },
          { id: '2', name: 'Exp 2', status: 'running' },
          { id: '3', name: 'Exp 3', status: 'running' },
        ],
        current: { id: '2', name: 'Exp 2', status: 'running' },
        status: 'succeeded',
        error: null,
      },
    };

    it('should select all experiments', () => {
      expect(selectAllExperiments(mockState)).toEqual(mockState.experiments.list);
    });

    it('should select current experiment', () => {
      expect(selectCurrentExperiment(mockState)).toEqual(mockState.experiments.current);
    });

    it('should select running experiments', () => {
      const running = selectRunningExperiments(mockState);
      expect(running).toHaveLength(2);
      expect(running.every(exp => exp.status === 'running')).toBe(true);
    });

    it('should select status', () => {
      expect(selectExperimentsStatus(mockState)).toBe('succeeded');
    });

    it('should select error', () => {
      expect(selectExperimentsError(mockState)).toBeNull();
    });
  });
});
