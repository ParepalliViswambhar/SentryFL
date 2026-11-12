import base64
import io

import torch
import pytest

from sentryfl.api.remote_transport import RemoteClientRegistry, decode_update


def test_registry_requires_shared_secret_and_authorizes_issued_token():
    registry = RemoteClientRegistry("secret")
    with pytest.raises(PermissionError):
        registry.enroll("experiment-1", "client-1", "wrong")
    token = registry.enroll("experiment-1", "client-1", "secret")
    assert registry.authorize("experiment-1", "client-1", token)
    assert not registry.authorize("experiment-2", "client-1", token)
    assert not registry.authorize("experiment-1", "client-1", "other")


def test_decode_update_rejects_non_tensor_state():
    buffer = io.BytesIO()
    torch.save({"bad": "value"}, buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    with pytest.raises(ValueError, match="tensor"):
        decode_update(encoded)
