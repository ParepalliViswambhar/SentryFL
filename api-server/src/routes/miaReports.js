/**
 * MIA Report Request & Admin Dispatch Routes
 *
 * Allows authenticated federated clients to request Membership Inference Attack (MIA)
 * reports for active experiments, and allows administrators to evaluate live MIA on
 * the current global model and send the report back to the requesting client.
 */

const express = require('express');
const Joi = require('joi');
const axiosClient = require('../utils/axiosClient');
const { authenticate, requireAdmin } = require('../middleware/authenticate');
const { validateBody, validateParams, validateQuery } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { getExperiment: getPersistedExperiment } = require('../services/experimentService');
const { logAction, AuditActionType } = require('../services/auditService');
const miaReportService = require('../services/miaReportService');
const { experimentCache } = require('./experiments');

const router = express.Router();

const createRequestSchema = Joi.object({
  experiment_id: Joi.string().uuid().required(),
  note: Joi.string().max(500).allow('').optional(),
});

const requestIdParamSchema = Joi.object({
  requestId: Joi.string().uuid().required(),
});

const listQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'sent', 'rejected').optional(),
  experiment_id: Joi.string().uuid().optional(),
  limit: Joi.number().integer().min(1).max(200).default(100),
  offset: Joi.number().integer().min(0).default(0),
});

const adminReviewSchema = Joi.object({
  admin_note: Joi.string().max(500).allow('').optional(),
});

async function resolveExperimentExists(experimentId) {
  const cached = experimentCache.get(`experiment:${experimentId}`);
  if (cached) return cached;

  if (process.env.NODE_ENV !== 'test') {
    const persisted = await getPersistedExperiment(experimentId);
    if (persisted) return persisted;
  }

  try {
    const res = await axiosClient.get(`/train/${experimentId}/status`);
    return { experiment_id: experimentId, ...res.data };
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function computeMiaReportPayload(experimentId, experiment) {
  try {
    const evalRes = await axiosClient.post(`/train/${experimentId}/mia/evaluate`, {}, { timeout: 60000 });
    if (evalRes?.data) {
      return evalRes.data;
    }
  } catch (err) {
    // Fallback to /report + /metrics/privacy when mock or legacy runner has no /mia/evaluate
    if (err.response && err.response.status !== 404 && err.response.status !== 501) {
      // Try structured report fallback below before failing
    }
  }

  let reportData = {};
  let privacyMetrics = [];
  try {
    const r = await axiosClient.get(`/train/${experimentId}/report`, {
      headers: { Accept: 'application/json' },
    });
    reportData = r.data || {};
  } catch (e) {
    // ignore if unavailable
  }
  try {
    const m = await axiosClient.get(`/train/${experimentId}/metrics/privacy`);
    privacyMetrics = m.data?.metrics || [];
  } catch (e) {
    // ignore if unavailable
  }

  const latestPriv = privacyMetrics.length ? privacyMetrics[privacyMetrics.length - 1] : {};
  const privRecord = Array.isArray(latestPriv.data) && latestPriv.data.length
    ? latestPriv.data[latestPriv.data.length - 1]
    : latestPriv;
  const miaSuccessRate = privRecord?.mia_success_rate ?? reportData?.mia?.results?.slice(-1)?.[0]?.mia_success_rate ?? null;
  const miaAuc = privRecord?.mia_auc ?? reportData?.mia?.results?.slice(-1)?.[0]?.mia_auc ?? null;

  return {
    experiment_id: experimentId,
    experiment_name: experiment?.config?.experiment_name || reportData?.experiment?.name || experimentId,
    round: reportData.current_round ?? experiment?.current_round ?? 0,
    status: reportData.status ?? experiment?.status ?? 'unknown',
    privacy: {
      mechanism: reportData?.privacy?.mechanism || (experiment?.config?.epsilon ? 'dp_fedavg' : 'fedavg'),
      target_epsilon: reportData?.privacy?.target_epsilon ?? experiment?.config?.epsilon ?? null,
      target_delta: reportData?.privacy?.target_delta ?? experiment?.config?.delta ?? null,
      current_epsilon: privRecord?.epsilon ?? null,
    },
    mia: {
      status: miaSuccessRate !== null ? 'measured' : reportData?.mia?.status || 'unavailable',
      mia_success_rate: miaSuccessRate,
      mia_auc: miaAuc,
      chance_baseline: 0.5,
      privacy_leakage: typeof miaSuccessRate === 'number' ? Math.max(0, miaSuccessRate - 0.5) : null,
      leakage_severity:
        typeof miaSuccessRate === 'number'
          ? miaSuccessRate > 0.6
            ? 'HIGH'
            : miaSuccessRate > 0.55
              ? 'MEDIUM'
              : 'LOW'
          : null,
      protocol: reportData?.mia?.protocol || 'bounded_threshold_attack',
    },
    generated_at: Date.now() / 1000,
  };
}

/**
 * POST /api/mia-reports/request
 * Client submits a request to admin for an MIA privacy report on an experiment.
 */
router.post(
  '/request',
  authenticate,
  validateBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    const { experiment_id, note } = req.body;
    const user = req.user;

    const experiment = await resolveExperimentExists(experiment_id);
    if (!experiment) {
      throw new AppError('Experiment not found', 404, { experiment_id });
    }

    const record = await miaReportService.createRequest({
      experimentId: experiment_id,
      userId: user.userId,
      username: user.username,
      note: note || '',
    });

    await logAction({
      userId: user.userId,
      username: user.username,
      action: AuditActionType.MIA_REPORT_REQUEST,
      resourceType: 'mia_report_request',
      resourceId: record.request_id,
      metadata: { experiment_id, note },
      ipAddress: req.ip,
      success: true,
    });

    const wsServer = req.app.locals.wsServer;
    if (wsServer && typeof wsServer.broadcastMiaReportRequested === 'function') {
      wsServer.broadcastMiaReportRequested(record);
    }

    return res.status(201).json({
      message: 'MIA report request submitted to administrator',
      request: record,
    });
  })
);

