/**
 * Layout Component Tests
 * 
 * Tests for the main layout component including navigation, header, and routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Layout from './Layout';

// Mock react-router-dom hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

describe('Layout Component', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('renders navigation sidebar with correct links', () => {
    render(
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    );

    // Check for navigation items
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('New Experiment')).toBeInTheDocument();
    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders header with app title', () => {
    render(
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    );

    expect(screen.getByText('Federated Learning Dashboard')).toBeInTheDocument();
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
  });

  it('renders user menu button', () => {
    render(
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    );

    const userMenuButton = screen.getByLabelText('account of current user');
    expect(userMenuButton).toBeInTheDocument();
  });

  it('opens user menu when clicked', async () => {
    render(
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    );

    const userMenuButton = screen.getByLabelText('account of current user');
    fireEvent.click(userMenuButton);

    // Check for logout option
    expect(await screen.findByText('Logout')).toBeInTheDocument();
  });

  it('handles logout correctly', async () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    );

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
