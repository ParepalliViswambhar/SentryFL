/**
 * App Component Integration Tests
 *
 * Tests for routing configuration and navigation.
 *
 * Redesign notes:
 * - The Layout renders its navigation in TWO drawers (a keepMounted temporary
 *   drawer and a permanent drawer), so every nav label and the brand text render
 *   more than once in jsdom. Assertions on those use getAllByText.
 * - MUI marks required fields with an asterisk, so the accessible label is
 *   "Username *" / "Password *"; queries use an anchored regex, not an exact string.
 * - Page headings were rebranded (e.g. "Overview" instead of "Dashboard"); tests
 *   assert on stable, page-unique body text that renders regardless of fetch state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

// Required MUI fields expose their label as "Username *"/"Password *".
const usernameField = () => screen.getByLabelText(/^username/i);
const passwordField = () => screen.getByLabelText(/^password/i);

describe('App Routing Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders login page for unauthenticated users', () => {
    renderAt('/');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
    expect(passwordField()).toBeInTheDocument();
  });

  it('renders dashboard for authenticated users at root path', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/');
    expect(screen.getByText('Live status of your federated learning runs')).toBeInTheDocument();
    expect(screen.getByText('Active runs')).toBeInTheDocument();
  });
  it('renders new experiment page at /experiments/new', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/experiments/new');
    expect(screen.getByText('Create New Experiment')).toBeInTheDocument();
  });

  it('renders experiment list page at /experiments', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/experiments');
    // The count subtitle renders regardless of fetch state and is unique to this page.
    expect(screen.getByText('0 experiments')).toBeInTheDocument();
  });

  it('renders experiment detail page at /experiments/:id', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/experiments/test-exp-123');
    // Detail page mounts and fetches; the loading indicator is deterministic.
    expect(screen.getByLabelText('Loading experiment')).toBeInTheDocument();
  });

  it('renders comparison page at /comparison', async () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/comparison');
    // Comparison shows a full-page spinner while the initial fetch is loading
    // (Comparison.jsx guards on `status === 'loading' && experiments.length === 0`).
    // With no server the fetch rejects, the gate clears, and the heading renders.
    await waitFor(() => {
      expect(screen.getByText('Experiment Comparison')).toBeInTheDocument();
    });
  });

  it('renders settings page at /settings', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/settings');
    expect(
      screen.getByText('Configure application preferences and system settings')
    ).toBeInTheDocument();
  });

  it('redirects to login for protected routes without auth', async () => {
    renderAt('/experiments');
    await waitFor(() => {
      expect(screen.getByText('SentryFL')).toBeInTheDocument();
      expect(usernameField()).toBeInTheDocument();
    });
  });

  it('maintains layout with navigation on authenticated routes', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/');
    // Brand + nav labels render in both drawers, so match all copies.
    expect(screen.getAllByText('Federated Learning').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New Experiment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Experiments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Comparison').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });
});

describe('Route Navigation Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('authToken', 'test-token');
  });

  it('navigates to /experiments/new when New Experiment link is clicked', async () => {
    renderAt('/');
    fireEvent.click(screen.getAllByText('New Experiment')[0]);
    await waitFor(() => {
      expect(screen.getByText('Create New Experiment')).toBeInTheDocument();
    });
  });

  it('navigates to /experiments when Experiments link is clicked', async () => {
    renderAt('/');
    fireEvent.click(screen.getAllByText('Experiments')[0]);
    await waitFor(() => {
      expect(screen.getByText('0 experiments')).toBeInTheDocument();
    });
  });

  it('navigates to /comparison when Comparison link is clicked', async () => {
    renderAt('/');
    fireEvent.click(screen.getAllByText('Comparison')[0]);
    await waitFor(() => {
      expect(screen.getByText('Experiment Comparison')).toBeInTheDocument();
    });
  });

  it('navigates to /settings when Settings link is clicked', async () => {
    renderAt('/');
    fireEvent.click(screen.getAllByText('Settings')[0]);
    await waitFor(() => {
      expect(
        screen.getByText('Configure application preferences and system settings')
      ).toBeInTheDocument();
    });
  });

  it('navigates back to the overview when Overview link is clicked', async () => {
    renderAt('/experiments');
    expect(screen.getByText('0 experiments')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Overview')[0]);
    await waitFor(() => {
      expect(screen.getByText('Live status of your federated learning runs')).toBeInTheDocument();
    });
  });
});

describe('PrivateRoute Authentication Guard Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated user from / to /login', () => {
    renderAt('/');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
    expect(passwordField()).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /experiments to /login', () => {
    renderAt('/experiments');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /experiments/new to /login', () => {
    renderAt('/experiments/new');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /experiments/:id to /login', () => {
    renderAt('/experiments/test-123');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /comparison to /login', () => {
    renderAt('/comparison');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
  });

  it('redirects unauthenticated user from /settings to /login', () => {
    renderAt('/settings');
    expect(screen.getByText('SentryFL')).toBeInTheDocument();
    expect(usernameField()).toBeInTheDocument();
  });

  it('allows authenticated user to access protected routes', () => {
    localStorage.setItem('authToken', 'test-token');
    renderAt('/');
    // Should NOT redirect to login.
    expect(screen.queryByLabelText(/^username/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
    // Should show dashboard content.
    expect(screen.getByText('Live status of your federated learning runs')).toBeInTheDocument();
  });
});

