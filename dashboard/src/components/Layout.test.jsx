/**
 * Layout Component Tests
 * 
 * Tests for the main layout component including navigation, header, and routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Layout from './Layout';
import authReducer from '../store/slices/authSlice';
import notificationsReducer from '../store/slices/notificationsSlice';
import experimentsReducer from '../store/slices/experimentsSlice';

// Mock react-router-dom hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

// Layout selects from auth, notifications, and experiments slices and mounts
// the app-wide live subscription, so it needs a real store with those slices.
const renderLayout = () =>
  render(
    <Provider
      store={configureStore({
        reducer: {
          auth: authReducer,
          notifications: notificationsReducer,
          experiments: experimentsReducer,
        },
      })}
    >
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </Provider>
  );

describe('Layout Component', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('renders navigation sidebar with correct links', () => {
    renderLayout();
    // The permanent and the keepMounted temporary drawer both render the nav,
    // so each label appears more than once — assert presence, not uniqueness.
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New Experiment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Experiments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Comparison').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });

  it('renders header with app title', () => {
    renderLayout();

    // "SentryFL" brand shows in both drawers; the AppBar shows the page title.
    expect(screen.getAllByText('SentryFL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
  });

  it('renders user menu button', () => {
    renderLayout();

    const userMenuButton = screen.getByLabelText('account of current user');
    expect(userMenuButton).toBeInTheDocument();
  });

  it('opens user menu when clicked', async () => {
    renderLayout();

    const userMenuButton = screen.getByLabelText('account of current user');
    fireEvent.click(userMenuButton);

    // Check for logout option
    expect(await screen.findByText('Logout')).toBeInTheDocument();
  });

  it('handles logout correctly', async () => {
    localStorage.setItem('authToken', 'test-token');

    renderLayout();

    // Open user menu
    const userMenuButton = screen.getByLabelText('account of current user');
    fireEvent.click(userMenuButton);

    // Click logout
    const logoutButton = await screen.findByText('Logout');
    fireEvent.click(logoutButton);

    // Check token is removed
    expect(localStorage.getItem('authToken')).toBeNull();
  });
});
