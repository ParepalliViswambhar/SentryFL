# Ablation Study and Baseline Comparison Guide

This guide explains how to use the ablation study and baseline comparison infrastructure in SentryFL.

## Overview

The ablation study and baseline comparison modules provide comprehensive infrastructure for:

1. **Ablation Studies**: Measure individual component contributions by selectively disabling components
2. **Baseline Comparisons**: Compare SentryFL against standard baseline models
3. **Statistical Significance Testing**: Validate research contributions quantitatively

## Ablation Studies

### Purpose

Ablation studies help answer: "What is the contribution of each component to overall performance?"

### Supported Ablations

1. **Without ADMS**: Full model training (no parameter efficiency)
2. **Without DP**: No differential privacy
3. **Without Knowledge Distillation**: No model compression
4. **Without Quantization**: No INT8 quantization
5. **FedAvg Only**: No Byzantine robustness

### Usage Example

```python
from sentryfl.utils.config import ConfigurationSystem
from sentryfl.evaluation.ablation_study import AblationStudyRunner

# Load full system configuration
config = ConfigurationSystem.from_yaml('config_full_system.yaml')

# Initialize ablation runner
runner = AblationStudyRunner(
    full_system_config=config.to_dict(),
    output_dir='./ablation_results'
)

# Define your training and evaluation functions
def train_federated_model(config, **kwargs):
    """
    Your training function that takes a config and returns:
    - trained_model: The trained PyTorch model
    - training_info: Dict with keys:
        - communication_cost_mb: Total MB transferred
        - model_size_mb: Model size in MB
        - privacy_epsilon: Privacy budget consumed (if DP enabled)
    """
    # ... training code ...
    return trained_model, training_info

def evaluate_model(model):
    """
    Your evaluation function that takes a model and returns:
    - metrics: Dict with keys:
        - f1, auc_roc, auc_pr, precision, recall
        - inference_latency_ms
    """
    # ... evaluation code ...
    return metrics

# Run all ablation studies
results = runner.run_all_ablations(
    train_fn=train_federated_model,
    evaluate_fn=evaluate_model
)

# Generate comparison table
comparison_table = runner.generate_comparison_table()
print(comparison_table)

# Compute component contributions
contributions = runner.compute_component_contributions()

# Example output:
# ADMS:
#   f1_contribution: +0.05 (5% improvement)
#   communication_savings: 150.0 MB (75% reduction)
```

### Output Files

The ablation runner creates the following files:

```
ablation_results/
├── full_system_config.json          # Full system configuration
├── without_adms_config.json         # Ablation configurations
├── without_dp_config.json
├── ...
├── full_system_results.json         # Results for each ablation
├── without_adms_results.json
├── ...
├── ablation_comparison_table.csv    # Comparison table
├── component_contributions.json     # Component-wise contributions
└── all_ablation_results.json       # All results in one file
```

## Baseline Comparisons

### Purpose

Baseline comparisons help answer: "How does SentryFL perform compared to standard approaches?"

### Supported Baselines

1. **PeFAD**: Original parameter-efficient federated learning (without DP/Byzantine robustness)
2. **Centralized**: All data in one location (no federation)
3. **Local-only**: Each client trains independently (no aggregation)
4. **FedAvg**: Standard federated averaging (no parameter efficiency)

### Usage Example

