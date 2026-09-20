/**
 * Unit tests for error handling middleware
 * Tests requirement 21.5
 */

const {
  AppError,
  transformAxiosError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
} = require('./errorHandler');

describe('Error Handling Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      originalUrl: '/api/test',
      path: '/api/test',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    // Suppress console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('AppError', () => {
    it('should create operational error with correct properties', () => {
      const error = new AppError('Test error', 404, { field: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.isOperational).toBe(true);
      expect(error.stack).toBeDefined();
    });

    it('should default to status 500 when not provided', () => {
      const error = new AppError('Test error');

      expect(error.statusCode).toBe(500);
    });
  });

  describe('transformAxiosError', () => {
    it('should transform Axios error with response', () => {
      const axiosError = {
        response: {
          status: 400,
          data: {
            error: 'Python Error',
            message: 'Invalid configuration',
            details: { field: 'epsilon' },
          },
        },
      };

      const result = transformAxiosError(axiosError);

      expect(result).toEqual({
        error: 'Backend Error',
        message: 'Python Error',
        details: { field: 'epsilon' },
        statusCode: 400,
        timestamp: expect.any(String),
      });
    });

    it('should handle Axios error with string response data', () => {
      const axiosError = {
        response: {
          status: 500,
          data: 'Internal server error in Python backend',
        },
      };

      const result = transformAxiosError(axiosError);

      expect(result).toEqual({
        error: 'Backend Error',
        message: 'Internal server error in Python backend',
        details: null,
        statusCode: 500,
        timestamp: expect.any(String),
      });
    });

    it('should handle Axios error without response (service unavailable)', () => {
      const axiosError = {
        request: {},
      };

      const result = transformAxiosError(axiosError);

      expect(result).toEqual({
        error: 'Service Unavailable',
        message: 'Python backend is not responding. Please ensure the ML service is running.',
        statusCode: 503,
        timestamp: expect.any(String),
      });
    });

    it('should handle Axios error without request', () => {
      const axiosError = {
        message: 'Network error',
      };

      const result = transformAxiosError(axiosError);

      expect(result).toEqual({
        error: 'Request Error',
        message: 'Network error',
        statusCode: 500,
        timestamp: expect.any(String),
      });
    });

    it('should extract validation_errors from Python backend', () => {
      const axiosError = {
        response: {
          status: 400,
          data: {
            message: 'Validation failed',
            validation_errors: [
              { field: 'epsilon', message: 'Must be positive' },
            ],
          },
        },
      };

      const result = transformAxiosError(axiosError);

      expect(result.details).toEqual([
        { field: 'epsilon', message: 'Must be positive' },
      ]);
    });
  });

  describe('notFoundHandler', () => {
    it('should create 404 error and call next', () => {
      notFoundHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route not found: GET /api/test',
          statusCode: 404,
          details: {
            method: 'GET',
            path: '/api/test',
          },
          isOperational: true,
        })
      );
    });
  });

  describe('errorHandler', () => {
    it('should handle operational errors (AppError)', () => {
      const error = new AppError('Resource not found', 404, { id: '123' });

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Error',
        message: 'Resource not found',
        details: { id: '123' },
        timestamp: expect.any(String),
      });
    });

    it('should handle Axios errors', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 503,
          data: {
            message: 'Backend service down',
          },
        },
      };

      errorHandler(axiosError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Backend Error',
          message: 'Backend service down',
        })
      );
    });

    it('should handle validation errors', () => {
      const validationError = {
        name: 'ValidationError',
        message: 'Validation failed',
        details: [{ field: 'email', message: 'Invalid email' }],
      };

      errorHandler(validationError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Validation failed',
        details: [{ field: 'email', message: 'Invalid email' }],
        timestamp: expect.any(String),
      });
    });

    it('should handle JWT authentication errors', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'jwt malformed',
      };

      errorHandler(jwtError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication Error',
        message: 'Invalid or malformed token',
        timestamp: expect.any(String),
      });
    });

    it('should handle token expired errors', () => {
      const tokenExpiredError = {
        name: 'TokenExpiredError',
        message: 'jwt expired',
      };

      errorHandler(tokenExpiredError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication Error',
        message: 'Token has expired',
        timestamp: expect.any(String),
      });
    });

    it('should handle JSON syntax errors', () => {
      const syntaxError = new SyntaxError('Unexpected token');
      syntaxError.status = 400;
      syntaxError.body = '{ invalid json }';

      errorHandler(syntaxError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid JSON',
        message: 'Request body contains invalid JSON',
        timestamp: expect.any(String),
      });
    });

    it('should handle unexpected errors in production mode', () => {
      process.env.NODE_ENV = 'production';
      const unexpectedError = new Error('Database connection failed');

      errorHandler(unexpectedError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: expect.any(String),
      });
      expect(res.json.mock.calls[0][0].stack).toBeUndefined();

      delete process.env.NODE_ENV;
    });

    it('should expose error details in development mode', () => {
      process.env.NODE_ENV = 'development';
      const unexpectedError = new Error('Database connection failed');

      errorHandler(unexpectedError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Database connection failed',
        stack: expect.any(String),
        timestamp: expect.any(String),
      });

      delete process.env.NODE_ENV;
    });
  });

  describe('asyncHandler', () => {
    it('should call next with error when async function rejects', async () => {
      const asyncFn = async () => {
        throw new Error('Async error');
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Async error');
    });

    it('should handle async function that resolves successfully', async () => {
      const asyncFn = async (req, res) => {
        res.json({ success: true });
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass request and response to wrapped function', async () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    });
  });
});
