# Schemas

This directory contains JSON validation schemas for request/response payloads.

## Purpose

Schemas define the structure and validation rules for data flowing through the API. They ensure:
- Data integrity and type safety
- Clear API contracts
- Automatic validation before processing
- Self-documenting API structure

## Planned Schemas

- `experiment.js` - Experiment creation/update schema
- `config.js` - Configuration validation schema
- `metrics.js` - Metrics query parameters schema
- `common.js` - Shared validation patterns (IDs, timestamps, etc.)

## Schema Design

We'll use JSON Schema standard with validation libraries like `ajv` or `joi`.

## Example using AJV

```javascript
// experiment.js
const experimentSchema = {
  type: 'object',
  required: ['name', 'dataset', 'model'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
    },
    dataset: {
      type: 'string',
      enum: ['mnist', 'cifar10', 'fashion_mnist'],
    },
    model: {
      type: 'string',
      enum: ['cnn', 'resnet', 'vgg'],
    },
    num_clients: {
      type: 'integer',
      minimum: 2,
      maximum: 100,
      default: 10,
    },
    rounds: {
      type: 'integer',
      minimum: 1,
      maximum: 1000,
      default: 50,
    },
    dp_epsilon: {
      type: 'number',
      minimum: 0.1,
      maximum: 10.0,
      default: 1.0,
    },
  },
  additionalProperties: false,
};

module.exports = experimentSchema;
```

## Validation Middleware

Schemas are used by validation middleware:

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();

const validateSchema = (schema) => (req, res, next) => {
  const valid = ajv.validate(schema, req.body);
  if (!valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ajv.errors,
    });
  }
  next();
};
```
