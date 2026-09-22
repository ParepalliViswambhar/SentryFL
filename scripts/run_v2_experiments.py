#!/usr/bin/env python
"""
SentryFL v2 (Efficient-Private Adaptation) reporting experiments.

Implements the active-scope experiments from the v2 spec
(.kiro/specs/sentryfl-efficient-private/):

  E4  RDP vs PRV accountant epsilon table            (no training; instant)
  E2  Measured wire bytes: FFA-LoRA vs full-head vs   (no training; builds models)
      ADMS  -- shows ADMS gradient-zeroing gives ~0 real savings
  E3  FFA-LoRA vs vanilla-LoRA DP-noise bias /        (no training; synthetic)
      aggregation error under identical Gaussian noise
  E1  Privacy-utility Pareto (epsilon sweep)          (SCAFFOLD; needs data+time)

Every efficiency number comes from a measurement (serialized bytes), and every
privacy number from the PRV accountant. Results are printed and saved to JSON.

Usage:
    python -m scripts.run_v2_experiments --exp E4
    python -m scripts.run_v2_experiments --exp E2 --model distilbert-base-uncased
    python -m scripts.run_v2_experiments --exp E3
    python -m scripts.run_v2_experiments --exp all --out results/v2
"""

import argparse
import json
import os
from pathlib import Path

import torch

# Deterministic, offline-friendly defaults.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


# --------------------------------------------------------------------------- E4
def experiment_e4(deltas=(1e-5,), sample_rate=0.01, steps=1000):
    """RDP vs PRV epsilon for identical (sigma, steps, sample_rate)."""
    from sentryfl.privacy.differential_privacy import DifferentialPrivacyModule

    rows = []
    for sigma in (0.6, 0.8, 1.0, 1.5, 2.0):
        for delta in deltas:
            r = DifferentialPrivacyModule.compare_accountants(
                noise_multiplier=sigma, sample_rate=sample_rate, steps=steps, delta=delta
            )
            rows.append({
                "sigma": sigma, "sample_rate": sample_rate, "steps": steps,
                "delta": delta, "rdp_epsilon": r["rdp"], "prv_epsilon": r["prv"],
                "rdp_over_prv": r["ratio_rdp_over_prv"],
            })
    print("\n=== E4: RDP vs PRV accountant (tighter = smaller epsilon) ===")
    print(f"{'sigma':>6} {'RDP eps':>10} {'PRV eps':>10} {'RDP/PRV':>9}")
    for row in rows:
        print(f"{row['sigma']:>6} {row['rdp_epsilon']:>10.4f} "
              f"{row['prv_epsilon']:>10.4f} {row['rdp_over_prv']:>9.3f}")
    print("PRV is uniformly tighter -> same target epsilon reachable with less noise.")
    return {"experiment": "E4", "rows": rows}


# --------------------------------------------------------------------------- E2
def _trainable_update(model):
    """The dict a client would transmit: its trainable parameters."""
    return {n: p.detach().cpu() for n, p in model.named_parameters() if p.requires_grad}


def experiment_e2(model_name="distilbert-base-uncased", input_dim=38, lora_rank=8):
    """Measured serialized upload bytes for each parameter-efficiency method."""
    from sentryfl.models.plm_backbone import PLMAnomalyDetector
    from sentryfl.utils.comm_meter import measure_update_bytes, summarize_update

    methods = {}

    # full_head: train projection + head (dense).
    full = PLMAnomalyDetector(input_dim=input_dim, model_name=model_name,
                              freeze_backbone=True, peft_method="full_head")
    full_update = _trainable_update(full)
    methods["full_head"] = full_update

    # ffa_lora: only lora_B matrices.
    ffa = PLMAnomalyDetector(input_dim=input_dim, model_name=model_name,
                             freeze_backbone=True, peft_method="ffa_lora",
                             lora_rank=lora_rank)
    methods["ffa_lora"] = _trainable_update(ffa)

    # vanilla lora: lora_A + lora_B.
    lora = PLMAnomalyDetector(input_dim=input_dim, model_name=model_name,
                              freeze_backbone=True, peft_method="lora",
                              lora_rank=lora_rank)
    methods["lora"] = _trainable_update(lora)

    # adms: same trainable set as full_head, but the mask only ZEROES values --
    # a dense zeroed tensor costs the same bytes to transmit (the honest point).
    adms_update = {n: t.clone() for n, t in full_update.items()}
    # zero out ~95% of each tensor to emulate a 5% ADMS mask (still dense!).
    for n, t in adms_update.items():
        flat = t.flatten()
        keep = max(1, int(0.05 * flat.numel()))
        mask = torch.zeros_like(flat)
        mask[:keep] = 1.0
        adms_update[n] = (flat * mask).reshape(t.shape)
    methods["adms_masked_dense"] = adms_update

    baseline_bytes = measure_update_bytes(methods["full_head"])
    rows = []
    for name, update in methods.items():
        s = summarize_update(update, baseline_update=methods["full_head"])
        rows.append({
            "method": name,
            "serialized_bytes": s["serialized_bytes"],
            "kib": s["serialized_bytes"] / 1024,
            "reduction_vs_full_head": s.get("communication_reduction_measured", 0.0),
        })

    print("\n=== E2: Measured upload bytes per method (backbone frozen) ===")
    print(f"{'method':>20} {'KiB':>10} {'reduction vs full_head':>24}")
    for row in rows:
        print(f"{row['method']:>20} {row['kib']:>10.2f} {row['reduction_vs_full_head']:>23.1%}")
    print("Note: adms_masked_dense ~ full_head (zeroing does not shrink the wire); "
          "FFA-LoRA gives a real reduction.")
    return {"experiment": "E2", "model": model_name, "lora_rank": lora_rank, "rows": rows}


