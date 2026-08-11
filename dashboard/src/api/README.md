# API Directory

This directory contains API client configuration and service modules for the SentryFL Dashboard.

## Purpose

- Axios client configuration
- API endpoint definitions
- Request/response interceptors
- Service modules for different resources

## Structure

```
api/
  ├── client.js              # Axios client configuration
  ├── experimentsApi.js      # Experiment endpoints
  ├── configurationsApi.js   # Configuration endpoints
  ├── metricsApi.js          # Metrics endpoints
  ├── authApi.js             # Authentication endpoints
  └── websocket.js           # WebSocket client
```

## API Client Configuration

```javascript
// client.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for auth tokens
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

## Service Modules

Each service module exports functions for specific API endpoints:

```javascript
// experimentsApi.js
export const getExperiments = () => apiClient.get('/experiments');
export const createExperiment = (config) => apiClient.post('/experiments', config);
export const getExperiment = (id) => apiClient.get(`/experiments/${id}`);
```

## Environment Variables

Create `.env` file in dashboard root:
```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000
```
