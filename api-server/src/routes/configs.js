/**
 * Configuration Management API Routes
 * Requirements: 23.1 - 23.10
 */

const express = require('express');
const NodeCache = require('node-cache');
const { v4: uuidv4 } = require('uuid');
const { validateBody, validateParams, validateQuery } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const {
  configSchema,
  configUpdateSchema,
  configIdSchema,
  configQuerySchema,
} = require('../schemas/configs');

const router = express.Router();

// Initialize in-memory storage for configurations
// Using node-cache with no TTL (persistent during server lifetime)
const configStorage = new NodeCache({
  stdTTL: 0, // No expiration
  checkperiod: 0, // No automatic cleanup
  useClones: true, // Clone data to prevent external modifications
});

/**
 * Default configuration values
 * Requirements: 23.8
 */
const DEFAULT_CONFIG = {
  model_type: 'lstm',
  num_clients: 5,
  num_rounds: 10,
  clients_per_round: 5,
  epsilon: 1.0,
  delta: 1e-5,
  noise_multiplier: 1.0,
  max_grad_norm: 1.0,
  batch_size: 32,
  learning_rate: 0.001,
  local_epochs: 1,
  dataset: 'nsl-kdd',
  data_split: 'iid',
  model_params: {},
  is_public: false,
};

/**
 * GET /api/configs/defaults
 * Return default configuration values
 * Requirements: 23.8
 */
router.get('/defaults', (req, res) => {
  return res.status(200).json({
    defaults: DEFAULT_CONFIG,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/configs/validate
 * Validate configuration without saving
 * Requirements: 23.9, 23.10
 */
router.post(
  '/validate',
  validateBody(configSchema),
  asyncHandler(async (req, res) => {
    // If validation middleware passed, configuration is valid
    return res.status(200).json({
      valid: true,
      message: 'Configuration is valid',
      config: req.body,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/configs
 * List all configuration templates
 * Requirements: 23.1
 */
router.get(
  '/',
  validateQuery(configQuerySchema),
  asyncHandler(async (req, res) => {
    const { is_public, tags, limit, offset } = req.query;

    // Get all configurations from storage
    const allKeys = configStorage.keys();
    let configs = allKeys.map((key) => configStorage.get(key)).filter(Boolean);

    // Apply filters
    if (is_public !== undefined) {
      configs = configs.filter((config) => config.is_public === is_public);
    }

    if (tags) {
      const tagArray = tags.split(',').map((t) => t.trim());
      configs = configs.filter((config) =>
        tagArray.some((tag) => config.tags && config.tags.includes(tag))
      );
    }

    // Sort by creation time (newest first)
    configs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply pagination
    const total = configs.length;
    const paginatedConfigs = configs.slice(offset, offset + limit);

    return res.status(200).json({
      configs: paginatedConfigs,
      total,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/configs
 * Save a new configuration template
 * Requirements: 23.2, 23.6, 23.7
 */
router.post(
  '/',
  validateBody(configSchema),
  asyncHandler(async (req, res) => {
    const config = req.body;

    // Generate unique configuration ID
    const configId = uuidv4();

    // Create configuration object with versioning metadata
    const configData = {
      id: configId,
      ...config,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Save to storage
    configStorage.set(configId, configData);

    // Return 201 Created with configuration details
    return res.status(201).json({
      id: configId,
      message: 'Configuration created successfully',
      config: configData,
    });
  })
);

/**
 * GET /api/configs/:id
 * Retrieve a specific configuration
 * Requirements: 23.3
 */
router.get(
  '/:id',
  validateParams(configIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Retrieve from storage
    const config = configStorage.get(id);

    if (!config) {
      throw new AppError('Configuration not found', 404, { config_id: id });
    }

    return res.status(200).json({
      config,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/configs/:id
 * Update an existing configuration
 * Requirements: 23.4, 23.6, 23.7
 */
router.put(
  '/:id',
  validateParams(configIdSchema),
  validateBody(configUpdateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Retrieve existing configuration
    const existingConfig = configStorage.get(id);

    if (!existingConfig) {
      throw new AppError('Configuration not found', 404, { config_id: id });
    }

    // Merge updates with existing configuration
    const updatedConfig = {
      ...existingConfig,
      ...updates,
      version: existingConfig.version + 1, // Increment version
      updated_at: new Date().toISOString(),
      // Preserve original creation metadata
      id: existingConfig.id,
      created_at: existingConfig.created_at,
    };

    // Validate the complete updated configuration
    const { error } = configSchema.validate(updatedConfig, { allowUnknown: true });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Updated configuration is invalid',
        validationErrors,
        timestamp: new Date().toISOString(),
      });
    }

    // Save updated configuration
    configStorage.set(id, updatedConfig);

    return res.status(200).json({
      message: 'Configuration updated successfully',
      config: updatedConfig,
    });
  })
);

/**
 * DELETE /api/configs/:id
 * Remove a configuration
 * Requirements: 23.5
 */
router.delete(
  '/:id',
  validateParams(configIdSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if configuration exists
    const config = configStorage.get(id);

    if (!config) {
      throw new AppError('Configuration not found', 404, { config_id: id });
    }

    // Delete from storage
    configStorage.del(id);

    return res.status(200).json({
      message: `Configuration ${id} deleted successfully`,
      config_id: id,
      timestamp: new Date().toISOString(),
    });
  })
);

// Export router and storage for testing
module.exports = router;
module.exports.configStorage = configStorage;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
