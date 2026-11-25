/**
 * MIA Report Request Service
 *
 * Manages client requests for Membership Inference Attack (MIA) privacy reports
 * and admin-approved delivery of evaluated MIA reports backed by PostgreSQL.
 */

const { randomUUID } = require('crypto');
const db = require('../db/connection');

const toRecord = (row, { includeReport = true } = {}) => ({
  request_id: row.request_id,
  experiment_id: row.experiment_id,
  client_user_id: row.client_user_id,
  client_username: row.client_username,
  request_note: row.request_note || '',
  status: row.status,
  mia_report: includeReport ? row.mia_report || null : null,
  admin_user_id: row.admin_user_id || null,
  admin_username: row.admin_username || null,
  admin_note: row.admin_note || '',
  requested_at: row.requested_at instanceof Date ? row.requested_at.toISOString() : row.requested_at,
  sent_at: row.sent_at ? (row.sent_at instanceof Date ? row.sent_at.toISOString() : row.sent_at) : null,
});

const createRequest = async ({ experimentId, userId, username, note = '' }) => {
  const requestId = randomUUID();
  const result = await db.query(
    `INSERT INTO mia_report_requests (
      request_id, experiment_id, client_user_id, client_username, request_note, status
    ) VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING *`,
    [requestId, experimentId, userId, username || userId, note || '']
  );
  return toRecord(result.rows[0], { includeReport: false });
};

const getRequestById = async (requestId) => {
  const result = await db.query(
    'SELECT * FROM mia_report_requests WHERE request_id = $1',
    [requestId]
  );
  return result.rows[0] ? toRecord(result.rows[0], { includeReport: true }) : null;
};

const listRequests = async ({ userId, isAdmin, status, experimentId, limit = 100, offset = 0 } = {}) => {
  const filters = [];
  const values = [];

  if (!isAdmin) {
    values.push(userId);
    filters.push(`client_user_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    filters.push(`status = $${values.length}`);
  }
  if (experimentId) {
    values.push(experimentId);
    filters.push(`experiment_id = $${values.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  values.push(limit);
  const limitParam = values.length;
  values.push(offset);
  const offsetParam = values.length;

  const result = await db.query(
    `SELECT * FROM mia_report_requests ${where}
     ORDER BY requested_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values
  );

  return result.rows.map((row) =>
    toRecord(row, { includeReport: isAdmin || row.status === 'sent' })
  );
};

const markSent = async ({ requestId, adminUserId, adminUsername, adminNote = '', miaReport }) => {
  const now = new Date().toISOString();
  const result = await db.query(
    `UPDATE mia_report_requests
     SET status = 'sent',
         mia_report = $2::jsonb,
         admin_user_id = $3,
         admin_username = $4,
         admin_note = $5,
         sent_at = $6
     WHERE request_id = $1
     RETURNING *`,
    [requestId, JSON.stringify(miaReport || {}), adminUserId, adminUsername || 'admin', adminNote || '', now]
  );
  return result.rows[0] ? toRecord(result.rows[0], { includeReport: true }) : null;
};

const markRejected = async ({ requestId, adminUserId, adminUsername, adminNote = '' }) => {
  const now = new Date().toISOString();
  const result = await db.query(
    `UPDATE mia_report_requests
     SET status = 'rejected',
         admin_user_id = $2,
         admin_username = $3,
         admin_note = $4,
         sent_at = $5
     WHERE request_id = $1
     RETURNING *`,
    [requestId, adminUserId, adminUsername || 'admin', adminNote || '', now]
  );
  return result.rows[0] ? toRecord(result.rows[0], { includeReport: false }) : null;
};

module.exports = {
  createRequest,
  getRequestById,
  listRequests,
  markSent,
  markRejected,
};
