/**
 * Joi schemas for experiment configuration validation
 * Requirements: 22.2
 */

const Joi = require('joi');

/**
 * Schema for experiment configuration
 * Validates parameters for federated learning experiments
 */
const experimentConfigSchema = Joi.object({
  // Model configuration
  model_type: Joi.string()
    .valid('lstm', 'autoencoder', 'isolation_forest', 'one_class_svm')
    .required()
    .description('Type of anomaly detection model'),

  // Federated learning parameters
  num_clients: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .required()
    .description('Number of federated learning clients'),

  num_rounds: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(10)
    .description('Number of training rounds'),

  clients_per_round: Joi.number()
    .integer()
    .min(1)
    .max(Joi.ref('num_clients'))
    .required()
    .description('Number of clients participating in each round'),

  // Privacy parameters
  epsilon: Joi.number()
    .positive()
    .max(10)
    .required()
    .description('Differential privacy epsilon parameter'),

  delta: Joi.number()
    .positive()
    .max(1)
    .default(1e-5)
    .description('Differential privacy delta parameter'),

  noise_multiplier: Joi.number()
    .positive()
    .default(1.0)
    .description('Noise multiplier for differential privacy'),

  max_grad_norm: Joi.number()
    .positive()
    .default(1.0)
    .description('Maximum gradient norm for clipping'),

  // Training hyperparameters
  batch_size: Joi.number()
    .integer()
    .positive()
    .default(32)
    .description('Training batch size'),

  learning_rate: Joi.number()
    .positive()
    .default(0.001)
    .description('Learning rate for optimizer'),

  local_epochs: Joi.number()
    .integer()
    .positive()
    .default(1)
    .description('Number of local training epochs per round'),

  // Dataset configuration
  dataset: Joi.string()
    .valid('kdd99', 'nsl-kdd', 'unsw-nb15', 'cicids2017', 'custom')
    .required()
    .description('Dataset to use for training'),

  data_split: Joi.string()
    .valid('iid', 'non-iid', 'heterogeneous')
    .default('iid')
    .description('Data distribution strategy across clients'),

  // Model-specific parameters (optional)
  model_params: Joi.object()
    .default({})
    .description('Additional model-specific parameters'),

  // Experiment metadata
  experiment_name: Joi.string()
    .max(255)
    .optional()
    .description('Optional experiment name'),

  description: Joi.string()
    .max(1000)
    .optional()
    .description('Optional experiment description'),

  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .default([])
    .description('Tags for experiment organization'),
}).required();

/**
 * Schema for experiment ID parameter
 */
const experimentIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .description('Experiment UUID'),
});

/**
 * Schema for experiment query parameters
 */
const experimentQuerySchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'running', 'paused', 'completed', 'failed')
    .optional()
    .description('Filter experiments by status'),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .description('Maximum number of results'),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .description('Number of results to skip'),
});

/**
 * Schema for metrics query parameters
 * Requirements: 24.2, 24.8, 24.9
 */
const metricsQuerySchema = Joi.object({
  metric_type: Joi.string()
    .optional()
    .description('Filter by specific metric type'),

  start_round: Joi.number()
    .integer()
    .min(0)
    .optional()
    .description('Filter metrics from this round onwards'),

  end_round: Joi.number()
    .integer()
    .min(0)
    .optional()
    .description('Filter metrics up to this round'),

  // Offset-based pagination (original)
  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100)
    .description('Maximum number of metric records'),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .description('Number of records to skip'),

  // Page-based pagination (alternative to limit/offset) - Requirement 24.8
  page: Joi.number()
    .integer()
    .min(1)
    .optional()
    .description('Page number (1-indexed, used with page_size)'),

  page_size: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .optional()
    .description('Number of records per page (used with page)'),

  // Metric aggregation - Requirement 24.9
  aggregation: Joi.string()
    .valid('latest', 'average', 'min', 'max')
    .optional()
    .description('Aggregation function to apply to metrics'),
});

module.exports = {
  experimentConfigSchema,
  experimentIdSchema,
  experimentQuerySchema,
  metricsQuerySchema,
};
