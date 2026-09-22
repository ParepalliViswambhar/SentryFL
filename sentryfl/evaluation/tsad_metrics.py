"""
Time-Series Anomaly Detection (TSAD) evaluation metrics (SentryFL v2).

Point-wise precision/recall/F1 (already in the evaluation pipeline) is known to be
a weak protocol for time-series anomaly detection. This module adds the metrics
current TSAD literature reports so results are comparable and honest:

- ``point_adjust_f1``: point-adjusted (PA) precision/recall/F1 (Xu et al. 2018).
  If ANY point inside a ground-truth anomaly segment is flagged, the whole segment
  is counted as detected. PA inflates scores and is controversial (Kim et al. 2022),
  so it is reported ALONGSIDE untuned point-wise metrics, never instead of them.
- ``pa_k_sweep``: PA%K (Kim et al. 2022) — a segment counts as detected only if at
  least K% of its points are flagged. Sweeping K interpolates between point-wise
  (K=100) and point-adjust (K->0), exposing the PA inflation.
- ``event_wise_pr``: segment/event-level precision/recall (a true event is a hit
  if it overlaps any predicted positive; a predicted segment is a true positive if
  it overlaps any true event).
- ``affiliation_pr``: affiliation-based precision/recall (Huet et al. 2021),
  computed from temporal distances between predicted positives and ground-truth
  events. A distance-based, parameter-free definition is implemented here; the
  optional ``affiliation-metrics`` package, if installed, is preferred.

All functions take 1-D binary/label arrays over time (0 = normal, 1 = anomaly).
"""

from typing import Dict, List, Sequence

import numpy as np


def _to_binary(arr: Sequence) -> np.ndarray:
    a = np.asarray(arr).astype(int).ravel()
    return (a != 0).astype(int)


def find_segments(labels: np.ndarray) -> List[tuple]:
    """Return list of (start, end_inclusive) index ranges of contiguous 1s."""
    labels = _to_binary(labels)
    segments = []
    start = None
    for i, v in enumerate(labels):
        if v == 1 and start is None:
            start = i
        elif v == 0 and start is not None:
            segments.append((start, i - 1))
            start = None
    if start is not None:
        segments.append((start, len(labels) - 1))
    return segments


def _prf(tp: int, fp: int, fn: int) -> Dict[str, float]:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": precision, "recall": recall, "f1": f1}


def point_adjust_predictions(labels: np.ndarray, preds: np.ndarray) -> np.ndarray:
    """Apply point-adjustment: flag every point of a true segment that was hit."""
    labels = _to_binary(labels)
    preds = _to_binary(preds)
    adjusted = preds.copy()
    for (s, e) in find_segments(labels):
        if preds[s : e + 1].any():
            adjusted[s : e + 1] = 1
    return adjusted


def point_adjust_f1(labels: Sequence, preds: Sequence) -> Dict[str, float]:
    """Point-adjusted precision/recall/F1 (Xu et al. 2018)."""
    labels = _to_binary(labels)
    adjusted = point_adjust_predictions(labels, _to_binary(preds))
    tp = int(np.sum((adjusted == 1) & (labels == 1)))
    fp = int(np.sum((adjusted == 1) & (labels == 0)))
    fn = int(np.sum((adjusted == 0) & (labels == 1)))
    return _prf(tp, fp, fn)


def pa_k_sweep(
    labels: Sequence,
    preds: Sequence,
    ks: Sequence[float] = (0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100),
) -> Dict[float, float]:
    """
    PA%K sweep (Kim et al. 2022): F1 as a function of the K% detection threshold.

    A ground-truth segment is counted as fully detected only if at least K% of its
    points are flagged; otherwise only the actually-flagged points count. K=100
    approaches point-wise; K=0 approaches point-adjust.

    Returns {K: point-adjusted-style F1 at that K}.
    """
    labels = _to_binary(labels)
    preds = _to_binary(preds)
    segments = find_segments(labels)
    out: Dict[float, float] = {}
    for k in ks:
        adjusted = preds.copy()
        for (s, e) in segments:
            seg_len = e - s + 1
            hit_frac = 100.0 * preds[s : e + 1].sum() / seg_len
            if hit_frac >= k:
                adjusted[s : e + 1] = 1
            # else: leave the segment's points as their raw predictions
        tp = int(np.sum((adjusted == 1) & (labels == 1)))
        fp = int(np.sum((adjusted == 1) & (labels == 0)))
        fn = int(np.sum((adjusted == 0) & (labels == 1)))
        out[float(k)] = _prf(tp, fp, fn)["f1"]
    return out


