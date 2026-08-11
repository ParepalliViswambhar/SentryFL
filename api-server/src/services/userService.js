/**
 * User Service
 * Manages user data storage and authentication
 * Note: Uses in-memory storage for simplicity. In production, use a database.
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// In-memory user storage
// In production, this should be replaced with a database
const users = new Map();

// Default admin user for development
const initDefaultUsers = () => {
  const adminId = uuidv4();
  const adminPassword = bcrypt.hashSync('admin123', 10);

  users.set(adminId, {
    userId: adminId,
    username: 'admin',
    password: adminPassword,
    role: 'admin',
    createdAt: new Date().toISOString(),
  });
};

// Initialize default users
initDefaultUsers();

/**
 * Create a new user
 *
 * @param {string} username - Username
 * @param {string} password - Plain text password (will be hashed)
 * @param {string} role - User role ('user' or 'admin')
 * @returns {Object} User object (without password)
 * @throws {Error} If username already exists
 */
const createUser = async (username, password, role = 'user') => {
  // Check if username already exists
  const existingUser = Array.from(users.values()).find((u) => u.username === username);

  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user object
  const userId = uuidv4();
  const user = {
    userId,
    username,
    password: hashedPassword,
    role,
    createdAt: new Date().toISOString(),
  };

  // Store user
  users.set(userId, user);

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/**
 * Authenticate user with username and password
 *
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Object|null} User object (without password) if authentication succeeds, null otherwise
 */
const authenticateUser = async (username, password) => {
  // Find user by username
  const user = Array.from(users.values()).find((u) => u.username === username);

  if (!user) {
    return null;
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return null;
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/**
 * Get user by ID
 *
 * @param {string} userId - User ID
 * @returns {Object|null} User object (without password) or null if not found
 */
const getUserById = (userId) => {
  const user = users.get(userId);

  if (!user) {
    return null;
  }

  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/**
 * Get user by username
 *
 * @param {string} username - Username
 * @returns {Object|null} User object (without password) or null if not found
 */
const getUserByUsername = (username) => {
  const user = Array.from(users.values()).find((u) => u.username === username);

  if (!user) {
    return null;
  }

  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/**
 * Get all users
 *
 * @returns {Array} Array of user objects (without passwords)
 */
const getAllUsers = () => {
  return Array.from(users.values()).map((user) => {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });
};

/**
 * Delete user by ID
 *
 * @param {string} userId - User ID
 * @returns {boolean} True if user was deleted, false if not found
 */
const deleteUser = (userId) => {
  return users.delete(userId);
};

/**
 * Update user role
 *
 * @param {string} userId - User ID
 * @param {string} role - New role
 * @returns {Object|null} Updated user object (without password) or null if not found
 */
const updateUserRole = (userId, role) => {
  const user = users.get(userId);

  if (!user) {
    return null;
  }

  user.role = role;
  users.set(userId, user);

  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/**
 * Clear all users (for testing)
 */
const clearUsers = () => {
  users.clear();
  initDefaultUsers();
};

module.exports = {
  createUser,
  authenticateUser,
  getUserById,
  getUserByUsername,
  getAllUsers,
  deleteUser,
  updateUserRole,
  clearUsers,
};
