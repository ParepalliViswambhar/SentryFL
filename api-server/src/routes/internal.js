/**
 * Internal Routes
 * Endpoints for inter-service communication (Python Backend -> API Server)
 */

const express = require('express');
const router = express.Router();

/**
 * POST /internal/metrics
 * Receive metrics from Python Backend and broadcast via WebSocket
 */
router.post('/metrics', (req, res) => {
  const { experimentId, metricType, data } = req.body;

  if (!experimentId || !metricType || !data) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'experimentId, metricType, and data are required',
    });
  }

  // Get WebSocket server instance from app locals
  const wsServer = req.app.locals.wsServer;

  if (!wsServer) {
    console.error('WebSocket server not initialized');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'WebSocket server not available',
    });
  }

  try {
    // Broadcast metrics based on type
    switch (metricType) {
      case 'training_round_complete':
        wsServer.broadcastTrainingRoundComplete(experimentId, data);
        break;

      case 'privacy_budget_update':
        wsServer.broadcastPrivacyBudgetUpdate(experimentId, data);
        break;

      case 'experiment_status_change':
        wsServer.broadcastExperimentStatusChange(experimentId, data);
        break;

      case 'error':
        wsServer.broadcastError(experimentId, data);
        break;

      default:
        console.warn(`Unknown metric type: ${metricType}`);
        return res.status(400).json({
          error: 'Invalid metric type',
          message: `Unsupported metric type: ${metricType}`,
        });
    }

    res.status(200).json({
      success: true,
      message: 'Metrics received and broadcasted',
      experimentId,
      metricType,
    });
  } catch (error) {
    console.error('Error broadcasting metrics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to broadcast metrics',
      details: error.message,
    });
  }
});

module.exports = router;
