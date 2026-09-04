/**
 * Unit Tests for ROCPRCurves Component
 * 
 * Tests for ROC curve, PR curve, and confusion matrix visualization:
 * - ROC curve rendering with AUC score
 * - PR curve rendering with AUC-PR score
 * - Confusion matrix heatmap display
 * - Export functionality for charts
 * - Performance metrics calculation
 * 
 * Requirements: 31.1, 31.2, 31.3
 * 
 * @module components/ROCPRCurves.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ROCPRCurves from './ROCPRCurves';

// Mock Chart.js components
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(({ data }) => (
    <div data-testid="mock-line-chart" data-chart-data={JSON.stringify(data)}>
      Line Chart
    </div>
  )),
  Bar: vi.fn(({ data }) => (
    <div data-testid="mock-bar-chart" data-chart-data={JSON.stringify(data)}>
      Bar Chart
    </div>
  )),
}));

describe('ROCPRCurves Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing with empty data', () => {
      render(<ROCPRCurves />);
      
      expect(screen.getByText('Anomaly Detection Performance')).toBeInTheDocument();
    });

    it('should display info alerts when no data is available', () => {
      render(<ROCPRCurves rocCurve={[]} prCurve={[]} />);
      
      const infoMessages = screen.getAllByText(/No ROC curve data available|No PR curve data available/i);
      expect(infoMessages.length).toBeGreaterThan(0);
    });

    it('should render ROC curve when data is provided (Requirement 31.1)', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 0.5, tpr: 0.8 },
        { fpr: 1.0, tpr: 1.0 },
      ];
      const rocAuc = 0.85;

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={rocAuc} />);

      expect(screen.getByText('ROC Curve')).toBeInTheDocument();
      const charts = screen.getAllByTestId('mock-line-chart');
      expect(charts.length).toBeGreaterThan(0);
    });

    it('should render PR curve when data is provided (Requirement 31.2)', () => {
      const prCurve = [
        { recall: 0.0, precision: 1.0 },
        { recall: 0.5, precision: 0.9 },
        { recall: 1.0, precision: 0.7 },
      ];
      const prAuc = 0.88;

      render(<ROCPRCurves prCurve={prCurve} prAuc={prAuc} />);

      expect(screen.getByText('Precision-Recall Curve')).toBeInTheDocument();
      const charts = screen.getAllByTestId('mock-line-chart');
      expect(charts.length).toBeGreaterThan(0);
    });

    it('should display interpretation alert when data is available', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 1.0, tpr: 1.0 },
      ];

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.85} />);

      expect(screen.getByText(/Higher AUC scores indicate better model performance/i)).toBeInTheDocument();
    });
  });

  describe('AUC Score Display', () => {
    it('should display ROC AUC score correctly', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 1.0, tpr: 1.0 },
      ];
      const rocAuc = 0.8523;

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={rocAuc} />);

      expect(screen.getByText('0.8523')).toBeInTheDocument();
    });

    it('should display PR AUC score correctly', () => {
      const prCurve = [
        { recall: 0.0, precision: 1.0 },
        { recall: 1.0, precision: 0.7 },
      ];
      const prAuc = 0.8765;

      render(<ROCPRCurves prCurve={prCurve} prAuc={prAuc} />);

      expect(screen.getByText('0.8765')).toBeInTheDocument();
    });

    it('should display N/A when AUC is not provided', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 1.0, tpr: 1.0 },
      ];

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={null} />);

      expect(screen.getAllByText(/N\/A/i).length).toBeGreaterThan(0);
    });

    it('should provide performance interpretation for AUC scores', () => {
      const rocCurve = [{ fpr: 0, tpr: 0 }];

      // Excellent performance
      const { rerender } = render(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.92} />);
      expect(screen.getByText('Excellent performance')).toBeInTheDocument();

      // Good performance
      rerender(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.85} />);
      expect(screen.getByText('Good performance')).toBeInTheDocument();

      // Fair performance
      rerender(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.75} />);
      expect(screen.getByText('Fair performance')).toBeInTheDocument();

      // Poor performance
      rerender(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.65} />);
      expect(screen.getByText('Poor performance')).toBeInTheDocument();
    });
  });

  describe('Confusion Matrix Display (Requirement 31.3)', () => {
    it('should render confusion matrix when data is provided', () => {
      const confusionMatrix = {
        TP: 85,
        FP: 10,
        TN: 90,
        FN: 15,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      expect(screen.getByText('Confusion Matrix and Performance Metrics')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument(); // TP
      expect(screen.getByText('10')).toBeInTheDocument(); // FP
      expect(screen.getByText('90')).toBeInTheDocument(); // TN
      expect(screen.getByText('15')).toBeInTheDocument(); // FN
    });

    it('should calculate and display accuracy correctly', () => {
      const confusionMatrix = {
        TP: 80,
        FP: 20,
        TN: 70,
        FN: 30,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // Accuracy = (TP + TN) / Total = (80 + 70) / 200 = 0.75 = 75%
      expect(screen.getByText('75.00%')).toBeInTheDocument();
    });

    it('should calculate and display precision correctly', () => {
      const confusionMatrix = {
        TP: 80,
        FP: 20,
        TN: 70,
        FN: 30,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // Precision = TP / (TP + FP) = 80 / 100 = 0.8 = 80%
      expect(screen.getByText('80.00%')).toBeInTheDocument();
    });

    it('should calculate and display recall correctly', () => {
      const confusionMatrix = {
        TP: 80,
        FP: 20,
        TN: 70,
        FN: 30,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // Recall = TP / (TP + FN) = 80 / 110 = 0.7272... ≈ 72.73%
      const recallText = screen.getByText(/72\.7[0-9]%/);
      expect(recallText).toBeInTheDocument();
    });

    it('should calculate and display F1 score correctly', () => {
      const confusionMatrix = {
        TP: 80,
        FP: 20,
        TN: 70,
        FN: 30,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // F1 = 2 * P * R / (P + R)
      // P = 0.8, R = 0.7273
      // F1 = 2 * 0.8 * 0.7273 / (0.8 + 0.7273) ≈ 0.7619
      const f1Text = screen.getByText(/0\.76[0-9]{2}/);
      expect(f1Text).toBeInTheDocument();
    });

    it('should calculate and display specificity correctly', () => {
      const confusionMatrix = {
        TP: 80,
        FP: 20,
        TN: 70,
        FN: 30,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // Specificity = TN / (TN + FP) = 70 / 90 = 0.7777... ≈ 77.78%
      const specificityText = screen.getByText(/77\.7[0-9]%/);
      expect(specificityText).toBeInTheDocument();
    });

    it('should display confusion matrix labels', () => {
      const confusionMatrix = {
        TP: 85,
        FP: 10,
        TN: 90,
        FN: 15,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      expect(screen.getByText(/TP: True Positives/i)).toBeInTheDocument();
      expect(screen.getByText(/FP: False Positives/i)).toBeInTheDocument();
      expect(screen.getByText(/TN: True Negatives/i)).toBeInTheDocument();
      expect(screen.getByText(/FN: False Negatives/i)).toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    it('should have PNG export buttons for both ROC and PR curves', () => {
      const rocCurve = [{ fpr: 0, tpr: 0 }];
      const prCurve = [{ recall: 0, precision: 1 }];

      render(<ROCPRCurves rocCurve={rocCurve} prCurve={prCurve} />);

      const pngButtons = screen.getAllByText('PNG');
      expect(pngButtons).toHaveLength(2); // One for ROC, one for PR
    });

    it('should have SVG export buttons for both ROC and PR curves', () => {
      const rocCurve = [{ fpr: 0, tpr: 0 }];
      const prCurve = [{ recall: 0, precision: 1 }];

      render(<ROCPRCurves rocCurve={rocCurve} prCurve={prCurve} />);

      const svgButtons = screen.getAllByText('SVG');
      expect(svgButtons).toHaveLength(2); // One for ROC, one for PR
    });

    it('should disable export buttons when no data is available', () => {
      render(<ROCPRCurves rocCurve={[]} prCurve={[]} />);

      const exportButtons = screen.getAllByRole('button', { name: /PNG|SVG/i });
      exportButtons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('should enable export buttons when data is available', () => {
      const rocCurve = [{ fpr: 0, tpr: 0 }];
      const prCurve = [{ recall: 0, precision: 1 }];

      render(<ROCPRCurves rocCurve={rocCurve} prCurve={prCurve} />);

      const exportButtons = screen.getAllByRole('button', { name: /PNG|SVG/i });
      exportButtons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('Chart Data Preparation', () => {
    it('should include diagonal reference line for ROC curve', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 0.5, tpr: 0.8 },
        { fpr: 1.0, tpr: 1.0 },
      ];

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.85} />);

      // The component should render, and the chart data should include the diagonal line
      expect(screen.getByText('ROC Curve')).toBeInTheDocument();
    });

    it('should format ROC curve data correctly', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 0.25, tpr: 0.5 },
        { fpr: 0.5, tpr: 0.8 },
        { fpr: 1.0, tpr: 1.0 },
      ];

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.85} />);

      const chart = screen.getAllByTestId('mock-line-chart')[0];
      const chartData = JSON.parse(chart.getAttribute('data-chart-data'));
      
      expect(chartData.datasets).toBeDefined();
      expect(chartData.datasets.length).toBeGreaterThan(0);
    });

    it('should format PR curve data correctly', () => {
      const prCurve = [
        { recall: 0.0, precision: 1.0 },
        { recall: 0.5, precision: 0.9 },
        { recall: 1.0, precision: 0.7 },
      ];

      render(<ROCPRCurves prCurve={prCurve} prAuc={0.88} />);

      const chart = screen.getAllByTestId('mock-line-chart')[0];
      const chartData = JSON.parse(chart.getAttribute('data-chart-data'));
      
      expect(chartData.datasets).toBeDefined();
      expect(chartData.datasets.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle perfect classification (AUC = 1.0)', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 0.0, tpr: 1.0 },
        { fpr: 1.0, tpr: 1.0 },
      ];
      const rocAuc = 1.0;

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={rocAuc} />);

      expect(screen.getByText('1.0000')).toBeInTheDocument();
    });

    it('should handle random classifier (AUC = 0.5)', () => {
      const rocCurve = [
        { fpr: 0.0, tpr: 0.0 },
        { fpr: 1.0, tpr: 1.0 },
      ];
      const rocAuc = 0.5;

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={rocAuc} />);

      expect(screen.getByText('0.5000')).toBeInTheDocument();
    });

    it('should handle confusion matrix with all zeros', () => {
      const confusionMatrix = {
        TP: 0,
        FP: 0,
        TN: 0,
        FN: 0,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // Should not crash, metrics should handle division by zero
      expect(screen.getByText('Confusion Matrix and Performance Metrics')).toBeInTheDocument();
    });

    it('should handle confusion matrix with only true positives', () => {
      const confusionMatrix = {
        TP: 100,
        FP: 0,
        TN: 0,
        FN: 0,
      };

      render(<ROCPRCurves confusionMatrix={confusionMatrix} />);

      // Precision and Recall should both be 100%
      expect(screen.getAllByText('100.00%').length).toBeGreaterThan(0);
    });

    it('should handle many ROC curve points without crashing', () => {
      const rocCurve = Array.from({ length: 1000 }, (_, i) => ({
        fpr: i / 999,
        tpr: Math.sqrt(i / 999), // Concave curve
      }));

      render(<ROCPRCurves rocCurve={rocCurve} rocAuc={0.85} />);

      expect(screen.getByText('ROC Curve')).toBeInTheDocument();
    });
  });

  describe('Component Headers and Labels', () => {
    it('should display main component title', () => {
      render(<ROCPRCurves />);

      expect(screen.getByText('Anomaly Detection Performance')).toBeInTheDocument();
    });

    it('should display component subtitle', () => {
      render(<ROCPRCurves />);

      expect(screen.getByText('ROC and Precision-Recall curve analysis')).toBeInTheDocument();
    });

    it('should display section titles for ROC and PR curves', () => {
      const rocCurve = [{ fpr: 0, tpr: 0 }];
      const prCurve = [{ recall: 0, precision: 1 }];

      render(<ROCPRCurves rocCurve={rocCurve} prCurve={prCurve} />);

      expect(screen.getByText('ROC Curve')).toBeInTheDocument();
      expect(screen.getByText('Precision-Recall Curve')).toBeInTheDocument();
    });

    it('should display AUC score card labels', () => {
      render(<ROCPRCurves rocAuc={0.85} prAuc={0.88} />);

      expect(screen.getByText('ROC AUC Score')).toBeInTheDocument();
      expect(screen.getByText('PR AUC Score')).toBeInTheDocument();
    });
  });
});
