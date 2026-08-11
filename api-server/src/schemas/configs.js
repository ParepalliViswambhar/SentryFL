/**
 * Joi schemas for configuration management validation
 * Requirements: 23.2, 23.6, 23.9, 23.10
 */

const Joi = require('joi');

/**
 * Schema for configuration template
 * Defines experiment configuration parameters
 */
const configSchema = Joi.object({
  // Configuration metadata
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .description('Configuration template name'),

  description: Joi.string()
    .max(500)
    .optional()
    .description('Configuration description'),

  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .default([])
    .description('Tags for configuration organization'),

  // Model configuration
  model_type: Joi.string()
    .valid('lstm', 'autoencoder', 'isolation_forest', 'one_class_svm')
    .required()
    .description('Type of anomaly detection model'),

  // Federated learning parameters
  num_clients: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .required()
    .description('Number of federated learning clients'),

  num_rounds: Joi.number()
    .integer()
    .min(1)
    .max(10000)
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

  // Public flag to indicate if this is a shared template
  is_public: Joi.boolean()
    .default(false)
    .description('Whether this configuration is publicly available'),
}).required();

/**
 * Schema for configuration update (all fields optional except metadata)
 */
const configUpdateSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .optional()
    .description('Configuration template name'),

  description: Joi.string()
    .max(500)
    .optional()
    .description('Configuration description'),

  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional()
    .description('Tags for configuration organization'),

  model_type: Joi.string()
    .valid('lstm', 'autoencoder', 'isolation_forest', 'one_class_svm')
    .optional()
    .description('Type of anomaly detection model'),

  num_clients: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .optional()
    .description('Number of federated learning clients'),

  num_rounds: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .optional()
    .description('Number of training rounds'),

  clients_per_round: Joi.number()
    .integer()
    .min(1)
    .optional()
    .description('Number of clients participating in each round'),

  epsilon: Joi.number()
    .positive()
    .max(10)
    .optional()
    .description('Differential privacy epsilon parameter'),

  delta: Joi.number()
    .positive()
    .max(1)
    .optional()
    .description('Differential privacy delta parameter'),

  noise_multiplier: Joi.number()
    .positive()
    .optional()
    .description('Noise multiplier for differential privacy'),

  max_grad_norm: Joi.number()
    .positive()
    .optional()
    .description('Maximum gradient norm for clipping'),

  batch_size: Joi.number()
    .integer()
    .positive()
    .optional()
    .description('Training batch size'),

  learning_rate: Joi.number()
    .positive()
    .optional()
    .description('Learning rate for optimizer'),

  local_epochs: Joi.number()
    .integer()
    .positive()
    .optional()
    .description('Number of local training epochs per round'),

  dataset: Joi.string()
    .valid('kdd99', 'nsl-kdd', 'unsw-nb15', 'cicids2017', 'custom')
    .optional()
    .description('Dataset to use for training'),

  data_split: Joi.string()
    .valid('iid', 'non-iid', 'heterogeneous')
    .optional()
    .description('Data distribution strategy across clients'),

  model_params: Joi.object()
    .optional()
    .description('Additional model-specific parameters'),

  is_public: Joi.boolean()
    .optional()
    .description('Whether this configuration is publicly available'),
}).min(1); // At least one field must be provided for update

/**
 * Schema for configuration ID parameter
 */
const configIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .description('Configuration UUID'),
});

/**
 * Schema for configuration query parameters
 */
const configQuerySchema = Joi.object({
  is_public: Joi.boolean()
    .optional()
    .description('Filter configurations by public/private status'),

  tags: Joi.string()
    .optional()
    .description('Filter configurations by tags (comma-separated)'),

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
 * Schema for default configuration values
 * Returns default values for all configuration parameters
 */
const defaultConfigSchema = Joi.object({
  model_type: Joi.string().default('lstm'),
  num_clients: Joi.number().default(5),
  num_rounds: Joi.number().default(10),
  clients_per_round: Joi.number().default(5),
  epsilon: Joi.number().default(1.0),
  delta: Joi.number().default(1e-5),
  noise_multiplier: Joi.number().default(1.0),
  max_grad_norm: Joi.number().default(1.0),
  batch_size: Joi.number().default(32),
  learning_rate: Joi.number().default(0.001),
  local_epochs: Joi.number().default(1),
  dataset: Joi.string().default('nsl-kdd'),
  data_split: Joi.string().default('iid'),
  model_params: Joi.object().default({}),
  is_public: Joi.boolean().default(false),
});

module.exports = {
  configSchema,
  configUpdateSchema,
  configIdSchema,
  configQuerySchema,
  defaultConfigSchema,
};
