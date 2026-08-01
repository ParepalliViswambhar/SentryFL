# SentryFL Troubleshooting Guide

This guide provides solutions to common errors and issues encountered when using SentryFL.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Dataset Issues](#dataset-issues)
- [Configuration Issues](#configuration-issues)
- [Training Issues](#training-issues)
- [Privacy Issues](#privacy-issues)
- [Memory Issues](#memory-issues)
- [Performance Issues](#performance-issues)
- [Evaluation Issues](#evaluation-issues)
- [CLI Issues](#cli-issues)
- [Platform-Specific Issues](#platform-specific-issues)

## Installation Issues

### Issue 1: PyTorch Installation Fails

**Symptom**:
```
ERROR: Could not find a version that satisfies the requirement torch>=2.0.0
```

**Cause**: Incompatible Python version or missing platform-specific wheel.

**Solution**:
```bash
# Check Python version (must be 3.8+)
python --version

# Install PyTorch with specific CUDA version
pip install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cu118

# Or CPU-only
pip install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cpu
```

### Issue 2: Opacus Compatibility Error

**Symptom**:
```
ImportError: cannot import name 'PrivacyEngine' from 'opacus'
```

**Cause**: Wrong Opacus version installed.

**Solution**:
```bash
# Uninstall and reinstall correct version
pip uninstall opacus
pip install opacus==1.4.0

# Verify installation
python -c "from opacus import PrivacyEngine; print('Success')"
```

### Issue 3: Transformers Library Errors

**Symptom**:
```
OSError: Can't load tokenizer for 'bert-base-uncased'
```

**Cause**: Network timeout or missing model files.

**Solution**:
```bash
# Pre-download models
python -c "from transformers import AutoModel, AutoTokenizer; \
           AutoModel.from_pretrained('bert-base-uncased'); \
           AutoTokenizer.from_pretrained('bert-base-uncased')"

# Or set offline mode after downloading
export TRANSFORMERS_OFFLINE=1
```

### Issue 4: Missing System Dependencies (Linux)

**Symptom**:
```
ModuleNotFoundError: No module named '_ctypes'
```

**Cause**: Missing system libraries.

**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install python3-dev libffi-dev build-essential

# Reinstall Python packages
pip install --upgrade pip
pip install -r requirements.txt
```

## Dataset Issues

### Issue 5: Dataset Directory Not Found

**Symptom**:
```
FileNotFoundError: Dataset directory './data/SMD/machine-1-1' does not exist
```

**Cause**: Dataset not downloaded or incorrect path.

**Solution**:
```bash
# Verify dataset structure
ls -R ./data/SMD

# Expected structure:
# ./data/SMD/machine-1-1/{train.txt, test.txt, test_label.txt}

# Re-download if missing
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD
```

### Issue 6: Feature Dimension Mismatch

**Symptom**:
```
ValueError: Train feature dimension (38) does not match test feature dimension (37)
```

**Cause**: Corrupted data files or preprocessing error.

**Solution**:
```bash
# Check file formats
head -n 5 ./data/SMD/machine-1-1/train.txt
head -n 5 ./data/SMD/machine-1-1/test.txt

# Count columns
awk '{print NF; exit}' ./data/SMD/machine-1-1/train.txt
awk '{print NF; exit}' ./data/SMD/machine-1-1/test.txt

# If corrupted, re-download dataset
rm -rf ./data/SMD
python -m sentryfl.cli download-dataset --dataset SMD --output ./data/SMD
```

### Issue 7: Label Length Mismatch

**Symptom**:
```
ValueError: Label length (708419) does not match test data length (708420)
```

**Cause**: Extra newline in label file.

**Solution**:
```bash
# Remove trailing newlines
sed -i '/^$/d' ./data/SMD/machine-1-1/test_label.txt

# Or manually edit to remove empty lines
```

### Issue 8: NSL-KDD Parsing Error

**Symptom**:
```
ValueError: could not convert string to float: 'tcp'
```

**Cause**: Categorical features not encoded properly.

**Solution**:
This should be handled automatically by `NSLKDDDatasetLoader`. If the error persists:

```python
# Verify loader usage
from sentryfl.data import NSLKDDDatasetLoader

loader = NSLKDDDatasetLoader()
data = loader.load_data("./data/NSL-KDD")  # Not individual file

# Check data types
print(data['train'].dtype)  # Should be float32
```

## Configuration Issues

### Issue 9: Invalid Configuration Value

**Symptom**:
```
ValueError: privacy.epsilon must be > 0, got -1.0
```

**Cause**: Invalid hyperparameter value.

**Solution**:
```yaml
# Check constraints in config.yaml
privacy:
  epsilon: 1.0  # Must be > 0
  delta: 1e-5  # Must be in (0, 1)
  max_grad_norm: 1.0  # Must be > 0

federated:
  num_clients: 10  # Must be >= 1
  clients_per_round: 5  # Must be <= num_clients

training:
  batch_size: 32  # Must be > 0
  num_rounds: 100  # Must be > 0
```

### Issue 10: Configuration File Not Found

**Symptom**:
```
FileNotFoundError: Configuration file 'config.yaml' not found
```

**Cause**: Incorrect path or missing file.

**Solution**:
```bash
# Use absolute path
python -m sentryfl.cli train --config /absolute/path/to/config.yaml --data-path ./data/SMD

# Or create from example
cp config_example.yaml my_config.yaml
python -m sentryfl.cli train --config my_config.yaml --data-path ./data/SMD
```

### Issue 11: Unknown Dataset Name

**Symptom**:
```
ValueError: Unknown dataset 'smd'. Supported: ['SMD', 'NSL-KDD']
```

**Cause**: Dataset name is case-sensitive.

**Solution**:
```yaml
# Correct (case-sensitive)
data:
  dataset: "SMD"  # Not "smd" or "Smd"

# Or
data:
  dataset: "NSL-KDD"  # Not "nsl-kdd" or "NSL_KDD"
```

## Training Issues

### Issue 12: Loss Diverges (NaN or Inf)

**Symptom**:
```
RuntimeError: Loss is NaN or Inf at round 5
```

**Cause**: Learning rate too high, gradient explosion, or numerical instability.

**Solution**:
```yaml
# Reduce learning rate
training:
  learning_rate: 0.0001  # Instead of 0.001

# Enable gradient clipping (even without DP)
privacy:
  enabled: false
  max_grad_norm: 1.0  # Clip gradients

# Check for bad data
# Run with smaller dataset first to isolate issue
```

**Debug Script**:
```python
# Check for NaN/Inf in data
import torch
data = loader.load_data("./data/SMD")
print("NaN in train:", torch.isnan(data['train']).any())
print("Inf in train:", torch.isinf(data['train']).any())
```

### Issue 13: Training Stuck (No Progress)

**Symptom**: Loss does not decrease after many rounds.

**Cause**: Learning rate too low, over-clipping, or bad initialization.

**Solution**:
```yaml
# Increase learning rate
training:
  learning_rate: 0.001  # Instead of 0.0001

# Relax gradient clipping
privacy:
  max_grad_norm: 5.0  # Instead of 0.5

# Use fewer local epochs
training:
  local_epochs: 3  # Instead of 10
```

### Issue 14: Checkpoint Loading Fails

**Symptom**:
```
RuntimeError: Error loading checkpoint: size mismatch for classifier.weight
```

**Cause**: Model architecture changed or checkpoint corrupted.

**Solution**:
```bash
# Start training from scratch
rm -rf ./experiments/my_experiment/checkpoints/*

# Or verify checkpoint integrity
python -c "import torch; ckpt = torch.load('checkpoint.pt'); print(ckpt.keys())"

# Disable checkpoint loading if mismatched
python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD
# Remove --resume-from flag
```

### Issue 15: Client Training Diverges

**Symptom**:
```
WARNING: Client 3 loss exceeded threshold (1000.0), excluding update
```

**Cause**: Bad local data, overfitting, or too many local epochs.

**Solution**:
```yaml
# Reduce local epochs
training:
  local_epochs: 3  # Instead of 10

# Use IID data distribution
federated:
  partition_strategy: "iid"  # Instead of "non_iid"

# Inspect client data
# Check if specific clients have corrupted or imbalanced data
```

## Privacy Issues

### Issue 16: Privacy Budget Exhausted Early

**Symptom**:
```
RuntimeError: Privacy budget exhausted at round 25 (ε = 1.05 > target 1.0)
```

**Cause**: Privacy consumption rate too high.

**Solution**:
```yaml
# Option 1: Increase target epsilon
privacy:
  epsilon: 2.0  # Instead of 1.0

# Option 2: Reduce number of rounds
training:
  num_rounds: 50  # Instead of 100

# Option 3: Increase batch size (reduces privacy cost)
training:
  batch_size: 128  # Instead of 32

# Option 4: Reduce noise multiplier
privacy:
  max_grad_norm: 1.0  # Instead of 0.5
```

### Issue 17: MIA Evaluation Fails

**Symptom**:
```
ValueError: Insufficient data for MIA evaluation
```

**Cause**: Not enough samples for member/non-member splits.

**Solution**:
```python
# Ensure sufficient data for MIA
# Need at least 1000 samples for reliable MIA

# Or disable MIA evaluation
from sentryfl.privacy import MIAEvaluator

mia_evaluator = MIAEvaluator(target_model)
# Skip MIA if dataset too small
if len(train_data) < 1000:
    print("Skipping MIA: insufficient data")
```

### Issue 18: Gradient Clipping Too Aggressive

**Symptom**: 90%+ of gradients are clipped, training very slow.

**Cause**: `max_grad_norm` too low.

**Solution**:
```yaml
# Increase gradient clipping threshold
privacy:
  max_grad_norm: 2.0  # Instead of 0.5

# Monitor clipping rate (should be 20-50%)
# If still too high, increase further or reduce epsilon target
```

**Monitor Clipping**:
```python
# Log clipping statistics
from opacus.utils import get_grad_norms

grad_norms = get_grad_norms(model)
clipped_count = sum(1 for norm in grad_norms if norm > max_grad_norm)
print(f"Clipped: {clipped_count / len(grad_norms):.2%}")
```

## Memory Issues

### Issue 19: CUDA Out of Memory

**Symptom**:
```
RuntimeError: CUDA out of memory. Tried to allocate 2.00 GiB (GPU 0; 7.79 GiB total capacity)
```

**Cause**: Batch size too large or model too big for GPU.

**Solution**:
```yaml
# Option 1: Reduce batch size
training:
  batch_size: 16  # Instead of 32

# Option 2: Use gradient accumulation
training:
  batch_size: 16
  gradient_accumulation_steps: 2  # Effective batch size = 32

# Option 3: Use smaller model
model:
  backbone: "distilbert-base-uncased"  # Instead of "bert-base-uncased"

# Option 4: Use mixed precision
optimization:
  mixed_precision: true

# Option 5: Use CPU (slow but works)
training:
  device: "cpu"
```

### Issue 20: CPU Memory Exhausted

**Symptom**:
```
MemoryError: Unable to allocate 8.00 GiB for array with shape (100000, 100, 768)
```

**Cause**: Dataset too large to fit in RAM.

**Solution**:
```python
# Enable data loading in chunks
from sentryfl.data import SMDDatasetLoader

loader = SMDDatasetLoader(machine_id="machine-1-1")
data = loader.load_data("./data/SMD", chunk_size=10000)

# Or enable data caching to disk
preprocessor = Preprocessor(
    window_size=100,
    stride=1,
    normalize=True,
    cache_to_disk=True,
    cache_dir="./data/.cache"
)
```

### Issue 21: Disk Space Exhausted

**Symptom**:
```
OSError: [Errno 28] No space left on device
```

**Cause**: Checkpoints and logs consuming too much space.

**Solution**:
```bash
# Clean up old checkpoints
find ./experiments -name "*.pt" -mtime +7 -delete

# Reduce checkpoint frequency
```

```yaml
experiment:
  checkpoint_interval: 20  # Save every 20 rounds instead of 10

# Disable saving intermediate checkpoints
experiment:
  save_intermediate_checkpoints: false
```

## Performance Issues

### Issue 22: Training Very Slow

**Symptom**: Each round takes several minutes.

**Cause**: CPU-only training, large model, or inefficient data loading.

**Solution**:
```yaml
# Enable GPU
training:
  device: "cuda"  # Instead of "cpu"

# Enable mixed precision
optimization:
  mixed_precision: true

# Increase data loading workers
data:
  num_workers: 4  # Multi-threaded data loading

# Reduce model size
model:
  backbone: "distilbert-base-uncased"

# Enable data caching
data:
  cache_preprocessed: true
```

### Issue 23: High Communication Overhead

**Symptom**: Communication dominates training time.

**Cause**: Full model synchronization or too many rounds.

**Solution**:
```yaml
# Enable ADMS for parameter efficiency
parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05  # Only update 5% of parameters

# Reduce communication frequency
training:
  local_epochs: 10  # More local training, less communication

# Enable quantization
optimization:
  quantization_enabled: true
  quantization_dtype: "int8"
```

### Issue 24: Data Loading Bottleneck

**Symptom**: GPU utilization <50%, CPU pegged at 100%.

**Cause**: Data preprocessing slower than training.

**Solution**:
```yaml
# Enable preprocessing cache
data:
  cache_preprocessed: true
  cache_dir: "./data/.cache"

# Increase data loading workers
data:
  num_workers: 8  # More parallel data loading

# Use persistent workers
data:
  persistent_workers: true
```

## Evaluation Issues

### Issue 25: Poor Anomaly Detection Performance

**Symptom**: F1 score < 0.5, worse than random.

**Cause**: Class imbalance, wrong threshold, or underfitting.

**Solution**:
```yaml
# Adjust anomaly threshold
evaluation:
  anomaly_threshold: 0.3  # Instead of 0.5 for imbalanced data

# Use class weighting
training:
  class_weights: [1.0, 10.0]  # Weight anomalies 10x higher

# Train longer
training:
  num_rounds: 200  # Instead of 100
```

**Debug**:
```python
# Check class distribution
import numpy as np
anomaly_rate = test_labels.sum() / len(test_labels)
print(f"Anomaly rate: {anomaly_rate:.2%}")

# If <1%, use appropriate metrics (AUC-PR instead of F1)
```

### Issue 26: Inconsistent Results Across Runs

**Symptom**: Different results with same configuration.

**Cause**: Non-deterministic operations or missing random seed.

**Solution**:
```yaml
# Set random seed
experiment:
  seed: 42

# Disable non-deterministic operations
```

```python
# In training script
import torch
import numpy as np
import random

seed = 42
torch.manual_seed(seed)
torch.cuda.manual_seed_all(seed)
np.random.seed(seed)
random.seed(seed)

# Ensure deterministic behavior (may reduce performance)
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
```

### Issue 27: Evaluation Crashes

**Symptom**:
```
RuntimeError: Expected all tensors to be on the same device, but found at least two devices, cuda:0 and cpu!
```

**Cause**: Model and data on different devices.

**Solution**:
```python
# Ensure model and data on same device
model = model.to(device)
data = data.to(device)

# Or use automatic device detection
from sentryfl.utils import get_device

device = get_device()  # Auto-detect GPU/CPU
model = model.to(device)
```

## CLI Issues

### Issue 28: CLI Command Not Found

**Symptom**:
```
python: No module named sentryfl.cli
```

**Cause**: SentryFL not installed or not in PYTHONPATH.

**Solution**:
```bash
# Verify installation
python -c "import sentryfl; print(sentryfl.__file__)"

# If not found, ensure correct directory
cd /path/to/SentryFL
python -m sentryfl.cli --help

# Or install in editable mode
pip install -e .
```

### Issue 29: Config Override Not Working

**Symptom**: Configuration override via `--override` ignored.

**Cause**: Incorrect syntax or typo.

**Solution**:
```bash
# Correct syntax (no spaces around =)
python -m sentryfl.cli train \
  --config config.yaml \
  --data-path ./data/SMD \
  --override privacy.epsilon=0.5 training.num_rounds=50

# Multiple overrides (space-separated)
--override privacy.epsilon=0.5 training.batch_size=64 training.num_rounds=100

# For nested values, use dot notation
--override parameter_efficiency.selection_ratio=0.1
```

### Issue 30: Model Path Not Found for Evaluation

**Symptom**:
```
FileNotFoundError: Model file './models/model.pt' not found
```

**Cause**: Incorrect path to trained model.

**Solution**:
```bash
# Use full path to checkpoint
python -m sentryfl.cli evaluate \
  --model-path ./experiments/smd_privacy_experiment/global_model_final.pt \
  --config config.yaml \
  --data-path ./data/SMD

# Or use latest checkpoint
python -m sentryfl.cli evaluate \
  --model-path ./experiments/smd_privacy_experiment/checkpoints/round_100.pt \
  --config config.yaml \
  --data-path ./data/SMD
```

## Platform-Specific Issues

### Issue 31: Windows Long Path Limit

**Symptom**:
```
FileNotFoundError: [Errno 2] No such file or directory (on Windows)
```

**Cause**: Windows 260 character path limit.

**Solution**:
```bash
# Enable long paths in Windows
# Run as Administrator in PowerShell:
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force

# Or use shorter experiment names
```

```yaml
experiment:
  name: "exp1"  # Instead of "smd_privacy_epsilon_1_clients_10_rounds_100"
  output_dir: "./exp"  # Instead of "./experiments/long_descriptive_name"
```

### Issue 32: macOS MPS (Apple Silicon) Issues

**Symptom**:
```
RuntimeError: MPS backend is not available
```

**Cause**: MPS backend not supported for all operations.

**Solution**:
```yaml
# Use CPU on macOS
training:
  device: "cpu"

# Or check MPS availability
```

```python
import torch

if torch.backends.mps.is_available():
    device = torch.device("mps")
else:
    device = torch.device("cpu")
```

### Issue 33: Linux Permission Denied

**Symptom**:
```
PermissionError: [Errno 13] Permission denied: './data'
```

**Cause**: Insufficient file permissions.

**Solution**:
```bash
# Fix permissions
chmod -R u+rwx ./data ./experiments

# Or run with user flag
pip install --user -r requirements.txt
```

## General Debugging Tips

### Enable Verbose Logging

```yaml
experiment:
  log_level: "DEBUG"  # Instead of "INFO"
  log_file: "./experiments/debug.log"
```

### Check System Information

```python
import torch
import sys

print(f"Python: {sys.version}")
print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")
print(f"GPU count: {torch.cuda.device_count()}")
if torch.cuda.is_available():
    print(f"GPU name: {torch.cuda.get_device_name(0)}")
```

### Run Minimal Example

```bash
# Test with minimal configuration
python -m sentryfl.cli train \
  --config config_example.yaml \
  --data-path ./data/SMD \
  --override training.num_rounds=5 federated.num_clients=2
```

### Isolate Issue

```python
# Test components individually

# 1. Test data loading
from sentryfl.data import SMDDatasetLoader
loader = SMDDatasetLoader(machine_id="machine-1-1")
data = loader.load_data("./data/SMD")
print("Data loading: OK")

# 2. Test model creation
from sentryfl.models import PLMBackbone
model = PLMBackbone(backbone="bert-base-uncased", input_dim=38)
print("Model creation: OK")

# 3. Test forward pass
import torch
dummy_input = torch.randn(2, 100, 38)
output = model(dummy_input)
print(f"Forward pass: OK, output shape: {output.shape}")
```

## Getting Additional Help

If you encounter an issue not covered in this guide:

1. **Check GitHub Issues**: https://github.com/your-org/SentryFL/issues
2. **Search Discussions**: https://github.com/your-org/SentryFL/discussions
3. **Enable Debug Logging**: Set `log_level: "DEBUG"` in config
4. **Create Issue**: Include error message, config file, and system info

### Issue Template

When reporting issues, include:

```
**Environment:**
- OS: Ubuntu 20.04
- Python: 3.9.7
- PyTorch: 2.0.1
- CUDA: 11.8

**Configuration:**
```yaml
# Paste relevant config.yaml sections
```

**Error Message:**
```
# Paste full error traceback
```

**Steps to Reproduce:**
1. Run command...
2. Observe error...

**Expected Behavior:**
What should happen...

**Actual Behavior:**
What actually happens...
```

---

For architecture and design documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

For hyperparameter tuning, see [HYPERPARAMETERS.md](HYPERPARAMETERS.md).
