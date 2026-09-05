# SentryFL Web Dashboard

Modern React-based web dashboard for the SentryFL federated learning framework. Provides interactive visualizations, experiment control, and real-time training progress monitoring.

## Overview

The SentryFL Dashboard is a single-page application that connects to the Node.js API Server to:
- Create and manage federated learning experiments
- Monitor real-time training metrics via WebSocket
- Visualize privacy budget consumption
- Analyze anomaly detection results
- Compare experiment performance
- Control experiment execution (start, stop, pause, resume)

## Technology Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Redux Toolkit** - State management
- **Material-UI** - Component library
- **Chart.js + react-chartjs-2** - Data visualization
- **Socket.io-client** - Real-time WebSocket communication
- **Axios** - HTTP client
- **date-fns** - Date formatting

## Project Structure

```
dashboard/
├── src/
│   ├── api/              # API client and service modules
│   ├── components/       # Reusable React components
│   ├── pages/            # Page-level components
│   ├── store/            # Redux store and slices
│   ├── hooks/            # Custom React hooks
│   ├── utils/            # Utility functions
│   ├── App.jsx           # Root application component
│   └── main.jsx          # Application entry point
├── public/               # Static assets
├── .eslintrc.cjs         # ESLint configuration
├── vite.config.js        # Vite configuration
└── package.json          # Dependencies and scripts
```

## Prerequisites

- Node.js 18+ and npm
- Running SentryFL API Server (default: http://localhost:3000)

## Installation

```bash
# Install dependencies
npm install
```

## Development

```bash
# Start development server (http://localhost:5173)
npm run dev

# Run ESLint
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Configuration

Create a `.env` file in the dashboard root:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000
```

## Key Features

### 1. Experiment Management
- Create new experiments with custom configurations
- View experiment list and details
- Control experiment execution (start/stop/pause/resume)
- Monitor experiment status in real-time

### 2. Real-Time Visualization
- Training loss curves per client
- Global model convergence
- Privacy budget consumption (ε, δ tracking)
- Communication cost metrics
- Live metric updates via WebSocket

### 3. Results Analysis
- Anomaly detection performance (F1, AUC-ROC, AUC-PR)
- ROC and Precision-Recall curves
- Confusion matrices
- Time-series with predicted anomaly labels

### 4. Privacy Metrics
- MIA attack success rates
- Privacy leakage comparison (DP vs non-DP)
- Privacy budget exhaustion warnings

### 5. Communication Scaling
- Bytes transferred vs client count
- Convergence rounds vs client count
- Parameter efficiency analysis

### 6. Ablation Studies
- Component contribution analysis
- Baseline model comparisons
- Statistical significance testing

## Integration with API Server

The dashboard communicates with the Node.js API Server through:

**REST API Endpoints:**
- `GET /api/experiments` - List experiments
- `POST /api/experiments` - Create experiment
- `GET /api/experiments/:id` - Get experiment details
- `DELETE /api/experiments/:id` - Stop experiment
- `POST /api/experiments/:id/pause` - Pause experiment
- `POST /api/experiments/:id/resume` - Resume experiment
- `GET /api/configs` - List configurations
- `POST /api/configs` - Save configuration

**WebSocket Events:**
- `training:update` - Real-time training metrics
- `experiment:status` - Experiment status changes
- `privacy:budget` - Privacy budget updates
- `training:complete` - Training completion notification

## Development Guidelines

### Component Creation
```javascript
// src/components/MetricCard/MetricCard.jsx
import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

export const MetricCard = ({ title, value, unit }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="h4">{value} {unit}</Typography>
      </CardContent>
    </Card>
  );
};
```

### API Service
```javascript
// src/api/experimentsApi.js
import apiClient from './client';

export const getExperiments = () => apiClient.get('/experiments');
export const createExperiment = (config) => apiClient.post('/experiments', config);
```

### Redux Slice
```javascript
// src/store/experimentSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getExperiments } from '../api/experimentsApi';

export const fetchExperiments = createAsyncThunk(
  'experiments/fetch',
  async () => {
    const response = await getExperiments();
    return response.data;
  }
);

const experimentSlice = createSlice({
  name: 'experiments',
  initialState: { list: [], loading: false, error: null },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExperiments.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchExperiments.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchExperiments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  }
});

export default experimentSlice.reducer;
```

### Custom Hook
```javascript
// src/hooks/useWebSocket.js
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export const useWebSocket = (url) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = io(url);
    
    ws.on('connect', () => setConnected(true));
    ws.on('disconnect', () => setConnected(false));
    
    setSocket(ws);
    
    return () => ws.close();
  }, [url]);

  return { socket, connected };
};
```

## Troubleshooting

### Port Already in Use
```bash
# Change Vite port in vite.config.js
export default defineConfig({
  server: { port: 5174 }
});
```

### API Connection Issues
- Verify API Server is running on http://localhost:3000
- Check CORS configuration in API Server
- Verify `.env` file has correct API URL

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## References

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Redux Toolkit](https://redux-toolkit.js.org/)
- [Material-UI](https://mui.com/)
- [Chart.js](https://www.chartjs.org/)
- [Socket.io Client](https://socket.io/docs/v4/client-api/)
