/**
 * WebSocket Client Configuration
 * 
 * Manages WebSocket connection to the SentryFL API Server for real-time updates
 */

import { io } from 'socket.io-client';

let socket = null;
// The auth token the current socket was opened with. socket.io manages its own
// reconnection, so we keep ONE instance for the app's lifetime and only tear it
// down when the token actually changes (a new login) — see initializeWebSocket.
let lastToken;

/**
 * Initialize WebSocket connection
 * @returns {Socket} Socket.io client instance
 */
export const initializeWebSocket = ({ token } = {}) => {
  // Reuse the single app-wide socket whenever the auth token is unchanged.
  //
  // The old guard (`socket && socket.connected`) recreated the socket whenever
  // the existing one was momentarily NOT connected — i.e. during socket.io's
  // own automatic reconnect. That abandoned the live instance (whose event
  // handlers and room subscriptions the app had already bound) and opened a
  // second, duplicate connection, breaking the single-subscription invariant
  // useLiveExperiments depends on. Reuse the instance and let socket.io
  // reconnect it; only recreate when there is no socket yet, or the token
  // changed and we must re-handshake with fresh credentials.
  if (socket && lastToken === token) {
    return socket;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  lastToken = token;

  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
  
  socket = io(wsUrl, {
    transports: ['websocket', 'polling'],
    perMessageDeflate: true,
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  // Connection event handlers
  socket.on('connect', () => {
    console.log('WebSocket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error.message);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('WebSocket reconnected after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_failed', () => {
    console.error('WebSocket reconnection failed');
  });

  return socket;
};

/**
 * Get existing WebSocket connection or create new one
 * @returns {Socket} Socket.io client instance
 */
export const getWebSocket = () => {
  if (!socket) {
    return initializeWebSocket();
  }
  return socket;
};

/**
 * Close WebSocket connection
 */
export const closeWebSocket = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
  lastToken = undefined;
};

export default {
  initializeWebSocket,
  getWebSocket,
  closeWebSocket,
};
