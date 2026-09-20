/**
 * AuditLog model
 *
 * Persists an append-only trail of user actions. Field names mirror the
 * previous in-memory records (logId, timestamp, action, resourceType, ...) so
 * consumers of the audit API see no change.
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const auditLogSchema = new mongoose.Schema(
  {
    logId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    timestamp: {
      type: String,
      default: () => new Date().toISOString(),
      index: true,
    },
    userId: { type: String, index: true },
    username: { type: String },
    action: { type: String, index: true },
    resourceType: { type: String, index: true },
    resourceId: { type: String, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null },
  },
  { versionKey: false }
);

/**
 * Return a plain object without Mongo internals (_id).
 */
auditLogSchema.methods.toPublicObject = function toPublicObject() {
  return {
    logId: this.logId,
    timestamp: this.timestamp,
    userId: this.userId,
    username: this.username,
    action: this.action,
    resourceType: this.resourceType,
    resourceId: this.resourceId,
    metadata: this.metadata,
    ipAddress: this.ipAddress,
    success: this.success,
    errorMessage: this.errorMessage,
  };
};

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
