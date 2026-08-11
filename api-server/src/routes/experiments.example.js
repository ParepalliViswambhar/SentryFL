/**
 * Example experiment routes demonstrating validation and error handling
 * This file serves as a reference for implementing the full experiment API
 */

const express = require('express');
const router = express.Router();
const { validateBody, validateParams, validateQuery } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { experimentConfigSchema, experimentIdSchema, paginationSchema } = require('../schemas/common');
const axiosClient = require('../utils/axiosClient');

/**
 * POST /api/experiments
 * Create a new experiment
 * 
 * Demonstrates:
 * - Request body validation with Joi
 * - Async error handling
 * - Python backend communication with Axios
 * - Error transformation for backend errors
 */
router.post(
  '/',
  validateBody(experimentConfigSchema),
  asyncHandler(async (req, res) => {
    // Request body is already validated and sanitized by validateBody middleware
    const experimentConfig = req.body;

    try {
      // Forward request to Python backend
      const response = await axiosClient.post('/api/train', experimentConfig);

      // Return success response
      res.status(201).json({
        success: true,
        message: 'Experiment created successfully',
        experiment: response.data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Axios errors are automatically transformed by errorHandler middleware
      // Just re-throw and let the global error handler deal with it
      throw error;
    }
  })
);

/**
 * GET /api/experiments
 * List all experiments with pagination
 * 
 * Demonstrates:
 * - Query parameter validation
 * - Default values for optional parameters
 */
router.get(
  '/',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query; // Already validated and converted to numbers

    try {
      const response = await axiosClient.get('/api/experiments', {
        params: { page, limit },
      });

      res.json({
        success: true,
        experiments: response.data.experiments,
        pagination: {
          page,
          limit,
          total: response.data.total,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id
 * Get experiment details by ID
 * 
 * Demonstrates:
 * - URL parameter validation
 * - 404 error handling with AppError
 */
router.get(
  '/:id',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const response = await axiosClient.get(`/api/experiments/${id}`);

      if (!response.data) {
        throw new AppError(`Experiment with ID '${id}' not found`, 404, { id });
      }

      res.json({
        success: true,
        experiment: response.data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Handle 404 from Python backend
      if (error.response && error.response.status === 404) {
        throw new AppError(`Experiment with ID '${id}' not found`, 404, { id });
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/experiments/:id
 * Stop and delete an experiment
 * 
 * Demonstrates:
 * - Validation combined with business logic
 * - Proper error status codes
 */
router.delete(
  '/:id',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const response = await axiosClient.delete(`/api/experiments/${id}`);

      res.json({
        success: true,
        message: `Experiment '${id}' stopped and deleted successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new AppError(`Experiment with ID '${id}' not found`, 404, { id });
      }
      if (error.response && error.response.status === 409) {
        throw new AppError(
          `Cannot delete experiment '${id}' while it is running`,
          409,
          { id, status: 'running' }
        );
      }
      throw error;
    }
  })
);

/**
 * GET /api/experiments/:id/status
 * Get current training status
 * 
 * Demonstrates:
 * - Simple pass-through to backend
 * - Minimal transformation
 */
router.get(
  '/:id/status',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const response = await axiosClient.get(`/api/experiments/${id}/status`);

      res.json({
        success: true,
        status: response.data.status,
        progress: response.data.progress,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new AppError(`Experiment with ID '${id}' not found`, 404, { id });
      }
      throw error;
    }
  })
);

/**
 * POST /api/experiments/:id/pause
 * Pause a running experiment
 */
router.post(
  '/:id/pause',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const response = await axiosClient.post(`/api/experiments/${id}/pause`);

      res.json({
        success: true,
        message: `Experiment '${id}' paused successfully`,
        status: response.data.status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new AppError(`Experiment with ID '${id}' not found`, 404, { id });
      }
      if (error.response && error.response.status === 400) {
        throw new AppError(
          error.response.data.message || 'Cannot pause experiment in current state',
          400,
          { id, currentState: error.response.data.status }
        );
      }
      throw error;
    }
  })
);

/**
 * POST /api/experiments/:id/resume
 * Resume a paused experiment
 */
router.post(
  '/:id/resume',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const response = await axiosClient.post(`/api/experiments/${id}/resume`);

      res.json({
        success: true,
        message: `Experiment '${id}' resumed successfully`,
        status: response.data.status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new AppError(`Experiment with ID '${id}' not found`, 404, { id });
      }
      if (error.response && error.response.status === 400) {
        throw new AppError(
          error.response.data.message || 'Cannot resume experiment in current state',
          400,
          { id, currentState: error.response.data.status }
        );
      }
      throw error;
    }
  })
);

module.exports = router;