```python
from sentryfl.utils.config import ConfigurationSystem
from sentryfl.evaluation.baseline_models import BaselineModelRunner

# Load base configuration
config = ConfigurationSystem.from_yaml('config.yaml')

# Load test dataset (same for all baselines and SentryFL)
test_data = load_test_dataset()

# Initialize baseline runner
runner = BaselineModelRunner(
    base_config=config.to_dict(),
    test_data=test_data,
    output_dir='./baseline_results'
)

# Run all baselines
baseline_results = runner.run_all_baselines(
    train_fn=train_model,
    evaluate_fn=evaluate_model
)

# Train SentryFL for comparison
sentryfl_model, sentryfl_info = train_sentryfl(config)
sentryfl_metrics = evaluate_model(sentryfl_model, test_data)

# Create SentryFL results object
from sentryfl.evaluation.baseline_models import BaselineResults
sentryfl_results = BaselineResults(
    baseline_name='sentryfl',
    f1_score=sentryfl_metrics['f1'],
    auc_roc=sentryfl_metrics['auc_roc'],
    # ... other metrics ...
)

# Generate comparison table with statistical significance
comparison_table = runner.generate_comparison_table(
    baseline_results=baseline_results,
    sentryfl_results=sentryfl_results
)

# Compare communication costs (federated baselines only)
comm_comparison = runner.compare_communication_costs(
    baseline_results=baseline_results,
    sentryfl_results=sentryfl_results
)

# Compare privacy leakage (privacy-preserving baselines)
privacy_comparison = runner.compare_privacy_leakage(
    baseline_results=baseline_results,
    sentryfl_results=sentryfl_results
)
```

### Statistical Significance Testing

```python
# Run multiple experiments (e.g., with different seeds)
sentryfl_scores = []
baseline_scores = []

for seed in [42, 123, 456, 789, 1011]:
    # Train and evaluate with different seeds
    sentryfl_f1 = train_and_evaluate(config, seed)
    baseline_f1 = train_and_evaluate(baseline_config, seed)
    
    sentryfl_scores.append(sentryfl_f1)
    baseline_scores.append(baseline_f1)

# Compute statistical significance
statistic, p_value, is_significant = runner.compute_statistical_significance(
    sentryfl_scores=sentryfl_scores,
    baseline_scores=baseline_scores,
    test_name='t-test'  # or 'wilcoxon' for non-parametric test
)

print(f"Statistical test: p-value = {p_value:.4f}")
print(f"Significant at α=0.05: {is_significant}")
```

### Output Files

```
baseline_results/
├── pefad_config.json                    # Baseline configurations
├── centralized_config.json
├── ...
├── pefad_results.json                   # Results for each baseline
├── centralized_results.json
├── ...
├── baseline_comparison_table.csv        # Comparison table
├── communication_cost_comparison.json   # Communication costs
├── privacy_leakage_comparison.json      # Privacy leakage (MIA)
└── all_baseline_results.json           # All results in one file
```

## Integration with Training Pipeline

### Complete Example

```python
import torch
from sentryfl.utils.config import ConfigurationSystem
from sentryfl.evaluation.ablation_study import AblationStudyRunner
from sentryfl.evaluation.baseline_models import BaselineModelRunner

# 1. Load configuration
config = ConfigurationSystem.from_yaml('config.yaml')

# 2. Prepare test data (same for all experiments)
from sentryfl.data.dataset_loader import SMDDatasetLoader
from sentryfl.data.preprocessor import TimeSeriesPreprocessor

loader = SMDDatasetLoader('machine-1-1')
data = loader.load_data('./data/SMD')

preprocessor = TimeSeriesPreprocessor(window_size=100, stride=1)
preprocessed_data = preprocessor.fit_transform(data['test'])
test_data, test_labels = preprocessor.create_windows(preprocessed_data, data['test_labels'])

# 3. Define training and evaluation functions
def train_model(config, **kwargs):
    # Initialize model, clients, server
    # Run federated training
    # Return trained model and training info
    return model, training_info

def evaluate_model(model, test_data=None):
    # Evaluate on test set
    # Return metrics dict
    return metrics

# 4. Run ablation studies
print("Running ablation studies...")
ablation_runner = AblationStudyRunner(
    full_system_config=config.to_dict(),
    output_dir='./results/ablation'
)

ablation_results = ablation_runner.run_all_ablations(
    train_fn=train_model,
    evaluate_fn=evaluate_model
)

ablation_table = ablation_runner.generate_comparison_table()
contributions = ablation_runner.compute_component_contributions()

# 5. Run baseline comparisons
print("Running baseline comparisons...")
baseline_runner = BaselineModelRunner(
    base_config=config.to_dict(),
    test_data=(test_data, test_labels),
    output_dir='./results/baselines'
)

baseline_results = baseline_runner.run_all_baselines(
    train_fn=train_model,
    evaluate_fn=lambda m: evaluate_model(m, (test_data, test_labels))
)

# Get SentryFL results from ablation (full_system)
sentryfl_results = next(r for r in ablation_results if r.config_name == 'full_system')

baseline_table = baseline_runner.generate_comparison_table(
    baseline_results=baseline_results,
    sentryfl_results=sentryfl_results
)

# 6. Save all results
ablation_runner.save_all_results()
baseline_runner.save_all_results()

print("All experiments complete!")
print(f"Ablation results: ./results/ablation/")
print(f"Baseline results: ./results/baselines/")
```

