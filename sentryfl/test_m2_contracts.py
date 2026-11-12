"""Focused tests for the M2 bounded-pipeline and recovery contracts."""

import numpy as np
import pytest

from sentryfl.data.preprocessor import TimeSeriesPreprocessor
from sentryfl.utils.config import ConfigurationError, ConfigurationSystem
from sentryfl.trainer import MainTrainer


def test_unsupported_ppds_and_kd_fail_explicitly():
    with pytest.raises(ConfigurationError, match="ppds_enabled.*unsupported"):
        ConfigurationSystem.from_dict(
            {"parameter_efficiency": {"ppds_enabled": True}}
        )

    with pytest.raises(ConfigurationError, match="knowledge_distillation_enabled.*unsupported"):
        ConfigurationSystem.from_dict(
            {"optimization": {"knowledge_distillation_enabled": True}}
        )


def test_iter_windows_is_bounded_and_matches_materialized_windows():
    data = np.arange(40, dtype=np.float32).reshape(20, 2)
    labels = np.arange(20, dtype=np.int64)
    preprocessor = TimeSeriesPreprocessor(window_size=4, stride=2, normalize=False)

    expected, expected_labels = preprocessor.create_windows(
        data, labels, chunk_size=3
    )
    chunks = list(preprocessor.iter_windows(data, labels, chunk_size=3))
    actual = np.concatenate([chunk[0] for chunk in chunks], axis=0)
    actual_labels = np.concatenate([chunk[1] for chunk in chunks], axis=0)

    assert len(chunks) == 3
    assert all(chunk[0].shape[0] <= 3 for chunk in chunks)
    np.testing.assert_array_equal(actual, expected)
    np.testing.assert_array_equal(actual_labels, expected_labels)


def test_rng_capture_and_restore_round_trip():
    import random
    import torch

    random.seed(11)
    np.random.seed(11)
    torch.manual_seed(11)
    state = MainTrainer._capture_rng_state()
    expected = (random.random(), np.random.random(), torch.rand(1).item())

    MainTrainer._restore_rng_state(state)
    restored = (random.random(), np.random.random(), torch.rand(1).item())
    assert restored == pytest.approx(expected)
