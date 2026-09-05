# SentryFL Visualization Dashboard

Comprehensive visualization module for analyzing SentryFL federated learning experiments.

## Overview

The `VisualizationDashboard` provides publication-quality plotting capabilities for:

- **Training Metrics**: Loss curves per client, global model convergence
- **Privacy Evaluation**: Privacy budget consumption, MIA attack success rates
- **Communication Efficiency**: Cost vs client count scaling analysis
- **Model Performance**: ROC curves, PR curves, anomaly detection visualization
- **Model Comparison**: Size and latency comparisons across model variants
- **Ablation Studies**: Component contribution analysis

All plots support vector graphics export (PDF, SVG, EPS) for publication use.

## Installation

The visualization module is included with SentryFL:

```python
from sentryfl.visualization import VisualizationDashboard
```

## Quick Start

```python
import numpy as np
from sentryfl.visualization import VisualizationDashboard

# Initialize dashboard
dashboard = VisualizationDashboard(
    output_dir="results",
    figure_format="png"
)

# Plot training loss per client
client_losses = {
    "client_1": [0.5, 0.4, 0.3, 0.25],
    "client_2": [0.6, 0.5, 0.4, 0.35]
}
dashboard.plot_training_loss_per_client(client_losses)

# Plot ROC curve
fpr = np.array([0.0, 0.1, 0.2, 1.0])
tpr = np.array([0.0, 0.8, 0.95, 1.0])
dashboard.plot_roc_curve(fpr, tpr, auc_score=0.95)
```

## API Reference

### Initialization

```python
VisualizationDashboard(output_dir="visualization_results", figure_format="png")
```

**Parameters:**
- `output_dir` (str): Directory to save plots
- `figure_format` (str): Figure format - 'png', 'pdf', 'svg', or 'eps'

### Training Metrics

#### plot_training_loss_per_client

Plot training loss curves for each federated client.

```python
dashboard.plot_training_loss_per_client(
    client_losses,  # Dict[str, List[float]]
    rounds=None,            # Optional[List[int]]
    title="Training Loss per Client"
)
```

#### plot_global_model_convergence

Plot global model convergence with loss and optionally accuracy.

```python
dashboard.plot_global_model_convergence(
    train_losses,        # List[float]
    val_losses=None,     # Optional[List[float]]
    train_accuracies=None,  # Optional[List[float]]
    val_accuracies=None,    # Optional[List[float]]
    rounds=None,         # Optional[List[int]]
    title="Global Model Convergence"
)
```

### Privacy Metrics

#### plot_privacy_budget_consumption

Plot cumulative privacy budget (epsilon) consumption.

```python
dashboard.plot_privacy_budget_consumption(
    epsilon_values,      # List[float]
    rounds=None,         # Optional[List[int]]
    target_epsilon=None, # Optional[float]
    title="Privacy Budget Consumption"
)
```

#### plot_mia_attack_success_rate

Plot Membership Inference Attack success rate across privacy budgets.

```python
dashboard.plot_mia_attack_success_rate(
    privacy_budgets,         # List[float]
    attack_success_rates,    # List[float]
    baseline_rate=0.5,       # float
    title="MIA Attack Success Rate vs Privacy Budget"
)
```

### Communication Efficiency

#### plot_communication_cost_vs_clients

Plot communication cost as a function of client count.

```python
dashboard.plot_communication_cost_vs_clients(
    client_counts,           # List[int]
    communication_costs,     # List[float]
    baseline_costs=None,     # Optional[List[float]]
    title="Communication Cost vs Client Count"
)
```

### Model Performance

#### plot_roc_curve

Plot Receiver Operating Characteristic curve.

```python
dashboard.plot_roc_curve(
    fpr,         # np.ndarray
    tpr,         # np.ndarray
    auc_score,   # float
    title="ROC Curve"
)
```

#### plot_precision_recall_curve

Plot Precision-Recall curve.

```python
dashboard.plot_precision_recall_curve(
    precision,   # np.ndarray
    recall,      # np.ndarray
    auc_score,   # float
    title="Precision-Recall Curve"
)
```

#### plot_time_series_with_anomalies

Plot time-series data with true and predicted anomaly labels.

```python
dashboard.plot_time_series_with_anomalies(
    time_series,         # np.ndarray [T, D] or [T]
    true_labels,         # np.ndarray [T]
    predicted_labels,    # np.ndarray [T]
    feature_idx=0,       # int
    title="Time-Series with Anomaly Detection"
)
```

### Model Comparison

#### plot_model_size_comparison

Plot model size comparison as bar chart.

```python
dashboard.plot_model_size_comparison(
    model_names,    # List[str]
    model_sizes,    # List[float] (in MB)
    title="Model Size Comparison"
)
```

