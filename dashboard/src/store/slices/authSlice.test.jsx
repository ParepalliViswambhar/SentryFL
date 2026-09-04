/**
 * Auth Slice Tests
 * 
 * Tests for auth slice reducers and actions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import authReducer, {
  clearError,
  updateUser,
  login,
  logout,
  selectAuthToken,
  selectCurrentUser,
  selectIsAuthenticated,
  selectAuthStatus,
  selectAuthError,
  selectIsAdmin,
} from './authSlice';
import { configureStore } from '@reduxjs/toolkit';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('authSlice', () => {
  // Mock localStorage
  beforeEach(() => {
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    global.localStorage = localStorageMock;
    vi.clearAllMocks();
  });

  const initialState = {
    token: null,
    user: null,
    isAuthenticated: false,
    status: 'idle',
    error: null,
  };

  describe('reducers', () => {
    it('should return initial state', () => {
      expect(authReducer(undefined, { type: 'unknown' })).toMatchObject({
        user: null,
        isAuthenticated: false,
        status: 'idle',
        error: null,
      });
    });

    it('should handle clearError', () => {
      const stateWithError = {
        ...initialState,
        error: 'Invalid credentials',
      };

      const actual = authReducer(stateWithError, clearError());
      expect(actual.error).toBeNull();
    });

    it('should handle updateUser', () => {
      const stateWithUser = {
        ...initialState,
        user: {
          id: '1',
          email: 'user@example.com',
          username: 'testuser',
          role: 'user',
        },
      };

      const updates = {
        username: 'updateduser',
        email: 'updated@example.com',
      };

      const actual = authReducer(stateWithUser, updateUser(updates));
      
      expect(actual.user.username).toBe('updateduser');
      expect(actual.user.email).toBe('updated@example.com');
      expect(actual.user.id).toBe('1'); // Should preserve other fields
      expect(actual.user.role).toBe('user');
    });

    it('should not update user if user is null', () => {
      const actual = authReducer(initialState, updateUser({ username: 'test' }));
      expect(actual.user).toBeNull();
    });
  });

  describe('async thunks', () => {
    it('should handle login.pending', () => {
      const action = { type: 'auth/login/pending' };
      const state = authReducer(initialState, action);
      
      expect(state.status).toBe('loading');
      expect(state.error).toBeNull();
    });

    it('should handle login.fulfilled', () => {
      const payload = {
        token: 'test-token',
        user: {
          id: '1',
          email: 'user@example.com',
          username: 'testuser',
          role: 'user',
        },
      };

      const action = { type: 'auth/login/fulfilled', payload };
      const state = authReducer(initialState, action);
      
      expect(state.status).toBe('succeeded');
      expect(state.token).toBe('test-token');
      expect(state.user).toEqual(payload.user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should handle login.rejected', () => {
      const payload = 'Invalid credentials';
      const action = { type: 'auth/login/rejected', payload };
      const state = authReducer(initialState, action);
      
      expect(state.status).toBe('failed');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });

    it('should handle register.fulfilled', () => {
      const payload = {
        token: 'test-token',
        user: {
          id: '1',
          email: 'newuser@example.com',
          username: 'newuser',
          role: 'user',
        },
      };

      const action = { type: 'auth/register/fulfilled', payload };
      const state = authReducer(initialState, action);
      
      expect(state.status).toBe('succeeded');
      expect(state.token).toBe('test-token');
      expect(state.user).toEqual(payload.user);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle verifyToken.fulfilled', () => {
      const payload = {
        token: 'existing-token',
        user: {
          id: '1',
          email: 'user@example.com',
          username: 'testuser',
          role: 'user',
        },
      };

      const action = { type: 'auth/verifyToken/fulfilled', payload };
      const state = authReducer(initialState, action);
      
      expect(state.status).toBe('succeeded');
      expect(state.token).toBe('existing-token');
      expect(state.user).toEqual(payload.user);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle verifyToken.rejected', () => {
      const stateWithToken = {
        ...initialState,
        token: 'invalid-token',
        user: { id: '1', email: 'user@example.com' },
        isAuthenticated: true,
      };

      const action = { type: 'auth/verifyToken/rejected', payload: 'Token expired' };
      const state = authReducer(stateWithToken, action);
      
      expect(state.status).toBe('failed');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should handle logout.fulfilled', () => {
      const stateWithAuth = {
        token: 'test-token',
        user: { id: '1', email: 'user@example.com' },
        isAuthenticated: true,
        status: 'succeeded',
        error: null,
      };

      const action = { type: 'auth/logout/fulfilled' };
      const state = authReducer(stateWithAuth, action);
      
      expect(state.status).toBe('idle');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should clear state even when logout.rejected', () => {
      const stateWithAuth = {
        token: 'test-token',
        user: { id: '1', email: 'user@example.com' },
        isAuthenticated: true,
        status: 'succeeded',
        error: null,
      };

      const action = { type: 'auth/logout/rejected' };
      const state = authReducer(stateWithAuth, action);
      
      // Should still clear auth state even if API call failed
      expect(state.status).toBe('idle');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('selectors', () => {
    const mockState = {
      auth: {
        token: 'test-token',
        user: {
          id: '1',
          email: 'user@example.com',
          username: 'testuser',
          role: 'admin',
        },
        isAuthenticated: true,
        status: 'succeeded',
        error: null,
      },
    };

    it('should select auth token', () => {
      expect(selectAuthToken(mockState)).toBe('test-token');
    });

    it('should select current user', () => {
      expect(selectCurrentUser(mockState)).toEqual(mockState.auth.user);
    });

    it('should select isAuthenticated', () => {
      expect(selectIsAuthenticated(mockState)).toBe(true);
    });

    it('should select auth status', () => {
      expect(selectAuthStatus(mockState)).toBe('succeeded');
    });

    it('should select auth error', () => {
      expect(selectAuthError(mockState)).toBeNull();
    });

    it('should select isAdmin', () => {
      expect(selectIsAdmin(mockState)).toBe(true);
    });

    it('should return false for isAdmin when user is not admin', () => {
      const userState = {
        auth: {
          ...mockState.auth,
          user: { ...mockState.auth.user, role: 'user' },
        },
      };
      expect(selectIsAdmin(userState)).toBe(false);
    });

    it('should return undefined for isAdmin when no user', () => {
      const noUserState = {
        auth: {
          ...mockState.auth,
          user: null,
        },
      };
      expect(selectIsAdmin(noUserState)).toBeUndefined();
    });
  });

  describe('Async Thunks Integration', () => {
    let store;

    beforeEach(() => {
      store = configureStore({
        reducer: {
          auth: authReducer,
        },
      });
      
      // Reset axios mocks
      axios.post = vi.fn();
      axios.get = vi.fn();
      axios.defaults = { headers: { common: {} } };
    });

    it('should handle successful login flow', async () => {
      const mockCredentials = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const mockResponse = {
        data: {
          token: 'test-token',
          user: {
            id: '1',
            email: 'test@example.com',
            username: 'testuser',
            role: 'user',
          },
        },
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      await store.dispatch(login(mockCredentials));

      const state = store.getState().auth;
      
      expect(state.status).toBe('succeeded');
      expect(state.token).toBe('test-token');
      expect(state.user).toEqual(mockResponse.data.user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.error).toBeNull();
      
      // Check localStorage was called
      expect(localStorage.setItem).toHaveBeenCalledWith('authToken', 'test-token');
    });

    it('should handle login failure', async () => {
      const mockCredentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const errorMessage = 'Invalid credentials';
      axios.post.mockRejectedValueOnce({
        response: {
          data: errorMessage,
        },
      });

      await store.dispatch(login(mockCredentials));

      const state = store.getState().auth;
      
      expect(state.status).toBe('failed');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe(errorMessage);
    });

    it('should handle logout and clear state', async () => {
      // First login
      const mockResponse = {
        data: {
          token: 'test-token',
          user: { id: '1', email: 'test@example.com' },
        },
      };
      axios.post.mockResolvedValueOnce(mockResponse);
      await store.dispatch(login({ email: 'test@example.com', password: 'pass' }));

      // Then logout
      await store.dispatch(logout());

      const state = store.getState().auth;
      
      expect(state.status).toBe('idle');
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      
      // Check localStorage was cleared
      expect(localStorage.removeItem).toHaveBeenCalledWith('authToken');
    });
  });
});
