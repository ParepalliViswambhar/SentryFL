/**
 * Sparkline
 *
 * A dependency-free inline SVG trend line for tiny "recent activity" glimpses
 * (e.g. loss over the last N rounds inside an active-run card), where mounting a
 * full Chart.js canvas would be overkill. Colours come from theme tokens.
 *
 * @module components/ui/Sparkline
 */

import PropTypes from 'prop-types';
import { Box, useTheme } from '@mui/material';
import { seriesColor, withAlpha } from '../../utils/chartTheme';

export default function Sparkline({ data = [], color, width = 120, height = 36, strokeWidth = 2, fill = true }) {
  const theme = useTheme();
  const stroke = color || seriesColor(theme, 0);
  const points = (data || []).filter((value) => typeof value === 'number' && !Number.isNaN(value));

  if (points.length < 2) {
    return <Box sx={{ width, height }} aria-hidden />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((value, index) => {
    const x = index * stepX;
    // Invert Y so higher values sit higher; pad by 2px top/bottom.
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return [x, y];
  });

  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <Box component="svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} sx={{ display: 'block' }} aria-hidden>
      {fill && <path d={area} fill={withAlpha(stroke, 0.14)} stroke="none" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </Box>
  );
}

Sparkline.propTypes = {
  data: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
  strokeWidth: PropTypes.number,
  fill: PropTypes.bool,
};
