/**
 * Unit tests for validation middleware
 * Tests requirements 21.6 and 21.7
 */

const Joi = require('joi');
const { validateBody, validateQuery, validateParams } = require('./validation');

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('validateBody', () => {
    it('should pass validation with valid body', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      req.body = { name: 'John', age: 30 };

      const middleware = validateBody(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John', age: 30 });
    });

    it('should return 400 with validation errors for invalid body', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      req.body = { name: 'John' }; // Missing age

      const middleware = validateBody(schema);
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          message: 'Invalid request payload',
          validationErrors: expect.arrayContaining([
            expect.objectContaining({
              field: 'age',
              message: expect.stringContaining('required'),
            }),
          ]),
          timestamp: expect.any(String),
        })
      );
    });

    it('should return multiple validation errors when abortEarly is false', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required(),
      });

      req.body = {}; // All fields missing

      const middleware = validateBody(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.validationErrors).toHaveLength(3);
    });

    it('should strip unknown fields', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      req.body = { name: 'John', unknownField: 'value' };

      const middleware = validateBody(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John' });
      expect(req.body.unknownField).toBeUndefined();
    });

    it('should convert types when convert option is enabled', () => {
      const schema = Joi.object({
        age: Joi.number().required(),
      });

      req.body = { age: '30' }; // String instead of number

      const middleware = validateBody(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.age).toBe(30); // Converted to number
      expect(typeof req.body.age).toBe('number');
    });

    it('should validate nested objects', () => {
      const schema = Joi.object({
        user: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required(),
        }).required(),
      });

      req.body = {
        user: {
          name: 'John',
          email: 'invalid-email',
        },
      };

      const middleware = validateBody(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          validationErrors: expect.arrayContaining([
            expect.objectContaining({
              field: 'user.email',
            }),
          ]),
        })
      );
    });
  });

  describe('validateQuery', () => {
    it('should pass validation with valid query parameters', () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1),
        limit: Joi.number().integer().min(1).max(100),
      });

      req.query = { page: '1', limit: '20' };

      const middleware = validateQuery(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query).toEqual({ page: 1, limit: 20 }); // Converted to numbers
    });

    it('should return 400 with validation errors for invalid query', () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).required(),
      });

      req.query = { page: '0' }; // Invalid: less than min

      const middleware = validateQuery(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          message: 'Invalid query parameters',
        })
      );
    });
  });

  describe('validateParams', () => {
    it('should pass validation with valid URL parameters', () => {
      const schema = Joi.object({
        id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
      });

      req.params = { id: 'experiment-123' };

      const middleware = validateParams(schema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.params).toEqual({ id: 'experiment-123' });
    });

    it('should return 400 with validation errors for invalid params', () => {
      const schema = Joi.object({
        id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
      });

      req.params = { id: 'invalid@id!' }; // Contains invalid characters

      const middleware = validateParams(schema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          message: 'Invalid URL parameters',
        })
      );
    });
  });
});
