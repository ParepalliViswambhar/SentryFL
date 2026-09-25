/**
 * SentryFL design system
 *
 * A single token-driven theme factory that produces a coherent light OR dark
 * Material-UI theme. Dark is the default "mission-control" look (deep navy
 * surfaces, neon-cyan accent, glowing live indicators); light is a clean
 * counterpart. Every colour used across the app resolves to one of these
 * tokens so the top-bar toggle re-themes the entire surface at once.
 *
 * @module theme
 */

import { createTheme, alpha } from '@mui/material/styles';

// Font stacks. Inter is loaded from Google Fonts in index.html with a system
// fallback so the app still looks intentional offline. Numeric metrics use a
// monospace stack so digits align in tables and stat tiles.
export const FONT_SANS =
  "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const FONT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

// Shared categorical palette for chart series (theme-agnostic, tuned to read
// on both backgrounds). Charts pull colours from here by index.
export const CHART_SERIES = [
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#60a5fa', // blue
  '#f87171', // red
  '#2dd4bf', // teal
];

const DARK = {
  primary: { main: '#22d3ee', light: '#67e8f9', dark: '#0e7490', contrastText: '#04121a' },
  secondary: { main: '#a78bfa', light: '#c4b5fd', dark: '#7c3aed', contrastText: '#160f2e' },
  success: { main: '#34d399', light: '#6ee7b7', dark: '#059669', contrastText: '#05130d' },
  warning: { main: '#fbbf24', light: '#fcd34d', dark: '#d97706', contrastText: '#1a1204' },
  error: { main: '#f87171', light: '#fca5a5', dark: '#dc2626', contrastText: '#1a0606' },
  info: { main: '#38bdf8', light: '#7dd3fc', dark: '#0284c7', contrastText: '#04121a' },
  background: { default: '#080d1a', paper: '#101a30' },
  surfaceAlt: '#0c1424',
  text: { primary: '#e7eefb', secondary: '#95a7c6', disabled: '#5b6c8c' },
  divider: 'rgba(139,163,199,0.14)',
  accentGlow: 'rgba(34,211,238,0.55)',
};

const LIGHT = {
  primary: { main: '#0891b2', light: '#06b6d4', dark: '#0e7490', contrastText: '#ffffff' },
  secondary: { main: '#7c3aed', light: '#a78bfa', dark: '#5b21b6', contrastText: '#ffffff' },
  success: { main: '#059669', light: '#34d399', dark: '#047857', contrastText: '#ffffff' },
  warning: { main: '#d97706', light: '#f59e0b', dark: '#b45309', contrastText: '#ffffff' },
  error: { main: '#dc2626', light: '#ef4444', dark: '#b91c1c', contrastText: '#ffffff' },
  info: { main: '#0284c7', light: '#0ea5e9', dark: '#0369a1', contrastText: '#ffffff' },
  background: { default: '#eef2f8', paper: '#ffffff' },
  surfaceAlt: '#f5f8fc',
  text: { primary: '#0f1c33', secondary: '#4a5b76', disabled: '#94a3b8' },
  divider: 'rgba(51,65,85,0.14)',
  accentGlow: 'rgba(8,145,178,0.35)',
};

const tokensFor = (mode) => (mode === 'light' ? LIGHT : DARK);

/**
 * Expose semantic tokens that are not part of the standard MUI palette so
 * components can read them via `theme.sentry.*` (surfaceAlt, accentGlow, mono
 * font, chart series).
 */
const buildTypography = () => ({
  fontFamily: FONT_SANS,
  h1: { fontWeight: 800, fontSize: '2.6rem', letterSpacing: '-0.02em', lineHeight: 1.1 },
  h2: { fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.02em', lineHeight: 1.15 },
  h3: { fontWeight: 700, fontSize: '1.6rem', letterSpacing: '-0.01em', lineHeight: 1.2 },
  h4: { fontWeight: 700, fontSize: '1.3rem', letterSpacing: '-0.01em' },
  h5: { fontWeight: 700, fontSize: '1.1rem' },
  h6: { fontWeight: 700, fontSize: '0.98rem' },
  subtitle1: { fontWeight: 600 },
  subtitle2: { fontWeight: 600 },
  button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  overline: { fontWeight: 700, letterSpacing: '0.08em' },
});

export function createAppTheme(mode = 'dark') {
  const isDark = mode !== 'light';
  const t = tokensFor(mode);
  const softShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.36)'
    : '0 1px 2px rgba(15,28,51,0.06), 0 10px 30px rgba(15,28,51,0.08)';

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: t.primary,
      secondary: t.secondary,
      success: t.success,
      warning: t.warning,
      error: t.error,
      info: t.info,
      background: t.background,
      text: t.text,
      divider: t.divider,
      action: {
        hover: alpha(t.primary.main, isDark ? 0.1 : 0.06),
        selected: alpha(t.primary.main, isDark ? 0.16 : 0.1),
      },
    },
    // Non-standard tokens consumed across the app.
    sentry: {
      surfaceAlt: t.surfaceAlt,
      accentGlow: t.accentGlow,
      fontMono: FONT_MONO,
      chartSeries: CHART_SERIES,
      softShadow,
      isDark,
    },
    typography: buildTypography(),
    shape: { borderRadius: 12 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: isDark ? 'dark' : 'light' },
          body: { backgroundColor: t.background.default },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(t.text.secondary, 0.35),
            borderRadius: 999,
            border: `2px solid ${t.background.default}`,
          },
          '*::-webkit-scrollbar-thumb:hover': { backgroundColor: alpha(t.text.secondary, 0.55) },
          '::selection': { backgroundColor: alpha(t.primary.main, 0.3) },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: t.divider },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${t.divider}`,
            backgroundColor: t.background.paper,
            borderRadius: 16,
            boxShadow: softShadow,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10, paddingInline: 16 },
          containedPrimary: isDark
            ? { boxShadow: `0 0 0 1px ${alpha(t.primary.main, 0.4)}, 0 6px 18px ${alpha(t.primary.main, 0.25)}` }
            : {},
          outlined: { borderColor: t.divider },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'transparent' },
        styleOverrides: {
          root: {
            backgroundColor: alpha(t.background.paper, isDark ? 0.72 : 0.86),
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${t.divider}`,
            color: t.text.primary,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? t.surfaceAlt : t.background.paper,
            borderRight: `1px solid ${t.divider}`,
            backgroundImage: 'none',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 8 },
          label: { paddingInline: 10 },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 8, borderRadius: 999, backgroundColor: alpha(t.text.secondary, 0.18) },
          bar: { borderRadius: 999 },
        },
      },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: 10, marginInline: 8 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#0f1c33',
            fontSize: '0.75rem',
            borderRadius: 8,
            border: `1px solid ${t.divider}`,
          },
        },
      },
      MuiTableCell: { styleOverrides: { root: { borderColor: t.divider } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
    },
  });
}



