import { useEffect, useState } from 'react';
import { Alert } from '@mui/material';

const OfflineIndicator = () => {
  const [online, setOnline] = useState(() => navigator.onLine);

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

  return online ? null : <Alert severity="warning">You are offline. Cached data remains available.</Alert>;
};

export default OfflineIndicator;
