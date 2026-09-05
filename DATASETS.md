# SentryFL Dataset Guide

This guide provides comprehensive instructions for downloading, preprocessing, and using datasets with SentryFL.

## Table of Contents

- [Supported Datasets](#supported-datasets)
- [SMD Dataset](#smd-dataset)
- [NSL-KDD Dataset](#nsl-kdd-dataset)
- [Dataset Download Scripts](#dataset-download-scripts)
- [Preprocessing](#preprocessing)
- [Data Partitioning](#data-partitioning)
- [Custom Datasets](#custom-datasets)
- [Troubleshooting](#troubleshooting)

## Supported Datasets

SentryFL supports two benchmark datasets for time-series anomaly detection:

| Dataset | Type | Size | Instances | Features | Anomaly Rate |
|---------|------|------|-----------|----------|--------------|
| **SMD** | Server telemetry | ~140MB | 28 machines | 38 (avg) | 4.16% |
| **NSL-KDD** | Network intrusion | ~20MB | 148,517 | 41 | 46.5% |

## SMD Dataset

### Overview

**SMD (Server Machine Dataset)** contains multivariate time-series data collected from 28 server machines at a large Internet company. The dataset includes various sensors measuring system metrics like CPU usage, memory, disk I/O, and network traffic.

### Dataset Structure

```
SMD/
├── machine-1-1/
│   ├── train.txt       # Normal time-series (no anomalies)
│   ├── test.txt        # Test time-series (contains anomalies)
│   └── test_label.txt  # Binary labels (0=normal, 1=anomaly)
├── machine-1-2/
│   ├── train.txt
│   ├── test.txt
│   └── test_label.txt
├── ...
└── machine-3-11/
    ├── train.txt
    ├── test.txt
    └── test_label.txt
```

### File Formats

#### train.txt and test.txt

- **Format**: Space-separated or comma-separated values
- **Shape**: `[T, D]` where T = timesteps, D = feature dimensions
- **Example**:
  ```
  0.123 0.456 0.789 ...
  0.234 0.567 0.890 ...
  0.345 0.678 0.901 ...
  ```

#### test_label.txt

- **Format**: One label per line
- **Values**: `0` (normal) or `1` (anomaly)
- **Example**:
  ```
  0
  0
  1
  0
  1
  ```

### Download Instructions

#### Manual Download

1. **Source**: [SMD Dataset Repository](https://github.com/NetManAIOps/OmniAnomaly)
2. **Download**: Clone repository or download ZIP
   ```bash
   git clone https://github.com/NetManAIOps/OmniAnomaly.git
   ```
3. **Extract**: Navigate to `ServerMachineDataset/` directory
4. **Organize**: Copy to SentryFL data directory
   ```bash
   cp -r OmniAnomaly/ServerMachineDataset/* ./data/SMD/
   ```

#### Automated Download (Recommended)

```bash
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD
```

### Dataset Statistics

| Machine ID | Train Size | Test Size | Features | Anomaly % |
|------------|------------|-----------|----------|-----------|
| machine-1-1 | 708,405 | 708,420 | 38 | 4.38% |
| machine-1-2 | 708,405 | 708,420 | 38 | 6.28% |
| machine-1-3 | 708,405 | 708,420 | 38 | 1.51% |
| machine-1-4 | 708,405 | 708,420 | 38 | 1.20% |
| ... | ... | ... | ... | ... |
| machine-3-11 | 708,405 | 708,420 | 38 | 5.91% |

**Total**: ~40 million timesteps across 28 machines

### Loading SMD with SentryFL

```python
from sentryfl.data import SMDDatasetLoader

# Initialize loader for specific machine
loader = SMDDatasetLoader(machine_id="machine-1-1")

# Load data
data = loader.load_data("./data/SMD")

# Access components
train_data = data['train']      # Shape: [T1, D]
test_data = data['test']         # Shape: [T2, D]
test_labels = data['labels']     # Shape: [T2]
feature_dim = loader.get_feature_dim()

print(f"Train shape: {train_data.shape}")
print(f"Test shape: {test_data.shape}")
print(f"Anomaly rate: {test_labels.sum() / len(test_labels):.2%}")
```

## NSL-KDD Dataset

### Overview

**NSL-KDD** is a refined version of the KDD Cup 1999 dataset for network intrusion detection. It contains network connection records with 41 features extracted from TCP/IP packets. Each record is labeled as either normal traffic or one of four attack categories (DoS, Probe, R2L, U2R).

### Dataset Structure

```
NSL-KDD/
├── KDDTrain+.txt         # Training data
├── KDDTest+.txt          # Test data
├── KDDTrain+_20Percent.txt  # Reduced training set (optional)
└── Field Names.txt       # Feature descriptions
```

### File Format

- **Format**: CSV (comma-separated values)
- **Columns**: 42 total (41 features + 1 label + 1 difficulty)
- **Shape**: `[N, 42]` where N = number of connections

#### Feature Types

1. **Basic Features** (9): Duration, protocol_type, service, flag, etc.
2. **Content Features** (13): Hot, num_failed_logins, logged_in, etc.
3. **Traffic Features** (9): Count, srv_count, serror_rate, etc.
4. **Host Features** (10): dst_host_count, dst_host_srv_count, etc.

#### Example Row

```
0,tcp,http,SF,215,45076,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0.00,0.00,0.00,0.00,1.00,0.00,0.00,0,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,normal,21
```

### Download Instructions

#### Manual Download

1. **Source**: [NSL-KDD Dataset](https://www.unb.ca/cic/datasets/nsl.html)
2. **Download**: Download ZIP file
3. **Extract**: Unzip to data directory
   ```bash
   unzip NSL-KDD.zip -d ./data/NSL-KDD/
   ```

#### Automated Download (Recommended)

```bash
python -m sentryfl.cli download-dataset --dataset NSL-KDD --output ./data/NSL-KDD
```

### Dataset Statistics

| Split | Normal | DoS | Probe | R2L | U2R | Total |
|-------|--------|-----|-------|-----|-----|-------|
| **Train+** | 67,343 | 45,927 | 11,656 | 995 | 52 | 125,973 |
| **Test+** | 9,711 | 7,458 | 2,421 | 2,754 | 200 | 22,544 |

**Attack Categories**:
- **DoS** (Denial of Service): neptune, smurf, pod, teardrop, land, back
- **Probe**: satan, ipsweep, nmap, portsweep
- **R2L** (Remote to Local): warezclient, guess_passwd, warezmaster, imap, ftp_write, multihop, phf, spy
- **U2R** (User to Root): buffer_overflow, rootkit, loadmodule, perl

### Loading NSL-KDD with SentryFL

```python
from sentryfl.data import NSLKDDDatasetLoader

# Initialize loader
loader = NSLKDDDatasetLoader()

# Load data
data = loader.load_data("./data/NSL-KDD")

# Access components
train_data = data['train']           # Shape: [125973, 41]
test_data = data['test']             # Shape: [22544, 41]
train_labels = data['train_labels']  # Shape: [125973]
test_labels = data['test_labels']    # Shape: [22544]

print(f"Train shape: {train_data.shape}")
print(f"Test shape: {test_data.shape}")
print(f"Attack rate (train): {train_labels.sum() / len(train_labels):.2%}")
print(f"Attack rate (test): {test_labels.sum() / len(test_labels):.2%}")
```

## Dataset Download Scripts

SentryFL provides automated download scripts for both datasets.

### CLI Download Command

```bash
# Download SMD
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD

# Download NSL-KDD
python -m sentryfl.cli download-dataset --dataset NSL-KDD --output ./data/NSL-KDD

# Download both
python -m sentryfl.cli download-dataset --dataset all --output ./data
```

### Python API Download

```python
from sentryfl.data.download import download_dataset

# Download SMD
download_dataset(dataset="SMD", output_dir="./data/SMD")

# Download NSL-KDD
download_dataset(dataset="NSL-KDD", output_dir="./data/NSL-KDD")
```

### Manual Setup Script

If automatic download fails, use the manual setup script:

```bash
# SMD manual setup
python scripts/setup_smd.py --source /path/to/downloaded/SMD --output ./data/SMD

# NSL-KDD manual setup
python scripts/setup_nslkdd.py --source /path/to/downloaded/NSL-KDD --output ./data/NSL-KDD
```

## Preprocessing

SentryFL provides comprehensive preprocessing pipelines for both datasets.

### Preprocessing Steps

1. **Normalization**: Z-score normalization (zero mean, unit variance)
2. **Windowing**: Sliding window to create fixed-length sequences
3. **Imputation**: Forward-fill for missing values
4. **Splitting**: Train/validation/test splits

### Configuration

```yaml
data:
  dataset: "SMD"              # or "NSL-KDD"
  window_size: 100            # Sequence length
  stride: 1                   # Sliding window stride
  normalize: true             # Apply normalization
  train_ratio: 0.7            # 70% training
  val_ratio: 0.15             # 15% validation
  # Remaining 15% for test
```

### Preprocessing API

```python
from sentryfl.data import Preprocessor

# Initialize preprocessor
preprocessor = Preprocessor(
    window_size=100,
    stride=1,
    normalize=True
)

# Preprocess data
processed_data = preprocessor.preprocess(
    train_data=train_data,
    test_data=test_data,
    test_labels=test_labels
)

# Access processed data
train_windows = processed_data['train_windows']  # Shape: [N, 100, D]
test_windows = processed_data['test_windows']    # Shape: [M, 100, D]
window_labels = processed_data['window_labels']  # Shape: [M]
```

### Caching Preprocessed Data

To avoid recomputing preprocessing:

```python
# Save preprocessed data
preprocessor.save_cache(
    data=processed_data,
    cache_path="./data/.cache/smd_machine_1_1_processed.pkl"
)

# Load preprocessed data
cached_data = preprocessor.load_cache(
    cache_path="./data/.cache/smd_machine_1_1_processed.pkl"
)
```

## Data Partitioning

SentryFL supports both IID and non-IID data partitioning across federated clients.

### IID Partitioning

Each client receives randomly sampled data with similar distribution:

```yaml
federated:
  num_clients: 10
  partition_strategy: "iid"
```

```python
from sentryfl.data import partition_data_iid

client_data = partition_data_iid(
    data=train_data,
    labels=train_labels,
    num_clients=10
)

# client_data[i] contains data for client i
```

### Non-IID Partitioning

Each client receives data from specific classes or machines:

```yaml
federated:
  num_clients: 10
  partition_strategy: "non_iid"
  non_iid_alpha: 0.5  # Dirichlet distribution parameter
```

```python
from sentryfl.data import partition_data_non_iid

client_data = partition_data_non_iid(
    data=train_data,
    labels=train_labels,
    num_clients=10,
    alpha=0.5  # Lower = more heterogeneous
)
```

### Client Data Distribution

```python
# Analyze client data distribution
from sentryfl.data import analyze_partitions

stats = analyze_partitions(client_data)

for client_id, client_stats in enumerate(stats):
    print(f"Client {client_id}:")
    print(f"  Samples: {client_stats['num_samples']}")
    print(f"  Anomaly rate: {client_stats['anomaly_rate']:.2%}")
    print(f"  Feature mean: {client_stats['feature_mean']}")
```

## Custom Datasets

To use custom time-series datasets with SentryFL:

### 1. Implement Dataset Loader

```python
from sentryfl.data import BaseDatasetLoader

class CustomDatasetLoader(BaseDatasetLoader):
    def __init__(self):
        super().__init__()
        self.feature_dim = None
    
    def load_data(self, data_path):
        # Load your custom data
        train_data = ...  # Shape: [T1, D]
        test_data = ...   # Shape: [T2, D]
        test_labels = ... # Shape: [T2]
        
        self.feature_dim = train_data.shape[1]
        
        return {
            'train': train_data,
            'test': test_data,
            'labels': test_labels
        }
    
    def get_feature_dim(self):
        if self.feature_dim is None:
            raise RuntimeError("Call load_data() first")
        return self.feature_dim
```

### 2. Register Custom Loader

```python
from sentryfl.data import register_dataset_loader

register_dataset_loader("CustomDataset", CustomDatasetLoader)
```

### 3. Use in Configuration

```yaml
data:
  dataset: "CustomDataset"
  data_path: "./data/custom"
```

### Custom Dataset Requirements

Your dataset must provide:
- **Training data**: Normal time-series (no anomalies)
- **Test data**: Time-series with anomalies
- **Test labels**: Binary labels (0=normal, 1=anomaly)
- **Consistent feature dimensions**: Train and test must have same number of features

## Troubleshooting

### Issue 1: Dataset Not Found

**Symptom**: `FileNotFoundError: Dataset directory does not exist`

**Solution**:
```bash
# Verify dataset path
ls ./data/SMD/machine-1-1

# Re-download dataset
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD
```

### Issue 2: Feature Dimension Mismatch

**Symptom**: `ValueError: Train and test feature dimensions do not match`

**Solution**:
- Check that train.txt and test.txt have same number of columns
- Verify file format (space vs comma separated)
- Ensure no extra whitespace or empty lines

### Issue 3: Label Length Mismatch

**Symptom**: `ValueError: Label length does not match test data length`

**Solution**:
- Verify test_label.txt has exactly one label per test timestep
- Check for extra newlines at end of file

### Issue 4: Memory Error During Loading

**Symptom**: `MemoryError: Unable to allocate array`

**Solution**:
```python
# Load data in chunks
loader = SMDDatasetLoader(machine_id="machine-1-1")
data = loader.load_data("./data/SMD", chunk_size=100000)
```

### Issue 5: Unseen Categorical Values (NSL-KDD)

**Symptom**: Warning about unseen categorical values in test set

**Solution**:
- This is expected behavior
- SentryFL handles unseen values by mapping to a special "unknown" category
- No action required

### Issue 6: Corrupted Download

**Symptom**: `ValueError: Could not parse data file`

**Solution**:
```bash
# Remove corrupted files
rm -rf ./data/SMD

# Re-download
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD --force
```

### Issue 7: Preprocessing Takes Too Long

**Symptom**: Preprocessing hangs or takes excessive time

**Solution**:
```yaml
# Enable caching
data:
  cache_preprocessed: true
  cache_dir: "./data/.cache"

# Or reduce window size
data:
  window_size: 50  # Instead of 100
```

### Issue 8: Non-IID Partitioning Fails

**Symptom**: `ValueError: Cannot create non-IID partitions with fewer samples than clients`

**Solution**:
- Reduce number of clients
- Increase training data ratio
- Use IID partitioning instead

## Dataset Statistics Summary

### SMD Statistics

- **Machines**: 28
- **Total timesteps**: ~40 million
- **Features**: 38 (average)
- **Train size**: ~708K per machine
- **Test size**: ~708K per machine
- **Anomaly rate**: 1.2% - 6.3%

### NSL-KDD Statistics

- **Train size**: 125,973 connections
- **Test size**: 22,544 connections
- **Features**: 41
- **Attack types**: 39 distinct attacks
- **Attack categories**: 4 (DoS, Probe, R2L, U2R)
- **Attack rate (train)**: 46.5%
- **Attack rate (test)**: 56.9%

## Next Steps

After setting up datasets:

1. **Configure experiment**: Edit `config_example.yaml`
2. **Run preprocessing test**: 
   ```bash
   python -m sentryfl.data.test_preprocessor
   ```
3. **Train model**:
   ```bash
   python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD
   ```

## References

- **SMD Dataset**: Su, Y., et al. "Robust Anomaly Detection for Multivariate Time Series through Stochastic Recurrent Neural Network." KDD 2019.
- **NSL-KDD Dataset**: Tavallaee, M., et al. "A Detailed Analysis of the KDD CUP 99 Data Set." IEEE Symposium on Computational Intelligence for Security and Defense Applications, 2009.

---

For additional help, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) or open an issue on GitHub.
