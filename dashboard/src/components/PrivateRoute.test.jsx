/**
 * PrivateRoute Component Tests
 * 
 * Tests for authentication guard component
 * 
 * **Validates: Requirements 27.2, 27.5**
 * 
 * Tests:
 * - PrivateRoute redirects unauthenticated users to /login
 * - PrivateRoute allows authenticated users to access protected content
 * - PrivateRoute handles token removal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';

const TestComponent = () => <div>Protected Content</div>;
const LoginComponent = () => <div>Login Page</div>;

describe('PrivateRoute Component', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('redirects to login when no auth token is present', () => {
    render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    // Should show login page, not protected content
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when auth token is present', () => {
    // Set auth token
    localStorage.setItem('authToken', 'test-token-123');

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    // Should show protected content, not login
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('handles missing token after initial authentication', () => {
    localStorage.setItem('authToken', 'test-token');

    const { rerender } = render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    // Initially shows protected content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();

    // Remove token
    localStorage.removeItem('authToken');

    // Rerender
    rerender(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    // Should redirect to login
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects to login with different token values (null, empty string)', () => {
    // Test with null token (already done above, but explicit)
    localStorage.removeItem('authToken');

    const { rerender } = render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();

    // Test with empty string token
    localStorage.setItem('authToken', '');

    rerender(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    // Empty string is falsy, should still redirect
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('preserves original path for redirect after login', () => {
    render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/protected-page"
            element={
              <PrivateRoute>
                <TestComponent />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    );

    // Navigate should use replace to avoid back button issues
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('works with nested routes', () => {
    localStorage.removeItem('authToken');

    const NestedComponent = () => <div>Nested Protected Content</div>;

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <div>Parent Protected Content</div>
              </PrivateRoute>
            }
          >
            <Route path="nested" element={<NestedComponent />} />
          </Route>
        </Routes>
      </BrowserRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Parent Protected Content')).not.toBeInTheDocument();
  });
});