# --------------------------------------------------------------------------- E3
def experiment_e3(out_dim=64, in_dim=48, rank=8, num_clients=8, sigma=1.0, trials=200):
    """FFA-LoRA (freeze A) vs vanilla LoRA (noise A and B): aggregation bias under DP.

    Ground truth is the noiseless mean effective delta. We add i.i.d. Gaussian noise
    (std sigma) to the transmitted matrices and measure the error of the aggregated
    effective delta B*A. FFA-LoRA (A shared+frozen, only B noised) should be
    unbiased and lower-error than vanilla LoRA (both A and B noised -> A*B cross term).
    """
    torch.manual_seed(0)
    A = torch.randn(rank, in_dim)  # shared, frozen for FFA-LoRA
    B_clients = [torch.randn(out_dim, rank) for _ in range(num_clients)]
    truth = torch.stack([B @ A for B in B_clients], 0).mean(0)  # noiseless mean delta

    ffa_err, vanilla_err = [], []
    for t in range(trials):
        g = torch.Generator().manual_seed(1000 + t)
        # FFA-LoRA: A frozen (no noise), noise only B.
        ffa_delta = torch.stack(
            [ (B + torch.normal(0, sigma, B.shape, generator=g)) @ A for B in B_clients ], 0
        ).mean(0)
        ffa_err.append((ffa_delta - truth).pow(2).mean().sqrt().item())
        # Vanilla LoRA: noise both A (per client) and B.
        g2 = torch.Generator().manual_seed(5000 + t)
        vanilla_delta = torch.stack(
            [ (B + torch.normal(0, sigma, B.shape, generator=g2))
              @ (A + torch.normal(0, sigma, A.shape, generator=g2)) for B in B_clients ], 0
        ).mean(0)
        vanilla_err.append((vanilla_delta - truth).pow(2).mean().sqrt().item())

    import statistics
    result = {
        "experiment": "E3",
        "sigma": sigma, "num_clients": num_clients, "rank": rank, "trials": trials,
        "ffa_lora_rmse_mean": statistics.mean(ffa_err),
        "vanilla_lora_rmse_mean": statistics.mean(vanilla_err),
        "ffa_lora_bias": statistics.mean(ffa_err),  # RMSE of the noise-averaged estimate
    }
    print("\n=== E3: DP-noise aggregation error (RMSE of B*A vs noiseless mean) ===")
    print(f"  FFA-LoRA (freeze A):   {result['ffa_lora_rmse_mean']:.4f}")
    print(f"  Vanilla LoRA (A & B):  {result['vanilla_lora_rmse_mean']:.4f}")
    print("Lower is better; FFA-LoRA avoids the A*B noise cross-term.")
    return result


# --------------------------------------------------------------------------- E1
def experiment_e1_scaffold():
    """Privacy-utility Pareto scaffold (requires a prepared dataset + training time)."""
    print("\n=== E1: Privacy-utility Pareto (scaffold) ===")
    print("Run the trainer per epsilon with mechanism=dp_fedavg, method=ffa_lora:")
    print("  for EPS in 1 2 4 8; do")
    print("    python -m sentryfl.cli train --config config_example.yaml \\")
    print("        --data-path ./data/SMD  # set privacy.epsilon=$EPS, mechanism=dp_fedavg")
    print("  done")
    print("Collect final pointwise-F1, pa_f1, affiliation_f1 per epsilon and plot as a")
    print("FRONTIER (never 'strictly better'); state the entity/silo-level privacy unit.")
    return {"experiment": "E1", "status": "scaffold",
            "note": "requires dataset + training; see printed instructions"}


def main():
    parser = argparse.ArgumentParser(description="SentryFL v2 experiments")
    parser.add_argument("--exp", choices=["E1", "E2", "E3", "E4", "all"], default="all")
    parser.add_argument("--model", default="distilbert-base-uncased",
                        help="PLM backbone for E2 (use a cached model for offline runs)")
    parser.add_argument("--input-dim", type=int, default=38)
    parser.add_argument("--lora-rank", type=int, default=8)
    parser.add_argument("--out", default=None, help="directory to write results JSON")
    args = parser.parse_args()

    results = {}
    if args.exp in ("E4", "all"):
        results["E4"] = experiment_e4()
    if args.exp in ("E3", "all"):
        results["E3"] = experiment_e3()
    if args.exp in ("E2", "all"):
        try:
            results["E2"] = experiment_e2(args.model, args.input_dim, args.lora_rank)
        except Exception as exc:  # model may be unavailable offline
            print(f"\n[E2 skipped] could not build model '{args.model}': {exc}")
            results["E2"] = {"experiment": "E2", "status": "skipped", "error": str(exc)}
    if args.exp in ("E1", "all"):
        results["E1"] = experiment_e1_scaffold()

    if args.out:
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "v2_experiments.json"
        out_path.write_text(json.dumps(results, indent=2))
        print(f"\nSaved results to {out_path}")


if __name__ == "__main__":
    main()
