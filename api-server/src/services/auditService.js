/**
 * Audit Service
 *
 * Logs user actions to an append-only audit trail backed by PostgreSQL.
 * All read/write methods are asynchronous. Record shape matches
 * the previous in-memory implementation so consumers need no field changes.
 *
 * Requirements: 38.10
 */

const { randomUUID } = require('crypto');
const db = require('../db/connection');

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
  const result = await db.query(
    `INSERT INTO audit_logs
      (log_id, user_id, username, action, resource_type, resource_id, metadata, ip_address, success, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
     RETURNING *`,
    [
      randomUUID(),
      userId || null,
      username || null,
      action,
      resourceType || null,
      resourceId || null,
      JSON.stringify(metadata),
      ipAddress,
      success,
      errorMessage,
    ]
  );

  const auditLog = toPublicObject(result.rows[0]);

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
  const filters = [];
  const values = [];
  const addFilter = (sql, value) => {
    values.push(value);
    filters.push(`${sql} $${values.length}`);
  };
  if (userId) {
    addFilter('user_id =', userId);
  }
  if (action) {
    addFilter('action =', action);
  }
  if (resourceType) {
    addFilter('resource_type =', resourceType);
  }
  if (resourceId) {
    addFilter('resource_id =', resourceId);
  }
  if (startDate) {
    addFilter('timestamp >=', new Date(startDate));
  }
  if (endDate) {
    addFilter('timestamp <=', new Date(endDate));
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
    values
  );
  const total = countResult.rows[0].total;
  const dataValues = [...values, limit, offset];
  const docs = await db.query(
    `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return {
    logs: docs.rows.map(toPublicObject),
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
  await db.query('TRUNCATE TABLE audit_logs');
};

/**
 * Get audit log statistics.
 *
 * @returns {Promise<Object>} Statistics about audit logs
 */
const getAuditStats = async () => {
  const result = await db.query('SELECT * FROM audit_logs ORDER BY timestamp DESC');
  const docs = result.rows;

  const actionCounts = {};
  const userCounts = {};
  let successCount = 0;
  let failureCount = 0;

  docs.forEach((log) => {
    if (log.success) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
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
    oldestLog: docs.length > 0 ? toPublicObject(docs[docs.length - 1]).timestamp : null,
    newestLog: docs.length > 0 ? toPublicObject(docs[0]).timestamp : null,
  };
};

const toPublicObject = (log) => ({
  logId: log.log_id,
  timestamp: new Date(log.timestamp).toISOString(),
  userId: log.user_id,
  username: log.username,
  action: log.action,
  resourceType: log.resource_type,
  resourceId: log.resource_id,
  metadata: log.metadata || {},
  ipAddress: log.ip_address,
  success: log.success,
  errorMessage: log.error_message,
});

module.exports = {
  AuditActionType,
  logAction,
  getAuditLogs,
  getExperimentAuditLogs,
  getUserAuditLogs,
  clearAuditLogs,
  getAuditStats,
};
