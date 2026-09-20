/**
 * WebSocket Server Tests
 */

const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const WebSocketServer = require('./index');

describe('WebSocketServer', () => {
  let httpServer;
  let wsServer;
  let clientSocket;
  let serverPort;

  beforeAll((done) => {
    // Create HTTP server
    httpServer = http.createServer();
    wsServer = new WebSocketServer(httpServer);

    // Listen on random available port
    httpServer.listen(() => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (httpServer) {
      httpServer.close(done);
    }
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Authentication', () => {
    it('should reject connection without token', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`);

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication token required');
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: 'invalid-token',
        },
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid authentication token');
        done();
      });
    });

    it('should accept connection with valid token', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');

      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: {
          token,
        },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Subscription and Room Management', () => {
    let token;

    beforeEach(() => {
      token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    });

    it('should allow client to subscribe to experiment', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-123');
      });

      clientSocket.on('subscribed', (data) => {
        expect(data.experimentId).toBe('exp-123');
        expect(data.room).toBe('experiment:exp-123');
        done();
      });
    });

    it('should allow client to unsubscribe from experiment', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-456');
      });

      clientSocket.on('subscribed', () => {
        clientSocket.emit('unsubscribe', 'exp-456');
      });

      clientSocket.on('unsubscribed', (data) => {
        expect(data.experimentId).toBe('exp-456');
        expect(data.room).toBe('experiment:exp-456');
        done();
      });
    });
  });

  describe('Event Broadcasting', () => {
    let token;

    beforeEach(() => {
      token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    });

    it('should broadcast training_round_complete to subscribed clients', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-789');
      });

      clientSocket.on('subscribed', () => {
        // Broadcast event
        wsServer.broadcastTrainingRoundComplete('exp-789', {
          round: 1,
          loss: 0.5,
          accuracy: 0.85,
          gradientNorm: 1.2,
          clientsParticipated: 5,
        });
      });

      clientSocket.on('training_round_complete', (event) => {
        expect(event.type).toBe('training_round_complete');
        expect(event.experimentId).toBe('exp-789');
        expect(event.data.round).toBe(1);
        expect(event.data.loss).toBe(0.5);
        expect(event.data.accuracy).toBe(0.85);
        expect(event.timestamp).toBeDefined();
        done();
      });
    });

    it('should broadcast privacy_budget_update to subscribed clients', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-101');
      });

      clientSocket.on('subscribed', () => {
        wsServer.broadcastPrivacyBudgetUpdate('exp-101', {
          epsilon: 1.5,
          delta: 1e-5,
          round: 10,
          percentageConsumed: 15,
        });
      });

      clientSocket.on('privacy_budget_update', (event) => {
        expect(event.type).toBe('privacy_budget_update');
        expect(event.experimentId).toBe('exp-101');
        expect(event.data.epsilon).toBe(1.5);
        expect(event.data.percentageConsumed).toBe(15);
        done();
      });
    });

    it('should broadcast experiment_status_change to subscribed clients', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-202');
      });

      clientSocket.on('subscribed', () => {
        wsServer.broadcastExperimentStatusChange('exp-202', {
          status: 'completed',
          previousStatus: 'running',
          message: 'Training completed successfully',
        });
      });

      clientSocket.on('experiment_status_change', (event) => {
        expect(event.type).toBe('experiment_status_change');
        expect(event.data.status).toBe('completed');
        expect(event.data.previousStatus).toBe('running');
        done();
      });
    });

    it('should broadcast error events to subscribed clients', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-303');
      });

      clientSocket.on('subscribed', () => {
        wsServer.broadcastError('exp-303', {
          message: 'Training diverged',
          code: 'TRAINING_DIVERGENCE',
          details: 'Loss exceeded threshold',
          round: 5,
        });
      });

      clientSocket.on('error', (event) => {
        expect(event.type).toBe('error');
        expect(event.data.message).toBe('Training diverged');
        expect(event.data.code).toBe('TRAINING_DIVERGENCE');
        done();
      });
    });
  });

  describe('Multiple Clients', () => {
    let token;
    let client1, client2;

    beforeEach(() => {
      token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    });

    afterEach(() => {
      if (client1 && client1.connected) client1.disconnect();
      if (client2 && client2.connected) client2.disconnect();
    });

    it('should broadcast events to multiple subscribed clients', (done) => {
      let receivedCount = 0;

      const checkDone = () => {
        receivedCount++;
        if (receivedCount === 2) {
          done();
        }
      };

      client1 = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      client2 = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      let connectedCount = 0;
      const checkConnected = () => {
        connectedCount++;
        if (connectedCount === 2) {
          // Both clients connected, broadcast event
          wsServer.broadcastTrainingRoundComplete('exp-404', {
            round: 2,
            loss: 0.3,
            accuracy: 0.9,
            gradientNorm: 0.8,
            clientsParticipated: 3,
          });
        }
      };

      client1.on('connect', () => {
        client1.emit('subscribe', 'exp-404');
      });

      client1.on('subscribed', checkConnected);

      client1.on('training_round_complete', (event) => {
        expect(event.data.round).toBe(2);
        checkDone();
      });

      client2.on('connect', () => {
        client2.emit('subscribe', 'exp-404');
      });

      client2.on('subscribed', checkConnected);

      client2.on('training_round_complete', (event) => {
        expect(event.data.round).toBe(2);
        checkDone();
      });
    });

    it('should not broadcast to unsubscribed clients', (done) => {
      client1 = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      client2 = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      let client1Received = false;
      let client2Received = false;

      client1.on('connect', () => {
        client1.emit('subscribe', 'exp-505');
      });

      client1.on('subscribed', () => {
        // Client2 doesn't subscribe
        setTimeout(() => {
          wsServer.broadcastTrainingRoundComplete('exp-505', {
            round: 3,
            loss: 0.2,
            accuracy: 0.92,
            gradientNorm: 0.6,
            clientsParticipated: 4,
          });
        }, 100);
      });

      client1.on('training_round_complete', () => {
        client1Received = true;
      });

      client2.on('training_round_complete', () => {
        client2Received = true;
      });

      // Wait and verify only client1 received the event
      setTimeout(() => {
        expect(client1Received).toBe(true);
        expect(client2Received).toBe(false);
        done();
      }, 300);
    });
  });

  describe('Event Buffering', () => {
    let token;

    beforeEach(() => {
      token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    });

    it('should buffer events for reconnecting clients', (done) => {
      const experimentId = 'exp-606';

      // Broadcast events before client connects
      wsServer.broadcastTrainingRoundComplete(experimentId, {
        round: 1,
        loss: 0.5,
        accuracy: 0.85,
        gradientNorm: 1.0,
        clientsParticipated: 5,
      });

      wsServer.broadcastPrivacyBudgetUpdate(experimentId, {
        epsilon: 1.0,
        delta: 1e-5,
        round: 1,
        percentageConsumed: 10,
      });

      // Now connect client and subscribe
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', experimentId);
      });

      clientSocket.on('buffered_events', (data) => {
        expect(data.experimentId).toBe(experimentId);
        expect(data.events.length).toBe(2);
        expect(data.events[0].type).toBe('training_round_complete');
        expect(data.events[1].type).toBe('privacy_budget_update');
        done();
      });
    });

    it('should limit buffer size to MAX_BUFFER_SIZE', () => {
      const experimentId = 'exp-707';

      // Broadcast more events than buffer size
      for (let i = 0; i < 60; i++) {
        wsServer.broadcastTrainingRoundComplete(experimentId, {
          round: i,
          loss: 0.5,
          accuracy: 0.85,
          gradientNorm: 1.0,
          clientsParticipated: 5,
        });
      }

      const buffer = wsServer.eventBuffer.get(experimentId);
      expect(buffer.length).toBe(wsServer.MAX_BUFFER_SIZE);
    });
  });

  describe('Utility Methods', () => {
    let token;

    beforeEach(() => {
      token = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    });

    it('should return connected clients count', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        const count = wsServer.getConnectedClientsCount();
        expect(count).toBeGreaterThanOrEqual(1);
        done();
      });
    });

    it('should return subscribed clients count for an experiment', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'exp-808');
      });

      clientSocket.on('subscribed', () => {
        const count = wsServer.getSubscribedClientsCount('exp-808');
        expect(count).toBe(1);
        done();
      });
    });

    it('should clear event buffer for an experiment', () => {
      const experimentId = 'exp-909';

      wsServer.broadcastTrainingRoundComplete(experimentId, {
        round: 1,
        loss: 0.5,
        accuracy: 0.85,
        gradientNorm: 1.0,
        clientsParticipated: 5,
      });

      expect(wsServer.eventBuffer.has(experimentId)).toBe(true);

      wsServer.clearEventBuffer(experimentId);

      expect(wsServer.eventBuffer.has(experimentId)).toBe(false);
    });
  });
});
