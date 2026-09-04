import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addPrivacyMetric,
  addTrainingMetric,
} from '../store/slices/metricsSlice';
import { updateExperimentStatus } from '../store/slices/experimentsSlice';
import {
  addWebSocketStatus,
  addExperimentFailure,
  addPrivacyBudgetWarning,
  addNotification,
} from '../store/slices/notificationsSlice';
import { initializeWebSocket } from '../api/websocket';
import { debounceWebSocketEvent } from '../utils/debounceUtils';

const EVENT_NAMES = [
  'training_round_complete',
  'privacy_budget_update',
  'experiment_status_change',
  'error',
];

const getEventPayload = (event) => ({
  experimentId: event?.experimentId,
  data: event?.data || {},
});

/**
 * Connect to the API server and stream updates for one experiment.
 * @param {string|null} experimentId - Experiment room to subscribe to.
 * @param {{enabled?: boolean, token?: string|null, onError?: Function}} options
 * @returns {{socket: object|null, status: string, error: object|null}}
 */
export default function useWebSocket(experimentId, options = {}) {
  const dispatch = useDispatch();
  const authToken = useSelector((state) => state.auth?.token);
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const bufferedEventsRef = useRef([]);
  const statusRef = useRef(status);
  const onErrorRef = useRef(options.onError);
  const enabled = options.enabled !== false && Boolean(experimentId);
  const token = options.token ?? authToken;

  statusRef.current = status;
  onErrorRef.current = options.onError;

  useEffect(() => {
    if (!enabled || !token) {
      setStatus('disconnected');
      socketRef.current = null;
      return undefined;
    }

    const socket = initializeWebSocket({ token });
    socketRef.current = socket;
    setStatus(socket.connected ? 'connected' : 'connecting');

    const dispatchEvent = (eventName, event) => {
      if (statusRef.current !== 'connected' && !socket.connected) {
        bufferedEventsRef.current.push({ eventName, event });
        return;
      }

      const { experimentId: eventExperimentId, data } = getEventPayload(event);
      if (eventExperimentId !== experimentId) return;

      if (eventName === 'training_round_complete') {
        dispatch({ type: addTrainingMetric.type, payload: { experimentId, metric: { ...data, timestamp: event.timestamp } } });
      } else if (eventName === 'privacy_budget_update') {
        dispatch({ type: addPrivacyMetric.type, payload: { experimentId, metric: { ...data, timestamp: event.timestamp } } });
        const threshold = 8.0;
        if (data.epsilon && data.epsilon > threshold * 0.8) {
          dispatch(addPrivacyBudgetWarning({ experimentId, epsilon: data.epsilon, delta: data.delta || 0, threshold }));
        }
      } else if (eventName === 'experiment_status_change') {
        // Status changes are infrequent, handle immediately
        dispatch(updateExperimentStatus({ id: experimentId, ...data }));
        
        // Check if experiment failed
        if (data.status === 'failed') {
          dispatch(addExperimentFailure({
            experimentId,
            reason: data.error || 'Unknown error',
            stackTrace: data.stackTrace || data.error,
          }));
        } else if (data.status === 'completed') {
          dispatch(addNotification({
            type: 'success',
            message: `Experiment ${experimentId} completed successfully`,
          }));
        }
      } else if (eventName === 'error') {
        // Errors are critical, handle immediately
        setError(data);
        dispatch(addNotification({
          type: 'error',
          message: data.message || 'WebSocket error occurred',
          details: data.details || String(data),
        }));
        onErrorRef.current?.(data);
      }
    };

    const debouncedMetricEvent = debounceWebSocketEvent(dispatchEvent, 16);
    let metricBurstActive = false;
    let metricBurstTimer;
    const handleMetricEvent = (eventName, event) => {
      if (eventName === 'training_round_complete' || eventName === 'privacy_budget_update') {
        if (!metricBurstActive) {
          metricBurstActive = true;
          dispatchEvent(eventName, event);
          metricBurstTimer = setTimeout(() => { metricBurstActive = false; }, 16);
        } else {
          debouncedMetricEvent(eventName, event);
        }
      } else {
        dispatchEvent(eventName, event);
      }
    };

    const handleConnect = () => {
      setStatus('connected');
      setError(null);
      dispatch(addWebSocketStatus({ status: 'connected' }));
      socket.emit('subscribe', experimentId);
      const bufferedEvents = bufferedEventsRef.current.splice(0);
      bufferedEvents.forEach(({ eventName, event }) => dispatchEvent(eventName, event));
    };
    const handleDisconnect = () => {
      setStatus('disconnected');
      dispatch(addWebSocketStatus({ status: 'disconnected' }));
    };
    const handleConnectError = (connectionError) => {
      setStatus('error');
      setError(connectionError);
      dispatch(addWebSocketStatus({ status: 'error', error: connectionError }));
    };
    const handleReconnectAttempt = () => {
      setStatus('reconnecting');
      dispatch(addWebSocketStatus({ status: 'reconnecting' }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    const eventHandlers = Object.fromEntries(
      EVENT_NAMES.map((eventName) => [eventName, (event) => handleMetricEvent(eventName, event)])
    );
    EVENT_NAMES.forEach((eventName) => socket.on(eventName, eventHandlers[eventName]));

    if (socket.connected) handleConnect();

    return () => {
      socket.emit('unsubscribe', experimentId);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      EVENT_NAMES.forEach((eventName) => socket.off(eventName, eventHandlers[eventName]));
      debouncedMetricEvent.cancel();
      clearTimeout(metricBurstTimer);
      socketRef.current = null;
    };
  }, [dispatch, enabled, experimentId, token]);

  return { socket: socketRef.current, status, error };
}