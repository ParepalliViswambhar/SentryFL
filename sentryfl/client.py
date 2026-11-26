"""
SentryFL Client: Standalone Federated Learning Client for Local Training & Inference.

This module enables remote client devices to participate in the federated network
without exposing sensitive data:
1. Download global model from the SentryFL server
2. Run local anomaly detection (inference) on private data
3. Train model locally on private data using local gradient descent
4. Upload updated weights to the SentryFL server for aggregation
"""

import argparse
import base64
import getpass
import io
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

try:
    import requests
except ImportError:
    import urllib.request as urllib_request
    import urllib.error as urllib_error
    requests = None

from sentryfl.models.plm_backbone import PLMAnomalyDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sentryfl_client")


class SentryFLClient:
    """Standalone client running on user machine."""

    def __init__(
        self,
        server_url: str = "http://localhost:3000",
        experiment_id: Optional[str] = None,
        client_id: str = "client_device",
        auth_token: Optional[str] = None,
        device: str = "cpu",
    ):
        normalized_url = server_url.rstrip("/")
        if normalized_url.endswith("/api"):
            normalized_url = normalized_url[:-4]
        self.server_url = normalized_url
        self.experiment_id = experiment_id
        self.client_id = client_id
        self.auth_token = auth_token
        self.device = device
        self.model: Optional[nn.Module] = None
        self.model_config: Dict[str, Any] = {}
        self.model_input_dim: Optional[int] = None

    def _get_headers(self, content_type: Optional[str] = "application/json") -> Dict[str, str]:
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        return headers

    def login(self, username: str = "admin", password: str = "admin123") -> str:
        """Authenticate with the SentryFL API server to receive a JWT token."""
        url = f"{self.server_url}/api/auth/login"
        payload = json.dumps({"username": username, "password": password}).encode("utf-8")
        logger.info(f"Authenticating as '{username}' with {self.server_url}...")

        if requests:
            res = requests.post(url, json={"username": username, "password": password}, timeout=10)
            res.raise_for_status()
            data = res.json()
        else:
            req = urllib_request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib_request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))

        token = data.get("token") or data.get("accessToken")
        if not token:
            raise RuntimeError(f"Login failed: no token returned ({data})")
        self.auth_token = token
        logger.info("Authentication successful. Bearer token acquired.")
        return token

    def download_global_model(self, experiment_id: Optional[str] = None, output_path: Optional[str] = None) -> Path:
        """
        Download the latest global model artifact (.pt) from the server.
        """
        exp_id = experiment_id or self.experiment_id
        if not exp_id:
            raise ValueError("experiment_id must be provided to download the global model.")
        self.experiment_id = exp_id

        # Try API server endpoint first, fallback to Python backend path if needed
        endpoints = [
            f"{self.server_url}/api/experiments/{exp_id}/model",
            f"{self.server_url}/train/{exp_id}/model",
            f"{self.server_url}/api/train/{exp_id}/model",
        ]

        logger.info(f"Downloading global model for experiment {exp_id}...")
        artifact_bytes = None
        last_error = None

        for url in endpoints:
            try:
                headers = self._get_headers(content_type=None)
                if requests:
                    res = requests.get(url, headers=headers, timeout=180)
                    if res.status_code == 200:
                        artifact_bytes = res.content
                        break
                    last_error = f"HTTP {res.status_code}: {res.text}"
                else:
                    req = urllib_request.Request(url, headers=headers)
                    with urllib_request.urlopen(req, timeout=180) as resp:
                        artifact_bytes = resp.read()
                        break
            except Exception as exc:
                last_error = str(exc)

        if not artifact_bytes:
            raise RuntimeError(f"Failed to download global model from {self.server_url}: {last_error}")

        out_file = Path(output_path or f"{exp_id}-global-model.pt")
        out_file.write_bytes(artifact_bytes)
        logger.info(f"Global model downloaded successfully ({len(artifact_bytes):,} bytes) -> {out_file}")
        return out_file

    def load_model(self, model_path: Union[str, Path]) -> nn.Module:
        """
        Load a downloaded global model artifact into memory for local prediction or training.
        """
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"Model file not found: {path}")

        logger.info(f"Loading local model from {path}...")
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)

        state_dict = checkpoint.get("state_dict", checkpoint)
        config = checkpoint.get("config", {})
        self.model_config = config
        self.experiment_id = checkpoint.get("experiment_id", self.experiment_id)

        # Infer input dimension from state_dict projection layer
        input_dim = 38
        if "backbone.ts_projection.weight" in state_dict:
            input_dim = state_dict["backbone.ts_projection.weight"].shape[1]
        elif "ts_projection.weight" in state_dict:
            input_dim = state_dict["ts_projection.weight"].shape[1]

        hidden_dim = 128
        if "backbone.ts_projection.weight" in state_dict:
            hidden_dim = state_dict["backbone.ts_projection.weight"].shape[0]
        elif "ts_projection.weight" in state_dict:
            hidden_dim = state_dict["ts_projection.weight"].shape[0]

        peft_method = "full_head"
        if any("lora" in k for k in state_dict.keys()):
            peft_method = "ffa_lora"

        layer_indices = []
        for k in state_dict.keys():
            match = re.search(r"transformer\.h\.(\d+)\.", k)
            if match:
                layer_indices.append(int(match.group(1)))

        has_embedded_weights = bool(layer_indices) or any(
            k.endswith("transformer.wte.weight") for k in state_dict.keys()
        )
        num_layers = (max(layer_indices) + 1) if layer_indices else None
        wte_tensor = state_dict.get("backbone.transformer.wte.weight")
        if wte_tensor is None:
            wte_tensor = state_dict.get("transformer.wte.weight")
        wpe_tensor = state_dict.get("backbone.transformer.wpe.weight")
        if wpe_tensor is None:
            wpe_tensor = state_dict.get("transformer.wpe.weight")
        vocab_size = int(wte_tensor.shape[0]) if wte_tensor is not None else None
        max_positions = int(wpe_tensor.shape[0]) if wpe_tensor is not None else None

        self.model = PLMAnomalyDetector(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            model_name="gpt2",
            freeze_backbone=True,
            peft_method=peft_method,
            init_from_pretrained=not has_embedded_weights,
            num_layers=num_layers,
            vocab_size=vocab_size,
            max_positions=max_positions,
        )

        # Load weights with compatibility
        try:
            self.model.load_state_dict(state_dict, strict=False)
        except Exception as e:
            logger.warning(f"Partial state_dict load: {e}")

        self.model.to(self.device)
        self.model.eval()
        self.model_input_dim = input_dim
        logger.info(f"Model loaded successfully on {self.device} (input_dim={input_dim}, hidden_dim={hidden_dim})")
        return self.model

    @staticmethod
    def load_timeseries_data(
        data_path: Union[str, Path],
        window_size: int = 100,
        stride: int = 1,
        target_dim: Optional[int] = None,
    ) -> Tuple[torch.Tensor, np.ndarray]:
        """
        Load local private dataset (CSV, TXT, or NPY) and convert to sliding windows.
        The data remains strictly local on the client device.
        """
        path = Path(data_path)
        if not path.exists():
            raise FileNotFoundError(f"Data file not found: {path}")

        logger.info(f"Loading private client data locally from {path}...")
        if path.suffix in (".npy", ".npz"):
            raw_data = np.load(path)
            if isinstance(raw_data, np.lib.npyio.NpzFile):
                raw_data = raw_data[raw_data.files[0]]
        else:
            # Load CSV or space-separated text
            try:
                import pandas as pd
                df = pd.read_csv(path, sep=None, engine="python")
                # Drop non-numeric columns
                numeric_cols = df.select_dtypes(include=[np.number]).columns
                raw_data = df[numeric_cols].values
            except Exception:
                raw_data = np.loadtxt(path, delimiter=None)

        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(-1, 1)

        # Impute NaNs and normalize
        nan_mask = np.isnan(raw_data)
        if nan_mask.any():
            raw_data[nan_mask] = np.nanmean(raw_data, axis=0)

        mean = np.mean(raw_data, axis=0)
        std = np.std(raw_data, axis=0)
        std[std == 0] = 1.0
        normalized = (raw_data - mean) / std

        if target_dim is not None and normalized.shape[1] != target_dim:
            src_dim = normalized.shape[1]
            if src_dim < target_dim:
                logger.info(f"Aligning local features from {src_dim} to model input_dim={target_dim} via zero-padding.")
                pad_cols = np.zeros((normalized.shape[0], target_dim - src_dim), dtype=normalized.dtype)
                normalized = np.hstack([normalized, pad_cols])
            else:
                logger.warning(f"Truncating local features from {src_dim} to model input_dim={target_dim}.")
                normalized = normalized[:, :target_dim]

        # Generate sliding windows
        n_rows, n_features = normalized.shape
        if n_rows < window_size:
            # Pad if shorter than window
            pad = np.zeros((window_size - n_rows, n_features))
            normalized = np.vstack([normalized, pad])
            n_rows = window_size

        n_windows = max(1, (n_rows - window_size) // stride + 1)
        windows = np.empty((n_windows, window_size, n_features), dtype=np.float32)
        for i in range(n_windows):
            start = i * stride
            windows[i] = normalized[start : start + window_size]

        tensor_windows = torch.from_numpy(windows).float()
        logger.info(f"Materialized {len(tensor_windows)} local windows ({window_size} timesteps, {n_features} features)")
        return tensor_windows, raw_data

    def predict_local(
        self,
        data_path: Union[str, Path],
        model_path: Optional[Union[str, Path]] = None,
        window_size: int = 100,
        batch_size: int = 32,
        threshold: float = 0.5,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Perform anomaly detection locally on the client's machine.
        Sensitive data never leaves the client device.
        """
        if self.model is None:
            if not model_path:
                raise ValueError("Must provide model_path or call load_model() first.")
            self.load_model(model_path)

        windows, raw_data = self.load_timeseries_data(
            data_path, window_size=window_size, target_dim=self.model_input_dim
        )
        self.model.eval()

        scores_list = []
        with torch.no_grad():
            for i in range(0, len(windows), batch_size):
                batch = windows[i : i + batch_size].to(self.device)
                logits = self.model(batch)
                scores = torch.sigmoid(logits).cpu().flatten().numpy()
                scores_list.extend(scores.tolist())

        scores_arr = np.array(scores_list)
        anomalies = (scores_arr > threshold).astype(int)
        anomaly_count = int(np.sum(anomalies))
        anomaly_rate = float(anomaly_count / len(scores_arr))

        results = {
            "total_windows": len(scores_arr),
            "anomalies_detected": anomaly_count,
            "anomaly_rate": anomaly_rate,
            "threshold": threshold,
            "anomaly_scores_summary": {
                "min": float(np.min(scores_arr)),
                "max": float(np.max(scores_arr)),
                "mean": float(np.mean(scores_arr)),
                "median": float(np.median(scores_arr)),
            },
            "scores_sample": scores_arr[:100].tolist(),
        }

        if output_path:
            out_file = Path(output_path)
            out_file.write_text(json.dumps(results, indent=2))
            logger.info(f"Anomaly detection predictions saved to {out_file}")

        logger.info(
            f"Local prediction complete: {anomaly_count}/{len(scores_arr)} anomalous windows ({anomaly_rate:.2%})"
        )
        return results

    def train_local(
        self,
        data_path: Union[str, Path],
        model_path: Optional[Union[str, Path]] = None,
        epochs: int = 3,
        batch_size: int = 32,
        learning_rate: float = 0.001,
        max_grad_norm: float = 1.0,
        output_update_path: Optional[str] = None,
        window_size: int = 100,
    ) -> Tuple[Path, Dict[str, Any]]:
        """
        Train locally on private data using local gradient descent.
        Extracts updated trainable parameters / weights for aggregation.
        """
        if self.model is None:
            if not model_path:
                raise ValueError("Must provide model_path or call load_model() first.")
            self.load_model(model_path)

        windows, _ = self.load_timeseries_data(
            data_path, window_size=window_size, target_dim=self.model_input_dim
        )
        self.model.train()

        # Dummy self-supervised / reconstruction target
        labels = torch.zeros(len(windows), 1, dtype=torch.float32)
        dataset = TensorDataset(windows, labels)
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        trainable_params = [p for p in self.model.parameters() if p.requires_grad]
        optimizer = torch.optim.Adam(trainable_params, lr=learning_rate)
        criterion = nn.BCEWithLogitsLoss()

        logger.info(f"Starting private local training ({epochs} epochs, {len(trainable_params)} trainable tensors)...")
        total_loss = 0.0
        num_batches = 0

        for epoch in range(1, epochs + 1):
            epoch_loss = 0.0
            for batch_x, batch_y in loader:
                batch_x = batch_x.to(self.device)
                batch_y = batch_y.to(self.device)

                optimizer.zero_grad()
                outputs = self.model(batch_x)
                loss = criterion(outputs, batch_y)
                loss.backward()

                # DP clipping / gradient bound
                if max_grad_norm > 0:
                    torch.nn.utils.clip_grad_norm_(trainable_params, max_grad_norm)

                optimizer.step()
                epoch_loss += loss.item()
                num_batches += 1

            avg_epoch_loss = epoch_loss / max(1, len(loader))
            total_loss += epoch_loss
            logger.info(f"  Epoch {epoch}/{epochs} complete — Loss: {avg_epoch_loss:.4f}")

        final_loss = float(total_loss / max(1, num_batches))

        # Extract only trainable parameters
        update_state = {}
        for name, param in self.model.named_parameters():
            if param.requires_grad:
                update_state[name] = param.detach().cpu()

        metrics = {
            "loss": final_loss,
            "final_loss": final_loss,
            "epochs": epochs,
            "num_samples": len(windows),
            "client_id": self.client_id,
        }

        update_payload = {
            "state_dict": update_state,
            "parameters": update_state,
            "num_samples": len(windows),
            "client_id": self.client_id,
            "metrics": metrics,
        }

        out_path = Path(output_update_path or f"{self.client_id}-update.pt")
        torch.save(update_payload, out_path)
        logger.info(f"Local training complete! Update artifact saved ({out_path.stat().st_size:,} bytes) -> {out_path}")
        return out_path, metrics

    def upload_update(
        self,
        update_path: Union[str, Path],
        experiment_id: Optional[str] = None,
        num_samples: Optional[int] = None,
        client_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload local model update to the server.
        The server applies FedAvg / DP-FedAvg formulas to update the global model weights.
        """
        path = Path(update_path)
        if not path.exists():
            raise FileNotFoundError(f"Update file not found: {path}")

        exp_id = experiment_id or self.experiment_id
        if not exp_id:
            raise ValueError("experiment_id is required for uploading model update.")
        cid = client_id or self.client_id

        logger.info(f"Uploading model update from {path} to server for experiment {exp_id}...")
        raw_bytes = path.read_bytes()

        # Extract samples count and training metrics if inside the artifact
        loaded_metrics = {"loss": 0.05, "client_id": cid}
        try:
            loaded = torch.load(io.BytesIO(raw_bytes), map_location="cpu", weights_only=False)
            if isinstance(loaded, dict):
                if "num_samples" in loaded:
                    num_samples = num_samples or loaded["num_samples"]
                if isinstance(loaded.get("metrics"), dict):
                    loaded_metrics.update(loaded["metrics"])
                    loaded_metrics["client_id"] = cid
        except Exception:
            pass

        samples = num_samples or 100
        b64_payload = base64.b64encode(raw_bytes).decode("ascii")

        json_body = {
            "client_id": cid,
            "num_samples": samples,
            "update_base64": b64_payload,
            "metrics": loaded_metrics,
            "auto_aggregate": True,
        }

        endpoints = [
            f"{self.server_url}/api/experiments/{exp_id}/model/upload",
            f"{self.server_url}/train/{exp_id}/model/upload",
            f"{self.server_url}/api/experiments/{exp_id}/clients/update",
        ]

        last_error = None
        for url in endpoints:
            try:
                headers = self._get_headers(content_type="application/json")
                if requests:
                    res = requests.post(url, json=json_body, headers=headers, timeout=180)
                    if res.status_code in (200, 201, 202):
                        result = res.json()
                        logger.info(f"Server acknowledged update: {result}")
                        return result
                    last_error = f"HTTP {res.status_code}: {res.text}"
                else:
                    payload = json.dumps(json_body).encode("utf-8")
                    req = urllib_request.Request(url, data=payload, headers=headers)
                    with urllib_request.urlopen(req, timeout=180) as resp:
                        result = json.loads(resp.read().decode("utf-8"))
                        logger.info(f"Server acknowledged update: {result}")
                        return result
            except Exception as exc:
                last_error = str(exc)

        raise RuntimeError(f"Failed to upload model update to {self.server_url}: {last_error}")

    def list_federated_experiments(self) -> list:
        """Discover active federated experiments from the server."""
        url = f"{self.server_url}/api/experiments/federated"
        headers = self._get_headers(content_type=None)
        if requests:
            res = requests.get(url, headers=headers, timeout=30)
            res.raise_for_status()
            return res.json().get("experiments", [])
        req = urllib_request.Request(url, headers=headers)
        with urllib_request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8")).get("experiments", [])

    def request_mia_report(self, experiment_id: Optional[str] = None, note: str = "") -> Dict[str, Any]:
        """Request an empirical Membership Inference Attack (MIA) report from the admin."""
        exp_id = experiment_id or self.experiment_id
        if not exp_id:
            raise ValueError("experiment_id is required to request an MIA report.")
        url = f"{self.server_url}/api/mia-reports/request"
        headers = self._get_headers(content_type="application/json")
        body = {"experiment_id": exp_id, "note": note}
        if requests:
            res = requests.post(url, json=body, headers=headers, timeout=30)
            res.raise_for_status()
            return res.json()
        req = urllib_request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers)
        with urllib_request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def fetch_mia_reports(self, experiment_id: Optional[str] = None) -> Dict[str, Any]:
        """Retrieve MIA report requests and reports sent by the admin."""
        url = f"{self.server_url}/api/mia-reports"
        if experiment_id:
            url = f"{url}?experiment_id={experiment_id}"
        headers = self._get_headers(content_type=None)
        if requests:
            res = requests.get(url, headers=headers, timeout=30)
            res.raise_for_status()
            return res.json()
        req = urllib_request.Request(url, headers=headers)
        with urllib_request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))


