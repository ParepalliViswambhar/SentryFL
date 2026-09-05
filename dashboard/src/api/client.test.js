/**
 * API Client Tests
 * 
 * Tests for Axios interceptors and authentication token handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as tokenUtils from '../utils/tokenUtils';

// Mock tokenUtils
vi.mock('../utils/tokenUtils');

describe('API Client', () => {
  let mockLocalStorage;
  let mockWindowLocation;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal('localStorage', mockLocalStorage);

    // Mock window.location
    mockWindowLocation = {
      href: '',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: mockWindowLocation,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Interceptor', () => {
    it('should add Authorization header when valid token exists', async () => {
      const mockToken = 'valid-jwt-token';
      mockLocalStorage.getItem.mockReturnValue(mockToken);
      tokenUtils.isTokenExpired.mockReturnValue(false);

      // Import after mocks are set up
      const apiClient = (await import('./client')).default;

      // Create a mock adapter to capture the request config
      const mockAdapter = vi.fn((config) => 
        Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
      );
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/test');

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('authToken');
      expect(tokenUtils.isTokenExpired).toHaveBeenCalledWith(mockToken);
      
      // Check that Authorization header was added
      const requestConfig = mockAdapter.mock.calls[0][0];
      expect(requestConfig.headers.Authorization).toBe(`Bearer ${mockToken}`);
    });

    it('should not add Authorization header when no token exists', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const apiClient = (await import('./client')).default;

      const mockAdapter = vi.fn((config) => 
        Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
      );
      apiClient.defaults.adapter = mockAdapter;

      await apiClient.get('/test');

      const requestConfig = mockAdapter.mock.calls[0][0];
      expect(requestConfig.headers.Authorization).toBeUndefined();
    });

    it('should redirect to login and remove token when token is expired', async () => {
      const mockToken = 'expired-jwt-token';
      mockLocalStorage.getItem.mockReturnValue(mockToken);
      tokenUtils.isTokenExpired.mockReturnValue(true);

      const apiClient = (await import('./client')).default;

      try {
        await apiClient.get('/test');
      } catch (error) {
        expect(error.message).toBe('Token expired');
      }

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken');
      expect(window.location.href).toBe('/login');
    });
  });

  describe('Response Interceptor', () => {
    it('should handle 401 Unauthorized by clearing token and redirecting', async () => {
      mockLocalStorage.getItem.mockReturnValue('valid-token');
      tokenUtils.isTokenExpired.mockReturnValue(false);

      const apiClient = (await import('./client')).default;

      // Mock a 401 response
      const mockAdapter = vi.fn(() => 
        Promise.reject({
          response: {
            status: 401,
            data: { message: 'Unauthorized' },
          },
        })
      );
      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/test');
      } catch (error) {
        // Expected to throw
      }

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('authToken');
      expect(window.location.href).toBe('/login');
    });

    it('should handle network errors without response', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockLocalStorage.getItem.mockReturnValue(null);

      const apiClient = (await import('./client')).default;

      // Mock a network error (no response)
      const mockAdapter = vi.fn(() => 
        Promise.reject({
          request: {},
          message: 'Network Error',
        })
      );
      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/test');
      } catch (error) {
        expect(error.request).toBeDefined();
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Network error: No response from server');
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle 403 Forbidden errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockLocalStorage.getItem.mockReturnValue('valid-token');
      tokenUtils.isTokenExpired.mockReturnValue(false);

      const apiClient = (await import('./client')).default;

      const mockAdapter = vi.fn(() => 
        Promise.reject({
          response: {
            status: 403,
            data: { message: 'Access forbidden' },
          },
        })
      );
      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/test');
      } catch (error) {
        // Expected to throw
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Access forbidden:', 'Access forbidden');
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle 404 Not Found errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockLocalStorage.getItem.mockReturnValue('valid-token');
      tokenUtils.isTokenExpired.mockReturnValue(false);

      const apiClient = (await import('./client')).default;

      const mockAdapter = vi.fn(() => 
        Promise.reject({
          response: {
            status: 404,
            data: { message: 'Resource not found' },
          },
        })
      );
      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/test');
      } catch (error) {
        // Expected to throw
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Resource not found:', 'Resource not found');
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle 500 Server errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockLocalStorage.getItem.mockReturnValue('valid-token');
      tokenUtils.isTokenExpired.mockReturnValue(false);

      const apiClient = (await import('./client')).default;

      const mockAdapter = vi.fn(() => 
        Promise.reject({
          response: {
            status: 500,
            data: { message: 'Internal server error' },
          },
        })
      );
      apiClient.defaults.adapter = mockAdapter;

      try {
        await apiClient.get('/test');
      } catch (error) {
        // Expected to throw
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Server error:', 'Internal server error');
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Token Storage Integration', () => {
    it('should successfully make authenticated request with stored token', async () => {
      const mockToken = 'test-auth-token';
      const mockResponseData = { data: 'success' };
      
      mockLocalStorage.getItem.mockReturnValue(mockToken);
      tokenUtils.isTokenExpired.mockReturnValue(false);

      const apiClient = (await import('./client')).default;

      const mockAdapter = vi.fn((config) => 
        Promise.resolve({ 
          data: mockResponseData, 
          status: 200, 
          statusText: 'OK', 
          headers: {}, 
          config 
        })
      );
      apiClient.defaults.adapter = mockAdapter;

      const response = await apiClient.get('/protected-resource');

      expect(response.data).toEqual(mockResponseData);
      
      const requestConfig = mockAdapter.mock.calls[0][0];
      expect(requestConfig.headers.Authorization).toBe(`Bearer ${mockToken}`);
    });
  });
});
