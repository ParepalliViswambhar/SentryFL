/**
 * Tests for federated experiment discovery and admin-to-client MIA report workflows.
 */

const request = require('supertest');
const MockAdapter = require('axios-mock-adapter');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const { app } = require('../index');
const axiosClient = require('../utils/axiosClient');
const { experimentCache } = require('./experiments');

const axiosMock = new MockAdapter(axiosClient);

const makeToken = (userId, username, role = 'user') =>
  jwt.sign(
    { userId, username, role },
    process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    { expiresIn: '24h' }
  );

describe('Federated Discovery & MIA Report Request/Dispatch Workflow', () => {
  const adminToken = makeToken('admin-uuid-1', 'admin', 'admin');
  const client1Token = makeToken('client-uuid-1', 'client1', 'user');
  const client2Token = makeToken('client-uuid-2', 'client2', 'user');
  const expId = '123e4567-e89b-12d3-a456-426614174111';

  beforeEach(async () => {
    axiosMock.reset();
    experimentCache.flushAll();
    await db.query('TRUNCATE TABLE mia_report_requests');
    jest.clearAllMocks();
  });

  afterAll(() => {
    axiosMock.restore();
  });

  test('clients can discover federated experiments created by admin while private listing stays isolated', async () => {
    axiosMock.onGet('/train').reply(200, {
      experiments: [
        {
          experiment_id: expId,
          userId: 'admin-uuid-1',
          status: 'running',
          current_round: 2,
          total_rounds: 10,
        },
      ],
      total: 1,
    });

    const fedRes = await request(app)
      .get('/api/experiments/federated')
      .set('Authorization', `Bearer ${client1Token}`)
      .expect(200);

    expect(fedRes.body.experiments).toHaveLength(1);
    expect(fedRes.body.experiments[0].experiment_id).toBe(expId);

    const privRes = await request(app)
      .get('/api/experiments')
      .set('Authorization', `Bearer ${client1Token}`)
      .expect(200);

    expect(privRes.body.experiments).toHaveLength(0);
  });

  test('complete MIA report request -> admin live evaluation & send -> client view & download lifecycle', async () => {
    axiosMock.onGet(`/train/${expId}/status`).reply(200, {
      experiment_id: expId,
      userId: 'admin-uuid-1',
      status: 'running',
      current_round: 2,
      total_rounds: 5,
    });
    axiosMock.onPost(`/train/${expId}/mia/evaluate`).reply(200, {
      experiment_id: expId,
      experiment_name: 'Collaborative Run',
      round: 2,
      status: 'running',
      privacy: { mechanism: 'dp_fedavg', current_epsilon: 1.24, target_epsilon: 2.0 },
      mia: {
        status: 'measured',
        mia_success_rate: 0.512,
        mia_auc: 0.528,
        leakage_severity: 'LOW',
        chance_baseline: 0.5,
        privacy_leakage: 0.012,
        protocol: 'bounded_threshold_attack',
      },
    });

    // 1. Client 1 requests an MIA report
    const createRes = await request(app)
      .post('/api/mia-reports/request')
      .set('Authorization', `Bearer ${client1Token}`)
      .send({ experiment_id: expId, note: 'Check privacy after Round 2' })
      .expect(201);

    const requestId = createRes.body.request.request_id;
    expect(createRes.body.request.status).toBe('pending');
    expect(createRes.body.request.client_username).toBe('client1');

    // 2. Downloading before admin sends fails with 409
    await request(app)
      .get(`/api/mia-reports/${requestId}/download`)
      .set('Authorization', `Bearer ${client1Token}`)
      .expect(409);

    // 3. Non-admin client cannot send/approve MIA report
    await request(app)
      .post(`/api/mia-reports/${requestId}/send`)
      .set('Authorization', `Bearer ${client1Token}`)
      .send({ admin_note: 'self approve attempt' })
      .expect(403);

    // 4. Admin evaluates live MIA and sends report to Client 1
    const sendRes = await request(app)
      .post(`/api/mia-reports/${requestId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ admin_note: 'Verified strong DP protection at Round 2' })
      .expect(200);

    expect(sendRes.body.request.status).toBe('sent');
    expect(sendRes.body.request.mia_report.mia.mia_success_rate).toBeCloseTo(0.512);
    expect(sendRes.body.request.admin_note).toBe('Verified strong DP protection at Round 2');

    // 5. Client 1 lists & downloads their sent report; Client 2 cannot see or download Client 1's report
    const c1List = await request(app)
      .get('/api/mia-reports')
      .set('Authorization', `Bearer ${client1Token}`)
      .expect(200);
    expect(c1List.body.requests).toHaveLength(1);
    expect(c1List.body.requests[0].mia_report.mia.mia_auc).toBeCloseTo(0.528);

    const c2List = await request(app)
      .get('/api/mia-reports')
      .set('Authorization', `Bearer ${client2Token}`)
      .expect(200);
    expect(c2List.body.requests).toHaveLength(0);

    await request(app)
      .get(`/api/mia-reports/${requestId}/download`)
      .set('Authorization', `Bearer ${client2Token}`)
      .expect(403);

    const dlRes = await request(app)
      .get(`/api/mia-reports/${requestId}/download`)
      .set('Authorization', `Bearer ${client1Token}`)
      .expect(200);
    expect(JSON.parse(dlRes.text).mia.leakage_severity).toBe('LOW');
  });

  test('admin can reject an MIA report request cleanly', async () => {
    axiosMock.onGet(`/train/${expId}/status`).reply(200, {
      experiment_id: expId,
      userId: 'admin-uuid-1',
      status: 'running',
    });

    const createRes = await request(app)
      .post('/api/mia-reports/request')
      .set('Authorization', `Bearer ${client1Token}`)
      .send({ experiment_id: expId, note: 'Too early check' })
      .expect(201);

    const requestId = createRes.body.request.request_id;
    const rejRes = await request(app)
      .post(`/api/mia-reports/${requestId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ admin_note: 'Wait until Round 5 before evaluating MIA' })
      .expect(200);

    expect(rejRes.body.request.status).toBe('rejected');
    expect(rejRes.body.request.admin_note).toBe('Wait until Round 5 before evaluating MIA');
  });
});
