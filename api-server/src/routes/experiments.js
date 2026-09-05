/**
 * Experiment Management API Routes
 * Requirements: 22.1 - 22.11, 38.3, 38.4, 38.5, 38.9, 38.10
 */

const express = require('express');
const NodeCache = require('node-cache');
const { v4: uuidv4 } = require('uuid');
const axiosClient = require('../utils/axiosClient');
const { validateBody, validateParams, validateQuery } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/authenticate');
const { logAction, AuditActionType } = require('../services/auditService');
const {
  experimentConfigSchema,
  experimentIdSchema,
  experimentQuerySchema,
  metricsQuerySchema,
} = require('../schemas/experiments');

const router = express.Router();

// Initialize cache with 30 second TTL for list endpoint
const experimentCache = new NodeCache({
  stdTTL: 30, // 30 seconds default TTL
  checkperiod: 10, // Check for expired keys every 10 seconds
  useClones: true, // Clone data to prevent external modifications
});

/**
 * Helper function to check if user has access to experiment
 * Users can access their own experiments, admins can access all experiments
 * Requirement 38.4: Enforce authorization (users can only access their own experiments)
 * Requirement 38.5: Support admin role with access to all experiments
 *
 * @param {Object} user - User object from authentication middleware
 * @param {Object} experiment - Experiment object
 * @returns {boolean} True if user has access, false otherwise
 */
function hasExperimentAccess(user, experiment) {
  // Admin has access to all experiments
  if (user.role === 'admin') {
    return true;
  }

  // User can access their own experiments
  return experiment.userId === user.userId;
}

/**
 * Helper function to convert page/page_size to limit/offset
 * Requirement 24.8: Support page-based pagination as alternative to offset-based
 */
function parsePaginationParams(query) {
  const { page, page_size, limit, offset } = query;

  // If page and page_size are provided, convert to limit/offset
  if (page !== undefined && page_size !== undefined) {
    return {
      limit: page_size,
      offset: (page - 1) * page_size,
      page,
      page_size,
    };
  }

  // Otherwise use limit/offset directly
  return {
    limit: limit || 100,
    offset: offset || 0,
    page: null,
    page_size: null,
  };
}

/**
 * Helper function to apply metric aggregation
 * Requirement 24.9: Support metric aggregation (latest, average, min, max)
 */
function aggregateMetrics(metrics, aggregation) {
  if (!aggregation || metrics.length === 0) {
    return metrics;
  }

  // Group metrics by metric_type
  const groupedMetrics = {};
  metrics.forEach((metric) => {
    const type = metric.metric_type || 'unknown';
    if (!groupedMetrics[type]) {
      groupedMetrics[type] = [];
    }
    groupedMetrics[type].push(metric);
  });

  // Apply aggregation to each metric type
  const aggregatedResults = [];
  Object.keys(groupedMetrics).forEach((metricType) => {
    const metricGroup = groupedMetrics[metricType];
    let aggregatedValue;
    let aggregatedMetric;

    switch (aggregation) {
      case 'latest':
        // Get the most recent metric (highest round or latest timestamp)
        aggregatedMetric = metricGroup.reduce((latest, current) => {
          const latestRound = latest.round || 0;
          const currentRound = current.round || 0;
          return currentRound > latestRound ? current : latest;
        });
        aggregatedResults.push({
          ...aggregatedMetric,
          aggregation: 'latest',
        });
        break;

      case 'average':
        // Calculate average value
        aggregatedValue =
          metricGroup.reduce((sum, m) => sum + (m.value || 0), 0) / metricGroup.length;
        aggregatedResults.push({
          metric_type: metricType,
          value: aggregatedValue,
          aggregation: 'average',
          sample_count: metricGroup.length,
          timestamp: new Date().toISOString(),
        });
        break;

      case 'min':
        // Find minimum value
        aggregatedMetric = metricGroup.reduce((min, current) => {
          return (current.value || 0) < (min.value || 0) ? current : min;
        });
        aggregatedResults.push({
          ...aggregatedMetric,
          aggregation: 'min',
        });
        break;

      case 'max':
        // Find maximum value
        aggregatedMetric = metricGroup.reduce((max, current) => {
          return (current.value || 0) > (max.value || 0) ? current : max;
        });
        aggregatedResults.push({
          ...aggregatedMetric,
          aggregation: 'max',
        });
        break;

      default:
        // No aggregation
        aggregatedResults.push(...metricGroup);
    }
  });

  return aggregatedResults;
}

