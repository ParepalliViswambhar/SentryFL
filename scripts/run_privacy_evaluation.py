#!/usr/bin/env python
"""Generate comparable DP accountant and leakage-free MIA evidence reports."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import TensorDataset

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sentryfl.evaluation.research_reports import ResearchReport
from sentryfl.privacy.differential_privacy import DifferentialPrivacyModule
from sentryfl.privacy.mia_evaluator import MIAEvaluator


class _PrivacyProbeModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.linear = nn.Linear(4, 2)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.linear(inputs)


def build_report(
    *,
    noise_multiplier: float = 1.0,
    sample_rate: float = 0.1,
    steps: int = 100,
    delta: float = 1e-5,
    run_mia: bool = True,
) -> ResearchReport:
    """Run the same accountant comparison for both privacy units."""
    accounting = DifferentialPrivacyModule.compare_accountants(
        noise_multiplier=noise_multiplier,
        sample_rate=sample_rate,
        steps=steps,
        delta=delta,
    )
    rows = [
        {
            "mechanism": "dp_fedavg",
            "privacy_unit": "client/silo/entity",
            "accountant": accounting,
        },
        {
            "mechanism": "record_dpsgd",
            "privacy_unit": "record",
            "accountant": accounting,
        },
    ]
    mia = {"status": "not_run", "results": None}
    if run_mia:
        torch.manual_seed(42)
        dataset = TensorDataset(torch.randn(40, 4), torch.randint(0, 2, (40,)))
        evaluator = MIAEvaluator(
            _PrivacyProbeModel(), _PrivacyProbeModel, num_shadow_models=1
        )
        mia = evaluator.run_leakage_free_protocol(
            dataset, epochs=1, batch_size=8, attack_strategy="threshold_based"
        )
    return ResearchReport(
        experiment="privacy_mia",
        status="measured",
        protocol={
            "delta": delta,
            "noise_multiplier": noise_multiplier,
            "sample_rate": sample_rate,
            "steps": steps,
            "privacy_units_are_separate": True,
            "mia_is_empirical_not_formal": True,
        },
        results={"accounting": rows, "mia": mia},
        limitations=[
            "Accountant rows are mechanism calculations and require matching training configuration.",
            "MIA is empirical evidence and does not establish a formal privacy guarantee.",
            "The default MIA probe uses synthetic data; replace it with a held-out experiment dataset for publication evidence.",
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="results/privacy_mia_report.json")
    parser.add_argument("--skip-mia", action="store_true")
    args = parser.parse_args()
    path = build_report(run_mia=not args.skip_mia).write(args.out)
    print(f"Saved privacy/MIA report to {path}")


if __name__ == "__main__":
    main()
