"""
Tests for LoRA / FFA-LoRA adapters (v2 efficiency core).

Requirements: v2 FR-2.1, FR-2.2, FR-2.4; property P-LoRA-1 (exact aggregation with
frozen A: mean(B)·A == mean(B·A)).
"""

import torch
import torch.nn as nn

from sentryfl.models.lora import (
    LoRALinear,
    inject_lora,
    lora_parameter_names,
    effective_delta,
)


class ToyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.ts_projection = nn.Linear(6, 8)
        self.head = nn.Sequential()
        self.head.fc1 = nn.Linear(8, 4)
        self.head.fc2 = nn.Linear(4, 1)

    def forward(self, x):
        return self.head.fc2(torch.relu(self.head.fc1(self.ts_projection(x))))


def test_lora_is_noop_at_init():
    """B is zero-initialized, so a fresh adapter leaves the base output unchanged."""
    base = nn.Linear(6, 8)
    lora = LoRALinear(base, r=4, alpha=8.0, freeze_A=True)
    x = torch.randn(3, 6)
    assert torch.allclose(lora(x), base(x), atol=1e-6)


def test_ffa_lora_freezes_A_trains_B():
    lora = LoRALinear(nn.Linear(6, 8), r=4, freeze_A=True)
    assert lora.lora_A.requires_grad is False
    assert lora.lora_B.requires_grad is True
    # base frozen
    assert all(not p.requires_grad for p in lora.base.parameters())


def test_vanilla_lora_trains_both():
    lora = LoRALinear(nn.Linear(6, 8), r=4, freeze_A=False)
    assert lora.lora_A.requires_grad is True
    assert lora.lora_B.requires_grad is True


def test_inject_lora_wraps_targets_and_only_adapters_trainable():
    model = ToyModel()
    names = inject_lora(model, ["ts_projection", "head.fc1", "head.fc2"], r=4, freeze_A=True)
    assert set(names) == {"ts_projection", "head.fc1", "head.fc2"}
    trainable = [n for n, p in model.named_parameters() if p.requires_grad]
    # Only lora_B params should be trainable under FFA-LoRA.
    assert all(".lora_B" in n for n in trainable), trainable
    assert len(trainable) == 3
    # Forward still works and shape is preserved.
    out = model(torch.randn(2, 6))
    assert out.shape == (2, 1)


def test_inject_lora_raises_on_missing_target():
    model = ToyModel()
    try:
        inject_lora(model, ["does_not_exist"], r=4)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_lora_parameter_names_are_transmitted_set():
    model = ToyModel()
    inject_lora(model, ["ts_projection", "head.fc1", "head.fc2"], r=4, freeze_A=True)
    names = lora_parameter_names(model)
    assert len(names) == 3
    assert all(".lora_B" in n for n in names)


def test_ffa_lora_aggregation_is_exact():
    """P-LoRA-1: with A frozen and shared, averaging B then applying A equals
    averaging the per-client effective deltas B_k·A."""
    A = torch.randn(4, 6)  # shared frozen A (r=4, in=6)
    Bs = [torch.randn(8, 4) for _ in range(5)]  # 5 clients' B (out=8, r=4)
    scaling = 16.0 / 4

    # mean(B) @ A
    mean_B = torch.stack(Bs, dim=0).mean(dim=0)
    lhs = scaling * (mean_B @ A)
    # mean over clients of (B_k @ A)
    rhs = torch.stack([scaling * (B @ A) for B in Bs], dim=0).mean(dim=0)

    assert torch.allclose(lhs, rhs, atol=1e-5)


def test_effective_delta_shape():
    lora = LoRALinear(nn.Linear(6, 8), r=4, alpha=8.0)
    d = effective_delta(lora)
    assert d.shape == (8, 6)
