"""
Integration tests for DP-FedAvg on the AggregationServer (v2 privacy core).

Requirements: v2 FR-1.1-1.5, FR-1.7; property P-DP-2 (cumulative epsilon).
Uses a tiny linear model to avoid downloading a PLM.
"""

import copy

import torch
import torch.nn as nn

from sentryfl.federated.server import AggregationServer
from sentryfl.privacy.dp_fedavg import DPFedAvgMechanism, PRVBudget


class TinyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(4, 1)

    def forward(self, x):
        return self.fc(x)


def _client_update(base_params, scale, num_samples):
    """A fake client update: global params nudged by `scale`."""
    params = {name: p.clone() + scale for name, p in base_params.items()}
    return params, num_samples


def _make_server(tmp_path, clip=1.0, z=1.0, with_budget=True):
    model = TinyModel()
    dp = DPFedAvgMechanism(clip_norm=clip, noise_multiplier=z, seed=123)
    budget = PRVBudget(sample_rate=0.5, noise_multiplier=z) if with_budget else None
    server = AggregationServer(
        model=model,
        checkpoint_dir=str(tmp_path / "ckpt"),
        checkpoint_frequency=100,
        dp_fedavg=dp,
        privacy_budget=budget,
        dp_min_clients=2,
    )
    return server


def test_dp_fedavg_round_updates_model_and_budget(tmp_path):
    server = _make_server(tmp_path)
    global_params = server.broadcast_global_model()
    before = copy.deepcopy(server.global_model.state_dict())

    # Two clients send nudged params.
    p0, n0 = _client_update(global_params, 0.5, 100)
    p1, n1 = _client_update(global_params, 0.7, 100)
    server.collect_client_updates("c0", p0, n0)
    server.collect_client_updates("c1", p1, n1)

    stats = server.aggregate_updates(round_num=1)
    assert stats["aggregation_method"] == "dp_fedavg"
    assert "clip_norm" in stats and "noise_multiplier" in stats
    # Model parameters changed
    after = server.global_model.state_dict()
    assert any(not torch.equal(before[k], after[k]) for k in before)
    # Budget advanced one round with positive epsilon
    assert server.privacy_budget.rounds == 1
    assert server.privacy_budget.epsilon(1e-5) > 0.0


def test_dp_fedavg_cumulative_epsilon_increases(tmp_path):
    server = _make_server(tmp_path)
    eps_prev = 0.0
    for rnd in range(1, 4):
        g = server.broadcast_global_model()
        server.collect_client_updates("c0", _client_update(g, 0.3, 50)[0], 50)
        server.collect_client_updates("c1", _client_update(g, 0.4, 50)[0], 50)
        server.aggregate_updates(round_num=rnd)
        eps = server.privacy_budget.epsilon(1e-5)
        assert eps >= eps_prev
        eps_prev = eps
    assert server.privacy_budget.rounds == 3


def test_dp_fedavg_refuses_single_client(tmp_path):
    server = _make_server(tmp_path)
    g = server.broadcast_global_model()
    server.collect_client_updates("c0", _client_update(g, 0.5, 100)[0], 100)
    stats = server.aggregate_updates(round_num=1)
    assert stats["status"] == "insufficient_clients"
    # Budget must NOT advance on a refused round
    assert server.privacy_budget.rounds == 0


def test_dp_fedavg_clipping_bounds_influence(tmp_path):
    # With noise off, a huge client delta is clipped so it cannot dominate.
    # No privacy budget here: epsilon is infinite/undefined at noise_multiplier=0.
    server = _make_server(tmp_path, clip=1.0, z=0.0, with_budget=False)
    g = server.broadcast_global_model()
    honest = _client_update(g, 0.01, 100)[0]
    malicious = {name: p.clone() + 1000.0 for name, p in g.items()}  # enormous
    server.collect_client_updates("c0", honest, 100)
    server.collect_client_updates("c1", malicious, 100)
    server.aggregate_updates(round_num=1)
    # The aggregated delta L2 norm is bounded by clip_norm (mean of clipped deltas).
    after = {n: p.detach() for n, p in server.global_model.named_parameters()}
    delta_norm = sum((after[n] - g[n]).pow(2).sum().item() for n in g) ** 0.5
    assert delta_norm <= 1.0 + 1e-4


def test_privacy_budget_survives_checkpoint(tmp_path):
    server = _make_server(tmp_path)
    for rnd in range(1, 3):
        g = server.broadcast_global_model()
        server.collect_client_updates("c0", _client_update(g, 0.3, 50)[0], 50)
        server.collect_client_updates("c1", _client_update(g, 0.4, 50)[0], 50)
        server.aggregate_updates(round_num=rnd)
    server.save_checkpoint(round_num=2)
    eps_before = server.privacy_budget.epsilon(1e-5)

    # Fresh server loads the checkpoint and recovers the budget.
    server2 = _make_server(tmp_path)
    ckpt = server.checkpoint_dir / "global_model_round_2.pt"
    server2.load_checkpoint(str(ckpt))
    assert server2.privacy_budget.rounds == 2
    assert abs(server2.privacy_budget.epsilon(1e-5) - eps_before) < 1e-6
