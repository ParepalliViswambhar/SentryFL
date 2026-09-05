/**
 * Unit Tests for Privacy Budget Monitor Middleware
 * 
 * Tests Requirements: 40.6, 40.9, 40.10
 * - Display warning notifications when privacy budget is low
 * - Automatically dismiss success notifications after 5 seconds
 * - Persist error notifications until manually dismissed
 * 
 * @module middleware/privacyBudgetMonitor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import privacyBudgetMonitor, {
  clearWarningHistory,
  clearAllWarningHistory,
} from './privacyBudgetMonitor';
import notificationsReducer, {
  addPrivacyBudgetWarning,
} from '../slices/notificationsSlice';
import metricsReducer, { addPrivacyMetric } from '../slices/metricsSlice';
import experimentsReducer from '../slices/experimentsSlice';

describe('Privacy Budget Monitor Middleware', () => {
  let store;

  beforeEach(() => {
    // Clear warning history before each test
    clearAllWarningHistory();

    // Create a fresh store with the middleware
    store = configureStore({
      reducer: {
        experiments: experimentsReducer,
        metrics: metricsReducer,
        notifications: notificationsReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(privacyBudgetMonitor),
    });

    // Add a mock experiment to the store
    store.dispatch({
      type: 'experiments/fetchExperiments/fulfilled',
      payload: [
        {
          id: 'exp-001',
          name: 'Test Experiment',
          status: 'running',
          config: {
            privacy: {
              epsilon: 10.0,
              delta: 1e-5,
            },
          },
        },
      ],
    });
  });

  /**
   * Test: Privacy budget warning at 70% threshold
   * Validates Requirement 40.6 - Display warning notifications when privacy budget is low
   */
  it('should trigger warning notification at 70% threshold', () => {
    // Dispatch privacy metric at 70% utilization (7.0 of 10.0)
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 10,
          epsilon: 7.0,
          delta: 1e-5,
        },
      })
    );

    // Check that notification was added
    const state = store.getState();
    const notifications = state.notifications.notifications;

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('warning');
    expect(notifications[0].message).toContain('Privacy budget low');
    expect(notifications[0].message).toContain('exp-001');
    expect(notifications[0].autoDismiss).toBe(false); // Warning should not auto-dismiss
  });

  /**
   * Test: Privacy budget warning at 90% threshold
   * Validates Requirement 40.6 - Display warning notifications when privacy budget is low
   */
  it('should trigger critical warning notification at 90% threshold', () => {
    // Dispatch privacy metric at 90% utilization (9.0 of 10.0)
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 15,
          epsilon: 9.0,
          delta: 1e-5,
        },
      })
    );

    // Check that notification was added
    const state = store.getState();
    const notifications = state.notifications.notifications;

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('warning');
    expect(notifications[0].message).toContain('Privacy budget low');
    expect(notifications[0].autoDismiss).toBe(false);
  });

  /**
   * Test: No warning below 70% threshold
   */
  it('should NOT trigger warning below 70% threshold', () => {
    // Dispatch privacy metric at 50% utilization (5.0 of 10.0)
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 5,
          epsilon: 5.0,
          delta: 1e-5,
        },
      })
    );

    // Check that no notification was added
    const state = store.getState();
    const notifications = state.notifications.notifications;

    expect(notifications).toHaveLength(0);
  });

  /**
   * Test: No duplicate warnings for same threshold
   * Validates Requirement 40.10 - Persist error notifications until manually dismissed
   */
  it('should not trigger duplicate warnings at same threshold', () => {
    // Dispatch first metric at 75%
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 10,
          epsilon: 7.5,
          delta: 1e-5,
        },
      })
    );

    // Dispatch second metric at 80% (still in 70-90% range)
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 11,
          epsilon: 8.0,
          delta: 1e-5,
        },
      })
    );

    // Should only have one notification
    const state = store.getState();
    const notifications = state.notifications.notifications;

    expect(notifications).toHaveLength(1);
  });

  /**
   * Test: Escalate from 70% warning to 90% warning
   */
  it('should escalate from 70% warning to 90% warning', () => {
    // First dispatch at 75% (triggers 70% warning)
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 10,
          epsilon: 7.5,
          delta: 1e-5,
        },
      })
    );

    let state = store.getState();
    expect(state.notifications.notifications).toHaveLength(1);

    // Then dispatch at 92% (triggers 90% warning)
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: {
          round: 15,
          epsilon: 9.2,
          delta: 1e-5,
        },
      })
    );

    state = store.getState();
    expect(state.notifications.notifications).toHaveLength(2);
  });

  /**
   * Test: Different experiments have independent warning tracking
   */
  it('should track warnings independently for different experiments', () => {
    // Add second experiment
    store.dispatch({
      type: 'experiments/fetchExperiments/fulfilled',
      payload: [
        {
          id: 'exp-001',
          name: 'Experiment 1',
          status: 'running',
          config: { privacy: { epsilon: 10.0 } },
        },
        {
          id: 'exp-002',
          name: 'Experiment 2',
          status: 'running',
          config: { privacy: { epsilon: 5.0 } },
        },
      ],
    });

    // Trigger warning for exp-001
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: { round: 5, epsilon: 7.5, delta: 1e-5 },
      })
    );

    // Trigger warning for exp-002
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-002',
        metric: { round: 3, epsilon: 3.6, delta: 1e-5 },
      })
    );

    // Should have two separate warnings
    const state = store.getState();
    const notifications = state.notifications.notifications;

    expect(notifications).toHaveLength(2);
    expect(notifications[0].message).toContain('exp-001');
    expect(notifications[1].message).toContain('exp-002');
  });

  /**
   * Test: Use default max epsilon when not configured
   */
  it('should use default max epsilon when experiment config is missing', () => {
    // Add experiment without privacy config
    store.dispatch({
      type: 'experiments/fetchExperiments/fulfilled',
      payload: [
        {
          id: 'exp-003',
          name: 'No Config Experiment',
          status: 'running',
          config: {},
        },
      ],
    });

    // Dispatch metric at 70% of default 10.0
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-003',
        metric: { round: 1, epsilon: 7.0, delta: 1e-5 },
      })
    );

    // Should still trigger warning with default threshold
    const state = store.getState();
    const notifications = state.notifications.notifications;

    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('exp-003');
  });

  /**
   * Test: Clear warning history for specific experiment
   */
  it('should clear warning history for specific experiment', () => {
    // Trigger warning
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: { round: 5, epsilon: 7.5, delta: 1e-5 },
      })
    );

    let state = store.getState();
    expect(state.notifications.notifications).toHaveLength(1);

    // Clear warning history
    clearWarningHistory('exp-001');

    // Dispatch same metric again - should trigger warning again
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: { round: 6, epsilon: 7.6, delta: 1e-5 },
      })
    );

    state = store.getState();
    expect(state.notifications.notifications).toHaveLength(2);
  });

  /**
   * Test: Warning notification details include epsilon, delta, and threshold
   */
  it('should include epsilon, delta, and threshold in warning details', () => {
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: { round: 10, epsilon: 7.5, delta: 1e-5 },
      })
    );

    const state = store.getState();
    const notification = state.notifications.notifications[0];

    expect(notification.details).toContain('ε=7.50');
    expect(notification.details).toContain('δ=1.00e-5');
    expect(notification.details).toContain('10'); // threshold
  });

  /**
   * Test: Warning notifications are persisted
   * Validates Requirement 40.10 - Persist error notifications until manually dismissed
   */
  it('should persist warning notifications without auto-dismiss', () => {
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: { round: 10, epsilon: 9.0, delta: 1e-5 },
      })
    );

    const state = store.getState();
    const notification = state.notifications.notifications[0];

    expect(notification.autoDismiss).toBe(false);
  });

  /**
   * Test: Notification appears in history
   */
  it('should add warning to notification history', () => {
    store.dispatch(
      addPrivacyMetric({
        experimentId: 'exp-001',
        metric: { round: 10, epsilon: 7.5, delta: 1e-5 },
      })
    );

    const state = store.getState();
    
    expect(state.notifications.history).toHaveLength(1);
    expect(state.notifications.history[0].type).toBe('warning');
  });
});
