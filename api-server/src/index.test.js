/**
 * Basic tests for SentryFL API Server
 */

const request = require('supertest');
const { app } = require('./index');

describe('SentryFL API Server', () => {
  describe('GET /health', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'sentryfl-api-server');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('GET /', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'SentryFL API Server');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('documentation', '/api/docs');
    });
  });
});
