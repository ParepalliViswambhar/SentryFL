/**
 * Export Utilities Tests
 * 
 * Tests for export functionality:
 * - PNG export generates valid image
 * - CSV export contains correct data
 * - Report generation includes all sections
 * 
 * Requirements: 39.2, 39.3, 39.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportChartAsPNG,
  exportChartAsSVG,
  exportMetricsAsCSV,
  exportAsJSON,
  exportConfigAsYAML,
  exportAnomalyResults,
  exportComparisonTableLaTeX,
  PUBLICATION_DPI,
  DEFAULT_DPI,
} from './exportUtils';

describe('exportUtils', () => {
  let mockChartRef;
  let mockCanvas;
  let createElementSpy;
  let clickSpy;

  beforeEach(() => {
    // Mock canvas and chart
    mockCanvas = {
      width: 800,
      height: 600,
      toDataURL: vi.fn(() => 'data:image/png;base64,mockdata'),
      toBlob: vi.fn((callback) => {
        callback(new Blob(['mock'], { type: 'image/png' }));
      }),
      getContext: vi.fn(() => ({
        scale: vi.fn(),
        drawImage: vi.fn(),
      })),
    };

    mockChartRef = {
      current: {
        canvas: mockCanvas,
        toBase64Image: vi.fn(() => 'data:image/png;base64,mockdata'),
      },
    };

    // Mock document.createElement
    createElementSpy = vi.spyOn(document, 'createElement');
    clickSpy = vi.fn();
    
    const mockLink = {
      click: clickSpy,
      href: '',
      download: '',
    };

    const mockCanvas2 = {
      ...mockCanvas,
      toBlob: vi.fn((callback) => callback(new Blob(['mock'], { type: 'image/png' }))),
    };

    createElementSpy.mockImplementation((tagName) => {
      if (tagName === 'a') {
        return mockLink;
      } else if (tagName === 'canvas') {
        return mockCanvas2;
      }
      return {};
    });

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportChartAsPNG', () => {
    it('should export chart as PNG with publication DPI', async () => {
      // Set up toBlob callback
      const mockScaledCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          scale: vi.fn(),
          drawImage: vi.fn(),
        })),
        toBlob: vi.fn((callback) => {
          callback(new Blob(['mock'], { type: 'image/png' }));
        }),
      };

      createElementSpy.mockImplementation((tagName) => {
        if (tagName === 'a') return { click: clickSpy, href: '', download: '' };
        if (tagName === 'canvas') return mockScaledCanvas;
        return {};
      });

      await exportChartAsPNG(mockChartRef, 'test-chart', PUBLICATION_DPI);

      expect(mockScaledCanvas.toBlob).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should scale canvas for high DPI', async () => {
      const mockContext = {
        scale: vi.fn(),
        drawImage: vi.fn(),
      };

      const scaledCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(new Blob())),
      };

      createElementSpy.mockImplementation((tagName) => {
        if (tagName === 'canvas') return scaledCanvas;
        if (tagName === 'a') return { click: clickSpy, href: '', download: '' };
        return {};
      });

      await exportChartAsPNG(mockChartRef, 'test-chart', PUBLICATION_DPI);

      const scaleFactor = PUBLICATION_DPI / DEFAULT_DPI;
      expect(scaledCanvas.width).toBe(mockCanvas.width * scaleFactor);
      expect(scaledCanvas.height).toBe(mockCanvas.height * scaleFactor);
      expect(mockContext.scale).toHaveBeenCalledWith(scaleFactor, scaleFactor);
    });

    it('should throw error when chart ref is not available', async () => {
      const invalidRef = { current: null };
      
      await expect(exportChartAsPNG(invalidRef, 'test-chart')).rejects.toThrow(
        'Chart reference is not available'
      );
    });

    it('should generate valid image filename', async () => {
      const mockLink = { click: clickSpy, href: '', download: '' };
      createElementSpy.mockImplementation((tagName) => {
        if (tagName === 'a') return mockLink;
        if (tagName === 'canvas') return mockCanvas;
        return {};
      });

      await exportChartAsPNG(mockChartRef, 'my-test-chart', PUBLICATION_DPI);

      expect(mockLink.download).toBe('my-test-chart.png');
    });
  });

  describe('exportChartAsSVG', () => {
    it('should export chart as SVG', () => {
      exportChartAsSVG(mockChartRef, 'test-chart');

      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
      expect(clickSpy).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('should embed PNG data in SVG', () => {
      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
          this.type = options.type;
        }
      };

      exportChartAsSVG(mockChartRef, 'test-chart');

      expect(blobConstructor).toHaveBeenCalled();
      const [[svgContent], options] = blobConstructor.mock.calls[0];
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('xlink:href="data:image/png;base64,mockdata"');
      expect(options.type).toBe('image/svg+xml;charset=utf-8');
    });

    it('should throw error when chart ref is not available', () => {
      const invalidRef = { current: null };
      
      expect(() => exportChartAsSVG(invalidRef, 'test-chart')).toThrow(
        'Chart reference is not available'
      );
    });
  });

  describe('exportMetricsAsCSV', () => {
    it('should export metrics as CSV with correct data', () => {
      const metrics = [
        { round: 1, loss: 0.5, accuracy: 0.8 },
        { round: 2, loss: 0.4, accuracy: 0.85 },
        { round: 3, loss: 0.3, accuracy: 0.9 },
      ];

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
          this.type = options.type;
        }
      };

      exportMetricsAsCSV(metrics, 'test-metrics');

      expect(blobConstructor).toHaveBeenCalled();
      const [[csvContent], options] = blobConstructor.mock.calls[0];
      
      // Check CSV header
      expect(csvContent).toContain('round,loss,accuracy');
      
      // Check CSV rows
      expect(csvContent).toContain('1,0.5,0.8');
      expect(csvContent).toContain('2,0.4,0.85');
      expect(csvContent).toContain('3,0.3,0.9');
      
      expect(options.type).toBe('text/csv;charset=utf-8;');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should handle metrics with commas in values', () => {
      const metrics = [
        { name: 'Test, Experiment', value: 'Data, with, commas' },
      ];

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportMetricsAsCSV(metrics, 'test-metrics');

      const [[csvContent]] = blobConstructor.mock.calls[0];
      expect(csvContent).toContain('"Test, Experiment"');
      expect(csvContent).toContain('"Data, with, commas"');
    });

    it('should handle null and undefined values', () => {
      const metrics = [
        { round: 1, loss: null, accuracy: undefined },
      ];

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportMetricsAsCSV(metrics, 'test-metrics');

      const [[csvContent]] = blobConstructor.mock.calls[0];
      expect(csvContent).toContain('1,,');
    });

    it('should throw error when no data provided', () => {
      expect(() => exportMetricsAsCSV([], 'test-metrics')).toThrow('No data to export');
      expect(() => exportMetricsAsCSV(null, 'test-metrics')).toThrow('No data to export');
    });

    it('should export only specified columns', () => {
      const metrics = [
        { round: 1, loss: 0.5, accuracy: 0.8, extra: 'data' },
      ];

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportMetricsAsCSV(metrics, 'test-metrics', ['round', 'loss']);

      const [[csvContent]] = blobConstructor.mock.calls[0];
      expect(csvContent).toContain('round,loss');
      expect(csvContent).not.toContain('accuracy');
      expect(csvContent).not.toContain('extra');
    });
  });

  describe('exportAsJSON', () => {
    it('should export data as prettified JSON', () => {
      const data = { foo: 'bar', nested: { value: 123 } };

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
          this.type = options.type;
        }
      };

      exportAsJSON(data, 'test-data');

      expect(blobConstructor).toHaveBeenCalled();
      const [[jsonContent], options] = blobConstructor.mock.calls[0];
      
      expect(jsonContent).toBe(JSON.stringify(data, null, 2));
      expect(options.type).toBe('application/json;charset=utf-8;');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should export data as minified JSON when prettify is false', () => {
      const data = { foo: 'bar' };

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportAsJSON(data, 'test-data', false);

      const [[jsonContent]] = blobConstructor.mock.calls[0];
      expect(jsonContent).toBe(JSON.stringify(data));
    });

    it('should throw error when no data provided', () => {
      expect(() => exportAsJSON(null, 'test-data')).toThrow('No data to export');
    });
  });

  describe('exportConfigAsYAML', () => {
    it('should export configuration as YAML', () => {
      const config = {
        model: 'test-model',
        training: {
          epochs: 10,
          batch_size: 32,
        },
        privacy: {
          epsilon: 1.0,
          delta: 1e-5,
        },
      };

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
          this.type = options.type;
        }
      };

      exportConfigAsYAML(config, 'test-config');

      expect(blobConstructor).toHaveBeenCalled();
      const [[yamlContent], options] = blobConstructor.mock.calls[0];
      
      expect(yamlContent).toContain('model: test-model');
      expect(yamlContent).toContain('training:');
      expect(yamlContent).toContain('epochs: 10');
      expect(yamlContent).toContain('batch_size: 32');
      expect(yamlContent).toContain('privacy:');
      expect(yamlContent).toContain('epsilon: 1');
      
      expect(options.type).toBe('text/yaml;charset=utf-8;');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should handle arrays in YAML', () => {
      const config = {
        items: ['item1', 'item2', 'item3'],
      };

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportConfigAsYAML(config, 'test-config');

      const [[yamlContent]] = blobConstructor.mock.calls[0];
      expect(yamlContent).toContain('items:');
      expect(yamlContent).toContain('- item1');
      expect(yamlContent).toContain('- item2');
      expect(yamlContent).toContain('- item3');
    });

    it('should throw error when no config provided', () => {
      expect(() => exportConfigAsYAML(null, 'test-config')).toThrow('No configuration to export');
    });
  });

  describe('exportAnomalyResults', () => {
    it('should export anomaly results with timestamps', () => {
      const anomalies = [
        { timestamp: '2024-01-01T00:00:00Z', score: 0.8, predicted: 1 },
        { timestamp: '2024-01-01T00:01:00Z', score: 0.9, predicted: 1 },
      ];

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportAnomalyResults(anomalies, 'exp-123');

      expect(blobConstructor).toHaveBeenCalled();
      const [[csvContent]] = blobConstructor.mock.calls[0];
      
      expect(csvContent).toContain('timestamp,score,predicted');
      expect(csvContent).toContain('2024-01-01T00:00:00Z,0.8,1');
      expect(csvContent).toContain('2024-01-01T00:01:00Z,0.9,1');
    });

    it('should add timestamps if missing', () => {
      const anomalies = [
        { score: 0.8, predicted: 1 },
      ];

      const blobConstructor = vi.fn();
      global.Blob = class {
        constructor(content, options) {
          blobConstructor(content, options);
          this.content = content;
        }
      };

      exportAnomalyResults(anomalies, 'exp-123');

      const [[csvContent]] = blobConstructor.mock.calls[0];
      expect(csvContent).toContain('timestamp');
    });

    it('should throw error when no anomalies provided', () => {
      expect(() => exportAnomalyResults([], 'exp-123')).toThrow('No anomaly results to export');
    });
  });

  describe('exportComparisonTableLaTeX', () => {
    it('should generate LaTeX table with correct format', () => {
      const data = [
        { Experiment: 'Exp1', f1Score: 0.92, precision: 0.90, recall: 0.94 },
        { Experiment: 'Exp2', f1Score: 0.88, precision: 0.86, recall: 0.90 },
      ];

      const columns = ['Experiment', 'f1Score', 'precision', 'recall'];
      const latex = exportComparisonTableLaTeX(
        data,
        columns,
        'Test Caption',
        'tab:test'
      );

      expect(latex).toContain('\\begin{table}[htbp]');
      expect(latex).toContain('\\caption{Test Caption}');
      expect(latex).toContain('\\label{tab:test}');
      expect(latex).toContain('\\begin{tabular}');
      expect(latex).toContain('\\hline');
      expect(latex).toContain('Experiment & f1Score & precision & recall');
      expect(latex).toContain('Exp1 & 0.9200 & 0.9000 & 0.9400');
      expect(latex).toContain('Exp2 & 0.8800 & 0.8600 & 0.9000');
      expect(latex).toContain('\\end{tabular}');
      expect(latex).toContain('\\end{table}');
    });

    it('should format numbers to 4 decimal places', () => {
      const data = [
        { Metric: 'AUC', Value: 0.123456789 },
      ];

      const latex = exportComparisonTableLaTeX(
        data,
        ['Metric', 'Value'],
        'Test',
        'tab:test'
      );

      expect(latex).toContain('0.1235');
    });

    it('should throw error when no data provided', () => {
      expect(() =>
        exportComparisonTableLaTeX([], ['col1'], 'Caption', 'label')
      ).toThrow('No data to export');
    });
  });
});

