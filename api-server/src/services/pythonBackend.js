/**
 * Python Backend Proxy Service
 * 
 * Provides Axios-based HTTP client for Python Backend communication
 * Implements POST requests to start training, DELETE to stop, GET for status/metrics
 * 
 * Requirements: 26.1, 26.2, 26.3, 26.5
 */

const axiosClient = require('../utils/axiosClient');

/**
 * Python Backend Service
 * Proxy for communicating with Python ML backend
 */
class PythonBackendService {
  /**
   * Start training experiment
   * 
   * @param {Object} config - Experiment configuration
   * @param {string} callbackUrl - URL for Python backend to send progress updates
   * @returns {Promise<Object>} Response containing experiment ID and initial status
   * 
   * Requirements: 26.2
   */
  async startTraining(config, callbackUrl = null) {
    const payload = {
      ...config,
      callback_url: callbackUrl,
    };

    const response = await axiosClient.post('/api/train', payload);
    return response.data;
  }

  /**
   * Stop training experiment
   * 
   * @param {string} experimentId - ID of experiment to stop
   * @returns {Promise<Object>} Response containing stop confirmation
   * 
   * Requirements: 26.3
   */
  async stopTraining(experimentId) {
    const response = await axiosClient.delete(`/api/train/${experimentId}`);
    return response.data;
  }

  /**
   * Pause training experiment
   * 
   * @param {string} experimentId - ID of experiment to pause
   * @returns {Promise<Object>} Response containing pause confirmation
   */
  async pauseTraining(experimentId) {
    const response = await axiosClient.post(`/api/train/${experimentId}/pause`);
    return response.data;
  }

  /**
   * Resume training experiment
   * 
   * @param {string} experimentId - ID of experiment to resume
   * @returns {Promise<Object>} Response containing resume confirmation
   */
  async resumeTraining(experimentId) {
    const response = await axiosClient.post(`/api/train/${experimentId}/resume`);
    return response.data;
  }

  /**
   * Get training status
   * 
   * @param {string} experimentId - ID of experiment
   * @returns {Promise<Object>} Current training status
   * 
   * Requirements: 26.5
   */
  async getStatus(experimentId) {
    const response = await axiosClient.get(`/api/train/${experimentId}/status`);
    return response.data;
  }

  /**
   * Get training metrics
   * 
   * @param {string} experimentId - ID of experiment
   * @returns {Promise<Object>} Training metrics
   * 
   * Requirements: 26.5
   */
  async getMetrics(experimentId) {
    const response = await axiosClient.get(`/api/train/${experimentId}/metrics`);
    return response.data;
  }

  /**
   * Get experiment report
   * 
   * @param {string} experimentId - ID of experiment
   * @returns {Promise<Object>} Complete experiment report
   */
  async getReport(experimentId) {
    const response = await axiosClient.get(`/api/train/${experimentId}/report`);
    return response.data;
  }

  /**
   * List all experiments
   * 
   * @returns {Promise<Array>} List of all experiments
   */
  async listExperiments() {
    const response = await axiosClient.get('/api/train');
    return response.data;
  }

  /**
   * Get experiment details
   * 
   * @param {string} experimentId - ID of experiment
   * @returns {Promise<Object>} Experiment details
   */
  async getExperiment(experimentId) {
    const response = await axiosClient.get(`/api/train/${experimentId}`);
    return response.data;
  }

  /**
   * Health check for Python backend
   * 
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const response = await axiosClient.get('/health');
    return response.data;
  }

  /**
   * Validate experiment configuration
   * 
   * @param {Object} config - Configuration to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateConfig(config) {
    const response = await axiosClient.post('/api/validate', config);
    return response.data;
  }
}

module.exports = new PythonBackendService();
