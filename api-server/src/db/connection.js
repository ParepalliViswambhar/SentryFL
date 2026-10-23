/** PostgreSQL connection and schema lifecycle for the API server. */

const { Pool } = require('pg');

let connectionPromise = null;
let pool = null;

const getDatabaseUrl = () =>
  process.env.DATABASE_URL || 'postgresql://sentryfl:sentryfl@127.0.0.1:5432/sentryfl';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(120) PRIMARY KEY,
    username VARCHAR(120) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    log_id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id VARCHAR(120),
    username VARCHAR(120),
    action VARCHAR(120) NOT NULL,
    resource_type VARCHAR(80),
    resource_id VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(120),
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs (timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id)',
  'CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs (resource_type, resource_id)',
];

const createPool = () => {
  if (process.env.NODE_ENV === 'test') {
    const { newDb } = require('pg-mem');
    const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
    const pg = memoryDb.adapters.createPg();
    return { pool: new pg.Pool(), close: async () => {} };
  }

  return {
    pool: new Pool({
      connectionString: getDatabaseUrl(),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
      max: Number(process.env.DB_POOL_MAX) || 10,
    }),
    close: async () => pool?.end(),
  };
};

const connect = async () => {
  if (pool) {
    return pool;
  }

  if (!connectionPromise) {
    connectionPromise = Promise.resolve()
      .then(async () => {
        const created = createPool();
        pool = created.pool;
        for (const statement of schemaStatements) {
          await pool.query(statement);
        }
        return pool;
      })
      .catch((err) => {
        pool = null;
        connectionPromise = null;
        throw err;
      });
  }

  return connectionPromise;
};

const disconnect = async () => {
  connectionPromise = null;
  if (pool) {
    await pool.end();
  }
  pool = null;
};

const isConnected = () => Boolean(pool);

const query = async (text, values = []) => {
  if (!pool) {
    await connect();
  }
  return pool.query(text, values);
};

module.exports = {
  connect,
  disconnect,
  isConnected,
  getDatabaseUrl,
  query,
};
