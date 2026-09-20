/**
 * Tests for Axios client with error transformation
 */

const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

describe('Axios Client', () => {
  let axiosClient;
  let mock;

  beforeEach(() => {
    // Clear module cache to get fresh instance
    jest.clearAllMocks();
    delete require.cache[require.resolve('./axiosClient')];
    
    // Get a fresh axiosClient
    axiosClient = require('./axiosClient');
    
    // Create mock adapter for the instance
    mock = new MockAdapter(axiosClient);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Request interceptor', () => {
    it('should add metadata with start time to requests', async () => {
      mock.onGet('/test').reply(200, { success: true });

      const response = await axiosClient.get('/test');

      expect(response.config.metadata).toBeDefined();
      expect(response.config.metadata.startTime).toBeInstanceOf(Date);
    });
  });

  describe('Response interceptor', () => {
    it('should return successful responses', async () => {
      mock.onGet('/test').reply(200, { success: true });

      const response = await axiosClient.get('/test');

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
    });

    it('should mark errors as Axios errors', async () => {
      mock.onGet('/test').reply(500, { error: 'Server error' });

      try {
        await axiosClient.get('/test');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.isAxiosError).toBe(true);
        expect(error.response.status).toBe(500);
        expect(error.response.data).toEqual({ error: 'Server error' });
      }
    });

    it('should calculate request duration on error', async () => {
      mock.onGet('/test').reply(400, { error: 'Bad request' });

      try {
        await axiosClient.get('/test');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.duration).toBeDefined();
        expect(typeof error.duration).toBe('number');
      }
    });
  });

  describe('Python backend error scenarios', () => {
    it('should handle validation errors from Python backend', async () => {
      mock.onPost('/api/train').reply(400, {
        error: 'Validation Error',
        message: 'Invalid experiment configuration',
        validation_errors: [
          { field: 'epsilon', message: 'Must be positive' },
          { field: 'num_clients', message: 'Must be at least 1' },
        ],
      });

      try {
        await axiosClient.post('/api/train', { epsilon: -1, num_clients: 0 });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.isAxiosError).toBe(true);
        expect(error.response.status).toBe(400);
        expect(error.response.data.validation_errors).toHaveLength(2);
      }
    });

    it('should handle internal server errors from Python backend', async () => {
      mock.onPost('/api/train').reply(500, {
        error: 'Internal Server Error',
        message: 'Failed to initialize model',
      });

      try {
        await axiosClient.post('/api/train', {});
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.isAxiosError).toBe(true);
        expect(error.response.status).toBe(500);
        expect(error.response.data.message).toBe('Failed to initialize model');
      }
    });

    it('should handle network errors (backend unreachable)', async () => {
      mock.onGet('/test').networkError();

      try {
        await axiosClient.get('/test');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.isAxiosError).toBe(true);
        expect(error.message).toContain('Network Error');
      }
    });

    it('should handle timeout errors', async () => {
      mock.onGet('/test').timeout();

      try {
        await axiosClient.get('/test');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.isAxiosError).toBe(true);
        expect(error.code).toBe('ECONNABORTED');
      }
    });
  });
});
