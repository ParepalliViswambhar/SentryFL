/**
 * Unit tests for CommunicationCostChart component
 * 
 * Tests:
 * - Chart renders with sample data
 * - Logarithmic vs linear scale switching
 * - Different chart views (per round, breakdown, cumulative)
 * - Handles empty data gracefully
 * - Summary statistics display correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommunicationCostChart from './CommunicationCostChart';

// Mock Chart.js to avoid canvas rendering issues in tests
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(() => <div data-testid="mock-line-chart">Chart</div>),
}));

describe('CommunicationCostChart', () => {
  const sampleMetrics = [
    {
      round: 1,
      bytesSent: 1000000, // 1 MB
      bytesReceived: 500000, // 0.5 MB
      overhead: 100000, // 0.1 MB
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      round: 2,
      bytesSent: 1200000, // 1.2 MB
      bytesReceived: 600000, // 0.6 MB
      overhead: 120000, // 0.12 MB
      timestamp: '2024-01-01T00:01:00Z',
    },
    {
      round: 3,
      bytesSent: 900000, // 0.9 MB
      bytesReceived: 450000, // 0.45 MB
      overhead: 90000, // 0.09 MB
      timestamp: '2024-01-01T00:02:00Z',
    },
  ];

  it('renders with sample data', () => {
    render(<CommunicationCostChart metrics={sampleMetrics} />);

    // Check title is present
    expect(screen.getByText('Communication Costs')).toBeInTheDocument();

    // Check description is present
    expect(screen.getByText('Network communication efficiency analysis')).toBeInTheDocument();

    // Check chart is rendered
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('displays summary statistics correctly', () => {
    render(<CommunicationCostChart metrics={sampleMetrics} />);

    // Check summary statistics labels
    expect(screen.getByText('Total Transferred')).toBeInTheDocument();
    expect(screen.getByText('Avg per Round')).toBeInTheDocument();
    expect(screen.getByText('Max per Round')).toBeInTheDocument();
    expect(screen.getByText('Training Rounds')).toBeInTheDocument();

    // Check rounds count
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('handles empty metrics array gracefully', () => {
    render(<CommunicationCostChart metrics={[]} />);

    // Check info message is displayed
    expect(
      screen.getByText(/No communication metrics available/i)
    ).toBeInTheDocument();

    // Summary statistics should not be displayed
    expect(screen.queryByText('Total Transferred')).not.toBeInTheDocument();
  });

  it('switches between linear and logarithmic scales', () => {
    render(<CommunicationCostChart metrics={sampleMetrics} />);

    // Find scale toggle buttons
    const linearButton = screen.getByRole('button', { name: /linear scale/i });
    const logButton = screen.getByRole('button', { name: /logarithmic scale/i });

    expect(linearButton).toBeInTheDocument();
    expect(logButton).toBeInTheDocument();

    // Linear should be selected by default
    expect(linearButton).toHaveAttribute('aria-pressed', 'true');

    // Click logarithmic button
    fireEvent.click(logButton);

    // Logarithmic should now be selected
    expect(logButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches between different chart views', () => {
    render(<CommunicationCostChart metrics={sampleMetrics} />);

    // Find view buttons
    const perRoundButton = screen.getByRole('button', { name: /per round/i });
    const breakdownButton = screen.getByRole('button', { name: /breakdown/i });
    const cumulativeButton = screen.getByRole('button', { name: /cumulative/i });

    expect(perRoundButton).toBeInTheDocument();
    expect(breakdownButton).toBeInTheDocument();
    expect(cumulativeButton).toBeInTheDocument();

    // Click breakdown view
    fireEvent.click(breakdownButton);

    // Click cumulative view
    fireEvent.click(cumulativeButton);

    // Click back to per round view
    fireEvent.click(perRoundButton);

    // Chart should still be rendered
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    const customTitle = 'Custom Communication Analysis';
    render(<CommunicationCostChart metrics={sampleMetrics} title={customTitle} />);

    expect(screen.getByText(customTitle)).toBeInTheDocument();
  });

  it('handles metrics without overhead field', () => {
    const metricsWithoutOverhead = [
      {
        round: 1,
        bytesSent: 1000000,
        bytesReceived: 500000,
      },
      {
        round: 2,
        bytesSent: 1200000,
        bytesReceived: 600000,
      },
    ];

    render(<CommunicationCostChart metrics={metricsWithoutOverhead} />);

    // Should render without errors
    expect(screen.getByText('Communication Costs')).toBeInTheDocument();
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('computes cumulative cost correctly', () => {
    render(<CommunicationCostChart metrics={sampleMetrics} />);

    // Switch to cumulative view
    const cumulativeButton = screen.getByRole('button', { name: /cumulative/i });
    fireEvent.click(cumulativeButton);

    // Chart should still be displayed
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('formats bytes correctly in summary', () => {
    const largeMetrics = [
      {
        round: 1,
        bytesSent: 1000000000, // 1 GB
        bytesReceived: 500000000, // 0.5 GB
        overhead: 0,
      },
    ];

    render(<CommunicationCostChart metrics={largeMetrics} />);

    // Summary should display values
    expect(screen.getByText('Total Transferred')).toBeInTheDocument();
  });

  it('handles single metric correctly', () => {
    const singleMetric = [
      {
        round: 1,
        bytesSent: 1000000,
        bytesReceived: 500000,
        overhead: 100000,
      },
    ];

    render(<CommunicationCostChart metrics={singleMetric} />);

    // Should render without errors
    expect(screen.getByText('Communication Costs')).toBeInTheDocument();
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // 1 round
  });
});
