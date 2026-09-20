/**
 * Authorization and Multi-User Support Tests for Experiment Management API
 * Task 36.2: Implement authorization and multi-user support
 * Requirements: 38.3, 38.4, 38.5, 38.9, 38.10
 */

const request = require('supertest');
const MockAdapter = require('axios-mock-adapter');
const jwt = require('jsonwebtoken');
const { app } = require('../index');
const axiosClient = require('../utils/axiosClient');
const { experimentCache } = require('./experiments');
const { clearAuditLogs, getAuditLogs, AuditActionType } = require('../services/auditService');

// Create axios mock
const axiosMock = new MockAdapter(axiosClient);

// Helper to create JWT tokens for testing
const createTestToken = (userId, username, role = 'user') => {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign({ userId, username, role }, secret, { expiresIn: '24h' });
};

describe('Experiment Authorization and Multi-User Support', () => {
  // Test users
  const user1Token = createTestToken('user-1', 'alice', 'user');
  const user2Token = createTestToken('user-2', 'bob', 'user');
  const adminToken = createTestToken('admin-1', 'admin', 'admin');

  beforeEach(async () => {
    // Reset all mocks before each test
    axiosMock.reset();
    experimentCache.flushAll();
    await clearAuditLogs();
    jest.clearAllMocks();
  });

  afterAll(() => {
    axiosMock.restore();
  });

  // Requirement 38.3: Associate experiments with user accounts
  describe('Experiment User Association (Requirement 38.3)', () => {
    test('should associate new experiment with authenticated user', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
        experiment_name: 'Test Experiment',
      };

      // Mock Python backend response
      axiosMock.onPost('/train').reply(200, {
        status: 'pending',
        current_round: 0,
        start_time: null,
      });

      const response = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${user1Token}`)
        .send(validConfig)
        .expect(201);

      expect(response.body).toHaveProperty('experiment_id');
      expect(response.body).toHaveProperty('status', 'pending');

      // Verify experiment is cached with userId
      const experimentId = response.body.experiment_id;
      const cachedExperiment = experimentCache.get(`experiment:${experimentId}`);
      expect(cachedExperiment).toBeDefined();
      expect(cachedExperiment.userId).toBe('user-1');
      expect(cachedExperiment.username).toBe('alice');
    });

    test('should require authentication to create experiment', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
      };

      const response = await request(app)
        .post('/api/experiments')
        .send(validConfig)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  // Requirement 38.4: Enforce authorization (users can only access their own experiments)
  describe('Experiment Access Control (Requirement 38.4)', () => {
    test('should allow user to access their own experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock experiment owned by user-1
      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        current_round: 5,
        total_rounds: 10,
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('status', 'running');
    });

    test('should deny access to other users\' experiments', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174001';

      // Mock experiment owned by user-1
      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        current_round: 5,
        total_rounds: 10,
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      // user-2 tries to access user-1's experiment
      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Access denied');
      expect(response.body.message).toContain('do not have permission');
    });

    test('should deny user from deleting other users\' experiments', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174002';

      // Mock experiment owned by user-1
      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        config: { experiment_name: 'Test' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      // user-2 tries to delete user-1's experiment
      const response = await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Access denied');

      // Verify audit log shows failed deletion attempt
      const auditLogs = await getAuditLogs({ userId: 'user-2' });
      expect(auditLogs.logs.length).toBeGreaterThan(0);
      const deleteLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_DELETE);
      expect(deleteLog).toBeDefined();
      expect(deleteLog.success).toBe(false);
      expect(deleteLog.errorMessage).toBe('Access denied');
    });

    test('should deny user from pausing other users\' experiments', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174003';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        current_round: 5,
        config: { experiment_name: 'Test' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/pause`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    test('should deny user from resuming other users\' experiments', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174004';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'paused',
        current_round: 5,
        config: { experiment_name: 'Test' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/resume`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    test('should deny user from accessing other users\' experiment metrics', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174005';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });
  });

  // Requirement 38.5: Support admin role with access to all experiments
  describe('Admin Access Control (Requirement 38.5)', () => {
    test('should allow admin to access any user\'s experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174010';

      // Mock experiment owned by user-1
      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        current_round: 5,
        total_rounds: 10,
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      // Admin accesses user-1's experiment
      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('status', 'running');
    });

    test('should allow admin to delete any user\'s experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174011';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        config: { experiment_name: 'Test' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);
      axiosMock.onDelete(`/train/${experimentId}`).reply(200, {
        message: 'Experiment stopped',
      });

      // Admin deletes user-1's experiment
      const response = await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.message).toContain('stopped successfully');

      // Verify audit log shows successful deletion by admin
      const auditLogs = await getAuditLogs({ userId: 'admin-1' });
      const deleteLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_DELETE);
      expect(deleteLog).toBeDefined();
      expect(deleteLog.success).toBe(true);
      expect(deleteLog.username).toBe('admin');
    });

    test('should allow admin to pause any user\'s experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174012';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        config: { experiment_name: 'Test' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);
      axiosMock.onPost(`/train/${experimentId}/pause`).reply(200, {
        status: 'paused',
      });

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/pause`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'paused');
    });

    test('should allow admin to access any user\'s experiment metrics', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174013';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
      };

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.85,
          timestamp: new Date().toISOString(),
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.metrics).toHaveLength(1);
    });
  });

  // Requirement 38.7: Filter experiment list by current user
  describe('Experiment Filtering by User (Requirement 38.7)', () => {
    test('should return only user\'s own experiments in list', async () => {
      const allExperiments = [
        {
          experiment_id: 'exp-1',
          userId: 'user-1',
          username: 'alice',
          status: 'running',
          current_round: 5,
          total_rounds: 10,
        },
        {
          experiment_id: 'exp-2',
          userId: 'user-2',
          username: 'bob',
          status: 'completed',
          current_round: 10,
          total_rounds: 10,
        },
        {
          experiment_id: 'exp-3',
          userId: 'user-1',
          username: 'alice',
          status: 'pending',
          current_round: 0,
          total_rounds: 20,
        },
      ];

      // Mock Python backend returns all experiments
      axiosMock.onGet('/train').reply(200, {
        experiments: allExperiments,
        total: 3,
      });

      // user-1 requests experiment list
      const response = await request(app)
        .get('/api/experiments')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Should only see their own experiments (exp-1 and exp-3)
      expect(response.body.experiments).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.experiments.every((exp) => exp.userId === 'user-1')).toBe(true);
      expect(response.body.experiments.some((exp) => exp.experiment_id === 'exp-1')).toBe(true);
      expect(response.body.experiments.some((exp) => exp.experiment_id === 'exp-3')).toBe(true);
      expect(response.body.experiments.some((exp) => exp.experiment_id === 'exp-2')).toBe(false);
    });

    test('should return all experiments for admin user', async () => {
      const allExperiments = [
        {
          experiment_id: 'exp-1',
          userId: 'user-1',
          username: 'alice',
          status: 'running',
        },
        {
          experiment_id: 'exp-2',
          userId: 'user-2',
          username: 'bob',
          status: 'completed',
        },
        {
          experiment_id: 'exp-3',
          userId: 'user-3',
          username: 'charlie',
          status: 'pending',
        },
      ];

      axiosMock.onGet('/train').reply(200, {
        experiments: allExperiments,
        total: 3,
      });

      // Admin requests experiment list
      const response = await request(app)
        .get('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Should see all experiments
      expect(response.body.experiments).toHaveLength(3);
      expect(response.body.total).toBe(3);
    });

    test('should return empty list when user has no experiments', async () => {
      const allExperiments = [
        {
          experiment_id: 'exp-1',
          userId: 'user-1',
          username: 'alice',
          status: 'running',
        },
      ];

      axiosMock.onGet('/train').reply(200, {
        experiments: allExperiments,
        total: 1,
      });

      // user-2 has no experiments
      const response = await request(app)
        .get('/api/experiments')
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(response.body.experiments).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    test('should filter by user even with status filter', async () => {
      const allExperiments = [
        {
          experiment_id: 'exp-1',
          userId: 'user-1',
          username: 'alice',
          status: 'running',
        },
        {
          experiment_id: 'exp-2',
          userId: 'user-2',
          username: 'bob',
          status: 'running',
        },
        {
          experiment_id: 'exp-3',
          userId: 'user-1',
          username: 'alice',
          status: 'completed',
        },
      ];

      axiosMock.onGet('/train').reply(200, {
        experiments: allExperiments,
        total: 3,
      });

      const response = await request(app)
        .get('/api/experiments?status=running')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Should only see user-1's experiments (exp-1 and exp-3)
      // Note: The status filter is sent to backend but user filtering happens on API server
      expect(response.body.experiments).toHaveLength(2);
      expect(response.body.experiments.every((exp) => exp.userId === 'user-1')).toBe(true);
    });
  });

  // Requirement 38.10: Log user actions for audit trail
  describe('Audit Trail Logging (Requirement 38.10)', () => {
    test('should log experiment creation with user info', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
        experiment_name: 'Test Experiment',
      };

      axiosMock.onPost('/train').reply(200, {
        status: 'pending',
        current_round: 0,
        start_time: null,
      });

      await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${user1Token}`)
        .send(validConfig)
        .expect(201);

      // Verify audit log
      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      expect(auditLogs.logs.length).toBeGreaterThan(0);

      const createLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_CREATE);
      expect(createLog).toBeDefined();
      expect(createLog.userId).toBe('user-1');
      expect(createLog.username).toBe('alice');
      expect(createLog.resourceType).toBe('experiment');
      expect(createLog.success).toBe(true);
      expect(createLog.metadata).toHaveProperty('experimentName', 'Test Experiment');
      expect(createLog.metadata).toHaveProperty('numRounds', 10);
      // Note: dataset is part of config but not logged separately in metadata
    });

    test('should log failed experiment creation', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
        experiment_name: 'Failed Experiment',
      };

      // Mock backend failure
      axiosMock.onPost('/train').networkError();

      await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${user1Token}`)
        .send(validConfig)
        .expect(500);

      // Verify audit log shows failure
      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      const createLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_CREATE);
      expect(createLog).toBeDefined();
      expect(createLog.success).toBe(false);
      expect(createLog.errorMessage).toBeDefined();
    });

    test('should log experiment deletion with user info', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174020';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        config: { experiment_name: 'Test Experiment' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);
      axiosMock.onDelete(`/train/${experimentId}`).reply(200, {
        message: 'Experiment stopped',
      });

      await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Verify audit log
      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      const deleteLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_DELETE);
      expect(deleteLog).toBeDefined();
      expect(deleteLog.userId).toBe('user-1');
      expect(deleteLog.username).toBe('alice');
      expect(deleteLog.resourceType).toBe('experiment');
      expect(deleteLog.resourceId).toBe(experimentId);
      expect(deleteLog.success).toBe(true);
      expect(deleteLog.metadata).toHaveProperty('experimentName', 'Test Experiment');
      expect(deleteLog.metadata).toHaveProperty('status', 'running');
    });

    test('should log experiment pause with user info', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174021';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        current_round: 5,
        config: { experiment_name: 'Test Experiment' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);
      axiosMock.onPost(`/train/${experimentId}/pause`).reply(200, {
        status: 'paused',
      });

      await request(app)
        .post(`/api/experiments/${experimentId}/pause`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Verify audit log
      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      const pauseLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_PAUSE);
      expect(pauseLog).toBeDefined();
      expect(pauseLog.success).toBe(true);
      expect(pauseLog.metadata).toHaveProperty('currentRound', 5);
    });

    test('should log experiment resume with user info', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174022';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'paused',
        current_round: 5,
        config: { experiment_name: 'Test Experiment' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);
      axiosMock.onPost(`/train/${experimentId}/resume`).reply(200, {
        status: 'running',
      });

      await request(app)
        .post(`/api/experiments/${experimentId}/resume`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Verify audit log
      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      const resumeLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_RESUME);
      expect(resumeLog).toBeDefined();
      expect(resumeLog.success).toBe(true);
    });

    test('should log unauthorized access attempts', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174023';

      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        config: { experiment_name: 'Test' },
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      // user-2 tries to delete user-1's experiment
      await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      // Verify audit log shows failed attempt
      const auditLogs = await getAuditLogs({ userId: 'user-2' });
      const deleteLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_DELETE);
      expect(deleteLog).toBeDefined();
      expect(deleteLog.success).toBe(false);
      expect(deleteLog.errorMessage).toBe('Access denied');
      expect(deleteLog.metadata.reason).toBe('access_denied');
    });

    test('should include IP address in audit logs', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
        experiment_name: 'Test',
      };

      axiosMock.onPost('/train').reply(200, {
        status: 'pending',
        current_round: 0,
      });

      await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${user1Token}`)
        .send(validConfig)
        .expect(201);

      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      const createLog = auditLogs.logs.find((log) => log.action === AuditActionType.EXPERIMENT_CREATE);
      expect(createLog).toBeDefined();
      expect(createLog.ipAddress).toBeDefined();
      // In tests, IP might be ::ffff:127.0.0.1 or similar
      expect(typeof createLog.ipAddress).toBe('string');
    });
  });

  // Additional edge cases
  describe('Edge Cases and Security', () => {
    test('should not bypass authorization with invalid token', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174030';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication failed');
    });

    test('should not allow access without authorization header', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174031';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should handle expired tokens gracefully', async () => {
      const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const expiredToken = jwt.sign({ userId: 'user-1', username: 'alice', role: 'user' }, secret, {
        expiresIn: '-1h',
      });

      const response = await request(app)
        .get('/api/experiments')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body.message).toContain('expired');
    });
  });

  // Integration test for full authorization workflow
  describe('Full Authorization Workflow Integration', () => {
    test('complete experiment lifecycle with authorization checks', async () => {
      // Step 1: User creates experiment
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
        experiment_name: 'Integration Test',
      };

      axiosMock.onPost('/train').reply(200, {
        status: 'pending',
        current_round: 0,
        start_time: null,
      });

      const createResponse = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${user1Token}`)
        .send(validConfig)
        .expect(201);

      const experimentId = createResponse.body.experiment_id;
      expect(experimentId).toBeDefined();

      // Step 2: User can access their own experiment
      const mockExperiment = {
        userId: 'user-1',
        username: 'alice',
        status: 'running',
        current_round: 5,
        total_rounds: 10,
      };

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Step 3: Other user cannot access it
      await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      // Step 4: Admin can access it
      await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Step 5: User can pause their experiment
      axiosMock.onPost(`/train/${experimentId}/pause`).reply(200, {
        status: 'paused',
      });

      await request(app)
        .post(`/api/experiments/${experimentId}/pause`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Step 6: User can resume their experiment
      axiosMock.onPost(`/train/${experimentId}/resume`).reply(200, {
        status: 'running',
      });

      await request(app)
        .post(`/api/experiments/${experimentId}/resume`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Step 7: User can access metrics
      const mockMetrics = [
        {
          round: 5,
          metric_type: 'accuracy',
          value: 0.88,
          timestamp: new Date().toISOString(),
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Step 8: User can delete their experiment
      axiosMock.onDelete(`/train/${experimentId}`).reply(200, {
        message: 'Experiment stopped',
      });

      await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Step 9: Verify all actions are logged
      const auditLogs = await getAuditLogs({ userId: 'user-1' });
      expect(auditLogs.logs.length).toBeGreaterThanOrEqual(4); // create, pause, resume, delete

      const actionTypes = auditLogs.logs.map((log) => log.action);
      expect(actionTypes).toContain(AuditActionType.EXPERIMENT_CREATE);
      expect(actionTypes).toContain(AuditActionType.EXPERIMENT_PAUSE);
      expect(actionTypes).toContain(AuditActionType.EXPERIMENT_RESUME);
      expect(actionTypes).toContain(AuditActionType.EXPERIMENT_DELETE);

      // All user-1 actions should be successful
      const user1Logs = auditLogs.logs.filter((log) => log.userId === 'user-1');
      expect(user1Logs.every((log) => log.success)).toBe(true);
    });
  });
});
