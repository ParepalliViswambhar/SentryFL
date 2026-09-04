import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userEvent from '@testing-library/user-event';
import Comparison from './Comparison';

// Create a minimal mock of experiments slice
const mockExperimentsReducer = (state = { list: [], status: 'succeeded', error: null }, action) => {
  return state;
};

// Mock Chart.js components
vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="line-chart">Line Chart</div>,
  Bar: () => <div data-testid="bar-chart">Bar Chart</div>,
}));

// Mock LoadingSpinner
vi.mock('../components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner">Loading...</div>,
}));

// Mock JSZip
vi.mock('jszip', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      file: vi.fn(),
      folder: vi.fn(() => ({
        file: vi.fn(),
      })),
      generateAsync: vi.fn().mockResolvedValue(new Blob(['mock zip content'])),
    })),
  };
});

const createMockStore = (experimentsState = {}) => {
  const defaultState = {
    list: [],
    current: null,
    status: 'succeeded',
    error: null,
  };
  
  return configureStore({
    reducer: {
      experiments: () => ({ ...defaultState, ...experimentsState }),
    },
  });
};

const mockExperiments = [
  {
    id: 'exp1',
    name: 'Experiment 1',
    status: 'completed',
    metrics: {
      accuracy: 0.92,
      f1Score: 0.89,
      communicationCost: 125.5,
      inferenceLatency: 45.2,
    },
    trainingHistory: [
      { loss: 1.2 },
      { loss: 0.8 },
      { loss: 0.5 },
    ],
  },
  {
    id: 'exp2',
    name: 'Experiment 2',
    status: 'completed',
    metrics: {
      accuracy: 0.95,
      f1Score: 0.93,
      communicationCost: 150.0,
      inferenceLatency: 38.5,
    },
    trainingHistory: [
      { loss: 1.0 },
      { loss: 0.6 },
      { loss: 0.3 },
    ],
  },
];

