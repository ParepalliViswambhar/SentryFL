"""Synthetic (demo) dataset generation.

Lets an experiment run with zero setup: instead of requiring the ~140 MB SMD
or NSL-KDD downloads, we synthesise small datasets in the *exact on-disk format*
the real loaders expect (SMD ``train/test/test_label.txt``; NSL-KDD
``KDDTrain+/KDDTest+.txt``). The normal training pipeline then runs unchanged
against these files, so the demo path exercises the same code the real path does
and carries no regression risk to the loaders.

The generated data is deliberately separable — normal behaviour plus injected
anomalies — so a run produces non-degenerate loss/F1/AUC and the dashboard has
something meaningful to plot.
"""

from pathlib import Path
from typing import Tuple, Union

import numpy as np
import pandas as pd

from .dataset_loader import NSLKDDDatasetLoader

# SMD real feature dimensionality; kept in sync with build_trainer's input_dim.
_SMD_FEATURE_DIM = 38


def _generate_smd(
    rng: np.random.Generator,
    feature_dim: int = _SMD_FEATURE_DIM,
    n_train: int = 2000,
    n_test: int = 1000,
    anomaly_ratio: float = 0.05,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (train, test, test_labels) SMD-shaped arrays with injected anomalies."""
    # Shared per-feature sinusoid params so train and test share a distribution.
    freqs = rng.uniform(0.005, 0.05, size=feature_dim)
    phases = rng.uniform(0.0, 2 * np.pi, size=feature_dim)
    amps = rng.uniform(0.5, 1.5, size=feature_dim)

    def signal(length: int) -> np.ndarray:
        t = np.arange(length)
        return amps * np.sin(freqs * t[:, None] + phases)

    train = signal(n_train) + rng.normal(0.0, 0.1, size=(n_train, feature_dim))
    test = signal(n_test) + rng.normal(0.0, 0.1, size=(n_test, feature_dim))

    labels = np.zeros(n_test, dtype=int)
    n_anom = max(1, int(n_test * anomaly_ratio))
    seg_len = max(5, n_anom // 5)
    n_segments = min(5, (n_test - seg_len) // seg_len)
    positions = rng.choice(
        np.arange(0, n_test - seg_len), size=max(1, n_segments), replace=False
    )
    affected = rng.choice(feature_dim, size=max(3, feature_dim // 4), replace=False)
    for start in positions:
        # Single-setitem advanced indexing writes back into `test` (a chained
        # `test[rows][:, cols] +=` would assign into a temporary copy instead).
        test[start:start + seg_len, affected] += rng.uniform(3.0, 6.0, size=len(affected))
        labels[start:start + seg_len] = 1

    return train, test, labels


def _generate_nslkdd(rng: np.random.Generator, n_rows: int) -> pd.DataFrame:
    """Return an NSL-KDD-shaped DataFrame (41 features + label + difficulty)."""
    cols = NSLKDDDatasetLoader.COLUMN_NAMES
    categorical = {
        "protocol_type": ["tcp", "udp", "icmp"],
        "service": ["http", "private", "domain_u", "smtp", "ftp_data", "other"],
        "flag": ["SF", "S0", "REJ", "RSTR", "SH"],
    }
    attacks = ["normal", "normal", "normal", "neptune", "smurf", "satan", "back"]

    label = rng.choice(attacks, size=n_rows).astype(object)
    # Guarantee both classes are present regardless of sampling.
    label[0] = "normal"
    label[1] = "neptune"
    is_attack = (label != "normal").astype(float)

    data = {}
    for col in cols:
        if col == "label":
            data[col] = label
        elif col == "difficulty":
            data[col] = rng.integers(0, 22, size=n_rows)
        elif col in categorical:
            data[col] = rng.choice(categorical[col], size=n_rows)
        else:
            # Numeric feature: noise plus an attack-correlated shift so the two
            # classes are learnable rather than pure noise.
            data[col] = rng.random(n_rows) + is_attack * rng.random(n_rows) * 0.5

    return pd.DataFrame(data, columns=cols)


def ensure_demo_dataset(dataset: str, base_dir: Union[str, Path], seed: int = 42) -> str:
    """Ensure a synthetic ``dataset`` exists under ``base_dir/<dataset>/``.

    Idempotent: regenerates only when the expected files are missing, so repeat
    runs reuse the cached demo data. Returns ``base_dir`` (the root that
    ``build_trainer`` joins the dataset name onto), mirroring the real layout.
    """
    base = Path(base_dir)

    if dataset == "SMD":
        machine_dir = base / "SMD" / "machine-1-1"
        train_f = machine_dir / "train.txt"
        test_f = machine_dir / "test.txt"
        label_f = machine_dir / "test_label.txt"
        if not (train_f.exists() and test_f.exists() and label_f.exists()):
            machine_dir.mkdir(parents=True, exist_ok=True)
            rng = np.random.default_rng(seed)
            train, test, labels = _generate_smd(rng)
            np.savetxt(train_f, train, delimiter=",", fmt="%.6f")
            np.savetxt(test_f, test, delimiter=",", fmt="%.6f")
            np.savetxt(label_f, labels, delimiter=",", fmt="%d")

    elif dataset == "NSL-KDD":
        data_dir = base / "NSL-KDD"
        train_f = data_dir / "KDDTrain+.txt"
        test_f = data_dir / "KDDTest+.txt"
        if not (train_f.exists() and test_f.exists()):
            data_dir.mkdir(parents=True, exist_ok=True)
            rng = np.random.default_rng(seed)
            _generate_nslkdd(rng, 2000).to_csv(train_f, header=False, index=False)
            _generate_nslkdd(rng, 1000).to_csv(test_f, header=False, index=False)

    else:
        raise ValueError(f"Unknown dataset for demo generation: {dataset}")

    return str(base)
