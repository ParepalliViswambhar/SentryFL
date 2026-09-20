/**
 * SentryFL API Server
 * Entry point for the Node.js + Express middleware server
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const WebSocketServer = require('./websocket');
const db = require('./db/connection');
const { seedDefaultAdmin } = require('./services/userService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Rate limiting middleware - 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
});

// Middleware
app.use(helmet()); // Security headers
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(morgan(process.env.LOG_FORMAT || 'combined')); // Request logging
app.use(express.json()); // JSON body parser
app.use(express.urlencoded({ extended: true })); // URL-encoded body parser
app.use(limiter); // Rate limiting

// Health check endpoint
app.get('/health', (req, res) => {
  const dbConnected = db.isConnected();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'sentryfl-api-server',
    version: process.env.API_VERSION || 'v1',
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SentryFL API Server',
    version: process.env.API_VERSION || 'v1',
    documentation: '/api/docs',
  });
});

// Mount API routes
const authRouter = require('./routes/auth');
const experimentsRouter = require('./routes/experiments');
const configsRouter = require('./routes/configs');
const internalRouter = require('./routes/internal');
app.use('/api/auth', authRouter);
app.use('/api/experiments', experimentsRouter);
app.use('/api/configs', configsRouter);
app.use('/internal', internalRouter);

// Initialize WebSocket server
const wsServer = new WebSocketServer(server);
app.locals.wsServer = wsServer;

console.info('WebSocket server initialized');

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last middleware
app.use(errorHandler);

// Start server (connect to MongoDB first). Tests manage their own connection
// via src/test/setup.js, so skip startup there.
async function start() {
  try {
    await db.connect();
    console.info(`🗄️  Connected to MongoDB (${db.getMongoUri()})`);
    await seedDefaultAdmin();
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.info(`🚀 SentryFL API Server running on port ${PORT}`);
    console.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.info(`🔗 Python Backend: ${process.env.PYTHON_BACKEND_URL || 'http://localhost:5000'}`);
    console.info(`🔌 WebSocket server listening on port ${PORT}`);
  });
}

// Graceful shutdown
async function shutdown(signal) {
  console.info(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {});
  await db.disconnect();
  process.exit(0);
}

if (process.env.NODE_ENV !== 'test') {
  start();
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, server, wsServer };
