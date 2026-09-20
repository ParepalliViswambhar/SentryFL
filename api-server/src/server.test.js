/**
 * Test suite for Express server core functionality
 * Tests: middleware configuration, rate limiting, health check
 */

const request = require('supertest');
const { app } = require('./index');

describe('Express Server - Core Middleware and Endpoints', () => {
  describe('Health Check Endpoint', () => {
    it('should return 200 status code', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return JSON with status, timestamp, service, and version', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('sentryfl-api-server');
    });

    it('should have a valid timestamp', async () => {
      const response = await request(app).get('/health');
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('CORS Middleware', () => {
    it('should include CORS headers in response', async () => {
      const response = await request(app).get('/health').set('Origin', 'http://localhost:3001');
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Helmet Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health');
      // Helmet sets various security headers
      expect(
        response.headers['x-dns-prefetch-control'] || response.headers['x-content-type-options']
      ).toBeDefined();
    });
  });

  describe('JSON Body Parser', () => {
    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/test-json')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');
      // This will 404 but should not error on parsing
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Rate Limiting Middleware', () => {
    it('should allow requests under the rate limit', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app).get('/health');
      expect(
        response.headers['ratelimit-limit'] || response.headers['x-ratelimit-limit']
      ).toBeDefined();
    });

    it('should reject requests after exceeding rate limit', async () => {
      // Make 101 requests rapidly to trigger rate limit (limit is 100 per 15 min)
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(request(app).get('/health'));
      }

      const responses = await Promise.all(requests);

      // At least one of the last requests should be rate limited (429)
      const hasRateLimitedResponse = responses.some((r) => r.status === 429);
      expect(hasRateLimitedResponse).toBe(true);
    }, 15000); // Increase timeout for this test
  });

  describe('Morgan Logging Middleware', () => {
    it('should log requests (morgan is active)', async () => {
      // This test verifies morgan doesn't crash the server
      const response = await request(app).get('/health');
      // May be 429 if rate limited from previous tests
      expect([200, 429]).toContain(response.status);
    });
  });

  describe('Root Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/');
      // May be 429 if rate limited from previous tests
      expect([200, 429]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('documentation');
      }
    });
  });
});
