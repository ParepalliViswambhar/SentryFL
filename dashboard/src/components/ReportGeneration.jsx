/**
 * Report Generation Component
 * 
 * Provides comprehensive report generation capabilities:
 * - Summary report generation with all experiment results
 * - PDF report generation via API
 * - Export anomaly detection results with timestamps
 * - Export comparison tables in LaTeX format
 * - Batch export multiple experiments
 * 
 * Requirements: 39.5, 39.7, 39.8, 39.10
 * 
 * @module components/ReportGeneration
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import TableChartIcon from '@mui/icons-material/TableChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import DataObjectIcon from '@mui/icons-material/DataObject';
import CodeIcon from '@mui/icons-material/Code';
import {
  generateSummaryReport,
  exportSummaryReport,
  exportAnomalyDetectionResults,
  exportExperimentComparisonLaTeX,
  generatePDFReport,
  exportFullExperimentPackage,
} from '../utils/reportUtils';
import apiClient from '../api/client';

/**
 * ReportGeneration Component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.experiment - Experiment object with all data
 * @param {Array<Object>} props.comparisonExperiments - Optional array of experiments for comparison
 * @param {Object} props.chartRefs - Optional object containing refs to chart instances
 * @param {boolean} [props.showComparisonExport=false] - Whether to show comparison export options
 * @returns {JSX.Element} Report generation component
 */
