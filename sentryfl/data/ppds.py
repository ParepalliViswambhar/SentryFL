"""Client-local PPDS-style synthetic window generation.

This module provides a bounded variational autoencoder utility for the optional
post-training distillation path. Each client fits its own generator locally;
only generated windows are pooled for the student-training step. Raw client
records are never returned by the pool.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset


class WindowVAE(nn.Module):
    """Small VAE for fixed-size time-series windows."""

    def __init__(self, input_shape: Tuple[int, int], latent_dim: int = 16) -> None:
        super().__init__()
        self.input_shape = tuple(input_shape)
        self.input_dim = int(input_shape[0] * input_shape[1])
        self.latent_dim = int(latent_dim)
        hidden = max(32, min(256, self.input_dim // 2))
        self.encoder = nn.Sequential(nn.Linear(self.input_dim, hidden), nn.ReLU())
        self.mu = nn.Linear(hidden, self.latent_dim)
        self.logvar = nn.Linear(hidden, self.latent_dim)
        self.decoder = nn.Sequential(
            nn.Linear(self.latent_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, self.input_dim),
        )

    def encode(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        hidden = self.encoder(x.flatten(start_dim=1))
        return self.mu(hidden), self.logvar(hidden)

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        std = torch.exp(0.5 * logvar)
        return mu + torch.randn_like(std) * std

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return self.decoder(z).reshape(-1, *self.input_shape)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encode(x)
        return self.decode(self.reparameterize(mu, logvar)), mu, logvar


def _vae_loss(
    reconstruction: torch.Tensor,
    source: torch.Tensor,
    mu: torch.Tensor,
    logvar: torch.Tensor,
    beta: float,
) -> torch.Tensor:
    reconstruction_loss = torch.mean((reconstruction - source) ** 2)
    kl = -0.5 * torch.mean(1 + logvar - mu.pow(2) - logvar.exp())
    return reconstruction_loss + beta * kl


@dataclass(frozen=True)
class PPDSResult:
    """Synthetic data and provenance from one client-local generator."""

    synthetic_windows: torch.Tensor
    source_samples: int
    generated_samples: int
    epochs: int
    latent_dim: int
    reconstruction_loss: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "source_samples": self.source_samples,
            "generated_samples": self.generated_samples,
            "epochs": self.epochs,
            "latent_dim": self.latent_dim,
            "reconstruction_loss": self.reconstruction_loss,
            "raw_records_released": False,
        }


def generate_client_synthetic_windows(
    windows: torch.Tensor,
    *,
    num_samples: int,
    epochs: int = 5,
    latent_dim: int = 16,
    batch_size: int = 32,
    learning_rate: float = 1e-3,
    beta: float = 1e-3,
    device: str = "cpu",
) -> PPDSResult:
    """Fit a client-local VAE and return generated windows only."""
    if windows.ndim != 3:
        raise ValueError(f"windows must have shape [N, T, D], got {tuple(windows.shape)}")
    if len(windows) == 0:
        raise ValueError("windows cannot be empty")
    if num_samples <= 0 or epochs <= 0 or latent_dim <= 0 or batch_size <= 0:
        raise ValueError("num_samples, epochs, latent_dim, and batch_size must be positive")

    source = windows.detach().float().cpu()
    model = WindowVAE((source.shape[1], source.shape[2]), latent_dim).to(device)
    loader = DataLoader(TensorDataset(source), batch_size=batch_size, shuffle=True)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    final_loss = 0.0
    model.train()
    for _ in range(epochs):
        total = 0.0
        batches = 0
        for (batch,) in loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            reconstruction, mu, logvar = model(batch)
            loss = _vae_loss(reconstruction, batch, mu, logvar, beta)
            loss.backward()
            optimizer.step()
            total += float(loss.item())
            batches += 1
        final_loss = total / max(1, batches)

    model.eval()
    with torch.no_grad():
        latent = torch.randn(num_samples, latent_dim, device=device)
        generated = model.decode(latent).cpu()
    return PPDSResult(
        synthetic_windows=generated,
        source_samples=len(source),
        generated_samples=len(generated),
        epochs=epochs,
        latent_dim=latent_dim,
        reconstruction_loss=final_loss,
    )


def generate_pooled_synthetic_windows(
    client_windows: Iterable[torch.Tensor],
    *,
    samples_per_client: int,
    **kwargs: object,
) -> Tuple[torch.Tensor, List[Dict[str, object]]]:
    """Generate and pool synthetic windows without returning client source data."""
    results: List[PPDSResult] = []
    for windows in client_windows:
        results.append(
            generate_client_synthetic_windows(
                windows, num_samples=samples_per_client, **kwargs
            )
        )
    if not results:
        raise ValueError("client_windows must contain at least one client")
    return torch.cat([result.synthetic_windows for result in results]), [
        result.to_dict() for result in results
    ]
