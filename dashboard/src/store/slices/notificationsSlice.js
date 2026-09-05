/**
 * Notifications Slice
 * 
 * Manages notification state for the dashboard including:
 * - Toast notifications (success, error, warning, info)
 * - Notification history
 * - Auto-dismiss behavior
 * 
 * @module notificationsSlice
 */

import { createSlice } from '@reduxjs/toolkit';

/**
 * @typedef {Object} Notification
 * @property {string} id - Unique identifier
 * @property {string} type - Notification type: 'success' | 'error' | 'warning' | 'info'
 * @property {string} message - Notification message
 * @property {string} [details] - Additional details (e.g., stack trace)
 * @property {number} timestamp - Creation timestamp
 * @property {boolean} dismissed - Whether notification was dismissed
 * @property {boolean} autoDismiss - Whether notification should auto-dismiss
 */

const initialState = {
  notifications: [], // Current active notifications
  history: [], // All notifications including dismissed ones
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    /**
     * Add a new notification
     * @param {Object} action.payload
     * @param {string} action.payload.type - Notification type
     * @param {string} action.payload.message - Notification message
     * @param {string} [action.payload.details] - Additional details
     * @param {boolean} [action.payload.autoDismiss=true for success, false for error]
     */
    addNotification: (state, action) => {
      const {
        type,
        message,
        details,
        autoDismiss = type === 'success', // Success notifications auto-dismiss by default
      } = action.payload;

      const notification = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        message,
        details,
        timestamp: Date.now(),
        dismissed: false,
        autoDismiss,
      };

      state.notifications.push(notification);
      state.history.push(notification);
    },

    /**
     * Dismiss a notification by ID
     */
    dismissNotification: (state, action) => {
      const id = action.payload;
      const notification = state.notifications.find((n) => n.id === id);
      
      if (notification) {
        notification.dismissed = true;
      }

      // Remove from active notifications
      state.notifications = state.notifications.filter((n) => n.id !== id);

      // Update in history
      const historyNotification = state.history.find((n) => n.id === id);
      if (historyNotification) {
        historyNotification.dismissed = true;
      }
    },

    /**
     * Clear all active notifications
     */
    clearAllNotifications: (state) => {
      // Mark all notifications as dismissed in history
      state.notifications.forEach((n) => {
        const historyNotification = state.history.find((h) => h.id === n.id);
        if (historyNotification) {
          historyNotification.dismissed = true;
        }
      });
      state.notifications = [];
    },

    /**
     * Clear notification history
     */
    clearHistory: (state) => {
      state.history = [];
    },

    /**
     * Add error notification from API
     */
    addApiError: (state, action) => {
      const { message, details, status } = action.payload;
      
      const notification = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        message: message || 'An API error occurred',
        details: details || `Status: ${status}`,
        timestamp: Date.now(),
        dismissed: false,
        autoDismiss: false, // Error notifications persist
      };

      state.notifications.push(notification);
      state.history.push(notification);
    },

    /**
     * Add WebSocket connection status notification
     */
    addWebSocketStatus: (state, action) => {
      const { status, error } = action.payload;
      
      let type = 'info';
      let message = '';
      
      switch (status) {
        case 'connecting':
          type = 'info';
          message = 'Connecting to real-time updates...';
          break;
        case 'connected':
          type = 'success';
          message = 'Connected to real-time updates';
          break;
        case 'reconnecting':
          type = 'warning';
          message = 'Reconnecting to server...';
          break;
        case 'disconnected':
          type = 'warning';
          message = 'Disconnected from real-time updates';
          break;
        case 'error':
          type = 'error';
          message = 'WebSocket connection failed';
          break;
        default:
          return;
      }

      const notification = {
        id: `ws-${Date.now()}`,
        type,
        message,
        details: error ? error.message || String(error) : undefined,
        timestamp: Date.now(),
        dismissed: false,
        autoDismiss: type === 'success', // Only success auto-dismisses
      };

      state.notifications.push(notification);
      state.history.push(notification);
    },

    /**
     * Add experiment failure notification
     */
    addExperimentFailure: (state, action) => {
      const { experimentId, reason, stackTrace } = action.payload;
      
      const notification = {
        id: `exp-fail-${Date.now()}`,
        type: 'error',
        message: `Experiment ${experimentId} failed: ${reason}`,
        details: stackTrace || reason,
        timestamp: Date.now(),
        dismissed: false,
        autoDismiss: false,
      };

      state.notifications.push(notification);
      state.history.push(notification);
    },

    /**
     * Add privacy budget warning
     */
    addPrivacyBudgetWarning: (state, action) => {
      const { experimentId, epsilon, delta, threshold } = action.payload;
      
      const notification = {
        id: `privacy-${Date.now()}`,
        type: 'warning',
        message: `Privacy budget low for experiment ${experimentId}`,
        details: `ε=${epsilon.toFixed(2)}, δ=${delta.toExponential(2)} (threshold: ${threshold})`,
        timestamp: Date.now(),
        dismissed: false,
        autoDismiss: false,
      };

      state.notifications.push(notification);
      state.history.push(notification);
    },
  },
});

export const {
  addNotification,
  dismissNotification,
  clearAllNotifications,
  clearHistory,
  addApiError,
  addWebSocketStatus,
  addExperimentFailure,
  addPrivacyBudgetWarning,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
