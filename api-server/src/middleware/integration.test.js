/**
 * Integration tests for validation and error handling middleware
 * Tests the complete request validation and error handling flow
 */

const express = require('express');
const request = require('supertest');
const Joi = require('joi');
const { validateBody, validateQuery, validateParams } = require('./validation');
const { notFoundHandler, errorHandler, asyncHandler, AppError } = require('./errorHandler');

describe('Validation and Error Handling Integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Request validation with error handling', () => {
    it('should validate request body and return 400 on validation error', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().min(1).required(),
      });

      app.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true, data: req.body });
      });

      app.use(errorHandler);

      const response = await request(app)
        .post('/test')
        .send({ name: 'John' }) // Missing age
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        message: 'Invalid request payload',
        validationErrors: expect.arrayContaining([
          expect.objectContaining({
            field: 'age',
            message: expect.stringContaining('required'),
          }),
        ]),
        timestamp: expect.any(String),
      });
    });

    it('should pass validation and process request successfully', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().min(1).required(),
      });

      app.post('/test', validateBody(schema), (req, res) => {
        res.json({ success: true, data: req.body });
      });

      app.use(errorHandler);

      const response = await request(app)
        .post('/test')
        .send({ name: 'John', age: 30 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { name: 'John', age: 30 },
      });
    });

    it('should validate query parameters', async () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).required(),
        limit: Joi.number().integer().min(1).max(100).default(20),
      });

      app.get('/test', validateQuery(schema), (req, res) => {
        res.json({ success: true, query: req.query });
      });

      app.use(errorHandler);

      const response = await request(app)
        .get('/test')
        .query({ page: 1, limit: 50 })
        .expect(200);

      expect(response.body.query).toEqual({ page: 1, limit: 50 });
    });

    it('should return 400 for invalid query parameters', async () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).required(),
      });

      app.get('/test', validateQuery(schema), (req, res) => {
        res.json({ success: true });
      });

      app.use(errorHandler);

      const response = await request(app)
        .get('/test')
        .query({ page: 0 }) // Invalid: less than min
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        message: 'Invalid query parameters',
      });
    });

    it('should validate URL parameters', async () => {
      const schema = Joi.object({
        id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
      });

      app.get('/test/:id', validateParams(schema), (req, res) => {
        res.json({ success: true, id: req.params.id });
      });

      app.use(errorHandler);

      await request(app).get('/test/valid-id-123').expect(200);
    });

    it('should return 400 for invalid URL parameters', async () => {
      const schema = Joi.object({
        id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
      });

      app.get('/test/:id', validateParams(schema), (req, res) => {
        res.json({ success: true });
      });

      app.use(errorHandler);

      const response = await request(app)
        .get('/test/invalid@id!') // Contains invalid characters
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        message: 'Invalid URL parameters',
      });
    });
  });

  describe('Error handling with asyncHandler', () => {
    it('should catch errors in async route handlers', async () => {
      app.get(
        '/test',
        asyncHandler(async (req, res) => {
          throw new Error('Async error occurred');
        })
      );

      app.use(errorHandler);

      const response = await request(app).get('/test').expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: expect.stringContaining('error'),
        timestamp: expect.any(String),
      });
    });

    it('should handle AppError in async routes', async () => {
      app.get(
        '/test',
        asyncHandler(async (req, res) => {
          throw new AppError('Resource not found', 404);
        })
      );

      app.use(errorHandler);

      const response = await request(app).get('/test').expect(404);

      expect(response.body).toMatchObject({
        error: 'Error',
        message: 'Resource not found',
        timestamp: expect.any(String),
      });
    });
  });

  describe('404 Not Found handling', () => {
    it('should return 404 for undefined routes', async () => {
      app.use(notFoundHandler);
      app.use(errorHandler);

      const response = await request(app).get('/nonexistent-route').expect(404);

      expect(response.body).toMatchObject({
        error: 'Error',
        message: expect.stringContaining('Route not found'),
        details: {
          method: 'GET',
          path: '/nonexistent-route',
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('JSON parsing errors', () => {
    it('should handle invalid JSON in request body', async () => {
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      app.use(errorHandler);

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid JSON',
        message: 'Request body contains invalid JSON',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Complete workflow', () => {
    it('should validate, process, and handle errors in a complete request flow', async () => {
      const experimentSchema = Joi.object({
        name: Joi.string().min(1).max(200).required(),
        dataset: Joi.string().valid('smd', 'nsl-kdd').required(),
        num_clients: Joi.number().integer().min(1).max(500).required(),
      });

      app.post(
        '/api/experiments',
        validateBody(experimentSchema),
        asyncHandler(async (req, res) => {
          // Simulate processing
          if (req.body.name === 'error') {
            throw new AppError('Experiment name not allowed', 400);
          }

          res.status(201).json({
            success: true,
            experiment: {
              id: 'exp-123',
              ...req.body,
            },
          });
        })
      );

      app.use(notFoundHandler);
      app.use(errorHandler);

      // Test successful creation
      const successResponse = await request(app)
        .post('/api/experiments')
        .send({
          name: 'My Experiment',
          dataset: 'smd',
          num_clients: 10,
        })
        .expect(201);

      expect(successResponse.body).toMatchObject({
        success: true,
        experiment: {
          id: 'exp-123',
          name: 'My Experiment',
          dataset: 'smd',
          num_clients: 10,
        },
      });

      // Test validation failure
      const validationFailureResponse = await request(app)
        .post('/api/experiments')
        .send({
          name: 'My Experiment',
          dataset: 'invalid-dataset',
          num_clients: 10,
        })
        .expect(400);

      expect(validationFailureResponse.body).toMatchObject({
        error: 'Validation Error',
        message: 'Invalid request payload',
      });

      // Test business logic error
      const businessLogicErrorResponse = await request(app)
        .post('/api/experiments')
        .send({
          name: 'error',
          dataset: 'smd',
          num_clients: 10,
        })
        .expect(400);

      expect(businessLogicErrorResponse.body).toMatchObject({
        error: 'Error',
        message: 'Experiment name not allowed',
      });
    });
  });
});
