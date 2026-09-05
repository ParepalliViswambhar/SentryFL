/**
 * Admin Routes
 * Endpoints for administrative functions including audit log retrieval
 * Requirements: 38.5, 38.10
 */

const express = require('express');
const Joi = require('joi');
const { authenticate, requireAdmin } = require('../middleware/authenticate');
const { validateQuery } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getAuditLogs,
  getExperimentAuditLogs,
  getUserAuditLogs,
  getAuditStats,
} = require('../services/auditService');
const { getAllUsers } = require('../services/userService');

const router = express.Router();

// Validation schemas
const auditLogQuerySchema = Joi.object({
  userId: Joi.string().uuid().optional(),
  action: Joi.string().optional(),
  resourceType: Joi.string().optional(),
  resourceId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
});

const experimentAuditQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
});

const userAuditQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
});

/**
 * GET /api/admin/audit-logs
 * Retrieve audit logs with filtering
 * Requirements: 38.5 (admin access), 38.10 (audit trail)
 */
router.get(
  '/audit-logs',
  authenticate,
  requireAdmin,
  validateQuery(auditLogQuerySchema),
  asyncHandler(async (req, res) => {
    const { userId, action, resourceType, resourceId, startDate, endDate, limit, offset } = req.query;

    const result = getAuditLogs({
      userId,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit,
      offset,
    });

    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/admin/audit-logs/experiments/:experimentId
 * Retrieve audit logs for a specific experiment
 * Requirements: 38.5 (admin access), 38.10 (audit trail)
 */
router.get(
  '/audit-logs/experiments/:experimentId',
  authenticate,
  requireAdmin,
  validateQuery(experimentAuditQuerySchema),
  asyncHandler(async (req, res) => {
    const { experimentId } = req.params;
    const { limit, offset } = req.query;

    const result = getExperimentAuditLogs(experimentId, limit, offset);

    return res.status(200).json({
      experimentId,
      ...result,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/admin/audit-logs/users/:userId
 * Retrieve audit logs for a specific user
 * Requirements: 38.5 (admin access), 38.10 (audit trail)
 */
router.get(
  '/audit-logs/users/:userId',
  authenticate,
  requireAdmin,
  validateQuery(userAuditQuerySchema),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { limit, offset } = req.query;

    const result = getUserAuditLogs(userId, limit, offset);

    return res.status(200).json({
      userId,
      ...result,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/admin/audit-logs/stats
 * Get audit log statistics
 * Requirements: 38.5 (admin access), 38.10 (audit trail)
 */
router.get(
  '/audit-logs/stats',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stats = getAuditStats();

    return res.status(200).json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/admin/users
 * List all users (admin only)
 * Requirements: 38.5 (admin access)
 */
router.get(
  '/users',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const users = getAllUsers();

    return res.status(200).json({
      users,
      total: users.length,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
