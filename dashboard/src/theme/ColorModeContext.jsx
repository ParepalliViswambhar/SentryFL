/**
 * Colour-mode context
 *
 * Owns the light/dark choice for the whole app, persists it to localStorage
 * (defaulting to the mission-control dark theme), and exposes a toggle. The
 * provider builds the MUI theme from the current mode and wraps children in
 * ThemeProvider + CssBaseline so a toggle instantly re-themes every surface.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { ThemeProvider, CssBaseline, IconButton, Tooltip } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import { createAppTheme } from './index';

const STORAGE_KEY = 'sentryfl-color-mode';

const ColorModeContext = createContext({ mode: 'dark', toggle: () => {}, setMode: () => {} });

const readStoredMode = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable (private mode / blocked) — fall back to default */
  }
  return 'dark';
};

export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(readStoredMode);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore persistence failures */
    }
    document.documentElement.setAttribute('data-color-mode', mode);
    // Keep the <html> background (set inline pre-mount in index.html) in sync on
    // runtime toggles so overscroll/rubber-band areas match the active theme.
    document.documentElement.style.background = theme.palette.background.default;
  }, [mode, theme]);

  const toggle = useCallback(() => setMode((prev) => (prev === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

ColorModeProvider.propTypes = { children: PropTypes.node };

// Co-located with its provider by design; the hook export is intentional.
// eslint-disable-next-line react-refresh/only-export-components
export const useColorMode = () => useContext(ColorModeContext);

/** Icon button that flips between light and dark, safe to drop in any toolbar. */
export function ColorModeToggle(props) {
  const { mode, toggle } = useColorMode();
  const isDark = mode === 'dark';
  return (
    <Tooltip title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
      <IconButton onClick={toggle} color="inherit" aria-label="Toggle colour theme" {...props}>
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
