"""
Tests for v2 TSAD metrics and honest threshold selection.

Requirements: v2 FR-3 (held-out threshold, PA/PA%K/affiliation), property P-EVAL-1
(test labels never used for threshold selection by default).
"""

import numpy as np
import torch
import torch.nn as nn

from sentryfl.evaluation.tsad_metrics import (
    find_segments,
    point_adjust_f1,
    pa_k_sweep,
    event_wise_pr,
    affiliation_pr,
)
from sentryfl.evaluation.evaluation_pipeline import EvaluationPipeline


# ---------------- TSAD metric correctness ----------------

def test_find_segments():
    labels = np.array([0, 1, 1, 0, 0, 1, 0, 1, 1, 1])
    assert find_segments(labels) == [(1, 2), (5, 5), (7, 9)]


def test_point_adjust_detects_whole_segment_on_single_hit():
    labels = np.array([0, 1, 1, 1, 0])
    preds = np.array([0, 0, 1, 0, 0])  # one hit inside the segment
    pa = point_adjust_f1(labels, preds)
    # After adjustment the whole segment counts as detected -> perfect recall.
    assert pa["recall"] == 1.0
    assert pa["f1"] > 0.0


def test_point_adjust_no_hit_no_credit():
    labels = np.array([0, 1, 1, 1, 0])
    preds = np.array([0, 0, 0, 0, 0])
    pa = point_adjust_f1(labels, preds)
    assert pa["recall"] == 0.0
    assert pa["f1"] == 0.0


def test_pa_k_sweep_monotonic_shape():
    labels = np.array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0])
    preds = np.array([0, 1, 0, 0, 0, 0, 0, 1, 1, 0])
    curve = pa_k_sweep(labels, preds, ks=[0, 50, 100])
    assert set(curve.keys()) == {0.0, 50.0, 100.0}
    # K=0 (point-adjust) should be >= K=100 (point-wise) F1.
    assert curve[0.0] >= curve[100.0] - 1e-9


def test_event_wise_pr_overlap():
    labels = np.array([0, 1, 1, 0, 0, 1, 1, 0])
    preds = np.array([0, 0, 1, 0, 0, 0, 0, 0])  # hits 1st event only
    ev = event_wise_pr(labels, preds)
    assert ev["recall"] == 0.5  # 1 of 2 true events detected
    assert ev["precision"] == 1.0  # the single predicted segment overlaps a true event


def test_affiliation_rewards_near_misses():
    labels = np.array([0, 0, 1, 0, 0])
    near = np.array([0, 1, 0, 0, 0])   # 1 step off
    far = np.array([1, 0, 0, 0, 0])    # 2 steps off
    a_near = affiliation_pr(labels, near)
    a_far = affiliation_pr(labels, far)
    assert a_near["recall"] >= a_far["recall"]


# ---------------- Honest threshold selection ----------------

class _ScoreModel(nn.Module):
    """Model whose output equals the (precomputed) per-sample score."""
    def __init__(self, scores):
        super().__init__()
        self._scores = torch.tensor(scores, dtype=torch.float32)
        self._p = nn.Parameter(torch.zeros(1))  # so .to()/.parameters() work

    def forward(self, x):
        # Tests use a single batch (batch_size == N), so return the first n scores.
        n = x.shape[0]
        return self._scores[:n].unsqueeze(-1)


def _make_pipeline(scores, **kwargs):
    model = _ScoreModel(scores)
    return EvaluationPipeline(model=model, device="cpu", **kwargs)


def test_default_threshold_is_unsupervised_no_label_leakage(monkeypatch):
    # P-EVAL-1: by default, test labels must NOT reach determine_optimal_threshold.
    scores = np.linspace(0, 1, 50)
    labels = (scores > 0.8).astype(int)
    pipe = _make_pipeline(scores)  # threshold_split defaults to "val"

    called = {"n": 0}
    orig = pipe.determine_optimal_threshold

    def spy(s, l, method="f1"):
        called["n"] += 1
        return orig(s, l, method)

    monkeypatch.setattr(pipe, "determine_optimal_threshold", spy)
    x = torch.zeros(50, 4)
    m = pipe.evaluate(x, labels, batch_size=50)
    assert m.threshold_source == "unsupervised"
    assert called["n"] == 0, "test labels must not be used for threshold selection"


def test_validation_threshold_used_when_provided():
    scores = np.linspace(0, 1, 40)
    labels = (scores > 0.8).astype(int)
    pipe = _make_pipeline(scores)
    x = torch.zeros(40, 4)
    # Provide a validation split; its scores are recomputed by the model, but the
    # key assertion is provenance.
    m = pipe.evaluate(x, labels, batch_size=40, val_data=x, val_labels=labels)
    assert m.threshold_source == "val"


def test_test_oracle_opt_in_is_labeled_and_warns():
    scores = np.linspace(0, 1, 30)
    labels = (scores > 0.8).astype(int)
    pipe = _make_pipeline(scores, threshold_split="test_oracle")
    x = torch.zeros(30, 4)
    import warnings as _w
    with _w.catch_warnings(record=True) as caught:
        _w.simplefilter("always")
        m = pipe.evaluate(x, labels, batch_size=30)
    assert m.threshold_source == "test_oracle"
    assert any("TEST labels" in str(c.message) for c in caught)


def test_fixed_threshold_source():
    scores = np.linspace(0, 1, 20)
    labels = (scores > 0.8).astype(int)
    pipe = _make_pipeline(scores)
    x = torch.zeros(20, 4)
    m = pipe.evaluate(x, labels, batch_size=20, threshold=0.5)
    assert m.threshold_source == "fixed"
    assert m.threshold == 0.5


def test_invalid_threshold_split_rejected():
    try:
        _make_pipeline(np.zeros(5), threshold_split="bogus")
        assert False, "expected ValueError"
    except ValueError:
        pass
