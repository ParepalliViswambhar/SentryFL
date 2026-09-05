/**
 * Backend Proxy Service with Retry Logic and Error Handling
 * 
 * Implements exponential backoff retry for failed requests
 * Handles timeouts and unreachable backend scenarios
 * Validates response schemas
 * Caches responses to reduce backend load
 * 
 * Requirements: 26.6, 26.7, 26.8, 26.9, 26.10
 */

const pythonBackend = require('./pythonBackend');
const cacheService = require('./cacheService');
const Joi = require('joi');

// Response schemas for validation (Requirement 26.8)
const schemas = {
  experimentResponse: Joi.object({
    experiment_id: Joi.string().required(),
    status: Joi.string().valid('queued', 'running', 'paused', 'completed', 'failed', 'stopped').required(),
    created_at: Joi.string().optional(),
    message: Joi.string().optional(),
  }),

  statusResponse: Joi.object({
    experiment_id: Joi.string().required(),
    status: Joi.string().valid('queued', 'running', 'paused', 'completed', 'failed').required(),
    progress: Joi.number().min(0).max(100).optional(),
    current_round: Joi.number().integer().min(0).optional(),
    total_rounds: Joi.number().integer().min(0).optional(),
    message: Joi.string().optional(),
  }),

  metricsResponse: Joi.object({
    experiment_id: Joi.string().required(),
    metrics: Joi.object({
      loss: Joi.number().optional(),
      accuracy: Joi.number().optional(),
      epsilon: Joi.number().optional(),
      f1_score: Joi.number().optional(),
    }).optional(),
    round: Joi.number().integer().min(0).optional(),
  }),

  healthResponse: Joi.object({
    status: Joi.string().valid('healthy', 'unhealthy').required(),
    timestamp: Joi.string().optional(),
  }),
};

/**
 * Retry configuration
 * Requirements: 26.6
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Backend Proxy Service with retry logic and error handling
 */
