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

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Provider } from 'react-redux';
import store from './store';

// Layout components
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';

// Page components
import Dashboard from './pages/Dashboard';
import NewExperiment from './pages/NewExperiment';
import ExperimentList from './pages/ExperimentList';
import ExperimentDetail from './pages/ExperimentDetail';
import Comparison from './pages/Comparison';
import Settings from './pages/Settings';
import Login from './pages/Login';

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
      <ThemeProvider theme={theme}>
        <CssBaseline />
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
    </Provider>
  );
}

export default App;
