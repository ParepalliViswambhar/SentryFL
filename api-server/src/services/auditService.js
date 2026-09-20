/**
 * Audit Service
 *
 * Logs user actions to an append-only audit trail backed by MongoDB
 * (Mongoose). All read/write methods are asynchronous. Record shape matches
 * the previous in-memory implementation so consumers need no field changes.
 *
 * Requirements: 38.10
 */

const AuditLog = require('../db/models/AuditLog');

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
 * Log a user action to the audit trail.
 *
 * @param {Object} params - Audit log parameters (see field docs below)
 * @returns {Promise<Object>} Created audit log entry
 */
const logAction = async ({
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
  const doc = await AuditLog.create({
    userId,
    username,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress,
    success,
    errorMessage,
  });

  const auditLog = doc.toPublicObject();

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
 * Get audit logs with filtering and pagination.
 *
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Filtered audit logs with pagination info
 */
const getAuditLogs = async ({
  userId = null,
  action = null,
  resourceType = null,
  resourceId = null,
  startDate = null,
  endDate = null,
  limit = 100,
  offset = 0,
} = {}) => {
  const query = {};

  if (userId) query.userId = userId;
  if (action) query.action = action;
  if (resourceType) query.resourceType = resourceType;
  if (resourceId) query.resourceId = resourceId;

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate).toISOString();
    if (endDate) query.timestamp.$lte = new Date(endDate).toISOString();
  }

  const total = await AuditLog.countDocuments(query);

  // Sort by timestamp (most recent first), then paginate.
  const docs = await AuditLog.find(query)
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit);

  return {
    logs: docs.map((doc) => doc.toPublicObject()),
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
};

/**
 * Get audit logs for a specific experiment.
 *
 * @param {string} experimentId - Experiment ID
 * @param {number} [limit=100] - Max logs to return
 * @param {number} [offset=0] - Logs to skip
 * @returns {Promise<Object>} Audit logs for the experiment
 */
const getExperimentAuditLogs = (experimentId, limit = 100, offset = 0) =>
  getAuditLogs({ resourceType: 'experiment', resourceId: experimentId, limit, offset });

/**
 * Get audit logs for a specific user.
 *
 * @param {string} userId - User ID
 * @param {number} [limit=100] - Max logs to return
 * @param {number} [offset=0] - Logs to skip
 * @returns {Promise<Object>} Audit logs for the user
 */
const getUserAuditLogs = (userId, limit = 100, offset = 0) =>
  getAuditLogs({ userId, limit, offset });

/**
 * Clear all audit logs. Intended for tests.
 *
 * @returns {Promise<void>}
 */
const clearAuditLogs = async () => {
  await AuditLog.deleteMany({});
};

/**
 * Get audit log statistics.
 *
 * @returns {Promise<Object>} Statistics about audit logs
 */
const getAuditStats = async () => {
  const docs = await AuditLog.find().sort({ timestamp: -1 });

  const actionCounts = {};
  const userCounts = {};
  let successCount = 0;
  let failureCount = 0;

  docs.forEach((log) => {
    if (log.success) successCount += 1;
    else failureCount += 1;
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    userCounts[log.username] = (userCounts[log.username] || 0) + 1;
  });

  return {
    totalLogs: docs.length,
    successCount,
    failureCount,
    actionCounts,
    userCounts,
    // docs are sorted newest-first
    oldestLog: docs.length > 0 ? docs[docs.length - 1].timestamp : null,
    newestLog: docs.length > 0 ? docs[0].timestamp : null,
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
