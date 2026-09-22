"""
Tests for aggregate-level DP-FedAvg (v2 privacy core).

Requirements: v2 FR-1.1-1.7; properties P-DP-1 (noise unbiasedness) and
P-DP-2 (budget monotonic, matches a reference accountant).
"""

import math

import torch

from sentryfl.privacy.dp_fedavg import (
    DPFedAvgMechanism,
    PRVBudget,
    solve_noise_multiplier_fedavg,
)


def test_clip_caps_l2_norm():
    m = DPFedAvgMechanism(clip_norm=1.0, noise_multiplier=0.0)
    delta = {"w": torch.ones(100)}  # L2 norm = 10
    clipped, orig = m.clip_delta(delta)
    assert abs(orig - 10.0) < 1e-4
    assert m.flat_l2_norm(clipped) <= 1.0 + 1e-5


def test_clip_leaves_small_deltas_unchanged():
    m = DPFedAvgMechanism(clip_norm=100.0, noise_multiplier=0.0)
    delta = {"w": torch.ones(9)}  # norm = 3 < 100
    clipped, _ = m.clip_delta(delta)
    assert torch.allclose(clipped["w"], delta["w"])


def test_aggregate_no_noise_is_exact_mean():
    m = DPFedAvgMechanism(clip_norm=10.0, noise_multiplier=0.0)
    deltas = [{"w": torch.full((4,), float(i))} for i in (1.0, 2.0, 3.0)]
    agg = m.aggregate(deltas)
    assert torch.allclose(agg["w"], torch.full((4,), 2.0))


def test_aggregate_noise_std_matches_formula():
    z, C, n = 4.0, 2.0, 5
    m = DPFedAvgMechanism(clip_norm=C, noise_multiplier=z, seed=7)
    deltas = [{"w": torch.zeros(300_000)} for _ in range(n)]
    agg = m.aggregate(deltas)
    expected_std = z * C / n
    assert abs(agg["w"].std().item() - expected_std) < 0.05 * expected_std


def test_noise_unbiasedness_monte_carlo():
    # P-DP-1: E[aggregate] == mean of clipped deltas (noise mean 0).
    z, C, n = 1.0, 1.0, 4
    deltas = [{"w": torch.full((50,), 0.5)} for _ in range(n)]
    acc = torch.zeros(50)
    trials = 200
    for s in range(trials):
        m = DPFedAvgMechanism(clip_norm=C, noise_multiplier=z, seed=1000 + s)
        acc += m.aggregate(deltas)["w"]
    empirical_mean = acc / trials
    # True mean of deltas is 0.5 everywhere; averaging many noisy draws recovers it.
    assert torch.allclose(empirical_mean, torch.full((50,), 0.5), atol=0.05)


def test_budget_monotonic_and_matches_reference():
    # P-DP-2: PRVBudget epsilon is non-decreasing and equals a fresh reference.
    from opacus.accountants import PRVAccountant

    q, z, rounds = 0.2, 1.2, 30
    budget = PRVBudget(sample_rate=q, noise_multiplier=z)
    eps_seq = []
    for _ in range(rounds):
        budget.step()
        eps_seq.append(budget.epsilon(1e-5))
    # Monotonic non-decreasing
    assert all(eps_seq[i] <= eps_seq[i + 1] + 1e-9 for i in range(len(eps_seq) - 1))
    # Matches a reference accountant composed the same way
    ref = PRVAccountant()
    for _ in range(rounds):
        ref.step(noise_multiplier=z, sample_rate=q)
    assert abs(budget.epsilon(1e-5) - ref.get_epsilon(delta=1e-5)) < 1e-6


def test_budget_state_dict_roundtrip():
    budget = PRVBudget(sample_rate=0.1, noise_multiplier=1.0)
    for _ in range(5):
        budget.step()
    restored = PRVBudget.from_state_dict(budget.state_dict())
    assert restored.rounds == 5
    assert abs(restored.epsilon(1e-5) - budget.epsilon(1e-5)) < 1e-6


def test_solve_noise_multiplier_hits_target():
    nm = solve_noise_multiplier_fedavg(
        target_epsilon=8.0, target_delta=1e-5, sample_rate=0.2, num_rounds=50
    )
    budget = PRVBudget(sample_rate=0.2, noise_multiplier=nm)
    for _ in range(50):
        budget.step()
    assert budget.epsilon(1e-5) <= 8.0 + 0.1


def test_smaller_epsilon_needs_more_noise():
    nm_strict = solve_noise_multiplier_fedavg(1.0, 1e-5, 0.2, 50)
    nm_loose = solve_noise_multiplier_fedavg(8.0, 1e-5, 0.2, 50)
    assert nm_strict > nm_loose
