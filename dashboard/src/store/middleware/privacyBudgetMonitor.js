/**
 * Privacy Budget Monitor Middleware
 * 
 * Monitors privacy budget consumption and triggers notifications when:
 * - Privacy budget exceeds 90% threshold (warning)
 * - Privacy budget exceeds 70% threshold (first warning at moderate level)
 * 
 * This middleware intercepts addPrivacyMetric actions and checks the
 * privacy budget utilization to automatically dispatch notifications.
 * 
 * Requirements: 40.6, 40.10
 * 
 * @module middleware/privacyBudgetMonitor
 */

import { addPrivacyBudgetWarning } from '../slices/notificationsSlice';

// Threshold for triggering warnings (percentage)
const WARNING_THRESHOLD_LOW = 70; // First warning at 70%
const WARNING_THRESHOLD_HIGH = 90; // Critical warning at 90%

// Track which experiments have already received warnings
const warningHistory = new Map();

/**
 * Privacy budget monitoring middleware
 * 
 * Intercepts privacy metric updates and checks if warnings should be triggered
 * Prevents duplicate notifications by tracking warning history per experiment
 * 
 * @param {Object} store - Redux store
 * @returns {Function} Middleware function
 */
const privacyBudgetMonitor = (store) => (next) => (action) => {
  // Process the action first
  const result = next(action);

  // Check if this is a privacy metric update
  if (action.type === 'metrics/addPrivacyMetric') {
    const { experimentId, metric } = action.payload;
    
    // Get experiment configuration to determine max epsilon
    const state = store.getState();
    const experiments = state.experiments?.list || state.experiments?.experiments || [];
    const experiment = experiments.find(
      (exp) => exp.id === experimentId
    );

    // Get max epsilon from experiment configuration
    const maxEpsilon =
      experiment?.config?.privacy?.epsilon ||
      experiment?.config?.privacy?.max_epsilon ||
      experiment?.config?.maxEpsilon ||
      10.0; // Default fallback

    // Calculate budget utilization
    const currentEpsilon = metric.epsilon;
    const utilizationPercentage = (currentEpsilon / maxEpsilon) * 100;

    // Initialize warning history for this experiment if needed
    if (!warningHistory.has(experimentId)) {
      warningHistory.set(experimentId, {
        warned70: false,
        warned90: false,
      });
    }

    const history = warningHistory.get(experimentId);

    // Trigger critical warning at 90% threshold
    if (utilizationPercentage >= WARNING_THRESHOLD_HIGH && !history.warned90) {
      store.dispatch(
        addPrivacyBudgetWarning({
          experimentId,
          epsilon: currentEpsilon,
          delta: metric.delta || 1e-5,
          threshold: maxEpsilon,
        })
      );
      history.warned90 = true;
    }
    // Trigger moderate warning at 70% threshold
    else if (utilizationPercentage >= WARNING_THRESHOLD_LOW && !history.warned70) {
      store.dispatch(
        addPrivacyBudgetWarning({
          experimentId,
          epsilon: currentEpsilon,
          delta: metric.delta || 1e-5,
          threshold: maxEpsilon,
        })
      );
      history.warned70 = true;
    }
  }

  return result;
};

/**
 * Clear warning history for a specific experiment
 * Call this when an experiment is deleted or reset
 * 
 * @param {string} experimentId - Experiment ID
 */
export const clearWarningHistory = (experimentId) => {
  warningHistory.delete(experimentId);
};

/**
 * Clear all warning history
 * Call this when resetting the application state
 */
export const clearAllWarningHistory = () => {
  warningHistory.clear();
};

export default privacyBudgetMonitor;
