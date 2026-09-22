# SentryFL: Differentially Private Federated Learning for Time-Series Anomaly Detection

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0%2B-red.svg)](https://pytorch.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

SentryFL is a three-tier differentially private, communication-efficient federated learning framework designed for time-series anomaly detection in distributed security sensing environments. The system addresses critical research gaps by providing formal privacy guarantees through Differential Privacy (DP-SGD), empirical privacy evaluation via Membership Inference Attacks (MIA), INT8 quantization for edge deployment, and communication efficiency scaling across 5-500 clients.

## 🎯 Key Features

### Core Capabilities
- **Formal Privacy Guarantees**: DP-SGD with rigorous privacy accounting (ε, δ tracking)
- **Empirical Privacy Evaluation**: Membership Inference Attack framework to measure actual privacy leakage
- **Communication Efficiency**: ~97% *measured* upload reduction via FFA-LoRA adapters (v2); ADMS retained as a baseline (see [SentryFL v2](#-sentryfl-v2--efficient-private-adaptation))
- **Edge Deployment**: INT8 post-training quantization for CPU-only devices
- **Byzantine Robustness**: Optional trimmed mean aggregation for malicious client detection
- **Production Ready**: Checkpointing, error recovery, comprehensive logging

### Dataset Support
- **SMD (Server Machine Dataset)**: Multivariate server telemetry time-series
- **NSL-KDD**: Network intrusion detection with labeled attacks

### System Architecture
SentryFL is architected as a three-tier system:
1. **Tier 1**: React Web Dashboard (visualization and experiment control, including live privacy-budget and membership-inference charts)
2. **Tier 2**: Node.js + Express API Server (REST and WebSocket endpoints, JWT auth, MongoDB persistence for users and audit logs)
3. **Tier 3**: Python Backend (ML training, federated learning, privacy mechanisms)

## 🔬 SentryFL v2 — Efficient-Private Adaptation

A research upgrade over the original PeFAD extension that fixes verified gaps in the
privacy, efficiency, and evaluation of the framework. Spec:
`.kiro/specs/sentryfl-efficient-private/` (PRD + design + tasks).

**One-line thesis:** replace record-level Opacus DP-SGD and ADMS gradient-masking
with **FFA-LoRA adapters trained under aggregate-level DP-FedAvg + a PRV accountant**,
validated by honest, measured evaluation.

| Area | v1 (original) | v2 (this upgrade) |
|------|---------------|-------------------|
| **Privacy mechanism** | Record-level client DP-SGD (Opacus), no server noise | **Aggregate-level DP-FedAvg**: clip each client update delta + one server-side Gaussian draw per round |
| **Privacy unit** | Per-sample (record) | **Entity/silo-level** (the meaningful FL unit) |
| **Accounting** | RDP (+ a sizing/spending mismatch) | **PRV** accountant, pinned for both sizing and spending; single cumulative federation ε |
| **Parameter efficiency** | ADMS mask (zeroes gradients → **no real wire savings**) | **FFA-LoRA** (freeze A, train B): exact aggregation, DP-noise-unbiased, **97% measured** byte reduction |
| **Evaluation threshold** | Fit on **test labels** (leakage) | Held-out / leakage-free **unsupervised** default; `threshold_source` provenance |
| **Metrics** | Point-wise P/R/F1, ROC/PR-AUC | **+ point-adjusted F1, PA%K, affiliation** precision/recall |
| **Comms accounting** | Fabricated reduction figures | **Measured serialized bytes** (`comm_meter`) |

Legacy modes are retained as selectable baselines (`privacy.mechanism="record_dpsgd"`,
`parameter_efficiency.method="adms"`); nothing was removed.

**Configure it** (see `config_example.yaml`):
```yaml
privacy:
  mechanism: "dp_fedavg"     # or "record_dpsgd" (legacy baseline) | "none"
  accountant: "prv"          # tighter than "rdp"
  epsilon: 8.0
  clip_norm: 1.0             # server-side delta clip C (also the Byzantine bound)
parameter_efficiency:
  method: "ffa_lora"         # or "lora" | "adms" (baseline) | "full_head"
  lora_rank: 8
evaluation:
  threshold_split: "val"     # never fit the threshold on test labels
```

**Run the reporting experiments** (E2/E3/E4 need no training):
```bash
python -m scripts.run_v2_experiments --exp all --out results/v2
# E4: RDP vs PRV epsilon (PRV ~8-17% tighter)
# E2: measured upload bytes — FFA-LoRA ~97% smaller than full-head; ADMS ~0% (dense zeroing)
# E3: DP-noise aggregation error — FFA-LoRA ~1.8x lower than vanilla LoRA
# E1: privacy-utility Pareto (scaffold; needs a prepared dataset)
```

> **Honesty note:** SMD/NSL-KDD have no natural "user", so the privacy unit is
> reported as **entity/silo-level**, and all privacy-utility-communication results
> are framed as a **frontier**, never "strictly better".

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Dataset Setup](#dataset-setup)
- [Usage](#usage)
- [Documentation](#documentation)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Citation](#citation)
- [License](#license)

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/SentryFL.git
cd SentryFL

# Install dependencies
pip install -r requirements.txt
```

**For detailed installation instructions with exact dependency versions, see [INSTALL.md](INSTALL.md)**

### Docker Compose Deployment

The complete deployment includes the Python ML backend, Node.js API server, React production server, MongoDB, Redis, and an Nginx HTTP/HTTPS gateway.

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (only secret needed).
docker compose up --build -d
```

MongoDB runs locally **without authentication** (no password) and is published on
`localhost:27017`, so you can browse the data with **MongoDB Compass** — just connect
to `mongodb://localhost:27017` and open the `sentryfl` database. To point the API
server at a MongoDB you run yourself instead of the bundled container, set
`MONGODB_URI=mongodb://localhost:27017/sentryfl` in `.env`.

Open `https://localhost` for the dashboard. The gateway creates a development self-signed certificate in the `nginx-certs` volume; mount or replace `tls.crt` and `tls.key` there for a trusted certificate. To stop the deployment, run `docker compose down`.

Deployment configuration checks run with `python -m pytest tests/test_deployment.py -q`. Set `RUN_DOCKER_DEPLOYMENT_TESTS=1` to additionally build, start, health-check, and tear down the full Compose stack.

**For detailed installation instructions with exact dependency versions, see [INSTALL.md](INSTALL.md)**

### Running Without Docker (Local Development)

If Docker isn't running (or you'd rather run the three tiers directly), start each
process by hand. You'll need four terminals; start them in the order below because
each tier depends on the one before it.

**Prerequisites**
- **Python** 3.8+ (3.11 recommended) with `pip`
- **Node.js** ≥ 18 and **npm** ≥ 9
- **MongoDB** Community Server running locally on port `27017` (the API server needs
  it for users and audit logs). Install it from
  [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
  and start `mongod`, or point `MONGODB_URI` at a MongoDB Atlas cluster instead.
- **Redis is *not* required** for local development — the Python package doesn't use
  it (the Compose file wires it in for parity only), so you can skip it entirely.

**Terminal 1 — MongoDB** (skip if MongoDB already runs as a system service)
```bash
# Passwordless local MongoDB on the default port 27017.
mongod --dbpath ./data/db          # create ./data/db first if it doesn't exist
```
Browse the data any time with **MongoDB Compass** at `mongodb://localhost:27017`.

**Terminal 2 — Python ML backend (Tier 3, port 5000)**
```bash
pip install -r requirements.txt    # installs FastAPI + Uvicorn among the deps
uvicorn sentryfl.api.app:app --host 0.0.0.0 --port 5000 --reload
```
Verify it's up: `curl http://localhost:5000/health` → `{"status":"healthy",...}`.

**Terminal 3 — Node.js API server (Tier 2, port 3000)**
```bash
cd api-server
npm install
cp .env.example .env               # Windows PowerShell: copy .env.example .env
# Edit .env and set JWT_SECRET to any non-empty value. The defaults already point
# PYTHON_BACKEND_URL at http://localhost:5000, CORS_ORIGIN at http://localhost:5173,
# and MONGODB_URI at mongodb://127.0.0.1:27017/sentryfl.
npm run dev                        # or: npm start
```
On first start it seeds a default admin user (`admin` / `admin123`); override with
`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`, or disable with
`SEED_DEFAULT_ADMIN=false`.

**Terminal 4 — React dashboard (Tier 1, port 5173)**
```bash
cd dashboard
npm install
cp .env.example .env               # Windows PowerShell: copy .env.example .env
# Defaults talk directly to the API server: VITE_API_BASE_URL=http://localhost:3000/api
# and VITE_WS_URL=ws://localhost:3000 (no Nginx proxy in dev).
npm run dev
```

Open **http://localhost:5173** and log in with `admin` / `admin123`. To stop the
stack, press `Ctrl+C` in each terminal.

> **Note:** These four processes run the dashboard, API, and ML control plane. Actual
> federated training and evaluation still run through the CLI (`python -m sentryfl.cli
> train ...`, see below) after you've prepared a dataset.

### Dataset Setup

```bash
# Download and prepare SMD dataset
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD

# Download and prepare NSL-KDD dataset
python -m sentryfl.cli download-dataset --dataset NSL-KDD --output ./data/NSL-KDD
```

**For complete dataset setup instructions, see [DATASETS.md](DATASETS.md)**

### Run Your First Experiment

```bash
# Train federated model with differential privacy
python -m sentryfl.cli train \
    --config config_example.yaml \
    --data-path ./data/SMD

# Evaluate trained model
python -m sentryfl.cli evaluate \
    --model-path ./experiments/smd_privacy_experiment/global_model_final.pt \
    --config config_example.yaml \
    --data-path ./data/SMD
```

## 📦 Installation

### System Requirements

- **Python**: 3.8 or higher
- **OS**: Linux, macOS, or Windows
- **Hardware**: 
  - Minimum: 8GB RAM, 4 CPU cores
  - Recommended: 16GB RAM, GPU with 8GB VRAM
  - Edge inference: CPU-only devices supported via quantization

### Quick Install

```bash
pip install -r requirements.txt
```

### Dependencies

Core dependencies with versions:
- PyTorch ≥ 2.0.0
- Transformers ≥ 4.30.0
- Opacus ≥ 1.4.0 (Differential Privacy)
- NumPy ≥ 1.24.0
- Pandas ≥ 2.0.0
- scikit-learn ≥ 1.3.0

**See [INSTALL.md](INSTALL.md) for complete installation instructions including troubleshooting and platform-specific notes.**

## 📊 Dataset Setup

SentryFL supports two benchmark datasets for time-series anomaly detection:

### SMD (Server Machine Dataset)
- **Type**: Multivariate time-series from 28 server machines
- **Format**: Space/comma-separated text files
- **Size**: ~140MB
- **Download**: Requires manual download from source

### NSL-KDD (Network Intrusion Detection)
- **Type**: Network flow records with 41 features
- **Format**: CSV files
- **Size**: ~20MB
- **Download**: Automated script available

**For detailed dataset download, preprocessing, and format specifications, see [DATASETS.md](DATASETS.md)**

## 💻 Usage

### Command-Line Interface

SentryFL provides a comprehensive CLI with four main commands:

#### 1. Train Federated Model

```bash
python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD
```

#### 2. Evaluate Trained Model

```bash
python -m sentryfl.cli evaluate \
    --model-path ./models/model.pt \
    --config config.yaml \
    --data-path ./data/SMD
```

#### 3. Run Ablation Study

```bash
python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD
```

#### 4. Compare Baseline Models

```bash
python -m sentryfl.cli baseline --config config.yaml --data-path ./data/SMD
```

**For comprehensive CLI documentation with all options and examples, see [CLI_USAGE.md](CLI_USAGE.md)**

### Python API

You can also use SentryFL programmatically:

```python
from sentryfl.trainer import FederatedTrainer
from sentryfl.utils import load_config

# Load configuration
config = load_config("config_example.yaml")

# Initialize trainer
trainer = FederatedTrainer(config)

# Train model
trainer.train()

# Evaluate model
results = trainer.evaluate()
print(f"F1 Score: {results['f1']:.4f}")
print(f"AUC-ROC: {results['auc_roc']:.4f}")
```

### Configuration

SentryFL uses YAML configuration files. See `config_example.yaml` for a complete template:

```yaml
experiment:
  name: "smd_privacy_experiment"
  output_dir: "./experiments/smd_dp"
  seed: 42

privacy:
  enabled: true
  epsilon: 1.0
  delta: 1e-5

federated:
  num_clients: 10
  clients_per_round: 5

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05
```

## 📚 Documentation

- **[INSTALL.md](INSTALL.md)**: Detailed installation instructions with dependency versions
- **[DATASETS.md](DATASETS.md)**: Dataset download, preprocessing, and format specifications
- **[CLI_USAGE.md](CLI_USAGE.md)**: Complete command-line interface reference
- **[ARCHITECTURE.md](ARCHITECTURE.md)**: System architecture and model design details
- **[HYPERPARAMETERS.md](HYPERPARAMETERS.md)**: Hyperparameter tuning guidelines and recommendations
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**: Common errors and solutions

## 🏗️ Project Structure

```
SentryFL/
├── sentryfl/                    # Main Python package
│   ├── data/                    # Dataset loading and preprocessing
│   ├── federated/               # Federated learning (clients, server, ADMS)
│   ├── models/                  # PLM backbone and knowledge distillation
│   ├── privacy/                 # Differential privacy and MIA evaluation
│   ├── optimization/            # Quantization and performance optimization
│   ├── evaluation/              # Metrics, ablation studies, baselines
│   ├── visualization/           # Plot generation and data export
│   ├── utils/                   # Configuration, logging, checkpointing
│   ├── trainer.py               # Main training orchestration
│   └── cli.py                   # Command-line interface
├── tests/                       # Unit and integration tests
├── config_example.yaml          # Example configuration file
├── requirements.txt             # Python dependencies
├── README.md                    # This file
├── INSTALL.md                   # Installation guide
├── DATASETS.md                  # Dataset documentation
├── ARCHITECTURE.md              # Architecture documentation
├── HYPERPARAMETERS.md           # Hyperparameter tuning guide
└── TROUBLESHOOTING.md           # Troubleshooting guide
```

### Module Overview

- **`sentryfl.data`**: SMD and NSL-KDD dataset loaders, preprocessing pipeline
- **`sentryfl.federated`**: FederatedClient, AggregationServer, ADMS module, Byzantine aggregation
- **`sentryfl.models`**: PLM backbone (BERT/GPT-2), knowledge distillation
- **`sentryfl.privacy`**: DP-SGD implementation, privacy accounting, MIA evaluator
- **`sentryfl.optimization`**: INT8 quantization, gradient accumulation, mixed precision
- **`sentryfl.evaluation`**: Metrics computation, ablation studies, baseline comparisons
- **`sentryfl.visualization`**: ROC curves, convergence plots, communication efficiency charts
- **`sentryfl.utils`**: Configuration management, logging, checkpointing, error handling

## 🧪 Testing

Run the complete test suite:

```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=sentryfl --cov-report=html

# Run specific test modules
pytest sentryfl/data/test_dataset_loader.py -v
pytest sentryfl/privacy/test_dp_engine.py -v
```

## 🔬 Research Contributions

SentryFL addresses critical gaps in federated anomaly detection research:

1. **Formal Privacy Guarantees**: First work to integrate DP-SGD with rigorous (ε, δ) accounting in federated anomaly detection
2. **Empirical Privacy Evaluation**: Novel MIA framework to measure actual privacy leakage vs theoretical bounds
3. **Edge Deployment Analysis**: Comprehensive quantization study for CPU-only edge devices
4. **Communication Scaling**: First evaluation of parameter-efficient federated learning across 5-500 clients
5. **Byzantine Robustness**: Optional trimmed mean aggregation for malicious client detection

## 📖 Citation

If you use SentryFL in your research, please cite:

```bibtex
@article{sentryfl2024,
  title={SentryFL: Differentially Private Federated Learning for Time-Series Anomaly Detection},
  author={Your Name},
  journal={arXiv preprint arXiv:XXXX.XXXXX},
  year={2024}
}
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`pytest`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on PyTorch and Opacus frameworks
- Extends PeFAD (Parameter-Efficient Federated Anomaly Detection)
- Uses Hugging Face Transformers for PLM backbones
- Evaluated on SMD and NSL-KDD benchmark datasets

## 📧 Contact

For questions or support, please open an issue on GitHub or contact [your-email@example.com](mailto:your-email@example.com).

---

**Documentation**: [Full Documentation](./docs) | **Issues**: [GitHub Issues](https://github.com/your-org/SentryFL/issues) | **Discussions**: [GitHub Discussions](https://github.com/your-org/SentryFL/discussions)

## Appendix: Quick API Examples

### Loading SMD Dataset

```python
from sentryfl.data import SMDDatasetLoader

# Initialize loader for a specific machine
loader = SMDDatasetLoader(machine_id="machine-1-1")

# Load data
data = loader.load_data("/path/to/SMD/dataset")

# Access data
train_data = data['train']      # Shape: [T1, D]
test_data = data['test']         # Shape: [T2, D]
test_labels = data['labels']     # Shape: [T2]

# Get feature dimension
feature_dim = loader.get_feature_dim()
```

### Loading NSL-KDD Dataset

```python
from sentryfl.data import NSLKDDDatasetLoader

# Initialize loader
loader = NSLKDDDatasetLoader()

# Load data
data = loader.load_data("/path/to/NSL-KDD/dataset")

# Access data
train_data = data['train']           # Shape: [N1, 41]
test_data = data['test']             # Shape: [N2, 41]
train_labels = data['train_labels']  # Shape: [N1]
test_labels = data['test_labels']    # Shape: [N2]
```

**For complete API documentation and examples, see the individual documentation files listed above.**
