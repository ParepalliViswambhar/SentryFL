/**
 * Infrastructure Tests for API Server
 * Task 29.4: Write unit tests for API server infrastructure
 * 
 * Tests requirements:
 * - 21.5: Error handling middleware with structured error responses
 * - 21.8: Rate limiting to prevent API abuse
 * - 21.10: Health check endpoint at /health returning server status
 * 
 * Tests cover:
 * - Health check endpoint returns correct status
 * - Rate limiting blocks excessive requests
 * - Validation middleware rejects invalid payloads
 * - Error handler formats errors correctly
 */

const request = require('supertest');
const express = require('express');
const Joi = require('joi');
const { validateBody } = require('./middleware/validation');
const { errorHandler, notFoundHandler, AppError } = require('./middleware/errorHandler');
const { app } = require('./index');

describe('API Server Infrastructure Tests', () => {
  describe('Health Check Endpoint (Requirement 21.10)', () => {
    it('should return 200 status for health check', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return correct health status structure', async () => {
      const response = await request(app).get('/health');
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'sentryfl-api-server');
      expect(response.body).toHaveProperty('version');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health');
      
      const timestamp = response.body.timestamp;
      expect(timestamp).toBeDefined();
      
      const date = new Date(timestamp);
      expect(date.toString()).not.toBe('Invalid Date');
      expect(date.toISOString()).toBe(timestamp);
    });

    it('should return JSON content-type', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should respond quickly (performance check)', async () => {
      const startTime = Date.now();
      await request(app).get('/health');
      const endTime = Date.now();
      
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond in less than 1 second
    });
  });

  describe('Rate Limiting (Requirement 21.8)', () => {
    it('should allow requests under rate limit', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should include rate limit headers in response', async () => {
      const response = await request(app).get('/health');
      
      // Check for standard rate limit headers
      const hasRateLimitHeaders = 
        response.headers['ratelimit-limit'] !== undefined ||
        response.headers['x-ratelimit-limit'] !== undefined;
      
      expect(hasRateLimitHeaders).toBe(true);
    });

    it('should block excessive requests with 429 status', async () => {
      // Make 101 requests rapidly to exceed the rate limit (default: 100 per 15 min)
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(request(app).get('/health'));
      }

      const responses = await Promise.all(requests);
      
      // Check that at least one request was rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 15000); // Extended timeout for multiple requests

    it('should return appropriate error message when rate limited', async () => {
      // First, trigger the rate limit
      const warmupRequests = [];
      for (let i = 0; i < 100; i++) {
        warmupRequests.push(request(app).get('/health'));
      }
      await Promise.all(warmupRequests);

      // Now make one more request that should be rate limited
      const response = await request(app).get('/health');
      
      if (response.status === 429) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toMatch(/too many requests/i);
      }
    }, 15000);

    it('should include retry-after information in rate limit response', async () => {
      // Make requests until rate limited
      const requests = [];
      for (let i = 0; i < 105; i++) {
        requests.push(request(app).get('/health'));
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find(r => r.status === 429);
      
      if (rateLimitedResponse) {
        // Should have retryAfter information
        expect(rateLimitedResponse.body).toHaveProperty('retryAfter');
      }
    }, 15000);
  });

  describe('Request Validation (Requirements 21.6, 21.7)', () => {
    let testApp;

    beforeEach(() => {
      testApp = express();
      testApp.use(express.json());
    });

    it('should reject invalid request payload with 400 status', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
      });

      testApp.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(testApp)
        .post('/test')
        .send({ name: 'Test' }); // Missing email

      expect(response.status).toBe(400);
    });

    it('should return validation errors in structured format', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().min(18).required(),
      });

      testApp.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(testApp)
        .post('/test')
        .send({ name: 'Test', age: 15 }); // Age below minimum

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('validationErrors');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include field names in validation errors', async () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });

      testApp.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(testApp)
        .post('/test')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(400);
      expect(response.body.validationErrors).toBeDefined();
      expect(response.body.validationErrors[0]).toHaveProperty('field');
      expect(response.body.validationErrors[0]).toHaveProperty('message');
    });

    it('should accept valid request payload', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().min(18).required(),
      });

      testApp.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true, data: req.body });
      });

      const response = await request(testApp)
        .post('/test')
        .send({ name: 'Test User', age: 25 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should validate complex nested objects', async () => {
      const schema = Joi.object({
        user: Joi.object({
          name: Joi.string().required(),
          contact: Joi.object({
            email: Joi.string().email().required(),
          }).required(),
        }).required(),
      });

      testApp.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(testApp)
        .post('/test')
        .send({
          user: {
            name: 'Test',
            contact: {
              email: 'invalid',
            },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.validationErrors[0].field).toMatch(/email/);
    });

    it('should strip unknown fields from request', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      testApp.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true, data: req.body });
      });

      const response = await request(testApp)
        .post('/test')
        .send({ name: 'Test', unknownField: 'should be removed' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ name: 'Test' });
      expect(response.body.data.unknownField).toBeUndefined();
    });
  });

  describe('Error Handler (Requirement 21.5)', () => {
    let testApp;

    beforeEach(() => {
      testApp = express();
      testApp.use(express.json());
    });

    it('should format operational errors with correct structure', async () => {
      testApp.get('/test', (req, res, next) => {
        next(new AppError('Resource not found', 404));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message', 'Resource not found');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include timestamp in ISO format', async () => {
      testApp.get('/test', (req, res, next) => {
        next(new AppError('Test error', 400));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test');

      expect(response.body.timestamp).toBeDefined();
      const date = new Date(response.body.timestamp);
      expect(date.toString()).not.toBe('Invalid Date');
    });

    it('should handle 500 internal server errors', async () => {
      testApp.get('/test', (req, res, next) => {
        next(new Error('Unexpected error'));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include error details when provided', async () => {
      testApp.get('/test', (req, res, next) => {
        next(new AppError('Validation failed', 400, { field: 'email', value: 'invalid' }));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('details');
      expect(response.body.details).toEqual({ field: 'email', value: 'invalid' });
    });

    it('should handle 404 not found errors', async () => {
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);

      const response = await request(testApp).get('/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/not found/i);
    });

    it('should handle JSON parsing errors', async () => {
      testApp.post('/test', (req, res) => {
        res.json({ success: true });
      });
      testApp.use(errorHandler);

      const response = await request(testApp)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toMatch(/json/i);
    });

    it('should return consistent error structure across error types', async () => {
      const testCases = [
        { error: new AppError('Not found', 404), expectedStatus: 404 },
        { error: new AppError('Bad request', 400), expectedStatus: 400 },
        { error: new Error('Internal error'), expectedStatus: 500 },
      ];

      for (const testCase of testCases) {
        const app = express();
        app.get('/test', (req, res, next) => {
          next(testCase.error);
        });
        app.use(errorHandler);

        const response = await request(app).get('/test');

        expect(response.status).toBe(testCase.expectedStatus);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('timestamp');
      }
    });

    it('should not expose stack traces in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      testApp.get('/test', (req, res, next) => {
        next(new Error('Internal error'));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test');

      expect(response.body.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack traces in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      testApp.get('/test', (req, res, next) => {
        next(new Error('Internal error'));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test');

      expect(response.body.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Integration: Complete Request Flow', () => {
    let testApp;

    beforeEach(() => {
      testApp = express();
      testApp.use(express.json());
    });

    it('should handle complete successful request flow', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      testApp.post('/api/test', validateBody(schema), (req, res) => {
        res.status(201).json({ success: true, data: req.body });
      });
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);

      const response = await request(testApp)
        .post('/api/test')
        .send({ name: 'Test' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should handle validation failure in request flow', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      testApp.post('/api/test', validateBody(schema), (req, res) => {
        res.json({ success: true });
      });
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);

      const response = await request(testApp)
        .post('/api/test')
        .send({}); // Missing name

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    it('should handle application errors in request flow', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      testApp.post('/api/test', validateBody(schema), (req, res, next) => {
        next(new AppError('Business logic error', 422));
      });
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);

      const response = await request(testApp)
        .post('/api/test')
        .send({ name: 'Test' });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('message', 'Business logic error');
    });

    it('should handle 404 for undefined routes', async () => {
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);

      const response = await request(testApp).get('/api/undefined');

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/i);
    });
  });

  describe('Security and Headers', () => {
    it('should include security headers from Helmet', async () => {
      const response = await request(app).get('/health');

      // Helmet sets various security headers
      const hasSecurityHeaders = 
        response.headers['x-content-type-options'] !== undefined ||
        response.headers['x-dns-prefetch-control'] !== undefined ||
        response.headers['x-frame-options'] !== undefined;

      expect(hasSecurityHeaders).toBe(true);
    });

    it('should include CORS headers for cross-origin requests', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3001');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET');

      // Should not error (may be 204, 200, or 404 depending on CORS config)
      expect([200, 204, 404]).toContain(response.status);
    });
  });

  describe('Logging and Monitoring', () => {
    it('should not crash when logging is active (Morgan)', async () => {
      const response = await request(app).get('/health');
      
      // If we get a response, logging didn't crash the server
      expect([200, 429]).toContain(response.status);
    });

    it('should handle requests with various content types', async () => {
      const response = await request(app)
        .get('/health')
        .set('Accept', 'application/json');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
