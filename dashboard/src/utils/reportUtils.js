/**
 * Report Generation Utilities
 * 
 * Provides functions for generating comprehensive experiment reports:
 * - Summary reports with all experiment results
 * - PDF report generation via API
 * - Batch export of multiple experiments
 * 
 * Requirements: 39.5, 39.7, 39.8, 39.9, 39.10
 * 
 * @module utils/reportUtils
 */

import { 
  exportMetricsAsCSV, 
  exportAsJSON, 
  exportComparisonTableLaTeX, 
  downloadLaTeXTable,
  exportAnomalyResults,
  createZipArchive,
} from './exportUtils';

/**
 * Generate a comprehensive summary report for an experiment
 * 
 * @param {Object} experiment - Experiment object with all results
 * @param {string} experiment.id - Experiment ID
 * @param {string} experiment.name - Experiment name
 * @param {Object} experiment.config - Experiment configuration
 * @param {Array<Object>} experiment.trainingMetrics - Training metrics
 * @param {Array<Object>} experiment.privacyMetrics - Privacy metrics
 * @param {Array<Object>} experiment.communicationMetrics - Communication metrics
 * @param {Object} experiment.evaluationMetrics - Evaluation metrics
 * @param {Array<Object>} experiment.anomalyResults - Anomaly detection results
 * @returns {Object} Summary report object
 */
export const generateSummaryReport = (experiment) => {
  if (!experiment) {
    throw new Error('No experiment data provided');
  }

  const {
    id,
    name,
    config = {},
    trainingMetrics = [],
    privacyMetrics = [],
    communicationMetrics = [],
    evaluationMetrics = {},
    anomalyResults = [],
    status,
    createdAt,
    completedAt,
  } = experiment;

  // Calculate summary statistics
  const finalTrainingMetric = trainingMetrics[trainingMetrics.length - 1] || {};
  const finalPrivacyMetric = privacyMetrics[privacyMetrics.length - 1] || {};
  
  const totalCommunicationBytes = communicationMetrics.reduce(
    (sum, m) => sum + (m.bytesSent || 0) + (m.bytesReceived || 0),
    0
  );

  const report = {
    metadata: {
      reportGeneratedAt: new Date().toISOString(),
      experimentId: id,
      experimentName: name,
      status,
      createdAt,
      completedAt,
      duration: completedAt && createdAt 
        ? new Date(completedAt) - new Date(createdAt) 
        : null,
    },
    configuration: {
      ...config,
    },
    trainingSummary: {
      totalRounds: trainingMetrics.length,
      finalLoss: finalTrainingMetric.loss,
      finalAccuracy: finalTrainingMetric.accuracy,
      convergenceRound: findConvergenceRound(trainingMetrics),
    },
    privacySummary: {
      finalEpsilon: finalPrivacyMetric.epsilon,
      finalDelta: finalPrivacyMetric.delta,
      maxEpsilon: config.privacy?.epsilon || config.maxEpsilon,
      privacyBudgetUtilization: finalPrivacyMetric.epsilon && config.maxEpsilon
        ? (finalPrivacyMetric.epsilon / config.maxEpsilon) * 100
        : null,
    },
    communicationSummary: {
      totalBytes: totalCommunicationBytes,
      totalBytesMB: (totalCommunicationBytes / (1024 * 1024)).toFixed(2),
      averageBytesPerRound: communicationMetrics.length > 0
        ? totalCommunicationBytes / communicationMetrics.length
        : 0,
      totalRounds: communicationMetrics.length,
    },
    evaluationSummary: {
      ...evaluationMetrics,
      f1Score: evaluationMetrics.f1Score || evaluationMetrics.f1,
      precision: evaluationMetrics.precision,
      recall: evaluationMetrics.recall,
      rocAuc: evaluationMetrics.rocAuc || evaluationMetrics.auc_roc,
      prAuc: evaluationMetrics.prAuc || evaluationMetrics.auc_pr,
    },
    anomalyDetection: {
      totalAnomalies: anomalyResults.length,
      anomaliesByTimestamp: anomalyResults.map(a => ({
        timestamp: a.timestamp,
        score: a.score,
        predicted: a.predicted,
        actual: a.actual,
      })),
    },
  };

  return report;
};

