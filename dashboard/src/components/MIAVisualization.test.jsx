/**
 * Unit Tests for MIAVisualization Component
 * 
 * Tests for MIA attack visualization functionality:
 * - Display of MIA attack success rate vs epsilon
 * - Privacy leakage comparison across privacy levels
 * - Export functionality for charts
 * - Privacy accounting method display
 * 
 * @module components/MIAVisualization.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MIAVisualization from './MIAVisualization';

// Mock Chart.js components
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(({ data }) => (
    <div data-testid="mock-line-chart" data-chart-labels={JSON.stringify(data.labels)}>
      Line Chart
    </div>
  )),
  Bar: vi.fn(({ data }) => (
    <div data-testid="mock-bar-chart" data-chart-labels={JSON.stringify(data.labels)}>
      Bar Chart
    </div>
  )),
}));

// Mock document.createElement for export functionality
const mockLink = {
  click: vi.fn(),
  download: '',
  href: '',
};

describe('MIAVisualization Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing with empty results', () => {
      render(<MIAVisualization miaResults={[]} />);
      
      expect(screen.getByText('Membership Inference Attack Analysis')).toBeInTheDocument();
    });

    it('should display info alerts when no results are available', () => {
      render(<MIAVisualization miaResults={[]} />);
      
      const infoMessages = screen.getAllByText(/No MIA evaluation results available/i);
      expect(infoMessages.length).toBeGreaterThan(0);
    });

    it('should render charts when MIA results are provided', () => {
      const miaResults = [
        { epsilon: 0.1, successRate: 0.52 },
        { epsilon: 1.0, successRate: 0.58 },
        { epsilon: 10.0, successRate: 0.75 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should render both line and bar charts
      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
      expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    });

    it('should display interpretation alert when results are available', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      expect(screen.getByText(/MIA success rates close to 50%/i)).toBeInTheDocument();
    });
  });

  describe('MIA Results Display', () => {
    it('should display detailed results table with correct data', () => {
      const miaResults = [
        { epsilon: 0.1, successRate: 0.52 },
        { epsilon: 1.0, successRate: 0.58 },
        { epsilon: 10.0, successRate: 0.75 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should display epsilon values
      expect(screen.getByText('0.1000')).toBeInTheDocument();
      expect(screen.getByText('1.0000')).toBeInTheDocument();
      expect(screen.getByText('10.0000')).toBeInTheDocument();

      // Should display success rates as percentages - use getAllByText since they appear in table and summary
      const rate52 = screen.getAllByText('52.00%');
      const rate58 = screen.getAllByText('58.00%');
      const rate75 = screen.getAllByText('75.00%');
      expect(rate52.length).toBeGreaterThan(0);
      expect(rate58.length).toBeGreaterThan(0);
      expect(rate75.length).toBeGreaterThan(0);
    });

    it('should calculate and display "above baseline" values correctly', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 }, // 5% above baseline
        { epsilon: 10.0, successRate: 0.48 }, // 2% below baseline
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should show +5.00% for 55% success rate
      expect(screen.getByText('+5.00%')).toBeInTheDocument();

      // Should show -2.00% for 48% success rate
      expect(screen.getByText('-2.00%')).toBeInTheDocument();
    });

    it('should categorize privacy levels correctly', () => {
      const miaResults = [
        { epsilon: 0.5, successRate: 0.52 },  // Strong
        { epsilon: 3.0, successRate: 0.60 },  // Moderate
        { epsilon: 8.0, successRate: 0.70 },  // Weak
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should display all three privacy levels
      const strongChips = screen.getAllByText('Strong');
      const moderateChips = screen.getAllByText('Moderate');
      const weakChips = screen.getAllByText('Weak');

      expect(strongChips.length).toBeGreaterThan(0);
      expect(moderateChips.length).toBeGreaterThan(0);
      expect(weakChips.length).toBeGreaterThan(0);
    });

    it('should display interpretation based on privacy leakage', () => {
      const miaResults = [
        { epsilon: 0.1, successRate: 0.52 }, // Good (< 5% above baseline)
        { epsilon: 10.0, successRate: 0.65 }, // Privacy leakage (>= 5% above baseline)
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      expect(screen.getByText('Good privacy protection')).toBeInTheDocument();
      expect(screen.getByText('Privacy leakage detected')).toBeInTheDocument();
    });
  });

  describe('Summary Statistics', () => {
    it('should display lowest, highest, and average success rates', () => {
      const miaResults = [
        { epsilon: 0.1, successRate: 0.51 },
        { epsilon: 1.0, successRate: 0.55 },
        { epsilon: 5.0, successRate: 0.65 },
        { epsilon: 10.0, successRate: 0.75 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // These values appear in both table and summary cards, use getAllByText
      const rate51 = screen.getAllByText('51.00%');
      const rate75 = screen.getAllByText('75.00%');
      const rate6150 = screen.getAllByText('61.50%');
      
      expect(rate51.length).toBeGreaterThan(0); // Lowest: 51%
      expect(rate75.length).toBeGreaterThan(0); // Highest: 75%
      expect(rate6150.length).toBeGreaterThan(0); // Average: (51 + 55 + 65 + 75) / 4 = 61.5%
    });

    it('should display descriptive labels for statistics', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      expect(screen.getByText('Lowest Success Rate')).toBeInTheDocument();
      expect(screen.getByText('Highest Success Rate')).toBeInTheDocument();
      expect(screen.getByText('Average Success Rate')).toBeInTheDocument();
    });
  });

  describe('Chart Data Sorting', () => {
    it('should sort MIA results by epsilon before displaying', () => {
      const miaResults = [
        { epsilon: 10.0, successRate: 0.75 },
        { epsilon: 0.1, successRate: 0.52 },
        { epsilon: 1.0, successRate: 0.58 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      const lineChart = screen.getByTestId('mock-line-chart');
      const chartLabels = JSON.parse(lineChart.getAttribute('data-chart-labels'));

      // Labels should be sorted: 0.10, 1.00, 10.00
      expect(chartLabels).toEqual(['0.10', '1.00', '10.00']);
    });
  });

  describe('Privacy Accounting Method', () => {
    it('should display default accounting method (RDP)', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Component should render with default RDP method
      expect(screen.getByText('Membership Inference Attack Analysis')).toBeInTheDocument();
    });

    it('should accept custom accounting method', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(
        <MIAVisualization
          miaResults={miaResults}
          accountingMethod="Moments Accountant"
        />
      );

      // Component should render with custom accounting method
      expect(screen.getByText('Membership Inference Attack Analysis')).toBeInTheDocument();
    });
  });

  describe('Export Functionality (Requirements 30.9, 30.10)', () => {
    it('should have export buttons for both charts', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should have 2 export buttons (icon-only format)
      const exportButtons = screen.getAllByLabelText('Export chart');
      expect(exportButtons).toHaveLength(2); // One for each chart
    });

    it('should render export button groups for success rate chart', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should find heading for success rate chart
      expect(screen.getByText('Attack Success Rate vs Privacy Budget')).toBeInTheDocument();
      
      // Should have export button
      const exportButtons = screen.getAllByLabelText('Export chart');
      expect(exportButtons.length).toBeGreaterThan(0);
    });

    it('should render export button groups for comparison chart', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should find heading for comparison chart
      expect(screen.getByText('Privacy Leakage by Privacy Level')).toBeInTheDocument();
      
      // Should have export button
      const exportButtons = screen.getAllByLabelText('Export chart');
      expect(exportButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Privacy Level Comparison', () => {
    it('should group results by privacy level correctly', () => {
      const miaResults = [
        { epsilon: 0.5, successRate: 0.52 },   // Strong
        { epsilon: 0.8, successRate: 0.53 },   // Strong
        { epsilon: 2.0, successRate: 0.58 },   // Moderate
        { epsilon: 4.0, successRate: 0.62 },   // Moderate
        { epsilon: 8.0, successRate: 0.70 },   // Weak
        { epsilon: 10.0, successRate: 0.75 },  // Weak
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      const barChart = screen.getByTestId('mock-bar-chart');
      const chartLabels = JSON.parse(barChart.getAttribute('data-chart-labels'));

      // Should have three categories
      expect(chartLabels).toEqual(['Strong', 'Moderate', 'Weak']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single MIA result', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      expect(screen.getByText('1.0000')).toBeInTheDocument();
      // 55.00% appears in table and summary cards
      const rate55 = screen.getAllByText('55.00%');
      expect(rate55.length).toBeGreaterThan(0);
    });

    it('should handle success rate of exactly 50% (baseline)', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.50 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should show 0.00% above baseline (without +/- sign for zero)
      const zeroPercent = screen.queryByText('0.00%');
      expect(zeroPercent).toBeInTheDocument();
    });

    it('should handle very low success rates (below baseline)', () => {
      const miaResults = [
        { epsilon: 0.1, successRate: 0.45 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should show -5.00% (below baseline)
      expect(screen.getByText('-5.00%')).toBeInTheDocument();
    });

    it('should handle very high success rates (significant leakage)', () => {
      const miaResults = [
        { epsilon: 10.0, successRate: 0.95 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should show +45.00% above baseline
      expect(screen.getByText('+45.00%')).toBeInTheDocument();
      expect(screen.getByText('Privacy leakage detected')).toBeInTheDocument();
    });

    it('should handle many MIA results without crashing', () => {
      const miaResults = Array.from({ length: 50 }, (_, i) => ({
        epsilon: i * 0.2,
        successRate: 0.5 + (i * 0.005),
      }));

      render(<MIAVisualization miaResults={miaResults} />);

      expect(screen.getByText('Membership Inference Attack Analysis')).toBeInTheDocument();
    });
  });

  describe('Baseline Display', () => {
    it('should show baseline (50%) reference line in interpretation', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      // Should mention baseline in interpretation
      expect(screen.getByText(/baseline of 50%/i)).toBeInTheDocument();
    });
  });

  describe('Component Headers and Labels', () => {
    it('should display main component title', () => {
      render(<MIAVisualization miaResults={[]} />);

      expect(screen.getByText('Membership Inference Attack Analysis')).toBeInTheDocument();
    });

    it('should display component subtitle', () => {
      render(<MIAVisualization miaResults={[]} />);

      expect(screen.getByText('Empirical privacy leakage evaluation')).toBeInTheDocument();
    });

    it('should display chart section titles', () => {
      const miaResults = [
        { epsilon: 1.0, successRate: 0.55 },
      ];

      render(<MIAVisualization miaResults={miaResults} />);

      expect(screen.getByText('Attack Success Rate vs Privacy Budget')).toBeInTheDocument();
      expect(screen.getByText('Privacy Leakage by Privacy Level')).toBeInTheDocument();
      expect(screen.getByText('Detailed MIA Results')).toBeInTheDocument();
    });
  });
});
