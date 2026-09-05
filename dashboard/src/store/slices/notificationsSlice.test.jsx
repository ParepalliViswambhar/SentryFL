/**
 * Notifications Slice Tests
 * 
 * Tests for notification state management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import notificationsReducer, {
  addNotification,
  dismissNotification,
  clearAllNotifications,
  clearHistory,
  addApiError,
  addWebSocketStatus,
  addExperimentFailure,
  addPrivacyBudgetWarning,
} from './notificationsSlice';

describe('notificationsSlice', () => {
  let initialState;

  beforeEach(() => {
    initialState = {
      notifications: [],
      history: [],
    };
  });

  describe('addNotification', () => {
    it('should add a success notification with auto-dismiss', () => {
      const action = addNotification({
        type: 'success',
        message: 'Operation completed successfully',
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.history).toHaveLength(1);
      expect(state.notifications[0].type).toBe('success');
      expect(state.notifications[0].message).toBe('Operation completed successfully');
      expect(state.notifications[0].autoDismiss).toBe(true);
      expect(state.notifications[0].dismissed).toBe(false);
    });

    it('should add an error notification without auto-dismiss', () => {
      const action = addNotification({
        type: 'error',
        message: 'An error occurred',
        details: 'Stack trace here',
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('error');
      expect(state.notifications[0].message).toBe('An error occurred');
      expect(state.notifications[0].details).toBe('Stack trace here');
      expect(state.notifications[0].autoDismiss).toBe(false);
      expect(state.notifications[0].dismissed).toBe(false);
    });

    it('should add warning notification', () => {
      const action = addNotification({
        type: 'warning',
        message: 'Warning message',
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('warning');
      expect(state.notifications[0].autoDismiss).toBe(false);
    });

    it('should generate unique IDs for notifications', () => {
      const action1 = addNotification({ type: 'info', message: 'Message 1' });
      const action2 = addNotification({ type: 'info', message: 'Message 2' });
      
      let state = notificationsReducer(initialState, action1);
      state = notificationsReducer(state, action2);

      expect(state.notifications).toHaveLength(2);
      expect(state.notifications[0].id).not.toBe(state.notifications[1].id);
    });
  });

  describe('dismissNotification', () => {
    it('should dismiss a notification by ID', () => {
      // Add a notification first
      const addAction = addNotification({ type: 'info', message: 'Test message' });
      let state = notificationsReducer(initialState, addAction);
      const notificationId = state.notifications[0].id;

      // Dismiss the notification
      const dismissAction = dismissNotification(notificationId);
      state = notificationsReducer(state, dismissAction);

      expect(state.notifications).toHaveLength(0);
      expect(state.history).toHaveLength(1);
      expect(state.history[0].dismissed).toBe(true);
    });

    it('should not affect other notifications when dismissing one', () => {
      // Add two notifications
      const action1 = addNotification({ type: 'info', message: 'Message 1' });
      const action2 = addNotification({ type: 'info', message: 'Message 2' });
      
      let state = notificationsReducer(initialState, action1);
      state = notificationsReducer(state, action2);
      
      const firstId = state.notifications[0].id;

      // Dismiss first notification
      state = notificationsReducer(state, dismissNotification(firstId));

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].message).toBe('Message 2');
    });
  });

  describe('clearAllNotifications', () => {
    it('should clear all active notifications', () => {
      // Add multiple notifications
      let state = initialState;
      state = notificationsReducer(state, addNotification({ type: 'info', message: 'Message 1' }));
      state = notificationsReducer(state, addNotification({ type: 'info', message: 'Message 2' }));
      state = notificationsReducer(state, addNotification({ type: 'info', message: 'Message 3' }));

      expect(state.notifications).toHaveLength(3);

      // Clear all notifications
      state = notificationsReducer(state, clearAllNotifications());

      expect(state.notifications).toHaveLength(0);
      expect(state.history).toHaveLength(3);
      expect(state.history.every(n => n.dismissed)).toBe(true);
    });
  });

  describe('clearHistory', () => {
    it('should clear notification history', () => {
      // Add and dismiss notifications
      let state = initialState;
      state = notificationsReducer(state, addNotification({ type: 'info', message: 'Message 1' }));
      state = notificationsReducer(state, addNotification({ type: 'info', message: 'Message 2' }));

      expect(state.history).toHaveLength(2);

      // Clear history
      state = notificationsReducer(state, clearHistory());

      expect(state.history).toHaveLength(0);
    });
  });

  describe('addApiError', () => {
    it('should add API error notification with specific message', () => {
      const action = addApiError({
        message: 'Failed to fetch experiments',
        details: 'Network timeout',
        status: 500,
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('error');
      expect(state.notifications[0].message).toBe('Failed to fetch experiments');
      expect(state.notifications[0].details).toBe('Network timeout');
      expect(state.notifications[0].autoDismiss).toBe(false);
    });

    it('should add generic API error when no message provided', () => {
      const action = addApiError({ status: 404 });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].message).toBe('An API error occurred');
      expect(state.notifications[0].details).toBe('Status: 404');
    });
  });

  describe('addWebSocketStatus', () => {
    it('should add connecting status notification', () => {
      const action = addWebSocketStatus({ status: 'connecting' });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('info');
      expect(state.notifications[0].message).toBe('Connecting to real-time updates...');
    });

    it('should add connected status notification with auto-dismiss', () => {
      const action = addWebSocketStatus({ status: 'connected' });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('success');
      expect(state.notifications[0].message).toBe('Connected to real-time updates');
      expect(state.notifications[0].autoDismiss).toBe(true);
    });

    it('should add reconnecting status notification', () => {
      const action = addWebSocketStatus({ status: 'reconnecting' });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('warning');
      expect(state.notifications[0].message).toBe('Reconnecting to server...');
      expect(state.notifications[0].autoDismiss).toBe(false);
    });

    it('should add error status notification with error details', () => {
      const action = addWebSocketStatus({
        status: 'error',
        error: { message: 'Connection refused' },
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('error');
      expect(state.notifications[0].message).toBe('WebSocket connection failed');
      expect(state.notifications[0].details).toBe('Connection refused');
      expect(state.notifications[0].autoDismiss).toBe(false);
    });
  });

  describe('addExperimentFailure', () => {
    it('should add experiment failure notification with stack trace', () => {
      const action = addExperimentFailure({
        experimentId: 'exp-123',
        reason: 'Out of memory',
        stackTrace: 'Error at line 42...',
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('error');
      expect(state.notifications[0].message).toBe('Experiment exp-123 failed: Out of memory');
      expect(state.notifications[0].details).toBe('Error at line 42...');
      expect(state.notifications[0].autoDismiss).toBe(false);
    });
  });

  describe('addPrivacyBudgetWarning', () => {
    it('should add privacy budget warning notification', () => {
      const action = addPrivacyBudgetWarning({
        experimentId: 'exp-456',
        epsilon: 7.5,
        delta: 1e-5,
        threshold: 8.0,
      });
      const state = notificationsReducer(initialState, action);

      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].type).toBe('warning');
      expect(state.notifications[0].message).toBe('Privacy budget low for experiment exp-456');
      expect(state.notifications[0].details).toContain('ε=7.50');
      expect(state.notifications[0].details).toContain('δ=1.00e-5');
      expect(state.notifications[0].autoDismiss).toBe(false);
    });
  });
});
