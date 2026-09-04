/**
 * Export Utilities
 * 
 * Provides functions for exporting charts, metrics, and configurations in various formats:
 * - Charts: PNG, SVG, PDF
 * - Metrics: CSV, JSON
 * - Configuration: YAML, JSON
 * 
 * Requirements: 39.1, 39.2, 39.3, 39.4, 39.6
 * 
 * @module utils/exportUtils
 */

import JSZip from 'jszip';

/**
 * Default DPI for publication-ready figures
 */
export const PUBLICATION_DPI = 300;
export const DEFAULT_DPI = 96;

/**
 * Export chart as PNG with configurable DPI
 * 
 * @param {Object} chartRef - React ref to Chart.js instance
 * @param {string} filename - Filename without extension
 * @param {number} dpi - DPI for export (default: 300 for publication quality)
 * @returns {Promise<void>}
 */
export const exportChartAsPNG = async (chartRef, filename, dpi = PUBLICATION_DPI) => {
  if (!chartRef.current) {
    throw new Error('Chart reference is not available');
  }

  const chart = chartRef.current;
  const canvas = chart.canvas;
  
  // Calculate scale factor for DPI
  const scaleFactor = dpi / DEFAULT_DPI;
  
  // Create a new canvas with scaled dimensions
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = canvas.width * scaleFactor;
  scaledCanvas.height = canvas.height * scaleFactor;
  
  const ctx = scaledCanvas.getContext('2d');
  ctx.scale(scaleFactor, scaleFactor);
  ctx.drawImage(canvas, 0, 0);
  
  // Convert to blob and download
  scaledCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
};

/**
 * Export chart as SVG
 * 
 * Note: This creates an SVG wrapper around the canvas image.
 * For true vector export, consider using chart-specific SVG libraries.
 * 
 * @param {Object} chartRef - React ref to Chart.js instance
 * @param {string} filename - Filename without extension
 * @returns {void}
 */
