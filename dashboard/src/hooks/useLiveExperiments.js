/**
 * useLiveExperiments
 *
 * A single, app-wide realtime subscription manager. Mounted once (in the
 * Layout), it keeps one Socket.IO connection open and subscribes to every
 * active experiment — plus whichever experiment is currently focused — so the
 * dashboard, the sidebar counts, the activity strip and the detail page all
 * update live no matter where the user is. This replaces the old per-page,
 * single-id `useWebSocket` model, which meant nothing streamed unless the user
 * happened to be sitting on one experiment's detail view.
 *
 * Events are routed by the experimentId carried in each payload, so a burst of
 * updates for several concurrent runs all land in the right place.
 *
 * @module hooks/useLiveExperiments
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addPrivacyMetric, addTrainingMetric } from '../store/slices/metricsSlice';
import { selectActiveExperiments, updateExperimentStatus, recordExperimentHeartbeat, refreshExperimentStatus } from '../store/slices/experimentsSlice';
import {
  addExperimentFailure,
  addNotification,
  addPrivacyBudgetWarning,
} from '../store/slices/notificationsSlice';
import { initializeWebSocket } from '../api/websocket';

const EVENT_NAMES = [
  'training_round_complete',
  'privacy_budget_update',
  'experiment_status_change',
  'heartbeat',
  'error',
];

const EPSILON_WARN_THRESHOLD = 8.0;

/**
 * @param {string|null} [focusedId] - Experiment whose detail view is open, if any.
 * @param {{enabled?: boolean}} [options]
 * @returns {{status: string, error: object|null, subscribedIds: string[]}}
 */
