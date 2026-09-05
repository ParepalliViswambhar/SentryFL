# Services

This directory contains business logic and external service integrations.

## Purpose

Services encapsulate:
- Communication with Python backend
- Data transformation and processing
- Caching logic
- Business rules and workflows
- WebSocket event management

## Planned Services

- `pythonBackend.js` - HTTP client wrapper for Python backend API
- `experimentService.js` - Experiment lifecycle management
- `configService.js` - Configuration CRUD operations
- `metricsService.js` - Metrics retrieval and aggregation
- `cacheService.js` - Node-cache wrapper with TTL management
- `websocketService.js` - WebSocket event broadcasting

## Service Design Principles

1. **Separation of concerns**: Keep routes thin, services thick
2. **Reusability**: Services can be used by multiple routes
3. **Testability**: Services should be easily testable in isolation
4. **Error handling**: Services throw errors, middleware catches them
5. **Async/await**: Use modern async patterns

## Example

```javascript
// pythonBackend.js
const axios = require('axios');

class PythonBackendService {
  constructor() {
    this.baseUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5000';
    this.timeout = parseInt(process.env.PYTHON_BACKEND_TIMEOUT || '30000');
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async createExperiment(config) {
    try {
      const response = await this.client.post('/api/experiments', config);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create experiment: ${error.message}`);
    }
  }

  async getExperimentStatus(experimentId) {
    try {
      const response = await this.client.get(`/api/experiments/${experimentId}/status`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get experiment status: ${error.message}`);
    }
  }
}

module.exports = new PythonBackendService();
```

## Cache Service Example

```javascript
// cacheService.js
const NodeCache = require('node-cache');

class CacheService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
      checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD || '60'),
    });
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value, ttl) {
    return this.cache.set(key, value, ttl);
  }

  del(key) {
    return this.cache.del(key);
  }

  flush() {
    return this.cache.flushAll();
  }
}

module.exports = new CacheService();
```
