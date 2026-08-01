# SentryFL Command-Line Interface (CLI) Usage Guide

This guide provides comprehensive documentation for using the SentryFL command-line interface for federated learning experiments.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [train](#train-command)
  - [evaluate](#evaluate-command)
  - [ablation](#ablation-command)
  - [baseline](#baseline-command)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Installation

Make sure SentryFL is installed with all dependencies:

```bash
pip install -r requirements.txt
```

## Quick Start

The CLI can be invoked using either:

```bash
python -m sentryfl.cli <command> [options]
# or
python -m sentryfl <command> [options]
```

To see all available commands:

```bash
python -m sentryfl.cli --help
```

To see help for a specific command:

```bash
python -m sentryfl.cli train --help
```

## Commands

### train Command

Train a federated anomaly detection model with differential privacy.

**Usage:**
```bash
python -m sentryfl.cli train --config <config_file> --data-path <data_directory> [options]
```

**Required Arguments:**
- `--config, -c`: Path to YAML configuration file
- `--data-path, -d`: Path to dataset directory (SMD or NSL-KDD)

**Optional Arguments:**
- `--device`: Device for training (`cpu` or `cuda`, default: auto-detect)
- `--resume-from`: Resume training from checkpoint path
- `--override, -o`: Override configuration values (format: `key=value`)

**Examples:**

```bash
# Basic training
python -m sentryfl.cli train --config config_example.yaml --data-path ./data/SMD

# Training with GPU
python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD --device cuda

# Training with configuration overrides
python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD \
    --override privacy.epsilon=0.5 training.num_rounds=50 training.learning_rate=0.0001

# Resume training from checkpoint
python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD \
    --resume-from ./experiments/smd_dp/checkpoints/round_30.pt
```

**What it does:**
1. Loads configuration from YAML file
2. Applies command-line overrides if specified
3. Sets up data loaders and preprocessing
4. Initializes federated clients and aggregation server
5. Configures differential privacy and ADMS modules
6. Executes federated training rounds
7. Saves checkpoints and logs metrics
8. Performs final evaluation and exports results

### evaluate Command

Evaluate a trained model on test data.

**Usage:**
```bash
python -m sentryfl.cli evaluate --model-path <model_file> --config <config_file> --data-path <data_directory> [options]
```

**Required Arguments:**
- `--model-path, -m`: Path to trained model file (.pt or .pth)
- `--config, -c`: Path to YAML configuration file
- `--data-path, -d`: Path to dataset directory

**Optional Arguments:**
- `--device`: Device for evaluation (`cpu` or `cuda`, default: auto-detect)
- `--output`: Path to save evaluation results (JSON format)
- `--override, -o`: Override configuration values

**Examples:**

```bash
# Basic evaluation
python -m sentryfl.cli evaluate \
    --model-path ./experiments/smd_dp/global_model_final.pt \
    --config config_example.yaml \
    --data-path ./data/SMD

# Evaluation with results export
python -m sentryfl.cli evaluate \
    --model-path ./models/global_model.pt \
    --config config.yaml \
    --data-path ./data/SMD \
    --output ./results/evaluation_metrics.json

# CPU-only evaluation (for edge deployment testing)
python -m sentryfl.cli evaluate \
    --model-path ./models/quantized_model.pt \
    --config config.yaml \
    --data-path ./data/NSL-KDD \
    --device cpu
```

**Output:**
- Prints evaluation metrics (Precision, Recall, F1, AUC-ROC, AUC-PR, Accuracy, Latency)
- Saves results to JSON file if `--output` is specified
- Generates ROC and PR curve plots if `evaluation.save_plots` is enabled in config

### ablation Command

Run ablation study to measure individual component contributions.

**Usage:**
```bash
python -m sentryfl.cli ablation --config <config_file> --data-path <data_directory> [options]
```

**Required Arguments:**
- `--config, -c`: Path to YAML configuration file
- `--data-path, -d`: Path to dataset directory

**Optional Arguments:**
- `--components`: Components to ablate (choices: `adms`, `dp`, `quantization`, `distillation`, `byzantine`; default: all)
- `--device`: Device for training (`cpu` or `cuda`, default: auto-detect)
- `--num-rounds`: Override number of training rounds for faster ablation
- `--output`: Path to save ablation results (JSON format)
- `--override, -o`: Override configuration values

**Examples:**

```bash
# Ablate all components
python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD \
    --output ./results/ablation_all.json

# Ablate specific components
python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD \
    --components adms dp --output ./results/ablation_privacy_efficiency.json

# Fast ablation study (reduced rounds)
python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD \
    --num-rounds 20 --output ./results/ablation_fast.json
```

**What it does:**
1. Runs full system as baseline
2. For each specified component:
   - Disables the component
   - Trains model with remaining components
   - Evaluates performance
3. Generates comparison tables and plots
4. Measures performance degradation when components are removed

**Components:**
- `adms`: Anomaly-Driven Mask Selection (parameter efficiency)
- `dp`: Differential Privacy (DP-SGD)
- `quantization`: INT8 post-training quantization
- `distillation`: Knowledge distillation for model compression
- `byzantine`: Byzantine-robust aggregation (Trimmed Mean)

### baseline Command

Run baseline model comparisons.

**Usage:**
```bash
python -m sentryfl.cli baseline --config <config_file> --data-path <data_directory> [options]
```

**Required Arguments:**
- `--config, -c`: Path to YAML configuration file
- `--data-path, -d`: Path to dataset directory

**Optional Arguments:**
- `--baselines`: Baselines to run (choices: `pefad`, `centralized`, `local`, `fedavg`; default: all)
- `--device`: Device for training (`cpu` or `cuda`, default: auto-detect)
- `--num-rounds`: Override number of training rounds
- `--output`: Path to save baseline results (JSON format)
- `--override, -o`: Override configuration values

**Examples:**

```bash
# Compare all baselines
python -m sentryfl.cli baseline --config config.yaml --data-path ./data/SMD \
    --output ./results/baseline_comparison.json

# Compare specific baselines
python -m sentryfl.cli baseline --config config.yaml --data-path ./data/SMD \
    --baselines pefad centralized --output ./results/baseline_selected.json

# Fast baseline comparison
python -m sentryfl.cli baseline --config config.yaml --data-path ./data/NSL-KDD \
    --num-rounds 30 --output ./results/baseline_nslkdd.json
```

**Baselines:**
- `pefad`: Original PeFAD framework (without SentryFL extensions)
- `centralized`: Centralized training (all data in one location, no federation)
- `local`: Local-only training (no federated aggregation, per-client models)
- `fedavg`: Standard FedAvg (federated averaging without parameter efficiency)

## Configuration

The CLI uses YAML configuration files to specify experiment parameters. See `config_example.yaml` for a complete template.

### Configuration Structure

```yaml
experiment:
  name: "experiment_name"
  output_dir: "./experiments/output"
  checkpoint_interval: 10
  log_interval: 1
  seed: 42

data:
  dataset: "SMD"  # or "NSL-KDD"
  window_size: 100
  stride: 1
  normalize: true

training:
  num_rounds: 100
  local_epochs: 5
  batch_size: 32
  learning_rate: 0.001

federated:
  num_clients: 10
  clients_per_round: 5
  partition_strategy: "iid"  # or "non_iid"
  byzantine_robust: false

privacy:
  enabled: true
  epsilon: 1.0
  delta: 1e-5
  max_grad_norm: 1.0

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05

evaluation:
  metrics: ["f1", "auc_roc", "auc_pr"]
  save_plots: true
```

### Command-Line Overrides

You can override any configuration value from the command line using dot notation:

```bash
# Override single value
--override privacy.epsilon=0.5

# Override multiple values
--override privacy.epsilon=0.5 training.num_rounds=50 training.batch_size=64

# Override nested values
--override parameter_efficiency.selection_ratio=0.1 federated.num_clients=20
```

**Type Conversion:**
- Integers: `training.num_rounds=50`
- Floats: `privacy.epsilon=0.5`
- Booleans: `privacy.enabled=true` or `privacy.enabled=false`
- Strings: `data.dataset=NSL-KDD`

## Examples

### Complete Training Workflow

```bash
# 1. Train model with differential privacy
python -m sentryfl.cli train \
    --config config.yaml \
    --data-path ./data/SMD \
    --override privacy.epsilon=1.0 training.num_rounds=100

# 2. Evaluate trained model
python -m sentryfl.cli evaluate \
    --model-path ./experiments/smd_dp/global_model_final.pt \
    --config config.yaml \
    --data-path ./data/SMD \
    --output ./results/evaluation.json

# 3. Run ablation study
python -m sentryfl.cli ablation \
    --config config.yaml \
    --data-path ./data/SMD \
    --output ./results/ablation.json

# 4. Compare against baselines
python -m sentryfl.cli baseline \
    --config config.yaml \
    --data-path ./data/SMD \
    --output ./results/baseline.json
```

### Privacy Budget Experiment

```bash
# Train with different epsilon values
for epsilon in 0.1 0.5 1.0 5.0 10.0; do
    python -m sentryfl.cli train \
        --config config.yaml \
        --data-path ./data/SMD \
        --override privacy.epsilon=$epsilon \
                    experiment.name="smd_epsilon_$epsilon" \
                    experiment.output_dir="./experiments/epsilon_$epsilon"
done
```

### Communication Efficiency Experiment

```bash
# Test different selection ratios
for ratio in 0.01 0.05 0.10 0.20; do
    python -m sentryfl.cli train \
        --config config.yaml \
        --data-path ./data/SMD \
        --override parameter_efficiency.selection_ratio=$ratio \
                    experiment.name="smd_ratio_$ratio"
done
```

### Edge Deployment Workflow

```bash
# 1. Train full model
python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD

# 2. Apply quantization and distillation (via ablation with only these enabled)
python -m sentryfl.cli ablation \
    --config config.yaml \
    --data-path ./data/SMD \
    --components quantization distillation

# 3. Evaluate on CPU (simulating edge device)
python -m sentryfl.cli evaluate \
    --model-path ./models/quantized_model.pt \
    --config config.yaml \
    --data-path ./data/SMD \
    --device cpu \
    --output ./results/edge_evaluation.json
```

## Troubleshooting

### Common Issues

**Issue: "Data path does not exist"**
```
Solution: Ensure the dataset directory exists and contains the required files:
- SMD: train.txt, test.txt, test_label.txt
- NSL-KDD: KDDTrain+.txt, KDDTest+.txt
```

**Issue: "Unknown dataset"**
```
Solution: Check that data.dataset in config.yaml is either "SMD" or "NSL-KDD"
```

**Issue: "CUDA out of memory"**
```
Solution: Reduce batch_size or use CPU:
--override training.batch_size=16 --device cpu
```

**Issue: "Privacy budget exhausted"**
```
Solution: Increase epsilon or reduce num_rounds:
--override privacy.epsilon=5.0 training.num_rounds=50
```

**Issue: "Model file not found for evaluation"**
```
Solution: Check model path and ensure training completed:
--model-path ./experiments/<experiment_name>/checkpoints/global_model_final.pt
```

### Getting Help

For command-specific help:
```bash
python -m sentryfl.cli <command> --help
```

For general help:
```bash
python -m sentryfl.cli --help
```

## Advanced Usage

### Scripting and Automation

Create a shell script for batch experiments:

```bash
#!/bin/bash
# run_experiments.sh

CONFIG="config.yaml"
DATA_PATH="./data/SMD"

# Experiment 1: Baseline (no privacy)
python -m sentryfl.cli train \
    --config $CONFIG \
    --data-path $DATA_PATH \
    --override privacy.enabled=false \
               experiment.name="baseline_no_privacy"

# Experiment 2: With DP
python -m sentryfl.cli train \
    --config $CONFIG \
    --data-path $DATA_PATH \
    --override privacy.enabled=true \
               privacy.epsilon=1.0 \
               experiment.name="with_dp_epsilon_1"

# Experiment 3: With DP and reduced parameter efficiency
python -m sentryfl.cli train \
    --config $CONFIG \
    --data-path $DATA_PATH \
    --override privacy.enabled=true \
               parameter_efficiency.selection_ratio=0.01 \
               experiment.name="dp_1percent_params"
```

### Integration with Experiment Tracking

The CLI automatically integrates with TensorBoard. To view training progress:

```bash
tensorboard --logdir ./experiments/smd_dp/logs
```

## Requirements Validation

This CLI implementation validates the following requirements:

- **Requirement 14.4**: Configuration file argument support
- **Requirement 14.8**: Command-line configuration overrides
- **Requirement 20.4**: Command-line interface with help documentation

For more information, refer to the SentryFL documentation and design specifications.
