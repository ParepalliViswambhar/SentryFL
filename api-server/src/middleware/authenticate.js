/**
 * JWT Authentication Middleware
 * Validates JWT tokens and extracts user information for protected routes
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate JWT tokens
 * Validates the token from Authorization header and attaches user info to request
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization token provided',
      });
    }

    // Check if header starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Invalid authorization header format. Expected: Bearer <token>',
      });
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided',
      });
    }

    // Verify token
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);

    // Attach user info to request object
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role || 'user',
    };

    // Continue to next middleware
    next();
  } catch (error) {
    // Handle JWT-specific errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Token expired',
      });
    }

    // Handle other errors
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error validating authentication token',
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require authentication
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const optionalAuthenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user info
      return next();
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role || 'user',
    };

    next();
  } catch (error) {
    // Token is invalid or expired, but don't block request
    next();
  }
};

/**
 * Middleware to require admin role
 * Must be used after authenticate middleware
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireAdmin,
};
