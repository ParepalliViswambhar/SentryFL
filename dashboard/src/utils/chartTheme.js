/**
 * Theme-aware Chart.js helpers
 *
 * Chart.js draws on a canvas, so it can't inherit CSS/MUI theming — every axis,
 * gridline, tick, legend and tooltip colour must be passed in explicitly. These
 * helpers derive those colours from the active MUI theme so charts re-skin
 * correctly when the light/dark toggle flips, and expose the shared categorical
 * palette so every series is coloured consistently across the app.
 *
 * Usage inside a chart component:
 *   const theme = useTheme();
 *   const options = mergeChartOptions(buildBaseChartOptions(theme, { yTitle: 'Loss' }), extra);
 *
 * @module utils/chartTheme
 */

import { CHART_SERIES } from '../theme';

/** Shared categorical palette (falls back to the exported constant). */
export const seriesPalette = (theme) => theme?.sentry?.chartSeries || CHART_SERIES;

/** Nth series colour, wrapping around the palette. */
export const seriesColor = (theme, index = 0) => {
  const palette = seriesPalette(theme);
  return palette[index % palette.length];
};

/** Add an alpha channel to a hex colour (e.g. for fills under a line). */
export const withAlpha = (hex, alpha) => {
  const value = String(hex).replace('#', '');
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Resolve the set of chrome colours a chart needs from the MUI theme. */
export const chartColors = (theme) => ({
  text: theme.palette.text.secondary,
  title: theme.palette.text.primary,
  grid: theme.palette.divider,
  tooltipBg: theme.palette.background.paper,
  tooltipText: theme.palette.text.primary,
  tooltipBorder: theme.palette.divider,
  font: theme.typography.fontFamily,
});

const axis = (colors, title) => ({
  title: title
    ? { display: true, text: title, color: colors.title, font: { family: colors.font, weight: 600 } }
    : { display: false },
  ticks: { color: colors.text, font: { family: colors.font }, maxTicksLimit: 12, autoSkip: true },
  grid: { color: colors.grid, drawTicks: false },
  border: { color: colors.grid },
});

/**
 * A themed Chart.js options object suitable as a base for line/bar charts.
 * @param {object} theme - MUI theme
 * @param {{xTitle?: string, yTitle?: string, legend?: boolean}} opts
 */
export const buildBaseChartOptions = (theme, { xTitle, yTitle, legend = true } = {}) => {
  const colors = chartColors(theme);
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 16,
          color: colors.text,
          font: { family: colors.font },
        },
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.tooltipText,
        bodyColor: colors.tooltipText,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: { family: colors.font, weight: 700 },
        bodyFont: { family: colors.font },
        boxPadding: 6,
        usePointStyle: true,
      },
    },
    scales: { x: axis(colors, xTitle), y: axis(colors, yTitle) },
  };
};

/**
 * Shallow-merge chart options while deep-merging the nested `plugins` and
 * `scales` blocks, so a caller can override e.g. `scales.y.min` without wiping
 * the themed tick/grid colours.
 */
export const mergeChartOptions = (base, extra = {}) => {
  const merged = { ...base, ...extra };
  if (extra.plugins) {
    merged.plugins = { ...base.plugins, ...extra.plugins };
    if (extra.plugins.tooltip) {
      merged.plugins.tooltip = { ...base.plugins.tooltip, ...extra.plugins.tooltip };
    }
    if (extra.plugins.legend) {
      merged.plugins.legend = { ...base.plugins.legend, ...extra.plugins.legend };
    }
  }
  if (extra.scales) {
    merged.scales = {
      x: { ...base.scales?.x, ...extra.scales.x },
      y: { ...base.scales?.y, ...extra.scales.y },
      ...Object.fromEntries(
        Object.entries(extra.scales).filter(([key]) => key !== 'x' && key !== 'y')
      ),
    };
  }
  return merged;
};
