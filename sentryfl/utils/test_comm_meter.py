"""
Tests for the communication meter (v2 honest communication accounting).

Requirements: v2 FR-2.5, FR-4.2 - communication reduction must come from measured
serialized bytes, and dense gradient-zeroing (ADMS-style) must show ~0 real saving.
"""

import torch

from sentryfl.utils.comm_meter import (
    measure_update_bytes,
    measure_tensor_dense_bytes,
    communication_reduction,
    summarize_update,
)


def test_measure_update_bytes_positive_and_scales_with_size():
    small = {"a": torch.zeros(10)}
    big = {"a": torch.zeros(10_000)}
    assert measure_update_bytes(small) > 0
    assert measure_update_bytes(big) > measure_update_bytes(small)


def test_measure_update_bytes_rejects_non_dict():
    try:
        measure_update_bytes([torch.zeros(3)])  # type: ignore[arg-type]
        assert False, "expected TypeError"
    except TypeError:
        pass


def test_dense_zeroing_gives_no_real_reduction():
    """A dense tensor of zeros costs the same bytes as a dense tensor of values.

    This is the core ADMS honesty property: masking-by-zeroing does not reduce
    the wire payload.
    """
    full = {"w": torch.randn(1000)}
    masked_dense = {"w": torch.randn(1000)}
    # Simulate ADMS: zero out 95% of the values but keep the dense tensor shape.
    mask = torch.zeros(1000)
    mask[:50] = 1.0
    masked_dense["w"] = masked_dense["w"] * mask

    reduction = communication_reduction(full, masked_dense)
    assert reduction < 0.05, f"dense zeroing should not save bytes, got {reduction}"


def test_sparse_encoding_gives_real_reduction():
    """Transmitting only (index, value) for selected params IS a real saving."""
    full = {"w": torch.randn(1000)}
    # Sparse update: 50 selected entries as index+value pairs.
    idx = torch.arange(50)
    val = torch.randn(50)
    sparse = {"w_idx": idx, "w_val": val}
    reduction = communication_reduction(full, sparse)
    assert reduction > 0.5, f"sparse encoding should save >50%, got {reduction}"


def test_summarize_update_reports_measured_reduction():
    full = {"w": torch.randn(2000)}
    sparse = {"w_idx": torch.arange(100), "w_val": torch.randn(100)}
    summary = summarize_update(sparse, baseline_update=full)
    assert summary["serialized_bytes"] > 0
    assert summary["dense_bytes"] > 0
    assert 0.0 <= summary["communication_reduction_measured"] <= 1.0
    assert summary["communication_reduction_measured"] > 0.5


def test_dense_bytes_matches_numel_times_element_size():
    t = torch.zeros(256, dtype=torch.float32)
    assert measure_tensor_dense_bytes([t]) == 256 * 4
