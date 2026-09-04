/**
 * Redux Store Configuration
 * 
 * Configures Redux Toolkit store with three main slices:
 * - experimentsSlice: Manages experiment state (list, current, status)
 * - metricsSlice: Manages training/privacy/communication metrics from WebSocket
 * - authSlice: Manages authentication state (token, user, login/logout)
 * 
 * @module store
 */

import { configureStore } from '@reduxjs/toolkit';
import experimentsReducer from './slices/experimentsSlice';
import metricsReducer from './slices/metricsSlice';
import authReducer from './slices/authSlice';
import notificationsReducer from './slices/notificationsSlice';
import privacyBudgetMonitor from './middleware/privacyBudgetMonitor';

/**
 * Redux store instance with middleware and DevTools support
 * 
 * @property {Object} reducer - Combined reducers from all slices
 * @property {boolean} devTools - Enable Redux DevTools in development
 */
const store = configureStore({
  reducer: {
    experiments: experimentsReducer,
    metrics: metricsReducer,
    auth: authReducer,
    notifications: notificationsReducer,
  },
  // Enable Redux DevTools in development
  devTools: import.meta.env.DEV,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Customize middleware options if needed
      serializableCheck: {
        // Ignore these action types for serializability checks
        ignoredActions: ['metrics/addMetricUpdate'],
      },
    }).concat(privacyBudgetMonitor),
});

export default store;