class BackendProxyService {
  /**
   * Execute request with exponential backoff retry
   * 
   * @param {Function} requestFn - Function that returns a promise
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Response data
   * 
   * Requirements: 26.6
   */
  async withRetry(requestFn, options = {}) {
    const maxRetries = options.maxRetries ?? RETRY_CONFIG.maxRetries;
    const initialDelay = options.initialDelayMs ?? RETRY_CONFIG.initialDelayMs;
    const maxDelay = options.maxDelayMs ?? RETRY_CONFIG.maxDelayMs;
    const backoffMultiplier = options.backoffMultiplier ?? RETRY_CONFIG.backoffMultiplier;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // Don't retry on 4xx client errors (except 408 Request Timeout)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 408) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
        
        console.log(`[BackendProxy] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: error.message,
          status: error.response?.status,
        });

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // Check if backend is unreachable (Requirement 26.7)
    if (this.isBackendUnreachable(lastError)) {
      const error = new Error('Python Backend is unreachable');
      error.status = 503;
      error.code = 'BACKEND_UNREACHABLE';
      throw error;
    }

    // Check if timeout occurred (Requirement 26.9)
    if (this.isTimeout(lastError)) {
      const error = new Error('Python Backend request timeout');
      error.status = 504;
      error.code = 'BACKEND_TIMEOUT';
      throw error;
    }

    // Re-throw the last error
    throw lastError;
  }

  /**
   * Sleep utility for delays
   * 
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error indicates backend is unreachable
   * 
   * @param {Error} error - Error to check
   * @returns {boolean}
   * 
   * Requirements: 26.7
   */
  isBackendUnreachable(error) {
    // Don't treat timeouts as unreachable - they have their own handling
    if (this.isTimeout(error)) {
      return false;
    }
    
    return (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ENETUNREACH' ||
      error.code === 'EHOSTUNREACH' ||
      !error.response
    );
  }

  /**
   * Check if error is a timeout
   * 
   * @param {Error} error - Error to check
   * @returns {boolean}
   * 
   * Requirements: 26.9
   */
  isTimeout(error) {
    return Boolean(
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      (error.message && error.message.toLowerCase().includes('timeout'))
    );
  }

  /**
   * Validate response against schema
   * 
   * @param {any} data - Data to validate
   * @param {Joi.Schema} schema - Joi schema
   * @returns {any} Validated data
   * @throws {Error} If validation fails
   * 
   * Requirements: 26.8
   */
  validateResponse(data, schema) {
    const { error, value } = schema.validate(data, {
      stripUnknown: true,
      abortEarly: false,
    });

    if (error) {
      const validationError = new Error(`Invalid response schema: ${error.message}`);
      validationError.status = 502;
      validationError.code = 'INVALID_BACKEND_RESPONSE';
      validationError.details = error.details;
      throw validationError;
    }

    return value;
  }

  /**
   * Start training with retry and validation
   * 
   * State-changing operation - invalidates cache for experiment
   * 
   * @param {Object} config - Experiment configuration
   * @param {string} callbackUrl - Callback URL
   * @returns {Promise<Object>} Validated response
   * 
   * Requirements: 26.2, 26.10
   */
  async startTraining(config, callbackUrl = null) {
    const data = await this.withRetry(() => pythonBackend.startTraining(config, callbackUrl));
    const validated = this.validateResponse(data, schemas.experimentResponse);
    
    // Invalidate cache for this experiment (new experiment started)
    if (validated.experiment_id) {
      cacheService.invalidateExperiment(validated.experiment_id);
    }
    
    return validated;
  }

  /**
   * Stop training with retry and validation
   * 
   * State-changing operation - invalidates cache for experiment
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Validated response
   * 
   * Requirements: 26.3, 26.10
   */
  async stopTraining(experimentId) {
    const data = await this.withRetry(() => pythonBackend.stopTraining(experimentId));
    const validated = this.validateResponse(data, schemas.experimentResponse);
    
    // Invalidate cache for this experiment (state changed)
    cacheService.invalidateExperiment(experimentId);
    
    return validated;
  }

  /**
   * Pause training with retry and validation
   * 
   * State-changing operation - invalidates cache for experiment
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Validated response
   * 
   * Requirements: 26.10
   */
  async pauseTraining(experimentId) {
    const data = await this.withRetry(() => pythonBackend.pauseTraining(experimentId));
    const validated = this.validateResponse(data, schemas.experimentResponse);
    
    // Invalidate cache for this experiment (state changed)
    cacheService.invalidateExperiment(experimentId);
    
    return validated;
  }

  /**
   * Resume training with retry and validation
   * 
   * State-changing operation - invalidates cache for experiment
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Validated response
   * 
   * Requirements: 26.10
   */
  async resumeTraining(experimentId) {
    const data = await this.withRetry(() => pythonBackend.resumeTraining(experimentId));
    const validated = this.validateResponse(data, schemas.experimentResponse);
    
    // Invalidate cache for this experiment (state changed)
    cacheService.invalidateExperiment(experimentId);
    
    return validated;
  }

  /**
   * Get status with retry, validation, and caching
   * 
   * Cached with short TTL (5 seconds) as status changes frequently
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Validated response
   * 
   * Requirements: 26.4, 26.10
   */
  async getStatus(experimentId) {
    // Check cache first
    const cacheKey = cacheService.generateKey('status', experimentId);
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.getStatus(experimentId));
    const validated = this.validateResponse(data, schemas.statusResponse);
    
    // Cache with status TTL
    cacheService.set(cacheKey, validated, cacheService.getTTL('status'));
    
    return validated;
  }

  /**
   * Get metrics with retry, validation, and caching
   * 
   * Cached with medium TTL (10 seconds) as metrics update per round
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Validated response
   * 
   * Requirements: 26.5, 26.10
   */
  async getMetrics(experimentId) {
    // Check cache first
    const cacheKey = cacheService.generateKey('metrics', experimentId);
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.getMetrics(experimentId));
    const validated = this.validateResponse(data, schemas.metricsResponse);
    
    // Cache with metrics TTL
    cacheService.set(cacheKey, validated, cacheService.getTTL('metrics'));
    
    return validated;
  }

  /**
   * Get report with retry and caching (no strict schema validation for flexible report format)
   * 
   * Cached with long TTL (300 seconds) as reports are static once completed
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Report data
   * 
   * Requirements: 26.10
   */
  async getReport(experimentId) {
    // Check cache first
    const cacheKey = cacheService.generateKey('report', experimentId);
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.getReport(experimentId));
    
    // Cache with report TTL
    cacheService.set(cacheKey, data, cacheService.getTTL('report'));
    
    return data;
  }

  /**
   * List experiments with retry and caching
   * 
   * Cached with medium TTL (30 seconds) as list changes infrequently
   * 
   * @returns {Promise<Array>} List of experiments
   * 
   * Requirements: 26.10
   */
  async listExperiments() {
    // Check cache first
    const cacheKey = cacheService.generateKey('experiments');
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.listExperiments());
    
    // Cache with experiments TTL
    cacheService.set(cacheKey, data, cacheService.getTTL('experiments'));
    
    return data;
  }

  /**
   * Get experiment with retry and caching
   * 
   * Cached with medium TTL (30 seconds) as experiment details are relatively stable
   * 
   * @param {string} experimentId - Experiment ID
   * @returns {Promise<Object>} Experiment details
   * 
   * Requirements: 26.10
   */
  async getExperiment(experimentId) {
    // Check cache first
    const cacheKey = cacheService.generateKey('experiment', experimentId);
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.getExperiment(experimentId));
    
    // Cache with default TTL
    cacheService.set(cacheKey, data, cacheService.getTTL('default'));
    
    return data;
  }

  /**
   * Health check with retry, validation, and caching
   * 
   * Cached with short TTL (2 seconds) as health should be fresh
   * 
   * @returns {Promise<Object>} Health status
   * 
   * Requirements: 26.10
   */
  async healthCheck() {
    // Check cache first
    const cacheKey = cacheService.generateKey('health');
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.healthCheck(), {
      maxRetries: 1, // Only retry once for health checks
    });
    const validated = this.validateResponse(data, schemas.healthResponse);
    
    // Cache with health TTL
    cacheService.set(cacheKey, validated, cacheService.getTTL('health'));
    
    return validated;
  }

  /**
   * Validate config with retry and caching
   * 
   * Cached with long TTL (60 seconds) as validation is deterministic
   * 
   * @param {Object} config - Configuration to validate
   * @returns {Promise<Object>} Validation result
   * 
   * Requirements: 26.10
   */
  async validateConfig(config) {
    // Generate cache key from config content
    const cacheKey = cacheService.generateKey('configValidation', null, config);
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Fetch from backend
    const data = await this.withRetry(() => pythonBackend.validateConfig(config));
    
    // Cache with config validation TTL
    cacheService.set(cacheKey, data, cacheService.getTTL('configValidation'));
    
    return data;
  }
}

module.exports = new BackendProxyService();