def event_wise_pr(labels: Sequence, preds: Sequence) -> Dict[str, float]:
    """
    Segment/event-level precision/recall.

    Recall TP: true segments overlapped by any prediction. Precision TP: predicted
    segments overlapping any true event. Reported separately from point-wise.
    """
    labels = _to_binary(labels)
    preds = _to_binary(preds)
    true_segs = find_segments(labels)
    pred_segs = find_segments(preds)

    def overlaps(a, b):
        return not (a[1] < b[0] or b[1] < a[0])

    detected = sum(1 for ts in true_segs if any(overlaps(ts, ps) for ps in pred_segs))
    correct_pred = sum(1 for ps in pred_segs if any(overlaps(ps, ts) for ts in true_segs))

    recall = detected / len(true_segs) if true_segs else 0.0
    precision = correct_pred / len(pred_segs) if pred_segs else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": precision, "recall": recall, "f1": f1}


def affiliation_pr(labels: Sequence, preds: Sequence) -> Dict[str, float]:
    """
    Affiliation-based precision/recall (Huet et al., KDD 2021).

    Prefers the ``affiliation-metrics`` package when installed. Otherwise computes a
    parameter-free, distance-based approximation:
      - affiliation precision: mean over predicted-positive timestamps of a proximity
        score exp(-d / T), where d is the distance to the nearest ground-truth
        anomaly point and T is the mean true-segment length (temporal tolerance).
      - affiliation recall: mean over ground-truth anomaly timestamps of the proximity
        to the nearest predicted-positive timestamp.
    Both lie in [0, 1]; 1 means predictions and ground truth are temporally aligned.
    The approximation is clearly labeled and is faithful to the affiliation principle
    (credit temporally-close detections rather than requiring exact overlap).
    """
    labels = _to_binary(labels)
    preds = _to_binary(preds)

    # Prefer the reference library if available.
    try:  # pragma: no cover - exercised only when the package is installed
        from affiliation.generics import convert_vector_to_events
        from affiliation.metrics import pr_from_events

        true_events = convert_vector_to_events(labels)
        pred_events = convert_vector_to_events(preds)
        if not true_events:
            return {"precision": 0.0, "recall": 0.0, "f1": 0.0, "backend": "library"}
        res = pr_from_events(pred_events, true_events, (0, len(labels)))
        p = float(res["precision"])
        r = float(res["recall"])
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        return {"precision": p, "recall": r, "f1": f1, "backend": "library"}
    except Exception:
        pass  # fall back to the built-in approximation

    true_idx = np.flatnonzero(labels == 1)
    pred_idx = np.flatnonzero(preds == 1)
    true_segs = find_segments(labels)
    if true_idx.size == 0:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0, "backend": "approx"}

    tol = np.mean([e - s + 1 for (s, e) in true_segs]) if true_segs else 1.0
    tol = max(tol, 1.0)

    def nearest_dist(query_idx, ref_idx):
        if ref_idx.size == 0:
            return np.full(query_idx.shape, np.inf)
        pos = np.searchsorted(ref_idx, query_idx)
        pos = np.clip(pos, 1, len(ref_idx) - 1)
        left = ref_idx[pos - 1]
        right = ref_idx[np.clip(pos, 0, len(ref_idx) - 1)]
        return np.minimum(np.abs(query_idx - left), np.abs(query_idx - right))

    if pred_idx.size == 0:
        precision = 0.0
    else:
        d_pred = nearest_dist(pred_idx, true_idx)
        precision = float(np.mean(np.exp(-d_pred / tol)))

    d_true = nearest_dist(true_idx, pred_idx)
    recall = float(np.mean(np.exp(-d_true / tol)))
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "backend": "approx"}
