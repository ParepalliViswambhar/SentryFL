import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Dashboard, { ExperimentTable } from './Dashboard';
import NewExperiment from './NewExperiment';
import experimentsReducer from '../store/slices/experimentsSlice';

const renderWithState = (page, state = { list: [], current: null, status: 'succeeded', error: null }) => render(
  <Provider store={configureStore({ reducer: { experiments: experimentsReducer }, preloadedState: { experiments: state } })}>
    <MemoryRouter>{page}</MemoryRouter>
  </Provider>
);

describe('experiment control pages', () => {
  it('renders experiment status, progress, and control actions', () => {
    const onStop = vi.fn();
    render(<MemoryRouter><ExperimentTable experiments={[{ id: 'exp-1', name: 'SMD run', status: 'running', progress: 40, currentRound: 4, totalRounds: 10 }]} onStop={onStop} onPause={vi.fn()} onResume={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('SMD run')).toBeInTheDocument();
    expect(screen.getByText('40% (4/10)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /stop smd run/i }));
    expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp-1' }));
  });

  it('validates the experiment name before submitting', () => {
    renderWithState(<NewExperiment />);
    fireEvent.submit(screen.getByRole('button', { name: /start experiment/i }).closest('form'));
    expect(screen.getByText('Experiment name is required.')).toBeInTheDocument();
  });

  it('renders configuration sections and template controls', () => {
    renderWithState(<NewExperiment />);
    expect(screen.getByText('Dataset and model')).toBeInTheDocument();
    expect(screen.getByText('Training and federation')).toBeInTheDocument();
    expect(screen.getByText('Privacy and efficiency')).toBeInTheDocument();
    expect(screen.getByLabelText('Load saved configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save template' })).toBeInTheDocument();
  });

  it('shows fetched experiments on the dashboard', () => {
    renderWithState(<Dashboard />, { list: [{ id: 'exp-2', name: 'Running run', status: 'running', progress: 75 }], current: null, status: 'succeeded', error: null });
    expect(screen.getByText('Running run')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
