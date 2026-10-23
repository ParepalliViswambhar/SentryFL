/** Jest global setup / teardown for the PostgreSQL-compatible test adapter. */
const db = require('../db/connection');

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.disconnect();
});