export default function useLiveExperiments(focusedId = null, options = {}) {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth?.token);
  const activeExperiments = useSelector(selectActiveExperiments);
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const enabled = options.enabled !== false;

  // Stable, sorted list of experiment ids we want to be subscribed to.
  const desiredIds = useMemo(() => {
    const ids = new Set(activeExperiments.map((exp) => exp.id).filter(Boolean));
    if (focusedId) ids.add(focusedId);
    return Array.from(ids).sort();
  }, [activeExperiments, focusedId]);
  const desiredKey = desiredIds.join('|');

  const desiredIdsRef = useRef(desiredIds);
  desiredIdsRef.current = desiredIds;
  const subscribedRef = useRef(new Set());
  const socketRef = useRef(null);

  // Route one wrapped event to the right slice, keyed by the id in its payload
  // (NOT by whatever is focused) so concurrent runs never cross-contaminate.
  const routeEvent = useCallback(
    (eventName, event) => {
      const experimentId = event?.experimentId;
      if (!experimentId) return;
      const data = event?.data || {};
      const timestamp = event?.timestamp || data.timestamp;

      switch (eventName) {
        case 'training_round_complete': {
          dispatch(addTrainingMetric({ experimentId, metric: { ...data, timestamp } }));
          // Advance the run's round even if no explicit status event arrives, so
          // progress bars move the moment a round lands.
          const round = data.round ?? data.round_number;
          if (typeof round === 'number') {
            dispatch(updateExperimentStatus({ id: experimentId, status: 'running', currentRound: round, totalRounds: data.totalRounds }));
          }
          break;
        }
        case 'privacy_budget_update': {
          dispatch(addPrivacyMetric({ experimentId, metric: { ...data, timestamp } }));
          if (typeof data.epsilon === 'number' && data.epsilon > EPSILON_WARN_THRESHOLD * 0.8) {
            dispatch(
              addPrivacyBudgetWarning({
                experimentId,
                epsilon: data.epsilon,
                delta: data.delta ?? 0,
                threshold: EPSILON_WARN_THRESHOLD,
              })
            );
          }
          break;
        }
        case 'experiment_status_change': {
          const { status: newStatus, previousStatus, message, currentRound, totalRounds, progress } = data;
          dispatch(
            updateExperimentStatus({ id: experimentId, status: newStatus, currentRound, totalRounds, progress })
          );
          if (newStatus === 'failed') {
            dispatch(
              addExperimentFailure({
                experimentId,
                reason: message || data.error || 'Experiment failed',
                stackTrace: data.details || data.stackTrace,
              })
            );
          } else if (newStatus === 'completed') {
            dispatch(addNotification({ type: 'success', message: `Experiment ${experimentId} completed` }));
          } else if (newStatus === 'running' && previousStatus && previousStatus !== 'running') {
            dispatch(addNotification({ type: 'info', message: `Experiment ${experimentId} started running` }));
          }
          break;
        }
        case 'heartbeat': {
          // Liveness proof: refresh round counters and the last-seen stamp so the
          // "live · updated Ns ago" indicator stays fresh during slow setup and
          // between rounds. Never revives a terminal run (guarded in the reducer).
          dispatch(
            recordExperimentHeartbeat({
              id: experimentId,
              status: data.status,
              currentRound: data.currentRound,
              totalRounds: data.totalRounds,
            })
          );
          break;
        }
        case 'error': {
          dispatch(
            addExperimentFailure({
              experimentId,
              reason: data.message || 'Training error',
              stackTrace: data.details || data.code,
            })
          );
          break;
        }
        default:
          break;
      }
    },
    [dispatch]
  );
  const routeEventRef = useRef(routeEvent);
  routeEventRef.current = routeEvent;

  // Socket lifecycle + handlers. Runs once per token change; the singleton
  // socket is shared app-wide, so we detach our handlers on cleanup but never
  // tear the connection down here.
  useEffect(() => {
    if (!enabled || !token) {
      setStatus('disconnected');
      return undefined;
    }

    let socket;
    try {
      socket = initializeWebSocket({ token });
    } catch (err) {
      setStatus('error');
      setError({ message: err?.message || 'Failed to open realtime connection' });
      return undefined;
    }
    socketRef.current = socket;

    const subscribeAll = () => {
      subscribedRef.current = new Set();
      desiredIdsRef.current.forEach((id) => {
        socket.emit('subscribe', id);
        subscribedRef.current.add(id);
      });
    };

    const handleConnect = () => {
      setStatus('connected');
      setError(null);
      subscribeAll();
    };
    const handleDisconnect = () => {
      setStatus('disconnected');
    };
    const handleConnectError = (err) => {
      setStatus('error');
      setError({ message: err?.message || 'Connection error' });
    };
    const handleReconnectAttempt = () => setStatus('reconnecting');
    const handleBuffered = (payload) => {
      const events = Array.isArray(payload) ? payload : payload?.events || [];
      events.forEach((item) => routeEventRef.current(item?.type || item?.eventName, item));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io?.on?.('reconnect_attempt', handleReconnectAttempt);
    socket.on('buffered_events', handleBuffered);

    const namedHandlers = EVENT_NAMES.map((name) => {
      const handler = (event) => routeEventRef.current(name, event);
      socket.on(name, handler);
      return [name, handler];
    });

    // Already connected (singleton reused across mounts): sync immediately.
    if (socket.connected) handleConnect();
    else setStatus('connecting');

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io?.off?.('reconnect_attempt', handleReconnectAttempt);
      socket.off('buffered_events', handleBuffered);
      namedHandlers.forEach(([name, handler]) => socket.off(name, handler));
      subscribedRef.current.forEach((id) => socket.emit('unsubscribe', id));
      subscribedRef.current = new Set();
    };
  }, [dispatch, token, enabled]);

  // Reconcile the live subscription set as experiments start/finish or the
  // focused id changes. Only acts once connected; the connect handler does the
  // initial bulk subscribe.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || status !== 'connected') return;

    const desired = new Set(desiredIds);
    const current = subscribedRef.current;

    desired.forEach((id) => {
      if (!current.has(id)) {
        socket.emit('subscribe', id);
        current.add(id);
      }
    });
    current.forEach((id) => {
      if (!desired.has(id)) {
        socket.emit('unsubscribe', id);
        current.delete(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredKey, status]);

  // REST status-poll fallback behind the socket. A just-created run 404s until
  // the backend registers it and emits nothing until its (slow) first round
  // lands, so `GET /experiments/:id/status` — which always queries the Python
  // backend fresh — keeps progress visibly moving. We poll hard while the
  // socket is down and keep a slow heartbeat while it's up to catch any status
  // transition the socket might have missed (e.g. completion fired before we
  // subscribed). `refreshExperimentStatus` uses `skipErrorToast`, so the
  // transient 404s never reach the user as popups.
  useEffect(() => {
    if (!enabled || !token || desiredIds.length === 0) return undefined;

    const pollOnce = () => {
      desiredIdsRef.current.forEach((id) => dispatch(refreshExperimentStatus(id)));
    };

    const intervalMs = status === 'connected' ? 15000 : 4000;
    pollOnce();
    const handle = setInterval(pollOnce, intervalMs);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredKey, status, enabled, token, dispatch]);

  return { status, error, subscribedIds: desiredIds };
}
