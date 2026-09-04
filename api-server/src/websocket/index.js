/**
 * WebSocket Server Module
 * Implements Socket.io for real-time metric streaming
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

class WebSocketServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
        credentials: true,
      },
      pingTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT) || 5000,
      pingInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
      // Enable permessage-deflate compression (Requirement 37.9)
      // This compresses WebSocket messages using zlib/gzip to reduce bandwidth
      perMessageDeflate: {
        threshold: 1024, // Only compress messages > 1KB
        zlibDeflateOptions: {
          chunkSize: 8 * 1024, // 8KB chunks
          level: 6, // Compression level 1-9 (6 is balanced)
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024, // 10KB chunks
        },
        clientNoContextTakeover: true, // Reset compression context after each message
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10, // Max LZ77 sliding window size
        clientMaxWindowBits: 10,
        concurrencyLimit: 10, // Number of concurrent compression operations
      },
      // Additional performance optimizations
      transports: ['websocket', 'polling'], // Prefer WebSocket over polling
      allowUpgrades: true, // Allow transport upgrades
      upgradeTimeout: 10000, // 10s timeout for upgrades
    });

    // Event buffer for reconnecting clients (store last 50 events per experiment)
    this.eventBuffer = new Map();
    this.MAX_BUFFER_SIZE = 50;

    this.setupMiddleware();
    this.setupConnectionHandler();
  }

  /**
   * Setup authentication middleware for WebSocket connections
   */
  setupMiddleware() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        socket.userId = decoded.userId || decoded.sub;
        next();
      } catch (err) {
        next(new Error('Invalid authentication token'));
      }
    });
  }

  /**
   * Setup WebSocket connection handler
   */
  setupConnectionHandler() {
    this.io.on('connection', (socket) => {
      console.info(`WebSocket client connected: ${socket.id} (User: ${socket.userId})`);

      // Handle subscription to experiment rooms
      socket.on('subscribe', (experimentId) => {
        const room = `experiment:${experimentId}`;
        socket.join(room);
        console.info(`Client ${socket.id} subscribed to ${room}`);

        // Send buffered events for this experiment
        this.sendBufferedEvents(socket, experimentId);

        socket.emit('subscribed', { experimentId, room });
      });

      // Handle unsubscription from experiment rooms
      socket.on('unsubscribe', (experimentId) => {
        const room = `experiment:${experimentId}`;
        socket.leave(room);
        console.info(`Client ${socket.id} unsubscribed from ${room}`);

        socket.emit('unsubscribed', { experimentId, room });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.info(`WebSocket client disconnected: ${socket.id} (Reason: ${reason})`);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`WebSocket error for client ${socket.id}:`, error);
      });
    });
  }

  /**
   * Broadcast training round complete event
   * @param {string} experimentId - Experiment identifier
   * @param {object} data - Training metrics
   */
  broadcastTrainingRoundComplete(experimentId, data) {
    const room = `experiment:${experimentId}`;
    const event = {
      type: 'training_round_complete',
      experimentId,
      timestamp: new Date().toISOString(),
      data: {
        round: data.round,
        loss: data.loss,
        accuracy: data.accuracy,
        gradientNorm: data.gradientNorm,
        clientsParticipated: data.clientsParticipated,
      },
    };

    this.io.to(room).emit('training_round_complete', event);
    this.bufferEvent(experimentId, event);
    console.info(`Broadcast training_round_complete to ${room}:`, event.data);
  }

  /**
   * Broadcast privacy budget update event
   * @param {string} experimentId - Experiment identifier
   * @param {object} data - Privacy metrics
   */
  broadcastPrivacyBudgetUpdate(experimentId, data) {
    const room = `experiment:${experimentId}`;
    const event = {
      type: 'privacy_budget_update',
      experimentId,
      timestamp: new Date().toISOString(),
      data: {
        epsilon: data.epsilon,
        delta: data.delta,
        round: data.round,
        percentageConsumed: data.percentageConsumed,
      },
    };

    this.io.to(room).emit('privacy_budget_update', event);
    this.bufferEvent(experimentId, event);
    console.info(`Broadcast privacy_budget_update to ${room}:`, event.data);
  }

  /**
   * Broadcast experiment status change event
   * @param {string} experimentId - Experiment identifier
   * @param {object} data - Status information
   */
  broadcastExperimentStatusChange(experimentId, data) {
    const room = `experiment:${experimentId}`;
    const event = {
      type: 'experiment_status_change',
      experimentId,
      timestamp: new Date().toISOString(),
      data: {
        status: data.status, // 'running', 'paused', 'completed', 'failed'
        previousStatus: data.previousStatus,
        message: data.message,
      },
    };

    this.io.to(room).emit('experiment_status_change', event);
    this.bufferEvent(experimentId, event);
    console.info(`Broadcast experiment_status_change to ${room}:`, event.data);
  }

  /**
   * Broadcast error event
   * @param {string} experimentId - Experiment identifier
   * @param {object} error - Error information
   */
  broadcastError(experimentId, error) {
    const room = `experiment:${experimentId}`;
    const event = {
      type: 'error',
      experimentId,
      timestamp: new Date().toISOString(),
      data: {
        message: error.message,
        code: error.code,
        details: error.details,
        round: error.round,
      },
    };

    this.io.to(room).emit('error', event);
    this.bufferEvent(experimentId, event);
    console.error(`Broadcast error to ${room}:`, event.data);
  }

  /**
   * Buffer event for reconnecting clients
   * @param {string} experimentId - Experiment identifier
   * @param {object} event - Event to buffer
   */
  bufferEvent(experimentId, event) {
    if (!this.eventBuffer.has(experimentId)) {
      this.eventBuffer.set(experimentId, []);
    }

    const buffer = this.eventBuffer.get(experimentId);
    buffer.push(event);

    // Keep only the last MAX_BUFFER_SIZE events
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  /**
   * Send buffered events to a newly subscribed client
   * @param {object} socket - Socket.io socket
   * @param {string} experimentId - Experiment identifier
   */
  sendBufferedEvents(socket, experimentId) {
    const buffer = this.eventBuffer.get(experimentId);
    if (buffer && buffer.length > 0) {
      console.info(`Sending ${buffer.length} buffered events to client ${socket.id} for experiment ${experimentId}`);
      socket.emit('buffered_events', {
        experimentId,
        events: buffer,
        count: buffer.length,
      });
    }
  }

  /**
   * Clear event buffer for an experiment
   * @param {string} experimentId - Experiment identifier
   */
  clearEventBuffer(experimentId) {
    if (this.eventBuffer.has(experimentId)) {
      this.eventBuffer.delete(experimentId);
      console.info(`Cleared event buffer for experiment ${experimentId}`);
    }
  }

  /**
   * Get connected clients count
   * @returns {number} Number of connected clients
   */
  getConnectedClientsCount() {
    return this.io.sockets.sockets.size;
  }

  /**
   * Get clients subscribed to an experiment
   * @param {string} experimentId - Experiment identifier
   * @returns {number} Number of subscribed clients
   */
  getSubscribedClientsCount(experimentId) {
    const room = `experiment:${experimentId}`;
    const clients = this.io.sockets.adapter.rooms.get(room);
    return clients ? clients.size : 0;
  }
}

module.exports = WebSocketServer;