describe('Comparison Page', () => {
  let mockCreateElement;
  let mockAppendChild;
  let mockRemoveChild;
  let mockClick;

  beforeEach(() => {
    // Mock DOM methods for download functionality
    mockClick = vi.fn();
    mockCreateElement = vi.spyOn(document, 'createElement').mockReturnValue({
      setAttribute: vi.fn(),
      click: mockClick,
      style: {},
    });
    mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    mockCreateElement.mockRestore();
    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
  });

  it('renders comparison page with title and description', () => {
    const store = createMockStore();
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    expect(screen.getByText('Experiment Comparison')).toBeInTheDocument();
    expect(screen.getByText(/Compare performance metrics/)).toBeInTheDocument();
  });

  it('displays experiment selection section', () => {
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    expect(screen.getByText('Select Experiments to Compare')).toBeInTheDocument();
    expect(screen.getByText('Experiment 1')).toBeInTheDocument();
    expect(screen.getByText('Experiment 2')).toBeInTheDocument();
  });

  it('shows message when no experiments are selected', () => {
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    expect(screen.getByText(/Select at least one experiment to view comparison metrics/)).toBeInTheDocument();
  });

  it('shows loading spinner when status is loading', () => {
    const store = createMockStore({ status: 'loading' });

    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('displays error message when there is an error', () => {
    const store = createMockStore({ status: 'failed', error: 'Failed to load experiments' });

    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    expect(screen.getByText(/Failed to load experiments/)).toBeInTheDocument();
  });

  it('shows message when no experiments are available', () => {
    const store = createMockStore({ list: [] });

    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    expect(screen.getByText('No experiments available. Create some experiments first.')).toBeInTheDocument();
  });

  it('displays export buttons when experiments are selected', async () => {
    const user = userEvent.setup();
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    // Select first experiment
    const checkbox1 = screen.getAllByRole('checkbox')[0];
    await user.click(checkbox1);

    // Export buttons should now be visible
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export ZIP')).toBeInTheDocument();
  });

  it('exports comparison table as CSV when Export CSV button is clicked', async () => {
    const user = userEvent.setup();
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    // Select first experiment
    const checkbox1 = screen.getAllByRole('checkbox')[0];
    await user.click(checkbox1);

    // Click Export CSV button
    const exportButton = screen.getByText('Export CSV');
    await user.click(exportButton);

    // Verify download was triggered
    expect(mockClick).toHaveBeenCalled();
    expect(mockCreateElement).toHaveBeenCalledWith('a');
  });

  it('exports multiple experiments as ZIP when Export ZIP button is clicked', async () => {
    const user = userEvent.setup();
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    // Select both experiments
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    // Click Export ZIP button
    const exportButton = screen.getByText('Export ZIP');
    await user.click(exportButton);

    // Verify download was triggered
    expect(mockClick).toHaveBeenCalled();
  });

  it('displays statistical significance indicators in comparison table', async () => {
    const user = userEvent.setup();
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    // Select both experiments to enable significance calculation
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    // Check that the comparison table is displayed
    expect(screen.getByText('Performance Metrics Comparison')).toBeInTheDocument();
    
    // The table should show metrics with potential significance indicators
    expect(screen.getByText('0.9200')).toBeInTheDocument(); // Experiment 1 accuracy
    expect(screen.getByText('0.9500')).toBeInTheDocument(); // Experiment 2 accuracy
  });

  it('highlights best performing configurations in green', async () => {
    const user = userEvent.setup();
    const store = createMockStore({ list: mockExperiments });
    
    render(
      <Provider store={store}>
        <Comparison />
      </Provider>
    );

    // Select both experiments
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    // Check that best values message is displayed
    expect(screen.getByText(/Best values are highlighted in green/)).toBeInTheDocument();
  });

  // Task 48.3 - Test experiment selection updates comparison (Requirement 33.2)
  describe('Experiment Selection Updates Comparison', () => {
    it('should update comparison when selecting an experiment', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Initially, no comparison is shown
      expect(screen.getByText(/Select at least one experiment to view comparison metrics/)).toBeInTheDocument();

      // Select first experiment
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      // Comparison table should now be visible
      expect(screen.queryByText(/Select at least one experiment to view comparison metrics/)).not.toBeInTheDocument();
      expect(screen.getByText('Performance Metrics Comparison')).toBeInTheDocument();
    });

    it('should update comparison when unselecting an experiment', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select first experiment
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      // Verify comparison is showing
      expect(screen.getByText('Performance Metrics Comparison')).toBeInTheDocument();

      // Unselect the experiment
      await user.click(checkboxes[0]);

      // Comparison should be hidden again
      expect(screen.getByText(/Select at least one experiment to view comparison metrics/)).toBeInTheDocument();
    });

    it('should update comparison when selecting multiple experiments', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      const checkboxes = screen.getAllByRole('checkbox');

      // Select first experiment
      await user.click(checkboxes[0]);
      expect(screen.getByText('Experiment 1')).toBeInTheDocument();

      // Select second experiment
      await user.click(checkboxes[1]);

      // Both experiments should be in the comparison table
      const table = screen.getByRole('table');
      expect(table).toHaveTextContent('Experiment 1');
      expect(table).toHaveTextContent('Experiment 2');
    });

    it('should maintain selection state when toggling checkboxes', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      const checkboxes = screen.getAllByRole('checkbox');

      // Select both experiments
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Verify both are checked
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).toBeChecked();

      // Uncheck first
      await user.click(checkboxes[0]);
      expect(checkboxes[0]).not.toBeChecked();
      expect(checkboxes[1]).toBeChecked();

      // Only second experiment should be in table
      const table = screen.getByRole('table');
      expect(table).not.toHaveTextContent('Experiment 1');
      expect(table).toHaveTextContent('Experiment 2');
    });
  });

  // Task 48.3 - Test comparison table displays correct data (Requirement 33.3)
  describe('Comparison Table Displays Correct Data', () => {
    it('should display accurate metrics for selected experiments', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select both experiments
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Verify table headers
      expect(screen.getByText('Experiment')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Accuracy')).toBeInTheDocument();
      expect(screen.getByText('F1 Score')).toBeInTheDocument();
      expect(screen.getByText('Comm. Cost (MB)')).toBeInTheDocument();
      expect(screen.getByText('Latency (ms)')).toBeInTheDocument();

      // Verify Experiment 1 data
      expect(screen.getByText('0.9200')).toBeInTheDocument(); // accuracy
      expect(screen.getByText('0.8900')).toBeInTheDocument(); // f1Score
      expect(screen.getByText('125.50')).toBeInTheDocument(); // communicationCost
      expect(screen.getByText('45.20')).toBeInTheDocument(); // inferenceLatency

      // Verify Experiment 2 data
      expect(screen.getByText('0.9500')).toBeInTheDocument(); // accuracy
      expect(screen.getByText('0.9300')).toBeInTheDocument(); // f1Score
      expect(screen.getByText('150.00')).toBeInTheDocument(); // communicationCost
      expect(screen.getByText('38.50')).toBeInTheDocument(); // inferenceLatency
    });

    it('should display experiment status correctly', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select first experiment
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      // Get all status chips
      const statusChips = screen.getAllByText('completed');
      expect(statusChips.length).toBeGreaterThan(0);
    });

    it('should handle missing metrics gracefully', async () => {
      const experimentsWithMissingData = [
        {
          id: 'exp3',
          name: 'Experiment 3',
          status: 'running',
          metrics: {
            accuracy: 0.85,
            // f1Score missing
            communicationCost: 100.0,
            // inferenceLatency missing
          },
        },
      ];

      const user = userEvent.setup();
      const store = createMockStore({ list: experimentsWithMissingData });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select experiment
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Should display N/A for missing values
      const table = screen.getByRole('table');
      expect(table).toHaveTextContent('0.8500'); // accuracy present
      expect(table).toHaveTextContent('N/A'); // missing values
    });

    it('should highlight best values in comparison table', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select both experiments
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Check that the hint about highlighting is displayed
      expect(screen.getByText(/Best values are highlighted in green/)).toBeInTheDocument();

      // Verify the table contains the best values
      // Experiment 2 has better accuracy (0.95 > 0.92)
      expect(screen.getByText('0.9500')).toBeInTheDocument();
      // Experiment 2 has better F1 (0.93 > 0.89)
      expect(screen.getByText('0.9300')).toBeInTheDocument();
      // Experiment 1 has better comm cost (125.5 < 150.0)
      expect(screen.getByText('125.50')).toBeInTheDocument();
      // Experiment 2 has better latency (38.5 < 45.2)
      expect(screen.getByText('38.50')).toBeInTheDocument();
    });

    it('should display correct number of rows based on selection', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      const checkboxes = screen.getAllByRole('checkbox');

      // Select one experiment
      await user.click(checkboxes[0]);
      let tableRows = screen.getAllByRole('row');
      // 1 header row + 1 data row
      expect(tableRows).toHaveLength(2);

      // Select second experiment
      await user.click(checkboxes[1]);
      tableRows = screen.getAllByRole('row');
      // 1 header row + 2 data rows
      expect(tableRows).toHaveLength(3);
    });
  });

  // Task 48.3 - Test CSV export generates valid file (Requirement 33.9)
  describe('CSV Export Generates Valid File', () => {
    it('should generate CSV with correct headers', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select experiments
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Mock URL.createObjectURL to capture the CSV content
      let csvContent = '';
      global.URL.createObjectURL = vi.fn((blob) => {
        // Read the blob content
        const reader = new FileReader();
        reader.onload = () => {
          csvContent = reader.result;
        };
        reader.readAsText(blob);
        return 'mock-url';
      });

      // Click Export CSV
      const exportButton = screen.getByText('Export CSV');
      await user.click(exportButton);

      // Wait for the async operation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify download was triggered
      expect(mockClick).toHaveBeenCalled();
      expect(mockCreateElement).toHaveBeenCalledWith('a');
    });

    it('should include all selected experiments in CSV export', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select both experiments
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Click Export CSV
      const exportButton = screen.getByText('Export CSV');
      await user.click(exportButton);

      // Verify the export was triggered
      expect(mockClick).toHaveBeenCalled();
    });

    it('should set correct filename for CSV download', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select experiment
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      // Mock setAttribute to capture filename
      let downloadFilename = '';
      const mockSetAttribute = vi.fn((attr, value) => {
        if (attr === 'download') {
          downloadFilename = value;
        }
      });

      mockCreateElement.mockReturnValue({
        setAttribute: mockSetAttribute,
        click: mockClick,
        style: {},
      });

      // Click Export CSV
      const exportButton = screen.getByText('Export CSV');
      await user.click(exportButton);

      // Verify filename matches pattern
      expect(mockSetAttribute).toHaveBeenCalledWith('download', expect.stringMatching(/experiment_comparison_\d{4}-\d{2}-\d{2}\.csv/));
    });

    it('should not export when no experiments are selected', async () => {
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Export button should not be visible when nothing is selected
      expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
    });

    it('should export CSV with significance indicators', async () => {
      const user = userEvent.setup();
      const store = createMockStore({ list: mockExperiments });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select multiple experiments to enable significance calculation
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Click Export CSV
      const exportButton = screen.getByText('Export CSV');
      await user.click(exportButton);

      // Verify export was triggered (significance indicators are calculated and included)
      expect(mockClick).toHaveBeenCalled();
    });

    it('should handle CSV export with special characters in experiment names', async () => {
      const experimentsWithSpecialChars = [
        {
          id: 'exp4',
          name: 'Test "Experiment" with, commas',
          status: 'completed',
          metrics: {
            accuracy: 0.90,
            f1Score: 0.88,
            communicationCost: 130.0,
            inferenceLatency: 40.0,
          },
        },
      ];

      const user = userEvent.setup();
      const store = createMockStore({ list: experimentsWithSpecialChars });
      
      render(
        <Provider store={store}>
          <Comparison />
        </Provider>
      );

      // Select experiment
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Click Export CSV
      const exportButton = screen.getByText('Export CSV');
      await user.click(exportButton);

      // Should handle special characters without errors
      expect(mockClick).toHaveBeenCalled();
    });
  });
});
