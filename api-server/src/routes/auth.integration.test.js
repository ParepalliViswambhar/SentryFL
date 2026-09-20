/**
 * Integration tests for authentication flows
 * Task 36.3: Write unit tests for authentication
 * Tests user registration, login with valid JWT tokens, protected routes, and token expiration
 * Requirements: 38.1, 38.2, 38.9
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRouter = require('./auth');
const experimentsRouter = require('./experiments');
const configsRouter = require('./configs');
const userService = require('../services/userService');
const { errorHandler } = require('../middleware/errorHandler');

// Create test app with multiple routes
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mount routers
  app.use('/api/auth', authRouter);
  app.use('/api/experiments', experimentsRouter);
  app.use('/api/configs', configsRouter);

  // Error handler
  app.use(errorHandler);

  return app;
};

describe('Authentication Integration Tests', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.JWT_EXPIRY = '24h';
    process.env.PYTHON_BACKEND_URL = 'http://localhost:5000';
  });

  beforeEach(async () => {
    app = createTestApp();
    // Clear users before each test
    await userService.clearUsers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration Flow', () => {
    test('should register a new user and return valid JWT token', async () => {
      const userData = {
        username: 'newuser',
        password: 'securepass123',
        role: 'user',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        userId: expect.any(String),
        username: 'newuser',
        role: 'user',
      });

      // Verify token is valid JWT
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded).toMatchObject({
        userId: expect.any(String),
        username: 'newuser',
        role: 'user',
        iat: expect.any(Number),
        exp: expect.any(Number),
      });

      // Verify token expires in 24 hours
      const expirationTime = decoded.exp - decoded.iat;
      expect(expirationTime).toBe(86400); // 24 hours in seconds
    });

    test('should create multiple users with unique IDs', async () => {
      const user1Data = {
        username: 'user1',
        password: 'password123',
      };

      const user2Data = {
        username: 'user2',
        password: 'password456',
      };

      const response1 = await request(app)
        .post('/api/auth/register')
        .send(user1Data);

      const response2 = await request(app)
        .post('/api/auth/register')
        .send(user2Data);

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response1.body.user.userId).not.toBe(response2.body.user.userId);
      expect(response1.body.token).not.toBe(response2.body.token);
    });
  });

  describe('User Login Flow', () => {
    beforeEach(async () => {
      // Register a test user
      await userService.createUser('testuser', 'password123', 'user');
    });

    test('should login with valid credentials and return JWT token', async () => {
      const credentials = {
        username: 'testuser',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        userId: expect.any(String),
        username: 'testuser',
        role: 'user',
      });

      // Verify token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('user');
    });

    test('should reject login with incorrect password', async () => {
      const credentials = {
        username: 'testuser',
        password: 'wrongpassword',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body).toHaveProperty('message', 'Invalid username or password');
      expect(response.body).not.toHaveProperty('token');
    });

    test('should reject login with non-existent username', async () => {
      const credentials = {
        username: 'nonexistent',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body).not.toHaveProperty('token');
    });
  });

  describe('Protected Routes - Authentication Required', () => {
    let validToken;
    let userId;

    beforeEach(async () => {
      // Create a test user and generate token
      const user = await userService.createUser('authuser', 'password123', 'user');
      userId = user.userId;

      validToken = jwt.sign(
        { userId: user.userId, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    test('should reject requests to /api/auth/me without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
      expect(response.body).toHaveProperty('message', 'No authorization token provided');
    });

    test('should allow access to /api/auth/me with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        userId,
        username: 'authuser',
        role: 'user',
      });
    });

    test('should reject POST /api/experiments without token', async () => {
      const experimentConfig = {
        name: 'Test Experiment',
        dataset: 'SMD',
        num_clients: 5,
        num_rounds: 10,
      };

      const response = await request(app)
        .post('/api/experiments')
        .send(experimentConfig);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should reject GET /api/experiments without token', async () => {
      const response = await request(app)
        .get('/api/experiments');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should allow POST /api/configs without token (configs are public)', async () => {
      // Note: Config endpoints are public and don't require authentication
      const configData = {
        name: 'Test Config',
        model_type: 'lstm',
        dataset: 'nsl-kdd',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 5,
        epsilon: 1.0,
        delta: 0.00001,
      };

      const response = await request(app)
        .post('/api/configs')
        .send(configData);

      // Configs endpoints are public, so this should succeed
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message', 'Configuration created successfully');
    });

    test('should reject DELETE /api/experiments/:id without token', async () => {
      const response = await request(app)
        .delete('/api/experiments/test-id');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should reject requests with invalid token format', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token123');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
      expect(response.body).toHaveProperty('message', 'Invalid authorization header format. Expected: Bearer <token>');
    });

    test('should reject requests with malformed JWT token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body).toHaveProperty('message', 'Invalid token');
    });
  });

  describe('Token Expiration - Session Timeout (Requirement 38.9)', () => {
    test('should reject requests with expired token', (done) => {
      // Create a token that expires in 1 second
      const user = {
        userId: 'test-user-id',
        username: 'testuser',
        role: 'user',
      };

      const expiredToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1s' });

      // Wait 2 seconds to ensure token is expired
      setTimeout(async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${expiredToken}`);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Authentication failed');
        expect(response.body).toHaveProperty('message', 'Token expired');
        done();
      }, 2000);
    });

    test('should generate token with 24 hour expiration by default', async () => {
      const userData = {
        username: 'expirytest',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(201);

      // Decode token and check expiration
      const decoded = jwt.decode(response.body.token);
      const expirationDuration = decoded.exp - decoded.iat;

      // Should be 24 hours (86400 seconds)
      expect(expirationDuration).toBe(86400);
    });

    test('should reject expired token on protected experiment route', (done) => {
      const user = {
        userId: 'test-user-id',
        username: 'testuser',
        role: 'user',
      };

      const expiredToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1s' });

      setTimeout(async () => {
        const response = await request(app)
          .get('/api/experiments')
          .set('Authorization', `Bearer ${expiredToken}`);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error', 'Authentication failed');
        expect(response.body).toHaveProperty('message', 'Token expired');
        done();
      }, 2000);
    });
  });

  describe('Registration and Login Edge Cases', () => {
    test('should prevent duplicate username registration', async () => {
      const userData = {
        username: 'duplicateuser',
        password: 'password123',
      };

      // First registration should succeed
      const firstResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(firstResponse.status).toBe(201);

      // Second registration with same username should fail
      const secondResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body).toHaveProperty('error', 'Registration failed');
      expect(secondResponse.body).toHaveProperty('message', 'Username already exists');
    });

    test('should enforce minimum username length', async () => {
      const userData = {
        username: 'ab',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should enforce minimum password length', async () => {
      const userData = {
        username: 'validuser',
        password: '12345',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('Token Validation Across Multiple Requests', () => {
    let validToken;

    beforeEach(async () => {
      const userData = {
        username: 'persistentuser',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      validToken = response.body.token;
    });

    test('should use same token for multiple authenticated requests', async () => {
      // First request
      const response1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response1.status).toBe(200);

      // Second request with same token
      const response2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response2.status).toBe(200);
      expect(response1.body.user.userId).toBe(response2.body.user.userId);
    });

    test('should maintain user context across requests', async () => {
      const response1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      const response2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response1.body.user).toEqual(response2.body.user);
    });
  });

  describe('Logout Functionality', () => {
    let validToken;

    beforeEach(async () => {
      const user = await userService.createUser('logoutuser', 'password123', 'user');

      validToken = jwt.sign(
        { userId: user.userId, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    test('should successfully logout with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logout successful');
    });

    test('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
    });
  });
});
