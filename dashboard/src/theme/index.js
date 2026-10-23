/**
 * SentryFL design system — "Premium glass analytics"
 *
 * A single token-driven theme factory that produces a coherent light OR dark
 * Material-UI theme built around three ideas: frosted-glass surfaces, gradient
 * accents, and an ambient aurora-mesh page background. Dark is the default
 * mission-control look (deep navy, cyan→violet gradients, glowing live
 * indicators); light is an airy frosted counterpart. Every colour resolves to a
 * token so the top-bar toggle re-skins the entire surface — glass, gradients and
 * background included — at once.
 *
 * Non-standard tokens live under `theme.sentry.*`. Components read them
 * defensively (`theme.sentry?.x`) because a few unit tests render primitives
 * without the app ThemeProvider, and MUI's default theme has no `sentry` key.
 *
 * @module theme
 */

import { createTheme, alpha } from '@mui/material/styles';

// Font stacks. Inter + JetBrains Mono are loaded from Google Fonts in index.html
// with system fallbacks so the app still looks intentional offline. Numeric
// metrics use the monospace stack so digits align in tables and stat tiles.
export const FONT_SANS =
  "'Manrope', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

// Shared categorical palette for chart series (theme-agnostic, tuned to read on
// both backgrounds). Charts pull colours from here by index.
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

// Each palette carries the standard MUI roles plus SentryFL's glass + gradient
// tokens (glassBg/Border/Highlight/Shadow, the aurora `pageBackground`, and the
// signature cyan→violet `gradient`). Keeping them beside the palette means one
// place defines a mode's entire look.
const DARK = {
  primary: { main: '#22d3ee', light: '#67e8f9', dark: '#0e7490', contrastText: '#04121a' },
  secondary: { main: '#a78bfa', light: '#c4b5fd', dark: '#7c3aed', contrastText: '#160f2e' },
  success: { main: '#34d399', light: '#6ee7b7', dark: '#059669', contrastText: '#05130d' },
  warning: { main: '#fbbf24', light: '#fcd34d', dark: '#d97706', contrastText: '#1a1204' },
  error: { main: '#f87171', light: '#fca5a5', dark: '#dc2626', contrastText: '#1a0606' },
  info: { main: '#38bdf8', light: '#7dd3fc', dark: '#0284c7', contrastText: '#04121a' },
  background: { default: '#070c17', paper: '#0f1830' },
  surfaceAlt: '#0c1424',
  text: { primary: '#e7eefb', secondary: '#95a7c6', disabled: '#5b6c8c' },
  divider: 'rgba(139,163,199,0.14)',
  accentGlow: 'rgba(34,211,238,0.55)',
  // Frosted glass: a translucent fill the aurora shows through, a hairline light
  // edge, a top sheen, and a layered depth shadow.
  glassBg: 'rgba(18,28,50,0.62)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 42%)',
  glassShadow:
    '0 1px 0 rgba(255,255,255,0.05) inset, 0 18px 40px -18px rgba(0,0,0,0.7), 0 6px 16px -8px rgba(0,0,0,0.5)',
  // Ambient aurora mesh painted behind everything (fixed, so it stays put while
  // content scrolls and glass surfaces frost over it).
  pageBackground:
    'radial-gradient(1200px 760px at 12% -12%, rgba(34,211,238,0.13), transparent 60%),' +
    'radial-gradient(1080px 720px at 108% 4%, rgba(167,139,250,0.13), transparent 56%),' +
    'radial-gradient(900px 900px at 52% 128%, rgba(52,211,153,0.07), transparent 60%),' +
    'linear-gradient(180deg, #070c17 0%, #0a1122 100%)',
  gradient: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 52%, #a78bfa 100%)',
  gradientSoft: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(167,139,250,0.18))',
};

const LIGHT = {
  primary: { main: '#0f766e', light: '#14b8a6', dark: '#115e59', contrastText: '#ffffff' },
  secondary: { main: '#ea580c', light: '#fb923c', dark: '#c2410c', contrastText: '#ffffff' },
  success: { main: '#15803d', light: '#22c55e', dark: '#166534', contrastText: '#ffffff' },
  warning: { main: '#b45309', light: '#f59e0b', dark: '#92400e', contrastText: '#ffffff' },
  error: { main: '#be123c', light: '#fb7185', dark: '#9f1239', contrastText: '#ffffff' },
  info: { main: '#0369a1', light: '#0ea5e9', dark: '#075985', contrastText: '#ffffff' },
  background: { default: '#f3f5f2', paper: '#ffffff' },
  surfaceAlt: '#e8eeea',
  text: { primary: '#17221f', secondary: '#5b6b65', disabled: '#93a39c' },
  divider: 'rgba(23,34,31,0.13)',
  accentGlow: 'rgba(15,118,110,0.24)',
  glassBg: '#ffffff',
  glassBorder: 'rgba(23,34,31,0.12)',
  glassHighlight: 'none',
  glassShadow: '0 10px 24px -18px rgba(23,34,31,0.45)',
  pageBackground: 'linear-gradient(180deg, #f3f5f2 0%, #e9efeb 100%)',
  gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #ea580c 100%)',
  gradientSoft: 'linear-gradient(135deg, rgba(15,118,110,0.10), rgba(234,88,12,0.10))',
};

