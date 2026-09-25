/**
 * NotificationToast Component
 * 
 * Displays toast notifications using Material-UI Snackbar
 * Automatically dismisses success notifications after 5 seconds
 * Persists error notifications until manually dismissed
 */

import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Snackbar, Alert, AlertTitle } from '@mui/material';
import { dismissNotification } from '../store/slices/notificationsSlice';

const AUTO_DISMISS_DURATION = 5000; // 5 seconds for success notifications

/**
 * NotificationToast component displays active notifications as Material-UI Snackbar
 */
export default function NotificationToast() {
  const dispatch = useDispatch();
  const notifications = useSelector((state) => state.notifications.notifications);

  // Get the most recent notification
  const currentNotification = notifications.length > 0 ? notifications[notifications.length - 1] : null;

  useEffect(() => {
    if (!currentNotification || !currentNotification.autoDismiss) {
      return undefined;
    }

    // Auto-dismiss success notifications after 5 seconds
    const timer = setTimeout(() => {
      dispatch(dismissNotification(currentNotification.id));
    }, AUTO_DISMISS_DURATION);

    return () => clearTimeout(timer);
  }, [currentNotification, dispatch]);

  const handleClose = (event, reason) => {
    // Don't close on clickaway for error notifications
    if (reason === 'clickaway' && currentNotification?.type === 'error') {
      return;
    }
    
    if (currentNotification) {
      dispatch(dismissNotification(currentNotification.id));
    }
  };

  if (!currentNotification) {
    return null;
  }

  return (
    <Snackbar
      open
      autoHideDuration={currentNotification.autoDismiss ? AUTO_DISMISS_DURATION : null}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: 8 }} // clear the fixed app bar
    >
      <Alert
        onClose={handleClose}
        severity={currentNotification.type}
        variant="filled"
        sx={{ width: '100%', maxWidth: 460, boxShadow: 6 }}
      >
        {currentNotification.details ? (
          <>
            <AlertTitle sx={{ fontWeight: 700 }}>{currentNotification.message}</AlertTitle>
            {currentNotification.details}
          </>
        ) : (
          currentNotification.message
        )}
      </Alert>
    </Snackbar>
  );
}
