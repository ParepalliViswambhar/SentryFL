/**
 * Internal Routes Tests
 */

const request = require('supertest');
const express = require('express');
const http = require('http');
const internalRouter = require('./internal');
const WebSocketServer = require('../websocket');

describe('Internal Routes', () => {
  let app;
  let server;
  let httpServer;
  let wsServer;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Create HTTP server and WebSocket server
    httpServer = http.createServer(app);
    wsServer = new WebSocketServer(httpServer);
    app.locals.wsServer = wsServer;

    // Mount internal routes
    app.use('/internal', internalRouter);

    server = app;
  });

  afterAll(() => {
    if (httpServer) {
      httpServer.close();
    }
  });

  describe('POST /internal/metrics', () => {
    it('should return 400 when experimentId is missing', async () => {
      const response = await request(server).post('/internal/metrics').send({
        metricType: 'training_round_complete',
        data: { round: 1 },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when metricType is missing', async () => {
      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-123',
        data: { round: 1 },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when data is missing', async () => {
      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-123',
        metricType: 'training_round_complete',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 for unsupported metric type', async () => {
      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-123',
        metricType: 'unknown_metric_type',
        data: { round: 1 },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid metric type');
    });

    it('should broadcast training_round_complete metrics and return 200', async () => {
      const spy = jest.spyOn(wsServer, 'broadcastTrainingRoundComplete');

      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-123',
        metricType: 'training_round_complete',
        data: {
          round: 5,
          loss: 0.3,
          accuracy: 0.88,
          gradientNorm: 0.9,
          clientsParticipated: 10,
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.experimentId).toBe('exp-123');
      expect(response.body.metricType).toBe('training_round_complete');

      expect(spy).toHaveBeenCalledWith('exp-123', {
        round: 5,
        loss: 0.3,
        accuracy: 0.88,
        gradientNorm: 0.9,
        clientsParticipated: 10,
      });

      spy.mockRestore();
    });

    it('should broadcast privacy_budget_update metrics and return 200', async () => {
      const spy = jest.spyOn(wsServer, 'broadcastPrivacyBudgetUpdate');

      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-456',
        metricType: 'privacy_budget_update',
        data: {
          epsilon: 2.5,
          delta: 1e-5,
          round: 15,
          percentageConsumed: 25,
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(spy).toHaveBeenCalledWith('exp-456', {
        epsilon: 2.5,
        delta: 1e-5,
        round: 15,
        percentageConsumed: 25,
      });

      spy.mockRestore();
    });

    it('should broadcast experiment_status_change metrics and return 200', async () => {
      const spy = jest.spyOn(wsServer, 'broadcastExperimentStatusChange');

      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-789',
        metricType: 'experiment_status_change',
        data: {
          status: 'paused',
          previousStatus: 'running',
          message: 'Experiment paused by user',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(spy).toHaveBeenCalledWith('exp-789', {
        status: 'paused',
        previousStatus: 'running',
        message: 'Experiment paused by user',
      });

      spy.mockRestore();
    });

    it('should broadcast error metrics and return 200', async () => {
      const spy = jest.spyOn(wsServer, 'broadcastError');

      const response = await request(server).post('/internal/metrics').send({
        experimentId: 'exp-101',
        metricType: 'error',
        data: {
          message: 'Client communication timeout',
          code: 'CLIENT_TIMEOUT',
          details: 'Client 3 did not respond',
          round: 8,
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(spy).toHaveBeenCalledWith('exp-101', {
        message: 'Client communication timeout',
        code: 'CLIENT_TIMEOUT',
        details: 'Client 3 did not respond',
        round: 8,
      });

      spy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket server not initialized', async () => {
      const appWithoutWs = express();
      appWithoutWs.use(express.json());
      appWithoutWs.use('/internal', internalRouter);

      const response = await request(appWithoutWs).post('/internal/metrics').send({
        experimentId: 'exp-202',
        metricType: 'training_round_complete',
        data: { round: 1 },
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBe('WebSocket server not available');
    });
  });
});
