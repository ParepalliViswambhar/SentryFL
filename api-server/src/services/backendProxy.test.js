/**
 * Unit Tests for Backend Proxy Service
 * 
 * Tests retry logic, error handling, validation, and caching
 * 
 * Requirements: 26.6, 26.7, 26.8, 26.9, 26.10
 */

const backendProxy = require('./backendProxy');
const pythonBackend = require('./pythonBackend');
const cacheService = require('./cacheService');

// Mock dependencies
jest.mock('./pythonBackend');
jest.mock('./cacheService');

describe('BackendProxyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      // Arrange
      const mockFn = jest.fn().mockResolvedValue({ success: true });

      // Act
      const result = await backendProxy.withRetry(mockFn);

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on network failures with exponential backoff', async () => {
      // Arrange
      const mockFn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue({ success: true });

      jest.spyOn(backendProxy, 'sleep').mockResolvedValue();

      // Act
      const result = await backendProxy.withRetry(mockFn, {
        maxRetries: 3,
        initialDelayMs: 100,
      });

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(backendProxy.sleep).toHaveBeenCalledTimes(2);
      expect(backendProxy.sleep).toHaveBeenNthCalledWith(1, 100);
      expect(backendProxy.sleep).toHaveBeenNthCalledWith(2, 200);
    });

    it('should not retry on 4xx client errors', async () => {
      // Arrange
      const mockFn = jest.fn().mockRejectedValue({
        response: { status: 400 },
        message: 'Bad Request',
      });

      // Act & Assert
      await expect(backendProxy.withRetry(mockFn)).rejects.toMatchObject({
        response: { status: 400 },
      });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 408 Request Timeout', async () => {
      // Arrange
      const mockFn = jest.fn()
        .mockRejectedValueOnce({ response: { status: 408 } })
        .mockResolvedValue({ success: true });

      jest.spyOn(backendProxy, 'sleep').mockResolvedValue();

      // Act
      const result = await backendProxy.withRetry(mockFn);

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw 503 error when backend is unreachable after retries', async () => {
      // Arrange
      const mockFn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });
      jest.spyOn(backendProxy, 'sleep').mockResolvedValue();

      // Act & Assert
      await expect(backendProxy.withRetry(mockFn, { maxRetries: 2 }))
        .rejects.toMatchObject({
          status: 503,
          code: 'BACKEND_UNREACHABLE',
          message: 'Python Backend is unreachable',
        });
      
      expect(mockFn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should throw 504 error on timeout', async () => {
      // Arrange
      const mockFn = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });
      jest.spyOn(backendProxy, 'sleep').mockResolvedValue();

      // Act & Assert
      await expect(backendProxy.withRetry(mockFn, { maxRetries: 2 }))
        .rejects.toMatchObject({
          status: 504,
          code: 'BACKEND_TIMEOUT',
          message: 'Python Backend request timeout',
        });
    });

    it('should respect max delay cap with exponential backoff', async () => {
      // Arrange
      const mockFn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue({ success: true });

      jest.spyOn(backendProxy, 'sleep').mockResolvedValue();

      // Act
      await backendProxy.withRetry(mockFn, {
        maxRetries: 4,
        initialDelayMs: 5000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      });

      // Assert
      expect(backendProxy.sleep).toHaveBeenNthCalledWith(1, 5000);
      expect(backendProxy.sleep).toHaveBeenNthCalledWith(2, 10000); // capped at maxDelay
      expect(backendProxy.sleep).toHaveBeenNthCalledWith(3, 10000); // capped at maxDelay
    });
  });

  describe('isBackendUnreachable', () => {
    it('should detect connection refused', () => {
      expect(backendProxy.isBackendUnreachable({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('should detect host not found', () => {
      expect(backendProxy.isBackendUnreachable({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('should detect network unreachable', () => {
      expect(backendProxy.isBackendUnreachable({ code: 'ENETUNREACH' })).toBe(true);
    });

    it('should detect missing response', () => {
      expect(backendProxy.isBackendUnreachable({ message: 'Network error' })).toBe(true);
    });

    it('should not detect timeout as unreachable', () => {
      expect(backendProxy.isBackendUnreachable({ code: 'ETIMEDOUT' })).toBe(false);
    });
  });

  describe('isTimeout', () => {
    it('should detect connection aborted', () => {
      expect(backendProxy.isTimeout({ code: 'ECONNABORTED' })).toBe(true);
    });

    it('should detect timeout', () => {
      expect(backendProxy.isTimeout({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('should detect timeout in message', () => {
      expect(backendProxy.isTimeout({ message: 'Request timeout' })).toBe(true);
    });

    it('should not detect connection refused as timeout', () => {
      expect(backendProxy.isTimeout({ code: 'ECONNREFUSED' })).toBe(false);
    });
  });

  describe('validateResponse', () => {
    it('should validate correct experiment response', () => {
      // Arrange
      const data = {
        experiment_id: 'exp-123',
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
      };

      // Act
      const result = backendProxy.validateResponse(
        data,
        backendProxy.constructor.prototype.constructor.schemas?.experimentResponse ||
        require('joi').object({
          experiment_id: require('joi').string().required(),
          status: require('joi').string().valid('queued', 'running', 'paused', 'completed', 'failed').required(),
          created_at: require('joi').string().optional(),
          message: require('joi').string().optional(),
        })
      );

      // Assert
      expect(result).toEqual(data);
    });

    it('should throw error for invalid response schema', () => {
      // Arrange
      const data = {
        experiment_id: 'exp-123',
        status: 'invalid_status', // Invalid status
      };

      // Act & Assert
      expect(() => {
        backendProxy.validateResponse(
          data,
          require('joi').object({
            experiment_id: require('joi').string().required(),
            status: require('joi').string().valid('queued', 'running', 'paused', 'completed', 'failed').required(),
          })
        );
      }).toThrow(/Invalid response schema/);
    });

    it('should throw error with 502 status code', () => {
      // Arrange
      const data = { invalid: 'data' };

      // Act & Assert
      try {
        backendProxy.validateResponse(
          data,
          require('joi').object({
            experiment_id: require('joi').string().required(),
          })
        );
      } catch (error) {
        expect(error.status).toBe(502);
        expect(error.code).toBe('INVALID_BACKEND_RESPONSE');
      }
    });

    it('should strip unknown fields', () => {
      // Arrange
      const data = {
        experiment_id: 'exp-123',
        status: 'running',
        unknown_field: 'should be removed',
      };

      // Act
      const result = backendProxy.validateResponse(
        data,
        require('joi').object({
          experiment_id: require('joi').string().required(),
          status: require('joi').string().required(),
        })
      );

      // Assert
      expect(result.unknown_field).toBeUndefined();
    });
  });

  describe('startTraining', () => {
    it('should start training and invalidate cache', async () => {
      // Arrange
      const config = { dataset: 'MNIST' };
      const mockResponse = {
        experiment_id: 'exp-123',
        status: 'queued',
        created_at: '2024-01-01T00:00:00Z',
      };

      pythonBackend.startTraining.mockResolvedValue(mockResponse);
      cacheService.invalidateExperiment = jest.fn();

      // Act
      const result = await backendProxy.startTraining(config);

      // Assert
      expect(pythonBackend.startTraining).toHaveBeenCalledWith(config, null);
      expect(cacheService.invalidateExperiment).toHaveBeenCalledWith('exp-123');
      expect(result.experiment_id).toBe('exp-123');
    });
  });

  describe('stopTraining', () => {
    it('should stop training and invalidate cache', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const mockResponse = {
        experiment_id: 'exp-123',
        status: 'stopped',
      };

      pythonBackend.stopTraining.mockResolvedValue(mockResponse);
      cacheService.invalidateExperiment = jest.fn();

      // Act
      const result = await backendProxy.stopTraining(experimentId);

      // Assert
      expect(pythonBackend.stopTraining).toHaveBeenCalledWith(experimentId);
      expect(cacheService.invalidateExperiment).toHaveBeenCalledWith(experimentId);
      expect(result.status).toBe('stopped');
    });
  });

  describe('getStatus with caching', () => {
    it('should return cached status if available', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const cachedStatus = {
        experiment_id: 'exp-123',
        status: 'running',
        progress: 50,
      };

      cacheService.generateKey.mockReturnValue('status:exp-123');
      cacheService.get.mockReturnValue(cachedStatus);

      // Act
      const result = await backendProxy.getStatus(experimentId);

      // Assert
      expect(result).toEqual(cachedStatus);
      expect(pythonBackend.getStatus).not.toHaveBeenCalled();
      expect(cacheService.get).toHaveBeenCalledWith('status:exp-123');
    });

    it('should fetch and cache status if not in cache', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const freshStatus = {
        experiment_id: 'exp-123',
        status: 'running',
        progress: 75,
        current_round: 7,
        total_rounds: 10,
      };

      cacheService.generateKey.mockReturnValue('status:exp-123');
      cacheService.get.mockReturnValue(undefined);
      cacheService.getTTL.mockReturnValue(5);
      cacheService.set = jest.fn();
      pythonBackend.getStatus.mockResolvedValue(freshStatus);

      // Act
      const result = await backendProxy.getStatus(experimentId);

      // Assert
      expect(pythonBackend.getStatus).toHaveBeenCalledWith(experimentId);
      expect(cacheService.set).toHaveBeenCalledWith('status:exp-123', freshStatus, 5);
      expect(result).toEqual(freshStatus);
    });
  });

  describe('getMetrics with caching', () => {
    it('should return cached metrics if available', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const cachedMetrics = {
        experiment_id: 'exp-123',
        metrics: { accuracy: 0.9 },
        round: 5,
      };

      cacheService.generateKey.mockReturnValue('metrics:exp-123');
      cacheService.get.mockReturnValue(cachedMetrics);

      // Act
      const result = await backendProxy.getMetrics(experimentId);

      // Assert
      expect(result).toEqual(cachedMetrics);
      expect(pythonBackend.getMetrics).not.toHaveBeenCalled();
    });

    it('should fetch and cache metrics if not in cache', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const freshMetrics = {
        experiment_id: 'exp-123',
        metrics: { loss: 0.3, accuracy: 0.92 },
        round: 8,
      };

      cacheService.generateKey.mockReturnValue('metrics:exp-123');
      cacheService.get.mockReturnValue(undefined);
      cacheService.getTTL.mockReturnValue(10);
      cacheService.set = jest.fn();
      pythonBackend.getMetrics.mockResolvedValue(freshMetrics);

      // Act
      const result = await backendProxy.getMetrics(experimentId);

      // Assert
      expect(pythonBackend.getMetrics).toHaveBeenCalledWith(experimentId);
      expect(cacheService.set).toHaveBeenCalledWith('metrics:exp-123', freshMetrics, 10);
      expect(result).toEqual(freshMetrics);
    });
  });

  describe('healthCheck with caching', () => {
    it('should cache health check with short TTL', async () => {
      // Arrange
      const healthData = {
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00Z',
      };

      cacheService.generateKey.mockReturnValue('health');
      cacheService.get.mockReturnValue(undefined);
      cacheService.getTTL.mockReturnValue(2);
      cacheService.set = jest.fn();
      pythonBackend.healthCheck.mockResolvedValue(healthData);

      // Act
      const result = await backendProxy.healthCheck();

      // Assert
      expect(cacheService.set).toHaveBeenCalledWith('health', healthData, 2);
      expect(result).toEqual(healthData);
    });

    it('should only retry once for health checks', async () => {
      // Arrange
      pythonBackend.healthCheck
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue({ status: 'healthy' });

      cacheService.generateKey.mockReturnValue('health');
      cacheService.get.mockReturnValue(undefined);
      jest.spyOn(backendProxy, 'sleep').mockResolvedValue();

      // Act
      await backendProxy.healthCheck();

      // Assert
      expect(pythonBackend.healthCheck).toHaveBeenCalledTimes(2); // initial + 1 retry only
    });
  });

  describe('Integration: successful request/response cycle', () => {
    it('should complete full cycle with retry, validation, and caching', async () => {
      // Arrange
      const experimentId = 'exp-123';
      const statusData = {
        experiment_id: 'exp-123',
        status: 'completed',
        progress: 100,
        current_round: 10,
        total_rounds: 10,
      };

      cacheService.generateKey.mockReturnValue('status:exp-123');
      cacheService.get.mockReturnValue(undefined);
      cacheService.getTTL.mockReturnValue(5);
      cacheService.set = jest.fn();
      pythonBackend.getStatus.mockResolvedValue(statusData);

      // Act
      const result = await backendProxy.getStatus(experimentId);

      // Assert
      expect(result).toEqual(statusData);
      expect(pythonBackend.getStatus).toHaveBeenCalledTimes(1);
      expect(cacheService.set).toHaveBeenCalledWith('status:exp-123', statusData, 5);
    });
  });
});
