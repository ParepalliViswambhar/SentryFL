/**
 * App Component
 *
 * Root application component: providers (Redux, colour-mode/theme) and routing.
 * Routes:
 * - / : Dashboard (protected)
 * - /experiments, /experiments/new, /experiments/:id (protected)
 * - /comparison, /settings (protected)
 * - /login, /register (public)
 */

import { useEffect } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import store from './store';
import { verifyToken } from './store/slices/authSlice';
import { setStoreReference } from './api/client';
import { ColorModeProvider } from './theme/ColorModeContext';

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
import Monitor from './pages/Monitor';
import PrivacyEvaluation from './pages/PrivacyEvaluation';
import AggregationVisualizer from './pages/AggregationVisualizer';
import Artifacts from './pages/Artifacts';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';
import ClientWorkspace from './pages/ClientWorkspace';
import { selectCurrentUser } from './store/slices/authSlice';

// Set store reference for API client
setStoreReference(store);

function App() {
  return (
    <Provider store={store}>
      <AuthBootstrap>
        <ColorModeProvider>
          <ErrorBoundary>
            <OfflineIndicator />
            <NotificationToast />
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected routes - Main application */}
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Layout />
                  </PrivateRoute>
                }
              >
                <Route index element={<RoleHome />} />
                <Route path="client" element={<ClientWorkspace />} />
                <Route path="experiments">
                  <Route index element={<ExperimentList />} />
                  <Route path="new" element={<AdminRoute><NewExperiment /></AdminRoute>} />
                  <Route path=":id" element={<ExperimentDetail />} />
                </Route>
                <Route path="comparison" element={<AdminRoute><Comparison /></AdminRoute>} />
                <Route path="monitor" element={<AdminRoute><Monitor /></AdminRoute>} />
                <Route path="privacy" element={<AdminRoute><PrivacyEvaluation /></AdminRoute>} />
                <Route path="aggregation" element={<AdminRoute><AggregationVisualizer /></AdminRoute>} />
                <Route path="artifacts" element={<Artifacts />} />
                <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
                {/* Authenticated catch-all: a themed 404 that keeps the app
                    shell. Unauthenticated unknown paths fall through to
                    PrivateRoute, which redirects them to /login. */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </ColorModeProvider>
      </AuthBootstrap>
    </Provider>
  );
}

function RoleHome() {
  const user = useSelector(selectCurrentUser);
  return user?.role === 'admin' || !user ? <Dashboard /> : <ClientWorkspace />;
}

function AdminRoute({ children }) {
  const user = useSelector(selectCurrentUser);
  return user?.role === 'admin' || !user ? children : <Navigate to="/client" replace />;
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