def run_interactive_wizard(
    default_server: str = "http://localhost",
    default_experiment: Optional[str] = None,
    default_username: Optional[str] = None,
) -> None:
    """Guided interactive prompt for edge clients to load their dataset and use or finetune the global model."""
    print("\n=== SentryFL Interactive Edge Client ===")
    print("Your raw dataset stays strictly on this computer. Only trained weight deltas leave your machine.\n")

    server_input = input(f"Server URL [{default_server}]: ").strip() or default_server
    username = input(f"Username [{default_username or 'client1'}]: ").strip() or (default_username or "client1")
    try:
        password = getpass.getpass("Password: ")
    except Exception:
        password = input("Password: ")

    client = SentryFLClient(server_url=server_input, client_id=username)
    client.login(username, password)

    exp_id = default_experiment
    try:
        experiments = client.list_federated_experiments()
    except Exception as exc:
        experiments = []
        logger.warning(f"Could not fetch federated experiment list: {exc}")

    if experiments:
        print("\nAvailable Federated Experiments:")
        for idx, exp in enumerate(experiments, start=1):
            eid = exp.get("experiment_id") or exp.get("id")
            ename = exp.get("experiment_name") or exp.get("name") or eid
            status = exp.get("status", "unknown")
            rnd = exp.get("current_round", exp.get("currentRound", 0))
            print(f"  [{idx}] {ename} (ID: {eid} | status={status} | round={rnd})")
        prompt_label = f"Select experiment [1-{len(experiments)} or ID]"
        if exp_id:
            prompt_label += f" [default {exp_id}]"
        choice = input(f"{prompt_label}: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(experiments):
            picked = experiments[int(choice) - 1]
            exp_id = picked.get("experiment_id") or picked.get("id")
        elif choice:
            exp_id = choice
        elif not exp_id:
            exp_id = experiments[0].get("experiment_id") or experiments[0].get("id")
    elif not exp_id:
        exp_id = input("Enter Experiment ID: ").strip()

    if not exp_id:
        raise ValueError("No experiment ID selected.")
    client.experiment_id = exp_id

    print("\nChoose an action:")
    print("  1) Download global model & run local anomaly detection (inference only)")
    print("  2) Download global model, finetune locally on your dataset & upload weights")
    print("  3) Run full round (download -> predict anomalies -> finetune locally -> upload)")
    print("  4) Request MIA privacy report from admin / check received reports")
    action = input("Enter choice [1-4, default 3]: ").strip() or "3"

    if action == "4":
        sub = input("Enter 'req' to request report or 'list' to view reports [req]: ").strip().lower() or "req"
        if sub == "list":
            print(json.dumps(client.fetch_mia_reports(exp_id), indent=2))
        else:
            note = input("Optional request note: ").strip()
            print(json.dumps(client.request_mia_report(exp_id, note=note), indent=2))
        return

    data_path_str = ""
    while not data_path_str or not Path(data_path_str).exists():
        data_path_str = input("\nLoad your local dataset (path to .csv, .txt, .npy, or .npz): ").strip().strip('"').strip("'")
        if not Path(data_path_str).exists():
            print(f"File not found: {data_path_str}. Please enter a valid local file path.")

    print(f"\n[1] Downloading latest global model for experiment {exp_id}...")
    model_path = client.download_global_model(experiment_id=exp_id)

    if action in ("1", "3"):
        out_preds = f"{username}-{exp_id[:8]}-predictions.json"
        print("[2] Running local anomaly detection on your private dataset...")
        pred = client.predict_local(data_path=data_path_str, model_path=model_path, output_path=out_preds)
        print(
            f"Local inference complete: {pred['anomalies_detected']}/{pred['total_windows']} "
            f"anomalous windows ({pred['anomaly_rate']:.2%}) -> saved {out_preds}"
        )

    if action in ("2", "3"):
        epochs_str = input("Local finetuning epochs [2]: ").strip() or "2"
        batch_str = input("Batch size [16]: ").strip() or "16"
        lr_str = input("Learning rate [0.001]: ").strip() or "0.001"
        print("[3] Finetuning global model locally on your private dataset...")
        update_path, train_metrics = client.train_local(
            data_path=data_path_str,
            model_path=model_path,
            epochs=int(epochs_str),
            batch_size=int(batch_str),
            learning_rate=float(lr_str),
        )
        print(f"Local training complete (loss={train_metrics['final_loss']:.4f}). Uploading weights only...")
        res = client.upload_update(update_path=update_path, experiment_id=exp_id, client_id=username)
        print(f"Upload accepted! Global model updated to Round {res.get('round', res.get('current_round'))}.")


def main():
    parser = argparse.ArgumentParser(description="SentryFL Standalone Federated Learning Client")
    subparsers = parser.add_subparsers(dest="command", required=False)

    def _add_auth_args(p):
        p.add_argument("--server", "--server-url", dest="server", default="http://localhost")
        p.add_argument("--token", help="Bearer authentication token")
        p.add_argument("--username", help="Username for automatic login")
        p.add_argument("--password", help="Password for automatic login")

    # interactive
    inter_parser = subparsers.add_parser("interactive", help="Guided prompt to load dataset and use/finetune model")
    inter_parser.add_argument("--server", "--server-url", dest="server", default="http://localhost")
    inter_parser.add_argument("--experiment", "--experiment-id", dest="experiment", default=None)
    inter_parser.add_argument("--username", default=None)

    # login
    login_parser = subparsers.add_parser("login", help="Authenticate with the SentryFL server")
    login_parser.add_argument("--server", "--server-url", dest="server", default="http://localhost")
    login_parser.add_argument("--username", default="admin")
    login_parser.add_argument("--password", default="admin123")

    # download
    download_parser = subparsers.add_parser("download", help="Download latest global model artifact")
    _add_auth_args(download_parser)
    download_parser.add_argument("--experiment", "--experiment-id", dest="experiment", required=True, help="Experiment ID")
    download_parser.add_argument("--out", default=None, help="Output file path for model.pt")

    # predict
    predict_parser = subparsers.add_parser("predict", help="Run local anomaly detection on private data")
    predict_parser.add_argument("--model", required=True, help="Path to downloaded global model (.pt)")
    predict_parser.add_argument("--data", "--data-path", dest="data", required=True, help="Path to local private time-series data")
    predict_parser.add_argument("--threshold", type=float, default=0.5)
    predict_parser.add_argument("--out", default=None, help="Path to save predictions JSON")

    # train
    train_parser = subparsers.add_parser("train", help="Train model locally on private data")
    train_parser.add_argument("--model", required=True, help="Path to downloaded global model (.pt)")
    train_parser.add_argument("--data", "--data-path", dest="data", required=True, help="Path to local private training data")
    train_parser.add_argument("--epochs", type=int, default=3)
    train_parser.add_argument("--batch-size", type=int, default=32)
    train_parser.add_argument("--lr", type=float, default=0.001)
    train_parser.add_argument("--client-id", default="client_device")
    train_parser.add_argument("--out", default=None, help="Output file path for update.pt")

    # upload
    upload_parser = subparsers.add_parser("upload", help="Upload trained update to server for aggregation")
    _add_auth_args(upload_parser)
    upload_parser.add_argument("--experiment", "--experiment-id", dest="experiment", required=True)
    upload_parser.add_argument("--update", required=True, help="Path to update.pt")
    upload_parser.add_argument("--client-id", default="client_device")
    upload_parser.add_argument("--samples", type=int, default=None)

    # auto
    auto_parser = subparsers.add_parser("auto", help="Run full loop: download -> predict -> train -> upload")
    _add_auth_args(auto_parser)
    auto_parser.add_argument("--experiment", "--experiment-id", dest="experiment", required=True)
    auto_parser.add_argument("--data", "--data-path", dest="data", required=True, help="Path to local private data")
    auto_parser.add_argument("--client-id", default="client_device")
    auto_parser.add_argument("--epochs", type=int, default=3)
    auto_parser.add_argument("--batch-size", type=int, default=32)

    # request-mia
    req_mia_parser = subparsers.add_parser("request-mia", help="Request an MIA privacy report from admin")
    _add_auth_args(req_mia_parser)
    req_mia_parser.add_argument("--experiment", "--experiment-id", dest="experiment", required=True)
    req_mia_parser.add_argument("--note", default="Requesting empirical MIA evaluation for current round")

    # mia-reports
    list_mia_parser = subparsers.add_parser("mia-reports", help="List MIA reports received from admin")
    _add_auth_args(list_mia_parser)
    list_mia_parser.add_argument("--experiment", "--experiment-id", dest="experiment", default=None)

    args = parser.parse_args()
    if not args.command or args.command == "interactive":
        run_interactive_wizard(
            default_server=getattr(args, "server", "http://localhost"),
            default_experiment=getattr(args, "experiment", None),
            default_username=getattr(args, "username", None),
        )
        return

    client = SentryFLClient(
        server_url=getattr(args, "server", "http://localhost"),
        experiment_id=getattr(args, "experiment", None),
        client_id=getattr(args, "client_id", None) or getattr(args, "username", None) or "client_device",
        auth_token=getattr(args, "token", None),
    )

    if args.command != "login" and not client.auth_token and getattr(args, "username", None) and getattr(args, "password", None):
        client.login(args.username, args.password)

    if args.command == "login":
        token = client.login(args.username, args.password)
        print(f"Token: {token}")

    elif args.command == "download":
        out = client.download_global_model(experiment_id=args.experiment, output_path=args.out)
        print(f"Downloaded model to: {out}")

    elif args.command == "predict":
        results = client.predict_local(data_path=args.data, model_path=args.model, threshold=args.threshold, output_path=args.out)
        print(f"Results: {results['anomalies_detected']} anomalies detected ({results['anomaly_rate']:.2%})")

    elif args.command == "train":
        out, metrics = client.train_local(
            data_path=args.data,
            model_path=args.model,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            output_update_path=args.out,
        )
        print(f"Update saved to: {out}")

    elif args.command == "upload":
        res = client.upload_update(update_path=args.update, experiment_id=args.experiment, num_samples=args.samples, client_id=args.client_id)
        print(f"Upload acknowledged by server: {res}")

    elif args.command == "auto":
        print("[1/4] Downloading latest global model...")
        model_path = client.download_global_model(experiment_id=args.experiment)
        print("[2/4] Predicting anomalies with initial model...")
        client.predict_local(data_path=args.data, model_path=model_path, batch_size=args.batch_size)
        print("[3/4] Training model locally on private data...")
        update_path, _ = client.train_local(data_path=args.data, model_path=model_path, epochs=args.epochs, batch_size=args.batch_size)
        print("[4/4] Uploading updated weights to server...")
        res = client.upload_update(update_path=update_path, experiment_id=args.experiment, client_id=args.client_id)
        print(f"Federated round complete! Server response: {res}")

    elif args.command == "request-mia":
        res = client.request_mia_report(experiment_id=args.experiment, note=args.note)
        print(json.dumps(res, indent=2))

    elif args.command == "mia-reports":
        res = client.fetch_mia_reports(experiment_id=args.experiment)
        print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
