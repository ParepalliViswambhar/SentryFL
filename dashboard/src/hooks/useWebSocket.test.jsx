import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import experimentsReducer from '../store/slices/experimentsSlice';
import metricsReducer from '../store/slices/metricsSlice';
import authReducer from '../store/slices/authSlice';
import useWebSocket from './useWebSocket';

const initializeWebSocket = vi.fn();
let socket;

vi.mock('../api/websocket', () => ({
  initializeWebSocket: (...args) => initializeWebSocket(...args),
}));

function createSocket() {
  const handlers = new Map();
  return {
    connected: false,
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event);
    }),
    emit: vi.fn(),
    trigger(event, payload) {
      handlers.get(event)?.(payload);
    },
  };
}

function HookProbe() {
  const { status, error } = useWebSocket('exp-1');
  return <output data-testid="state">{status}:{error?.message || ''}</output>;
}

function renderProbe() {
  const store = configureStore({
    reducer: {
      experiments: experimentsReducer,
      metrics: metricsReducer,
      auth: authReducer,
    },
    preloadedState: { auth: { token: 'jwt-token', user: null, status: 'idle', error: null } },
  });
  const view = render(
    <Provider store={store}>
      <HookProbe />
    </Provider>
  );
  return { store, view };
}

describe('useWebSocket', () => {
  beforeEach(() => {
    socket = createSocket();
    initializeWebSocket.mockReset();
    initializeWebSocket.mockReturnValue(socket);
  });

  it('connects with JWT, subscribes, and dispatches training updates', () => {
    const { store } = renderProbe();

    expect(initializeWebSocket).toHaveBeenCalledWith({ token: 'jwt-token' });
    expect(socket.emit).not.toHaveBeenCalledWith('subscribe', 'exp-1');

    act(() => {
      socket.connected = true;
      socket.trigger('connect');
      socket.trigger('training_round_complete', {
        experimentId: 'exp-1',
        timestamp: '2026-08-28T00:00:00.000Z',
        data: { round: 1, loss: 0.25, accuracy: 0.9 },
      });
    });

    expect(socket.emit).toHaveBeenCalledWith('subscribe', 'exp-1');
    expect(store.getState().metrics.training['exp-1']).toEqual([
      { round: 1, loss: 0.25, accuracy: 0.9, timestamp: '2026-08-28T00:00:00.000Z' },
    ]);
  });

  it('reports reconnecting and connection errors', () => {
    const { view } = renderProbe();

    act(() => socket.trigger('reconnect_attempt'));
    expect(view.getByTestId('state')).toHaveTextContent('reconnecting:');

    act(() => socket.trigger('connect_error', new Error('backend unavailable')));
    expect(view.getByTestId('state')).toHaveTextContent('error:backend unavailable');
  });
});
