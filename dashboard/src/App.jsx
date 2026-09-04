/**
 * App Component
 * 
 * Root application component with routing configuration
 * Routes:
 * - / : Dashboard (protected)
 * - /experiments/new : Create new experiment (protected)
 * - /experiments : List all experiments (protected)
 * - /experiments/:id : Experiment detail view (protected)
 * - /comparison : Compare experiments (protected)
 * - /settings : Application settings (protected)
 * - /login : Login page (public)
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Provider, useDispatch } from 'react-redux';
import store from './store';
import { verifyToken } from './store/slices/authSlice';
import { setStoreReference } from './api/client';

// Layout components
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationToast from './components/NotificationToast';
import OfflineIndicator from './components/OfflineIndicator';

// Page components
import Dashboard from './pages/Dashboard';
import NewExperiment from './pages/NewExperiment';
import ExperimentList from './pages/ExperimentList';
import ExperimentDetail from './pages/ExperimentDetail';
import Comparison from './pages/Comparison';
import Settings from './pages/Settings';
import Login from './pages/Login';

// Set store reference for API client
setStoreReference(store);

// Create Material-UI theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
});

function App() {
  return (
    <Provider store={store}>
      <AuthBootstrap>
        <ErrorBoundary>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <NotificationToast />
            <OfflineIndicator />
            <BrowserRouter>
            <Routes>
              {/* Public route - Login */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes - Main application */}
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Layout />
                  </PrivateRoute>
                }
              >
                {/* Dashboard - Root path */}
                <Route index element={<Dashboard />} />
                
                {/* Experiment routes */}
                <Route path="experiments">
                  <Route index element={<ExperimentList />} />
                  <Route path="new" element={<NewExperiment />} />
                  <Route path=":id" element={<ExperimentDetail />} />
                </Route>
                
                {/* Comparison page */}
                <Route path="comparison" element={<Comparison />} />
                
                {/* Settings page */}
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
            </BrowserRouter>
          </ThemeProvider>
        </ErrorBoundary>
      </AuthBootstrap>
    </Provider>
  );
}

function AuthBootstrap({ children }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token?.split('.').length === 3) {
      dispatch(verifyToken());
    }
  }, [dispatch]);

  return children;
}

export default App;
