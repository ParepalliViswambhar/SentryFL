# API Server Middleware

This directory contains middleware components for request validation and error handling in the SentryFL API Server.

## Overview

The middleware implements:
- **Request validation** using Joi schemas (Requirements 21.6, 21.7)
- **Error handling** with structured responses (Requirement 21.5)
- **Axios error transformation** for Python backend communication
- **Async error handling** utilities

## Middleware Components

### 1. Validation Middleware (`validation.js`)

Validates incoming requests against Joi schemas and returns 400 status codes with detailed error messages for invalid requests.

#### Features
- **Type conversion**: Automatically converts query strings to numbers, booleans, etc.
- **Strip unknown fields**: Removes fields not defined in schema
- **Comprehensive error messages**: Returns all validation errors, not just the first one
- **Multiple validation targets**: Body, query parameters, and URL parameters

#### Usage

```javascript
const { validateBody, validateQuery, validateParams } = require('./middleware/validation');
const Joi = require('joi');

// Define schema
const experimentSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  dataset: Joi.string().valid('smd', 'nsl-kdd').required(),
  num_clients: Joi.number().integer().min(1).max(500).required(),
});

// Apply to route
app.post('/api/experiments', validateBody(experimentSchema), (req, res) => {
  // req.body is validated and sanitized
  res.json({ success: true, data: req.body });
});
```

#### Error Response Format

```json
{
  "error": "Validation Error",
  "message": "Invalid request payload",
  "validationErrors": [
    {
      "field": "num_clients",
      "message": "\"num_clients\" must be at least 1",
      "type": "number.min"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 2. Error Handling Middleware (`errorHandler.js`)

Provides structured error responses for all types of errors including validation errors, Axios errors, authentication errors, and unexpected errors.

#### Features
- **Axios error transformation**: Converts Python backend errors to user-friendly format
- **Structured error responses**: Consistent JSON format for all errors
- **Security**: Doesn't leak stack traces in production
- **Service unavailability detection**: Detects when Python backend is unreachable

#### Components

##### AppError Class

Custom error class for operational errors:

```javascript
const { AppError } = require('./middleware/errorHandler');

// Throw operational error
throw new AppError('Resource not found', 404, { id: '123' });
```

##### asyncHandler

Wrapper for async route handlers that catches errors:

```javascript
const { asyncHandler } = require('./middleware/errorHandler');

app.get('/api/experiments/:id', asyncHandler(async (req, res) => {
  const experiment = await fetchExperiment(req.params.id);
  if (!experiment) {
    throw new AppError('Experiment not found', 404);
  }
  res.json(experiment);
}));
```

##### Error Handler

Global error handling middleware:

```javascript
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// ... define routes ...