/**
 * POST /api/experiments
 * Create a new experiment
 * Requirements: 22.1, 22.2, 22.3, 22.4, 38.3, 38.10
 */
router.post(
  '/',
  authenticate, // Require authentication
  validateBody(experimentConfigSchema),
  asyncHandler(async (req, res) => {
    const config = req.body;
    const user = req.user;

    // Generate unique experiment ID
    const experimentId = uuidv4();

    // Build callback URL for Python backend to send updates
    const callbackUrl = `${process.env.API_SERVER_URL || 'http://localhost:3000'}/api/experiments/${experimentId}/callback`;

    try {
      // Forward request to Python Backend /train endpoint
      const response = await axiosClient.post('/train', {
        ...config,
        dataset: config.dataset === 'nsl-kdd' ? 'NSL-KDD' : 'SMD',
        callback_url: callbackUrl,
      });

      // Extract experiment data from Python backend response
      const backendExperimentId = response.data.experiment_id || experimentId;
      const experimentData = {
        experiment_id: backendExperimentId,
        userId: user.userId, // Associate experiment with user (Requirement 38.3)
        username: user.username,
        config,
        status: response.data.status || 'pending',
        current_round: response.data.current_round || 0,
        total_rounds: config.num_rounds,
        start_time: response.data.start_time || null,
        end_time: null,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Cache experiment data (individual experiment cache with no expiration)
      experimentCache.set(`experiment:${backendExperimentId}`, experimentData, 0);

      // Invalidate all list caches since we added a new experiment
      const keys = experimentCache.keys();
      keys.forEach((key) => {
        if (key.startsWith('experiments:list:')) {
          experimentCache.del(key);
        }
      });

      // Log experiment creation to audit trail (Requirement 38.10)
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: experimentId,
        metadata: {
          experimentName: config.experiment_name,
          dataset: config.dataset_name,
          numRounds: config.num_rounds,
        },
        ipAddress: req.ip,
        success: true,
      });

      // Return 201 Created with experiment details
      return res.status(201).json({
        experiment_id: backendExperimentId,
        status: experimentData.status,
        current_round: experimentData.current_round,
        total_rounds: experimentData.total_rounds,
        created_at: experimentData.created_at,
        message: 'Experiment created successfully',
      });
    } catch (error) {
      // Log failed experiment creation
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_CREATE,
        resourceType: 'experiment',
        resourceId: experimentId,
        metadata: {
          experimentName: config.experiment_name,
          error: error.message,
        },
        ipAddress: req.ip,
        success: false,
        errorMessage: error.message,
      });

      // Error will be handled by error middleware
      throw error;
    }
  })
);

/**
 * GET /api/experiments
 * List all experiments
 * Requirements: 22.5, 38.4, 38.7
 * Filters experiments by current user (users see only their experiments, admins see all)
 */
