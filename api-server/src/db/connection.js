/**
 * MongoDB Connection Management
 *
 * Centralizes the Mongoose connection lifecycle for the API server. The
 * connection URI is read from the MONGODB_URI environment variable so the same
 * code works against a local mongod, the Docker `mongo` service, or a managed
 * cluster.
 *
 * In tests, an in-memory MongoDB (mongodb-memory-server) sets MONGODB_URI
 * before the app connects (see src/test/setup.js), so no external server is
 * required.
 */

const mongoose = require('mongoose');

// Fail fast on malformed queries and keep buffering disabled so a missing
// connection surfaces as an error instead of hanging requests forever.
mongoose.set('strictQuery', true);

let connectionPromise = null;

/**
 * Resolve the MongoDB connection URI.
 *
 * @returns {string} MongoDB connection string
 */
const getMongoUri = () =>
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sentryfl';

/**
 * Connect to MongoDB. Safe to call multiple times — subsequent calls reuse the
 * in-flight or established connection.
 *
 * @param {string} [uri] - Optional explicit URI (defaults to MONGODB_URI)
 * @returns {Promise<import('mongoose').Connection>} The active connection
 */
const connect = async (uri = getMongoUri()) => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: parseInt(process.env.MONGO_TIMEOUT_MS, 10) || 10000,
      })
      .then((m) => m.connection)
      .catch((err) => {
        // Reset so a later call can retry after a transient failure.
        connectionPromise = null;
        throw err;
      });
  }

  return connectionPromise;
};

/**
 * Disconnect from MongoDB. Used on graceful shutdown and in test teardown.
 *
 * @returns {Promise<void>}
 */
const disconnect = async () => {
  connectionPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

/**
 * Whether the connection is currently established and usable.
 *
 * @returns {boolean}
 */
const isConnected = () => mongoose.connection.readyState === 1;

module.exports = {
  connect,
  disconnect,
  isConnected,
  getMongoUri,
  mongoose,
};
