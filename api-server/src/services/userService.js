/**
 * User Service
 *
 * Manages user data storage and authentication, backed by PostgreSQL.
 * All methods are asynchronous. Passwords are hashed with bcrypt before
 * storage and are never returned to callers.
 *
 * A default admin user (admin / admin123) is seeded lazily on first access so
 * the system is usable out of the box in development. Override the seed
 * credentials with DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD, and disable
 * seeding entirely with SEED_DEFAULT_ADMIN=false (recommended for production).
 */

const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('../db/connection');

const SALT_ROUNDS = 10;

/**
 * Seed the default admin user if it does not already exist. Idempotent.
 *
 * @returns {Promise<void>}
 */
const seedDefaultAdmin = async () => {
  if (process.env.SEED_DEFAULT_ADMIN === 'false') {
    return;
  }

  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const existing = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (existing.rowCount) {
    return;
  }

  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  await db.query('INSERT INTO users (user_id, username, password, role) VALUES ($1, $2, $3, $4)', [
    randomUUID(),
    username,
    hashedPassword,
    'admin',
  ]);
};

/**
 * Create a new user.
 *
 * @param {string} username - Username
 * @param {string} password - Plain text password (will be hashed)
 * @param {string} [role='user'] - User role ('user' or 'admin')
 * @returns {Promise<Object>} User object (without password)
 * @throws {Error} If username already exists
 */
const createUser = async (username, password, role = 'user') => {
  const existingUser = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (existingUser.rowCount) {
    throw new Error('Username already exists');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await db.query(
    'INSERT INTO users (user_id, username, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, username, role, created_at',
    [randomUUID(), username, hashedPassword, role]
  );
  return toSafeObject(result.rows[0]);
};

/**
 * Authenticate a user with username and password.
 *
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object|null>} User object (without password) or null
 */
const authenticateUser = async (username, password) => {
  const result = await db.query(
    'SELECT user_id, username, password, role, created_at FROM users WHERE username = $1',
    [username]
  );
  const user = result.rows[0];
  if (!user) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return null;
  }

  return toSafeObject(user);
};

/**
 * Get a user by ID.
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object (without password) or null
 */
const getUserById = async (userId) => {
  const result = await db.query(
    'SELECT user_id, username, role, created_at FROM users WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] ? toSafeObject(result.rows[0]) : null;
};

/**
 * Get a user by username.
 *
 * @param {string} username - Username
 * @returns {Promise<Object|null>} User object (without password) or null
 */
const getUserByUsername = async (username) => {
  const result = await db.query(
    'SELECT user_id, username, role, created_at FROM users WHERE username = $1',
    [username]
  );
  return result.rows[0] ? toSafeObject(result.rows[0]) : null;
};

/**
 * Get all users.
 *
 * @returns {Promise<Array>} Array of user objects (without passwords)
 */
const getAllUsers = async () => {
  const result = await db.query(
    'SELECT user_id, username, role, created_at FROM users ORDER BY created_at ASC'
  );
  return result.rows.map(toSafeObject);
};

/**
 * Delete a user by ID.
 *
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if a user was deleted, false otherwise
 */
const deleteUser = async (userId) => {
  const result = await db.query('DELETE FROM users WHERE user_id = $1', [userId]);
  return result.rowCount > 0;
};

/**
 * Update a user's role.
 *
 * @param {string} userId - User ID
 * @param {string} role - New role
 * @returns {Promise<Object|null>} Updated user (without password) or null
 */
const updateUserRole = async (userId, role) => {
  const result = await db.query(
    'UPDATE users SET role = $1 WHERE user_id = $2 RETURNING user_id, username, role, created_at',
    [role, userId]
  );
  return result.rows[0] ? toSafeObject(result.rows[0]) : null;
};

/**
 * Remove all users and re-seed the default admin. Intended for tests.
 *
 * @returns {Promise<void>}
 */
const clearUsers = async () => {
  await db.query('TRUNCATE TABLE users CASCADE');
  await seedDefaultAdmin();
};

const toSafeObject = (user) => ({
  userId: user.user_id,
  username: user.username,
  role: user.role,
  createdAt: new Date(user.created_at).toISOString(),
});

module.exports = {
  seedDefaultAdmin,
  createUser,
  authenticateUser,
  getUserById,
  getUserByUsername,
  getAllUsers,
  deleteUser,
  updateUserRole,
  clearUsers,
};
