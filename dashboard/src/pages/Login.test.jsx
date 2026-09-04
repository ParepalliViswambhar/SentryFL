/**
 * Login Component Tests
 * 
 * Tests for login form validation and authentication flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from './Login';
import apiClient from '../api/client';

// Mock API client
vi.mock('../api/client');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderLogin = () => {
    return render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
  };

  describe('Form Rendering', () => {
    it('should render login form with username and password inputs', () => {
      renderLogin();
      
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should display SentryFL branding', () => {
      renderLogin();
      
      expect(screen.getByText('SentryFL')).toBeInTheDocument();
      expect(screen.getByText('Federated Learning Dashboard')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when username is empty on submit', async () => {
      renderLogin();
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      });
      
      // Should not call API
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('should show error when username is too short', async () => {
      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      fireEvent.change(usernameInput, { target: { value: 'ab' } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/username must be at least 3 characters/i)).toBeInTheDocument();
      });
    });

    it('should show error when password is empty', async () => {
      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    it('should show error when password is too short', async () => {
      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      fireEvent.change(passwordInput, { target: { value: '12345' } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
      });
    });

    it('should clear field error when user types in field', async () => {
      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Trigger validation error
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      });
      
      // Type in field
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      
      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Successful Login', () => {
    it('should store token and navigate to dashboard on successful login', async () => {
      const mockToken = 'test-jwt-token';
      const mockResponse = {
        data: {
          token: mockToken,
          user: {
            id: '1',
            username: 'testuser',
            email: 'test@example.com',
            role: 'user',
          },
        },
      };

      apiClient.post.mockResolvedValueOnce(mockResponse);

      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
          username: 'testuser',
          password: 'password123',
        });
      });
      
      // Token should be stored in localStorage
      expect(localStorage.getItem('authToken')).toBe(mockToken);
      
      // Should navigate to dashboard
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('should show loading state during login', async () => {
      apiClient.post.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);
      
      // Should show loading text
      await waitFor(() => {
        expect(screen.getByText(/signing in.../i)).toBeInTheDocument();
      });
      
      // Inputs should be disabled
      expect(usernameInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Failed Login', () => {
    it('should display error message on failed login', async () => {
      const errorMessage = 'Invalid username or password';
      apiClient.post.mockRejectedValueOnce({
        response: {
          data: {
            message: errorMessage,
          },
        },
      });

      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
      
      // Should not store token
      expect(localStorage.getItem('authToken')).toBeNull();
      
      // Should not navigate
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should display generic error message when response has no message', async () => {
      apiClient.post.mockRejectedValueOnce({
        response: {
          data: {},
        },
      });

      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/login failed\. please try again\./i)).toBeInTheDocument();
      });
    });

    it('should clear error when user types after failed login', async () => {
      apiClient.post.mockRejectedValueOnce({
        response: {
          data: {
            message: 'Invalid credentials',
          },
        },
      });

      renderLogin();
      
      const usernameInput = screen.getByLabelText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
      
      // Type in username field
      fireEvent.change(usernameInput, { target: { value: 'testuser2' } });
      
      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
      });
    });
  });
});
