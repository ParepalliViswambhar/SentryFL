/**
 * OfflineIndicator
 *
 * A fixed banner pinned to the very top of the viewport (above the app bar)
 * that appears only when the browser reports it has lost network. Kept
 * deliberately minimal and non-blocking so cached data stays usable underneath.
 */

import { useEffect, useState } from 'react';
import { Alert, Box } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';

const OfflineIndicator = () => {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.snackbar + 1 }}>
      <Alert
        severity="warning"
        variant="filled"
        icon={<WifiOffIcon fontSize="inherit" />}
        sx={{ borderRadius: 0, justifyContent: 'center', '& .MuiAlert-message': { textAlign: 'center' } }}
      >
        You are offline. Cached data remains available; live updates are paused.
      </Alert>
    </Box>
  );
};

export default OfflineIndicator;