const tokensFor = (mode) => (mode === 'light' ? LIGHT : DARK);

// A single expressive type scale shared by both modes. Tight tracking on large
// display sizes reads as "product", not "document".
const buildTypography = () => ({
  fontFamily: FONT_SANS,
  h1: { fontWeight: 800, fontSize: '2.6rem', letterSpacing: 0, lineHeight: 1.08 },
  h2: { fontWeight: 800, fontSize: '2rem', letterSpacing: 0, lineHeight: 1.14 },
  h3: { fontWeight: 800, fontSize: '1.6rem', letterSpacing: 0, lineHeight: 1.18 },
  h4: { fontWeight: 800, fontSize: '1.3rem', letterSpacing: 0 },
  h5: { fontWeight: 700, fontSize: '1.1rem', letterSpacing: 0 },
  h6: { fontWeight: 700, fontSize: '0.98rem' },
  subtitle1: { fontWeight: 600 },
  subtitle2: { fontWeight: 600 },
  body2: { lineHeight: 1.5 },
  button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  overline: { fontWeight: 700, letterSpacing: '0.09em' },
});

export function createAppTheme(mode = 'dark') {
  const isDark = mode !== 'light';
  const t = tokensFor(mode);
  const softShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.36)'
    : '0 1px 2px rgba(15,28,51,0.06), 0 10px 30px rgba(15,28,51,0.08)';
  // Frost strength. AppBar/Drawer blur a touch harder so scrolled content and
  // the aurora dissolve cleanly beneath the chrome.
  const glassBlur = 'blur(16px) saturate(140%)';
  const chromeBlur = 'blur(18px) saturate(160%)';

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
    // Non-standard tokens consumed across the app via `theme.sentry?.*`.
    sentry: {
      surfaceAlt: t.surfaceAlt,
      accentGlow: t.accentGlow,
      fontMono: FONT_MONO,
      chartSeries: CHART_SERIES,
      softShadow,
      isDark,
      glassBg: t.glassBg,
      glassBorder: t.glassBorder,
      glassHighlight: t.glassHighlight,
      glassShadow: t.glassShadow,
      glassBlur,
      pageBackground: t.pageBackground,
      gradient: t.gradient,
      gradientSoft: t.gradientSoft,
    },
    typography: buildTypography(),
    shape: { borderRadius: 14 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: isDark ? 'dark' : 'light' },
          html: { background: t.background.default },
          body: {
            backgroundColor: t.background.default,
            backgroundImage: t.pageBackground,
            backgroundAttachment: 'fixed',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            minHeight: '100vh',
          },
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
          // Kept light-touch: Menus, Popovers and Dialogs are Paper and must stay
          // crisply legible. The pronounced glass lives on MuiCard (below).
          root: { backgroundImage: 'none' },
          outlined: { borderColor: t.divider },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: t.glassBg,
            backgroundImage: t.glassHighlight,
            backdropFilter: glassBlur,
            WebkitBackdropFilter: glassBlur,
            border: `1px solid ${t.glassBorder}`,
            borderRadius: 10,
            boxShadow: t.glassShadow,
            transition: 'border-color .22s ease, box-shadow .22s ease, transform .22s ease',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, paddingInline: 18, fontWeight: 600 },
          containedPrimary: {
            backgroundImage: t.gradient,
            boxShadow: isDark
              ? `0 0 0 1px ${alpha(t.primary.main, 0.35)}, 0 8px 22px -6px ${alpha(t.primary.main, 0.5)}`
              : `0 8px 20px -8px ${alpha(t.primary.main, 0.5)}`,
            '&:hover': { backgroundImage: t.gradient, filter: 'brightness(1.06)' },
          },
          outlined: { borderColor: t.divider },
          text: { '&:hover': { backgroundColor: alpha(t.primary.main, isDark ? 0.12 : 0.08) } },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'transparent' },
        styleOverrides: {
          root: {
            backgroundColor: alpha(t.background.paper, isDark ? 0.55 : 0.72),
            backgroundImage: t.glassHighlight,
            backdropFilter: chromeBlur,
            WebkitBackdropFilter: chromeBlur,
            borderBottom: `1px solid ${t.glassBorder}`,
            color: t.text.primary,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha(t.background.paper, isDark ? 0.62 : 0.8),
            backgroundImage: t.glassHighlight,
            backdropFilter: chromeBlur,
            WebkitBackdropFilter: chromeBlur,
            borderRight: `1px solid ${t.glassBorder}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 8 },
          label: { paddingInline: 10 },
          outlined: { borderColor: t.divider },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 8, borderRadius: 999, backgroundColor: alpha(t.text.secondary, 0.18) },
          bar: { borderRadius: 999 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            marginInline: 8,
            transition: 'background-color .18s ease, color .18s ease',
            '&.Mui-selected': {
              backgroundImage: t.gradientSoft,
              color: t.primary.main,
              '& .MuiListItemIcon-root': { color: t.primary.main },
              '&:hover': { backgroundImage: t.gradientSoft },
            },
          },
        },
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
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 12, backgroundColor: alpha(t.surfaceAlt, isDark ? 0.45 : 0.6) },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8, backdropFilter: 'none', WebkitBackdropFilter: 'none' },
        },
      },
    },
  });
}
