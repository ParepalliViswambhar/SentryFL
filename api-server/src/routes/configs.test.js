/**
 * Unit tests for Configuration Management API
 * Requirements: 23.6, 23.9, 23.10
 */

const request = require('supertest');
const express = require('express');
const configsRouter = require('./configs');
const { notFoundHandler, errorHandler } = require('../middleware/errorHandler');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/configs', configsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

// Helper to create valid config
const createValidConfig = () => ({
  name: 'Test Configuration',
  description: 'Test configuration for unit tests',
  tags: ['test', 'unit'],
  model_type: 'lstm',
  num_clients: 10,
  num_rounds: 20,
  clients_per_round: 5,
  epsilon: 1.5,
  delta: 1e-5,
  noise_multiplier: 1.0,
  max_grad_norm: 1.0,
  batch_size: 64,
  learning_rate: 0.001,
  local_epochs: 2,
  dataset: 'nsl-kdd',
  data_split: 'iid',
  model_params: { hidden_size: 128 },
  is_public: false,
});

describe('Configuration Management API', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    // Clear storage before each test
    const { configStorage } = require('./configs');
    configStorage.flushAll();
  });

  afterEach(() => {
    // Clear storage after each test
    const { configStorage } = require('./configs');
    configStorage.flushAll();
  });

  describe('GET /api/configs/defaults', () => {
    it('should return default configuration values', async () => {
      const response = await request(app).get('/api/configs/defaults');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('defaults');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.defaults).toHaveProperty('model_type');
      expect(response.body.defaults).toHaveProperty('num_clients');
      expect(response.body.defaults).toHaveProperty('epsilon');
      expect(response.body.defaults.model_type).toBe('lstm');
      expect(response.body.defaults.num_clients).toBe(5);
    });
  });

  describe('POST /api/configs/validate', () => {
    it('should validate a valid configuration without saving', async () => {
      const config = createValidConfig();

      const response = await request(app).post('/api/configs/validate').send(config);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.message).toBe('Configuration is valid');
      expect(response.body.config).toMatchObject(config);
    });

    it('should reject invalid configuration with validation errors', async () => {
      const invalidConfig = {
        name: 'Test',
        model_type: 'invalid_model', // Invalid model type
        num_clients: -5, // Negative number
        epsilon: -1.0, // Negative epsilon
      };

      const response = await request(app).post('/api/configs/validate').send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body).toHaveProperty('validationErrors');
      expect(Array.isArray(response.body.validationErrors)).toBe(true);
      expect(response.body.validationErrors.length).toBeGreaterThan(0);
    });

    it('should reject configuration with missing required fields', async () => {
      const incompleteConfig = {
        name: 'Incomplete Config',
        // Missing required fields
      };

      const response = await request(app).post('/api/configs/validate').send(incompleteConfig);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.validationErrors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/configs', () => {
    it('should create a new configuration template', async () => {
      const config = createValidConfig();

      const response = await request(app).post('/api/configs').send(config);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message', 'Configuration created successfully');
      expect(response.body.config).toMatchObject(config);
      expect(response.body.config).toHaveProperty('version', 1);
      expect(response.body.config).toHaveProperty('created_at');
      expect(response.body.config).toHaveProperty('updated_at');
    });

    it('should reject invalid configuration on creation', async () => {
      const invalidConfig = {
        name: 'Invalid',
        model_type: 'invalid',
        num_clients: 0,
        epsilon: 0,
      };

      const response = await request(app).post('/api/configs').send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('GET /api/configs', () => {
    it('should list all configuration templates', async () => {
      // Create two configurations
      const config1 = createValidConfig();
      config1.name = 'Config 1';
      const config2 = createValidConfig();
      config2.name = 'Config 2';

      await request(app).post('/api/configs').send(config1);
      await request(app).post('/api/configs').send(config2);

      const response = await request(app).get('/api/configs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('configs');
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(Array.isArray(response.body.configs)).toBe(true);
      expect(response.body.configs.length).toBe(2);
    });

    it('should filter configurations by is_public flag', async () => {
      const publicConfig = createValidConfig();
      publicConfig.name = 'Public Config';
      publicConfig.is_public = true;

      const privateConfig = createValidConfig();
      privateConfig.name = 'Private Config';
      privateConfig.is_public = false;

      await request(app).post('/api/configs').send(publicConfig);
      await request(app).post('/api/configs').send(privateConfig);

      const response = await request(app).get('/api/configs?is_public=true');

      expect(response.status).toBe(200);
      expect(response.body.configs.length).toBe(1);
      expect(response.body.configs[0].name).toBe('Public Config');
      expect(response.body.configs[0].is_public).toBe(true);
    });

    it('should filter configurations by tags', async () => {
      const config1 = createValidConfig();
      config1.name = 'Config 1';
      config1.tags = ['test', 'production'];

      const config2 = createValidConfig();
      config2.name = 'Config 2';
      config2.tags = ['development'];

      await request(app).post('/api/configs').send(config1);
      await request(app).post('/api/configs').send(config2);

      const response = await request(app).get('/api/configs?tags=production');

      expect(response.status).toBe(200);
      expect(response.body.configs.length).toBe(1);
      expect(response.body.configs[0].name).toBe('Config 1');
    });

    it('should support pagination', async () => {
      // Create 5 configurations
      for (let i = 0; i < 5; i++) {
        const config = createValidConfig();
        config.name = `Config ${i}`;
        await request(app).post('/api/configs').send(config);
      }

      const response = await request(app).get('/api/configs?limit=2&offset=1');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(5);
      expect(response.body.limit).toBe(2);
      expect(response.body.offset).toBe(1);
      expect(response.body.configs.length).toBe(2);
    });

    it('should return empty array when no configurations exist', async () => {
      const response = await request(app).get('/api/configs');

      expect(response.status).toBe(200);
      expect(response.body.configs).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('GET /api/configs/:id', () => {
    it('should retrieve a specific configuration', async () => {
      const config = createValidConfig();
      const createResponse = await request(app).post('/api/configs').send(config);
      const configId = createResponse.body.id;

      const response = await request(app).get(`/api/configs/${configId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('config');
      expect(response.body.config.id).toBe(configId);
      expect(response.body.config.name).toBe(config.name);
    });

    it('should return 404 for non-existent configuration', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app).get(`/api/configs/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Configuration not found');
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await request(app).get('/api/configs/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });
  });

  describe('PUT /api/configs/:id', () => {
    it('should update an existing configuration', async () => {
      const config = createValidConfig();
      const createResponse = await request(app).post('/api/configs').send(config);
      const configId = createResponse.body.id;

      const updates = {
        name: 'Updated Configuration',
        num_rounds: 50,
        epsilon: 2.0,
      };

      const response = await request(app).put(`/api/configs/${configId}`).send(updates);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Configuration updated successfully');
      expect(response.body.config.name).toBe('Updated Configuration');
      expect(response.body.config.num_rounds).toBe(50);
      expect(response.body.config.epsilon).toBe(2.0);
      expect(response.body.config.version).toBe(2); // Version incremented
      expect(response.body.config.updated_at).not.toBe(response.body.config.created_at);
    });

    it('should return 404 when updating non-existent configuration', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const updates = { name: 'Updated' };

      const response = await request(app).put(`/api/configs/${fakeId}`).send(updates);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Configuration not found');
    });

    it('should reject updates that make configuration invalid', async () => {
      const config = createValidConfig();
      const createResponse = await request(app).post('/api/configs').send(config);
      const configId = createResponse.body.id;

      const invalidUpdates = {
        epsilon: -5.0, // Invalid negative epsilon
      };

      const response = await request(app).put(`/api/configs/${configId}`).send(invalidUpdates);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    it('should increment version on each update', async () => {
      const config = createValidConfig();
      const createResponse = await request(app).post('/api/configs').send(config);
      const configId = createResponse.body.id;

      // First update
      await request(app).put(`/api/configs/${configId}`).send({ name: 'Update 1' });

      // Second update
      const response = await request(app).put(`/api/configs/${configId}`).send({ name: 'Update 2' });

      expect(response.status).toBe(200);
      expect(response.body.config.version).toBe(3); // Initial version 1 + 2 updates
    });
  });

  describe('DELETE /api/configs/:id', () => {
    it('should delete an existing configuration', async () => {
      const config = createValidConfig();
      const createResponse = await request(app).post('/api/configs').send(config);
      const configId = createResponse.body.id;

      const response = await request(app).delete(`/api/configs/${configId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted successfully');
      expect(response.body.config_id).toBe(configId);

      // Verify configuration is deleted
      const getResponse = await request(app).get(`/api/configs/${configId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent configuration', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app).delete(`/api/configs/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Configuration not found');
    });
  });

  describe('Configuration Round-trip Tests', () => {
    it('should support configuration save and retrieval round-trip', async () => {
      // Requirement: Test configuration save and retrieval round-trip
      const originalConfig = createValidConfig();

      // Save configuration
      const createResponse = await request(app).post('/api/configs').send(originalConfig);
      const configId = createResponse.body.id;

      // Retrieve configuration
      const getResponse = await request(app).get(`/api/configs/${configId}`);

      // Verify round-trip consistency
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.config.name).toBe(originalConfig.name);
      expect(getResponse.body.config.model_type).toBe(originalConfig.model_type);
      expect(getResponse.body.config.num_clients).toBe(originalConfig.num_clients);
      expect(getResponse.body.config.epsilon).toBe(originalConfig.epsilon);
      expect(getResponse.body.config.dataset).toBe(originalConfig.dataset);
    });

    it('should support configuration update modifies existing entry', async () => {
      // Requirement: Test configuration update modifies existing entry
      const originalConfig = createValidConfig();
      originalConfig.name = 'Original Name';

      // Create configuration
      const createResponse = await request(app).post('/api/configs').send(originalConfig);
      const configId = createResponse.body.id;

      // Update configuration
      const updates = {
        name: 'Modified Name',
        num_rounds: 100,
      };
      const updateResponse = await request(app).put(`/api/configs/${configId}`).send(updates);

      // Verify update
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.config.name).toBe('Modified Name');
      expect(updateResponse.body.config.num_rounds).toBe(100);

      // Retrieve and verify persistence
      const getResponse = await request(app).get(`/api/configs/${configId}`);
      expect(getResponse.body.config.name).toBe('Modified Name');
      expect(getResponse.body.config.num_rounds).toBe(100);
    });

    it('should reject invalid configuration schemas with specific validation errors', async () => {
      // Requirement: Test configuration validation rejects invalid schemas
      const invalidConfigs = [
        {
          name: 'Invalid Model Type',
          model_type: 'nonexistent_model',
          num_clients: 5,
          clients_per_round: 5,
          epsilon: 1.0,
          dataset: 'nsl-kdd',
        },
        {
          name: 'Invalid Num Clients',
          model_type: 'lstm',
          num_clients: -5, // Negative
          clients_per_round: 5,
          epsilon: 1.0,
          dataset: 'nsl-kdd',
        },
        {
          name: 'Invalid Epsilon',
          model_type: 'lstm',
          num_clients: 5,
          clients_per_round: 5,
          epsilon: -1.0, // Negative
          dataset: 'nsl-kdd',
        },
      ];

      for (const invalidConfig of invalidConfigs) {
        const response = await request(app).post('/api/configs/validate').send(invalidConfig);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation Error');
        expect(response.body).toHaveProperty('validationErrors');
        expect(response.body.validationErrors.length).toBeGreaterThan(0);
      }
    });
  });
});
