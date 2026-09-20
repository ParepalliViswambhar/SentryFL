/**
 * User Service
 *
 * Manages user data storage and authentication, backed by MongoDB (Mongoose).
 * All methods are asynchronous. Passwords are hashed with bcrypt before
 * storage and are never returned to callers.
 *
 * A default admin user (admin / admin123) is seeded lazily on first access so
 * the system is usable out of the box in development. Override the seed
 * credentials with DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD, and disable
 * seeding entirely with SEED_DEFAULT_ADMIN=false (recommended for production).
 */

const bcrypt = require('bcryptjs');
const User = require('../db/models/User');

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
  const existing = await User.findOne({ username }).lean();
  if (existing) {
    return;
  }

  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  await User.create({ username, password: hashedPassword, role: 'admin' });
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
  const existingUser = await User.findOne({ username }).lean();
  if (existingUser) {
    throw new Error('Username already exists');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ username, password: hashedPassword, role });
  return user.toSafeObject();
};

/**
 * Authenticate a user with username and password.
 *
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object|null>} User object (without password) or null
 */
const authenticateUser = async (username, password) => {
  const user = await User.findOne({ username });
  if (!user) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return null;
  }

  return user.toSafeObject();
};

/**
 * Get a user by ID.
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object (without password) or null
 */
const getUserById = async (userId) => {
  const user = await User.findOne({ userId });
  return user ? user.toSafeObject() : null;
};

/**
 * Get a user by username.
 *
 * @param {string} username - Username
 * @returns {Promise<Object|null>} User object (without password) or null
 */
const getUserByUsername = async (username) => {
  const user = await User.findOne({ username });
  return user ? user.toSafeObject() : null;
};

/**
 * Get all users.
 *
 * @returns {Promise<Array>} Array of user objects (without passwords)
 */
const getAllUsers = async () => {
  const users = await User.find().sort({ createdAt: 1 });
  return users.map((user) => user.toSafeObject());
};

/**
 * Delete a user by ID.
 *
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if a user was deleted, false otherwise
 */
const deleteUser = async (userId) => {
  const result = await User.deleteOne({ userId });
  return result.deletedCount > 0;
};

/**
 * Update a user's role.
 *
 * @param {string} userId - User ID
 * @param {string} role - New role
 * @returns {Promise<Object|null>} Updated user (without password) or null
 */
const updateUserRole = async (userId, role) => {
  const user = await User.findOneAndUpdate({ userId }, { role }, { new: true });
  return user ? user.toSafeObject() : null;
};

/**
 * Remove all users and re-seed the default admin. Intended for tests.
 *
 * @returns {Promise<void>}
 */
const clearUsers = async () => {
  await User.deleteMany({});
  await seedDefaultAdmin();
};

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
