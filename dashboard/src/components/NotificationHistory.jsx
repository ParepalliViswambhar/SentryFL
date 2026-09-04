/**
 * NotificationHistory Component
 * 
 * Displays notification history in a sidebar panel
 * Allows dismissing individual notifications
 */

import { useSelector, useDispatch } from 'react-redux';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Chip,
  Button,
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { clearHistory } from '../store/slices/notificationsSlice';

const typeIcons = {
  success: <SuccessIcon color="success" />,
  error: <ErrorIcon color="error" />,
  warning: <WarningIcon color="warning" />,
  info: <InfoIcon color="info" />,
};

const typeLabels = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/**
 * NotificationHistory component displays notification history in a drawer
 * @param {Object} props
 * @param {boolean} props.open - Whether the drawer is open
 * @param {Function} props.onClose - Callback when drawer is closed
 */
export default function NotificationHistory({ open, onClose }) {
  const dispatch = useDispatch();
  const history = useSelector((state) => state.notifications.history);

  // Sort history by timestamp descending (most recent first)
  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  const handleClearHistory = () => {
    dispatch(clearHistory());
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
    >
      <Box sx={{ width: 400, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6">Notification History</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Clear All Button */}
        {history.length > 0 && (
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Button
              variant="outlined"
              startIcon={<DeleteIcon />}
              onClick={handleClearHistory}
              fullWidth
              size="small"
            >
              Clear History
            </Button>
          </Box>
        )}

        {/* Notification List */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {sortedHistory.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                p: 3,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No notifications yet
              </Typography>
            </Box>
          ) : (
            <List>
              {sortedHistory.map((notification, index) => (
                <Box key={notification.id}>
                  <ListItem
                    alignItems="flex-start"
                    sx={{
                      opacity: notification.dismissed ? 0.6 : 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, mt: 1 }}>
                      {typeIcons[notification.type]}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Chip
                            label={typeLabels[notification.type]}
                            size="small"
                            color={notification.type === 'error' ? 'error' : notification.type === 'warning' ? 'warning' : notification.type === 'success' ? 'success' : 'info'}
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {format(notification.timestamp, 'MMM dd, yyyy HH:mm:ss')}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            {notification.message}
                          </Typography>
                          {notification.details && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: 'block',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontFamily: 'monospace',
                                bgcolor: 'action.hover',
                                p: 1,
                                borderRadius: 1,
                                mt: 0.5,
                              }}
                            >
                              {notification.details}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < sortedHistory.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