router.get(
  '/',
  authenticate, // Require authentication
  validateQuery(experimentQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, limit, offset } = req.query;
    const user = req.user;

    // Check cache first (include userId in cache key for user-specific filtering)
    const cacheKey = `experiments:list:${user.userId}:${status || 'all'}:${limit}:${offset}`;
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString(), // Update timestamp
      });
    }

    try {
      // Query Python Backend for experiment list
      const response = await axiosClient.get('/train', {
        params: {
          status,
          limit,
          offset,
        },
      });

      let experiments = response.data.experiments || [];

      // Filter experiments by user (Requirement 38.4, 38.7)
      // Admins see all experiments, regular users see only their own
      if (user.role !== 'admin') {
        experiments = experiments.filter((exp) => exp.userId === user.userId);
      }

      const total = experiments.length;

      // Update cache for each experiment
      experiments.forEach((exp) => {
        if (exp.experiment_id) {
          experimentCache.set(`experiment:${exp.experiment_id}`, exp, 0);
        }
      });

      const responseData = {
        experiments,
        total,
        limit,
        offset,
      };

      // Cache the list with 30 second TTL (default from cache config)
      experimentCache.set(cacheKey, responseData);

      return res.status(200).json({
        ...responseData,
        cached: false,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id
 * Retrieve experiment details
 * Requirements: 22.6, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const cacheKey = `experiment:${id}`;

    // Check cache first
    let cachedData = experimentCache.get(cacheKey);

    // If not in cache, fetch from backend
    if (!cachedData) {
      try {
        // Query Python Backend for experiment details
        const response = await axiosClient.get(`/train/${id}/status`);

        cachedData = {
          experiment_id: id,
          ...response.data,
          timestamp: new Date().toISOString(),
        };

        // Cache the experiment data (no expiration for individual experiments)
        experimentCache.set(cacheKey, cachedData, 0);
      } catch (error) {
        // Handle 404 from Python backend
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, cachedData)) {
      throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
        experiment_id: id,
      });
    }

    return res.status(200).json({
      ...cachedData,
      cached: cachedData === experimentCache.get(cacheKey),
    });
  })
);

/**
 * GET /api/experiments/:id/status
 * Query current training status
 * Requirements: 22.9, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/status',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
      // Query Python Backend for status (always fresh, don't use cache)
      const response = await axiosClient.get(`/train/${id}/status`);

      const experimentData = {
        experiment_id: id,
        ...response.data,
        timestamp: new Date().toISOString(),
      };

      // Check authorization: owner or admin only (Requirement 38.4)
      if (!hasExperimentAccess(user, experimentData)) {
        throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
          experiment_id: id,
        });
      }

      return res.status(200).json(experimentData);
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/experiments/:id
 * Stop a running experiment
 * Requirements: 22.7, 22.8, 38.4, 38.10
 * Requires authorization: owner or admin only
 */
router.delete(
  '/:id',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    // Get experiment to check ownership
    const cacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(cacheKey);

    if (!experiment) {
      try {
        const response = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...response.data,
        };
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: id,
        metadata: { reason: 'access_denied' },
        ipAddress: req.ip,
        success: false,
        errorMessage: 'Access denied',
      });

      throw new AppError('Access denied: You do not have permission to delete this experiment', 403, {
        experiment_id: id,
      });
    }

    try {
      // Signal Python Backend to stop experiment
      await axiosClient.delete(`/train/${id}`);

      // Invalidate cache for this experiment and list cache
      experimentCache.del(`experiment:${id}`);
      experimentCache.del('experiments:list');
      // Delete all list cache variations
      const keys = experimentCache.keys();
      keys.forEach((key) => {
        if (key.startsWith('experiments:list:')) {
          experimentCache.del(key);
        }
      });

      // Log experiment deletion to audit trail (Requirement 38.10)
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: id,
        metadata: {
          experimentName: experiment.config?.experiment_name,
          status: experiment.status,
        },
        ipAddress: req.ip,
        success: true,
      });

      return res.status(200).json({
        message: `Experiment ${id} stopped successfully`,
        experiment_id: id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Log failed deletion
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_DELETE,
        resourceType: 'experiment',
        resourceId: id,
        metadata: { error: error.message },
        ipAddress: req.ip,
        success: false,
        errorMessage: error.message,
      });

      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * POST /api/experiments/:id/pause
 * Pause a running experiment
 * Requirements: 22.10, 38.4, 38.10
 * Requires authorization: owner or admin only
 */
