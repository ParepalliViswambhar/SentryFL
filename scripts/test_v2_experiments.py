"""Smoke tests for the v2 reporting experiments (E3/E4 need no training)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.run_v2_experiments import experiment_e3, experiment_e4


def test_e4_prv_tighter_than_rdp():
    result = experiment_e4()
    assert result["experiment"] == "E4"
    assert result["rows"], "E4 should produce rows"
    # PRV must be at least as tight (<=) as RDP for every configuration.
    for row in result["rows"]:
        assert row["prv_epsilon"] <= row["rdp_epsilon"] + 1e-9
        assert row["rdp_over_prv"] >= 1.0


def test_e3_ffa_lora_lower_error_than_vanilla():
    result = experiment_e3(trials=50)
    assert result["experiment"] == "E3"
    # FFA-LoRA (freeze A) avoids the A*B noise cross-term -> lower aggregation error.
    assert result["ffa_lora_rmse_mean"] < result["vanilla_lora_rmse_mean"]
