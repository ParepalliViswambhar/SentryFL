/**
 * Surface primitives
 *
 * The structural building blocks every page composes from: a page header, a
 * titled content panel, a KPI stat tile, and an empty-state placeholder. All
 * colours resolve from theme tokens so they re-skin with the light/dark toggle.
 *
 * @module components/ui/surfaces
 */

import PropTypes from 'prop-types';
import { Box, Card, Stack, Typography } from '@mui/material';

/** Page title block with optional subtitle and right-aligned actions. */
export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      gap={2}
      sx={{ mb: 3 }}
    >
      <Stack direction="row" alignItems="center" gap={1.5}>
        {icon && (
          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 44,
              height: 44,
              borderRadius: 2,
              color: 'primary.main',
              bgcolor: (theme) => theme.sentry?.surfaceAlt,
              border: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography variant="h4" sx={{ lineHeight: 1.1 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {actions && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

PageHeader.propTypes = {
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
  icon: PropTypes.node,
};

/** A titled content surface. Header row is omitted when no title/action given. */
export function Panel({ title, subtitle, action, children, sx, contentSx }) {
  return (
    <Card sx={{ p: 0, overflow: 'hidden', ...sx }}>
      {(title || action) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={2}
          sx={{ px: 2.5, py: 2, borderBottom: (t) => `1px solid ${t.palette.divider}` }}
        >
          <Box>
            {title && (
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
      )}
      <Box sx={{ p: 2.5, ...contentSx }}>{children}</Box>
    </Card>
  );
}

Panel.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  action: PropTypes.node,
  children: PropTypes.node,
  sx: PropTypes.object,
  contentSx: PropTypes.object,
};

/**
 * Compact KPI tile: a large value with a label, optional leading icon, accent
 * bar, and hint line. `accent` is a MUI palette key (primary/success/…).
 */
export function StatTile({ label, value, icon, accent = 'primary', hint, sx }) {
  return (
    <Card
      sx={{
        p: 2.5,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: `${accent}.main`,
          opacity: 0.9,
        },
        ...sx,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.06em' }}>
          {label}
        </Typography>
        {icon && <Box sx={{ color: `${accent}.main`, display: 'flex' }}>{icon}</Box>}
      </Stack>
      <Typography variant="h3" sx={{ mt: 0.5, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </Card>
  );
}

StatTile.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node.isRequired,
  icon: PropTypes.node,
  accent: PropTypes.string,
  hint: PropTypes.node,
  sx: PropTypes.object,
};

/** Centered placeholder for empty lists / no-data panels. */
export function EmptyState({ icon, title, description, action, sx }) {
  return (
    <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ py: 6, px: 3, textAlign: 'center', ...sx }}>
      {icon && (
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 56,
            height: 56,
            borderRadius: '50%',
            color: 'text.secondary',
            bgcolor: (t) => t.sentry?.surfaceAlt,
            border: (t) => `1px solid ${t.palette.divider}`,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6">{title}</Typography>
      {description && (
        <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
}

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  action: PropTypes.node,
  sx: PropTypes.object,
};