export const exportChartAsSVG = (chartRef, filename) => {
  if (!chartRef.current) {
    throw new Error('Chart reference is not available');
  }

  const chart = chartRef.current;
  const canvas = chart.canvas;
  const dataUrl = canvas.toDataURL('image/png');
  
  // Create SVG with embedded PNG
  const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" xlink:href="${dataUrl}"/>
</svg>`;
  
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.svg`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export chart as PDF
 * 
 * Creates a PDF document containing the chart image
 * 
 * @param {Object} chartRef - React ref to Chart.js instance
 * @param {string} filename - Filename without extension
 * @param {number} dpi - DPI for export (default: 300)
 * @returns {Promise<void>}
 */
export const exportChartAsPDF = async (chartRef, filename, dpi = PUBLICATION_DPI) => {
  if (!chartRef.current) {
    throw new Error('Chart reference is not available');
  }

  // Dynamic import of jspdf to reduce bundle size
  const { jsPDF } = await import('jspdf');
  
  const chart = chartRef.current;
  const canvas = chart.canvas;
  
  // Get high-resolution image
  const scaleFactor = dpi / DEFAULT_DPI;
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = canvas.width * scaleFactor;
  scaledCanvas.height = canvas.height * scaleFactor;
  
  const ctx = scaledCanvas.getContext('2d');
  ctx.scale(scaleFactor, scaleFactor);
  ctx.drawImage(canvas, 0, 0);
  
  const imgData = scaledCanvas.toDataURL('image/png');
  
  // Calculate PDF dimensions (in mm)
  const pdfWidth = 210; // A4 width in mm
  const pdfHeight = (canvas.height / canvas.width) * pdfWidth;
  
  const pdf = new jsPDF({
    orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  
  pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth - 20, pdfHeight - 20);
  pdf.save(`${filename}.pdf`);
};

/**
 * Export metrics data as CSV
 * 
 * @param {Array<Object>} data - Array of metric objects
 * @param {string} filename - Filename without extension
 * @param {Array<string>} columns - Optional array of column names to include
 * @returns {void}
 */
export const exportMetricsAsCSV = (data, filename, columns = null) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Determine columns
  const allKeys = columns || Object.keys(data[0]);
  
  // Create CSV header
  const csvHeader = allKeys.join(',');
  
  // Create CSV rows
  const csvRows = data.map((row) => {
    return allKeys.map((key) => {
      const value = row[key];
      // Handle special cases
      if (value === null || value === undefined) {
        return '';
      }
      // Escape quotes and wrap in quotes if contains comma
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',');
  });
  
  // Combine header and rows
  const csvContent = [csvHeader, ...csvRows].join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export data as JSON
 * 
 * @param {Object|Array} data - Data to export
 * @param {string} filename - Filename without extension
 * @param {boolean} prettify - Whether to format JSON with indentation
 * @returns {void}
 */
export const exportAsJSON = (data, filename, prettify = true) => {
  if (!data) {
    throw new Error('No data to export');
  }

  const jsonString = prettify ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export configuration as YAML
 * 
 * @param {Object} config - Configuration object
 * @param {string} filename - Filename without extension
 * @returns {void}
 */
export const exportConfigAsYAML = (config, filename) => {
  if (!config) {
    throw new Error('No configuration to export');
  }

  // Simple YAML serialization (for complex YAML, consider using js-yaml library)
  const yamlString = objectToYAML(config);
  
  const blob = new Blob([yamlString], { type: 'text/yaml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.yaml`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Simple object to YAML converter
 * 
 * @param {Object} obj - Object to convert
 * @param {number} indent - Current indentation level
 * @returns {string} YAML string
 */
const objectToYAML = (obj, indent = 0) => {
  const spaces = '  '.repeat(indent);
  let yaml = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${spaces}${key}: null\n`;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      yaml += objectToYAML(value, indent + 1);
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      value.forEach((item) => {
        if (typeof item === 'object') {
          yaml += `${spaces}  -\n`;
          yaml += objectToYAML(item, indent + 2);
        } else {
          yaml += `${spaces}  - ${item}\n`;
        }
      });
    } else if (typeof value === 'string') {
      // Escape strings that need quoting
      const needsQuotes = value.includes(':') || value.includes('#') || value.includes('\n');
      yaml += `${spaces}${key}: ${needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value}\n`;
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }
  
  return yaml;
};

/**
 * Export configuration as JSON
 * 
 * @param {Object} config - Configuration object
 * @param {string} filename - Filename without extension
 * @returns {void}
 */
export const exportConfigAsJSON = (config, filename) => {
  exportAsJSON(config, filename, true);
};

/**
 * Create a ZIP archive with multiple files
 * 
 * @param {Array<{filename: string, content: Blob|string}>} files - Array of files to include
 * @param {string} zipFilename - Name of the ZIP file
 * @returns {Promise<void>}
 */
export const createZipArchive = async (files, zipFilename) => {
  const zip = new JSZip();
  
  for (const file of files) {
    if (file.content instanceof Blob) {
      zip.file(file.filename, file.content);
    } else {
      zip.file(file.filename, file.content);
    }
  }
  
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = zipFilename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Convert canvas to blob with specific DPI
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} dpi - Target DPI
 * @returns {Promise<Blob>}
 */
export const canvasToBlob = (canvas, dpi = PUBLICATION_DPI) => {
  return new Promise((resolve, reject) => {
    const scaleFactor = dpi / DEFAULT_DPI;
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = canvas.width * scaleFactor;
    scaledCanvas.height = canvas.height * scaleFactor;
    
    const ctx = scaledCanvas.getContext('2d');
    ctx.scale(scaleFactor, scaleFactor);
    ctx.drawImage(canvas, 0, 0);
    
    scaledCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/png');
  });
};

/**
 * Export anomaly detection results with timestamps
 * 
 * @param {Array<Object>} anomalies - Array of anomaly detection results
 * @param {string} filename - Filename without extension
 * @returns {void}
 */
export const exportAnomalyResults = (anomalies, filename) => {
  if (!anomalies || anomalies.length === 0) {
    throw new Error('No anomaly results to export');
  }

  // Ensure each anomaly has a timestamp
  const enrichedAnomalies = anomalies.map((anomaly) => ({
    timestamp: anomaly.timestamp || new Date().toISOString(),
    ...anomaly,
  }));

  exportMetricsAsCSV(enrichedAnomalies, filename);
};

/**
 * Export comparison table in LaTeX format
 * 
 * @param {Array<Object>} data - Array of comparison data
 * @param {Array<string>} columns - Column headers
 * @param {string} caption - Table caption
 * @param {string} label - Table label for referencing
 * @returns {string} LaTeX table string
 */
export const exportComparisonTableLaTeX = (data, columns, caption, label) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Build LaTeX table
  const columnSpec = 'l' + 'c'.repeat(columns.length - 1); // First column left-aligned, rest centered
  
  let latex = `\\begin{table}[htbp]
\\centering
\\caption{${caption}}
\\label{${label}}
\\begin{tabular}{${columnSpec}}
\\hline
`;

  // Add header row
  latex += columns.join(' & ') + ' \\\\\n\\hline\n';

  // Add data rows
  data.forEach((row) => {
    const rowValues = columns.map((col) => {
      const value = row[col];
      if (typeof value === 'number') {
        // Format numbers to 4 decimal places
        return value.toFixed(4);
      }
      return String(value || '');
    });
    latex += rowValues.join(' & ') + ' \\\\\n';
  });

  latex += `\\hline
\\end{tabular}
\\end{table}`;

  return latex;
};

/**
 * Download LaTeX table
 * 
 * @param {string} latexContent - LaTeX table content
 * @param {string} filename - Filename without extension
 * @returns {void}
 */
export const downloadLaTeXTable = (latexContent, filename) => {
  const blob = new Blob([latexContent], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.tex`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};
