"""Tests for deterministic, leakage-free temporal split boundaries."""

import numpy as np

from sentryfl.data.preprocessor import TimeSeriesPreprocessor


def test_temporal_split_boundaries_are_deterministic_and_disjoint():
    first = TimeSeriesPreprocessor.temporal_split_indices(10, 0.6, 0.2)
    second = TimeSeriesPreprocessor.temporal_split_indices(10, 0.6, 0.2)

    assert first == second
    assert first == {
        "train": (0, 6),
        "val": (6, 8),
        "test": (8, 10),
    }
    assert first["train"][1] == first["val"][0]
    assert first["val"][1] == first["test"][0]


def test_small_temporal_split_keeps_one_sample_per_split():
    boundaries = TimeSeriesPreprocessor.temporal_split_indices(3, 0.7, 0.15)
    assert boundaries == {
        "train": (0, 1),
        "val": (1, 2),
        "test": (2, 3),
    }


def test_split_data_records_protocol_metadata():
    preprocessor = TimeSeriesPreprocessor(window_size=2, normalize=False)
    data = np.arange(20).reshape(10, 2)
    labels = np.zeros(10)

    splits = preprocessor.split_data(data, labels, train_ratio=0.6, val_ratio=0.2)
    metadata = preprocessor.get_split_metadata()

    assert sum(len(value[0]) for value in splits.values()) == len(data)
    assert metadata["strategy"] == "temporal"
    assert metadata["ranges"] == {
        "train": [0, 6],
        "val": [6, 8],
        "test": [8, 10],
    }