router.post(
  '/:id/pause',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    // Get experiment to check ownership
    const cacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(cacheKey);

    if (!experiment) {
      try {
        const response = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...response.data,
        };
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_PAUSE,
        resourceType: 'experiment',
        resourceId: id,
        metadata: { reason: 'access_denied' },
        ipAddress: req.ip,
        success: false,
        errorMessage: 'Access denied',
      });

      throw new AppError('Access denied: You do not have permission to pause this experiment', 403, {
        experiment_id: id,
      });
    }

    try {
      // Signal Python Backend to pause experiment
      const response = await axiosClient.post(`/train/${id}/pause`);

      // Invalidate cache for this experiment
      experimentCache.del(`experiment:${id}`);

      // Log experiment pause to audit trail (Requirement 38.10)
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_PAUSE,
        resourceType: 'experiment',
        resourceId: id,
        metadata: {
          experimentName: experiment.config?.experiment_name,
          currentRound: experiment.current_round,
        },
        ipAddress: req.ip,
        success: true,
      });

      return res.status(200).json({
        message: `Experiment ${id} paused successfully`,
        experiment_id: id,
        status: response.data.status || 'paused',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Log failed pause
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_PAUSE,
        resourceType: 'experiment',
        resourceId: id,
        metadata: { error: error.message },
        ipAddress: req.ip,
        success: false,
        errorMessage: error.message,
      });

      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * POST /api/experiments/:id/resume
 * Resume a paused experiment
 * Requirements: 22.11, 38.4, 38.10
 * Requires authorization: owner or admin only
 */
