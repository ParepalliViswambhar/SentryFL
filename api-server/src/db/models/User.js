/**
 * User model
 *
 * Persists application users and their hashed credentials. The public shape
 * (userId / username / role / createdAt) matches what the rest of the codebase
 * already expects, so existing routes and tests need no field renaming.
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    // bcrypt hash — never returned to clients.
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    createdAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false }
);

/**
 * Return a plain object without the password hash or Mongo internals.
 */
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    userId: this.userId,
    username: this.username,
    role: this.role,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