const ReportGeneration = ({
  experiment,
  comparisonExperiments = [],
  chartRefs = null,
  showComparisonExport = false,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Handle summary report export
  const handleExportSummary = async (format) => {
    if (!experiment) {
      setError('No experiment data available');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      exportSummaryReport(experiment, format);
      setSuccess(`Summary report exported as ${format.toUpperCase()}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to export summary: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle PDF report generation
  const handleGeneratePDF = async () => {
    if (!experiment || !experiment.id) {
      setError('No experiment ID available');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      await generatePDFReport(experiment.id, apiClient);
      setSuccess('PDF report generated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to generate PDF: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle anomaly results export
  const handleExportAnomalies = () => {
    if (!experiment || !experiment.anomalyResults || experiment.anomalyResults.length === 0) {
      setError('No anomaly detection results available');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      exportAnomalyDetectionResults(experiment.anomalyResults, experiment.id);
      setSuccess('Anomaly results exported successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to export anomalies: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle comparison table export
  const handleExportComparisonLaTeX = () => {
    if (!comparisonExperiments || comparisonExperiments.length === 0) {
      setError('No comparison experiments available');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      exportExperimentComparisonLaTeX(
        comparisonExperiments,
        ['f1Score', 'precision', 'recall', 'rocAuc', 'prAuc'],
        'Experiment Performance Comparison',
        'tab:experiment_comparison'
      );
      setSuccess('Comparison table exported as LaTeX');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to export comparison: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle full package export
  const handleExportFullPackage = async () => {
    if (!experiment) {
      setError('No experiment data available');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      await exportFullExperimentPackage(experiment, chartRefs, apiClient);
      setSuccess('Full experiment package exported as ZIP');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to export package: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Stack spacing={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssessmentIcon /> Report Generation
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Export experiment results in various formats
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Status Messages */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Summary Reports */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon /> Summary Reports
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Export comprehensive experiment summary with all metrics and results
                  </Typography>
                </Box>

                <Divider />

                <List dense>
                  <ListItem>
                    <ListItemIcon><DataObjectIcon /></ListItemIcon>
                    <ListItemText 
                      primary="JSON Format" 
                      secondary="Structured data for programmatic access"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><TableChartIcon /></ListItemIcon>
                    <ListItemText 
                      primary="CSV Format" 
                      secondary="Flat format for spreadsheet analysis"
                    />
                  </ListItem>
                </List>

                <ButtonGroup fullWidth variant="contained">
                  <Tooltip title="Export summary as JSON">
                    <Button
                      startIcon={<DataObjectIcon />}
                      onClick={() => handleExportSummary('json')}
                      disabled={isGenerating || !experiment}
                    >
                      JSON
                    </Button>
                  </Tooltip>
                  <Tooltip title="Export summary as CSV">
                    <Button
                      startIcon={<TableChartIcon />}
                      onClick={() => handleExportSummary('csv')}
                      disabled={isGenerating || !experiment}
                    >
                      CSV
                    </Button>
                  </Tooltip>
                </ButtonGroup>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* PDF Report */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PictureAsPdfIcon /> PDF Report
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Generate publication-ready PDF report with charts and tables
                  </Typography>
                </Box>

                <Divider />

                <List dense>
                  <ListItem>
                    <ListItemIcon><AssessmentIcon /></ListItemIcon>
                    <ListItemText 
                      primary="Includes Visualizations" 
                      secondary="All charts and graphs embedded"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><TableChartIcon /></ListItemIcon>
                    <ListItemText 
                      primary="Statistical Tables" 
                      secondary="Comprehensive metrics summary"
                    />
                  </ListItem>
                </List>

                <Button
                  fullWidth
                  variant="contained"
                  color="error"
                  startIcon={isGenerating ? <CircularProgress size={20} /> : <PictureAsPdfIcon />}
                  onClick={handleGeneratePDF}
                  disabled={isGenerating || !experiment || !experiment.id}
                >
                  {isGenerating ? 'Generating...' : 'Generate PDF Report'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Anomaly Results */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AssessmentIcon /> Anomaly Detection Results
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Export detected anomalies with timestamps and scores
                  </Typography>
                </Box>

                <Divider />

                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`${experiment?.anomalyResults?.length || 0} anomalies detected`}
                      secondary="Includes timestamps, scores, and predictions"
                    />
                  </ListItem>
                </List>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportAnomalies}
                  disabled={isGenerating || !experiment?.anomalyResults?.length}
                >
                  Export Anomaly Results (CSV)
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Full Package Export */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FolderZipIcon /> Complete Export Package
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Export everything: data, charts, config, and reports
                  </Typography>
                </Box>

                <Divider />

                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary="All Metrics (CSV)" 
                      secondary="Training, privacy, communication"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="All Charts (PNG)" 
                      secondary="High-resolution figures"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Configuration Files" 
                      secondary="JSON and YAML formats"
                    />
                  </ListItem>
                </List>

                <Button
                  fullWidth
                  variant="contained"
                  color="secondary"
                  startIcon={isGenerating ? <CircularProgress size={20} /> : <FolderZipIcon />}
                  onClick={handleExportFullPackage}
                  disabled={isGenerating || !experiment}
                >
                  {isGenerating ? 'Exporting...' : 'Export Full Package (ZIP)'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* LaTeX Comparison Table */}
        {showComparisonExport && comparisonExperiments.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CodeIcon /> LaTeX Comparison Table
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Export experiment comparison table in LaTeX format for publications
                    </Typography>
                  </Box>

                  <Divider />

                  <List dense>
                    <ListItem>
                      <ListItemText 
                        primary={`Comparing ${comparisonExperiments.length} experiments`}
                        secondary="Includes F1, precision, recall, AUC-ROC, AUC-PR"
                      />
                    </ListItem>
                  </List>

                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<CodeIcon />}
                    onClick={handleExportComparisonLaTeX}
                    disabled={isGenerating}
                  >
                    Export LaTeX Table
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Info Box */}
      <Paper sx={{ p: 2, bgcolor: 'info.light' }}>
        <Typography variant="body2" color="info.dark">
          <strong>Tip:</strong> For publication-ready figures, use the export buttons on individual charts 
          with 300 DPI setting. LaTeX tables can be directly included in your research papers.
        </Typography>
      </Paper>
    </Stack>
  );
};

ReportGeneration.propTypes = {
  experiment: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    config: PropTypes.object,
    trainingMetrics: PropTypes.array,
    privacyMetrics: PropTypes.array,
    communicationMetrics: PropTypes.array,
    evaluationMetrics: PropTypes.object,
    anomalyResults: PropTypes.array,
    status: PropTypes.string,
    createdAt: PropTypes.string,
    completedAt: PropTypes.string,
  }),
  comparisonExperiments: PropTypes.arrayOf(PropTypes.object),
  chartRefs: PropTypes.object,
  showComparisonExport: PropTypes.bool,
};

export default ReportGeneration;