router.post(
  '/:id/resume',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    // Get experiment to check ownership
    const cacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(cacheKey);

    if (!experiment) {
      try {
        const response = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...response.data,
        };
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_RESUME,
        resourceType: 'experiment',
        resourceId: id,
        metadata: { reason: 'access_denied' },
        ipAddress: req.ip,
        success: false,
        errorMessage: 'Access denied',
      });

      throw new AppError('Access denied: You do not have permission to resume this experiment', 403, {
        experiment_id: id,
      });
    }

    try {
      // Signal Python Backend to resume experiment
      const response = await axiosClient.post(`/train/${id}/resume`);

      // Invalidate cache for this experiment
      experimentCache.del(`experiment:${id}`);

      // Log experiment resume to audit trail (Requirement 38.10)
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_RESUME,
        resourceType: 'experiment',
        resourceId: id,
        metadata: {
          experimentName: experiment.config?.experiment_name,
          currentRound: experiment.current_round,
        },
        ipAddress: req.ip,
        success: true,
      });

      return res.status(200).json({
        message: `Experiment ${id} resumed successfully`,
        experiment_id: id,
        status: response.data.status || 'running',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Log failed resume
      logAction({
        userId: user.userId,
        username: user.username,
        action: AuditActionType.EXPERIMENT_RESUME,
        resourceType: 'experiment',
        resourceId: id,
        metadata: { error: error.message },
        ipAddress: req.ip,
        success: false,
        errorMessage: error.message,
      });

      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/metrics
 * Retrieve all metrics for an experiment
 * Requirements: 24.1, 24.2, 24.3, 24.8, 24.9, 24.10, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/metrics',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  validateQuery(metricsQuerySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { metric_type, start_round, end_round, aggregation } = req.query;
    const user = req.user;

    // Check experiment ownership first
    const expCacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(expCacheKey);

    if (!experiment) {
      try {
        const response = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...response.data,
        };
        experimentCache.set(expCacheKey, experiment, 0);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
        experiment_id: id,
      });
    }

    // Parse pagination parameters (support both page/page_size and limit/offset)
    const pagination = parsePaginationParams(req.query);

    // Build cache key with all query parameters including pagination and aggregation
    const cacheKey = `metrics:${id}:all:${metric_type || 'all'}:${start_round || 0}:${end_round || 'end'}:${pagination.limit}:${pagination.offset}:${aggregation || 'none'}`;

    // Check cache first (60 second TTL as per requirement 24.10)
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Query Python Backend for all metrics
      const response = await axiosClient.get(`/train/${id}/metrics`, {
        params: {
          metric_type,
          start_round,
          end_round,
          limit: pagination.limit,
          offset: pagination.offset,
        },
      });

      // Apply aggregation if requested (Requirement 24.9)
      let metrics = response.data.metrics || [];
      metrics = aggregateMetrics(metrics, aggregation);

      // Build response data
      const responseData = {
        experiment_id: id,
        metrics,
        total: response.data.total || 0,
        limit: pagination.limit,
        offset: pagination.offset,
        ...(pagination.page !== null && { page: pagination.page, page_size: pagination.page_size }),
        ...(aggregation && { aggregation }),
        timestamp: new Date().toISOString(),
      };

      // Cache for 60 seconds as per requirement 24.10
      experimentCache.set(cacheKey, responseData, 60);

      return res.status(200).json({
        ...responseData,
        cached: false,
      });
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/metrics/training
 * Retrieve training metrics for an experiment
 * Requirements: 24.4, 24.8, 24.9, 24.10, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/metrics/training',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  validateQuery(metricsQuerySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { metric_type, start_round, end_round, aggregation } = req.query;
    const user = req.user;

    // Parse pagination parameters (support both page/page_size and limit/offset)
    const pagination = parsePaginationParams(req.query);

    // Check experiment ownership for authorization
    const expCacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(expCacheKey);

    if (!experiment) {
      try {
        const expResponse = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...expResponse.data,
        };
        experimentCache.set(expCacheKey, experiment, 0);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
        experiment_id: id,
      });
    }

    const cacheKey = `metrics:${id}:training:${metric_type || 'all'}:${start_round || 0}:${end_round || 'end'}:${pagination.limit}:${pagination.offset}:${aggregation || 'none'}`;

    // Check cache first (60 second TTL)
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Query Python Backend for training metrics
      const response = await axiosClient.get(`/train/${id}/metrics/training`, {
        params: {
          metric_type,
          start_round,
          end_round,
          limit: pagination.limit,
          offset: pagination.offset,
        },
      });

      // Apply aggregation if requested (Requirement 24.9)
      let metrics = response.data.metrics || [];
      metrics = aggregateMetrics(metrics, aggregation);

      const responseData = {
        experiment_id: id,
        metric_category: 'training',
        metrics,
        total: response.data.total || 0,
        limit: pagination.limit,
        offset: pagination.offset,
        ...(pagination.page !== null && { page: pagination.page, page_size: pagination.page_size }),
        ...(aggregation && { aggregation }),
        timestamp: new Date().toISOString(),
      };

      // Cache for 60 seconds
      experimentCache.set(cacheKey, responseData, 60);

      return res.status(200).json({
        ...responseData,
        cached: false,
      });
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/metrics/privacy
 * Retrieve privacy metrics for an experiment
 * Requirements: 24.5, 24.8, 24.9, 24.10, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/metrics/privacy',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  validateQuery(metricsQuerySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { metric_type, start_round, end_round, aggregation } = req.query;
    const user = req.user;

    // Parse pagination parameters (support both page/page_size and limit/offset)
    const pagination = parsePaginationParams(req.query);

    // Check experiment ownership for authorization
    const expCacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(expCacheKey);

    if (!experiment) {
      try {
        const expResponse = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...expResponse.data,
        };
        experimentCache.set(expCacheKey, experiment, 0);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
        experiment_id: id,
      });
    }

    const cacheKey = `metrics:${id}:privacy:${metric_type || 'all'}:${start_round || 0}:${end_round || 'end'}:${pagination.limit}:${pagination.offset}:${aggregation || 'none'}`;

    // Check cache first (60 second TTL)
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Query Python Backend for privacy metrics
      const response = await axiosClient.get(`/train/${id}/metrics/privacy`, {
        params: {
          metric_type,
          start_round,
          end_round,
          limit: pagination.limit,
          offset: pagination.offset,
        },
      });

      // Apply aggregation if requested (Requirement 24.9)
      let metrics = response.data.metrics || [];
      metrics = aggregateMetrics(metrics, aggregation);

      const responseData = {
        experiment_id: id,
        metric_category: 'privacy',
        metrics,
        total: response.data.total || 0,
        limit: pagination.limit,
        offset: pagination.offset,
        ...(pagination.page !== null && { page: pagination.page, page_size: pagination.page_size }),
        ...(aggregation && { aggregation }),
        timestamp: new Date().toISOString(),
      };

      // Cache for 60 seconds
      experimentCache.set(cacheKey, responseData, 60);

      return res.status(200).json({
        ...responseData,
        cached: false,
      });
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/metrics/communication
 * Retrieve communication metrics for an experiment
 * Requirements: 24.6, 24.8, 24.9, 24.10, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/metrics/communication',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  validateQuery(metricsQuerySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { metric_type, start_round, end_round, aggregation } = req.query;
    const user = req.user;

    // Parse pagination parameters (support both page/page_size and limit/offset)
    const pagination = parsePaginationParams(req.query);

    // Check experiment ownership for authorization
    const expCacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(expCacheKey);

    if (!experiment) {
      try {
        const expResponse = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...expResponse.data,
        };
        experimentCache.set(expCacheKey, experiment, 0);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
        experiment_id: id,
      });
    }

    const cacheKey = `metrics:${id}:communication:${metric_type || 'all'}:${start_round || 0}:${end_round || 'end'}:${pagination.limit}:${pagination.offset}:${aggregation || 'none'}`;

    // Check cache first (60 second TTL)
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Query Python Backend for communication metrics
      const response = await axiosClient.get(`/train/${id}/metrics/communication`, {
        params: {
          metric_type,
          start_round,
          end_round,
          limit: pagination.limit,
          offset: pagination.offset,
        },
      });

      // Apply aggregation if requested (Requirement 24.9)
      let metrics = response.data.metrics || [];
      metrics = aggregateMetrics(metrics, aggregation);

      const responseData = {
        experiment_id: id,
        metric_category: 'communication',
        metrics,
        total: response.data.total || 0,
        limit: pagination.limit,
        offset: pagination.offset,
        ...(pagination.page !== null && { page: pagination.page, page_size: pagination.page_size }),
        ...(aggregation && { aggregation }),
        timestamp: new Date().toISOString(),
      };

      // Cache for 60 seconds
      experimentCache.set(cacheKey, responseData, 60);

      return res.status(200).json({
        ...responseData,
        cached: false,
      });
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/metrics/evaluation
 * Retrieve evaluation metrics for an experiment
 * Requirements: 24.7, 24.8, 24.9, 24.10, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/metrics/evaluation',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  validateQuery(metricsQuerySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { metric_type, start_round, end_round, aggregation } = req.query;
    const user = req.user;

    // Parse pagination parameters (support both page/page_size and limit/offset)
    const pagination = parsePaginationParams(req.query);

    // Check experiment ownership for authorization
    const expCacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(expCacheKey);

    if (!experiment) {
      try {
        const expResponse = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...expResponse.data,
        };
        experimentCache.set(expCacheKey, experiment, 0);
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      throw new AppError('Access denied: You do not have permission to access this experiment', 403, {
        experiment_id: id,
      });
    }

    const cacheKey = `metrics:${id}:evaluation:${metric_type || 'all'}:${start_round || 0}:${end_round || 'end'}:${pagination.limit}:${pagination.offset}:${aggregation || 'none'}`;

    // Check cache first (60 second TTL)
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        ...cachedData,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Query Python Backend for evaluation metrics
      const response = await axiosClient.get(`/train/${id}/metrics/evaluation`, {
        params: {
          metric_type,
          start_round,
          end_round,
          limit: pagination.limit,
          offset: pagination.offset,
        },
      });

      // Apply aggregation if requested (Requirement 24.9)
      let metrics = response.data.metrics || [];
      metrics = aggregateMetrics(metrics, aggregation);

      const responseData = {
        experiment_id: id,
        metric_category: 'evaluation',
        metrics,
        total: response.data.total || 0,
        limit: pagination.limit,
        offset: pagination.offset,
        ...(pagination.page !== null && { page: pagination.page, page_size: pagination.page_size }),
        ...(aggregation && { aggregation }),
        timestamp: new Date().toISOString(),
      };

      // Cache for 60 seconds
      experimentCache.set(cacheKey, responseData, 60);

      return res.status(200).json({
        ...responseData,
        cached: false,
      });
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment not found', 404, { experiment_id: id });
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/report
 * Generate PDF report for an experiment
 * Requirements: 39.10, 38.4
 * Requires authorization: owner or admin only
 */
