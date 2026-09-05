import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TrainingMetricsChart from './TrainingMetricsChart';

vi.mock('react-chartjs-2', () => ({ Line: ({ data }) => <output data-testid="chart">{data.datasets.map((dataset) => dataset.label).join(',')}</output> }));

describe('TrainingMetricsChart', () => {
  const metrics = [
    { round: 1, loss: 1, accuracy: 0.6, clientLosses: { clientA: 1.1, clientB: 0.9 } },
    { round: 2, loss: 0.5, accuracy: 0.8, clientLosses: { clientA: 0.6, clientB: 0.4 } },
  ];

  it('renders live charts and progress from training metrics', () => {
    render(<TrainingMetricsChart metrics={metrics} totalRounds={4} status="connected" />);
    expect(screen.getByText('Training telemetry')).toBeInTheDocument();
    expect(screen.getByText('Round 2 of 4')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(3);
    expect(screen.getAllByTestId('chart')[0]).toHaveTextContent('Training loss');
  });

  it('updates the visible chart window and resets it', () => {
    render(<TrainingMetricsChart metrics={[...metrics, { round: 3, loss: 0.3, accuracy: 0.9 }, { round: 4, loss: 0.2, accuracy: 0.95 }]} totalRounds={4} />);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const reset = screen.getByRole('button', { name: 'Reset chart zoom' });
    expect(reset).toBeDisabled();
    fireEvent.click(zoomIn);
    expect(reset).not.toBeDisabled();
    fireEvent.click(reset);
    expect(reset).toBeDisabled();
  });

  it('flags clients whose loss diverges from the global average', () => {
    render(<TrainingMetricsChart metrics={[{ round: 1, loss: 1, accuracy: 0.5, clientLosses: { clientA: 3 } }]} totalRounds={1} />);
    expect(screen.getByText(/Divergent client loss detected: clientA/)).toBeInTheDocument();
  });
});
