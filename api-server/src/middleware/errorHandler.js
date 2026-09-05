/**
 * Error Handling Middleware
 * Provides structured error responses for all types of errors
 * Requirements: 21.5
 */

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguish operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Transform Axios errors from Python backend into user-friendly format
 * @param {Error} error - Axios error object
 * @returns {Object} Structured error response
 */
const transformAxiosError = (error) => {
  if (error.response) {
    // Python backend returned an error response
    const { status, data } = error.response;

    // Extract error details from Python backend response
    let message = 'Python backend error';
    let details = null;

    if (data && typeof data === 'object') {
      message = data.error || data.message || message;
      details = data.details || data.validation_errors || null;
    } else if (typeof data === 'string') {
      message = data;
    }

    return {
      error: 'Backend Error',
      message,
      details,
      statusCode: status,
      timestamp: new Date().toISOString(),
    };
  } else if (error.request) {
    // Request was made but no response received (Python backend unreachable)
    return {
      error: 'Service Unavailable',
      message: 'Python backend is not responding. Please ensure the ML service is running.',
      statusCode: 503,
      timestamp: new Date().toISOString(),
    };
  } else {
    // Error in setting up the request
    return {
      error: 'Request Error',
      message: error.message || 'Failed to communicate with Python backend',
      statusCode: 500,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Not Found (404) error handler
 * Should be placed after all routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route not found: ${req.method} ${req.originalUrl}`,
    404,
    {
      method: req.method,
      path: req.originalUrl,
    }
  );
  next(error);
};

/**
 * Global error handling middleware
 * Catches all errors and returns structured JSON responses
 * Should be placed as the last middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error for debugging (in production, use a proper logging service)
  if (process.env.NODE_ENV !== 'test') {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Axios errors (from Python backend communication)
  if (err.isAxiosError) {
    const transformedError = transformAxiosError(err);
    return res.status(transformedError.statusCode).json(transformedError);
  }

  // Handle operational errors (AppError instances)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle validation errors (from Joi, but as fallback)
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details || null,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle JWT authentication errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Invalid or malformed token',
      timestamp: new Date().toISOString(),
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Token has expired',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle syntax errors in JSON parsing
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle unexpected/programming errors
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  return res.status(500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'An unexpected error occurred',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Eliminates the need for try-catch in every async route
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  transformAxiosError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
};
