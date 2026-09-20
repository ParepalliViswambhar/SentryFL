const request = require('supertest');
const jwt = require('jsonwebtoken');
const AxiosMockAdapter = require('axios-mock-adapter');
const { app, wsServer } = require('./index');
const axiosClient = require('./utils/axiosClient');

describe('Three-tier integration contract', () => {
  let axiosMock;
  let token;

  beforeEach(() => {
    axiosMock = new AxiosMockAdapter(axiosClient);
    token = jwt.sign(
      { userId: 'integration-user', username: 'integration-user', role: 'user' },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
  });

  afterEach(() => axiosMock.restore());

  it('forwards lifecycle requests and streams backend metrics to WebSocket clients', async () => {
    const backendId = '123e4567-e89b-12d3-a456-426614174099';
    axiosMock.onPost('/train').reply(202, {
      experiment_id: backendId,
      status: 'queued',
      current_round: 0,
    });
    axiosMock.onDelete(`/train/${backendId}`).reply(200, {
      experiment_id: backendId,
      status: 'stopped',
    });

    const created = await request(app)
      .post('/api/experiments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        model_type: 'lstm',
        dataset: 'nsl-kdd',
        num_clients: 2,
        clients_per_round: 2,
        num_rounds: 2,
        epsilon: 1,
        delta: 0.00001,
      });

    expect(created.status).toBe(201);
    expect(created.body.experiment_id).toBe(backendId);

    const broadcast = jest.spyOn(wsServer, 'broadcastTrainingRoundComplete');
    const callback = await request(app)
      .post(`/api/experiments/${created.body.experiment_id}/callback`)
      .send({
        experimentId: backendId,
        metricType: 'training_round_complete',
        data: { round: 1, loss: 0.4, accuracy: 0.8 },
      });

    expect(callback.status).toBe(200);
    expect(broadcast).toHaveBeenCalledWith(backendId, {
      round: 1,
      loss: 0.4,
      accuracy: 0.8,
    });

    const stopped = await request(app)
      .delete(`/api/experiments/${backendId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(stopped.status).toBe(200);
    expect(stopped.body.experiment_id).toBe(backendId);
    broadcast.mockRestore();
  });
});