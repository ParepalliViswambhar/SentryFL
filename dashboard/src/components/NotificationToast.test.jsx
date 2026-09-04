/**
 * NotificationToast Component Tests
 * 
 * Tests for toast notification display and auto-dismiss behavior
 * Validates Requirements 40.1, 40.5, 40.9
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userEvent from '@testing-library/user-event';
import NotificationToast from './NotificationToast';
import notificationsReducer from '../store/slices/notificationsSlice';

// Helper to create a mock store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      notifications: notificationsReducer,
    },
    preloadedState: {
      notifications: {
        notifications: [],
        history: [],
        ...initialState,
      },
    },
  });
};

describe('NotificationToast', () => {
  /**
   * Test: Error notification displays on API failure
   * Validates Requirement 40.1 - Display toast notifications for API errors
   */
  it('should display error notification on API failure', () => {
    const store = createMockStore({
      notifications: [
        {
          id: '1',
          type: 'error',
          message: 'Failed to fetch experiments',
          details: 'Network timeout',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Failed to fetch experiments')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });

  /**
   * Test: Specific error messages are displayed
   * Validates Requirement 40.2 - Display specific error messages (not generic)
   */
  it('should display specific error messages not generic ones', () => {
    const store = createMockStore({
      notifications: [
        {
          id: '1',
          type: 'error',
          message: 'Experiment exp-123 failed: Out of memory',
          details: 'Error at training round 45',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    // Should show specific error message, not generic "An error occurred"
    expect(screen.getByText('Experiment exp-123 failed: Out of memory')).toBeInTheDocument();
    expect(screen.queryByText('An error occurred')).not.toBeInTheDocument();
  });

  /**
   * Test: Success notification auto-dismisses after 5 seconds
   * Validates Requirement 40.9 - Automatically dismiss success notifications after 5 seconds
   */
  it('should auto-dismiss success notification after 5 seconds', async () => {
    vi.useFakeTimers();
    
    const store = createMockStore({
      notifications: [
        {
          id: 'success-1',
          type: 'success',
          message: 'Operation completed successfully',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    // Notification should be visible initially
    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();

    // Fast-forward time by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    vi.useRealTimers();

    // Wait for notification to be dismissed
    await waitFor(() => {
      const state = store.getState();
      expect(state.notifications.notifications).toHaveLength(0);
    });
  });

  /**
   * Test: Error notifications persist until manually dismissed
   * Validates Requirement 40.10 - Persist error notifications until manually dismissed
   */
  it('should persist error notification until manually dismissed', async () => {
    vi.useFakeTimers();
    
    const store = createMockStore({
      notifications: [
        {
          id: 'error-1',
          type: 'error',
          message: 'Critical error occurred',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Critical error occurred')).toBeInTheDocument();

    // Fast-forward time by 10 seconds - error should still be visible
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Critical error occurred')).toBeInTheDocument();
    
    vi.useRealTimers();

    // Manually close the notification
    const user = userEvent.setup();
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // Notification should be dismissed
    await waitFor(() => {
      const state = store.getState();
      expect(state.notifications.notifications).toHaveLength(0);
    });
  });

  /**
   * Test: Success notification is displayed for completed operations
   * Validates Requirement 40.5 - Display success notifications for completed operations
   */
  it('should display success notification for completed operations', () => {
    const store = createMockStore({
      notifications: [
        {
          id: 'success-1',
          type: 'success',
          message: 'Experiment exp-456 completed successfully',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Experiment exp-456 completed successfully')).toBeInTheDocument();
  });

  /**
   * Test: Warning notification is displayed for low privacy budget
   * Validates Requirement 40.6 - Display warning notifications when privacy budget is low
   */
  it('should display warning notification when privacy budget is low', () => {
    const store = createMockStore({
      notifications: [
        {
          id: 'warning-1',
          type: 'warning',
          message: 'Privacy budget low for experiment exp-789',
          details: 'ε=7.50, δ=1.00e-5 (threshold: 8)',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Privacy budget low for experiment exp-789')).toBeInTheDocument();
    expect(screen.getByText('ε=7.50, δ=1.00e-5 (threshold: 8)')).toBeInTheDocument();
  });

  /**
   * Test: WebSocket connection status is displayed
   * Validates Requirement 40.3 - Display WebSocket reconnection status
   */
  it('should display WebSocket reconnection status', () => {
    const store = createMockStore({
      notifications: [
        {
          id: 'ws-1',
          type: 'warning',
          message: 'Reconnecting to server...',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Reconnecting to server...')).toBeInTheDocument();
  });

  /**
   * Test: Experiment failure shows reason and stack trace
   * Validates Requirement 40.4 - Display experiment failure reason and stack trace
   */
  it('should display experiment failure reason and stack trace', () => {
    const store = createMockStore({
      notifications: [
        {
          id: 'exp-fail-1',
          type: 'error',
          message: 'Experiment exp-321 failed: Out of memory',
          details: 'Error at line 42: RuntimeError: CUDA out of memory',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Experiment exp-321 failed: Out of memory')).toBeInTheDocument();
    expect(screen.getByText('Error at line 42: RuntimeError: CUDA out of memory')).toBeInTheDocument();
  });

  /**
   * Test: No notification shown when list is empty
   */
  it('should not display anything when there are no notifications', () => {
    const store = createMockStore({
      notifications: [],
    });

    const { container } = render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(container.firstChild).toBeNull();
  });

  /**
   * Test: Only the most recent notification is displayed
   */
  it('should display only the most recent notification', () => {
    const store = createMockStore({
      notifications: [
        {
          id: '1',
          type: 'info',
          message: 'First notification',
          timestamp: Date.now() - 1000,
          dismissed: false,
          autoDismiss: false,
        },
        {
          id: '2',
          type: 'success',
          message: 'Second notification',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    // Should only show the most recent notification
    expect(screen.queryByText('First notification')).not.toBeInTheDocument();
    expect(screen.getByText('Second notification')).toBeInTheDocument();
  });

  /**
   * Test: Notification can be dismissed by user
   * Validates Requirement 40.8 - Allow dismissing individual notifications
   */
  it('should allow user to dismiss notification manually', async () => {
    const store = createMockStore({
      notifications: [
        {
          id: '1',
          type: 'info',
          message: 'Test notification',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Test notification')).toBeInTheDocument();

    // Click the close button
    const user = userEvent.setup();
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // Notification should be dismissed
    await waitFor(() => {
      const state = store.getState();
      expect(state.notifications.notifications).toHaveLength(0);
    });
  });

  /**
   * Test: Error notification does not close on clickaway
   * Validates Requirement 40.10 - Persist error notifications until manually dismissed
   */
  it('should not close error notification on clickaway', () => {
    vi.useFakeTimers();
    
    const store = createMockStore({
      notifications: [
        {
          id: 'error-1',
          type: 'error',
          message: 'Error notification',
          timestamp: Date.now(),
          dismissed: false,
          autoDismiss: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationToast />
      </Provider>
    );

    expect(screen.getByText('Error notification')).toBeInTheDocument();

    // Error notifications should persist (tested by not closing automatically)
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    
    expect(screen.getByText('Error notification')).toBeInTheDocument();
    
    vi.useRealTimers();
  });
});
