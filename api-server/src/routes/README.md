# Routes

This directory contains API endpoint definitions for the SentryFL API Server.

## Structure

Routes are organized by feature/domain:

- `experiments.js` - Experiment management endpoints (create, start, stop, list)
- `configs.js` - Configuration management endpoints (save, load, update)
- `metrics.js` - Metrics retrieval endpoints (training, privacy, communication)
- `health.js` - Health check and system status endpoints

## Route Design

Each route file should:
- Define RESTful endpoints with appropriate HTTP methods
- Apply necessary middleware (validation, authentication)
- Delegate business logic to services
- Return appropriate HTTP status codes and responses
- Include error handling

## Example

```javascript
const express = require('express');
const router = express.Router();
const { validateSchema } = require('../middleware/validation');
const experimentSchema = require('../schemas/experiment');
const experimentService = require('../services/experiment');

// Create new experiment
router.post('/', validateSchema(experimentSchema), async (req, res, next) => {
  try {
    const experiment = await experimentService.create(req.body);
    res.status(201).json(experiment);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```
