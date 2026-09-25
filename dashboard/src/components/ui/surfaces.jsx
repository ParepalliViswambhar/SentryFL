/**
 * Surface primitives
 *
 * The structural building blocks every page composes from: a page header, a
 * titled content panel, a KPI stat tile, and an empty-state placeholder. All
 * colours resolve from theme tokens (glass, gradient, accent glow) so they
 * re-skin with the light/dark toggle. Token reads are defensive
 * (`theme.sentry?.x`) so the primitives still render under MUI's default theme
 * in unit tests.
 *
 * @module components/ui/surfaces
 */

import PropTypes from 'prop-types';
import { Box, Card, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

/** Page title block: gradient title, optional subtitle, glass icon chip, right-aligned actions. */
export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      gap={2}
      sx={{ mb: 3 }}
    >
      <Stack direction="row" alignItems="center" gap={1.75}>
        {icon && (
          <Box
            sx={(theme) => ({
              display: 'grid',
              placeItems: 'center',
              width: 46,
              height: 46,
              borderRadius: 3,
              flexShrink: 0,
              color: 'primary.main',
              backgroundImage: theme.sentry?.gradientSoft,
              backgroundColor: theme.sentry?.gradientSoft ? undefined : theme.sentry?.surfaceAlt,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
              boxShadow: theme.sentry?.isDark
                ? `0 0 24px -8px ${theme.palette.primary.main}`
                : 'none',
            })}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography
            variant="h4"
            sx={(theme) => {
              const g = theme.sentry?.gradient;
              return {
                lineHeight: 1.1,
                ...(g && {
                  backgroundImage: g,
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                }),
              };
            }}
          >
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
/** A titled glass content surface. The header row is omitted when no title/action is given. */
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
 * Compact KPI tile: a large value with a label, optional leading icon, a
 * gradient accent bar, an accent-tinted corner glow, and a hint line. `accent`
 * is a MUI palette key (primary/success/…); the tile lifts subtly on hover.
 */
export function StatTile({ label, value, icon, accent = 'primary', hint, sx }) {
  return (
    <Card
      sx={[
        (theme) => {
          const main = theme.palette[accent]?.main || theme.palette.primary.main;
          const isDark = theme.sentry?.isDark ?? theme.palette.mode === 'dark';
          return {
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
              width: 4,
              backgroundImage: `linear-gradient(180deg, ${main}, ${alpha(main, 0)})`,
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              top: -48,
              insetInlineEnd: -36,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: alpha(main, isDark ? 0.16 : 0.1),
              filter: 'blur(26px)',
              pointerEvents: 'none',
            },
            '&:hover': { transform: 'translateY(-3px)', borderColor: alpha(main, 0.45) },
          };
        },
        sx,
      ]}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>
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
      </Box>
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
/** Centered placeholder for empty lists / no-data panels, with a glass icon halo. */
export function EmptyState({ icon, title, description, action, sx }) {
  return (
    <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ py: 6, px: 3, textAlign: 'center', ...sx }}>
      {icon && (
        <Box
          sx={(theme) => ({
            display: 'grid',
            placeItems: 'center',
            width: 60,
            height: 60,
            borderRadius: '50%',
            color: 'primary.main',
            backgroundImage: theme.sentry?.gradientSoft,
            backgroundColor: theme.sentry?.gradientSoft ? undefined : theme.sentry?.surfaceAlt,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          })}
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
