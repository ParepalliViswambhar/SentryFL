/**
 * Authentication Routes
 * Handles user registration, login, and authentication
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { validateBody } = require('../middleware/validation');
const userService = require('../services/userService');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    'string.alphanum': 'Username must contain only letters and numbers',
    'string.min': 'Username must be at least 3 characters long',
    'string.max': 'Username must not exceed 30 characters',
    'any.required': 'Username is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required',
  }),
  role: Joi.string().valid('user', 'admin').default('user').messages({
    'any.only': 'Role must be either "user" or "admin"',
  }),
});

const loginSchema = Joi.object({
  username: Joi.string().required().messages({
    'any.required': 'Username is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

/**
 * Generate JWT token for user
 *
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const expiresIn = process.env.JWT_EXPIRY || '24h';

  const payload = {
    userId: user.userId,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, secret, { expiresIn });
};

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', validateBody(registerSchema), async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Create user
    const user = await userService.createUser(username, password, role);

    // Generate JWT token
    const token = generateToken(user);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    if (error.message === 'Username already exists') {
      return res.status(409).json({
        error: 'Registration failed',
        message: error.message,
      });
    }

    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register user',
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and generate JWT token
 */
router.post('/login', validateBody(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    // Authenticate user
    const user = await userService.authenticateUser(username, password);

    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password',
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      message: 'Login successful',
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to authenticate user',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information (requires authentication)
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    user: {
      userId: req.user.userId,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 * Note: JWT tokens are stateless, so logout is handled client-side
 */
router.post('/logout', authenticate, (req, res) => {
  res.status(200).json({
    message: 'Logout successful',
  });
});

module.exports = router;
