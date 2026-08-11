/**
 * WebSocket Client Configuration
 * 
 * Manages WebSocket connection to the SentryFL API Server for real-time updates
 */

import { io } from 'socket.io-client';

let socket = null;

/**
 * Initialize WebSocket connection
 * @returns {Socket} Socket.io client instance
 */
export const initializeWebSocket = () => {
  if (socket && socket.connected) {
    return socket;
  }

  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
  
  socket = io(wsUrl, {
    transports: ['websocket', 'polling'],
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
};

/**
 * Subscribe to training updates
 * @param {Function} callback - Called when training update is received
 */
export const subscribeToTrainingUpdates = (callback) => {
  const ws = getWebSocket();
  ws.on('training:update', callback);
  
  // Return unsubscribe function
  return () => ws.off('training:update', callback);
};

/**
 * Subscribe to experiment status changes
 * @param {Function} callback - Called when status changes
 */
export const subscribeToExperimentStatus = (callback) => {
  const ws = getWebSocket();
  ws.on('experiment:status', callback);
  
  return () => ws.off('experiment:status', callback);
};

/**
 * Subscribe to privacy budget updates
 * @param {Function} callback - Called when privacy budget is updated
 */
export const subscribeToPrivacyUpdates = (callback) => {
  const ws = getWebSocket();
  ws.on('privacy:budget', callback);
  
  return () => ws.off('privacy:budget', callback);
};

/**
 * Subscribe to training completion
 * @param {Function} callback - Called when training completes
 */
export const subscribeToTrainingComplete = (callback) => {
  const ws = getWebSocket();
  ws.on('training:complete', callback);
  
  return () => ws.off('training:complete', callback);
};

export default {
  initializeWebSocket,
  getWebSocket,
  closeWebSocket,
  subscribeToTrainingUpdates,
  subscribeToExperimentStatus,
  subscribeToPrivacyUpdates,
  subscribeToTrainingComplete,
};
