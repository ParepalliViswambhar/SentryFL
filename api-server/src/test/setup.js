/**
 * Jest global setup / teardown for MongoDB-backed tests.
 *
 * Spins up an in-memory MongoDB instance (mongodb-memory-server) before the
 * test suite, points MONGODB_URI at it, connects Mongoose, and tears both down
 * afterwards. Between individual tests, collections are left intact — each
 * suite manages its own reset via clearUsers()/clearAuditLogs() as before.
 *
 * Referenced from jest.config.js via setupFilesAfterEnv.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const db = require('../db/connection');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await db.connect();
});

afterAll(async () => {
  await db.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
