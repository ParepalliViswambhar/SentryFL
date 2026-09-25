/**
 * Layout
 *
 * The app shell: a branded sidebar, a translucent top bar, and the routed
 * content area. Crucially, this is where the single app-wide live subscription
 * is mounted (via {@link useLiveExperiments}) so realtime updates flow no matter
 * which page the user is on — and where the always-visible "Active Runs" rail
 * and connection pill live, so the user can always see that something is
 * actually running.
 */

import { useMemo, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentUser, logout } from '../store/slices/authSlice';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  useMediaQuery,
  useTheme,
  Badge,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AddIcon from '@mui/icons-material/Add';
import ExperimentIcon from '@mui/icons-material/Science';
import CompareIcon from '@mui/icons-material/CompareArrows';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountIcon from '@mui/icons-material/AccountCircle';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationHistory from './NotificationHistory';
import { ColorModeToggle } from '../theme/ColorModeContext';
import { ConnectionPill, LiveDot } from './ui';
import { selectActiveExperiments } from '../store/slices/experimentsSlice';
import { progressOf, roundsOf, statusMeta } from '../utils/status';
import useLiveExperiments from '../hooks/useLiveExperiments';

const drawerWidth = 264;

const NAV_ITEMS = [
  { text: 'Overview', icon: <DashboardIcon />, path: '/' },
  { text: 'New Experiment', icon: <AddIcon />, path: '/experiments/new' },
  { text: 'Experiments', icon: <ExperimentIcon />, path: '/experiments' },
  { text: 'Comparison', icon: <CompareIcon />, path: '/comparison' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

// Ordered longest/most-specific first so /experiments/new wins over :id.
const PAGE_TITLES = [
  [/^\/$/, 'Overview'],
  [/^\/experiments\/new$/, 'New Experiment'],
  [/^\/experiments\/[^/]+$/, 'Experiment Detail'],
  [/^\/experiments\/?$/, 'Experiments'],
  [/^\/comparison/, 'Comparison'],
  [/^\/settings/, 'Settings'],
];
const titleFor = (pathname) => (PAGE_TITLES.find(([re]) => re.test(pathname)) || [null, 'SentryFL'])[1];

const Layout = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const currentUser = useSelector(selectCurrentUser);
  const notificationCount = useSelector((state) => state.notifications.notifications.length);
  const activeExperiments = useSelector(selectActiveExperiments);

  // The experiment being viewed on a detail route (never the "new" form), so
  // the global socket also subscribes to a run the user is inspecting even if
  // it has already finished and left the active set.
  const detailMatch = location.pathname.match(/^\/experiments\/([^/]+)$/);
  const focusedId = detailMatch && detailMatch[1] !== 'new' ? detailMatch[1] : null;

  // The one and only realtime subscription for the whole app.
  const { status: liveStatus } = useLiveExperiments(focusedId);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [notificationHistoryOpen, setNotificationHistoryOpen] = useState(false);

  const handleUserMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleUserMenuClose = () => setAnchorEl(null);
  const handleDrawerToggle = () => setMobileOpen((prev) => !prev);
  const handleLogout = async () => {
    await dispatch(logout());
    handleUserMenuClose();
    navigate('/login');
  };

  const isSelected = (path) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/experiments') {
      return location.pathname.startsWith('/experiments') && location.pathname !== '/experiments/new';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const pageTitle = useMemo(() => titleFor(location.pathname), [location.pathname]);
  const runningCount = activeExperiments.filter((exp) => exp.status === 'running').length;

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand */}
      <Toolbar sx={{ px: 2.5, gap: 1.25 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            backgroundImage: (t) => t.sentry?.gradientSoft,
            bgcolor: (t) =>
              t.sentry?.gradientSoft ? undefined : alpha(t.palette.primary.main, t.sentry?.isDark ? 0.16 : 0.12),
            border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.4)}`,
            boxShadow: (t) => (t.sentry?.isDark ? `0 0 18px -6px ${alpha(t.palette.primary.main, 0.9)}` : 'none'),
          }}
        >
          <LiveDot color="primary" size={10} pulse={liveStatus === 'connected'} />
        </Box>
        <Box sx={{ lineHeight: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
            SentryFL
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Federated Learning
          </Typography>
        </Box>
      </Toolbar>
      <Divider />

      {/* Primary navigation */}
      <List sx={{ px: 1, py: 1.5 }}>
        {NAV_ITEMS.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.25 }}>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={isSelected(item.path)}
              onClick={isMobile ? handleDrawerToggle : undefined}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 600 }} />
              {item.path === '/experiments' && activeExperiments.length > 0 && (
                <Badge
                  color="primary"
                  badgeContent={activeExperiments.length}
                  sx={{ mr: 1.5, '& .MuiBadge-badge': { position: 'static', transform: 'none' } }}
                />
              )}
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* Always-visible active-runs rail — the persistent "something is running" signal */}
      <Box sx={{ px: 2.5, pb: 1, mt: 'auto' }}>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Active Runs {activeExperiments.length > 0 && `· ${activeExperiments.length}`}
        </Typography>
      </Box>
      <Box sx={{ px: 1.5, pb: 2, overflowY: 'auto', maxHeight: { md: '38vh' } }}>
        {activeExperiments.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ px: 1 }}>
            No experiments running.
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {activeExperiments.map((exp) => {
              const meta = statusMeta(exp.status);
              const { current, total } = roundsOf(exp);
              const dotColor = meta.color === 'default' ? 'primary' : meta.color;
              return (
                <ListItemButton
                  key={exp.id}
                  onClick={() => {
                    navigate(`/experiments/${exp.id}`);
                    if (isMobile) handleDrawerToggle();
                  }}
                  sx={{ borderRadius: 2, py: 0.75, alignItems: 'center', gap: 1 }}
                >
                  <LiveDot color={dotColor} size={8} pulse={meta.live} />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {exp.name || exp.id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {total ? `${meta.label} · round ${current}/${total}` : meta.label}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {Math.round(progressOf(exp))}%
                  </Typography>
                </ListItemButton>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 1, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {pageTitle}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
              {runningCount > 0
                ? `${runningCount} experiment${runningCount > 1 ? 's' : ''} training now`
                : 'No experiments training'}
            </Typography>
          </Box>

          <ConnectionPill status={liveStatus} sx={{ display: { xs: 'none', sm: 'flex' } }} />
          <ColorModeToggle />

          <Tooltip title="Notifications">
            <IconButton
              color="inherit"
              onClick={() => setNotificationHistoryOpen(true)}
              aria-label="notification history"
            >
              <Badge badgeContent={notificationCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {currentUser && (
            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 600 }}>
              {currentUser.username || currentUser.email}
            </Typography>
          )}
          <IconButton
            size="large"
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={handleUserMenuOpen}
            color="inherit"
            sx={{ p: 0.5 }}
          >
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', color: 'secondary.contrastText', fontWeight: 700 }}>
              {currentUser?.username ? currentUser.username.charAt(0).toUpperCase() : <AccountIcon />}
            </Avatar>
          </IconButton>
          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            keepMounted
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
          >
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Box>
                <Typography variant="body2" fontWeight={700}>
                  {currentUser?.username || 'User'}
                </Typography>
                {currentUser?.email && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {currentUser.email}
                  </Typography>
                )}
                {currentUser?.role && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Role: {currentUser.role}
                  </Typography>
                )}
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Navigation drawer */}
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: 'transparent',
        }}
      >
        <Toolbar /> {/* spacer for the fixed AppBar */}
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>

      <NotificationHistory
        open={notificationHistoryOpen}
        onClose={() => setNotificationHistoryOpen(false)}
      />
    </Box>
  );
};

export default Layout;

