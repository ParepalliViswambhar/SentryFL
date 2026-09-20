/**
 * Unit tests for authentication routes
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRouter = require('./auth');
const userService = require('../services/userService');
const { errorHandler } = require('../middleware/errorHandler');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  // Error handler
  app.use(errorHandler);

  return app;
};

describe('Authentication Routes', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.JWT_EXPIRY = '24h';
  });

  beforeEach(async () => {
    app = createTestApp();
    // Clear users before each test
    await userService.clearUsers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        password: 'password123',
        role: 'user',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toEqual({
        userId: expect.any(String),
        username: 'testuser',
        role: 'user',
      });

      // Verify token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('user');
    });

    test('should register user with default role "user" when role not specified', async () => {
      const userData = {
        username: 'testuser2',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('user');
    });

    test('should register an admin user', async () => {
      const userData = {
        username: 'adminuser',
        password: 'password123',
        role: 'admin',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('admin');
    });

    test('should return 400 when username is missing', async () => {
      const userData = {
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should return 400 when password is missing', async () => {
      const userData = {
        username: 'testuser',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should return 400 when username is too short', async () => {
      const userData = {
        username: 'ab',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      const errorMessages = response.body.validationErrors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('Username must be at least 3 characters long');
    });

    test('should return 400 when password is too short', async () => {
      const userData = {
        username: 'testuser',
        password: '12345',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      const errorMessages = response.body.validationErrors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('Password must be at least 6 characters long');
    });

    test('should return 400 when username contains non-alphanumeric characters', async () => {
      const userData = {
        username: 'test@user',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should return 400 when role is invalid', async () => {
      const userData = {
        username: 'testuser',
        password: 'password123',
        role: 'superadmin',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should return 409 when username already exists', async () => {
      const userData = {
        username: 'testuser',
        password: 'password123',
      };

      // Register first time
      await request(app).post('/api/auth/register').send(userData);

      // Try to register again with same username
      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'Registration failed');
      expect(response.body).toHaveProperty('message', 'Username already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await userService.createUser('testuser', 'password123', 'user');
    });

    test('should login successfully with valid credentials', async () => {
      const credentials = {
        username: 'testuser',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toEqual({
        userId: expect.any(String),
        username: 'testuser',
        role: 'user',
      });

      // Verify token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.username).toBe('testuser');
    });

    test('should login default admin user', async () => {
      const credentials = {
        username: 'admin',
        password: 'admin123',
      };

      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('admin');
    });

    test('should return 401 with invalid username', async () => {
      const credentials = {
        username: 'nonexistent',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body).toHaveProperty('message', 'Invalid username or password');
    });

    test('should return 401 with invalid password', async () => {
      const credentials = {
        username: 'testuser',
        password: 'wrongpassword',
      };

      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body).toHaveProperty('message', 'Invalid username or password');
    });

    test('should return 400 when username is missing', async () => {
      const credentials = {
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should return 400 when password is missing', async () => {
      const credentials = {
        username: 'testuser',
      };

      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/auth/me', () => {
    let token;
    let userId;

    beforeEach(async () => {
      // Create a test user and get token
      const user = await userService.createUser('testuser', 'password123', 'user');
      userId = user.userId;

      token = jwt.sign(
        { userId: user.userId, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    test('should return current user info with valid token', async () => {
      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual({
        userId,
        username: 'testuser',
        role: 'user',
      });
    });

    test('should return 401 when no token provided', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should return 401 when token is invalid', async () => {
      const response = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
    });
  });

  describe('POST /api/auth/logout', () => {
    let token;

    beforeEach(async () => {
      // Create a test user and get token
      const user = await userService.createUser('testuser', 'password123', 'user');

      token = jwt.sign(
        { userId: user.userId, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    test('should logout successfully with valid token', async () => {
      const response = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logout successful');
    });

    test('should return 401 when no token provided', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('Token expiration', () => {
    test('should generate token with correct expiration', async () => {
      const userData = {
        username: 'testuser',
        password: 'password123',
      };

      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(201);

      const decoded = jwt.decode(response.body.token);
      const issuedAt = decoded.iat;
      const expiresAt = decoded.exp;

      // Token should expire in 24 hours (86400 seconds)
      expect(expiresAt - issuedAt).toBe(86400);
    });
  });
});
