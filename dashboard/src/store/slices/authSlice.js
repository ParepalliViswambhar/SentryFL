/**
 * Auth Slice
 * 
 * Manages authentication state including:
 * - Authentication token
 * - User information
 * - Login/logout actions
 * - Token persistence
 * 
 * @module slices/authSlice
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * @typedef {Object} User
 * @property {string} id - User ID
 * @property {string} email - User email
 * @property {string} username - Username
 * @property {string} role - User role (user, admin)
 */

/**
 * Load token from localStorage
 * 
 * @returns {string|null} Token if exists, null otherwise
 */
const loadTokenFromStorage = () => {
  try {
    return localStorage.getItem('authToken');
  } catch (error) {
    console.error('Error loading token from storage:', error);
    return null;
  }
};

/**
 * Save token to localStorage
 * 
 * @param {string} token - JWT token
 */
const saveTokenToStorage = (token) => {
  try {
    localStorage.setItem('authToken', token);
  } catch (error) {
    console.error('Error saving token to storage:', error);
  }
};

/**
 * Remove token from localStorage
 */
const removeTokenFromStorage = () => {
  try {
    localStorage.removeItem('authToken');
  } catch (error) {
    console.error('Error removing token from storage:', error);
  }
};

/**
 * Async thunk to login user
 * 
 * @async
 * @function login
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.email - User email
 * @param {string} credentials.password - User password
 * @returns {Promise<Object>} Object with token and user
 * @throws {Error} If login fails
 */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials);
      const { token, user } = response.data;
      
      // Save token to localStorage
      saveTokenToStorage(token);
      
      // Set default Authorization header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      return { token, user };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to register new user
 * 
 * @async
 * @function register
 * @param {Object} userData - Registration data
 * @param {string} userData.email - User email
 * @param {string} userData.username - Username
 * @param {string} userData.password - User password
 * @returns {Promise<Object>} Object with token and user
 * @throws {Error} If registration fails
 */
export const register = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/register`, userData);
      const { token, user } = response.data;
      
      // Save token to localStorage
      saveTokenToStorage(token);
      
      // Set default Authorization header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      return { token, user };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to verify token and get current user
 * 
 * @async
 * @function verifyToken
 * @returns {Promise<User>} Current user data
 * @throws {Error} If token is invalid
 */
export const verifyToken = createAsyncThunk(
  'auth/verifyToken',
  async (_, { rejectWithValue }) => {
    try {
      const token = loadTokenFromStorage();
      
      if (!token) {
        return rejectWithValue('No token found');
      }
      
      // Set Authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Verify token with backend
      const response = await axios.get(`${API_BASE_URL}/api/auth/me`);
      
      return { token, user: response.data };
    } catch (error) {
      // Remove invalid token
      removeTokenFromStorage();
      delete axios.defaults.headers.common['Authorization'];
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Async thunk to logout user
 * 
 * @async
 * @function logout
 * @returns {Promise<void>}
 */
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      // Optional: Call logout endpoint if backend tracks sessions
      // await axios.post(`${API_BASE_URL}/api/auth/logout`);
      
      // Remove token from storage
      removeTokenFromStorage();
      
      // Remove Authorization header
      delete axios.defaults.headers.common['Authorization'];
      
      return;
    } catch (error) {
      // Still logout locally even if API call fails
      removeTokenFromStorage();
      delete axios.defaults.headers.common['Authorization'];
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

/**
 * Initial state for auth slice
 * 
 * @typedef {Object} AuthState
 * @property {string|null} token - JWT authentication token
 * @property {User|null} user - Current user data
 * @property {boolean} isAuthenticated - Whether user is authenticated
 * @property {string} status - Loading status (idle, loading, succeeded, failed)
 * @property {string|null} error - Error message if operation failed
 */
const initialState = {
  token: loadTokenFromStorage(),
  user: null,
  isAuthenticated: false,
  status: 'idle',
  error: null,
};

/**
 * Auth slice with reducers for login/logout and async actions
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Clear any errors
     * 
     * @param {AuthState} state - Current state
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Update user information
     * 
     * @param {AuthState} state - Current state
     * @param {Object} action - Action with updated user data
     */
    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload;
      })

      // Register
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'failed';
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload;
      })

      // Verify token
      .addCase(verifyToken.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(verifyToken.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(verifyToken.rejected, (state, action) => {
        state.status = 'failed';
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload;
      })

      // Logout
      .addCase(logout.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = 'idle';
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      .addCase(logout.rejected, (state) => {
        // Still clear state even if logout API call failed
        state.status = 'idle';
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      });
  },
});

export const { clearError, updateUser } = authSlice.actions;

// Selectors
export const selectAuthToken = (state) => state.auth.token;
export const selectCurrentUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectAuthStatus = (state) => state.auth.status;
export const selectAuthError = (state) => state.auth.error;
export const selectIsAdmin = (state) => state.auth.user?.role === 'admin';

export default authSlice.reducer;