router.get(
  '/:id/report',
  authenticate, // Require authentication
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    // Get experiment to check ownership
    const cacheKey = `experiment:${id}`;
    let experiment = experimentCache.get(cacheKey);

    if (!experiment) {
      try {
        const response = await axiosClient.get(`/train/${id}/status`);
        experiment = {
          experiment_id: id,
          ...response.data,
        };
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new AppError('Experiment not found', 404, { experiment_id: id });
        }
        throw error;
      }
    }

    // Check authorization: owner or admin only (Requirement 38.4)
    if (!hasExperimentAccess(user, experiment)) {
      throw new AppError('Access denied: You do not have permission to access this experiment report', 403, {
        experiment_id: id,
      });
    }

    try {
      // Request PDF report from Python Backend
      const response = await axiosClient.get(`/train/${id}/report`, {
        responseType: 'arraybuffer', // Important for binary data
        headers: {
          'Accept': 'application/pdf',
        },
      });

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="experiment-${id}-report.pdf"`);
      res.setHeader('Content-Length', response.data.length);

      // Send PDF data
      res.send(response.data);
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError('Experiment report not available', 404, { experiment_id: id });
      }
      // Handle other errors
      if (error.response && error.response.status === 500) {
        throw new AppError('Failed to generate report', 500, { 
          experiment_id: id,
          error: error.message 
        });
      }
      throw error;
    }
  })
);

/**
 * POST /api/experiments/:id/callback
 * Callback endpoint for Python backend to send updates
 * (Internal use only - called by Python backend)
 */
router.post(
  '/:id/callback',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    const experimentId = updateData.experimentId || updateData.experiment_id || id;
    const metricType = updateData.metricType;
    const metricData = updateData.data || {
      round: updateData.round_number,
      loss: updateData.global_loss,
      accuracy: updateData.global_accuracy,
    };

    if (metricType && metricData) {
      const wsServer = req.app.locals.wsServer;
      if (wsServer) {
        switch (metricType) {
          case 'training_round_complete':
            wsServer.broadcastTrainingRoundComplete(experimentId, metricData);
            break;
          case 'privacy_budget_update':
            wsServer.broadcastPrivacyBudgetUpdate(experimentId, metricData);
            break;
          case 'experiment_status_change':
            wsServer.broadcastExperimentStatusChange(experimentId, metricData);
            break;
          case 'error':
            wsServer.broadcastError(experimentId, metricData);
            break;
          default:
            throw new AppError(`Unsupported callback metric type: ${metricType}`, 400);
        }
      }
    }

    // Update cache with new data
    const cacheKey = `experiment:${experimentId}`;
    const cachedData = experimentCache.get(cacheKey);

    if (cachedData) {
      const updatedData = {
        ...cachedData,
        ...updateData,
        updated_at: new Date().toISOString(),
      };
      experimentCache.set(cacheKey, updatedData, 0);
    }

    return res.status(200).json({
      message: 'Callback received',
      experiment_id: experimentId,
    });
  })
);

// Export cache for testing
module.exports = router;
module.exports.experimentCache = experimentCache;
