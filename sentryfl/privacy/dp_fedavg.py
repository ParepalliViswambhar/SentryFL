"""
Aggregate-level Differentially Private Federated Averaging (DP-FedAvg) for SentryFL v2.

This is the DEFAULT privacy mechanism in v2, replacing record-level client-side
DP-SGD (which is retained as the ``record_dpsgd`` baseline). It implements the
McMahan et al. (ICLR 2018) mechanism:

  1. Each participating client's model-UPDATE delta (client_params - global_params,
     over the trainable/adapter parameters) is clipped to a fixed L2 norm C.
  2. The server averages the clipped deltas and adds a single Gaussian noise draw
     with std = noise_multiplier * C / num_clients.
  3. The noised average delta is applied to the global model.

Privacy is accounted ONCE per round at the CLIENT (entity/silo) level via a PRV
accountant (``PRVBudget``), composing across rounds into a single cumulative
(epsilon, delta). The clip norm C is also the Byzantine-influence bound (a single
client can move the aggregate by at most C / num_clients before noise), which the
roadmap robustness study exploits.

Honesty note: on SMD / NSL-KDD there is no natural "user"; the privacy unit is the
client/silo (see the PRD honesty constraints). With few clients per round the noise
term (∝ 1/num_clients) is large, so report the privacy-utility result as a frontier.
"""

import math
from typing import Dict, List, Optional, Tuple

import torch

try:
    from opacus.accountants import PRVAccountant, RDPAccountant
    _OPACUS_ACCT = True
except Exception:  # pragma: no cover
    _OPACUS_ACCT = False


class DPFedAvgMechanism:
    """Server-side clip-delta + Gaussian-noise aggregation."""

    def __init__(
        self,
        clip_norm: float,
        noise_multiplier: float,
        seed: int = 42,
    ):
        """
        Args:
            clip_norm: L2 clip bound C for each client update delta (> 0).
            noise_multiplier: z; Gaussian std added to the mean delta is z*C/n.
            seed: base seed for the noise generator (reproducible; incremented per
                aggregate call so rounds get independent noise without Math.random).
        """
        if clip_norm <= 0:
            raise ValueError(f"clip_norm must be > 0, got {clip_norm}")
        if noise_multiplier < 0:
            raise ValueError(f"noise_multiplier must be >= 0, got {noise_multiplier}")
        self.clip_norm = float(clip_norm)
        self.noise_multiplier = float(noise_multiplier)
        self._seed = int(seed)
        self._calls = 0

    @staticmethod
    def flat_l2_norm(delta: Dict[str, torch.Tensor]) -> float:
        """L2 norm over the concatenation of all tensors in the delta dict."""
        sq = 0.0
        for t in delta.values():
            sq += float(t.detach().double().pow(2).sum().item())
        return math.sqrt(sq)

    def clip_delta(
        self, delta: Dict[str, torch.Tensor]
    ) -> Tuple[Dict[str, torch.Tensor], float]:
        """
        Clip a single client's update delta to L2 norm ``clip_norm``.

        Returns (clipped_delta, original_norm). The scale is min(1, C / (||Δ|| + eps)),
        so deltas already within the ball are unchanged.
        """
        norm = self.flat_l2_norm(delta)
        scale = min(1.0, self.clip_norm / (norm + 1e-12))
        clipped = {name: t.detach().clone() * scale for name, t in delta.items()}
        return clipped, norm

    def aggregate(
        self, deltas: List[Dict[str, torch.Tensor]]
    ) -> Dict[str, torch.Tensor]:
        """
        Aggregate already-clipped client deltas: mean + one Gaussian noise draw.

        std of the noise per element = noise_multiplier * clip_norm / num_clients.

        Args:
            deltas: list of clipped delta dicts (same keys, same shapes).

        Returns:
            The noised mean delta (to be added to the global model).
        """
        if len(deltas) == 0:
            raise ValueError("aggregate requires at least one client delta")
        n = len(deltas)
        keys = list(deltas[0].keys())

        # Reproducible per-round noise without Math.random/Date: derive from seed.
        generator = torch.Generator()
        generator.manual_seed(self._seed + self._calls)
        self._calls += 1

        sigma = self.noise_multiplier * self.clip_norm / n

        aggregated: Dict[str, torch.Tensor] = {}
        for key in keys:
            stacked = torch.stack([d[key].detach().float() for d in deltas], dim=0)
            mean = stacked.mean(dim=0)
            if sigma > 0:
                noise = torch.normal(
                    mean=0.0, std=sigma, size=mean.shape, generator=generator
                )
                mean = mean + noise
            aggregated[key] = mean
        return aggregated

    def clip_and_aggregate(
        self, deltas: List[Dict[str, torch.Tensor]]
    ) -> Tuple[Dict[str, torch.Tensor], List[float]]:
        """Convenience: clip each delta then aggregate. Returns (agg, pre_clip_norms)."""
        clipped, norms = [], []
        for d in deltas:
            c, nrm = self.clip_delta(d)
            clipped.append(c)
            norms.append(nrm)
        return self.aggregate(clipped), norms


