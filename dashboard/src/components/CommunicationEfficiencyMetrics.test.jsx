/**
 * Unit tests for CommunicationEfficiencyMetrics component
 * 
 * Tests:
 * - Renders with sample data
 * - Displays efficiency metrics correctly
 * - Shows parameter-efficient vs full-model comparison
 * - Highlights high-cost clients
 * - Displays quantization savings
 * - Handles empty data gracefully
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommunicationEfficiencyMetrics from './CommunicationEfficiencyMetrics';

describe('CommunicationEfficiencyMetrics', () => {
  const sampleCommunicationMetrics = [
    {
      round: 1,
      bytesSent: 1000000,
      bytesReceived: 500000,
      overhead: 100000,
    },
    {
      round: 2,
      bytesSent: 1200000,
      bytesReceived: 600000,
      overhead: 120000,
    },
    {
      round: 3,
      bytesSent: 900000,
      bytesReceived: 450000,
      overhead: 90000,
    },
  ];

  const sampleTrainingMetrics = [
    { round: 1, accuracy: 0.75 },
    { round: 2, accuracy: 0.82 },
    { round: 3, accuracy: 0.88 },
  ];

  const samplePerClientStats = [
    {
      clientId: 'client-1',
      totalBytes: 500000,
      rounds: 3,
      avgBytesPerRound: 166667,
    },
    {
      clientId: 'client-2',
      totalBytes: 550000,
      rounds: 3,
      avgBytesPerRound: 183333,
    },
    {
      clientId: 'client-3',
      totalBytes: 1500000, // High cost client (3x average)
      rounds: 3,
      avgBytesPerRound: 500000,
    },
  ];

  const sampleComparisonData = {
    fullModelBytes: 10000000, // 10 MB
    parameterEfficientBytes: 1000000, // 1 MB
    reduction: 0.9, // 90% reduction
  };

  const sampleQuantizationData = {
    fp32Size: 5000000, // 5 MB
    int8Size: 1250000, // 1.25 MB
    reduction: 0.75, // 75% reduction
  };

  it('renders with sample data', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
      />
    );

    // Check main sections are present
    expect(screen.getByText('Bytes per Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Total Communication')).toBeInTheDocument();
    expect(screen.getByText('Per-Client Communication Statistics')).toBeInTheDocument();
  });

  it('displays bytes per accuracy point correctly', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
      />
    );

    // Should display bytes per accuracy metric
    expect(screen.getByText('Bytes per Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Lower is better')).toBeInTheDocument();
  });

  it('displays parameter-efficient comparison when provided', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        comparisonData={sampleComparisonData}
      />
    );

    // Check comparison section
    expect(screen.getByText('Communication Cost Comparison')).toBeInTheDocument();
    expect(screen.getByText('Full Model Training')).toBeInTheDocument();
    expect(screen.getByText('Parameter-Efficient Training')).toBeInTheDocument();
    expect(screen.getByText('Bytes Saved')).toBeInTheDocument();

    // Check efficiency savings card
    expect(screen.getByText('Efficiency Savings')).toBeInTheDocument();
    expect(screen.getByText('90.00%')).toBeInTheDocument();
    expect(screen.getByText('vs full-model training')).toBeInTheDocument();
  });

  it('displays quantization savings when provided', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        quantizationData={sampleQuantizationData}
      />
    );

    // Check quantization savings card
    expect(screen.getByText('Quantization Savings')).toBeInTheDocument();
    expect(screen.getByText('75.00%')).toBeInTheDocument();
  });

  it('displays per-client statistics table', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        perClientStats={samplePerClientStats}
      />
    );

    // Check table headers
    expect(screen.getByText('Client ID')).toBeInTheDocument();
    expect(screen.getByText('Total Bytes')).toBeInTheDocument();
    expect(screen.getByText('Rounds')).toBeInTheDocument();
    expect(screen.getByText('Avg per Round')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Check client data is displayed
    expect(screen.getByText('client-1')).toBeInTheDocument();
    expect(screen.getByText('client-2')).toBeInTheDocument();
    expect(screen.getByText('client-3')).toBeInTheDocument();
  });

  it('highlights high-cost clients', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        perClientStats={samplePerClientStats}
      />
    );

    // Should display warning about high-cost clients
    expect(screen.getByText(/High Communication Cost Detected/i)).toBeInTheDocument();
    expect(screen.getByText(/1 client\(s\) with unusually high communication costs/i)).toBeInTheDocument();

    // Check high-cost chip is displayed
    expect(screen.getByText('High Cost')).toBeInTheDocument();
  });

  it('handles empty communication metrics gracefully', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={[]}
        trainingMetrics={[]}
      />
    );

    // Should still render main sections
    expect(screen.getByText('Bytes per Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Total Communication')).toBeInTheDocument();
  });

  it('handles empty per-client stats gracefully', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        perClientStats={[]}
      />
    );

    // Should display info message
    expect(
      screen.getByText(/No per-client statistics available/i)
    ).toBeInTheDocument();
  });

  it('displays summary statistics for per-client data', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        perClientStats={samplePerClientStats}
      />
    );

    // Check summary section
    expect(screen.getByText('Avg Bytes per Client')).toBeInTheDocument();
    expect(screen.getByText('Total Clients')).toBeInTheDocument();
    expect(screen.getByText('High Cost Clients')).toBeInTheDocument();
    
    // "Total Communication" appears twice - once in card, once in table summary
    const totalCommElements = screen.getAllByText('Total Communication');
    expect(totalCommElements.length).toBeGreaterThan(0);

    // Check total clients count ("3" appears multiple times - in table and summary)
    const threeElements = screen.getAllByText('3');
    expect(threeElements.length).toBeGreaterThan(0);
  });

  it('shows normal status for clients with average cost', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        perClientStats={samplePerClientStats}
      />
    );

    // Should have "Normal" status chips for non-high-cost clients
    const normalChips = screen.getAllByText('Normal');
    expect(normalChips.length).toBeGreaterThan(0);
  });

  it('handles zero accuracy gracefully', () => {
    const zeroAccuracyMetrics = [
      { round: 1, accuracy: 0 },
      { round: 2, accuracy: 0 },
    ];

    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={zeroAccuracyMetrics}
      />
    );

    // Should render without errors
    expect(screen.getByText('Bytes per Accuracy')).toBeInTheDocument();
  });

  it('computes bytes per accuracy correctly', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
      />
    );

    // Bytes per accuracy should be displayed
    expect(screen.getByText('Lower is better')).toBeInTheDocument();
  });

  it('displays all metric cards when all data is provided', () => {
    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        comparisonData={sampleComparisonData}
        quantizationData={sampleQuantizationData}
        perClientStats={samplePerClientStats}
      />
    );

    // All cards should be present
    expect(screen.getByText('Bytes per Accuracy')).toBeInTheDocument();
    
    // "Total Communication" appears twice - once in card, once in table summary
    const totalCommElements = screen.getAllByText('Total Communication');
    expect(totalCommElements.length).toBeGreaterThan(0);
    
    expect(screen.getByText('Efficiency Savings')).toBeInTheDocument();
    expect(screen.getByText('Quantization Savings')).toBeInTheDocument();
  });

  it('handles clients with equal cost (no high-cost warning)', () => {
    const equalCostClients = [
      {
        clientId: 'client-1',
        totalBytes: 500000,
        rounds: 3,
        avgBytesPerRound: 166667,
      },
      {
        clientId: 'client-2',
        totalBytes: 500000,
        rounds: 3,
        avgBytesPerRound: 166667,
      },
    ];

    render(
      <CommunicationEfficiencyMetrics
        communicationMetrics={sampleCommunicationMetrics}
        trainingMetrics={sampleTrainingMetrics}
        perClientStats={equalCostClients}
      />
    );

    // Should not display high-cost warning
    expect(screen.queryByText(/High Communication Cost Detected/i)).not.toBeInTheDocument();
  });
});
