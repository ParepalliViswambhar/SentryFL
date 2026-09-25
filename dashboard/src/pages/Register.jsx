/**
 * Register Page Component
 *
 * Account creation page for new users. Mirrors the Login page and posts to the
 * API server's POST /api/auth/register endpoint via the `register` thunk, which
 * stores the returned JWT and authenticates the session on success.
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
  Container,
  Alert,
  Link,
  IconButton,
  InputAdornment,
  LinearProgress,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAddOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { register } from '../store/slices/authSlice';

/**
 * Rudimentary client-side password strength score (0-4), for user feedback
 * only. The backend enforces the real rule (>= 6 characters); this just nudges
 * users toward stronger passwords.
 */
const passwordStrength = (pw) => {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
};

const STRENGTH_LEVELS = [
  { label: 'Too short', color: 'error' },
  { label: 'Weak', color: 'error' },
  { label: 'Fair', color: 'warning' },
  { label: 'Good', color: 'info' },
  { label: 'Strong', color: 'success' },
];

const Register = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Shared show/hide adornment reused by both password fields.
  const passwordInputSlot = {
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
  };

  const strength = passwordStrength(form.password);
  const strengthLevel = STRENGTH_LEVELS[strength];

  const validateForm = () => {
    const errors = {};

    // Username: alphanumeric, 3-30 chars (matches backend registerSchema)
    if (!form.username.trim()) {
      errors.username = 'Username is required';
    } else if (form.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (form.username.length > 30) {
      errors.username = 'Username must not exceed 30 characters';
    } else if (!/^[a-zA-Z0-9]+$/.test(form.username)) {
      errors.username = 'Username must contain only letters and numbers';
    }

    // Password: min 6 chars (matches backend registerSchema)
    if (!form.password) {
      errors.password = 'Password is required';
    } else if (form.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    // Confirm password must match
    if (!form.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (form.confirmPassword !== form.password) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (fieldErrors[e.target.name]) {
      setFieldErrors({ ...fieldErrors, [e.target.name]: '' });
    }
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Send only the fields the backend expects (username, password).
      await dispatch(
        register({ username: form.username, password: form.password })
      ).unwrap();
      navigate('/', { replace: true });
    } catch (err) {
      setError(typeof err === 'string' ? err : err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Paper sx={{ p: 4, width: '100%' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <PersonAddIcon sx={{ color: 'white' }} />
            </Box>
            <Typography variant="h4" gutterBottom>
              Create account
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Join the SentryFL dashboard
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              name="username"
              value={form.username}
              onChange={handleChange}
              margin="normal"
              required
              autoFocus
              disabled={loading}
              error={Boolean(fieldErrors.username)}
              helperText={fieldErrors.username || 'Letters and numbers only, 3-30 characters'}
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange}
              margin="normal"
              required
              disabled={loading}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password || 'At least 6 characters'}
              slotProps={{ input: passwordInputSlot }}
            />

            {form.password && (
              <Box sx={{ mt: 0.5, mb: 0.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={(strength / 4) * 100}
                  color={strengthLevel.color}
                  sx={{ height: 6, borderRadius: 3 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Password strength: {strengthLevel.label}
                </Typography>
              </Box>
            )}

            <TextField
              fullWidth
              label="Confirm password"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={handleChange}
              margin="normal"
              required
              disabled={loading}
              error={Boolean(fieldErrors.confirmPassword)}
              helperText={fieldErrors.confirmPassword}
              slotProps={{ input: passwordInputSlot }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3 }}
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <Typography variant="body2" align="center" sx={{ mt: 3 }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;
