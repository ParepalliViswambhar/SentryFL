"""
Communication Meter for SentryFL (v2)

Measures the ACTUAL serialized byte size of a federated update as it would be
transmitted, instead of estimating communication savings from parameter counts.

Motivation (v2 honesty fix): earlier code reported "communication reduction" from
the fraction of selected parameters (ADMS) or from model-size reduction
(quantization). Neither reflects bytes on the wire. In particular, an ADMS mask
that merely zeroes gradient values transmits a DENSE tensor of the same size, so
its true wire savings are zero. This module counts the real payload so efficiency
claims trace to a measurement.
"""

import io
from typing import Dict, Iterable, Optional

import torch


def measure_update_bytes(update: Dict[str, torch.Tensor]) -> int:
    """
    Serialize a parameter/adapter update the way it would be sent and return its
    size in bytes.

    The update is whatever the client actually transmits: a dict of dense tensors
    for full/head/LoRA updates, or a dict containing sparse (index, value) tensors
    if a sparsifier is used. Whatever is in the dict is what gets counted.

    Args:
        update: Mapping of name -> tensor to be transmitted.

    Returns:
        Serialized size in bytes (int).
    """
    if not isinstance(update, dict):
        raise TypeError(f"update must be a dict of tensors, got {type(update)!r}")

    buffer = io.BytesIO()
    # Detach + move to CPU so we measure transmittable payload, not autograd graph.
    to_send = {
        name: (t.detach().cpu() if isinstance(t, torch.Tensor) else t)
        for name, t in update.items()
    }
    torch.save(to_send, buffer)
    return buffer.getbuffer().nbytes


def measure_tensor_dense_bytes(tensors: Iterable[torch.Tensor]) -> int:
    """
    Raw dense byte size (numel * element_size) summed over tensors.

    This is the theoretical minimum for dense transmission and is useful as a
    reference against the serialized size from ``measure_update_bytes`` (which
    includes container/framing overhead).
    """
    return sum(t.numel() * t.element_size() for t in tensors if isinstance(t, torch.Tensor))


def communication_reduction(
    baseline_update: Dict[str, torch.Tensor],
    efficient_update: Dict[str, torch.Tensor],
) -> float:
    """
    Fraction of bytes saved by the efficient update relative to a baseline,
    both measured by serialization.

    Returns a value in [0, 1): 1 - efficient_bytes / baseline_bytes, clamped at 0
    if the "efficient" update is not actually smaller (which is the honest result
    for e.g. dense zeroed masks).

    Args:
        baseline_update: The reference (e.g. full-model or full-head) update.
        efficient_update: The update whose savings we are measuring.

    Returns:
        Measured communication reduction fraction.
    """
    baseline_bytes = measure_update_bytes(baseline_update)
    efficient_bytes = measure_update_bytes(efficient_update)
    if baseline_bytes <= 0:
        return 0.0
    return max(0.0, 1.0 - (efficient_bytes / baseline_bytes))


def summarize_update(
    update: Dict[str, torch.Tensor],
    baseline_update: Optional[Dict[str, torch.Tensor]] = None,
) -> Dict[str, float]:
    """
    Convenience summary for logging/dashboard: measured serialized bytes, dense
    bytes, and (optionally) the measured reduction vs a baseline.
    """
    tensors = [t for t in update.values() if isinstance(t, torch.Tensor)]
    summary = {
        "serialized_bytes": float(measure_update_bytes(update)),
        "dense_bytes": float(measure_tensor_dense_bytes(tensors)),
        "num_tensors": float(len(tensors)),
    }
    if baseline_update is not None:
        summary["communication_reduction_measured"] = communication_reduction(
            baseline_update, update
        )
    return summary
