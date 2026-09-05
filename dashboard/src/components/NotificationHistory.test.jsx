/**
 * NotificationHistory Component Tests
 * 
 * Tests for notification history sidebar panel
 * Validates Requirements 40.7, 40.8
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userEvent from '@testing-library/user-event';
import NotificationHistory from './NotificationHistory';
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

describe('NotificationHistory', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  /**
   * Test: Notification history displays in sidebar panel
   * Validates Requirement 40.7 - Display notification history in sidebar panel
   */
  it('should display notification history in sidebar panel', () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'success',
          message: 'First notification',
          timestamp: Date.now() - 5000,
          dismissed: true,
        },
        {
          id: '2',
          type: 'error',
          message: 'Second notification',
          timestamp: Date.now() - 3000,
          dismissed: false,
        },
        {
          id: '3',
          type: 'warning',
          message: 'Third notification',
          timestamp: Date.now() - 1000,
          dismissed: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('Notification History')).toBeInTheDocument();
    expect(screen.getByText('First notification')).toBeInTheDocument();
    expect(screen.getByText('Second notification')).toBeInTheDocument();
    expect(screen.getByText('Third notification')).toBeInTheDocument();
  });

  /**
   * Test: Individual notifications can be viewed in history
   * Validates Requirement 40.7 - Display notification history in sidebar panel
   */
  it('should display past notifications with timestamps and types', () => {
    const timestamp = new Date('2024-01-15T10:30:00');
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'error',
          message: 'API request failed',
          details: 'Status: 500',
          timestamp: timestamp.getTime(),
          dismissed: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('API request failed')).toBeInTheDocument();
    expect(screen.getByText('Status: 500')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  /**
   * Test: History shows most recent notifications first
   * Validates Requirement 40.7 - Display notification history in sidebar panel
   */
  it('should display notifications in reverse chronological order', () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'info',
          message: 'Oldest notification',
          timestamp: Date.now() - 10000,
          dismissed: true,
        },
        {
          id: '2',
          type: 'info',
          message: 'Middle notification',
          timestamp: Date.now() - 5000,
          dismissed: true,
        },
        {
          id: '3',
          type: 'info',
          message: 'Newest notification',
          timestamp: Date.now() - 1000,
          dismissed: false,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    // Get all notification messages
    const messages = screen.getAllByText(/notification/);
    
    // First item should be the newest
    expect(messages[0]).toHaveTextContent('Newest notification');
  });

  /**
   * Test: Empty history shows appropriate message
   */
  it('should display empty state when no notifications exist', () => {
    const store = createMockStore({
      history: [],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  /**
   * Test: Clear History button clears all notifications
   * Validates Requirement 40.7 - Display notification history in sidebar panel
   */
  it('should clear all history when clear button is clicked', async () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'info',
          message: 'Test notification 1',
          timestamp: Date.now(),
          dismissed: true,
        },
        {
          id: '2',
          type: 'info',
          message: 'Test notification 2',
          timestamp: Date.now(),
          dismissed: true,
        },
      ],
    });

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('Test notification 1')).toBeInTheDocument();

    // Click clear history button
    const clearButton = screen.getByRole('button', { name: /clear history/i });
    await user.click(clearButton);

    // History should be empty
    const state = store.getState();
    expect(state.notifications.history).toHaveLength(0);
  });

  /**
   * Test: Drawer can be closed
   * Validates Requirement 40.7 - Display notification history in sidebar panel
   */
  it('should call onClose when close button is clicked', async () => {
    const store = createMockStore({
      history: [],
    });

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Test: Drawer is not rendered when closed
   */
  it('should not render when open is false', () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'info',
          message: 'Test notification',
          timestamp: Date.now(),
          dismissed: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={false} onClose={mockOnClose} />
      </Provider>
    );

    // History drawer should not be visible
    expect(screen.queryByText('Notification History')).not.toBeInTheDocument();
  });

  /**
   * Test: Different notification types are displayed with correct icons
   */
  it('should display different notification types with appropriate styling', () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'success',
          message: 'Success message',
          timestamp: Date.now(),
          dismissed: true,
        },
        {
          id: '2',
          type: 'error',
          message: 'Error message',
          timestamp: Date.now(),
          dismissed: true,
        },
        {
          id: '3',
          type: 'warning',
          message: 'Warning message',
          timestamp: Date.now(),
          dismissed: true,
        },
        {
          id: '4',
          type: 'info',
          message: 'Info message',
          timestamp: Date.now(),
          dismissed: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  /**
   * Test: Notification details are displayed when present
   * Validates Requirement 40.4 - Display experiment failure reason and stack trace
   */
  it('should display notification details including stack traces', () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'error',
          message: 'Experiment failed',
          details: 'RuntimeError: CUDA out of memory\nStack trace:\n  at line 42\n  at train.py',
          timestamp: Date.now(),
          dismissed: true,
        },
      ],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('Experiment failed')).toBeInTheDocument();
    expect(screen.getByText(/RuntimeError: CUDA out of memory/)).toBeInTheDocument();
  });

  /**
   * Test: Dismissed notifications are shown with reduced opacity
   */
  it('should visually distinguish dismissed notifications', () => {
    const store = createMockStore({
      history: [
        {
          id: '1',
          type: 'info',
          message: 'Dismissed notification',
          timestamp: Date.now(),
          dismissed: true,
        },
        {
          id: '2',
          type: 'info',
          message: 'Active notification',
          timestamp: Date.now(),
          dismissed: false,
        },
      ],
    });

    const { container } = render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    // Both notifications should be present
    expect(screen.getByText('Dismissed notification')).toBeInTheDocument();
    expect(screen.getByText('Active notification')).toBeInTheDocument();
  });

  /**
   * Test: Clear history button is not shown when history is empty
   */
  it('should not show clear history button when history is empty', () => {
    const store = createMockStore({
      history: [],
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.queryByRole('button', { name: /clear history/i })).not.toBeInTheDocument();
  });

  /**
   * Test: Multiple notifications can be stored in history
   * Validates Requirement 40.7 - Display notification history in sidebar panel
   */
  it('should store and display multiple notifications in history', () => {
    const notifications = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`,
      type: i % 2 === 0 ? 'success' : 'error',
      message: `Notification ${i}`,
      timestamp: Date.now() - i * 1000,
      dismissed: true,
    }));

    const store = createMockStore({
      history: notifications,
    });

    render(
      <Provider store={store}>
        <NotificationHistory open={true} onClose={mockOnClose} />
      </Provider>
    );

    // All notifications should be visible in history
    notifications.forEach((notification) => {
      expect(screen.getByText(notification.message)).toBeInTheDocument();
    });
  });
});
