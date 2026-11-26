/**
 * Standalone interactive Python client generator for external edge devices.
 *
 * Served via GET /api/experiments/:id/client-script so any client logging into
 * the dashboard can download ready-to-run code that prompts them to load their
 * private dataset, run local inference, finetune locally, and upload weights.
 */

function pyStringLiteral(value) {
  return JSON.stringify(String(value ?? ''));
}

function buildClientScript({ experimentId, experimentName = '', serverUrl = 'http://localhost' }) {
  const safeUrl = pyStringLiteral(serverUrl);
  const safeExpId = pyStringLiteral(experimentId);
  const safeName = pyStringLiteral(experimentName || experimentId);

  const safeDocName = String(experimentName || experimentId)
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/[\r\n]+/g, ' ');

  return `#!/usr/bin/env python3
"""
SentryFL Interactive Edge Client
Experiment: ${safeDocName} (${experimentId})

Run this script on your own computer:
    python sentryfl_client_${String(experimentId).slice(0, 8)}.py

It will ask you to log in, load your local dataset (.csv / .txt / .npy / .npz),
and either:
  1) Use the global model locally for anomaly detection (inference only)
  2) Finetune the global model locally on your private dataset and upload ONLY weight updates
  3) Run both inference + local finetuning + upload
  4) Request or view Membership Inference Attack (MIA) privacy reports from the admin

Zero raw records or sensitive data ever leave your machine.
Requirements: pip install torch transformers numpy pandas
"""

import argparse
import base64
import getpass
import io
import json
import math
import re
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

DEFAULT_SERVER_URL = ${safeUrl}
DEFAULT_EXPERIMENT_ID = ${safeExpId}
DEFAULT_EXPERIMENT_NAME = ${safeName}


def _http_json(method, url, token=None, body=None, timeout=180):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} from {url}: {detail}") from err


def _http_bytes(url, token=None, timeout=180):
    headers = {"Accept": "application/octet-stream"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} from {url}: {detail}") from err


class StandalonePositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=512, dropout=0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term[: pe[:, 1::2].shape[1]])
        self.register_buffer("pe", pe)

    def forward(self, x):
        return self.dropout(x + self.pe[: x.size(1), :].unsqueeze(0))


class StandaloneBackbone(nn.Module):
    def __init__(self, input_dim, hidden_dim, num_layers, vocab_size, max_positions, freeze_backbone=True):
        super().__init__()
        from transformers import GPT2Config, GPT2Model

        n_head = 12 if hidden_dim == 768 else (4 if hidden_dim % 4 == 0 else (2 if hidden_dim % 2 == 0 else 1))
        cfg = GPT2Config(
            vocab_size=vocab_size or 50257,
            n_positions=max_positions or 1024,
            n_embd=hidden_dim,
            n_layer=num_layers or 2,
            n_head=n_head,
        )
        self.transformer = GPT2Model(cfg)
        if freeze_backbone:
            for p in self.transformer.parameters():
                p.requires_grad = False
        self.ts_projection = nn.Linear(input_dim, hidden_dim)
        self.positional_encoding = StandalonePositionalEncoding(hidden_dim)

    def forward(self, x):
        hidden = self.ts_projection(x)
        out = self.transformer(inputs_embeds=hidden)
        return out.last_hidden_state.mean(dim=1)


class StandaloneHead(nn.Module):
    def __init__(self, hidden_dim, dropout=0.1):
        super().__init__()
        self.fc1 = nn.Linear(hidden_dim, hidden_dim // 2)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden_dim // 2, 1)

    def forward(self, x):
        return self.fc2(self.dropout(self.relu(self.fc1(x))))


class StandaloneDetector(nn.Module):
    def __init__(self, input_dim, hidden_dim, num_layers, vocab_size, max_positions):
        super().__init__()
        self.backbone = StandaloneBackbone(input_dim, hidden_dim, num_layers, vocab_size, max_positions)
        self.head = StandaloneHead(hidden_dim)

    def forward(self, x):
        return self.head(self.backbone(x))


def load_global_model(model_path):
    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
    state_dict = ckpt.get("state_dict", ckpt)
    proj = state_dict.get("backbone.ts_projection.weight")
    if proj is None:
        proj = state_dict.get("ts_projection.weight")
    input_dim = int(proj.shape[1]) if proj is not None else 38
    hidden_dim = int(proj.shape[0]) if proj is not None else 768

    layer_indices = []
    for k in state_dict.keys():
        m = re.search(r"transformer\\.h\\.(\\d+)\\.", k)
        if m:
            layer_indices.append(int(m.group(1)))
    num_layers = (max(layer_indices) + 1) if layer_indices else 2
    wte = state_dict.get("backbone.transformer.wte.weight")
    if wte is None:
        wte = state_dict.get("transformer.wte.weight")
    wpe = state_dict.get("backbone.transformer.wpe.weight")
    if wpe is None:
        wpe = state_dict.get("transformer.wpe.weight")
    vocab_size = int(wte.shape[0]) if wte is not None else 50257
    max_positions = int(wpe.shape[0]) if wpe is not None else 1024

    model = StandaloneDetector(input_dim, hidden_dim, num_layers, vocab_size, max_positions)
    model.load_state_dict(state_dict, strict=False)
    return model, input_dim, ckpt.get("round", 0)


def load_local_dataset(data_path, target_dim, window_size=100, stride=1):
    path = Path(data_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")
    if path.suffix in (".npy", ".npz"):
        raw = np.load(path)
        if isinstance(raw, np.lib.npyio.NpzFile):
            raw = raw[raw.files[0]]
    else:
        try:
            import pandas as pd
            df = pd.read_csv(path, sep=None, engine="python")
            num_cols = df.select_dtypes(include=[np.number]).columns
            raw = df[num_cols].values
        except Exception:
            raw = np.loadtxt(path, delimiter=",")

    if raw.ndim == 1:
        raw = raw.reshape(-1, 1)
    raw = raw.astype(np.float32)
    if np.isnan(raw).any():
        col_means = np.nanmean(raw, axis=0)
        col_means = np.where(np.isnan(col_means), 0.0, col_means)
        inds = np.where(np.isnan(raw))
        raw[inds] = np.take(col_means, inds[1])

    mean = np.mean(raw, axis=0)
    std = np.std(raw, axis=0)
    std[std == 0] = 1.0
    norm = (raw - mean) / std

    if norm.shape[1] < target_dim:
        norm = np.hstack([norm, np.zeros((norm.shape[0], target_dim - norm.shape[1]), dtype=np.float32)])
    elif norm.shape[1] > target_dim:
        norm = norm[:, :target_dim]

    if len(norm) < window_size:
        norm = np.vstack([norm, np.zeros((window_size - len(norm), target_dim), dtype=np.float32)])

    n_windows = max(1, (len(norm) - window_size) // stride + 1)
    windows = np.empty((n_windows, window_size, target_dim), dtype=np.float32)
    for i in range(n_windows):
        windows[i] = norm[i * stride : i * stride + window_size]
    return torch.from_numpy(windows), raw.shape


def run_local_inference(model, windows, batch_size=32, threshold=0.5, output_path=None):
    model.eval()
    scores = []
    with torch.no_grad():
        for i in range(0, len(windows), batch_size):
            logits = model(windows[i : i + batch_size])
            scores.extend(torch.sigmoid(logits).cpu().flatten().tolist())
    arr = np.asarray(scores, dtype=np.float32)
    anomalies = int(np.sum(arr > threshold))
    summary = {
        "total_windows": len(arr),
        "anomalies_detected": anomalies,
        "anomaly_rate": float(anomalies / max(1, len(arr))),
        "threshold": threshold,
        "mean_score": float(np.mean(arr)),
        "max_score": float(np.max(arr)),
    }
    if output_path:
        Path(output_path).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def run_local_finetune(model, windows, client_id, epochs=2, batch_size=16, lr=0.001, out_path=None):
    model.train()
    labels = torch.zeros(len(windows), 1, dtype=torch.float32)
    loader = DataLoader(TensorDataset(windows, labels), batch_size=batch_size, shuffle=True)
    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.Adam(trainable, lr=lr)
    criterion = nn.BCEWithLogitsLoss()

    total_loss = 0.0
    batches = 0
    for epoch in range(1, epochs + 1):
        ep_loss = 0.0
        for bx, by in loader:
            optimizer.zero_grad()
            loss = criterion(model(bx), by)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            optimizer.step()
            ep_loss += loss.item()
            batches += 1
        total_loss += ep_loss
        print(f"  Epoch {epoch}/{epochs} complete - Loss: {ep_loss / max(1, len(loader)):.4f}")

    final_loss = float(total_loss / max(1, batches))
    update_state = {n: p.detach().cpu() for n, p in model.named_parameters() if p.requires_grad}
    metrics = {"loss": final_loss, "final_loss": final_loss, "epochs": epochs, "num_samples": len(windows), "client_id": client_id}
    payload = {"state_dict": update_state, "parameters": update_state, "num_samples": len(windows), "client_id": client_id, "metrics": metrics}
    out = Path(out_path or f"{client_id}-update.pt")
    torch.save(payload, out)
    return out, metrics


def main():
    parser = argparse.ArgumentParser(description="SentryFL Interactive Client")
    parser.add_argument("--server", default=None)
    parser.add_argument("--experiment", default=None)
    parser.add_argument("--username", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--data", default=None)
    parser.add_argument("--mode", choices=["predict", "finetune", "auto", "mia"], default=None)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=0.001)
    args = parser.parse_args()

    print("=== SentryFL Interactive Edge Client ===")
    print(f"Target Experiment: {DEFAULT_EXPERIMENT_NAME} ({DEFAULT_EXPERIMENT_ID})")
    print("Your raw data remains strictly on your local computer.\\n")

    server_url = (args.server or input(f"Server URL [{DEFAULT_SERVER_URL}]: ").strip() or DEFAULT_SERVER_URL).rstrip("/")
    if server_url.endswith("/api"):
        server_url = server_url[:-4]
    exp_id = args.experiment or input(f"Experiment ID [{DEFAULT_EXPERIMENT_ID}]: ").strip() or DEFAULT_EXPERIMENT_ID
    username = args.username or input("Username [client1]: ").strip() or "client1"
    password = args.password or getpass.getpass("Password: ")

    auth = _http_json("POST", f"{server_url}/api/auth/login", body={"username": username, "password": password})
    token = auth.get("token") or auth.get("accessToken")
    print(f"Authenticated as {username}.")

    mode = args.mode
    if not mode:
        print("\\nChoose what you want to do:")
        print("  1) Download global model & run local anomaly detection (inference only)")
        print("  2) Download global model, finetune locally on your dataset & upload weights")
        print("  3) Run full round (predict locally -> finetune locally -> upload weights)")
        print("  4) Request or view MIA privacy audit report from admin")
        pick = input("Choice [1-4, default 3]: ").strip() or "3"
        mode = {"1": "predict", "2": "finetune", "3": "auto", "4": "mia"}.get(pick, "auto")

    if mode == "mia":
        sub = input("Enter 'req' to request report or 'list' to view reports [req]: ").strip().lower() or "req"
        if sub == "list":
            print(json.dumps(_http_json("GET", f"{server_url}/api/mia-reports?experiment_id={exp_id}", token=token), indent=2))
        else:
            note = input("Optional note for admin: ").strip()
            print(json.dumps(_http_json("POST", f"{server_url}/api/mia-reports/request", token=token, body={"experiment_id": exp_id, "note": note}), indent=2))
        return

    data_path = args.data
    while not data_path or not Path(data_path).exists():
        data_path = input("\\nLoad your local dataset (path to .csv, .txt, .npy, or .npz): ").strip().strip('"').strip("'")
        if not Path(data_path).exists():
            print(f"File not found: {data_path}")

    print(f"\\n[1] Downloading latest global model from {server_url}...")
    model_bytes = _http_bytes(f"{server_url}/api/experiments/{exp_id}/model", token=token)
    model_file = Path(f"{exp_id[:8]}-global-model.pt")
    model_file.write_bytes(model_bytes)
    model, input_dim, current_round = load_global_model(model_file)
    print(f"Loaded global model Round {current_round} ({len(model_bytes):,} bytes, input_dim={input_dim}).")

    windows, raw_shape = load_local_dataset(data_path, target_dim=input_dim)
    print(f"Loaded local dataset {raw_shape[0]} rows x {raw_shape[1]} features -> {len(windows)} local windows.")

    if mode in ("predict", "auto"):
        pred_out = f"{username}-{exp_id[:8]}-predictions.json"
        pred = run_local_inference(model, windows, batch_size=args.batch_size, output_path=pred_out)
        print(f"[Predict] {pred['anomalies_detected']}/{pred['total_windows']} anomalous windows ({pred['anomaly_rate']:.2%}) -> {pred_out}")

    if mode in ("finetune", "auto"):
        print(f"[Finetune] Training locally for {args.epochs} epochs...")
        upd_file, metrics = run_local_finetune(model, windows, username, epochs=args.epochs, batch_size=args.batch_size, lr=args.lr)
        b64 = base64.b64encode(upd_file.read_bytes()).decode("ascii")
        resp = _http_json(
            "POST",
            f"{server_url}/api/experiments/{exp_id}/model/upload",
            token=token,
            body={
                "client_id": username,
                "num_samples": metrics["num_samples"],
                "update_base64": b64,
                "metrics": metrics,
                "auto_aggregate": True,
            },
        )
        print(f"[Upload] Accepted! Server aggregated update -> Round {resp.get('round', resp.get('current_round'))} (status={resp.get('status')}).")


if __name__ == "__main__":
    main()
`;
}

module.exports = { buildClientScript };
