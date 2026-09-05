# SentryFL Hyperparameter Tuning Guide

This guide provides comprehensive recommendations for tuning SentryFL hyperparameters across different deployment scenarios and research objectives.

## Table of Contents

- [Quick Start Configurations](#quick-start-configurations)
- [Model Hyperparameters](#model-hyperparameters)
- [Training Hyperparameters](#training-hyperparameters)
- [Federated Learning Hyperparameters](#federated-learning-hyperparameters)
- [Privacy Hyperparameters](#privacy-hyperparameters)
- [Parameter Efficiency Hyperparameters](#parameter-efficiency-hyperparameters)
- [Optimization Hyperparameters](#optimization-hyperparameters)
- [Tuning Strategies](#tuning-strategies)
- [Common Scenarios](#common-scenarios)

## Quick Start Configurations

### High Privacy Configuration

For maximum privacy guarantees (ε = 0.1):

```yaml
privacy:
  enabled: true
  epsilon: 0.1
  delta: 1e-5
  max_grad_norm: 0.5

training:
  batch_size: 256  # Larger batch for better privacy
  learning_rate: 0.0001  # Lower LR with strong clipping

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.01  # 1% for minimal information leakage
```

### Balanced Configuration

For good privacy-utility tradeoff (ε = 1.0):

```yaml
privacy:
  enabled: true
  epsilon: 1.0
  delta: 1e-5
  max_grad_norm: 1.0

training:
  batch_size: 64
  learning_rate: 0.001

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05  # 5% of parameters
```

### High Performance Configuration

For maximum accuracy (no privacy):

```yaml
privacy:
  enabled: false

training:
  batch_size: 32
  learning_rate: 0.001
  num_rounds: 200

parameter_efficiency:
  adms_enabled: false  # Train full model
```

### Edge Deployment Configuration

For resource-constrained devices:

```yaml
optimization:
  quantization_enabled: true
  quantization_dtype: "int8"
  knowledge_distillation_enabled: true

model:
  backbone: "distilbert-base-uncased"  # Smaller model
  hidden_dim: 384

training:
  batch_size: 16
```

## Model Hyperparameters

### backbone

Pre-trained language model architecture.

**Options**:
- `"bert-base-uncased"` (110M params, 768 hidden)
- `"bert-large-uncased"` (340M params, 1024 hidden)
- `"distilbert-base-uncased"` (66M params, 768 hidden, 40% faster)
- `"gpt2"` (117M params, 768 hidden)
- `"gpt2-medium"` (345M params, 1024 hidden)

**Recommended**:
- **Default**: `"bert-base-uncased"` (good balance)
- **High accuracy**: `"bert-large-uncased"` (requires 12GB+ GPU)
- **Fast training**: `"distilbert-base-uncased"` (2x faster)
- **Edge deployment**: `"distilbert-base-uncased"` (smaller footprint)

**Trade-offs**:
- Larger models: Better accuracy, slower training, more memory
- Smaller models: Faster inference, easier deployment, slightly lower accuracy

### hidden_dim

Dimension of model hidden states.

**Range**: 128 - 1024

**Recommended**:
- BERT-base: `768`
- BERT-large: `1024`
- DistilBERT: `384` or `768`

**Tuning**:
- Match backbone hidden dimension for compatibility
- Smaller values (384) for edge deployment
- Larger values (1024) for complex datasets

### freeze_backbone

Whether to freeze PLM weights during training.

**Options**: `true` / `false`

**Recommended**:
- **false** (default): Full fine-tuning for best accuracy
- **true**: Feature extraction only (faster, less overfitting)

**Use Cases**:
- `true` when:
  - Limited training data
  - Fast experimentation needed
  - Transfer learning from similar domain
- `false` when:
  - Sufficient training data available
  - Domain differs significantly from pre-training
  - Maximum accuracy required

### dropout

Dropout rate for regularization.

**Range**: 0.0 - 0.5

**Recommended**: `0.1`

**Tuning**:
- Increase (0.2-0.3) if overfitting observed
- Decrease (0.05) if underfitting
- Set to 0.0 for edge deployment (no dropout at inference)

## Training Hyperparameters

### num_rounds

Number of federated training rounds.

**Range**: 10 - 500

**Recommended**:
- Fast experiments: `20-50`
- Standard training: `100-150`
- High accuracy: `200-300`

**Tuning**:
- Monitor convergence on validation set
- Stop early if loss plateaus
- More rounds needed with:
  - Higher privacy (lower ε)
  - More clients
  - Non-IID data distribution

### local_epochs

Number of local training epochs per round.

**Range**: 1 - 20

**Recommended**: `5`

**Tuning**:
- **1-3**: Fast communication, less local overfitting
- **5-10**: Balanced (standard)
- **10-20**: Fewer communication rounds, risk of local drift

**Trade-offs**:
- More epochs: Fewer rounds needed, but risk of client model drift
- Fewer epochs: More communication, but better global convergence

### batch_size

Mini-batch size for training.

**Range**: 8 - 512

**Recommended**:
- GPU (8GB): `32-64`
- GPU (16GB+): `64-128`
- CPU: `16-32`
- With DP: `64-256` (larger for better privacy)

**Tuning**:
- Limited memory: Reduce batch size, increase `gradient_accumulation_steps`
- Differential privacy: Larger batch sizes (64-256) reduce privacy cost
- Edge devices: Smaller batch sizes (8-16)

**Memory Estimation**:
```
GPU Memory (GB) ≈ (batch_size × window_size × hidden_dim × 4) / 1e9 × 3
```

Example: batch_size=32, window_size=100, hidden_dim=768
```
GPU Memory ≈ (32 × 100 × 768 × 4) / 1e9 × 3 ≈ 3GB
```

### learning_rate

Learning rate for optimizer.

**Range**: 1e-5 - 1e-2

**Recommended**:
- **No DP**: `1e-3` (0.001)
- **With DP**: `1e-4` (0.0001)
- **Fine-tuning only head**: `1e-3`
- **Full fine-tuning**: `5e-5` - `1e-4`

**Tuning**:
- Start with `1e-3`
- Reduce by 10x if loss diverges
- Increase by 2-3x if convergence too slow
- Use learning rate scheduler (see below)

### optimizer

Optimization algorithm.

**Options**: `"adam"`, `"adamw"`, `"sgd"`

**Recommended**:
- **"adam"** (default): Fast convergence, good default
- **"adamw"**: Better weight decay, slightly better generalization
- **"sgd"**: More stable with DP, but slower convergence

### weight_decay

L2 regularization strength.

**Range**: 0.0 - 0.1

**Recommended**: `0.0001` (1e-4)

**Tuning**:
- Increase (1e-3) if overfitting
- Decrease (1e-5) if underfitting
- Set to 0.0 for small datasets

### gradient_accumulation_steps

Number of steps to accumulate gradients before update.

**Range**: 1 - 32

**Recommended**: `1` (no accumulation)

**Use Cases**:
- Limited GPU memory: Accumulate over 4-8 steps to simulate larger batch
- Differential privacy: Accumulate to increase effective batch size

**Effective batch size** = `batch_size × gradient_accumulation_steps`

## Federated Learning Hyperparameters

### num_clients

Total number of federated clients.

**Range**: 2 - 500

**Recommended**:
- Development: `5-10`
- Standard experiments: `10-20`
- Scalability evaluation: `50, 100, 500`

**Considerations**:
- More clients: More realistic, but slower convergence
- Fewer clients: Faster experiments, less federated

### clients_per_round

Number of clients participating in each round.

**Range**: 1 - num_clients

**Recommended**: `0.5 × num_clients` (50% participation)

**Tuning**:
- High participation (80-100%): Faster convergence, higher communication cost
- Low participation (10-30%): Slower convergence, lower communication cost
- Typical: 30-50% participation

### partition_strategy

Data distribution across clients.

**Options**: `"iid"`, `"non_iid"`

**Recommended**:
- **"iid"**: Each client has similar data distribution (easier problem)
- **"non_iid"**: Each client has different distribution (realistic scenario)

**Use Cases**:
- IID: Baseline experiments, development
- Non-IID: Realistic federated settings, robustness evaluation

### non_iid_alpha

Dirichlet distribution parameter for non-IID partitioning.

**Range**: 0.01 - 100

**Recommended**: `0.5`

**Tuning**:
- **0.01-0.1**: Highly non-IID (each client has 1-2 classes)
- **0.5-1.0**: Moderately non-IID (realistic)
- **10-100**: Nearly IID

### aggregation

Aggregation method for combining client updates.

**Options**: `"fedavg"`, `"trimmed_mean"`

**Recommended**:
- **"fedavg"**: Standard federated averaging
- **"trimmed_mean"**: Byzantine-robust (with malicious clients)

### byzantine_robust

Enable Byzantine robustness.

**Options**: `true` / `false`

**Recommended**: `false` (unless adversarial setting)

**Use Cases**:
- `true` when:
  - Malicious clients expected
  - Adversarial robustness evaluation
  - Security-critical applications

### trimmed_mean_fraction

Fraction of clients to trim from each end.

**Range**: 0.0 - 0.5

**Recommended**: `0.1` (trim 10% from each end)

**Tuning**:
- More malicious clients: Increase to 0.2-0.3
- Fewer malicious clients: Decrease to 0.05-0.1
- No malicious clients: Set to 0.0 (equivalent to FedAvg)

## Privacy Hyperparameters

### epsilon (ε)

Privacy budget (lower = stronger privacy).

**Range**: 0.1 - 10.0

**Recommended**:
- **Strong privacy**: `0.1 - 0.5`
- **Moderate privacy**: `1.0 - 3.0`
- **Weak privacy**: `5.0 - 10.0`

**Privacy Levels**:
- ε < 1: Strong privacy, significant utility loss
- ε = 1: Standard privacy, moderate utility loss
- ε > 5: Weak privacy, minimal utility loss
- ε = 10: Very weak privacy, negligible utility loss

**Tuning**:
- Start with ε = 1.0
- Decrease if privacy is critical
- Increase if accuracy is too low

**Trade-offs**:
- Lower ε: Stronger privacy guarantees, lower accuracy, more noise
- Higher ε: Weaker privacy, higher accuracy, less noise

### delta (δ)

Probability of privacy failure.

**Range**: 1e-7 - 1e-3

**Recommended**: `1e-5`

**Standard Values**:
- Small dataset (N < 10,000): `1e-4`
- Medium dataset (N = 10,000-100,000): `1e-5`
- Large dataset (N > 100,000): `1e-6` or `1e-7`

**Rule**: δ should be < 1/N where N is dataset size

### max_grad_norm

Maximum L2 norm for gradient clipping.

**Range**: 0.1 - 10.0

**Recommended**:
- **Strong clipping**: `0.5` (high privacy, ε < 1)
- **Moderate clipping**: `1.0` (standard, ε = 1-3)
- **Weak clipping**: `5.0` (low privacy, ε > 5)

**Tuning**:
- Too low (<0.5): Over-clipping, slow convergence
- Too high (>5.0): Under-clipping, weak privacy
- Monitor clipped gradient fraction:
  - Target: 20-50% of gradients clipped
  - <10% clipped: Increase max_grad_norm
  - >80% clipped: Decrease max_grad_norm

### noise_multiplier

Scale of Gaussian noise added to gradients.

**Range**: 0.1 - 10.0

**Recommended**: `null` (auto-compute from ε and δ)

**Manual Tuning** (advanced):
- Higher noise: Stronger privacy, lower accuracy
- Lower noise: Weaker privacy, higher accuracy
- Relationship: noise = max_grad_norm × noise_multiplier / batch_size^0.5

## Parameter Efficiency Hyperparameters

### adms_enabled

Enable Anomaly-Driven Mask Selection.

**Options**: `true` / `false`

**Recommended**: `true`

**Benefits**:
- 90%+ communication reduction
- Faster convergence
- Better privacy (fewer parameters updated)

**Use Cases**:
- Disable (`false`) for baseline comparisons
- Enable (`true`) for production deployments

### selection_ratio

Fraction of parameters selected by ADMS.

**Range**: 0.01 - 0.20

**Recommended**: `0.05` (5% of parameters)

**Tuning**:
- **0.01 (1%)**: Maximum communication efficiency, slight accuracy loss
- **0.05 (5%)**: Balanced (recommended)
- **0.10 (10%)**: Higher accuracy, more communication
- **0.20 (20%)**: Near full-model performance

**Trade-offs**:
- Lower ratio: Less communication, lower accuracy
- Higher ratio: More communication, higher accuracy

**Communication Savings**:
```
Savings = (1 - selection_ratio) × 100%
```

Example: selection_ratio = 0.05
```
Savings = (1 - 0.05) × 100% = 95%
```

### ppds_enabled

Enable Prior-Prototype Driven Selection.

**Options**: `true` / `false`

**Recommended**: `false` (not implemented in current version)

**Future Use**: Advanced parameter selection based on prior knowledge

## Optimization Hyperparameters

### quantization_enabled

Enable INT8 quantization for edge deployment.

**Options**: `true` / `false`

**Recommended**:
- `true` for edge/CPU deployment
- `false` for GPU training/inference

**Benefits**:
- 4x model size reduction
- 2-4x inference speedup on CPU
- Minimal accuracy loss (<2% typically)

### quantization_dtype

Quantization data type.

**Options**: `"int8"`, `"int16"`

**Recommended**: `"int8"`

**Trade-offs**:
- INT8: Maximum compression, slight accuracy loss
- INT16: Less compression, better accuracy

### knowledge_distillation_enabled

Enable knowledge distillation for model compression.

**Options**: `true` / `false`

**Recommended**: `true` for edge deployment

**Use Cases**:
- Transfer federated model to smaller student model
- Deploy on extremely resource-constrained devices

### distillation_temperature

Temperature for softening teacher predictions.

**Range**: 1.0 - 10.0

**Recommended**: `3.0`

**Tuning**:
- Lower (1.0-2.0): Sharper predictions, less knowledge transfer
- Higher (5.0-10.0): Softer predictions, more knowledge transfer

### distillation_alpha

Weight for distillation loss vs hard label loss.

**Range**: 0.0 - 1.0

**Recommended**: `0.5`

**Tuning**:
- 0.0: Only hard labels (no distillation)
- 0.5: Balanced
- 1.0: Only distillation (no hard labels)

### mixed_precision

Enable FP16 mixed precision training.

**Options**: `true` / `false`

**Recommended**: `true` (if GPU supports FP16)

**Benefits**:
- 2x memory reduction
- 1.5-2x training speedup
- Requires NVIDIA GPU with Tensor Cores (V100, T4, A100, etc.)

## Tuning Strategies

### Grid Search

Systematic exploration of hyperparameter space:

```bash
for epsilon in 0.1 0.5 1.0 5.0 10.0; do
  for selection_ratio in 0.01 0.05 0.10; do
    python -m sentryfl.cli train \
      --config config.yaml \
      --override privacy.epsilon=$epsilon \
                parameter_efficiency.selection_ratio=$selection_ratio \
                experiment.name="grid_eps_${epsilon}_ratio_${selection_ratio}"
  done
done
```

### Random Search

More efficient than grid search:

```python
import random

for trial in range(20):
    epsilon = random.uniform(0.1, 10.0)
    selection_ratio = random.choice([0.01, 0.05, 0.10, 0.20])
    learning_rate = random.choice([1e-4, 5e-4, 1e-3, 5e-3])
    
    # Run training with sampled hyperparameters
    ...
```

### Bayesian Optimization

Use Optuna or similar for efficient search:

```python
import optuna

def objective(trial):
    epsilon = trial.suggest_float("epsilon", 0.1, 10.0, log=True)
    selection_ratio = trial.suggest_float("selection_ratio", 0.01, 0.20)
    learning_rate = trial.suggest_float("learning_rate", 1e-5, 1e-2, log=True)
    
    # Train model and return validation F1 score
    f1 = train_and_evaluate(epsilon, selection_ratio, learning_rate)
    return f1

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=50)
```

### Learning Rate Scheduling

Improve convergence with adaptive learning rate:

```yaml
training:
  learning_rate: 0.001
  lr_scheduler: "cosine"  # Options: "step", "cosine", "exponential"
  lr_warmup_steps: 100
  lr_decay_factor: 0.1
```

## Common Scenarios

### Scenario 1: Limited Computational Resources

```yaml
model:
  backbone: "distilbert-base-uncased"
  hidden_dim: 384

training:
  batch_size: 16
  num_rounds: 50
  local_epochs: 3

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05

optimization:
  mixed_precision: true
```

### Scenario 2: High-Privacy Requirements

```yaml
privacy:
  enabled: true
  epsilon: 0.5
  delta: 1e-5
  max_grad_norm: 0.5

training:
  batch_size: 128  # Larger for better privacy
  learning_rate: 0.0001
  num_rounds: 200  # More rounds with strong DP

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.01  # Minimal parameter updates
```

### Scenario 3: Large-Scale Deployment (500 clients)

```yaml
federated:
  num_clients: 500
  clients_per_round: 50  # 10% participation
  partition_strategy: "non_iid"
  non_iid_alpha: 0.5

training:
  num_rounds: 300  # More rounds for convergence
  local_epochs: 10  # Fewer communication rounds

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05
```

### Scenario 4: Edge Deployment

```yaml
model:
  backbone: "distilbert-base-uncased"

optimization:
  quantization_enabled: true
  quantization_dtype: "int8"
  knowledge_distillation_enabled: true
  distillation_temperature: 3.0
  distillation_alpha: 0.5

training:
  batch_size: 8  # Small batches for limited memory
```

### Scenario 5: Research Experiments (Ablation Study)

```yaml
# Baseline (no privacy, no efficiency)
experiment:
  name: "baseline"

privacy:
  enabled: false

parameter_efficiency:
  adms_enabled: false

---

# With privacy only
experiment:
  name: "with_privacy"

privacy:
  enabled: true
  epsilon: 1.0

parameter_efficiency:
  adms_enabled: false

---

# With efficiency only
experiment:
  name: "with_efficiency"

privacy:
  enabled: false

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05

---

# Full system
experiment:
  name: "full_system"

privacy:
  enabled: true
  epsilon: 1.0

parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05
```

## Hyperparameter Sensitivity Analysis

### High Sensitivity (tune carefully)

1. **learning_rate**: 10x change can break training
2. **epsilon**: Directly controls privacy-utility tradeoff
3. **max_grad_norm**: Critical for DP convergence

### Medium Sensitivity (tune for optimization)

1. **selection_ratio**: Affects communication and accuracy
2. **batch_size**: Impacts memory, privacy, and convergence
3. **num_rounds**: Determines training time and final accuracy

### Low Sensitivity (use defaults)

1. **dropout**: 0.1 works well in most cases
2. **weight_decay**: 1e-4 is standard
3. **distillation_temperature**: 3.0 is reasonable default

## Monitoring and Debugging

### Key Metrics to Monitor

1. **Training loss**: Should decrease steadily
2. **Validation F1**: Should increase, watch for overfitting
3. **Privacy budget (ε)**: Should not exceed target
4. **Gradient clipping rate**: Target 20-50%
5. **Communication cost**: Track bytes per round

### Warning Signs

- **Loss diverges**: Decrease learning_rate by 10x
- **Loss plateaus early**: Increase learning_rate or reduce DP strength
- **High validation loss**: Reduce dropout, increase regularization
- **Privacy budget exhausted**: Increase ε or reduce num_rounds

## Further Resources

- **Opacus Documentation**: https://opacus.ai/
- **Differential Privacy Primer**: https://programming-dp.com/
- **Federated Learning**: McMahan et al., "Communication-Efficient Learning of Deep Networks from Decentralized Data"

---

For troubleshooting specific issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