#### plot_inference_latency_comparison

Plot inference latency comparison as bar chart.

```python
dashboard.plot_inference_latency_comparison(
    model_names,    # List[str]
    latencies,      # List[float] (in ms)
    title="Inference Latency Comparison"
)
```

### Ablation Studies

#### plot_ablation_study_comparison

Plot ablation study comparison across configurations and metrics.

```python
dashboard.plot_ablation_study_comparison(
    configurations,    # List[str]
    metrics,          # Dict[str, List[float]]
    title="Ablation Study Comparison"
)
```

**Example:**
```python
configurations = ["Full System", "No ADMS", "No DP"]
metrics = {
    "F1": [0.90, 0.85, 0.88],
    "AUC-ROC": [0.95, 0.92, 0.94]
}
dashboard.plot_ablation_study_comparison(configurations, metrics)
```

### Vector Graphics Export

#### export_all_figures_vector

Export all available plots in vector graphics format.

```python
saved_files = dashboard.export_all_figures_vector(
    data,                    # Dict[str, Any]
    vector_format="pdf"      # 'pdf', 'svg', or 'eps'
)
```

**Returns:** List of paths to saved files

### Data Export Schema

#### generate_visualization_data_export

Get the expected data structure for API integration.

```python
schema = dashboard.generate_visualization_data_export()
```

Returns a dictionary defining the expected structure for visualization data
that should be provided by the Python backend for API server integration.

## Data Structure Requirements

### Training Metrics
```python
{
    "client_losses": {
        "client_1": [0.5, 0.4, 0.3],
        "client_2": [0.6, 0.5, 0.4]
    },
    "train_losses": [0.55, 0.45, 0.35],
    "val_losses": [0.58, 0.48, 0.38],
    "train_accuracies": [0.85, 0.88, 0.91],
    "val_accuracies": [0.83, 0.86, 0.89],
    "rounds": [1, 2, 3]
}
```

### Privacy Metrics
```python
{
    "epsilon_values": [0.1, 0.2, 0.3],
    "target_epsilon": 1.0,
    "rounds": [1, 2, 3],
    "privacy_budgets": [0.1, 1.0, 10.0],
    "attack_success_rates": [0.52, 0.65, 0.85]
}
```

### Communication Metrics
```python
{
    "client_counts": [5, 20, 50, 100, 500],
    "communication_costs": [10.5, 42.0, 105.0, 210.0, 1050.0],
    "baseline_costs": [100.0, 400.0, 1000.0, 2000.0, 10000.0]
}
```

### Evaluation Metrics
```python
{
    "fpr": np.array([0.0, 0.1, 0.2, 1.0]),
    "tpr": np.array([0.0, 0.8, 0.95, 1.0]),
    "roc_auc": 0.95,
    "precision": np.array([1.0, 0.95, 0.9, 0.85]),
    "recall": np.array([0.0, 0.3, 0.6, 1.0]),
    "pr_auc": 0.92
}
```

## Requirements Mapping

This module satisfies **Requirement 13: Python Backend Visualization Export**:

- ✅ 13.1: Training loss data per client export
- ✅ 13.2: Global model convergence metrics
- ✅ 13.3: Privacy budget consumption time-series
- ✅ 13.4: Communication cost per client count
- ✅ 13.5: ROC and PR curve data points
- ✅ 13.6: Time-series with predicted anomaly labels
- ✅ 13.7: MIA attack success rates across privacy budgets
- ✅ 13.8: Model size and inference latency measurements
- ✅ 13.9: Ablation study comparison data
- ✅ 13.10: Visualization data export endpoints

## Example: Complete Workflow

```python
from sentryfl.visualization import VisualizationDashboard
import numpy as np

# Initialize
dashboard = VisualizationDashboard(output_dir="paper_figures", figure_format="pdf")

# Prepare all data
all_data = {
    "client_losses": {...},
    "train_losses": [...],
    "epsilon_values": [...],
    "fpr": np.array([...]),
    "tpr": np.array([...]),
    "roc_auc": 0.95,
    # ... more data
}

# Export all figures as vector graphics for publication
vector_files = dashboard.export_all_figures_vector(all_data, vector_format="pdf")
print(f"Generated {len(vector_files)} publication-ready figures")
```

## Testing

Run tests with:

```bash
pytest sentryfl/visualization/test_visualization_dashboard.py -v
```

Run demonstration:

```bash
python demo_visualization.py
```

## Notes

- All plots use publication-quality settings (300 DPI)
- Colorblind-friendly palette by default
- Non-interactive backend for server environments
- Automatic directory creation
- Thread-safe for concurrent use

## License

Part of the SentryFL project.
