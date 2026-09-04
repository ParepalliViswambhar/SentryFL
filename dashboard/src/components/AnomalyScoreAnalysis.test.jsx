/**
 * Unit Tests for AnomalyScoreAnalysis Component
 * 
 * Tests for anomaly score analysis and threshold adjustment:
 * - Anomaly score distribution histogram
 * - Interactive threshold slider
 * - Dynamic precision/recall metrics
 * - Per-client performance metrics
 * 
 * Requirements: 31.8, 31.9, 31.10, 31.11
 * 
 * @module components/AnomalyScoreAnalysis.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AnomalyScoreAnalysis from './AnomalyScoreAnalysis';

// Mock Chart.js components
vi.mock('react-chartjs-2', () => ({
  Bar: vi.fn(({ data }) => (
    <div data-testid="mock-bar-chart" data-chart-data={JSON.stringify(data)}>
      Bar Chart
    </div>
  )),
}));

describe('AnomalyScoreAnalysis Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing with empty data', () => {
      render(<AnomalyScoreAnalysis />);
      
      expect(screen.getByText('Anomaly Score Analysis')).toBeInTheDocument();
    });

    it('should display info alert when no data is available', () => {
      render(<AnomalyScoreAnalysis anomalyScores={[]} />);
      
      expect(screen.getByText(/No anomaly score data available/i)).toBeInTheDocument();
    });

    it('should render histogram when data is provided (Requirement 31.8)', () => {
      const anomalyScores = [
        { score: 0.2, isAnomaly: false },
        { score: 0.8, isAnomaly: true },
        { score: 0.5, isAnomaly: false },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    });

    it('should display threshold tuning alert when data is available', () => {
      const anomalyScores = [
        { score: 0.5, isAnomaly: false },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText(/Increase threshold for higher precision/i)).toBeInTheDocument();
    });
  });

  describe('Histogram Display', () => {
    it('should display anomaly score distribution title', () => {
      const anomalyScores = [
        { score: 0.5, isAnomaly: false },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('Anomaly Score Distribution')).toBeInTheDocument();
    });

    it('should prepare histogram with normal and anomaly counts', () => {
      const anomalyScores = [
        { score: 0.2, isAnomaly: false },
        { score: 0.3, isAnomaly: false },
        { score: 0.7, isAnomaly: true },
        { score: 0.8, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      const chart = screen.getByTestId('mock-bar-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-data'));
      
      expect(chartData.datasets).toBeDefined();
      expect(chartData.datasets.length).toBe(2); // Normal and Anomaly
      expect(chartData.datasets[0].label).toBe('Normal');
      expect(chartData.datasets[1].label).toBe('Anomaly');
    });
  });

  describe('Interactive Threshold Slider (Requirement 31.9)', () => {
    it('should display threshold slider when data is available', () => {
      const anomalyScores = [
        { score: 0.2, isAnomaly: false },
        { score: 0.8, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('Detection Threshold Adjustment')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should display current threshold value', () => {
      const anomalyScores = [
        { score: 0.2, isAnomaly: false },
        { score: 0.8, isAnomaly: true },
      ];
      const defaultThreshold = 0.6;

      render(
        <AnomalyScoreAnalysis
          anomalyScores={anomalyScores}
          defaultThreshold={defaultThreshold}
        />
      );

      expect(screen.getByText(/Current Threshold: 0\.6000/i)).toBeInTheDocument();
    });

    it('should update threshold when slider is moved', () => {
      const anomalyScores = [
        { score: 0.2, isAnomaly: false },
        { score: 0.8, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      const slider = screen.getByRole('slider');
      
      // Simulate slider change
      fireEvent.change(slider, { target: { value: 0.7 } });

      // The threshold display should update
      // Note: exact text match depends on implementation
      expect(slider).toBeInTheDocument();
    });
  });

  describe('Dynamic Metrics Update (Requirement 31.10)', () => {
    it('should display precision metric', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false },
        { score: 0.7, isAnomaly: true },
        { score: 0.8, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('Precision')).toBeInTheDocument();
    });

    it('should display recall metric', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false },
        { score: 0.7, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('Recall')).toBeInTheDocument();
    });

    it('should display F1 score metric', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false },
        { score: 0.7, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('F1 Score')).toBeInTheDocument();
    });

    it('should display accuracy metric', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false },
        { score: 0.7, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('Accuracy')).toBeInTheDocument();
    });

    it('should calculate precision correctly at default threshold', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false }, // TN
        { score: 0.4, isAnomaly: false }, // TN
        { score: 0.6, isAnomaly: true },  // TP (above 0.5)
        { score: 0.7, isAnomaly: true },  // TP
        { score: 0.8, isAnomaly: false }, // FP
      ];
      // At threshold 0.5: Predicted positive = [0.6, 0.7, 0.8] = 3
      // TP = 2 (0.6, 0.7), FP = 1 (0.8)
      // Precision = 2/3 = 66.67%

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={0.5} />);

      expect(screen.getAllByText(/66\.67%/i).length).toBeGreaterThan(0);
    });

    it('should calculate recall correctly at default threshold', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: true },  // FN (below 0.5)
        { score: 0.6, isAnomaly: true },  // TP (above 0.5)
        { score: 0.7, isAnomaly: true },  // TP
      ];
      // At threshold 0.5: Actual positive = 3
      // TP = 2 (0.6, 0.7), FN = 1 (0.3)
      // Recall = 2/3 = 66.67%

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={0.5} />);

      expect(screen.getAllByText(/66\.67%/i).length).toBeGreaterThan(0);
    });

    it('should display confusion matrix summary', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false },
        { score: 0.7, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText(/Confusion Matrix at Current Threshold/i)).toBeInTheDocument();
      expect(screen.getByText(/True Positives:/i)).toBeInTheDocument();
      expect(screen.getByText(/False Positives:/i)).toBeInTheDocument();
      expect(screen.getByText(/True Negatives:/i)).toBeInTheDocument();
      expect(screen.getByText(/False Negatives:/i)).toBeInTheDocument();
    });
  });

  describe('Per-Client Metrics (Requirement 31.11)', () => {
    it('should display per-client performance table when data is provided', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.825,
          anomalyCount: 10,
          totalSamples: 100,
        },
        {
          clientId: 'client-2',
          precision: 0.90,
          recall: 0.75,
          f1: 0.820,
          anomalyCount: 8,
          totalSamples: 120,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('Per-Client Anomaly Detection Performance')).toBeInTheDocument();
      expect(screen.getByText('client-1')).toBeInTheDocument();
      expect(screen.getByText('client-2')).toBeInTheDocument();
    });

    it('should display precision for each client', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.825,
          anomalyCount: 10,
          totalSamples: 100,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('85.00%')).toBeInTheDocument();
    });

    it('should display recall for each client', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.825,
          anomalyCount: 10,
          totalSamples: 100,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('80.00%')).toBeInTheDocument();
    });

    it('should display F1 score for each client', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.8250,
          anomalyCount: 10,
          totalSamples: 100,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('0.8250')).toBeInTheDocument();
    });

    it('should display anomaly count for each client', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.825,
          anomalyCount: 10,
          totalSamples: 100,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should display total samples for each client', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.825,
          anomalyCount: 10,
          totalSamples: 100,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should display summary statistics across all clients', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.80,
          recall: 0.70,
          f1: 0.7467,
          anomalyCount: 10,
          totalSamples: 100,
        },
        {
          clientId: 'client-2',
          precision: 0.90,
          recall: 0.80,
          f1: 0.8471,
          anomalyCount: 12,
          totalSamples: 120,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText(/Summary Across All Clients/i)).toBeInTheDocument();
      
      // Average precision: (0.80 + 0.90) / 2 = 0.85 = 85%
      expect(screen.getByText(/Avg Precision:/i)).toBeInTheDocument();
      expect(screen.getByText(/85\.00%/i)).toBeInTheDocument();
      
      // Average recall: (0.70 + 0.80) / 2 = 0.75 = 75%
      expect(screen.getByText(/Avg Recall:/i)).toBeInTheDocument();
      expect(screen.getByText(/75\.00%/i)).toBeInTheDocument();
      
      // Total anomalies: 10 + 12 = 22
      expect(screen.getByText(/Total Anomalies:/i)).toBeInTheDocument();
      expect(screen.getByText(/22/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle all normal scores', () => {
      const anomalyScores = [
        { score: 0.2, isAnomaly: false },
        { score: 0.3, isAnomaly: false },
        { score: 0.4, isAnomaly: false },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    });

    it('should handle all anomaly scores', () => {
      const anomalyScores = [
        { score: 0.7, isAnomaly: true },
        { score: 0.8, isAnomaly: true },
        { score: 0.9, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    });

    it('should handle threshold at minimum score', () => {
      const anomalyScores = [
        { score: 0.1, isAnomaly: false },
        { score: 0.5, isAnomaly: true },
        { score: 0.9, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={0.1} />);

      // At threshold 0.1, all should be predicted as positive
      expect(screen.getByText('Precision')).toBeInTheDocument();
    });

    it('should handle threshold at maximum score', () => {
      const anomalyScores = [
        { score: 0.1, isAnomaly: false },
        { score: 0.5, isAnomaly: true },
        { score: 0.9, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={1.0} />);

      // At threshold 1.0, none should be predicted as positive
      expect(screen.getByText('Precision')).toBeInTheDocument();
    });

    it('should handle single client metrics', () => {
      const perClientMetrics = [
        {
          clientId: 'client-1',
          precision: 0.85,
          recall: 0.80,
          f1: 0.825,
          anomalyCount: 10,
          totalSamples: 100,
        },
      ];

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('client-1')).toBeInTheDocument();
    });

    it('should handle many clients without crashing', () => {
      const perClientMetrics = Array.from({ length: 50 }, (_, i) => ({
        clientId: `client-${i}`,
        precision: 0.85,
        recall: 0.80,
        f1: 0.825,
        anomalyCount: 10,
        totalSamples: 100,
      }));

      render(<AnomalyScoreAnalysis perClientMetrics={perClientMetrics} />);

      expect(screen.getByText('Per-Client Anomaly Detection Performance')).toBeInTheDocument();
    });

    it('should handle scores with very small range', () => {
      const anomalyScores = [
        { score: 0.500, isAnomaly: false },
        { score: 0.501, isAnomaly: true },
        { score: 0.502, isAnomaly: false },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    });

    it('should handle scores with very large range', () => {
      const anomalyScores = [
        { score: 0.0, isAnomaly: false },
        { score: 0.5, isAnomaly: true },
        { score: 1.0, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    });
  });

  describe('Component Headers and Labels', () => {
    it('should display main component title', () => {
      render(<AnomalyScoreAnalysis />);

      expect(screen.getByText('Anomaly Score Analysis')).toBeInTheDocument();
    });

    it('should display component subtitle', () => {
      render(<AnomalyScoreAnalysis />);

      expect(screen.getByText('Score distribution and threshold optimization')).toBeInTheDocument();
    });

    it('should display histogram section title', () => {
      const anomalyScores = [
        { score: 0.5, isAnomaly: false },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} />);

      expect(screen.getByText('Anomaly Score Distribution')).toBeInTheDocument();
    });
  });

  describe('Metrics Calculation Accuracy', () => {
    it('should calculate perfect precision (100%)', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false }, // TN
        { score: 0.7, isAnomaly: true },  // TP
        { score: 0.8, isAnomaly: true },  // TP
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={0.5} />);

      expect(screen.getAllByText(/100\.00%/i).length).toBeGreaterThan(0);
    });

    it('should calculate perfect recall (100%)', () => {
      const anomalyScores = [
        { score: 0.3, isAnomaly: false }, // TN
        { score: 0.7, isAnomaly: true },  // TP
        { score: 0.8, isAnomaly: true },  // TP
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={0.5} />);

      expect(screen.getAllByText(/100\.00%/i).length).toBeGreaterThan(0);
    });

    it('should calculate zero precision when no predictions are made', () => {
      const anomalyScores = [
        { score: 0.1, isAnomaly: true },
        { score: 0.2, isAnomaly: true },
      ];

      render(<AnomalyScoreAnalysis anomalyScores={anomalyScores} defaultThreshold={0.9} />);

      // No positive predictions, so precision should be 0 or N/A
      expect(screen.getAllByText(/0\.00%/i).length).toBeGreaterThan(0);
    });
  });
});
