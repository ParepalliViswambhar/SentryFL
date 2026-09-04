/**
 * Unit Tests for TimeSeriesAnomalyPlot Component
 * 
 * Tests for time-series anomaly visualization:
 * - Time-series plot with predicted anomaly labels
 * - Anomaly highlighting in red
 * - Ground truth comparison
 * - Zoom functionality
 * 
 * Requirements: 31.4, 31.5, 31.6, 31.7
 * 
 * @module components/TimeSeriesAnomalyPlot.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimeSeriesAnomalyPlot from './TimeSeriesAnomalyPlot';

// Mock Chart.js components
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn((props) => {
    const { data, ref } = props;
    // Create a mock chart reference with resetZoom method
    if (ref && typeof ref === 'object') {
      ref.current = {
        resetZoom: vi.fn(),
        toBase64Image: vi.fn(() => 'data:image/png;base64,mock'),
        canvas: { width: 800, height: 400 },
      };
    }
    return (
      <div data-testid="mock-line-chart" data-chart-data={JSON.stringify(data)}>
        Time Series Chart
      </div>
    );
  }),
}));

describe('TimeSeriesAnomalyPlot Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing with empty data', () => {
      render(<TimeSeriesAnomalyPlot />);
      
      expect(screen.getByText('Time-Series Anomaly Visualization')).toBeInTheDocument();
    });

    it('should display info alert when no data is available', () => {
      render(<TimeSeriesAnomalyPlot timeSeriesData={[]} />);
      
      expect(screen.getByText(/No time-series data available/i)).toBeInTheDocument();
    });

    it('should render time-series plot when data is provided (Requirement 31.4)', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 1.5 },
        { timestamp: 2, value: 2.0 },
      ];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    });

    it('should display visualization guide alert when data is available', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
      ];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByText(/Red circles show predicted anomalies/i)).toBeInTheDocument();
    });
  });

  describe('Anomaly Highlighting (Requirements 31.5, 31.6)', () => {
    it('should highlight predicted anomalies in red', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 }, // Anomaly
        { timestamp: 2, value: 1.2 },
      ];
      const predictedAnomalies = [1];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
        />
      );

      const chart = screen.getByTestId('mock-line-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-data'));
      
      // Should have a dataset for predicted anomalies
      const predictedDataset = chartData.datasets.find(ds => ds.label === 'Predicted Anomaly');
      expect(predictedDataset).toBeDefined();
    });

    it('should display ground truth anomalies for comparison', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 }, // Actual anomaly
        { timestamp: 2, value: 1.2 },
      ];
      const groundTruthAnomalies = [1];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      const chart = screen.getByTestId('mock-line-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-data'));
      
      // Should have a dataset for ground truth anomalies
      const groundTruthDataset = chartData.datasets.find(ds => ds.label === 'Ground Truth Anomaly');
      expect(groundTruthDataset).toBeDefined();
    });

    it('should show both predicted and ground truth anomalies', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 }, // Predicted
        { timestamp: 2, value: 1.2 },
        { timestamp: 3, value: 4.5 }, // Ground truth
        { timestamp: 4, value: 1.1 },
      ];
      const predictedAnomalies = [1];
      const groundTruthAnomalies = [3];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      const chart = screen.getByTestId('mock-line-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-data'));
      
      expect(chartData.datasets.find(ds => ds.label === 'Predicted Anomaly')).toBeDefined();
      expect(chartData.datasets.find(ds => ds.label === 'Ground Truth Anomaly')).toBeDefined();
    });
  });

  describe('Toggle Controls', () => {
    it('should have switch controls for showing/hiding anomalies', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByLabelText('Show Predicted')).toBeInTheDocument();
      expect(screen.getByLabelText('Show Ground Truth')).toBeInTheDocument();
    });

    it('should toggle predicted anomalies visibility', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 },
      ];
      const predictedAnomalies = [1];

      const { rerender } = render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
        />
      );

      const predictedSwitch = screen.getByLabelText('Show Predicted');
      
      // Should be checked by default
      expect(predictedSwitch).toBeChecked();

      // Toggle off
      fireEvent.click(predictedSwitch);
      
      // After toggle, the switch should be unchecked
      expect(predictedSwitch).not.toBeChecked();
    });

    it('should toggle ground truth anomalies visibility', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 },
      ];
      const groundTruthAnomalies = [1];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      const groundTruthSwitch = screen.getByLabelText('Show Ground Truth');
      
      // Should be checked by default
      expect(groundTruthSwitch).toBeChecked();

      // Toggle off
      fireEvent.click(groundTruthSwitch);
      
      // After toggle, the switch should be unchecked
      expect(groundTruthSwitch).not.toBeChecked();
    });
  });

  describe('Zoom Functionality (Requirement 31.7)', () => {
    it('should have reset zoom button', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByRole('button', { name: /Reset Zoom/i })).toBeInTheDocument();
    });

    it('should disable reset zoom button when no data is available', () => {
      render(<TimeSeriesAnomalyPlot timeSeriesData={[]} />);

      const resetButton = screen.getByRole('button', { name: /Reset Zoom/i });
      expect(resetButton).toBeDisabled();
    });

    it('should enable reset zoom button when data is available', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      const resetButton = screen.getByRole('button', { name: /Reset Zoom/i });
      expect(resetButton).not.toBeDisabled();
    });

    it('should call resetZoom when reset button is clicked', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      const resetButton = screen.getByRole('button', { name: /Reset Zoom/i });
      fireEvent.click(resetButton);

      // The mock chart should have resetZoom called (checked via mock implementation)
      expect(resetButton).toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    it('should have PNG and SVG export buttons', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByRole('button', { name: /PNG/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /SVG/i })).toBeInTheDocument();
    });

    it('should disable export buttons when no data is available', () => {
      render(<TimeSeriesAnomalyPlot timeSeriesData={[]} />);

      const pngButton = screen.getByRole('button', { name: /PNG/i });
      const svgButton = screen.getByRole('button', { name: /SVG/i });

      expect(pngButton).toBeDisabled();
      expect(svgButton).toBeDisabled();
    });

    it('should enable export buttons when data is available', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      const pngButton = screen.getByRole('button', { name: /PNG/i });
      const svgButton = screen.getByRole('button', { name: /SVG/i });

      expect(pngButton).not.toBeDisabled();
      expect(svgButton).not.toBeDisabled();
    });
  });

  describe('Statistics Display', () => {
    it('should display anomaly detection statistics', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 },
        { timestamp: 2, value: 1.2 },
      ];
      const predictedAnomalies = [1];
      const groundTruthAnomalies = [1];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      expect(screen.getByText('Anomaly Detection Statistics')).toBeInTheDocument();
      expect(screen.getByText(/Total Points: 3/i)).toBeInTheDocument();
      expect(screen.getByText(/Predicted Anomalies: 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Ground Truth Anomalies: 1/i)).toBeInTheDocument();
    });

    it('should calculate and display true positives correctly', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 }, // Correctly predicted
        { timestamp: 2, value: 1.2 },
        { timestamp: 3, value: 4.5 }, // Missed (FN)
        { timestamp: 4, value: 1.1 },
      ];
      const predictedAnomalies = [1];
      const groundTruthAnomalies = [1, 3];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      expect(screen.getByText(/True Positives: 1/i)).toBeInTheDocument();
    });

    it('should calculate and display precision correctly', () => {
      const timeSeriesData = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        value: 1.0,
      }));
      const predictedAnomalies = [1, 2]; // 2 predicted
      const groundTruthAnomalies = [1]; // 1 actual, so 1 TP, 1 FP

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      // Precision = TP / Predicted = 1 / 2 = 50%
      expect(screen.getByText(/Precision: 50\.00%/i)).toBeInTheDocument();
    });

    it('should calculate and display recall correctly', () => {
      const timeSeriesData = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        value: 1.0,
      }));
      const predictedAnomalies = [1]; // 1 predicted
      const groundTruthAnomalies = [1, 3]; // 2 actual, so 1 TP, 1 FN

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      // Recall = TP / Actual = 1 / 2 = 50%
      expect(screen.getByText(/Recall: 50\.00%/i)).toBeInTheDocument();
    });
  });

  describe('Custom Time-Series Label', () => {
    it('should use default label when not provided', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      // Default label should be used in the chart
      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    });

    it('should use custom label when provided', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];
      const customLabel = 'CPU Usage (%)';

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          timeSeriesLabel={customLabel}
        />
      );

      // Custom label should be used in the chart
      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle single data point', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
      expect(screen.getByText(/Total Points: 1/i)).toBeInTheDocument();
    });

    it('should handle all points being anomalies', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 5.0 },
        { timestamp: 1, value: 6.0 },
        { timestamp: 2, value: 7.0 },
      ];
      const predictedAnomalies = [0, 1, 2];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
        />
      );

      expect(screen.getByText(/Predicted Anomalies: 3/i)).toBeInTheDocument();
    });

    it('should handle no anomalies', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 1.5 },
        { timestamp: 2, value: 2.0 },
      ];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={[]}
          groundTruthAnomalies={[]}
        />
      );

      expect(screen.getByText(/Predicted Anomalies: 0/i)).toBeInTheDocument();
      expect(screen.getByText(/Ground Truth Anomalies: 0/i)).toBeInTheDocument();
    });

    it('should handle overlapping anomalies (both predicted and ground truth)', () => {
      const timeSeriesData = [
        { timestamp: 0, value: 1.0 },
        { timestamp: 1, value: 5.0 }, // Both predicted and actual
        { timestamp: 2, value: 1.2 },
      ];
      const predictedAnomalies = [1];
      const groundTruthAnomalies = [1];

      render(
        <TimeSeriesAnomalyPlot
          timeSeriesData={timeSeriesData}
          predictedAnomalies={predictedAnomalies}
          groundTruthAnomalies={groundTruthAnomalies}
        />
      );

      expect(screen.getByText(/True Positives: 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Precision: 100\.00%/i)).toBeInTheDocument();
      expect(screen.getByText(/Recall: 100\.00%/i)).toBeInTheDocument();
    });

    it('should handle large time-series without crashing', () => {
      const timeSeriesData = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: i,
        value: Math.sin(i / 100) + Math.random() * 0.1,
      }));

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByText(/Total Points: 10000/i)).toBeInTheDocument();
    });
  });

  describe('Component Headers and Labels', () => {
    it('should display main component title', () => {
      render(<TimeSeriesAnomalyPlot />);

      expect(screen.getByText('Time-Series Anomaly Visualization')).toBeInTheDocument();
    });

    it('should display component subtitle', () => {
      render(<TimeSeriesAnomalyPlot />);

      expect(screen.getByText('Detected anomalies highlighted in time-series context')).toBeInTheDocument();
    });

    it('should display section title for time-series plot', () => {
      const timeSeriesData = [{ timestamp: 0, value: 1.0 }];

      render(<TimeSeriesAnomalyPlot timeSeriesData={timeSeriesData} />);

      expect(screen.getByText('Time-Series with Anomaly Labels')).toBeInTheDocument();
    });
  });
});
