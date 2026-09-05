/**
 * Common Joi validation schemas
 * Reusable schemas for API request validation
 */

const Joi = require('joi');

/**
 * Schema for experiment ID parameter
 */
const experimentIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'Experiment ID must contain only alphanumeric characters, underscores, and hyphens',
      'string.min': 'Experiment ID must be at least 1 character long',
      'string.max': 'Experiment ID must not exceed 100 characters',
    }),
});

/**
 * Schema for configuration ID parameter
 */
const configIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'Configuration ID must contain only alphanumeric characters, underscores, and hyphens',
    }),
});

/**
 * Schema for pagination query parameters
 */
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Page must be a number',
    'number.min': 'Page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    'number.base': 'Limit must be a number',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit must not exceed 100',
  }),
});

/**
 * Schema for metric filtering query parameters
 */
const metricFilterSchema = Joi.object({
  metric_type: Joi.string()
    .valid('training', 'privacy', 'communication', 'evaluation')
    .optional()
    .messages({
      'any.only': 'Metric type must be one of: training, privacy, communication, evaluation',
    }),
  start_round: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Start round must be a number',
    'number.min': 'Start round must be at least 0',
  }),
  end_round: Joi.number().integer().min(0).optional().messages({
    'number.base': 'End round must be a number',
    'number.min': 'End round must be at least 0',
  }),
  aggregation: Joi.string()
    .valid('latest', 'average', 'min', 'max')
    .optional()
    .messages({
      'any.only': 'Aggregation must be one of: latest, average, min, max',
    }),
}).custom((value, helpers) => {
  // Validate that end_round is greater than start_round if both are provided
  if (value.start_round !== undefined && value.end_round !== undefined) {
    if (value.end_round < value.start_round) {
      return helpers.error('any.invalid', {
        message: 'End round must be greater than or equal to start round',
      });
    }
  }
  return value;
});

/**
 * Schema for experiment configuration
 */
const experimentConfigSchema = Joi.object({
  name: Joi.string().min(1).max(200).required().messages({
    'string.empty': 'Experiment name is required',
    'string.max': 'Experiment name must not exceed 200 characters',
  }),
  description: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'Description must not exceed 1000 characters',
  }),
  dataset: Joi.string().valid('smd', 'nsl-kdd').required().messages({
    'any.only': 'Dataset must be either "smd" or "nsl-kdd"',
    'any.required': 'Dataset is required',
  }),
  num_clients: Joi.number().integer().min(1).max(500).required().messages({
    'number.base': 'Number of clients must be a number',
    'number.min': 'Number of clients must be at least 1',
    'number.max': 'Number of clients must not exceed 500',
    'any.required': 'Number of clients is required',
  }),
  num_rounds: Joi.number().integer().min(1).max(1000).required().messages({
    'number.base': 'Number of rounds must be a number',
    'number.min': 'Number of rounds must be at least 1',
    'number.max': 'Number of rounds must not exceed 1000',
    'any.required': 'Number of rounds is required',
  }),
  epsilon: Joi.number().min(0.01).max(100).required().messages({
    'number.base': 'Epsilon must be a number',
    'number.min': 'Epsilon must be at least 0.01',
    'number.max': 'Epsilon must not exceed 100',
    'any.required': 'Epsilon (privacy budget) is required',
  }),
  delta: Joi.number().min(1e-10).max(1e-3).default(1e-5).messages({
    'number.base': 'Delta must be a number',
    'number.min': 'Delta must be at least 1e-10',
    'number.max': 'Delta must not exceed 1e-3',
  }),
  max_grad_norm: Joi.number().min(0.1).max(10).default(1.0).messages({
    'number.base': 'Max gradient norm must be a number',
    'number.min': 'Max gradient norm must be at least 0.1',
    'number.max': 'Max gradient norm must not exceed 10',
  }),
  learning_rate: Joi.number().min(1e-6).max(1).default(0.001).messages({
    'number.base': 'Learning rate must be a number',
    'number.min': 'Learning rate must be at least 1e-6',
    'number.max': 'Learning rate must not exceed 1',
  }),
  batch_size: Joi.number().integer().min(1).max(1024).default(32).messages({
    'number.base': 'Batch size must be a number',
    'number.min': 'Batch size must be at least 1',
    'number.max': 'Batch size must not exceed 1024',
  }),
  selection_ratio: Joi.number().min(0.01).max(1).default(0.05).messages({
    'number.base': 'Selection ratio must be a number',
    'number.min': 'Selection ratio must be at least 0.01',
    'number.max': 'Selection ratio must not exceed 1',
  }),
  enable_quantization: Joi.boolean().default(false),
  enable_byzantine_robust: Joi.boolean().default(false),
  partition_strategy: Joi.string().valid('iid', 'non_iid').default('iid').messages({
    'any.only': 'Partition strategy must be either "iid" or "non_iid"',
  }),
});

/**
 * Schema for configuration template creation/update
 */
const configTemplateSchema = Joi.object({
  name: Joi.string().min(1).max(200).required().messages({
    'string.empty': 'Configuration name is required',
    'string.max': 'Configuration name must not exceed 200 characters',
  }),
  description: Joi.string().max(1000).optional().allow(''),
  config: experimentConfigSchema.required().messages({
    'any.required': 'Configuration object is required',
  }),
});

/**
 * Schema for configuration validation endpoint
 */
const validateConfigSchema = Joi.object({
  config: experimentConfigSchema.required(),
});

module.exports = {
  experimentIdSchema,
  configIdSchema,
  paginationSchema,
  metricFilterSchema,
  experimentConfigSchema,
  configTemplateSchema,
  validateConfigSchema,
};
