"""
LoRA / FFA-LoRA adapters for parameter-efficient federated fine-tuning (SentryFL v2).

Replaces ADMS gradient-zeroing (which yields no real wire savings) with low-rank
adapters injected into selected linear layers of the frozen-PLM anomaly detector.
Only the small adapter matrices are trained and transmitted, giving a REAL,
measurable communication reduction and lower client compute/memory.

Two modes:
- ``lora``: train both A and B (standard LoRA; Hu et al. 2021).
- ``ffa_lora`` (default, freeze_A=True): freeze the random-init A, train only the
  zero-init B (Sun et al., ICLR 2024). The effective weight delta ΔW = (α/r)·B·A is
  then LINEAR in the trainable parameter B, so:
    * Gaussian DP noise on B stays unbiased (no B·A cross-term), and
    * server-side averaging of adapters is exact: mean(B)·A == mean(B·A).
  This is what lets FFA-LoRA compose cleanly with aggregate-level DP-FedAvg.
"""

import math
from typing import Iterable, List

import torch
import torch.nn as nn
import torch.nn.functional as F


class LoRALinear(nn.Module):
    """A frozen ``nn.Linear`` augmented with a trainable low-rank adapter B·A."""

    def __init__(self, base_linear: nn.Linear, r: int = 8, alpha: float = 16.0,
                 freeze_A: bool = True):
        super().__init__()
        if r < 1:
            raise ValueError(f"LoRA rank r must be >= 1, got {r}")
        self.in_features = base_linear.in_features
        self.out_features = base_linear.out_features
        self.r = int(r)
        self.alpha = float(alpha)
        self.scaling = self.alpha / self.r
        self.freeze_A = bool(freeze_A)

        # Frozen base layer (pretrained / previously-trained weights).
        self.base = base_linear
        for p in self.base.parameters():
            p.requires_grad = False

        # Adapter matrices. A: (r, in), B: (out, r).
        self.lora_A = nn.Parameter(torch.empty(self.r, self.in_features))
        self.lora_B = nn.Parameter(torch.zeros(self.out_features, self.r))
        # Kaiming init for A (as in the LoRA paper); B stays zero so the adapter
        # starts as a no-op (output == base at initialization).
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))
        if self.freeze_A:
            self.lora_A.requires_grad = False  # FFA-LoRA: only B is trained.

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # base(x) + scaling * (x A^T) B^T
        base_out = self.base(x)
        lora_out = F.linear(F.linear(x, self.lora_A), self.lora_B)
        return base_out + self.scaling * lora_out

    def extra_repr(self) -> str:
        return (f"in={self.in_features}, out={self.out_features}, r={self.r}, "
                f"alpha={self.alpha}, freeze_A={self.freeze_A}")


def _resolve_target_modules(model: nn.Module, targets: Iterable[str]) -> List[str]:
    """Return names of nn.Linear modules whose dotted name ends with any target."""
    targets = list(targets)
    matched = []
    for name, module in model.named_modules():
        if isinstance(module, nn.Linear) and any(
            name == t or name.endswith("." + t) or name.endswith(t) for t in targets
        ):
            matched.append(name)
    return matched


def _set_submodule(model: nn.Module, dotted_name: str, new_module: nn.Module) -> None:
    parts = dotted_name.split(".")
    parent = model
    for p in parts[:-1]:
        parent = getattr(parent, p) if not p.isdigit() else parent[int(p)]
    setattr(parent, parts[-1], new_module)


def inject_lora(
    model: nn.Module,
    targets: Iterable[str],
    r: int = 8,
    alpha: float = 16.0,
    freeze_A: bool = True,
) -> List[str]:
    """
    Replace target ``nn.Linear`` modules in ``model`` with ``LoRALinear`` wrappers.

    Args:
        model: the model to modify in place.
        targets: module-name suffixes to wrap (e.g. ["ts_projection", "head.fc1"]).
        r, alpha: LoRA rank and scaling.
        freeze_A: FFA-LoRA when True (train only B).

    Returns:
        List of wrapped module names.

    Raises:
        ValueError: if no target module is found (name typo / wrong architecture).
    """
    names = _resolve_target_modules(model, targets)
    if not names:
        available = [n for n, m in model.named_modules() if isinstance(m, nn.Linear)]
        raise ValueError(
            f"No nn.Linear modules matched targets {list(targets)}. "
            f"Available linear modules: {available}"
        )
    for name in names:
        base = dict(model.named_modules())[name]
        wrapper = LoRALinear(base, r=r, alpha=alpha, freeze_A=freeze_A)
        _set_submodule(model, name, wrapper)
    return names


def lora_parameter_names(model: nn.Module) -> List[str]:
    """Names of adapter parameters (what a client transmits under FFA-LoRA)."""
    return [n for n, p in model.named_parameters()
            if p.requires_grad and (".lora_A" in n or ".lora_B" in n)]


def effective_delta(layer: LoRALinear) -> torch.Tensor:
    """ΔW = scaling * B @ A for a LoRA layer (for tests / analysis)."""
    return layer.scaling * (layer.lora_B @ layer.lora_A)
