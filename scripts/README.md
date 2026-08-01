# SentryFL Reproducibility Scripts

This directory contains scripts for reproducible experiments, including dataset downloading, experiment setup, and result validation.

## Table of Contents

- [Quick Start](#quick-start)
- [Scripts Overview](#scripts-overview)
- [Dataset Download](#dataset-download)
- [Experiment Reproduction](#experiment-reproduction)
- [Testing Reproducibility](#testing-reproducibility)
- [Troubleshooting](#troubleshooting)

## Quick Start

**Complete workflow for reproducing paper results:**

```bash
# 1. Test reproducibility utilities
python scripts/test_reproducibility.py

# 2. Download datasets
python scripts/download_datasets.py --dataset all --output ./data

# 3. Setup all paper experiments
python scripts/reproduce_experiments.py --all

# 4. Run individual experiments
python -m sentryfl.cli train --config ./experiments/smd_baseline/config.yaml
python -m sentryfl.cli train --config ./experiments/smd_dp_adms/config.yaml

# 5. Compare results with expected values
# See EXPECTED_RESULTS.md for reference numbers
```

## Scripts Overview

| Script | Purpose | Requirements |
|--------|---------|--------------|
| `download_datasets.py` | Download SMD and NSL-KDD datasets | Internet connection |
| `reproduce_experiments.py` | Setup all paper experiments | Datasets downloaded |
| `test_reproducibility.py` | Test reproducibility utilities | None (local test) |

## Dataset Download

### download_datasets.py

**Purpose**: Automates downloading and verification of benchmark datasets.

**Usage**:

```bash
# Download all datasets
python scripts/download_datasets.py --dataset all --output ./data

# Download specific dataset
python scripts/download_datasets.py --dataset SMD --output ./data/SMD
python scripts/download_datasets.py --dataset NSL-KDD --output ./data/NSL-KDD

# Force re-download
python scripts/download_datasets.py --dataset all --output ./data --force

# Verify existing datasets
python scripts/download_datasets.py --dataset all --output ./data --verify-only
```

**Parameters**:
- `--dataset`: Dataset to download (`all`, `SMD`, `NSL-KDD`)
- `--output`: Output directory for datasets
- `--force`: Force re-download even if dataset exists
- `--verify-only`: Only verify existing datasets without downloading

**Output**:
```
./data/
├── SMD/
│   ├── machine-1-1/
│   │   ├── train.txt
│   │   ├── test.txt
│   │   └── test_label.txt
│   ├── machine-1-2/
│   └── ...
└── NSL-KDD/
    ├── KDDTrain+.txt
    ├── KDDTest+.txt
    └── KDDTrain+_20Percent.txt
```

**Expected Time**:
- SMD: ~2-5 minutes (140MB)
- NSL-KDD: ~30 seconds (20MB)

**Troubleshooting**:
- If download fails: Check internet connection, try `--force` flag
- If verification fails: Re-download with `--force`
- Manual download: See [DATASETS.md](../DATASETS.md) for manual instructions

---

## Experiment Reproduction

### reproduce_experiments.py

**Purpose**: Setup all paper experiments with proper reproducibility settings.

**Features**:
- Creates experiment configurations for all paper experiments
- Sets random seeds for reproducibility
- Logs system information (hardware, software versions)
- Generates reproducibility reports
- Verifies dataset availability

**Usage**:

```bash
# Setup all paper experiments
python scripts/reproduce_experiments.py --all

# Setup specific experiment
python scripts/reproduce_experiments.py --experiment smd_baseline

# Quick test (reduced epochs)
python scripts/reproduce_experiments.py --all --quick

# Use custom seed
python scripts/reproduce_experiments.py --all --seed 123

# Verify system and datasets only
python scripts/reproduce_experiments.py --verify-only
```

**Parameters**:
- `--all`: Setup all paper experiments
- `--experiment`: Setup specific experiment (see list below)
- `--output-dir`: Base directory for experiments (default: `./experiments`)
- `--seed`: Random seed for reproducibility (default: 42)
- `--quick`: Quick mode (reduced epochs for testing)
- `--verify-only`: Only verify datasets and system info

**Available Experiments**:

1. **smd_baseline**: SMD without DP or ADMS (upper bound)
2. **smd_dp**: SMD with DP only (ε=1.0)
3. **smd_dp_adms**: SMD with DP + ADMS (full SentryFL)
4. **nslkdd_baseline**: NSL-KDD without DP or ADMS
5. **nslkdd_dp_adms**: NSL-KDD with DP + ADMS
6. **privacy_ablation**: Test different epsilon values (0.1, 0.5, 1.0, 5.0, 10.0)
7. **communication_scaling**: Test scalability (5, 20, 50 clients)

**Output Structure**:

```
./experiments/
├── smd_baseline/
│   ├── config.yaml                    # Experiment configuration
│   ├── reproducibility_report.json   # Complete reproducibility info
│   ├── system_info.json              # System details
│   ├── checkpoints/                  # Model checkpoints (after training)
│   └── logs/                         # Training logs (after training)
├── smd_dp/
├── smd_dp_adms/
├── nslkdd_baseline/
├── nslkdd_dp_adms/
├── privacy_ablation/
├── communication_scaling/
└── experiment_summary.json           # Summary of all experiments
```

**Reproducibility Report Contents**:
- System information (Python, PyTorch, CUDA versions)
- Hardware details (CPU, GPU, memory)
- Random seed used
- Full experiment configuration
- Instructions for exact reproduction

**Example Workflow**:

```bash
# 1. Setup all experiments
python scripts/reproduce_experiments.py --all

# 2. Review configurations
cat ./experiments/smd_dp_adms/config.yaml

# 3. Run experiments
python -m sentryfl.cli train --config ./experiments/smd_baseline/config.yaml
python -m sentryfl.cli train --config ./experiments/smd_dp/config.yaml
python -m sentryfl.cli train --config ./experiments/smd_dp_adms/config.yaml

# 4. Compare results
python -m sentryfl.cli compare \
    --experiments smd_baseline smd_dp smd_dp_adms \
    --output ./comparison_report.pdf
```

---

## Testing Reproducibility

### test_reproducibility.py

**Purpose**: Verify that reproducibility utilities work correctly.

**Tests**:
1. **Seed Setting**: Verifies random number generation is reproducible
2. **System Info Logging**: Checks system information capture
3. **Reproducibility Reports**: Validates report generation

**Usage**:

```bash
# Run all tests
python scripts/test_reproducibility.py
```

**Expected Output**:

```
SentryFL Reproducibility Utilities Test Suite
================================================================================
TEST 1: Random Seed Setting
================================================================================
First run (seed=42):
  Python random: [51, 92, 14, 71, 60]
  NumPy random: [ 0.49671415 -0.1382643   0.64768854]
  PyTorch random: tensor([ 0.3367,  0.1288,  0.2345])

Second run (seed=42):
  Python random: [51, 92, 14, 71, 60]
  NumPy random: [ 0.49671415 -0.1382643   0.64768854]
  PyTorch random: tensor([ 0.3367,  0.1288,  0.2345])

Reproducibility check:
  NumPy reproducible: True
  PyTorch reproducible: True
✓ TEST PASSED: Seed setting produces reproducible results

================================================================================
TEST 2: System Information Logging
================================================================================
System Information Captured:
  Python version: {'major': 3, 'minor': 9, 'micro': 7}
  PyTorch version: 2.0.1
  NumPy version: 1.24.3
  CPU cores: 8
  GPU available: True
  OS: Linux
  Random seed: 42

✓ System info saved to: ./test_output/system_info_20240101_120000.json
✓ TEST PASSED: System info file created

================================================================================
TEST 3: Reproducibility Report Generation
================================================================================
✓ Reproducibility report saved to: ./test_output/test_reproducibility_report.json
✓ TEST PASSED: Reproducibility report created

================================================================================
TEST SUMMARY
================================================================================
Tests passed: 3/3

✓ ALL TESTS PASSED

Reproducibility utilities are working correctly!

Next steps:
  1. Use scripts/download_datasets.py to download datasets
  2. Use scripts/reproduce_experiments.py to setup experiments
  3. Review EXPECTED_RESULTS.md for reference performance numbers
```

---

## Reproducibility Checklist

Before running experiments, ensure:

- [ ] Datasets downloaded and verified
- [ ] System information logged
- [ ] Random seed set (default: 42)
- [ ] Correct library versions installed
- [ ] GPU drivers up to date (if using GPU)
- [ ] Sufficient disk space available
- [ ] Reproducibility test passed

**Verify Setup**:

```bash
# Check datasets
python scripts/download_datasets.py --verify-only

# Test reproducibility
python scripts/test_reproducibility.py

# Verify system
python scripts/reproduce_experiments.py --verify-only
```

---

## Integration with Training

The reproducibility utilities are automatically integrated into the training pipeline:

```python
from sentryfl.utils.reproducibility import log_experiment_start

# At start of training
repro_manager = log_experiment_start(
    config=config_dict,
    log_dir='./experiments/my_experiment'
)

# Reproducibility automatically handled:
# - Seeds set for Python, NumPy, PyTorch, CUDA
# - System info logged
# - Reproducibility report generated
```

**Files Generated During Training**:
- `system_info.json`: Hardware and software details
- `reproducibility_report.json`: Complete reproduction instructions
- `config.yaml`: Experiment configuration
- `checkpoints/`: Model checkpoints with metadata

---

## Troubleshooting

### Issue: Results don't match expected values

**Check**:
1. Random seed matches (default: 42)
2. Library versions match (see `system_info.json`)
3. Dataset integrity (run `--verify-only`)
4. Configuration matches paper

**Solution**:
```bash
# Compare your system with expected
python scripts/reproduce_experiments.py --verify-only

# Check library versions
pip list | grep -E "torch|numpy|opacus|transformers"

# Re-download datasets
python scripts/download_datasets.py --dataset all --force
```

### Issue: Scripts fail to run

**Check**:
1. Python version (requires 3.9+)
2. Dependencies installed (`pip install -r requirements.txt`)
3. Permissions (scripts need execute permission)

**Solution**:
```bash
# Make scripts executable
chmod +x scripts/*.py

# Verify Python version
python --version  # Should be 3.9+

# Reinstall dependencies
pip install -r requirements.txt
```

### Issue: GPU not detected

**Check**:
1. CUDA installed
2. PyTorch built with CUDA
3. GPU drivers

**Solution**:
```bash
# Check CUDA
nvidia-smi

# Check PyTorch CUDA
python -c "import torch; print(torch.cuda.is_available())"

# Reinstall PyTorch with CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

---

## Performance Expectations

**Dataset Download**:
- SMD: 2-5 minutes (140MB)
- NSL-KDD: 30 seconds (20MB)

**Experiment Setup**:
- All experiments: < 1 minute
- Single experiment: < 10 seconds

**Training Time** (reference: Tesla P100):
- SMD Baseline (100 rounds): ~45 minutes
- SMD DP+ADMS (100 rounds): ~48 minutes
- NSL-KDD Baseline (50 rounds): ~32 minutes
- NSL-KDD DP+ADMS (50 rounds): ~35 minutes

See [EXPECTED_RESULTS.md](../EXPECTED_RESULTS.md) for detailed performance benchmarks.

---

## Additional Resources

- **EXPECTED_RESULTS.md**: Reference performance numbers and variance
- **DATASETS.md**: Dataset details and manual download instructions
- **HYPERPARAMETERS.md**: Hyperparameter tuning guidelines
- **TROUBLESHOOTING.md**: Common issues and solutions
- **CLI_USAGE.md**: Command-line interface documentation

---

## Citation

If you use these scripts in your research, please cite:

```bibtex
@article{sentryfl2024,
  title={SentryFL: Differentially Private and Communication-Efficient Federated Learning for Time-Series Anomaly Detection},
  author={[Authors]},
  journal={[Journal]},
  year={2024}
}
```

---

**Questions?** Open an issue on GitHub or refer to the documentation.
