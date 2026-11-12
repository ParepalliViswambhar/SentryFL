import torch
import pytest

from sentryfl.data.ppds import (
    WindowVAE,
    generate_client_synthetic_windows,
    generate_pooled_synthetic_windows,
)


def test_ppds_generates_bounded_windows_without_returning_source_data():
    source = torch.randn(5, 4, 3)
    result = generate_client_synthetic_windows(
        source, num_samples=3, epochs=1, latent_dim=2, batch_size=2
    )
    assert result.synthetic_windows.shape == (3, 4, 3)
    assert result.source_samples == 5
    assert result.to_dict()["raw_records_released"] is False


def test_ppds_pool_requires_clients_and_preserves_shape():
    pooled, metadata = generate_pooled_synthetic_windows(
        [torch.randn(3, 2, 2), torch.randn(4, 2, 2)],
        samples_per_client=2,
        epochs=1,
        latent_dim=2,
    )
    assert pooled.shape == (4, 2, 2)
    assert len(metadata) == 2


def test_ppds_rejects_invalid_input():
    with pytest.raises(ValueError, match="shape"):
        generate_client_synthetic_windows(torch.randn(4, 3), num_samples=2)
