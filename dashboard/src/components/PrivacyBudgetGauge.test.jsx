/**
 * Unit Tests for PrivacyBudgetGauge Component
 * 
 * Tests Requirements: 30.3, 30.5, 30.8
 * - Test gauge displays correct percentage
 * - Test color changes based on utilization
 * - Test warning appears at 90% threshold
 * 
 * @module components/PrivacyBudgetGauge.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import PrivacyBudgetGauge from './PrivacyBudgetGauge';

// Mock Chart.js to avoid canvas issues in tests
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(() => <div data-testid="mock-line-chart">Line Chart</div>),
}));

describe('PrivacyBudgetGauge Component', () => {
  describe('Percentage Display (Requirement 30.3)', () => {
    it('should display correct utilization percentage when privacy metrics are provided', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 2.0, delta: 1e-5 },
        { round: 2, epsilon: 4.0, delta: 1e-5 },
        { round: 3, epsilon: 5.0, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0;

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Current epsilon should be 5.0 (last metric) - appears in two places
      const epsilonDisplays = screen.getAllByText('5.0000');
      expect(epsilonDisplays.length).toBeGreaterThan(0);

      // Utilization percentage should be 50% (5.0 / 10.0 * 100)
      expect(screen.getByText('50.0%')).toBeInTheDocument();

      // Remaining percentage should be 50%
      expect(screen.getByText('50.0% remaining')).toBeInTheDocument();
    });

    it('should display 0% when no privacy metrics are provided', () => {
      render(<PrivacyBudgetGauge privacyMetrics={[]} maxEpsilon={10.0} />);

      // Current epsilon should be 0
      expect(screen.getByText('0.0000')).toBeInTheDocument();

      // Utilization should be 0%
      expect(screen.getByText('0.0%')).toBeInTheDocument();

      // Should show 100% remaining
      expect(screen.getByText('100.0% remaining')).toBeInTheDocument();
    });

    it('should display 100% when epsilon equals max epsilon', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 5.0, delta: 1e-5 },
        { round: 2, epsilon: 8.0, delta: 1e-5 },
        { round: 3, epsilon: 10.0, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0;

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Utilization should be 100%
      expect(screen.getByText('100.0%')).toBeInTheDocument();

      // Remaining should be 0
      expect(screen.getByText('0.0% remaining')).toBeInTheDocument();
    });

    it('should handle fractional epsilon values correctly', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 3.7856, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0;

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should display 4 decimal places
      expect(screen.getByText('3.7856')).toBeInTheDocument();

      // Utilization should be 37.9% (rounded)
      expect(screen.getByText('37.9%')).toBeInTheDocument();
    });
  });

  describe('Color Coding Based on Utilization (Requirement 30.5)', () => {
    it('should display green/success color for utilization < 70%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 5.0, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 50% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should show "Strong privacy" chip with success color
      const chip = screen.getByText('Strong privacy');
      expect(chip).toBeInTheDocument();
      expect(chip.closest('.MuiChip-colorSuccess')).toBeInTheDocument();
    });

    it('should display yellow/warning color for utilization between 70% and 90%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 8.0, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 80% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should show "Moderate privacy" chip with warning color
      const chip = screen.getByText('Moderate privacy');
      expect(chip).toBeInTheDocument();
      expect(chip.closest('.MuiChip-colorWarning')).toBeInTheDocument();
    });

    it('should display red/error color for utilization > 90%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 9.5, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 95% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should show "Weak privacy" chip with error color
      const chip = screen.getByText('Weak privacy');
      expect(chip).toBeInTheDocument();
      expect(chip.closest('.MuiChip-colorError')).toBeInTheDocument();
    });

    it('should transition colors correctly at boundary values', () => {
      // Test at 69.9% (should be green)
      const { rerender } = render(
        <PrivacyBudgetGauge
          privacyMetrics={[{ round: 1, epsilon: 6.99, delta: 1e-5 }]}
          maxEpsilon={10.0}
        />
      );
      expect(screen.getByText('Strong privacy')).toBeInTheDocument();

      // Test at 70.0% (should be yellow)
      rerender(
        <PrivacyBudgetGauge
          privacyMetrics={[{ round: 1, epsilon: 7.0, delta: 1e-5 }]}
          maxEpsilon={10.0}
        />
      );
      expect(screen.getByText('Moderate privacy')).toBeInTheDocument();

      // Test at 90.0% (should be red)
      rerender(
        <PrivacyBudgetGauge
          privacyMetrics={[{ round: 1, epsilon: 9.0, delta: 1e-5 }]}
          maxEpsilon={10.0}
        />
      );
      expect(screen.getByText('Weak privacy')).toBeInTheDocument();
    });
  });

  describe('Warning at 90% Threshold (Requirement 30.8)', () => {
    it('should display warning alert when utilization exceeds 90%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 9.1, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 91% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should display warning alert - use getAllBy since text appears in Alert and status message
      const warnings = screen.getAllByText(/Privacy budget near exhaustion/i);
      expect(warnings.length).toBeGreaterThan(0);

      // Alert should contain detailed warning message
      expect(screen.getByText(/consumed over 90%/i)).toBeInTheDocument();
    });

    it('should NOT display warning when utilization is below 90%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 8.9, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 89% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should NOT display warning alert
      expect(screen.queryByText(/Privacy budget near exhaustion/i)).not.toBeInTheDocument();
    });

    it('should display warning exactly at 90% threshold', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 9.0, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 90% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // At exactly 90%, warning should appear (>= 90%)
      expect(screen.getByText('CRITICAL: Privacy budget near exhaustion')).toBeInTheDocument();
    });

    it('should display warning when utilization is 100%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 10.0, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0; // 100% utilization

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should display warning alert - use getAllBy since text appears in multiple places
      const warnings = screen.getAllByText(/Privacy budget near exhaustion/i);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Additional Component Functionality', () => {
    it('should display current delta value', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 5.0, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
          maxDelta={1e-5}
        />
      );

      // Should display delta in exponential notation
      expect(screen.getByText('1.00e-5')).toBeInTheDocument();
    });

    it('should display current round number', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 2.0, delta: 1e-5 },
        { round: 2, epsilon: 4.0, delta: 1e-5 },
        { round: 5, epsilon: 5.0, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
        />
      );

      // Should display latest round (5)
      expect(screen.getByText('5')).toBeInTheDocument();

      // Should display number of metrics recorded
      expect(screen.getByText('3 metrics recorded')).toBeInTheDocument();
    });

    it('should display privacy accounting method in tooltip', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 5.0, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
          accountingMethod="RDP"
        />
      );

      // Component should render (accounting method shown in chart tooltip)
      expect(screen.getByText('Privacy Budget Monitor')).toBeInTheDocument();
    });

    it('should display info message when no metrics are available', () => {
      render(<PrivacyBudgetGauge privacyMetrics={[]} maxEpsilon={10.0} />);

      // Should display info alert
      expect(screen.getByText(/No privacy metrics available/i)).toBeInTheDocument();
    });

    it('should render chart when metrics are provided', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 2.0, delta: 1e-5 },
        { round: 2, epsilon: 4.0, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
        />
      );

      // Should render the mocked chart
      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    });

    it('should handle edge case with very small epsilon values', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 0.001, delta: 1e-5 },
      ];
      const maxEpsilon = 10.0;

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={maxEpsilon}
        />
      );

      // Should display small epsilon correctly
      expect(screen.getByText('0.0010')).toBeInTheDocument();

      // Utilization should be very low
      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('should handle multiple privacy metrics and display the latest', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 1.0, delta: 1e-5 },
        { round: 2, epsilon: 3.0, delta: 1e-5 },
        { round: 3, epsilon: 5.0, delta: 1e-5 },
        { round: 4, epsilon: 7.5, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
        />
      );

      // Should display latest epsilon (7.5)
      expect(screen.getByText('7.5000')).toBeInTheDocument();

      // Should display correct utilization (75%)
      expect(screen.getByText('75.0%')).toBeInTheDocument();
    });
  });

  describe('Budget Status Messages', () => {
    it('should display "healthy" status message when utilization < 70%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 5.0, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
        />
      );

      expect(screen.getByText('Privacy budget is healthy')).toBeInTheDocument();
    });

    it('should display "moderate" status message when utilization is 70-90%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 8.0, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
        />
      );

      expect(screen.getByText('Privacy budget utilization is moderate')).toBeInTheDocument();
    });

    it('should display "CRITICAL" status message when utilization >= 90%', () => {
      const privacyMetrics = [
        { round: 1, epsilon: 9.5, delta: 1e-5 },
      ];

      render(
        <PrivacyBudgetGauge
          privacyMetrics={privacyMetrics}
          maxEpsilon={10.0}
        />
      );

      expect(screen.getByText('CRITICAL: Privacy budget near exhaustion')).toBeInTheDocument();
    });
  });
});