## Configuration Guidelines

### For Ablation Studies

Start with your full SentryFL configuration (all components enabled):

```yaml
# config_full_system.yaml
parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05

privacy:
  enabled: true
  epsilon: 1.0
  delta: 1e-5

optimization:
  knowledge_distillation_enabled: true
  quantization_enabled: true

federated:
  byzantine_robust: true
  aggregation: 'trimmed_mean'
```

The ablation runner will automatically create configurations with components disabled.

### For Baseline Comparisons

Use a minimal base configuration:

```yaml
# config_base.yaml
model:
  hidden_dim: 768

training:
  num_rounds: 100
  batch_size: 32

federated:
  num_clients: 10
  clients_per_round: 5

data:
  dataset: 'SMD'
  window_size: 100
```

The baseline runner will configure each baseline appropriately.

## Best Practices

1. **Use Identical Test Sets**: Always evaluate all configurations on the same test data
2. **Multiple Runs**: Run each configuration multiple times with different seeds for statistical significance
3. **Fair Comparison**: Ensure baselines use the same model architecture and hyperparameters
4. **Log Everything**: The runners automatically log configurations and results to JSON files
5. **Verify Results**: Check that ablation degradations make sense (removing components should generally hurt performance)

## Troubleshooting

### Issue: Ablation shows no difference

**Possible causes:**
- Component may not be critical for your dataset
- Training may not have converged
- Configuration may not be applying correctly

**Solution:** Check saved configuration files to verify components are actually disabled.

### Issue: Statistical test shows no significance

**Possible causes:**
- Sample size too small (need at least 5 runs)
- High variance between runs
- Actual difference may be small

**Solution:** Increase number of runs or use Wilcoxon test instead of t-test.

### Issue: Baseline comparison looks wrong

**Possible causes:**
- Test sets may differ across baselines
- Baselines may use different hyperparameters

**Solution:** Verify all baselines use the same test_data object and review saved baseline configurations.

## Requirements Satisfied

This implementation satisfies the following requirements:

**Ablation Studies (Requirement 16):**
- 16.1: Training without ADMS
- 16.2: Training without DP
- 16.3: Training without Knowledge Distillation
- 16.4: Training without Quantization
- 16.5: FedAvg only (no Byzantine robustness)
- 16.6: Ablation configuration logging
- 16.7: Ablation vs full system comparison
- 16.8: Ablation comparison tables

**Baseline Comparisons (Requirement 17):**
- 17.1: PeFAD baseline
- 17.2: Centralized baseline
- 17.3: Local-only baseline
- 17.4: FedAvg baseline
- 17.5: Identical test set evaluation
- 17.6: Anomaly detection metric comparison
- 17.7: Communication cost comparison
- 17.8: Privacy leakage comparison
- 17.9: Baseline comparison tables and plots
- 17.10: Statistical significance testing

## References

- Task 21 in tasks.md
- Design document sections on ablation studies and baselines
- Requirements 16 and 17 in requirements.md
