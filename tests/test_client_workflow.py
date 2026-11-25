"""
Tests for SentryFL client workflow: local prediction, local training, and update serialization.
"""

import tempfile
from pathlib import Path
import numpy as np
import torch
import pytest

from sentryfl.client import SentryFLClient
from sentryfl.models.plm_backbone import PLMAnomalyDetector
from sentryfl.api.remote_transport import parse_client_update_payload


def test_client_local_workflow():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        
        # 1. Create a synthetic private CSV dataset on the client
        np.random.seed(42)
        data = np.random.randn(250, 38).astype(np.float32)
        # Add an anomaly
        data[100:110, :] += 5.0
        csv_file = tmp_path / "private_telemetry.csv"
        np.savetxt(csv_file, data, delimiter=",")
        
        # 2. Save a mock global model checkpoint
        model = PLMAnomalyDetector(input_dim=38, hidden_dim=64, model_name="gpt2", freeze_backbone=True)
        checkpoint_file = tmp_path / "global_model.pt"
        torch.save({
            "experiment_id": "test_exp",
            "state_dict": model.state_dict(),
            "config": {"dataset": "SMD"},
        }, checkpoint_file)
        
        # 3. Initialize SentryFLClient
        client = SentryFLClient(server_url="http://localhost:3000", experiment_id="test_exp", client_id="test_client_1")
        
        # 4. Local Anomaly Detection (Inference)
        pred_out = tmp_path / "preds.json"
        results = client.predict_local(
            data_path=csv_file,
            model_path=checkpoint_file,
            window_size=50,
            threshold=0.5,
            output_path=str(pred_out),
        )
        assert "anomalies_detected" in results
        assert results["total_windows"] > 0
        assert pred_out.exists()
        
        # 5. Local Training (Private gradient descent)
        update_out = tmp_path / "update.pt"
        saved_path, metrics = client.train_local(
            data_path=csv_file,
            model_path=checkpoint_file,
            epochs=1,
            batch_size=16,
            output_update_path=str(update_out),
        )
        assert saved_path.exists()
        assert "loss" in metrics
        assert metrics["num_samples"] > 0
        
        # 6. Verify update payload parsing
        raw_bytes = saved_path.read_bytes()
        params, samples, ret_metrics = parse_client_update_payload(raw_bytes)
        assert isinstance(params, dict)
        assert len(params) > 0
        assert samples == metrics["num_samples"]
        for p_name, tensor in params.items():
            assert isinstance(tensor, torch.Tensor)
            assert not torch.isnan(tensor).any()


def test_remote_federation_updates_global_model_and_mia_report():
    import base64
    import io
    from fastapi.testclient import TestClient
    from sentryfl.api.app import create_app
    from sentryfl.api.runner import ExperimentRunner
    from sentryfl.api.schemas import ExperimentConfig

    app = create_app()
    client = TestClient(app)

    # Start remote collaborative experiment with lightweight hidden_dim=64 for fast test execution
    res = client.post(
        "/train",
        json={
            "dataset": "SMD",
            "num_clients": 2,
            "num_rounds": 3,
            "clients_per_round": 2,
            "epsilon": 2.0,
            "federation_mode": "remote",
            "enable_quantization": False,
            "max_train_rows": 1000,
            "max_test_rows": 200,
            "model_params": {"hidden_dim": 64},
        },
    )
    assert res.status_code == 202
    exp_id = res.json()["experiment_id"]

    # Wait briefly until global model v0 is ready
    model_resp = None
    import time
    for _ in range(30):
        r = client.get(f"/train/{exp_id}/model")
        if r.status_code == 200:
            model_resp = r.content
            break
        time.sleep(0.5)
    assert model_resp is not None, "Global model v0 did not initialize in remote mode"

    ckpt0 = torch.load(io.BytesIO(model_resp), map_location="cpu", weights_only=False)
    head_w0 = ckpt0["state_dict"]["head.fc1.weight"].clone()

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        # 5-column custom telemetry CSV aligned automatically to model input_dim=38
        csv_file = tmp_path / "custom_5col.csv"
        np.savetxt(csv_file, np.random.randn(150, 5).astype(np.float32), delimiter=",")
        model_pt = tmp_path / "global_v0.pt"
        model_pt.write_bytes(model_resp)

        edge_client = SentryFLClient(experiment_id=exp_id, client_id="edge_c1")
        # Option A: Use locally without modifying server
        preds = edge_client.predict_local(data_path=csv_file, model_path=model_pt)
        assert preds["total_windows"] > 0

        # Option B: Finetune locally and upload
        upd_path, metrics = edge_client.train_local(data_path=csv_file, model_path=model_pt, epochs=1, batch_size=16)
        b64 = base64.b64encode(upd_path.read_bytes()).decode("ascii")

    up_res = client.post(
        f"/train/{exp_id}/model/upload",
        json={
            "client_id": "edge_c1",
            "num_samples": metrics["num_samples"],
            "update_base64": b64,
            "metrics": metrics,
            "auto_aggregate": True,
        },
    )
    assert up_res.status_code == 200
    assert up_res.json()["round"] == 1
    assert up_res.json()["status"] == "aggregated"

    # Second download must reflect aggregated Round 1 weights
    model_resp_r1 = client.get(f"/train/{exp_id}/model")
    assert model_resp_r1.status_code == 200
    ckpt1 = torch.load(io.BytesIO(model_resp_r1.content), map_location="cpu", weights_only=False)
    assert ckpt1["round"] == 1
    assert not torch.allclose(head_w0, ckpt1["state_dict"]["head.fc1.weight"])

    # Admin evaluates live MIA report on current global model
    mia_res = client.post(f"/train/{exp_id}/mia/evaluate")
    assert mia_res.status_code == 200
    mia_body = mia_res.json()
    assert mia_body["round"] == 1
    assert mia_body["mia"]["status"] == "measured"
    assert isinstance(mia_body["mia"]["mia_success_rate"], float)
    assert "edge_c1" in mia_body["participating_clients"]

    # Cleanly stop the background remote waiter thread
    client.delete(f"/train/{exp_id}")
