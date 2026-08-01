# SentryFL: Differentially Private Federated Learning for Time-Series Anomaly Detection

SentryFL is a differentially private, communication-efficient federated learning framework for time-series anomaly detection in distributed security sensing environments.

## Features

- **Dataset Support**: SMD (Server Machine Dataset) and NSL-KDD (Network Intrusion Detection)
- **Privacy-First**: Differential privacy integration with formal guarantees
- **Parameter Efficiency**: ADMS and PPDS modules for reduced communication
- **Production Ready**: Quantization, checkpointing, and comprehensive error handling

## Installation

```bash
pip install -r requirements.txt
```

## Command-Line Interface

SentryFL provides a comprehensive CLI for training, evaluation, and experiments.

### Quick Start with CLI

```bash
# Train federated model
python -m sentryfl.cli train --config config_example.yaml --data-path ./data/SMD

# Evaluate trained model
python -m sentryfl.cli evaluate --model-path ./models/model.pt --config config.yaml --data-path ./data/SMD

# Run ablation study
python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD

# Compare baselines
python -m sentryfl.cli baseline --config config.yaml --data-path ./data/SMD
```

See [CLI_USAGE.md](CLI_USAGE.md) for comprehensive CLI documentation.

## Quick Start (Python API)

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

# Get feature dimension (41 features)
feature_dim = loader.get_feature_dim()
```

## Dataset Format

### SMD Dataset Structure

```
SMD/
├── machine-1-1/
│   ├── train.txt       # Normal time-series data
│   ├── test.txt        # Test time-series data
│   └── test_label.txt  # Binary labels (0=normal, 1=anomaly)
├── machine-1-2/
│   └── ...
└── ...
```

### NSL-KDD Dataset Structure

```
NSL-KDD/
├── KDDTrain+.txt  # Training network flows
└── KDDTest+.txt   # Test network flows
```

## Testing

Run the test suite:

```bash
pytest tests/test_dataset_loader.py -v
```

Run with coverage:

```bash
pytest tests/test_dataset_loader.py --cov=sentryfl.data --cov-report=html
```

## Implementation Details

### SMDDatasetLoader

- Loads multivariate time-series from space/comma-separated text files
- Handles univariate data by reshaping to (T, 1)
- Validates feature dimension consistency between train and test
- Validates label length matches test data length

### NSLKDDDatasetLoader

- Parses CSV format with 41 features + label + difficulty
- Encodes categorical features (protocol_type, service, flag) using label encoding
- Converts attack types to binary labels (0=normal, 1=attack)
- Handles unseen categorical values in test set gracefully
- Returns float32 arrays for efficient computation

### Error Handling

Both loaders provide comprehensive error handling:
- `FileNotFoundError`: Missing dataset directory or files
- `ValueError`: Feature dimension mismatch or data format issues
- `RuntimeError`: Attempting to get feature dimension before loading data

## Project Structure

```
SentryFL/
├── sentryfl/
│   ├── __init__.py
│   └── data/
│       ├── __init__.py
│       └── dataset_loader.py
├── tests/
│   ├── __init__.py
│   └── test_dataset_loader.py
├── requirements.txt
└── README.md
```

## Requirements

- Python >= 3.8
- numpy >= 1.24.0
- pandas >= 2.0.0
- scikit-learn >= 1.3.0

## License

TBD

## Contributors

TBD
