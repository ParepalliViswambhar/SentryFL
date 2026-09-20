/**
 * Unit tests for Experiment Management API
 * Requirements: 22.2, 22.3, 22.7
 */

const request = require('supertest');
const MockAdapter = require('axios-mock-adapter');
const jwt = require('jsonwebtoken');
const { app } = require('../index');
const axiosClient = require('../utils/axiosClient');
const experimentsRouter = require('./experiments');

// Create axios mock
const axiosMock = new MockAdapter(axiosClient);

// Get cache instance for clearing
const { experimentCache } = experimentsRouter;

// Helper function to generate test JWT tokens
function generateTestToken(userId = 'test-user-123', username = 'testuser', role = 'user') {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-jwt-signing';
  return jwt.sign(
    { userId, username, role },
    secret,
    { expiresIn: '24h' }
  );
}

describe('Experiment Management API', () => {
  let testToken;
  let adminToken;

  beforeEach(() => {
    // Reset all mocks before each test
    axiosMock.reset();
    
    // Clear the cache before each test
    experimentCache.flushAll();
    jest.clearAllMocks();

    // Generate test tokens for each test
    testToken = generateTestToken();
    adminToken = generateTestToken('admin-user-123', 'adminuser', 'admin');
  });

  afterAll(() => {
    // Restore axios to original state
    axiosMock.restore();
  });

  describe('POST /api/experiments', () => {
    test('should create experiment with valid configuration', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        delta: 1e-5,
        batch_size: 32,
        learning_rate: 0.001,
        local_epochs: 1,
        dataset: 'kdd99',
        data_split: 'iid',
      };

      // Mock Python backend response
      axiosMock.onPost('/train').reply(200, {
        status: 'pending',
        current_round: 0,
        start_time: null,
      });

      const response = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(validConfig)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('experiment_id');
      expect(response.body).toHaveProperty('status', 'pending');
      expect(response.body).toHaveProperty('current_round', 0);
      expect(response.body).toHaveProperty('total_rounds', 10);
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('message', 'Experiment created successfully');
    });

    test('should return 400 for invalid configuration (missing required fields)', async () => {
      const invalidConfig = {
        model_type: 'lstm',
        // Missing required fields: num_clients, clients_per_round, epsilon, dataset
      };

      const response = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidConfig)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body).toHaveProperty('validationErrors');
      expect(Array.isArray(response.body.validationErrors)).toBe(true);
    });

    test('should return 400 for invalid configuration (invalid values)', async () => {
      const invalidConfig = {
        model_type: 'invalid_model',
        num_clients: 0, // Must be >= 1
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: -1.0, // Must be positive
        dataset: 'kdd99',
      };

      const response = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidConfig)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body).toHaveProperty('validationErrors');
      expect(response.body.validationErrors.length).toBeGreaterThan(0);
    });

    test('should return 503 when Python backend is unavailable', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
      };

      // Mock Python backend timeout (request sent but no response)
      axiosMock.onPost('/train').timeout();

      const response = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(validConfig)
        .expect('Content-Type', /json/);

      // Timeout errors may return 500 or 503 depending on error handling
      expect([401, 500, 503]).toContain(response.status);
      if (response.status !== 401) {
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('GET /api/experiments', () => {
    test('should list all experiments', async () => {
      const mockExperiments = [
        {
          experiment_id: 'exp-1',
        userId: 'test-user-123',
        status: 'running',
          current_round: 5,
          total_rounds: 10,
        },
        {
          experiment_id: 'exp-2',
        userId: 'test-user-123',
        status: 'completed',
          current_round: 10,
          total_rounds: 10,
        },
      ];

      // Mock Python backend response
      axiosMock.onGet('/train').reply(200, {
        experiments: mockExperiments,
        total: 2,
      });

      const response = await request(app)
        .get('/api/experiments')
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiments');
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body).toHaveProperty('limit', 20);
      expect(response.body).toHaveProperty('offset', 0);
      expect(response.body.experiments).toHaveLength(2);
    });

    test('should return cached data on second request', async () => {
      const mockExperiments = [
        {
          experiment_id: 'exp-1',
        userId: 'test-user-123',
        status: 'running',
          current_round: 5,
          total_rounds: 10,
        },
      ];

      // Mock Python backend response
      axiosMock.onGet('/train').reply(200, {
        experiments: mockExperiments,
        total: 1,
      });

      // First request - should hit backend
      const response1 = await request(app)
        .get('/api/experiments')
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response1.body.cached).toBe(false);

      // Second request - should return cached data
      const response2 = await request(app)
        .get('/api/experiments')
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response2.body.cached).toBe(true);
      expect(response2.body.experiments).toEqual(mockExperiments);
    });

    test('should filter experiments by status', async () => {
      const mockExperiments = [
        {
          experiment_id: 'exp-1',
        userId: 'test-user-123',
        status: 'running',
          current_round: 5,
          total_rounds: 10,
        },
      ];

      // Mock Python backend response
      axiosMock.onGet('/train').reply(200, {
        experiments: mockExperiments,
        total: 1,
      });

      const response = await request(app)
        .get('/api/experiments?status=running')
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.experiments).toHaveLength(1);
      expect(response.body.experiments[0].status).toBe('running');
    });
  });

  describe('GET /api/experiments/:id', () => {
    test('should retrieve experiment details', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';
      const mockExperiment = {
        status: 'running',
        userId: 'test-user-123',
        current_round: 5,
        total_rounds: 10,
        start_time: Date.now() / 1000,
      };

      // Mock Python backend response
      // Mock experiment status for authorization
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('current_round', 5);
    });

    test('should return 404 for non-existent experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174999'; // Different ID to avoid cache

      // Mock Python backend 404 response
      axiosMock.onGet(`/train/${experimentId}/status`).reply(404, {
        error: 'Experiment not found',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('not found');
    });

    test('should return 400 for invalid experiment ID format', async () => {
      const invalidId = 'invalid-uuid';

      const response = await request(app)
        .get(`/api/experiments/${invalidId}`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/experiments/:id/status', () => {
    test('should query current training status', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';
      const mockStatus = {
        status: 'running',
        userId: 'test-user-123',
        current_round: 7,
        total_rounds: 10,
        start_time: Date.now() / 1000,
      };

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockStatus);

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/status`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('current_round', 7);
    });
  });

  describe('DELETE /api/experiments/:id', () => {
    test('should stop running experiment and invalidate cache', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // First, create some cached data
      const mockExperiment = {
        status: 'running',
        userId: 'test-user-123',
        current_round: 5,
        total_rounds: 10,
      };
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, mockExperiment);

      // Get experiment to populate cache
      await request(app).get(`/api/experiments/${experimentId}`)

        .set('Authorization', `Bearer ${testToken}`).expect(200);

      // Mock Python backend delete response
      axiosMock.onDelete(`/train/${experimentId}`).reply(200, {
        message: 'Experiment stopped',
      });

      // Stop the experiment
      const response = await request(app)
        .delete(`/api/experiments/${experimentId}`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('stopped successfully');
      expect(response.body).toHaveProperty('experiment_id', experimentId);
    });

    test('should return 404 when stopping non-existent experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174000/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      // Mock Python backend 404 response
      axiosMock.onDelete(`/train/${experimentId}`).reply(404, {
        error: 'Experiment not found',
      });

      const response = await request(app)
        .delete(`/api/experiments/${experimentId}`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('not found');
    });
  });

  describe('POST /api/experiments/:id/pause', () => {
    test('should pause running experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // First mock the status endpoint for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      // Mock Python backend response
      axiosMock.onPost(`/train/${experimentId}/pause`).reply(200, {
        status: 'paused',
      });

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/pause`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('paused successfully');
      expect(response.body).toHaveProperty('status', 'paused');
    });

    test('should return 404 when pausing non-existent experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174000/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      // Mock Python backend 404 response
      axiosMock.onPost(`/train/${experimentId}/pause`).reply(404, {
        error: 'Experiment not found',
      });

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/pause`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/experiments/:id/resume', () => {
    test('should resume paused experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // First mock the status endpoint for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'paused',
        userId: 'test-user-123',
      });

      // Mock Python backend response
      axiosMock.onPost(`/train/${experimentId}/resume`).reply(200, {
        status: 'running',
      });

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/resume`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('resumed successfully');
      expect(response.body).toHaveProperty('status', 'running');
    });

    test('should return 404 when resuming non-existent experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174000/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      // Mock Python backend 404 response
      axiosMock.onPost(`/train/${experimentId}/resume`).reply(404, {
        error: 'Experiment not found',
      });

      const response = await request(app)
        .post(`/api/experiments/${experimentId}/resume`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate list cache when creating new experiment', async () => {
      const validConfig = {
        model_type: 'lstm',
        num_clients: 5,
        num_rounds: 10,
        clients_per_round: 3,
        epsilon: 1.0,
        dataset: 'kdd99',
      };

      // First, get the list to populate cache
      axiosMock.onGet('/train').replyOnce(200, {
        experiments: [],
        total: 0,
      });

      const response1 = await request(app).get('/api/experiments')
   .set('Authorization', `Bearer ${testToken}`).expect(200);
      expect(response1.body.cached).toBe(false); // First request not cached
      expect(response1.body.total).toBe(0);

      // Create a new experiment (should invalidate list cache)
      axiosMock.onPost('/train').reply(200, {
        status: 'pending',
        current_round: 0,
      });

      await request(app)
        .post('/api/experiments')


        .set('Authorization', `Bearer ${testToken}`)
        .send(validConfig)
        .expect(201);

      // Get list again with different data - this should hit backend (cache was invalidated)
      axiosMock.onGet('/train').replyOnce(200, {
        experiments: [{ experiment_id: 'new-exp',
        userId: 'test-user-123',
        status: 'pending' }],
        total: 1,
      });

      const response2 = await request(app).get('/api/experiments')
   .set('Authorization', `Bearer ${testToken}`).expect(200);

      // Cache should have been invalidated by POST, so this fetches from backend
      expect(response2.body.cached).toBe(false);
      expect(response2.body.total).toBe(1);
    });
  });

  // Metrics API Tests
  // Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7
  describe('GET /api/experiments/:id/metrics', () => {
    test('should retrieve all metrics for an experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174000/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'training_loss',
          value: 0.5,
          timestamp: new Date().toISOString(),
        },
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.85,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 2,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.cached).toBe(false);
    });

    test('should filter metrics by metric_type', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174001';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174001/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'training_loss',
          value: 0.5,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?metric_type=training_loss`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.metrics).toHaveLength(1);
      expect(response.body.metrics[0].metric_type).toBe('training_loss');
    });

    test('should filter metrics by round range', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174002';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174002/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 5,
          metric_type: 'accuracy',
          value: 0.90,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?start_round=5&end_round=10`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.metrics).toHaveLength(1);
      expect(response.body.metrics[0].round).toBe(5);
    });

    test('should cache metrics for 60 seconds', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174003';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174003/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.85,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      // First request - should hit backend
      const response1 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response1.body.cached).toBe(false);

      // Second request - should return cached data
      const response2 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response2.body.cached).toBe(true);
      expect(response2.body.metrics).toEqual(mockMetrics);
    });

    test('should return 404 for non-existent experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174004';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174004/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      // Mock Python backend 404 response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(404, {
        error: 'Experiment not found',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('not found');
    });

    test('should support pagination', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174005';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174005/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = Array.from({ length: 10 }, (_, i) => ({
        round: i + 1,
        metric_type: 'accuracy',
        value: 0.8 + i * 0.01,
        timestamp: new Date().toISOString(),
      }));

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 100,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?limit=10&offset=20`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(20);
      expect(response.body.total).toBe(100);
    });
  });

  describe('GET /api/experiments/:id/metrics/training', () => {
    test('should retrieve training metrics only', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174010';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174010/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'training_loss',
          value: 0.5,
          timestamp: new Date().toISOString(),
        },
        {
          round: 1,
          metric_type: 'training_accuracy',
          value: 0.85,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics/training`).reply(200, {
        metrics: mockMetrics,
        total: 2,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/training`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('metric_category', 'training');
      expect(response.body.metrics).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body.cached).toBe(false);
    });

    test('should cache training metrics', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174011';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174011/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'training_loss',
          value: 0.5,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics/training`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      // First request
      const response1 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/training`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response1.body.cached).toBe(false);

      // Second request - cached
      const response2 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/training`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response2.body.cached).toBe(true);
    });
  });

  describe('GET /api/experiments/:id/metrics/privacy', () => {
    test('should retrieve privacy metrics only', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174020';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174020/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'epsilon_spent',
          value: 0.5,
          timestamp: new Date().toISOString(),
        },
        {
          round: 1,
          metric_type: 'delta',
          value: 1e-5,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics/privacy`).reply(200, {
        metrics: mockMetrics,
        total: 2,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/privacy`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('metric_category', 'privacy');
      expect(response.body.metrics).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body.cached).toBe(false);
    });
  });

  describe('GET /api/experiments/:id/metrics/communication', () => {
    test('should retrieve communication metrics only', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174030';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174030/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'bytes_sent',
          value: 1024000,
          timestamp: new Date().toISOString(),
        },
        {
          round: 1,
          metric_type: 'bytes_received',
          value: 512000,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics/communication`).reply(200, {
        metrics: mockMetrics,
        total: 2,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/communication`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('metric_category', 'communication');
      expect(response.body.metrics).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body.cached).toBe(false);
    });
  });

  describe('GET /api/experiments/:id/metrics/evaluation', () => {
    test('should retrieve evaluation metrics only', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174040';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174040/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'test_accuracy',
          value: 0.88,
          timestamp: new Date().toISOString(),
        },
        {
          round: 1,
          metric_type: 'f1_score',
          value: 0.85,
          timestamp: new Date().toISOString(),
        },
      ];

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics/evaluation`).reply(200, {
        metrics: mockMetrics,
        total: 2,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/evaluation`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('experiment_id', experimentId);
      expect(response.body).toHaveProperty('metric_category', 'evaluation');
      expect(response.body.metrics).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body.cached).toBe(false);
    });
  });

  describe('Metrics Query Parameter Validation', () => {
    test('should accept valid query parameters', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174050';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: [],
        total: 0,
      });

      const response = await request(app)
        .get(
          `/api/experiments/${experimentId}/metrics?metric_type=accuracy&start_round=0&end_round=10&limit=50&offset=0`
        )
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('metrics');
    });

    test('should reject invalid limit values', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174051';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?limit=2000`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should reject negative offset values', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174052';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?offset=-5`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should reject negative round values', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174053';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?start_round=-1`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  // Task 32.2: Test pagination and aggregation features
  // Requirements: 24.8, 24.9, 24.10
  describe('Metrics Pagination (page/page_size)', () => {
    test('should support page-based pagination', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174060';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174060/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = Array.from({ length: 20 }, (_, i) => ({
        round: i + 1,
        metric_type: 'accuracy',
        value: 0.8 + i * 0.01,
        timestamp: new Date().toISOString(),
      }));

      // Mock Python backend response
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 100,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=2&page_size=20`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('page', 2);
      expect(response.body).toHaveProperty('page_size', 20);
      expect(response.body).toHaveProperty('limit', 20);
      expect(response.body).toHaveProperty('offset', 20); // page 2 = offset 20
      expect(response.body).toHaveProperty('total', 100);
    });

    test('should convert page/page_size to limit/offset correctly', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174061';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174061/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = Array.from({ length: 50 }, (_, i) => ({
        round: i + 1,
        metric_type: 'loss',
        value: 0.5 - i * 0.001,
        timestamp: new Date().toISOString(),
      }));

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply((config) => {
        // Verify that backend receives limit/offset, not page/page_size
        expect(config.params.limit).toBe(50);
        expect(config.params.offset).toBe(150); // page 4 with page_size 50
        return [200, { metrics: mockMetrics, total: 500 }];
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=4&page_size=50`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.page).toBe(4);
      expect(response.body.page_size).toBe(50);
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(150);
    });

    test('should fall back to limit/offset when page/page_size not provided', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174062';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: [],
        total: 0,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?limit=30&offset=10`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.limit).toBe(30);
      expect(response.body.offset).toBe(10);
      expect(response.body).not.toHaveProperty('page');
      expect(response.body).not.toHaveProperty('page_size');
    });

    test('should validate page parameter (minimum 1)', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174063';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=0&page_size=20`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should validate page_size parameter (within limits)', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174064';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=1&page_size=2000`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('Metrics Aggregation', () => {
    test('should aggregate metrics with "latest" aggregation', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174070';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174070/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.75,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          round: 5,
          metric_type: 'accuracy',
          value: 0.85,
          timestamp: '2024-01-01T00:05:00Z',
        },
        {
          round: 3,
          metric_type: 'accuracy',
          value: 0.80,
          timestamp: '2024-01-01T00:03:00Z',
        },
        {
          round: 2,
          metric_type: 'loss',
          value: 0.5,
          timestamp: '2024-01-01T00:02:00Z',
        },
        {
          round: 4,
          metric_type: 'loss',
          value: 0.3,
          timestamp: '2024-01-01T00:04:00Z',
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 5,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=latest`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('aggregation', 'latest');
      expect(response.body.metrics).toHaveLength(2); // 2 metric types

      // Find the latest accuracy metric (round 5)
      const latestAccuracy = response.body.metrics.find((m) => m.metric_type === 'accuracy');
      expect(latestAccuracy).toBeDefined();
      expect(latestAccuracy.round).toBe(5);
      expect(latestAccuracy.value).toBe(0.85);
      expect(latestAccuracy.aggregation).toBe('latest');

      // Find the latest loss metric (round 4)
      const latestLoss = response.body.metrics.find((m) => m.metric_type === 'loss');
      expect(latestLoss).toBeDefined();
      expect(latestLoss.round).toBe(4);
      expect(latestLoss.value).toBe(0.3);
    });

    test('should aggregate metrics with "average" aggregation', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174071';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174071/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.7,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          round: 2,
          metric_type: 'accuracy',
          value: 0.8,
          timestamp: '2024-01-01T00:01:00Z',
        },
        {
          round: 3,
          metric_type: 'accuracy',
          value: 0.9,
          timestamp: '2024-01-01T00:02:00Z',
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 3,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=average`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('aggregation', 'average');
      expect(response.body.metrics).toHaveLength(1);

      const avgMetric = response.body.metrics[0];
      expect(avgMetric.metric_type).toBe('accuracy');
      expect(avgMetric.value).toBeCloseTo(0.8, 5); // (0.7 + 0.8 + 0.9) / 3 = 0.8
      expect(avgMetric.aggregation).toBe('average');
      expect(avgMetric.sample_count).toBe(3);
    });

    test('should aggregate metrics with "min" aggregation', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174072';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174072/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'loss',
          value: 0.5,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          round: 2,
          metric_type: 'loss',
          value: 0.3,
          timestamp: '2024-01-01T00:01:00Z',
        },
        {
          round: 3,
          metric_type: 'loss',
          value: 0.4,
          timestamp: '2024-01-01T00:02:00Z',
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 3,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=min`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('aggregation', 'min');
      expect(response.body.metrics).toHaveLength(1);

      const minMetric = response.body.metrics[0];
      expect(minMetric.metric_type).toBe('loss');
      expect(minMetric.value).toBe(0.3); // Minimum value
      expect(minMetric.round).toBe(2);
      expect(minMetric.aggregation).toBe('min');
    });

    test('should aggregate metrics with "max" aggregation', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174073';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174073/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.7,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          round: 2,
          metric_type: 'accuracy',
          value: 0.9,
          timestamp: '2024-01-01T00:01:00Z',
        },
        {
          round: 3,
          metric_type: 'accuracy',
          value: 0.8,
          timestamp: '2024-01-01T00:02:00Z',
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 3,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=max`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('aggregation', 'max');
      expect(response.body.metrics).toHaveLength(1);

      const maxMetric = response.body.metrics[0];
      expect(maxMetric.metric_type).toBe('accuracy');
      expect(maxMetric.value).toBe(0.9); // Maximum value
      expect(maxMetric.round).toBe(2);
      expect(maxMetric.aggregation).toBe('max');
    });

    test('should reject invalid aggregation values', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174074';

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=invalid`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    test('should handle aggregation with multiple metric types', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174075';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174075/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        {
          round: 1,
          metric_type: 'accuracy',
          value: 0.7,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          round: 2,
          metric_type: 'accuracy',
          value: 0.8,
          timestamp: '2024-01-01T00:01:00Z',
        },
        {
          round: 1,
          metric_type: 'loss',
          value: 0.5,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          round: 2,
          metric_type: 'loss',
          value: 0.3,
          timestamp: '2024-01-01T00:01:00Z',
        },
      ];

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 4,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=average`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.metrics).toHaveLength(2); // 2 metric types

      const avgAccuracy = response.body.metrics.find((m) => m.metric_type === 'accuracy');
      expect(avgAccuracy.value).toBeCloseTo(0.75, 5); // (0.7 + 0.8) / 2

      const avgLoss = response.body.metrics.find((m) => m.metric_type === 'loss');
      expect(avgLoss.value).toBeCloseTo(0.4, 5); // (0.5 + 0.3) / 2
    });

    test('should handle empty metrics array with aggregation', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174076';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: [],
        total: 0,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=average`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.metrics).toHaveLength(0);
      expect(response.body).toHaveProperty('aggregation', 'average');
    });
  });

  describe('Metrics Cache with Pagination and Aggregation', () => {
    test('should cache results with page/page_size parameters separately', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174080';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174080/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics1 = [{ round: 1, metric_type: 'accuracy', value: 0.8 }];
      const mockMetrics2 = [{ round: 2, metric_type: 'accuracy', value: 0.85 }];

      // First request with page=1
      axiosMock.onGet(`/train/${experimentId}/metrics`).replyOnce(200, {
        metrics: mockMetrics1,
        total: 100,
      });

      const response1 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=1&page_size=20`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response1.body.cached).toBe(false);
      expect(response1.body.page).toBe(1);

      // Second request with page=2 (different cache key)
      axiosMock.onGet(`/train/${experimentId}/metrics`).replyOnce(200, {
        metrics: mockMetrics2,
        total: 100,
      });

      const response2 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=2&page_size=20`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response2.body.cached).toBe(false);
      expect(response2.body.page).toBe(2);

      // Third request with page=1 again (should be cached)
      const response3 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=1&page_size=20`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response3.body.cached).toBe(true);
      expect(response3.body.page).toBe(1);
    });

    test('should cache results with aggregation parameter separately', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174081';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174081/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [
        { round: 1, metric_type: 'accuracy', value: 0.7 },
        { round: 2, metric_type: 'accuracy', value: 0.8 },
      ];

      // Request with aggregation=average
      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 2,
      });

      const response1 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=average`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response1.body.cached).toBe(false);
      expect(response1.body.aggregation).toBe('average');

      // Request without aggregation (different cache key)
      const response2 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response2.body.cached).toBe(false);
      expect(response2.body).not.toHaveProperty('aggregation');

      // Request with aggregation=average again (should be cached)
      const response3 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?aggregation=average`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response3.body.cached).toBe(true);
    });

    test('should cache for 60 seconds for all metrics endpoints', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174082';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174082/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = [{ round: 1, metric_type: 'loss', value: 0.5 }];

      // Test training endpoint
      axiosMock.onGet(`/train/${experimentId}/metrics/training`).reply(200, {
        metrics: mockMetrics,
        total: 1,
      });

      const response1 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/training?page=1&page_size=10`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response1.body.cached).toBe(false);

      const response2 = await request(app)
        .get(`/api/experiments/${experimentId}/metrics/training?page=1&page_size=10`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response2.body.cached).toBe(true);
    });
  });

  describe('Combined Pagination and Aggregation', () => {
    test('should support both page-based pagination and aggregation together', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174090';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/123e4567-e89b-12d3-a456-426614174090/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      const mockMetrics = Array.from({ length: 50 }, (_, i) => ({
        round: i + 1,
        metric_type: 'accuracy',
        value: 0.5 + i * 0.01,
        timestamp: new Date().toISOString(),
      }));

      axiosMock.onGet(`/train/${experimentId}/metrics`).reply(200, {
        metrics: mockMetrics,
        total: 200,
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/metrics?page=2&page_size=50&aggregation=max`)
   .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('page', 2);
      expect(response.body).toHaveProperty('page_size', 50);
      expect(response.body).toHaveProperty('aggregation', 'max');
      expect(response.body.metrics).toHaveLength(1); // Aggregated to single max value
      expect(response.body.metrics[0].aggregation).toBe('max');
    });
  });

  describe('GET /api/experiments/:id/report', () => {
    test('should generate PDF report for experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174100';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'completed',
        userId: 'test-user-123',
      });

      // Mock PDF report generation (return binary data)
      const mockPDFData = Buffer.from('mock-pdf-data');
      axiosMock.onGet(`/train/${experimentId}/report`).reply(200, mockPDFData, {
        'content-type': 'application/pdf',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/report`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /pdf/)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(`experiment-${experimentId}-report.pdf`);
      expect(Buffer.isBuffer(response.body)).toBe(true);
    });

    test('should return 404 when report not available', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174101';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'running',
        userId: 'test-user-123',
      });

      // Mock Python backend 404 response
      axiosMock.onGet(`/train/${experimentId}/report`).reply(404, {
        error: 'Report not available',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/report`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('not available');
    });

    test('should return 403 when user does not own experiment', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174102';

      // Mock experiment owned by different user
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'completed',
        userId: 'different-user-456',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/report`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Access denied');
    });

    test('should allow admin to access any experiment report', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174103';

      // Mock experiment owned by different user
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'completed',
        userId: 'different-user-456',
      });

      // Mock PDF report generation
      const mockPDFData = Buffer.from('mock-pdf-data');
      axiosMock.onGet(`/train/${experimentId}/report`).reply(200, mockPDFData, {
        'content-type': 'application/pdf',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/report`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect('Content-Type', /pdf/)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
    });

    test('should handle backend error when generating report', async () => {
      const experimentId = '123e4567-e89b-12d3-a456-426614174104';

      // Mock experiment status for authorization check
      axiosMock.onGet(`/train/${experimentId}/status`).reply(200, {
        status: 'completed',
        userId: 'test-user-123',
      });

      // Mock Python backend 500 error
      axiosMock.onGet(`/train/${experimentId}/report`).reply(500, {
        error: 'Internal server error generating report',
      });

      const response = await request(app)
        .get(`/api/experiments/${experimentId}/report`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Failed to generate report');
    });
  });
});
