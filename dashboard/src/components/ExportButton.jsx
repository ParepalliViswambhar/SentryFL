/**
 * ExportButton Component
 * 
 * Reusable export button for charts with support for multiple formats:
 * - PNG (with configurable DPI)
 * - SVG
 * - PDF
 * 
 * Requirements: 39.1, 39.2, 39.6
 * 
 * @module components/ExportButton
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Button,
  ButtonGroup,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Stack,
  Typography,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  exportChartAsPNG,
  exportChartAsSVG,
  exportChartAsPDF,
  PUBLICATION_DPI,
  DEFAULT_DPI,
} from '../utils/exportUtils';

/**
 * ExportButton Component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.chartRef - React ref to Chart.js instance
 * @param {string} props.filename - Base filename for exports (without extension)
 * @param {boolean} [props.showText=true] - Whether to show button text or just icon
 * @param {string} [props.variant='outlined'] - Button variant
 * @param {string} [props.size='small'] - Button size
 * @param {boolean} [props.disabled=false] - Whether button is disabled
 * @returns {JSX.Element} Export button component
 */
const ExportButton = ({
  chartRef,
  filename,
  showText = true,
  variant = 'outlined',
  size = 'small',
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dpi, setDpi] = useState(PUBLICATION_DPI);
  const [customFilename, setCustomFilename] = useState(filename);
  const [isExporting, setIsExporting] = useState(false);

  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = async (format) => {
    if (!chartRef.current) {
      console.error('Chart reference not available');
      return;
    }

    setIsExporting(true);
    handleClose();

    try {
      switch (format) {
        case 'png':
          await exportChartAsPNG(chartRef, customFilename, dpi);
          break;
        case 'svg':
          exportChartAsSVG(chartRef, customFilename);
          break;
        case 'pdf':
          await exportChartAsPDF(chartRef, customFilename, dpi);
          break;
        default:
          console.error('Unknown export format:', format);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenSettings = () => {
    setSettingsOpen(true);
    handleClose();
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  const handleDPIPreset = (preset) => {
    setDpi(preset);
  };

  return (
    <>
      {showText ? (
        <Button
          variant={variant}
          size={size}
          startIcon={<DownloadIcon />}
          onClick={handleClick}
          disabled={disabled || isExporting}
        >
          Export
        </Button>
      ) : (
        <Tooltip title="Export chart">
          <IconButton
            size={size}
            onClick={handleClick}
            disabled={disabled || isExporting}
          >
            <DownloadIcon />
          </IconButton>
        </Tooltip>
      )}

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={() => handleExport('png')}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            Export as PNG
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('svg')}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            Export as SVG
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('pdf')}>
          <ListItemIcon>
            <PictureAsPdfIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            Export as PDF
          </ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleOpenSettings}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            Export Settings
          </ListItemText>
        </MenuItem>
      </Menu>

      {/* Export Settings Dialog */}
      <Dialog open={settingsOpen} onClose={handleCloseSettings} maxWidth="sm" fullWidth>
        <DialogTitle>Export Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* Filename */}
            <TextField
              label="Filename"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              fullWidth
              helperText="File extension will be added automatically"
            />

            {/* DPI Settings */}
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Image Quality (DPI)
              </Typography>
              <TextField
                type="number"
                value={dpi}
                onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                fullWidth
                inputProps={{
                  min: 72,
                  max: 600,
                  step: 1,
                }}
                helperText="Higher DPI = better quality but larger file size"
              />
              <ButtonGroup size="small" fullWidth>
                <Button
                  variant={dpi === DEFAULT_DPI ? 'contained' : 'outlined'}
                  onClick={() => handleDPIPreset(DEFAULT_DPI)}
                >
                  Screen (96 DPI)
                </Button>
                <Button
                  variant={dpi === 150 ? 'contained' : 'outlined'}
                  onClick={() => handleDPIPreset(150)}
                >
                  Print (150 DPI)
                </Button>
                <Button
                  variant={dpi === PUBLICATION_DPI ? 'contained' : 'outlined'}
                  onClick={() => handleDPIPreset(PUBLICATION_DPI)}
                >
                  Publication (300 DPI)
                </Button>
              </ButtonGroup>
            </Stack>

            {/* Info */}
            <Typography variant="caption" color="text.secondary">
              <strong>Note:</strong> Publication-quality exports (300 DPI) are recommended for
              academic papers and presentations. Screen quality (96 DPI) is sufficient for
              web display and reduces file size.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSettings}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

ExportButton.propTypes = {
  chartRef: PropTypes.shape({
    current: PropTypes.object,
  }).isRequired,
  filename: PropTypes.string.isRequired,
  showText: PropTypes.bool,
  variant: PropTypes.string,
  size: PropTypes.string,
  disabled: PropTypes.bool,
};

export default ExportButton;
