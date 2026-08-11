/**
 * App Component Integration Tests
 * 
 * Tests for routing configuration and navigation
 * 
 * **Validates: Requirements 27.2, 27.5**
 * 
 * Tests:
 * - Route navigation and URL changes
 * - PrivateRoute redirects unauthenticated users to /login
 * - Protected routes require authentication
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App Routing Integration', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('renders login page for unauthenticated users', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders dashboard for authenticated users at root path', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Active Experiments')).toBeInTheDocument();
  });

  it('renders new experiment page at /experiments/new', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/experiments/new']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Create New Experiment')).toBeInTheDocument();
  });

  it('renders experiment list page at /experiments', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/experiments']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByText('View and manage all federated learning experiments')).toBeInTheDocument();
  });

  it('renders experiment detail page at /experiments/:id', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/experiments/test-exp-123']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Experiment Details')).toBeInTheDocument();
    expect(screen.getByText('Viewing experiment: test-exp-123')).toBeInTheDocument();
  });

  it('renders comparison page at /comparison', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/comparison']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Experiment Comparison')).toBeInTheDocument();
  });

  it('renders settings page at /settings', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Configure application preferences and system settings')).toBeInTheDocument();
  });

  it('redirects to login for protected routes without auth', async () => {
    render(
      <MemoryRouter initialEntries={['/experiments']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    await waitFor(() => {
      expect(screen.getByText('SentryFL')).toBeInTheDocument();
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });
  });

  it('maintains layout with navigation on authenticated routes', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Check layout is present
    expect(screen.getByText('Federated Learning Dashboard')).toBeInTheDocument();
    
    // Check navigation items are present
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('New Experiment')).toBeInTheDocument();
    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('Route Navigation Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('authToken', 'test-token');
  });

  it('navigates to /experiments/new when New Experiment link is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Click on New Experiment link
    const newExpLink = screen.getByText('New Experiment');
    await user.click(newExpLink);

    // Verify navigation occurred
    await waitFor(() => {
      expect(screen.getByText('Create New Experiment')).toBeInTheDocument();
    });
  });

  it('navigates to /experiments when Experiments link is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Click on Experiments link
    const experimentsLink = screen.getByText('Experiments');
    await user.click(experimentsLink);

    // Verify navigation occurred
    await waitFor(() => {
      expect(screen.getByText('View and manage all federated learning experiments')).toBeInTheDocument();
    });
  });

  it('navigates to /comparison when Comparison link is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Click on Comparison link
    const comparisonLink = screen.getByText('Comparison');
    await user.click(comparisonLink);

    // Verify navigation occurred
    await waitFor(() => {
      expect(screen.getByText('Experiment Comparison')).toBeInTheDocument();
    });
  });

  it('navigates to /settings when Settings link is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Click on Settings link
    const settingsLink = screen.getByText('Settings');
    await user.click(settingsLink);

    // Verify navigation occurred
    await waitFor(() => {
      expect(screen.getByText('Configure application preferences and system settings')).toBeInTheDocument();
    });
  });

  it('navigates back to dashboard when Dashboard link is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={['/experiments']}>
        <App />
      </MemoryRouter>
    );

    // Initially on experiments page
    expect(screen.getByText('View and manage all federated learning experiments')).toBeInTheDocument();

    // Click on Dashboard link
    const dashboardLink = screen.getByText('Dashboard');
    await user.click(dashboardLink);

    // Verify navigation occurred
    await waitFor(() => {
      expect(screen.getByText('Active Experiments')).toBeInTheDocument();
    });
  });
});

describe('PrivateRoute Authentication Guard Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated user from / to /login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /experiments to /login', () => {
    render(
      <MemoryRouter initialEntries={['/experiments']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /experiments/new to /login', () => {
    render(
      <MemoryRouter initialEntries={['/experiments/new']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /experiments/:id to /login', () => {
    render(
      <MemoryRouter initialEntries={['/experiments/test-123']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /comparison to /login', () => {
    render(
      <MemoryRouter initialEntries={['/comparison']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /settings to /login', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );

    // Should redirect to login
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('allows authenticated user to access protected routes', () => {
    localStorage.setItem('authToken', 'test-token');

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Should NOT redirect to login
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    
    // Should show dashboard content
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
