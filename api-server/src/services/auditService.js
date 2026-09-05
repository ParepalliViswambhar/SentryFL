/**
 * Audit Service
 * Logs user actions for audit trail
 * Requirements: 38.10
 */

const { v4: uuidv4 } = require('uuid');

// In-memory audit log storage
// In production, this should be replaced with a database or log aggregation service
const auditLogs = [];

/**
 * Log types for different user actions
 */
const AuditActionType = {
  EXPERIMENT_CREATE: 'experiment.create',
  EXPERIMENT_DELETE: 'experiment.delete',
  EXPERIMENT_START: 'experiment.start',
  EXPERIMENT_STOP: 'experiment.stop',
  EXPERIMENT_PAUSE: 'experiment.pause',
  EXPERIMENT_RESUME: 'experiment.resume',
  EXPERIMENT_VIEW: 'experiment.view',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_REGISTER: 'user.register',
  CONFIG_CREATE: 'config.create',
  CONFIG_UPDATE: 'config.update',
  CONFIG_DELETE: 'config.delete',
};

/**
 * Log a user action to the audit trail
 *
 * @param {Object} params - Audit log parameters
 * @param {string} params.userId - User ID performing the action
 * @param {string} params.username - Username performing the action
 * @param {string} params.action - Action type (use AuditActionType constants)
 * @param {string} params.resourceType - Type of resource affected (e.g., 'experiment', 'config')
 * @param {string} params.resourceId - ID of the affected resource
 * @param {Object} params.metadata - Additional metadata about the action
 * @param {string} params.ipAddress - IP address of the user
 * @param {boolean} params.success - Whether the action succeeded
 * @param {string} params.errorMessage - Error message if action failed
 * @returns {Object} Created audit log entry
 */
const logAction = ({
  userId,
  username,
  action,
  resourceType,
  resourceId,
  metadata = {},
  ipAddress = null,
  success = true,
  errorMessage = null,
}) => {
  const auditLog = {
    logId: uuidv4(),
    timestamp: new Date().toISOString(),
    userId,
    username,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress,
    success,
    errorMessage,
  };

  auditLogs.push(auditLog);

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUDIT]', {
      timestamp: auditLog.timestamp,
      user: username,
      action,
      resource: `${resourceType}:${resourceId}`,
      success,
    });
  }

  return auditLog;
};

/**
 * Get audit logs with filtering and pagination
 *
 * @param {Object} filters - Filter options
 * @param {string} filters.userId - Filter by user ID
 * @param {string} filters.action - Filter by action type
 * @param {string} filters.resourceType - Filter by resource type
 * @param {string} filters.resourceId - Filter by resource ID
 * @param {string} filters.startDate - Filter logs after this date (ISO string)
 * @param {string} filters.endDate - Filter logs before this date (ISO string)
 * @param {number} filters.limit - Maximum number of logs to return
 * @param {number} filters.offset - Number of logs to skip
 * @returns {Object} Filtered audit logs with pagination info
 */
const getAuditLogs = ({
  userId = null,
  action = null,
  resourceType = null,
  resourceId = null,
  startDate = null,
  endDate = null,
  limit = 100,
  offset = 0,
} = {}) => {
  let filteredLogs = [...auditLogs];

  // Apply filters
  if (userId) {
    filteredLogs = filteredLogs.filter((log) => log.userId === userId);
  }

  if (action) {
    filteredLogs = filteredLogs.filter((log) => log.action === action);
  }

  if (resourceType) {
    filteredLogs = filteredLogs.filter((log) => log.resourceType === resourceType);
  }

  if (resourceId) {
    filteredLogs = filteredLogs.filter((log) => log.resourceId === resourceId);
  }

  if (startDate) {
    const start = new Date(startDate);
    filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) <= end);
  }

  // Sort by timestamp (most recent first)
  filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply pagination
  const total = filteredLogs.length;
  const paginatedLogs = filteredLogs.slice(offset, offset + limit);

  return {
    logs: paginatedLogs,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
};

/**
 * Get audit logs for a specific experiment
 *
 * @param {string} experimentId - Experiment ID
 * @param {number} limit - Maximum number of logs to return
 * @param {number} offset - Number of logs to skip
 * @returns {Object} Audit logs for the experiment
 */
const getExperimentAuditLogs = (experimentId, limit = 100, offset = 0) => {
  return getAuditLogs({
    resourceType: 'experiment',
    resourceId: experimentId,
    limit,
    offset,
  });
};

/**
 * Get audit logs for a specific user
 *
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of logs to return
 * @param {number} offset - Number of logs to skip
 * @returns {Object} Audit logs for the user
 */
const getUserAuditLogs = (userId, limit = 100, offset = 0) => {
  return getAuditLogs({
    userId,
    limit,
    offset,
  });
};

/**
 * Clear all audit logs (for testing purposes)
 */
const clearAuditLogs = () => {
  auditLogs.length = 0;
};

/**
 * Get audit log statistics
 *
 * @returns {Object} Statistics about audit logs
 */
const getAuditStats = () => {
  const actionCounts = {};
  const userCounts = {};
  const successCount = auditLogs.filter((log) => log.success).length;
  const failureCount = auditLogs.filter((log) => !log.success).length;

  auditLogs.forEach((log) => {
    // Count by action
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

    // Count by user
    userCounts[log.username] = (userCounts[log.username] || 0) + 1;
  });

  return {
    totalLogs: auditLogs.length,
    successCount,
    failureCount,
    actionCounts,
    userCounts,
    oldestLog: auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].timestamp : null,
    newestLog: auditLogs.length > 0 ? auditLogs[0].timestamp : null,
  };
};

module.exports = {
  AuditActionType,
  logAction,
  getAuditLogs,
  getExperimentAuditLogs,
  getUserAuditLogs,
  clearAuditLogs,
  getAuditStats,
};
