/**
 * Unit tests for JWT authentication middleware
 */

const jwt = require('jsonwebtoken');
const { authenticate, optionalAuthenticate, requireAdmin } = require('./authenticate');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Setup mock request, response, and next function
    req = {
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();

    // Set test JWT secret
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    test('should return 401 when no authorization header is provided', () => {
      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'No authorization token provided',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when authorization header does not start with Bearer', () => {
      req.headers.authorization = 'InvalidFormat token123';

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Invalid authorization header format. Expected: Bearer <token>',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when token is empty', () => {
      req.headers.authorization = 'Bearer ';

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'No token provided',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when token is invalid', () => {
      req.headers.authorization = 'Bearer invalid-token';

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Invalid token',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when token is expired', (done) => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: 'user123', username: 'testuser', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      req.headers.authorization = `Bearer ${expiredToken}`;

      // Wait a bit to ensure token is expired
      setTimeout(() => {
        authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Authentication failed',
          message: 'Token expired',
        });
        expect(next).not.toHaveBeenCalled();
        done();
      }, 100);
    });

    test('should attach user info to request and call next when token is valid', () => {
      const payload = {
        userId: 'user123',
        username: 'testuser',
        role: 'user',
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

      req.headers.authorization = `Bearer ${token}`;

      authenticate(req, res, next);

      expect(req.user).toEqual(payload);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('should default role to "user" when not provided in token', () => {
      const payload = {
        userId: 'user123',
        username: 'testuser',
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

      req.headers.authorization = `Bearer ${token}`;

      authenticate(req, res, next);

      expect(req.user).toEqual({
        userId: 'user123',
        username: 'testuser',
        role: 'user',
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuthenticate middleware', () => {
    test('should call next without setting user when no authorization header', () => {
      optionalAuthenticate(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should call next without setting user when authorization header is invalid format', () => {
      req.headers.authorization = 'InvalidFormat token123';

      optionalAuthenticate(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should call next without setting user when token is invalid', () => {
      req.headers.authorization = 'Bearer invalid-token';

      optionalAuthenticate(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should attach user info and call next when token is valid', () => {
      const payload = {
        userId: 'user123',
        username: 'testuser',
        role: 'admin',
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

      req.headers.authorization = `Bearer ${token}`;

      optionalAuthenticate(req, res, next);

      expect(req.user).toEqual(payload);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin middleware', () => {
    test('should return 401 when user is not authenticated', () => {
      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 when user is not admin', () => {
      req.user = {
        userId: 'user123',
        username: 'testuser',
        role: 'user',
      };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Admin access required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next when user is admin', () => {
      req.user = {
        userId: 'admin123',
        username: 'adminuser',
        role: 'admin',
      };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