/**
 * Find the round where training converged (loss stabilized)
 * 
 * @param {Array<Object>} trainingMetrics - Training metrics
 * @returns {number|null} Convergence round or null if not converged
 */
const findConvergenceRound = (trainingMetrics) => {
  if (trainingMetrics.length < 10) return null;

  // Simple heuristic: find when loss change is < 1% for 5 consecutive rounds
  const threshold = 0.01;
  const windowSize = 5;

  for (let i = windowSize; i < trainingMetrics.length; i++) {
    const window = trainingMetrics.slice(i - windowSize, i);
    const losses = window.map(m => m.loss).filter(l => typeof l === 'number');
    
    if (losses.length < windowSize) continue;

    const avgLoss = losses.reduce((sum, l) => sum + l, 0) / losses.length;
    const maxChange = Math.max(...losses.map(l => Math.abs((l - avgLoss) / avgLoss)));

    if (maxChange < threshold) {
      return trainingMetrics[i - 1].round;
    }
  }

  return null;
};

/**
 * Export summary report in multiple formats (JSON, CSV)
 * 
 * @param {Object} experiment - Experiment object
 * @param {string} format - Export format ('json' or 'csv')
 * @returns {void}
 */
export const exportSummaryReport = (experiment, format = 'json') => {
  const report = generateSummaryReport(experiment);
  const filename = `experiment-${experiment.id || 'report'}-summary`;

  if (format === 'json') {
    exportAsJSON(report, filename);
  } else if (format === 'csv') {
    // Flatten the report for CSV export
    const flatReport = flattenObject(report);
    exportMetricsAsCSV([flatReport], filename);
  } else {
    throw new Error(`Unsupported export format: ${format}`);
  }
};

/**
 * Flatten nested object for CSV export
 * 
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Prefix for nested keys
 * @returns {Object} Flattened object
 */
const flattenObject = (obj, prefix = '') => {
  const flattened = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      flattened[newKey] = JSON.stringify(value);
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
};

/**
 * Export anomaly detection results with timestamps
 * 
 * @param {Array<Object>} anomalies - Array of anomaly detection results
 * @param {string} experimentId - Experiment ID
 * @returns {void}
 */
export const exportAnomalyDetectionResults = (anomalies, experimentId) => {
  const filename = `experiment-${experimentId}-anomalies`;
  exportAnomalyResults(anomalies, filename);
};

/**
 * Export comparison table in LaTeX format
 * 
 * @param {Array<Object>} experiments - Array of experiments to compare
 * @param {Array<string>} metrics - Metrics to include in comparison
 * @param {string} caption - Table caption
 * @param {string} label - Table label for LaTeX referencing
 * @returns {void}
 */
export const exportExperimentComparisonLaTeX = (
  experiments,
  metrics = ['f1Score', 'precision', 'recall', 'rocAuc'],
  caption = 'Experiment Comparison',
  label = 'tab:experiment_comparison'
) => {
  if (!experiments || experiments.length === 0) {
    throw new Error('No experiments provided for comparison');
  }

  // Prepare data for LaTeX table
  const columns = ['Experiment', ...metrics];
  const data = experiments.map(exp => {
    const row = {
      Experiment: exp.name || exp.id,
    };

    metrics.forEach(metric => {
      const value = exp.evaluationMetrics?.[metric];
      row[metric] = typeof value === 'number' ? value : null;
    });

    return row;
  });

  // Generate LaTeX table
  const latexTable = exportComparisonTableLaTeX(data, columns, caption, label);
  
  // Download the LaTeX file
  downloadLaTeXTable(latexTable, 'experiment-comparison');
};

/**
 * Batch export multiple experiments as ZIP archive
 * 
 * @param {Array<Object>} experiments - Array of experiments to export
 * @param {string} zipFilename - Name of ZIP file
 * @returns {Promise<void>}
 */
