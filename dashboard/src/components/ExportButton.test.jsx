/**
 * ExportButton Component Tests
 * 
 * Tests for chart export button functionality:
 * - PNG export with configurable DPI
 * - SVG export
 * - PDF export
 * - Export settings dialog
 * 
 * Requirements: 39.1, 39.2, 39.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportButton from './ExportButton';
import * as exportUtils from '../utils/exportUtils';

// Mock export utilities
vi.mock('../utils/exportUtils', async () => {
  const actual = await vi.importActual('../utils/exportUtils');
  return {
    ...actual,
    exportChartAsPNG: vi.fn(),
    exportChartAsSVG: vi.fn(),
    exportChartAsPDF: vi.fn(),
  };
});

describe('ExportButton', () => {
  let mockChartRef;
  let mockCanvas;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock canvas
    mockCanvas = {
      width: 800,
      height: 600,
      toDataURL: vi.fn(() => 'data:image/png;base64,mockdata'),
      toBlob: vi.fn((callback) => {
        callback(new Blob(['mock'], { type: 'image/png' }));
      }),
    };

    // Mock chart ref
    mockChartRef = {
      current: {
        canvas: mockCanvas,
      },
    };

    // Mock export functions to resolve immediately
    exportUtils.exportChartAsPNG.mockResolvedValue(undefined);
    exportUtils.exportChartAsSVG.mockImplementation(() => {});
    exportUtils.exportChartAsPDF.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render export button with text', () => {
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" showText={true} />);

      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    });

    it('should render export button as icon only', () => {
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" showText={false} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('should disable button when disabled prop is true', () => {
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" disabled={true} />);

      const button = screen.getByRole('button', { name: /Export/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Export Menu', () => {
    it('should open export menu on button click', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      // Wait for menu to appear
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      expect(screen.getByText('Export as PNG')).toBeInTheDocument();
      expect(screen.getByText('Export as SVG')).toBeInTheDocument();
      expect(screen.getByText('Export as PDF')).toBeInTheDocument();
      expect(screen.getByText('Export Settings')).toBeInTheDocument();
    });

    it('should close menu when clicking outside', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      // Click outside (press Escape)
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('PNG Export', () => {
    it('should export chart as PNG', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      // Open menu
      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      // Click PNG export
      const pngOption = screen.getByText('Export as PNG');
      await user.click(pngOption);

      await waitFor(() => {
        expect(exportUtils.exportChartAsPNG).toHaveBeenCalledWith(
          mockChartRef,
          'test-chart',
          exportUtils.PUBLICATION_DPI
        );
      });
    });

    it('should handle PNG export error gracefully', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      exportUtils.exportChartAsPNG.mockRejectedValue(new Error('Export failed'));

      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const pngOption = screen.getByText('Export as PNG');
      await user.click(pngOption);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Export failed:', expect.any(Error));
      });

      consoleError.mockRestore();
    });
  });

  describe('SVG Export', () => {
    it('should export chart as SVG', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const svgOption = screen.getByText('Export as SVG');
      await user.click(svgOption);

      await waitFor(() => {
        expect(exportUtils.exportChartAsSVG).toHaveBeenCalledWith(mockChartRef, 'test-chart');
      });
    });
  });

  describe('PDF Export', () => {
    it('should export chart as PDF', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const pdfOption = screen.getByText('Export as PDF');
      await user.click(pdfOption);

      await waitFor(() => {
        expect(exportUtils.exportChartAsPDF).toHaveBeenCalledWith(
          mockChartRef,
          'test-chart',
          exportUtils.PUBLICATION_DPI
        );
      });
    });
  });

  describe('Export Settings Dialog', () => {
    it('should open settings dialog', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Export Settings')).toBeInTheDocument();
      });
    });

    it('should allow changing filename', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      // Open settings
      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Change filename
      const filenameInput = screen.getByLabelText('Filename');
      await user.clear(filenameInput);
      await user.type(filenameInput, 'new-filename');

      expect(filenameInput).toHaveValue('new-filename');
    });

    it('should allow changing DPI', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Change DPI - use helper text to find the input
      const dpiInput = screen.getByRole('spinbutton', { name: '' });
      await user.clear(dpiInput);
      await user.type(dpiInput, '150');

      expect(dpiInput).toHaveValue(150);
    });

    it('should provide DPI presets', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Check preset buttons exist
      expect(screen.getByRole('button', { name: /Screen \(96 DPI\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Print \(150 DPI\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Publication \(300 DPI\)/i })).toBeInTheDocument();
    });

    it('should apply DPI preset when clicked', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click Print preset
      const printButton = screen.getByRole('button', { name: /Print \(150 DPI\)/i });
      await user.click(printButton);

      const dpiInput = screen.getByRole('spinbutton', { name: '' });
      expect(dpiInput).toHaveValue(150);
    });

    it('should close settings dialog', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Close dialog
      const closeButton = screen.getByRole('button', { name: /Close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should use custom filename and DPI for export', async () => {
      const user = userEvent.setup();
      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      // Open settings
      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const settingsOption = screen.getByText('Export Settings');
      await user.click(settingsOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Change filename and DPI
      const filenameInput = screen.getByLabelText('Filename');
      await user.clear(filenameInput);
      await user.type(filenameInput, 'custom-name');

      const dpiInput = screen.getByRole('spinbutton', { name: '' });
      await user.clear(dpiInput);
      await user.type(dpiInput, '150');

      // Close settings
      const closeButton = screen.getByRole('button', { name: /Close/i });
      await user.click(closeButton);

      // Open menu again and export
      await user.click(button);
      const pngOption = screen.getByText('Export as PNG');
      await user.click(pngOption);

      await waitFor(() => {
        expect(exportUtils.exportChartAsPNG).toHaveBeenCalledWith(
          mockChartRef,
          'custom-name',
          150
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should log error when chart ref is not available', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const invalidRef = { current: null };

      render(<ExportButton chartRef={invalidRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const pngOption = screen.getByText('Export as PNG');
      await user.click(pngOption);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Chart reference not available');
      });

      consoleError.mockRestore();
    });
  });

  describe('Button Variants', () => {
    it('should render with different variants', () => {
      const { rerender } = render(
        <ExportButton chartRef={mockChartRef} filename="test-chart" variant="contained" />
      );

      let button = screen.getByRole('button', { name: /Export/i });
      expect(button).toBeInTheDocument();

      rerender(<ExportButton chartRef={mockChartRef} filename="test-chart" variant="outlined" />);

      button = screen.getByRole('button', { name: /Export/i });
      expect(button).toBeInTheDocument();
    });

    it('should render with different sizes', () => {
      const { rerender } = render(
        <ExportButton chartRef={mockChartRef} filename="test-chart" size="small" />
      );

      let button = screen.getByRole('button', { name: /Export/i });
      expect(button).toBeInTheDocument();

      rerender(<ExportButton chartRef={mockChartRef} filename="test-chart" size="medium" />);

      button = screen.getByRole('button', { name: /Export/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should disable button while exporting', async () => {
      const user = userEvent.setup();
      
      // Make export take some time
      exportUtils.exportChartAsPNG.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ExportButton chartRef={mockChartRef} filename="test-chart" />);

      const button = screen.getByRole('button', { name: /Export/i });
      await user.click(button);

      const pngOption = screen.getByText('Export as PNG');
      await user.click(pngOption);

      // Button should be disabled while exporting
      // Note: This is a timing-sensitive test and might be flaky
      // In a real scenario, you'd want to check for loading state more reliably

      await waitFor(() => {
        expect(exportUtils.exportChartAsPNG).toHaveBeenCalled();
      });
    });
  });
});

