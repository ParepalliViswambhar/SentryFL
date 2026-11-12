"""Tests for the leakage-free MIA protocol contract."""

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset

from sentryfl.privacy.mia_evaluator import MIAEvaluator


class TinyAttackModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(4, 2)

    def forward(self, inputs):
        return self.linear(inputs)


def test_protocol_split_is_deterministic_and_disjoint():
    torch.manual_seed(7)
    dataset = TensorDataset(torch.randn(40, 4), torch.randint(0, 2, (40,)))
    evaluator = MIAEvaluator(TinyAttackModel(), TinyAttackModel, num_shadow_models=1)

    first = evaluator.prepare_attack_protocol(dataset, seed=19)
    second = evaluator.prepare_attack_protocol(dataset, seed=19)

    assert first.metadata == second.metadata
    groups = [
        set(first.member_train.indices),
        set(first.member_test.indices),
        set(first.non_member_train.indices),
        set(first.non_member_test.indices),
    ]
    assert all(left.isdisjoint(right) for index, left in enumerate(groups) for right in groups[index + 1:])
    assert first.metadata["disjoint_member_non_member"] is True
    assert len(first.member_train) + len(first.member_test) == 20


def test_attack_metrics_include_balanced_accuracy_and_chance_baseline():
    torch.manual_seed(3)
    dataset = TensorDataset(torch.randn(20, 4), torch.randint(0, 2, (20,)))
    evaluator = MIAEvaluator(TinyAttackModel(), TinyAttackModel, num_shadow_models=1)
    member = torch.utils.data.Subset(dataset, range(0, 8))
    non_member = torch.utils.data.Subset(dataset, range(8, 16))

    metrics = evaluator.evaluate_attack(
        member,
        non_member,
        batch_size=4,
        attack_strategy="threshold_based",
    )

    assert 0 <= metrics["balanced_accuracy"] <= 1
    assert metrics["chance_baseline"] == 0.5
    assert metrics["mia_success_rate"] == metrics["accuracy"]
    assert metrics["member_count"] == 8
    assert metrics["non_member_count"] == 8
