/**
 * Virtualized Experiment Table Component
 * 
 * Uses react-window for virtual scrolling to efficiently render large
 * lists of experiments without performance degradation.
 * 
 * Requirements: 37.2 (Virtual scrolling for large experiment lists)
 * 
 * @module components/VirtualizedExperimentTable
 */

import { memo, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import { List } from 'react-window';
import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const statusColor = {
  running: 'success',
  completed: 'info',
  failed: 'error',
  paused: 'warning',
  queued: 'default',
};

/**
 * Header row for the virtualized table
 * Requirement 37.4: React.memo to prevent unnecessary re-renders
 */
const TableHeader = memo(() => {
  const theme = useTheme();
  
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 2fr 1.5fr 1fr',
        gap: 2,
        p: 2,
        borderBottom: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.default,
        fontWeight: 600,
      }}
    >
      <Typography variant="body2" fontWeight={600}>
        Name
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        Status
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        Progress
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        Started
      </Typography>
      <Typography variant="body2" fontWeight={600} align="right">
        Controls
      </Typography>
    </Box>
  );
});

TableHeader.displayName = 'TableHeader';

/**
 * Single experiment row component
 * Requirement 37.4: React.memo to prevent unnecessary re-renders
 */
const ExperimentRow = memo(({ experiment, onStop, onPause, onResume, style }) => {
  const theme = useTheme();
  const progress = experiment.progress ?? 
    (experiment.totalRounds ? ((experiment.currentRound || 0) / experiment.totalRounds) * 100 : 0);

  return (
    <Box
      style={style}
      sx={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 2fr 1.5fr 1fr',
        gap: 2,
        p: 2,
        borderBottom: `1px solid ${theme.palette.divider}`,
        alignItems: 'center',
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
        },
      }}
    >
      {/* Name */}
      <Button
        component={RouterLink}
        to={`/experiments/${experiment.id}`}
        sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
      >
        {experiment.name || experiment.id}
      </Button>

      {/* Status */}
      <Chip
        size="small"
        label={experiment.status || 'queued'}
        color={statusColor[experiment.status] || 'default'}
      />

      {/* Progress */}
      <Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, progress)}
          sx={{ mb: 0.5 }}
        />
        <Typography variant="caption" color="text.secondary">
          {Math.round(progress)}%
          {experiment.totalRounds
            ? ` (${experiment.currentRound || 0}/${experiment.totalRounds})`
            : ''}
        </Typography>
      </Box>

      {/* Started */}
      <Typography variant="body2">
        {experiment.createdAt
          ? new Date(experiment.createdAt).toLocaleString()
          : 'Not started'}
      </Typography>

      {/* Controls */}
      <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
        {experiment.status === 'running' && (
          <Tooltip title="Pause">
            <IconButton
              size="small"
              aria-label={`Pause ${experiment.name || experiment.id}`}
              onClick={() => onPause(experiment.id)}
            >
              <PauseIcon />
            </IconButton>
          </Tooltip>
        )}
        {experiment.status === 'paused' && (
          <Tooltip title="Resume">
            <IconButton
              size="small"
              aria-label={`Resume ${experiment.name || experiment.id}`}
              onClick={() => onResume(experiment.id)}
            >
              <PlayArrowIcon />
            </IconButton>
          </Tooltip>
        )}
        {!['completed', 'failed', 'stopped'].includes(experiment.status) && (
          <Tooltip title="Stop">
            <IconButton
              size="small"
              color="error"
              aria-label={`Stop ${experiment.name || experiment.id}`}
              onClick={() => onStop(experiment)}
            >
              <StopIcon />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
});

ExperimentRow.displayName = 'ExperimentRow';

ExperimentRow.propTypes = {
  experiment: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    status: PropTypes.string,
    progress: PropTypes.number,
    currentRound: PropTypes.number,
    totalRounds: PropTypes.number,
    createdAt: PropTypes.string,
  }).isRequired,
  onStop: PropTypes.func.isRequired,
  onPause: PropTypes.func.isRequired,
  onResume: PropTypes.func.isRequired,
  style: PropTypes.object,
};

/**
 * Virtualized Experiment Table
 * 
 * Uses react-window for efficient rendering of large experiment lists.
 * Only renders visible rows, dramatically improving performance with
 * hundreds or thousands of experiments.
 * 
 * Requirements:
 * - 37.2: Virtual scrolling for large experiment lists
 * - 37.4: React.memo to prevent unnecessary re-renders
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.experiments - Array of experiment objects
 * @param {Function} props.onStop - Callback when stop is clicked
 * @param {Function} props.onPause - Callback when pause is clicked
 * @param {Function} props.onResume - Callback when resume is clicked
 * @param {number} [props.height=600] - Height of the virtualized list
 * @param {number} [props.rowHeight=80] - Height of each row
 * @param {number} [props.threshold=20] - Minimum items before virtualization
 * @returns {JSX.Element} Virtualized experiment table
 */
const VirtualizedExperimentTable = memo(({
  experiments = [],
  onStop,
  onPause,
  onResume,
  height = 600,
  rowHeight = 80,
  threshold = 20,
}) => {
  // Only use virtualization if there are many experiments
  const shouldVirtualize = experiments.length >= threshold;

  // Memoize row renderer for virtual list
  const Row = useMemo(() => {
    const VirtualRow = ({ index, style, experiments: rowExperiments, onStop: rowOnStop, onPause: rowOnPause, onResume: rowOnResume }) => {
      const experiment = rowExperiments[index];
      return (
        <ExperimentRow
          key={experiment.id}
          experiment={experiment}
          onStop={rowOnStop}
          onPause={rowOnPause}
          onResume={rowOnResume}
          style={style}
        />
      );
    };
    VirtualRow.displayName = 'VirtualExperimentRow';
    return VirtualRow;
  }, []);

  if (experiments.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        No experiments found.
      </Typography>
    );
  }

  // Render without virtualization for small lists
  if (!shouldVirtualize) {
    return (
      <Box>
        <TableHeader />
        {experiments.map((experiment) => (
          <ExperimentRow
            key={experiment.id}
            experiment={experiment}
            onStop={onStop}
            onPause={onPause}
            onResume={onResume}
          />
        ))}
      </Box>
    );
  }

  // Render with virtualization for large lists
  return (
    <Box>
      <TableHeader />
      <List
        height={height}
        rowCount={experiments.length}
        rowHeight={rowHeight}
        width="100%"
        overscanCount={5}
        rowComponent={Row}
        rowProps={{ experiments, onStop, onPause, onResume }}
      />
    </Box>
  );
});

VirtualizedExperimentTable.displayName = 'VirtualizedExperimentTable';

VirtualizedExperimentTable.propTypes = {
  experiments: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      status: PropTypes.string,
      progress: PropTypes.number,
      currentRound: PropTypes.number,
      totalRounds: PropTypes.number,
      createdAt: PropTypes.string,
    })
  ),
  onStop: PropTypes.func.isRequired,
  onPause: PropTypes.func.isRequired,
  onResume: PropTypes.func.isRequired,
  height: PropTypes.number,
  rowHeight: PropTypes.number,
  threshold: PropTypes.number,
};

export default VirtualizedExperimentTable;
