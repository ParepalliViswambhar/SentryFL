const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../services/experimentService', () => ({
  saveExperiment: jest.fn(),
  listExperiments: jest.fn(async () => []),
  listFederatedExperiments: jest.fn(async () => []),
  getExperiment: jest.fn(async (id) => ({
    experiment_id: id,
    user_id: 'admin-1',
    status: 'running',
    config: { experiment_name: 'Collaborative Test Run', federation_mode: 'remote' },
  })),
  updateExperiment: jest.fn(),
  deleteExperiment: jest.fn(),
}));

const { app } = require('../index');

const SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const makeToken = (userId, username, role = 'user') =>
  jwt.sign({ userId, username, role }, SECRET, { expiresIn: '1h' });

const EXP_UUID = '123e4567-e89b-12d3-a456-426614174199';

describe('GET /api/experiments/:id/client-script', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(`/api/experiments/${EXP_UUID}/client-script`);
    expect(res.status).toBe(401);
  });

  it('returns an interactive pre-configured python script for authenticated clients', async () => {
    const clientToken = makeToken('user-1', 'client1', 'user');
    const res = await request(app)
      .get(`/api/experiments/${EXP_UUID}/client-script`)
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/x-python/);
    expect(res.headers['content-disposition']).toContain('sentryfl_client_123e4567.py');
    expect(res.text).toContain(`DEFAULT_EXPERIMENT_ID = "${EXP_UUID}"`);
    expect(res.text).toContain('Load your local dataset');
    expect(res.text).toContain('run_local_finetune');
  });
});
