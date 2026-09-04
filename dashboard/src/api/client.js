/**
 * API Client Configuration
 * 
 * Configures Axios client for communication with the SentryFL API Server
 */

import axios from 'axios';
import { isTokenExpired } from '../utils/tokenUtils';

// Store reference will be set by setStoreReference
let storeRef = null;

/**
 * Set the Redux store reference for dispatching actions
 * This must be called before using the API client
 */
export const setStoreReference = (store) => {
  storeRef = store;
};

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    
    // Check token expiration before making request
    if (token && isTokenExpired(token)) {
      // Token is expired, remove it and redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
      return Promise.reject(new Error('Token expired'));
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Log requests in development
    if (import.meta.env.VITE_DEBUG === 'true') {
      console.log('API Request:', config.method.toUpperCase(), config.url);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
apiClient.interceptors.response.use(
  (response) => {
    // Log responses in development
    if (import.meta.env.VITE_DEBUG === 'true') {
      console.log('API Response:', response.status, response.config.url);
    }
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;

      if (status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
      
      // Dispatch notification if store is available
      if (storeRef) {
        const { addApiError } = require('../store/slices/notificationsSlice');
        
        let message = data.message || error.message;
        let details = '';
        
        switch (status) {
          case 401:
            message = 'Session expired. Please log in again.';
            break;
          case 403:
            message = data.message || 'Access forbidden';
            details = 'You do not have permission to access this resource';
            break;
          case 404:
            message = data.message || 'Resource not found';
            details = `The requested resource at ${error.config.url} was not found`;
            break;
          case 500:
            message = data.message || 'Internal server error';
            details = data.details || 'An unexpected error occurred on the server';
            break;
          case 400:
            message = data.message || 'Bad request';
            details = data.details || 'The request was invalid';
            break;
          default:
            message = data.message || 'An error occurred';
            details = data.details || `Status: ${status}`;
        }
        
        storeRef.dispatch(addApiError({ message, details, status }));
      }
      
      // Console logging for debugging
      const logMessage = {
        403: 'Access forbidden:',
        404: 'Resource not found:',
        500: 'Server error:',
      }[status];
      if (logMessage) {
        console.error(logMessage, data.message || error.message);
      } else {
        console.error('API Error:', status, data.message || error.message);
      }
    } else if (error.request) {
      // Request made but no response
      if (storeRef) {
        const { addApiError } = require('../store/slices/notificationsSlice');
        storeRef.dispatch(addApiError({
          message: 'Network error: No response from server',
          details: 'Please check your internet connection and try again',
          status: 0,
        }));
      }
      console.error('Network error: No response from server');
    } else {
      // Something else happened
      if (storeRef && error.message !== 'Token expired') {
        const { addApiError } = require('../store/slices/notificationsSlice');
        storeRef.dispatch(addApiError({
          message: 'Request error',
          details: error.message,
          status: 0,
        }));
      }
      console.error('Request error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