// 404 handler (after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);
```

#### Error Response Formats

**Validation Error (400)**
```json
{
  "error": "Validation Error",
  "message": "Invalid request payload",
  "validationErrors": [...],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Backend Error (4xx/5xx from Python)**
```json
{
  "error": "Backend Error",
  "message": "Invalid experiment configuration",
  "details": {
    "field": "epsilon",
    "message": "Must be positive"
  },
  "statusCode": 400,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Service Unavailable (503)**
```json
{
  "error": "Service Unavailable",
  "message": "Python backend is not responding. Please ensure the ML service is running.",
  "statusCode": 503,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Not Found (404)**
```json
{
  "error": "Error",
  "message": "Route not found: GET /api/invalid",
  "details": {
    "method": "GET",
    "path": "/api/invalid"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Internal Server Error (500)**
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 3. Axios Client (`../utils/axiosClient.js`)

Configured Axios instance for Python backend communication with automatic error transformation.

#### Features
- **Request/response interceptors**: Adds metadata and logging
- **Automatic error marking**: Marks all errors as `isAxiosError` for error handler
- **Request duration tracking**: Measures backend response time
- **Configurable timeout**: Default 30 seconds, configurable via env

#### Usage

```javascript
const axiosClient = require('../utils/axiosClient');

// Make request to Python backend
try {
  const response = await axiosClient.post('/api/train', experimentConfig);
  res.json({ success: true, data: response.data });
} catch (error) {
  // Error is automatically transformed by errorHandler middleware
  throw error;
}
```

#### Configuration

Environment variables:
- `PYTHON_BACKEND_URL`: Base URL for Python backend (default: `http://localhost:5000`)
- `BACKEND_TIMEOUT_MS`: Request timeout in milliseconds (default: `30000`)

## Complete Integration Example

```javascript
const express = require('express');
const { validateBody, validateParams } = require('./middleware/validation');
const { errorHandler, notFoundHandler, asyncHandler, AppError } = require('./middleware/errorHandler');
const axiosClient = require('./utils/axiosClient');
const Joi = require('joi');

const app = express();
app.use(express.json());

// Define validation schema
const experimentSchema = Joi.object({
  name: Joi.string().required(),
  dataset: Joi.string().valid('smd', 'nsl-kdd').required(),
  num_clients: Joi.number().integer().min(1).max(500).required(),
});

const experimentIdSchema = Joi.object({
  id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
});

// Define routes with validation and error handling
app.post(
  '/api/experiments',
  validateBody(experimentSchema),
  asyncHandler(async (req, res) => {
    // Forward to Python backend
    const response = await axiosClient.post('/api/train', req.body);
    
    res.status(201).json({
      success: true,
      experiment: response.data,
    });
  })
);

app.get(
  '/api/experiments/:id',
  validateParams(experimentIdSchema),
  asyncHandler(async (req, res) => {
    const response = await axiosClient.get(`/api/experiments/${req.params.id}`);
    
    if (!response.data) {
      throw new AppError('Experiment not found', 404);
    }
    
    res.json({
      success: true,
      experiment: response.data,
    });
  })
);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last middleware)
app.use(errorHandler);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Testing

All middleware components have comprehensive unit and integration tests:

- `validation.test.js`: Tests validation middleware with various schemas
- `errorHandler.test.js`: Tests error handling for all error types
- `integration.test.js`: Tests complete request/response flow
- `../utils/axiosClient.test.js`: Tests Axios client with mocked backend

Run tests:
```bash
npm test
```

Run specific test file:
```bash
npm test -- validation.test.js
```

## Requirements Coverage

- **Requirement 21.5**: Error handling middleware with structured error responses ✅
- **Requirement 21.6**: Request payload validation against JSON schemas ✅
- **Requirement 21.7**: Return 400 status with validation errors ✅

## Best Practices

1. **Always use validateBody/validateQuery/validateParams** before processing requests
2. **Use asyncHandler** for all async route handlers to avoid try-catch boilerplate
3. **Throw AppError** for operational errors with appropriate status codes
4. **Let Axios errors propagate** - they're automatically transformed
5. **Place notFoundHandler after all routes** and errorHandler as the last middleware
6. **Use Joi schemas from `../schemas/common.js`** for consistency

## Common Patterns

### Validating nested objects
```javascript
const configSchema = Joi.object({
  experiment: Joi.object({
    name: Joi.string().required(),
    params: Joi.object({
      epsilon: Joi.number().min(0).required(),
    }),
  }),
});
```

### Custom validation messages
```javascript
const schema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
});
```

### Conditional validation
```javascript
const schema = Joi.object({
  type: Joi.string().valid('smd', 'nsl-kdd').required(),
  machine_id: Joi.when('type', {
    is: 'smd',
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
});
```

### Transforming backend errors
```javascript
try {
  const response = await axiosClient.post('/api/train', config);
  res.json(response.data);
} catch (error) {
  // Check for specific backend error types
  if (error.response && error.response.status === 409) {
    throw new AppError('Experiment already exists', 409, { name: config.name });
  }
  // Let other errors propagate to error handler
  throw error;
}
```
