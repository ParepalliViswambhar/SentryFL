/**
 * Unit Tests for Python Backend Service
 * 
 * Tests HTTP client functionality for Python backend communication
 * 
 * Requirements: 26.1, 26.2, 26.3, 26.5
 */

const pythonBackend = require('./pythonBackend');
const axiosClient = require('../utils/axiosClient');

// Mock axios client
jest.mock('../utils/axiosClient');

describe('PythonBackendService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startTraining', () => {
    it('should send POST request to start training', async () => {
      // Arrange
      const config = {
        dataset: 'MNIST',
        model_type: 'cnn',
        num_rounds: 10,
      };
      const callbackUrl = 'http://localhost:3000/api/callback';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          status: 'queued',
          created_at: '2024-01-01T00:00:00Z',
        },
      };

      axiosClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.startTraining(config, callbackUrl);

      // Assert
      expect(axiosClient.post).toHaveBeenCalledWith('/api/train', {
        ...config,
        callback_url: callbackUrl,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle missing callback URL', async () => {
      // Arrange
      const config = { dataset: 'MNIST' };
      const mockResponse = {
        data: { experiment_id: 'exp-123', status: 'queued' },
      };

      axiosClient.post.mockResolvedValue(mockResponse);

      // Act
      await pythonBackend.startTraining(config);

      // Assert
      expect(axiosClient.post).toHaveBeenCalledWith('/api/train', {
        ...config,
        callback_url: null,
      });
    });
  });

  describe('stopTraining', () => {
    it('should send DELETE request to stop training', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          status: 'stopped',
          message: 'Training stopped successfully',
        },
      };

      axiosClient.delete.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.stopTraining(experimentId);

      // Assert
      expect(axiosClient.delete).toHaveBeenCalledWith('/api/train/exp-123');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('pauseTraining', () => {
    it('should send POST request to pause training', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          status: 'paused',
        },
      };

      axiosClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.pauseTraining(experimentId);

      // Assert
      expect(axiosClient.post).toHaveBeenCalledWith('/api/train/exp-123/pause');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('resumeTraining', () => {
    it('should send POST request to resume training', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          status: 'running',
        },
      };

      axiosClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.resumeTraining(experimentId);

      // Assert
      expect(axiosClient.post).toHaveBeenCalledWith('/api/train/exp-123/resume');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getStatus', () => {
    it('should send GET request to retrieve status', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          status: 'running',
          progress: 50,
          current_round: 5,
          total_rounds: 10,
        },
      };

      axiosClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.getStatus(experimentId);

      // Assert
      expect(axiosClient.get).toHaveBeenCalledWith('/api/train/exp-123/status');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getMetrics', () => {
    it('should send GET request to retrieve metrics', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          metrics: {
            loss: 0.5,
            accuracy: 0.85,
            f1_score: 0.82,
          },
          round: 5,
        },
      };

      axiosClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.getMetrics(experimentId);

      // Assert
      expect(axiosClient.get).toHaveBeenCalledWith('/api/train/exp-123/metrics');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getReport', () => {
    it('should send GET request to retrieve report', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          final_metrics: { accuracy: 0.90 },
          training_duration: 3600,
        },
      };

      axiosClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.getReport(experimentId);

      // Assert
      expect(axiosClient.get).toHaveBeenCalledWith('/api/train/exp-123/report');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('listExperiments', () => {
    it('should send GET request to list all experiments', async () => {
      // Arrange
      const mockResponse = {
        data: [
          { experiment_id: 'exp-123', status: 'running' },
          { experiment_id: 'exp-456', status: 'completed' },
        ],
      };

      axiosClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.listExperiments();

      // Assert
      expect(axiosClient.get).toHaveBeenCalledWith('/api/train');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getExperiment', () => {
    it('should send GET request to retrieve experiment details', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        data: {
          experiment_id: 'exp-123',
          config: { dataset: 'MNIST' },
          status: 'running',
        },
      };

      axiosClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.getExperiment(experimentId);

      // Assert
      expect(axiosClient.get).toHaveBeenCalledWith('/api/train/exp-123');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('healthCheck', () => {
    it('should send GET request to health endpoint', async () => {
      // Arrange
      const mockResponse = {
        data: {
          status: 'healthy',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };

      axiosClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.healthCheck();

      // Assert
      expect(axiosClient.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('validateConfig', () => {
    it('should send POST request to validate config', async () => {
      // Arrange
      const config = {
        dataset: 'MNIST',
        model_type: 'cnn',
      };
      const mockResponse = {
        data: {
          valid: true,
          errors: [],
        },
      };

      axiosClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await pythonBackend.validateConfig(config);

      // Assert
      expect(axiosClient.post).toHaveBeenCalledWith('/api/validate', config);
      expect(result).toEqual(mockResponse.data);
    });
  });
});
