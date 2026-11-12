"""Authenticated remote-client enrollment and update transport primitives."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import os
import secrets
import time
from dataclasses import dataclass
from typing import Dict, Optional

import torch


MAX_UPDATE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class EnrolledClient:
    experiment_id: str
    client_id: str
    token_digest: str
    expires_at: float


class RemoteClientRegistry:
    """Issue expiring-process client tokens from a shared enrollment secret."""

    def __init__(
        self, enrollment_secret: Optional[str] = None, token_ttl_seconds: int = 3600
    ) -> None:
        self.enrollment_secret = enrollment_secret or os.getenv(
            "SENTRYFL_REMOTE_ENROLLMENT_SECRET"
        )
        self._clients: Dict[str, EnrolledClient] = {}
        self.token_ttl_seconds = int(token_ttl_seconds)

    @property
    def enabled(self) -> bool:
        return bool(self.enrollment_secret)

    def enroll(self, experiment_id: str, client_id: str, shared_secret: str) -> str:
        if not self.enabled:
            raise RuntimeError("Remote enrollment is disabled")
        if not client_id or len(client_id) > 128:
            raise ValueError("client_id must be 1-128 characters")
        if not hmac.compare_digest(shared_secret, self.enrollment_secret):
            raise PermissionError("invalid enrollment secret")
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        self._clients[f"{experiment_id}:{client_id}"] = EnrolledClient(
            experiment_id, client_id, digest, time.time() + self.token_ttl_seconds
        )
        return token

    def authorize(self, experiment_id: str, client_id: str, token: str) -> bool:
        enrolled = self._clients.get(f"{experiment_id}:{client_id}")
        if enrolled is None:
            return False
        if time.time() >= enrolled.expires_at:
            return False
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        return hmac.compare_digest(enrolled.token_digest, digest)


def decode_update(payload: str, max_bytes: int = MAX_UPDATE_BYTES) -> Dict[str, torch.Tensor]:
    """Decode a torch state dictionary with a strict size and type boundary."""
    try:
        raw = base64.b64decode(payload.encode("ascii"), validate=True)
    except Exception as exc:
        raise ValueError("update must be valid base64") from exc
    if len(raw) > max_bytes:
        raise ValueError(f"update exceeds the {max_bytes} byte limit")
    try:
        state = torch.load(io.BytesIO(raw), map_location="cpu", weights_only=True)
    except Exception as exc:
        raise ValueError("update is not a valid tensor state dictionary") from exc
    if not isinstance(state, dict) or not state:
        raise ValueError("update must contain a non-empty tensor dictionary")
    if not all(isinstance(name, str) and isinstance(value, torch.Tensor)
               for name, value in state.items()):
        raise ValueError("update entries must be named tensors")
    return {name: value.detach().cpu() for name, value in state.items()}

