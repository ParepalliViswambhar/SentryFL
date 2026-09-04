/**
 * ReportGeneration Component Tests
 * 
 * Tests for report generation functionality:
 * - Summary report generation
 * - PDF report generation
 * - Anomaly results export
 * - Full package export
 * 
 * Requirements: 39.5, 39.7, 39.8, 39.10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportGeneration from './ReportGeneration';
import * as reportUtils from '../utils/reportUtils';
import apiClient from '../api/client';

// Mock the report utilities
vi.mock('../utils/reportUtils', () => ({
  generateSummaryReport: vi.fn(),
  exportSummaryReport: vi.fn(),
  exportAnomalyDetectionResults: vi.fn(),
  exportExperimentComparisonLaTeX: vi.fn(),
  generatePDFReport: vi.fn(),
  exportFullExperimentPackage: vi.fn(),
}));

// Mock API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('ReportGeneration', () => {
  const mockExperiment = {
    id: 'exp-123',
    name: 'Test Experiment',
    config: {
      model: 'test-model',
      privacy: { epsilon: 1.0, delta: 1e-5 },
    },
    trainingMetrics: [
      { round: 1, loss: 0.5, accuracy: 0.8 },
      { round: 2, loss: 0.4, accuracy: 0.85 },
    ],
    privacyMetrics: [
      { round: 1, epsilon: 0.5, delta: 1e-5 },
      { round: 2, epsilon: 1.0, delta: 1e-5 },
    ],
    communicationMetrics: [
      { round: 1, bytesSent: 1000, bytesReceived: 1000 },
      { round: 2, bytesSent: 1000, bytesReceived: 1000 },
    ],
    evaluationMetrics: {
      f1Score: 0.92,
      precision: 0.90,
      recall: 0.94,
      rocAuc: 0.95,
      prAuc: 0.93,
    },
    anomalyResults: [
      { timestamp: '2024-01-01T00:00:00Z', score: 0.8, predicted: 1, actual: 1 },
      { timestamp: '2024-01-01T00:01:00Z', score: 0.9, predicted: 1, actual: 1 },
    ],
    status: 'completed',
    createdAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T01:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render report generation component', () => {
      render(<ReportGeneration experiment={mockExperiment} />);

      expect(screen.getByText('Report Generation')).toBeInTheDocument();
      expect(screen.getByText('Summary Reports')).toBeInTheDocument();
      expect(screen.getByText('PDF Report')).toBeInTheDocument();
      expect(screen.getByText('Anomaly Detection Results')).toBeInTheDocument();
      expect(screen.getByText('Complete Export Package')).toBeInTheDocument();
    });

    it('should display anomaly count', () => {
      render(<ReportGeneration experiment={mockExperiment} />);

      expect(screen.getByText('2 anomalies detected')).toBeInTheDocument();
    });

    it('should show comparison export when enabled', () => {
      const comparisonExperiments = [mockExperiment, { ...mockExperiment, id: 'exp-456' }];

      render(
        <ReportGeneration
          experiment={mockExperiment}
          comparisonExperiments={comparisonExperiments}
          showComparisonExport={true}
        />
      );

      expect(screen.getByText('LaTeX Comparison Table')).toBeInTheDocument();
      expect(screen.getByText('Comparing 2 experiments')).toBeInTheDocument();
    });
  });

  describe('Summary Report Export', () => {
    it('should export summary as JSON', async () => {
      const user = userEvent.setup();
      reportUtils.exportSummaryReport.mockImplementation(() => {});

      render(<ReportGeneration experiment={mockExperiment} />);

      const jsonButton = screen.getByRole('button', { name: /JSON/i });
      await user.click(jsonButton);

      await waitFor(() => {
        expect(reportUtils.exportSummaryReport).toHaveBeenCalledWith(mockExperiment, 'json');
      });

      expect(screen.getByText(/Summary report exported as JSON/i)).toBeInTheDocument();
    });

    it('should export summary as CSV', async () => {
      const user = userEvent.setup();
      reportUtils.exportSummaryReport.mockImplementation(() => {});

      render(<ReportGeneration experiment={mockExperiment} />);

      // Get the CSV button specifically from the Summary Reports section
      const csvButton = screen.getByRole('button', { name: /Export summary as CSV/i });
      await user.click(csvButton);

      await waitFor(() => {
        expect(reportUtils.exportSummaryReport).toHaveBeenCalledWith(mockExperiment, 'csv');
      });

      expect(screen.getByText(/Summary report exported as CSV/i)).toBeInTheDocument();
    });

    it('should handle export error', async () => {
      const user = userEvent.setup();
      reportUtils.exportSummaryReport.mockImplementation(() => {
        throw new Error('Export failed');
      });

      render(<ReportGeneration experiment={mockExperiment} />);

      const jsonButton = screen.getByRole('button', { name: /JSON/i });
      await user.click(jsonButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to export summary: Export failed/i)).toBeInTheDocument();
      });
    });

    it('should disable export when no experiment', () => {
      render(<ReportGeneration experiment={null} />);

      const jsonButton = screen.getByRole('button', { name: /Export summary as JSON/i });
      const csvButton = screen.getByRole('button', { name: /Export summary as CSV/i });

      expect(jsonButton).toBeDisabled();
      expect(csvButton).toBeDisabled();
    });
  });

  describe('PDF Report Generation', () => {
    it('should generate PDF report', async () => {
      const user = userEvent.setup();
      reportUtils.generatePDFReport.mockResolvedValue(new Blob());

      render(<ReportGeneration experiment={mockExperiment} />);

      const pdfButton = screen.getByRole('button', { name: /Generate PDF Report/i });
      await user.click(pdfButton);

      await waitFor(() => {
        expect(reportUtils.generatePDFReport).toHaveBeenCalledWith('exp-123', apiClient);
      });

      expect(screen.getByText('PDF report generated successfully')).toBeInTheDocument();
    });

    it('should handle PDF generation error', async () => {
      const user = userEvent.setup();
      reportUtils.generatePDFReport.mockRejectedValue(new Error('PDF generation failed'));

      render(<ReportGeneration experiment={mockExperiment} />);

      const pdfButton = screen.getByRole('button', { name: /Generate PDF Report/i });
      await user.click(pdfButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to generate PDF/i)).toBeInTheDocument();
      });
    });

    it('should disable PDF generation when no experiment ID', () => {
      const experimentWithoutId = { ...mockExperiment, id: null };
      render(<ReportGeneration experiment={experimentWithoutId} />);

      const pdfButton = screen.getByRole('button', { name: /Generate PDF Report/i });
      expect(pdfButton).toBeDisabled();
    });
  });

  describe('Anomaly Results Export', () => {
    it('should export anomaly results', async () => {
      const user = userEvent.setup();
      reportUtils.exportAnomalyDetectionResults.mockImplementation(() => {});

      render(<ReportGeneration experiment={mockExperiment} />);

      const exportButton = screen.getByRole('button', { name: /Export Anomaly Results/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(reportUtils.exportAnomalyDetectionResults).toHaveBeenCalledWith(
          mockExperiment.anomalyResults,
          mockExperiment.id
        );
      });

      expect(screen.getByText('Anomaly results exported successfully')).toBeInTheDocument();
    });

    it('should disable export when no anomalies', () => {
      const experimentWithoutAnomalies = { ...mockExperiment, anomalyResults: [] };
      render(<ReportGeneration experiment={experimentWithoutAnomalies} />);

      const exportButton = screen.getByRole('button', { name: /Export Anomaly Results/i });
      expect(exportButton).toBeDisabled();
    });

    it('should handle export error', async () => {
      const user = userEvent.setup();
      reportUtils.exportAnomalyDetectionResults.mockImplementation(() => {
        throw new Error('Export failed');
      });

      render(<ReportGeneration experiment={mockExperiment} />);

      const exportButton = screen.getByRole('button', { name: /Export Anomaly Results/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to export anomalies/i)).toBeInTheDocument();
      });
    });
  });

  describe('Full Package Export', () => {
    it('should export full package', async () => {
      const user = userEvent.setup();
      reportUtils.exportFullExperimentPackage.mockResolvedValue(undefined);

      render(<ReportGeneration experiment={mockExperiment} />);

      const exportButton = screen.getByRole('button', { name: /Export Full Package/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(reportUtils.exportFullExperimentPackage).toHaveBeenCalledWith(
          mockExperiment,
          null,
          apiClient
        );
      });

      expect(screen.getByText('Full experiment package exported as ZIP')).toBeInTheDocument();
    });

    it('should export with chart refs', async () => {
      const user = userEvent.setup();
      const chartRefs = {
        lossChart: { current: { canvas: {} } },
        accuracyChart: { current: { canvas: {} } },
      };
      reportUtils.exportFullExperimentPackage.mockResolvedValue(undefined);

      render(<ReportGeneration experiment={mockExperiment} chartRefs={chartRefs} />);

      const exportButton = screen.getByRole('button', { name: /Export Full Package/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(reportUtils.exportFullExperimentPackage).toHaveBeenCalledWith(
          mockExperiment,
          chartRefs,
          apiClient
        );
      });
    });

    it('should handle export error', async () => {
      const user = userEvent.setup();
      reportUtils.exportFullExperimentPackage.mockRejectedValue(new Error('Export failed'));

      render(<ReportGeneration experiment={mockExperiment} />);

      const exportButton = screen.getByRole('button', { name: /Export Full Package/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to export package/i)).toBeInTheDocument();
      });
    });
  });

  describe('LaTeX Comparison Export', () => {
    it('should export comparison table', async () => {
      const user = userEvent.setup();
      const comparisonExperiments = [mockExperiment, { ...mockExperiment, id: 'exp-456' }];
      reportUtils.exportExperimentComparisonLaTeX.mockImplementation(() => {});

      render(
        <ReportGeneration
          experiment={mockExperiment}
          comparisonExperiments={comparisonExperiments}
          showComparisonExport={true}
        />
      );

      const exportButton = screen.getByRole('button', { name: /Export LaTeX Table/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(reportUtils.exportExperimentComparisonLaTeX).toHaveBeenCalledWith(
          comparisonExperiments,
          ['f1Score', 'precision', 'recall', 'rocAuc', 'prAuc'],
          'Experiment Performance Comparison',
          'tab:experiment_comparison'
        );
      });

      expect(screen.getByText('Comparison table exported as LaTeX')).toBeInTheDocument();
    });

    it('should handle export error', async () => {
      const user = userEvent.setup();
      const comparisonExperiments = [mockExperiment];
      reportUtils.exportExperimentComparisonLaTeX.mockImplementation(() => {
        throw new Error('Export failed');
      });

      render(
        <ReportGeneration
          experiment={mockExperiment}
          comparisonExperiments={comparisonExperiments}
          showComparisonExport={true}
        />
      );

      const exportButton = screen.getByRole('button', { name: /Export LaTeX Table/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to export comparison/i)).toBeInTheDocument();
      });
    });
  });

  describe('Alert Handling', () => {
    it('should show and dismiss success message', async () => {
      const user = userEvent.setup();
      reportUtils.exportSummaryReport.mockImplementation(() => {});

      render(<ReportGeneration experiment={mockExperiment} />);

      const jsonButton = screen.getByRole('button', { name: /JSON/i });
      await user.click(jsonButton);

      await waitFor(() => {
        expect(screen.getByText(/Summary report exported as JSON/i)).toBeInTheDocument();
      });

      // Success message should auto-dismiss after 3 seconds
      await waitFor(
        () => {
          expect(screen.queryByText(/Summary report exported as JSON/i)).not.toBeInTheDocument();
        },
        { timeout: 4000 }
      );
    });

    it('should allow manual dismissal of error', async () => {
      const user = userEvent.setup();
      reportUtils.exportSummaryReport.mockImplementation(() => {
        throw new Error('Export failed');
      });

      render(<ReportGeneration experiment={mockExperiment} />);

      const jsonButton = screen.getByRole('button', { name: /JSON/i });
      await user.click(jsonButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to export summary/i)).toBeInTheDocument();
      });

      // Find and click close button on alert
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(screen.queryByText(/Failed to export summary/i)).not.toBeInTheDocument();
    });
  });
});

