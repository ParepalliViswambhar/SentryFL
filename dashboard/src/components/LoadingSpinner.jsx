/**
 * Loading Spinner Component
 * 
 * Reusable loading indicator using Material-UI CircularProgress
 */

import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * LoadingSpinner component
 * 
 * @param {Object} props - Component props
 * @param {string} props.message - Optional loading message to display
 * @param {string} props.size - Size of spinner ('small', 'medium', 'large')
 * @param {boolean} props.fullScreen - Whether to display as full-screen overlay
 * @param {string} props.color - Color of spinner ('primary', 'secondary', 'inherit')
 */
const LoadingSpinner = ({ 
  message = 'Loading...', 
  size = 'medium',
  fullScreen = false,
  color = 'primary'
}) => {
  const sizeMap = {
    small: 24,
    medium: 40,
    large: 60,
  };
  
  const spinnerSize = sizeMap[size] || sizeMap.medium;
  
  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <CircularProgress size={spinnerSize} color={color} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );
  
  if (fullScreen) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 9999,
        }}
      >
        {content}
      </Box>
    );
  }
  
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        p: 3,
      }}
    >
      {content}
    </Box>
  );
};

export default LoadingSpinner;
