/**
 * Login Page Component
 * 
 * Authentication page for user login
 */

import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Link,
  IconButton,
  InputAdornment,
} from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AutoGraphRoundedIcon from '@mui/icons-material/AutoGraphRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import { login } from '../store/slices/authSlice';

const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const validateForm = () => {
    const errors = {};
    
    // Username validation
    if (!credentials.username.trim()) {
      errors.username = 'Username is required';
    } else if (credentials.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    
    // Password validation
    if (!credentials.password) {
      errors.password = 'Password is required';
    } else if (credentials.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value,
    });
    // Clear field-specific error when user types
    if (fieldErrors[e.target.name]) {
      setFieldErrors({
        ...fieldErrors,
        [e.target.name]: '',
      });
    }
    setError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate form before submission
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      await dispatch(login(credentials)).unwrap();
      navigate('/', { replace: true });
    } catch (err) {
      setError(typeof err === 'string' ? err : err?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Box className="login-page">
      <Box className="login-shell">
        <Box className="login-story">
          <Box className="login-brand">
            <Box className="login-brand-mark"><LockIcon /></Box>
            <Typography className="login-brand-name">SentryFL</Typography>
          </Box>

          <Box className="login-story-copy">
            <Typography className="login-eyebrow">
              <span className="login-eyebrow-dot" />
              Federated intelligence, secured
            </Typography>
            <Typography component="h1" className="login-story-title">
              See every signal.
              <br />
              <span>Secure every round.</span>
            </Typography>
            <Typography className="login-story-description">
              Orchestrate privacy-preserving learning across your network with
              one calm, intelligent command center.
            </Typography>
          </Box>

          <Box className="login-feature-list">
            <Box className="login-feature">
              <HubRoundedIcon />
              <Box>
                <Typography className="login-feature-title">Distributed by design</Typography>
                <Typography className="login-feature-copy">Coordinate clients without moving raw data.</Typography>
              </Box>
            </Box>
            <Box className="login-feature">
              <ShieldRoundedIcon />
              <Box>
                <Typography className="login-feature-title">Privacy you can measure</Typography>
                <Typography className="login-feature-copy">Track budgets, aggregation, and risk in real time.</Typography>
              </Box>
            </Box>
          </Box>

          <Box className="login-telemetry-card">
            <Box className="login-telemetry-topline">
              <Typography>NETWORK TELEMETRY</Typography>
              <span><i /> LIVE</span>
            </Box>
            <Box className="login-telemetry-graph">
              {[34, 52, 43, 68, 61, 83, 74, 91, 79, 96].map((height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
              ))}
            </Box>
            <Box className="login-telemetry-stats">
              <Box><strong>12</strong><small>active clients</small></Box>
              <Box><strong>98.4%</strong><small>model health</small></Box>
              <Box><strong>0.08</strong><small>privacy budget</small></Box>
            </Box>
          </Box>
        </Box>

        <Paper component="main" className="login-panel">
          <Box className="login-panel-header">
            <Box className="login-panel-icon"><AutoGraphRoundedIcon /></Box>
            <Typography className="login-product-label">Federated Learning Dashboard</Typography>
            <Typography component="h2">Welcome back</Typography>
            <Typography>Sign in to your federated learning workspace.</Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              name="username"
              value={credentials.username}
              onChange={handleChange}
              margin="normal"
              required
              autoFocus
              autoComplete="username"
              disabled={loading}
              error={Boolean(fieldErrors.username)}
              helperText={fieldErrors.username}
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={credentials.password}
              onChange={handleChange}
              margin="normal"
              required
              autoComplete="current-password"
              disabled={loading}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((show) => !show)}
                        edge="end"
                        disabled={loading}
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              className="login-submit"
              endIcon={!loading && <ArrowForwardRoundedIcon />}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <Box className="login-trust-row">
            <CheckCircleRoundedIcon />
            <Typography>Encrypted session · Workspace protected</Typography>
          </Box>

          <Typography className="login-register-prompt">
            Don&apos;t have an account?{' '}
            <Link component={RouterLink} to="/register">
              Create one
            </Link>
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default Login;