/**
 * GET /api/mia-reports
 * List MIA report requests and received reports.
 * Admins see all requests; clients see only their own requests and reports sent to them.
 */
router.get(
  '/',
  authenticate,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, experiment_id, limit, offset } = req.query;
    const user = req.user;

    const requests = await miaReportService.listRequests({
      userId: user.userId,
      isAdmin: user.role === 'admin',
      status,
      experimentId: experiment_id,
      limit,
      offset,
    });

    return res.status(200).json({
      requests,
      total: requests.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/mia-reports/:requestId/send
 * Admin evaluates live MIA on the current global model and sends the report to the client.
 */
router.post(
  '/:requestId/send',
  authenticate,
  requireAdmin,
  validateParams(requestIdParamSchema),
  validateBody(adminReviewSchema),
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { admin_note } = req.body || {};
    const admin = req.user;

    const existing = await miaReportService.getRequestById(requestId);
    if (!existing) {
      throw new AppError('MIA report request not found', 404, { requestId });
    }

    const experiment = await resolveExperimentExists(existing.experiment_id);
    const miaReport = await computeMiaReportPayload(existing.experiment_id, experiment);
    miaReport.dispatched_to = existing.client_username;
    miaReport.dispatched_by = admin.username;
    miaReport.admin_note = admin_note || '';
    miaReport.sent_at = new Date().toISOString();

    const updated = await miaReportService.markSent({
      requestId,
      adminUserId: admin.userId,
      adminUsername: admin.username,
      adminNote: admin_note || '',
      miaReport,
    });

    await logAction({
      userId: admin.userId,
      username: admin.username,
      action: AuditActionType.MIA_REPORT_SEND,
      resourceType: 'mia_report_request',
      resourceId: requestId,
      metadata: {
        experiment_id: existing.experiment_id,
        recipient: existing.client_username,
        round: miaReport.round,
        mia_success_rate: miaReport?.mia?.mia_success_rate,
      },
      ipAddress: req.ip,
      success: true,
    });

    const wsServer = req.app.locals.wsServer;
    if (wsServer && typeof wsServer.broadcastMiaReportSent === 'function') {
      wsServer.broadcastMiaReportSent(updated);
    }

    return res.status(200).json({
      message: `MIA report generated and sent to ${existing.client_username}`,
      request: updated,
    });
  })
);

/**
 * POST /api/mia-reports/:requestId/reject
 * Admin rejects a pending MIA report request with an optional explanation.
 */
router.post(
  '/:requestId/reject',
  authenticate,
  requireAdmin,
  validateParams(requestIdParamSchema),
  validateBody(adminReviewSchema),
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { admin_note } = req.body || {};
    const admin = req.user;

    const existing = await miaReportService.getRequestById(requestId);
    if (!existing) {
      throw new AppError('MIA report request not found', 404, { requestId });
    }

    const updated = await miaReportService.markRejected({
      requestId,
      adminUserId: admin.userId,
      adminUsername: admin.username,
      adminNote: admin_note || 'Request declined by administrator',
    });

    await logAction({
      userId: admin.userId,
      username: admin.username,
      action: AuditActionType.MIA_REPORT_REJECT,
      resourceType: 'mia_report_request',
      resourceId: requestId,
      metadata: { experiment_id: existing.experiment_id, recipient: existing.client_username },
      ipAddress: req.ip,
      success: true,
    });

    const wsServer = req.app.locals.wsServer;
    if (wsServer && typeof wsServer.broadcastMiaReportRejected === 'function') {
      wsServer.broadcastMiaReportRejected(updated);
    }

    return res.status(200).json({
      message: 'MIA report request declined',
      request: updated,
    });
  })
);

/**
 * GET /api/mia-reports/:requestId/download
 * Download an evaluated MIA report sent by admin as JSON.
 */
router.get(
  '/:requestId/download',
  authenticate,
  validateParams(requestIdParamSchema),
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const user = req.user;

    const record = await miaReportService.getRequestById(requestId);
    if (!record) {
      throw new AppError('MIA report request not found', 404, { requestId });
    }

    if (user.role !== 'admin' && record.client_user_id !== user.userId) {
      throw new AppError('Access denied: You do not have permission to download this MIA report', 403, {
        requestId,
      });
    }

    if (record.status !== 'sent' || !record.mia_report) {
      throw new AppError('MIA report has not been sent by an administrator yet', 409, {
        requestId,
        status: record.status,
      });
    }

    const body = JSON.stringify(record.mia_report, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mia-report-${requestId}.json"`);
    return res.status(200).send(body);
  })
);

module.exports = router;
