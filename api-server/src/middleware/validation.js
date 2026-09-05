/**
 * Request Validation Middleware using Joi
 * Validates request payloads against JSON schemas
 * Requirements: 21.6, 21.7
 */

const Joi = require('joi');

/**
 * Middleware factory to validate request body against a Joi schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all validation errors, not just the first
      stripUnknown: true, // Remove unknown fields
      convert: true, // Convert values to the correct type
    });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request payload',
        validationErrors,
        timestamp: new Date().toISOString(),
      });
    }

    // Replace req.body with validated and sanitized value
    req.body = value;
    next();
  };
};

/**
 * Middleware factory to validate query parameters against a Joi schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        validationErrors,
        timestamp: new Date().toISOString(),
      });
    }

    req.query = value;
    next();
  };
};

/**
 * Middleware factory to validate URL parameters against a Joi schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid URL parameters',
        validationErrors,
        timestamp: new Date().toISOString(),
      });
    }

    req.params = value;
    next();
  };
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
};