class PRVBudget:
    """
    Federation-level (cross-round) privacy budget via a PRV accountant.

    Composes ONE subsampled-Gaussian mechanism per federated round at the client
    (entity) level: sample_rate = clients_per_round / total_clients. Persists across
    rounds and is serializable into the server checkpoint so resume keeps the budget.
    """

    def __init__(self, sample_rate: float, noise_multiplier: float, accountant: str = "prv"):
        if not _OPACUS_ACCT:  # pragma: no cover
            raise RuntimeError("opacus accountants unavailable; cannot build PRVBudget")
        if not (0.0 < sample_rate <= 1.0):
            raise ValueError(f"sample_rate must be in (0, 1], got {sample_rate}")
        if accountant not in ("prv", "rdp"):
            raise ValueError(f"accountant must be 'prv' or 'rdp', got {accountant!r}")
        self.sample_rate = float(sample_rate)
        self.noise_multiplier = float(noise_multiplier)
        self.accountant_name = accountant
        self._acct = PRVAccountant() if accountant == "prv" else RDPAccountant()
        self.rounds = 0

    def step(self) -> None:
        """Account one federated round (one subsampled-Gaussian mechanism)."""
        self._acct.step(noise_multiplier=self.noise_multiplier, sample_rate=self.sample_rate)
        self.rounds += 1

    def epsilon(self, delta: float) -> float:
        """Cumulative epsilon spent so far at the given delta."""
        if self.rounds == 0:
            return 0.0
        return float(self._acct.get_epsilon(delta=delta))

    def remaining(self, target_epsilon: float, delta: float) -> float:
        return max(0.0, target_epsilon - self.epsilon(delta))

    def is_exhausted(self, target_epsilon: float, delta: float) -> bool:
        return self.epsilon(delta) >= target_epsilon

    def state_dict(self) -> Dict:
        return {
            "sample_rate": self.sample_rate,
            "noise_multiplier": self.noise_multiplier,
            "accountant": self.accountant_name,
            "rounds": self.rounds,
        }

    @classmethod
    def from_state_dict(cls, state: Dict) -> "PRVBudget":
        budget = cls(
            sample_rate=state["sample_rate"],
            noise_multiplier=state["noise_multiplier"],
            accountant=state.get("accountant", "prv"),
        )
        # Replay the composition to restore the accountant history.
        for _ in range(int(state.get("rounds", 0))):
            budget.step()
        return budget


def solve_noise_multiplier_fedavg(
    target_epsilon: float,
    target_delta: float,
    sample_rate: float,
    num_rounds: int,
    accountant: str = "prv",
) -> float:
    """
    Solve the per-round noise multiplier for DP-FedAvg to hit (target_epsilon,
    target_delta) after ``num_rounds`` rounds at the given client sample rate.

    Reuses Opacus's get_noise_multiplier by treating each round as one step
    (steps = num_rounds). Falls back to a bisection search on PRVBudget if needed.
    """
    from opacus.accountants.utils import get_noise_multiplier

    try:
        return float(
            get_noise_multiplier(
                target_epsilon=target_epsilon,
                target_delta=target_delta,
                sample_rate=sample_rate,
                steps=num_rounds,
                accountant=accountant,
            )
        )
    except Exception as exc:  # numerical edge: bisection fallback
        lo, hi = 0.3, 50.0
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            budget = PRVBudget(sample_rate, mid, accountant=accountant)
            for _ in range(num_rounds):
                budget.step()
            eps = budget.epsilon(target_delta)
            if eps > target_epsilon:
                lo = mid
            else:
                hi = mid
        if hi >= 50.0 - 1e-6:
            raise ValueError(
                f"Cannot achieve (eps={target_epsilon}, delta={target_delta}) in "
                f"{num_rounds} rounds at sample_rate={sample_rate}: {exc}"
            )
        return float(hi)
