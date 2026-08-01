# SentryFL Installation Guide

This guide provides comprehensive installation instructions for SentryFL, including system requirements, dependency management, and platform-specific setup.

## Table of Contents

- [System Requirements](#system-requirements)
- [Quick Installation](#quick-installation)
- [Dependency Versions](#dependency-versions)
- [Installation Methods](#installation-methods)
- [Verification](#verification)
- [Platform-Specific Notes](#platform-specific-notes)
- [GPU Setup](#gpu-setup)
- [Troubleshooting](#troubleshooting)

## System Requirements

### Minimum Requirements

- **Operating System**: Linux (Ubuntu 18.04+), macOS (10.14+), or Windows 10/11
- **Python**: 3.8 or higher
- **RAM**: 8GB
- **CPU**: 4 cores
- **Disk Space**: 10GB (including datasets)
- **Internet**: Required for downloading dependencies and datasets

### Recommended Requirements

- **RAM**: 16GB or higher
- **GPU**: NVIDIA GPU with 8GB VRAM (for accelerated training)
- **CPU**: 8+ cores
- **Disk Space**: 50GB (for experiments and checkpoints)

### Edge Deployment Requirements

- **CPU-only**: Supported via INT8 quantization
- **RAM**: 2GB minimum (for quantized inference)
- **Examples**: Raspberry Pi 4, industrial controllers, edge gateways

## Quick Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/SentryFL.git
cd SentryFL
```

### 2. Create Virtual Environment (Recommended)

```bash
# Using venv
python -m venv sentryfl_env
source sentryfl_env/bin/activate  # On Windows: sentryfl_env\Scripts\activate

# Using conda
conda create -n sentryfl python=3.9
conda activate sentryfl
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Verify Installation

```bash
python -m sentryfl.cli --help
```

## Dependency Versions

### Exact Dependency Versions (Tested Configuration)

The following versions are tested and guaranteed to work:

```
# Core Deep Learning
torch==2.0.1
torchvision==0.15.2
torchaudio==2.0.2

# Transformers & Pre-trained Models
transformers==4.30.2
tokenizers==0.13.3

# Differential Privacy
opacus==1.4.0

# Data Processing
numpy==1.24.3
pandas==2.0.3
scikit-learn==1.3.0

# Visualization
matplotlib==3.7.2
seaborn==0.12.2

# Configuration & Logging
pyyaml==6.0.1
tensorboard==2.13.0
psutil==5.9.5

# Testing
pytest==7.4.0
pytest-cov==4.1.0
```

### Minimum Dependency Versions

For compatibility with existing environments:

```
torch>=2.0.0
torchvision>=0.15.0
torchaudio>=2.0.0
transformers>=4.30.0
tokenizers>=0.13.0
opacus>=1.4.0
numpy>=1.24.0
pandas>=2.0.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
seaborn>=0.12.0
pyyaml>=6.0
tensorboard>=2.13.0
psutil>=5.9.0
pytest>=7.4.0
pytest-cov>=4.1.0
```

## Installation Methods

### Method 1: Standard pip Installation

```bash
pip install -r requirements.txt
```

### Method 2: Install with Specific PyTorch Version

For specific CUDA versions:

```bash
# CUDA 11.8
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu121

# CPU-only
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cpu

# Then install remaining dependencies
pip install -r requirements.txt
```

### Method 3: Development Installation

For contributors:

```bash
pip install -e .  # Editable installation
pip install -r requirements-dev.txt  # Additional dev tools
```

### Method 4: Conda Installation

```bash
# Create environment with dependencies
conda create -n sentryfl python=3.9 numpy pandas scikit-learn matplotlib seaborn pyyaml pytest

# Activate environment
conda activate sentryfl

# Install PyTorch
conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia

# Install remaining pip dependencies
pip install transformers opacus tensorboard pytest-cov
```

## Verification

### 1. Verify Python Version

```bash
python --version
# Should output: Python 3.8.x or higher
```

### 2. Verify PyTorch Installation

```python
import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")
```

### 3. Verify Opacus (Differential Privacy)

```python
import opacus
print(f"Opacus version: {opacus.__version__}")
```

### 4. Verify SentryFL CLI

```bash
python -m sentryfl.cli --help
```

Expected output:
```
usage: cli.py [-h] {train,evaluate,ablation,baseline} ...

SentryFL Command-Line Interface
...
```

### 5. Run Test Suite

```bash
pytest --version
pytest -v
```

## Platform-Specific Notes

### Linux (Ubuntu/Debian)

```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install python3-dev python3-pip build-essential

# Install SentryFL
pip install -r requirements.txt
```

### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.9

# Install SentryFL
pip3 install -r requirements.txt
```

**Note**: macOS does not support CUDA. For GPU acceleration on macOS (Apple Silicon), use MPS backend:

```python
device = torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
```

### Windows

```bash
# Ensure Python is in PATH
python --version

# Install dependencies
pip install -r requirements.txt
```

**Note**: Windows may require Visual C++ Build Tools for some dependencies:
- Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

## GPU Setup

### NVIDIA GPU Setup

#### 1. Check GPU Availability

```bash
nvidia-smi
```

#### 2. Install CUDA Toolkit

- **CUDA 11.8**: https://developer.nvidia.com/cuda-11-8-0-download-archive
- **CUDA 12.1**: https://developer.nvidia.com/cuda-downloads

#### 3. Install cuDNN

- Download from: https://developer.nvidia.com/cudnn
- Follow installation instructions for your platform

#### 4. Verify PyTorch GPU Support

```python
import torch
print(torch.cuda.is_available())  # Should be True
print(torch.cuda.device_count())  # Number of GPUs
print(torch.cuda.get_device_name(0))  # GPU name
```

### Multi-GPU Setup

SentryFL supports data parallelism across multiple GPUs:

```yaml
# config.yaml
training:
  device: "cuda"
  multi_gpu: true
  gpu_ids: [0, 1, 2, 3]  # Specify GPU IDs
```

## Troubleshooting

### Issue 1: PyTorch Installation Fails

**Symptom**: `ERROR: Could not find a version that satisfies the requirement torch`

**Solution**:
```bash
# Install from PyTorch website with specific CUDA version
pip install torch==2.0.1 --index-url https://download.pytorch.org/whl/cu118
```

### Issue 2: Opacus Compatibility Error

**Symptom**: `ImportError: cannot import name 'PrivacyEngine' from 'opacus'`

**Solution**:
```bash
# Ensure correct Opacus version
pip uninstall opacus
pip install opacus==1.4.0
```

### Issue 3: CUDA Out of Memory

**Symptom**: `RuntimeError: CUDA out of memory`

**Solution**:
- Reduce batch size in configuration: `training.batch_size: 16`
- Enable gradient accumulation: `training.gradient_accumulation_steps: 4`
- Use mixed precision training: `optimization.mixed_precision: true`

### Issue 4: Missing System Libraries (Linux)

**Symptom**: `ModuleNotFoundError: No module named '_ctypes'`

**Solution**:
```bash
sudo apt-get install libffi-dev
pip install --upgrade pip
pip install -r requirements.txt
```

### Issue 5: Transformers Model Download Timeout

**Symptom**: `requests.exceptions.ConnectionError: ('Connection aborted.')`

**Solution**:
```bash
# Set offline mode and download manually
export TRANSFORMERS_OFFLINE=1

# Or increase timeout
export HF_HUB_DOWNLOAD_TIMEOUT=300
```

### Issue 6: Windows Long Path Limit

**Symptom**: `FileNotFoundError: [Errno 2] No such file or directory` (on Windows)

**Solution**:
```bash
# Enable long paths in Windows Registry
# Or use shorter experiment names and output directories
```

Registry edit:
1. Open Registry Editor (regedit)
2. Navigate to: `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem`
3. Set `LongPathsEnabled` to `1`

### Issue 7: Permission Denied (macOS/Linux)

**Symptom**: `PermissionError: [Errno 13] Permission denied`

**Solution**:
```bash
# Use --user flag
pip install --user -r requirements.txt

# Or fix permissions
chmod +x scripts/*.sh
```

### Issue 8: Conflicting Dependencies

**Symptom**: `ERROR: pip's dependency resolver does not currently take into account all the packages that are installed`

**Solution**:
```bash
# Create fresh environment
python -m venv fresh_env
source fresh_env/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

## Offline Installation

For air-gapped environments:

### 1. Download Dependencies

On a machine with internet:

```bash
pip download -r requirements.txt -d ./sentryfl_deps
```

### 2. Transfer to Offline Machine

Copy `sentryfl_deps/` directory to offline machine.

### 3. Install Offline

```bash
pip install --no-index --find-links=./sentryfl_deps -r requirements.txt
```

## Docker Installation (Optional)

For containerized deployment:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run tests
RUN pytest

CMD ["python", "-m", "sentryfl.cli", "--help"]
```

Build and run:

```bash
docker build -t sentryfl:latest .
docker run -it sentryfl:latest
```

## Post-Installation Steps

### 1. Download Datasets

See [DATASETS.md](DATASETS.md) for dataset setup instructions.

### 2. Configure Experiments

Copy and customize configuration:

```bash
cp config_example.yaml my_experiment_config.yaml
```

### 3. Run First Experiment

```bash
python -m sentryfl.cli train --config my_experiment_config.yaml --data-path ./data/SMD
```

## Getting Help

- **Documentation**: See [README.md](README.md) and other docs
- **Issues**: https://github.com/your-org/SentryFL/issues
- **Discussions**: https://github.com/your-org/SentryFL/discussions

## Version History

- **v1.0.0** (2024): Initial release with DP-SGD, MIA, quantization, and communication scaling

---

For troubleshooting specific errors during execution, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
