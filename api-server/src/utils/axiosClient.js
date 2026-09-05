/**
 * Axios client for Python backend communication
 * Configured with error transformation and timeouts
 */

const axios = require('axios');

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:5000';
const TIMEOUT = parseInt(process.env.BACKEND_TIMEOUT_MS) || 30000; // 30 seconds default

/**
 * Axios instance configured for Python backend communication
 */
const axiosClient = axios.create({
  baseURL: PYTHON_BACKEND_URL,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add authentication or logging
 */
axiosClient.interceptors.request.use(
  (config) => {
    // Add timestamp to request for debugging
    config.metadata = { startTime: new Date() };

    // Log request in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Axios Request] ${config.method.toUpperCase()} ${config.url}`, {
        data: config.data,
        params: config.params,
      });
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor to log responses and handle errors
 */
axiosClient.interceptors.response.use(
  (response) => {
    // Calculate request duration
    const duration = new Date() - response.config.metadata.startTime;

    // Log response in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Axios Response] ${response.config.method.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        duration: `${duration}ms`,
      });
    }

    return response;
  },
  (error) => {
    // Mark as Axios error for error handler
    error.isAxiosError = true;

    // Calculate request duration if available
    if (error.config?.metadata?.startTime) {
      const duration = new Date() - error.config.metadata.startTime;
      error.duration = duration;
    }

    // Log error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[Axios Error]', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        message: error.message,
        duration: error.duration ? `${error.duration}ms` : 'N/A',
      });
    }

    return Promise.reject(error);
  }
);

module.exports = axiosClient;