export const batchExportExperiments = async (experiments, zipFilename = 'experiments-export') => {
  if (!experiments || experiments.length === 0) {
    throw new Error('No experiments provided for batch export');
  }

  const files = [];

  // Export each experiment as JSON
  for (const experiment of experiments) {
    const report = generateSummaryReport(experiment);
    const filename = `experiment-${experiment.id || experiment.name}-summary.json`;
    const content = JSON.stringify(report, null, 2);
    files.push({ filename, content });

    // Export training metrics as CSV
    if (experiment.trainingMetrics && experiment.trainingMetrics.length > 0) {
      const csvFilename = `experiment-${experiment.id}-training-metrics.csv`;
      const csvContent = convertToCSV(experiment.trainingMetrics);
      files.push({ filename: csvFilename, content: csvContent });
    }

    // Export anomaly results if available
    if (experiment.anomalyResults && experiment.anomalyResults.length > 0) {
      const anomalyFilename = `experiment-${experiment.id}-anomalies.csv`;
      const anomalyContent = convertToCSV(experiment.anomalyResults);
      files.push({ filename: anomalyFilename, content: anomalyContent });
    }
  }

  // Create ZIP archive
  await createZipArchive(files, `${zipFilename}.zip`);
};

/**
 * Convert array of objects to CSV string
 * 
 * @param {Array<Object>} data - Array of objects
 * @returns {string} CSV string
 */
const convertToCSV = (data) => {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
};

/**
 * Request PDF report generation from API
 * 
 * @param {string} experimentId - Experiment ID
 * @param {Function} apiClient - Axios client instance
 * @returns {Promise<Blob>} PDF blob
 */
export const generatePDFReport = async (experimentId, apiClient) => {
  try {
    const response = await apiClient.get(`/experiments/${experimentId}/report`, {
      responseType: 'blob',
    });

    // Create blob URL and trigger download
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiment-${experimentId}-report.pdf`;
    link.click();
    URL.revokeObjectURL(url);

    return blob;
  } catch (error) {
    console.error('Failed to generate PDF report:', error);
    throw error;
  }
};

/**
 * Export all experiment data and visualizations as ZIP
 * 
 * @param {Object} experiment - Experiment object
 * @param {Object} chartRefs - Object containing refs to all chart instances
 * @param {Function} apiClient - Axios client instance
 * @returns {Promise<void>}
 */
export const exportFullExperimentPackage = async (experiment, chartRefs, apiClient) => {
  const files = [];

  // 1. Summary report (JSON)
  const report = generateSummaryReport(experiment);
  files.push({
    filename: `summary.json`,
    content: JSON.stringify(report, null, 2),
  });

  // 2. Configuration (YAML and JSON)
  if (experiment.config) {
    files.push({
      filename: 'config.json',
      content: JSON.stringify(experiment.config, null, 2),
    });
  }

  // 3. Training metrics (CSV)
  if (experiment.trainingMetrics && experiment.trainingMetrics.length > 0) {
    files.push({
      filename: 'training-metrics.csv',
      content: convertToCSV(experiment.trainingMetrics),
    });
  }

  // 4. Privacy metrics (CSV)
  if (experiment.privacyMetrics && experiment.privacyMetrics.length > 0) {
    files.push({
      filename: 'privacy-metrics.csv',
      content: convertToCSV(experiment.privacyMetrics),
    });
  }

  // 5. Communication metrics (CSV)
  if (experiment.communicationMetrics && experiment.communicationMetrics.length > 0) {
    files.push({
      filename: 'communication-metrics.csv',
      content: convertToCSV(experiment.communicationMetrics),
    });
  }

  // 6. Anomaly results (CSV)
  if (experiment.anomalyResults && experiment.anomalyResults.length > 0) {
    files.push({
      filename: 'anomaly-results.csv',
      content: convertToCSV(experiment.anomalyResults),
    });
  }

  // 7. Export charts as PNG (if refs provided)
  if (chartRefs) {
    for (const [chartName, chartRef] of Object.entries(chartRefs)) {
      if (chartRef && chartRef.current) {
        try {
          const canvas = chartRef.current.canvas;
          const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/png');
          });
          files.push({
            filename: `charts/${chartName}.png`,
            content: blob,
          });
        } catch (error) {
          console.error(`Failed to export chart ${chartName}:`, error);
        }
      }
    }
  }

  // Create ZIP archive
  await createZipArchive(files, `experiment-${experiment.id}-complete.zip`);
};

