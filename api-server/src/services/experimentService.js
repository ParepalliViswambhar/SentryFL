const db = require('../db/connection');

const normalizeDate = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value < 10000000000 ? value * 1000 : value).toISOString();
  return value;
};

const toExperiment = (row) => ({
  experiment_id: row.experiment_id,
  userId: row.user_id,
  username: row.username,
  config: row.config,
  status: row.status,
  current_round: row.current_round,
  total_rounds: row.total_rounds,
  start_time: row.start_time,
  end_time: row.end_time,
  error: row.error,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const saveExperiment = async (experiment) => {
  const result = await db.query(
    `INSERT INTO experiments (
      experiment_id, user_id, username, config, status, current_round,
      total_rounds, start_time, end_time, error, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (experiment_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      username = EXCLUDED.username,
      config = EXCLUDED.config,
      status = EXCLUDED.status,
      current_round = EXCLUDED.current_round,
      total_rounds = EXCLUDED.total_rounds,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      error = EXCLUDED.error,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [
      experiment.experiment_id,
      experiment.userId,
      experiment.username || null,
      experiment.config || {},
      experiment.status || 'queued',
      experiment.current_round || 0,
      experiment.total_rounds || 0,
      normalizeDate(experiment.start_time),
      normalizeDate(experiment.end_time),
      experiment.error || null,
      normalizeDate(experiment.created_at) || new Date().toISOString(),
      normalizeDate(experiment.updated_at) || new Date().toISOString(),
    ]
  );
  return toExperiment(result.rows[0]);
};

const listExperiments = async ({ userId, isAdmin, status, limit, offset }) => {
  const values = [];
  const filters = [];
  if (!isAdmin) {
    values.push(userId);
    filters.push(`user_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    filters.push(`status = $${values.length}`);
  }
  values.push(limit);
  const limitParam = values.length;
  values.push(offset);
  const offsetParam = values.length;
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT * FROM experiments ${where}
     ORDER BY created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values
  );
  return result.rows.map(toExperiment);
};

const getExperiment = async (experimentId) => {
  const result = await db.query('SELECT * FROM experiments WHERE experiment_id = $1', [experimentId]);
  return result.rows[0] ? toExperiment(result.rows[0]) : null;
};

const updateExperiment = async (experimentId, fields) => {
  const allowed = ['status', 'current_round', 'total_rounds', 'start_time', 'end_time', 'error'];
  const entries = Object.entries(fields).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (!entries.length) return getExperiment(experimentId);
  const values = [experimentId];
  const assignments = entries.map(([key, value], index) => {
    values.push(value);
    return `${key} = $${index + 2}`;
  });
  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);
  const result = await db.query(
    `UPDATE experiments SET ${assignments.join(', ')} WHERE experiment_id = $1 RETURNING *`,
    values
  );
  return result.rows[0] ? toExperiment(result.rows[0]) : null;
};

const deleteExperiment = async (experimentId) => {
  await db.query('DELETE FROM experiments WHERE experiment_id = $1', [experimentId]);
};

module.exports = {
  saveExperiment,
  listExperiments,
  getExperiment,
  updateExperiment,
  deleteExperiment,
};
