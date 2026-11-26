"""Simulate multiple federated learning clients running locally and uploading model updates.

Each client runs strictly locally on its own private telemetry partition:
1. Logs in via JWT authentication (reads SENTRYFL_ADMIN_PASSWORD / SENTRYFL_CLIENT_PASSWORD env vars or prompts).
2. Discovers the shared federated experiment (`federation_mode="remote"`).
3. Downloads the latest global model artifact (.pt) from the server.
4. Runs local anomaly detection inference (zero raw records sent).
5. Finetunes the model locally on its private CSV partition (`SentryFLClient.train_local`).
6. Uploads only trainable weight deltas (`~1.3 MB`) to the server for FedAvg / DP-FedAvg aggregation.
7. Verifies all three clients complete training and advance the global round to Round 3.
"""

import gc
import getpass
import hashlib
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from sentryfl.client import SentryFLClient

try:
    import httpx as _http
except ImportError:
    import requests as _http


SERVER_URL = os.environ.get("SERVER_URL", "http://localhost").rstrip("/")
if SERVER_URL.endswith("/api"):
    SERVER_URL = SERVER_URL[:-4]
API_URL = f"{SERVER_URL}/api"

CLIENT_IDS = ["client1", "client2", "client3"]


def _get_password(env_var: str, prompt_label: str) -> str:
    val = os.environ.get(env_var)
    if val:
        return val
    return getpass.getpass(f"{prompt_label}: ")


def _login_or_register(username: str, password: str, allow_register: bool = True) -> str:
    r = _http.post(f"{API_URL}/auth/login", json={"username": username, "password": password}, timeout=30)
    if r.status_code == 200:
        return r.json()["token"]
    if allow_register:
        reg = _http.post(
            f"{API_URL}/auth/register",
            json={"username": username, "password": password, "role": "user"},
            timeout=30,
        )
        if reg.status_code == 201:
            return reg.json()["token"]
    raise RuntimeError(f"Authentication failed for {username}: login={r.status_code} {r.text}")


def generate_local_sensor_data(client_id: str, seed: int, num_rows: int = 120) -> Path:
    """Generate realistic private local telemetry CSV on the client machine."""
    rng = np.random.default_rng(seed)
    timestamps = pd.date_range("2026-11-25", periods=num_rows, freq="1min")
    data = {
        "timestamp": timestamps,
        "cpu_usage": np.clip(rng.normal(45, 10, num_rows), 5, 99),
        "memory_usage": np.clip(rng.normal(60, 8, num_rows), 10, 95),
        "network_in": np.clip(rng.exponential(15, num_rows), 0, 100),
        "network_out": np.clip(rng.exponential(20, num_rows), 0, 120),
        "temperature": np.clip(rng.normal(55, 5, num_rows), 30, 85),
    }
    for idx in (25, 65, 105):
        data["cpu_usage"][idx] = 98.5
        data["temperature"][idx] = 82.0

    out_dir = Path("data/simulated")
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / f"{client_id}_private.csv"
    pd.DataFrame(data).to_csv(csv_path, index=False)
    return csv_path


def create_remote_experiment(admin_token: str) -> str:
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "model_type": "lstm",
        "federation_mode": "remote",
        "num_clients": len(CLIENT_IDS),
        "num_rounds": 5,
        "clients_per_round": len(CLIENT_IDS),
        "epsilon": 2.0,
        "delta": 1e-5,
        "noise_multiplier": 0.5,
        "max_grad_norm": 1.0,
        "batch_size": 16,
        "learning_rate": 0.005,
        "local_epochs": 1,
        "dataset": "custom",
        "data_source": "synthetic",
        "experiment_name": f"Multi-Client Collaborative Federation {int(time.time())}",
        "description": "All 3 remote clients download, predict, finetune locally, and upload weights sequentially",
    }
    r = _http.post(f"{API_URL}/experiments", json=payload, headers=headers, timeout=60)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Failed to create experiment: {r.status_code} {r.text}")
    exp_id = r.json()["experiment_id"]
    print(f"[Admin] Created remote federated experiment: {exp_id}")

    for _ in range(90):
        st = _http.get(f"{API_URL}/experiments/{exp_id}/federated-status", headers=headers, timeout=30)
        if st.status_code == 200 and st.json().get("status") == "running":
            print(f"[Admin] Global model initialized and ready (Round {st.json().get('current_round', 0)}).")
            return exp_id
        time.sleep(1.5)
    raise RuntimeError(f"Experiment {exp_id} did not reach running status in time.")


def model_trainable_digest(model_path: Path) -> tuple[int, str]:
    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
    state = ckpt.get("state_dict", ckpt)
    rnd = int(ckpt.get("round", -1))
    h = hashlib.sha256()
    for k in sorted(state.keys()):
        if any(p in k for p in ("ts_projection", "head.fc")) and (k.endswith(".weight") or k.endswith(".bias")):
            h.update(k.encode("utf-8"))
            h.update(state[k].detach().cpu().float().contiguous().numpy().tobytes())
    return rnd, h.hexdigest()[:16]


def run_simulation() -> None:
    print("=" * 68)
    print("SentryFL Collaborative 3-Client Local Training & Upload Simulation")
    print("=" * 68)

    admin_password = _get_password("SENTRYFL_ADMIN_PASSWORD", "Admin password (admin)")
    client_password = _get_password("SENTRYFL_CLIENT_PASSWORD", "Shared client password (client1..3)")

    print("\n[Step 1] Admin login & remote experiment initialization...")
    admin_token = _login_or_register("admin", admin_password, allow_register=False)
    exp_id = create_remote_experiment(admin_token)

    seen_digests = []
    for idx, cid in enumerate(CLIENT_IDS, start=1):
        print(f"\n--- [Client {idx}/{len(CLIENT_IDS)}: {cid}] ---")
        client = SentryFLClient(server_url=SERVER_URL, experiment_id=exp_id, client_id=cid)
        token = _login_or_register(cid, client_password, allow_register=True)
        client.auth_token = token

        csv_path = generate_local_sensor_data(cid, seed=100 + idx)
        print(f"1. Loaded private local dataset: {csv_path}")

        model_path = Path("data/simulated") / f"{cid}_downloaded_round_{idx - 1}.pt"
        client.download_global_model(experiment_id=exp_id, output_path=str(model_path))
        rnd, digest = model_trainable_digest(model_path)
        if seen_digests:
            assert digest != seen_digests[-1], f"Expected updated global model for {cid}, got unchanged digest {digest}"
        seen_digests.append(digest)
        print(f"2. Downloaded global model Round {rnd} (weights digest={digest})")

        pred = client.predict_local(data_path=csv_path, model_path=model_path, window_size=32, batch_size=16)
        print(f"3. Local inference complete: {pred['anomalies_detected']}/{pred['total_windows']} anomalies")

        upd_path, train_metrics = client.train_local(
            data_path=csv_path,
            model_path=model_path,
            epochs=1,
            batch_size=16,
            learning_rate=0.01,
            output_update_path=str(Path("data/simulated") / f"{cid}_update.pt"),
        )
        print(f"4. Local finetuning complete (loss={train_metrics['final_loss']:.4f}) -> {upd_path.name}")

        ack = client.upload_update(upd_path, experiment_id=exp_id, client_id=cid)
        new_round = ack.get("round", ack.get("current_round"))
        print(f"5. Uploaded weight update! Global model aggregated to Round {new_round}.")
        assert int(new_round) == idx, f"Expected Round {idx} after {cid} upload, got {ack}"

        model_path.unlink(missing_ok=True)
        upd_path.unlink(missing_ok=True)
        client.model = None
        gc.collect()

    admin_hdrs = {"Authorization": f"Bearer {admin_token}"}
    final_status = _http.get(f"{API_URL}/experiments/{exp_id}", headers=admin_hdrs, timeout=30).json()
    exp_detail = final_status.get("experiment", final_status)
    print("\n" + "=" * 68)
    print(f"All {len(CLIENT_IDS)} clients completed local finetuning & uploads! Final round = {exp_detail.get('current_round')}")
    print("=" * 68)


if __name__ == "__main__":
    run_simulation()
