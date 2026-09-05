"""
Unit tests for VisualizationDashboard module.

Tests cover all plotting capabilities including:
- Training metrics visualization
- Privacy budget plotting
- Communication efficiency plots
- ROC and PR curves
- Time-series anomaly visualization
- Model comparison plots
- Ablation study comparisons
- Vector graphics export
"""

import pytest
import numpy as np
import os
import tempfile
import shutil
from pathlib import Path
from sentryfl.visualization import VisualizationDashboard


@pytest.fixture
def temp_output_dir():
    """Create temporary directory for test outputs."""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture
def dashboard(temp_output_dir):
    """Create VisualizationDashboard instance for testing."""
    return VisualizationDashboard(
        output_dir=temp_output_dir,
        figure_format="png"
    )


def test_dashboard_initialization(temp_output_dir):
    """Test dashboard initialization creates output directory."""
    dashboard = VisualizationDashboard(
        output_dir=temp_output_dir,
        figure_format="png"
    )
    
    assert dashboard.output_dir.exists()
    assert dashboard.output_dir.is_dir()
    assert dashboard.figure_format == "png"


def test_invalid_figure_format(temp_output_dir):
    """Test initialization with invalid figure format raises error."""
    with pytest.raises(ValueError, match="Invalid figure format"):
        VisualizationDashboard(
            output_dir=temp_output_dir,
            figure_format="invalid"
        )


def test_plot_training_loss_per_client(dashboard, temp_output_dir):
    """Test plotting training loss curves for multiple clients."""
    client_losses = {
        "client_1": [0.5, 0.4, 0.3, 0.25],
        "client_2": [0.6, 0.5, 0.4, 0.35],
        "client_3": [0.55, 0.45, 0.35, 0.30]
    }
    rounds = [1, 2, 3, 4]
    
    filepath = dashboard.plot_training_loss_per_client(
        client_losses, rounds
    )
    
    assert os.path.exists(filepath)
    assert filepath.endswith(".png")
    assert "training_loss_per_client" in filepath


def test_plot_training_loss_without_rounds(dashboard):
    """Test plotting training loss with automatic round numbering."""
    client_losses = {
        "client_1": [0.5, 0.4, 0.3],
        "client_2": [0.6, 0.5, 0.4]
    }
    
    filepath = dashboard.plot_training_loss_per_client(client_losses)
    
    assert os.path.exists(filepath)


def test_plot_global_model_convergence_loss_only(dashboard):
    """Test plotting global model convergence with loss only."""
    train_losses = [0.5, 0.4, 0.3, 0.25, 0.2]
    val_losses = [0.55, 0.45, 0.35, 0.30, 0.25]
    
    filepath = dashboard.plot_global_model_convergence(
        train_losses, val_losses
    )
    
    assert os.path.exists(filepath)
    assert "global_model_convergence" in filepath


def test_plot_global_model_convergence_with_accuracy(dashboard):
    """Test plotting global model convergence with loss and accuracy."""
    train_losses = [0.5, 0.4, 0.3, 0.25]
    val_losses = [0.55, 0.45, 0.35, 0.30]
    train_accuracies = [0.80, 0.85, 0.88, 0.90]
    val_accuracies = [0.78, 0.83, 0.86, 0.88]
    
    filepath = dashboard.plot_global_model_convergence(
        train_losses, val_losses, train_accuracies, val_accuracies
    )
    
    assert os.path.exists(filepath)


def test_plot_privacy_budget_consumption(dashboard):
    """Test plotting privacy budget consumption over rounds."""
    epsilon_values = [0.1, 0.2, 0.35, 0.5, 0.7, 0.95]
    target_epsilon = 1.0
    
    filepath = dashboard.plot_privacy_budget_consumption(
        epsilon_values, target_epsilon=target_epsilon
    )
    
    assert os.path.exists(filepath)
    assert "privacy_budget_consumption" in filepath


def test_plot_privacy_budget_without_target(dashboard):
    """Test plotting privacy budget without target epsilon."""
    epsilon_values = [0.1, 0.2, 0.3, 0.4]
    
    filepath = dashboard.plot_privacy_budget_consumption(epsilon_values)
    
    assert os.path.exists(filepath)


def test_plot_communication_cost_vs_clients(dashboard):
    """Test plotting communication cost vs client count."""
    client_counts = [5, 20, 50, 100, 500]
    communication_costs = [10.5, 42.0, 105.0, 210.0, 1050.0]
    baseline_costs = [100.0, 400.0, 1000.0, 2000.0, 10000.0]
    
    filepath = dashboard.plot_communication_cost_vs_clients(
        client_counts, communication_costs, baseline_costs
    )
    
    assert os.path.exists(filepath)
    assert "communication_cost_vs_clients" in filepath


def test_plot_roc_curve(dashboard):
    """Test plotting ROC curve."""
    fpr = np.array([0.0, 0.1, 0.2, 0.5, 1.0])
    tpr = np.array([0.0, 0.7, 0.85, 0.95, 1.0])
    auc_score = 0.92
    
    filepath = dashboard.plot_roc_curve(fpr, tpr, auc_score)
    
    assert os.path.exists(filepath)
    assert "roc_curve" in filepath


def test_plot_precision_recall_curve(dashboard):
    """Test plotting Precision-Recall curve."""
    precision = np.array([1.0, 0.95, 0.90, 0.85, 0.80])
    recall = np.array([0.0, 0.3, 0.6, 0.8, 1.0])
    auc_score = 0.89
    
    filepath = dashboard.plot_precision_recall_curve(
        precision, recall, auc_score
    )
    
    assert os.path.exists(filepath)
    assert "precision_recall_curve" in filepath


def test_plot_time_series_with_anomalies_univariate(dashboard):
    """Test plotting univariate time-series with anomalies."""
    time_series = np.sin(np.linspace(0, 4*np.pi, 100)) + np.random.randn(100) * 0.1
    true_labels = np.zeros(100)
    true_labels[20:25] = 1
    true_labels[60:65] = 1
    predicted_labels = np.zeros(100)
    predicted_labels[21:26] = 1
    predicted_labels[59:64] = 1
    
    filepath = dashboard.plot_time_series_with_anomalies(
        time_series, true_labels, predicted_labels
    )
    
    assert os.path.exists(filepath)
    assert "time_series_anomalies" in filepath


def test_plot_time_series_with_anomalies_multivariate(dashboard):
    """Test plotting multivariate time-series with anomalies."""
    time_series = np.random.randn(100, 5)
    true_labels = np.zeros(100)
    true_labels[20:25] = 1
    predicted_labels = np.zeros(100)
    predicted_labels[21:26] = 1
    
    filepath = dashboard.plot_time_series_with_anomalies(
        time_series, true_labels, predicted_labels, feature_idx=2
    )
    
    assert os.path.exists(filepath)


def test_plot_mia_attack_success_rate(dashboard):
    """Test plotting MIA attack success rate vs privacy budget."""
    privacy_budgets = [0.1, 1.0, 10.0, 100.0]
    attack_success_rates = [0.52, 0.65, 0.80, 0.95]
    
    filepath = dashboard.plot_mia_attack_success_rate(
        privacy_budgets, attack_success_rates
    )
    
    assert os.path.exists(filepath)
    assert "mia_attack_success_rate" in filepath


def test_plot_model_size_comparison(dashboard):
    """Test plotting model size comparison."""
    model_names = ["Full Model", "Quantized INT8", "Distilled", "Pruned"]
    model_sizes = [150.5, 37.6, 50.2, 45.8]
    
    filepath = dashboard.plot_model_size_comparison(
        model_names, model_sizes
    )
    
    assert os.path.exists(filepath)
    assert "model_size_comparison" in filepath


def test_plot_inference_latency_comparison(dashboard):
    """Test plotting inference latency comparison."""
    model_names = ["Full Model", "Quantized INT8", "Distilled"]
    latencies = [25.5, 8.3, 12.1]
    
    filepath = dashboard.plot_inference_latency_comparison(
        model_names, latencies
    )
    
    assert os.path.exists(filepath)
    assert "inference_latency_comparison" in filepath


def test_plot_ablation_study_comparison_single_metric(dashboard):
    """Test plotting ablation study with single metric."""
    configurations = ["Full System", "No ADMS", "No DP"]
    metrics = {
        "F1": [0.90, 0.85, 0.88]
    }
    
    filepath = dashboard.plot_ablation_study_comparison(
        configurations, metrics
    )
    
    assert os.path.exists(filepath)
    assert "ablation_study_comparison" in filepath


def test_plot_ablation_study_comparison_multiple_metrics(dashboard):
    """Test plotting ablation study with multiple metrics."""
    configurations = ["Full System", "No ADMS", "No DP", "No KD"]
    metrics = {
        "F1": [0.90, 0.85, 0.88, 0.89],
        "AUC-ROC": [0.95, 0.92, 0.94, 0.94],
        "AUC-PR": [0.92, 0.88, 0.90, 0.91]
    }
    
    filepath = dashboard.plot_ablation_study_comparison(
        configurations, metrics
    )
    
    assert os.path.exists(filepath)


def test_export_all_figures_vector_pdf(dashboard, temp_output_dir):
    """Test exporting all figures as PDF vector graphics."""
    data = {
        "client_losses": {
            "client_1": [0.5, 0.4, 0.3],
            "client_2": [0.6, 0.5, 0.4]
        },
        "train_losses": [0.55, 0.45, 0.35],
        "val_losses": [0.58, 0.48, 0.38],
        "epsilon_values": [0.1, 0.2, 0.3],
        "target_epsilon": 1.0,
        "client_counts": [5, 20, 50],
        "communication_costs": [10.5, 42.0, 105.0],
        "fpr": np.array([0.0, 0.1, 1.0]),
        "tpr": np.array([0.0, 0.8, 1.0]),
        "roc_auc": 0.92,
        "precision": np.array([1.0, 0.9, 0.8]),
        "recall": np.array([0.0, 0.5, 1.0]),
        "pr_auc": 0.89,
        "time_series": np.random.randn(100),
        "true_labels": np.zeros(100),
        "predicted_labels": np.zeros(100),
        "privacy_budgets": [0.1, 1.0, 10.0],
        "attack_success_rates": [0.52, 0.65, 0.80],
        "model_names": ["Full", "Quantized"],
        "model_sizes": [150.5, 37.6],
        "latencies": [25.5, 8.3],
        "configurations": ["Full", "No ADMS"],
        "metrics": {"F1": [0.90, 0.85]}
    }
    
    saved_files = dashboard.export_all_figures_vector(data, vector_format="pdf")
    
    assert len(saved_files) > 0
    for filepath in saved_files:
        assert os.path.exists(filepath)
        assert filepath.endswith(".pdf")


def test_export_all_figures_vector_svg(dashboard):
    """Test exporting all figures as SVG vector graphics."""
    data = {
        "train_losses": [0.5, 0.4, 0.3],
        "fpr": np.array([0.0, 0.5, 1.0]),
        "tpr": np.array([0.0, 0.9, 1.0]),
        "roc_auc": 0.95
    }
    
    saved_files = dashboard.export_all_figures_vector(data, vector_format="svg")
    
    assert len(saved_files) > 0
    for filepath in saved_files:
        assert filepath.endswith(".svg")


def test_generate_visualization_data_export(dashboard):
    """Test generating visualization data export schema."""
    schema = dashboard.generate_visualization_data_export()
    
    # Verify schema structure
    assert "experiment_id" in schema
    assert "training_metrics" in schema
    assert "privacy_metrics" in schema
    assert "communication_metrics" in schema
    assert "evaluation_metrics" in schema
    assert "anomaly_detection" in schema
    assert "model_comparison" in schema
    assert "ablation_study" in schema
    
    # Verify training metrics structure
    assert "client_losses" in schema["training_metrics"]
    assert "train_losses" in schema["training_metrics"]
    
    # Verify privacy metrics structure
    assert "epsilon_values" in schema["privacy_metrics"]
    assert "attack_success_rates" in schema["privacy_metrics"]
    
    # Verify communication metrics structure
    assert "client_counts" in schema["communication_metrics"]
    assert "communication_costs" in schema["communication_metrics"]
    
    # Verify evaluation metrics structure
    assert "fpr" in schema["evaluation_metrics"]
    assert "tpr" in schema["evaluation_metrics"]
    assert "roc_auc" in schema["evaluation_metrics"]


def test_multiple_formats_supported(temp_output_dir):
    """Test that multiple figure formats are supported."""
    formats = ["png", "pdf", "svg", "eps"]
    
    for fmt in formats:
        dashboard = VisualizationDashboard(
            output_dir=temp_output_dir,
            figure_format=fmt
        )
        
        # Create a simple plot
        train_losses = [0.5, 0.4, 0.3]
        filepath = dashboard.plot_global_model_convergence(train_losses)
        
        assert os.path.exists(filepath)
        assert filepath.endswith(f".{fmt}")


def test_empty_data_handling(dashboard):
    """Test handling of empty data dictionary in export."""
    data = {}
    
    saved_files = dashboard.export_all_figures_vector(data)
    
    # Should return empty list if no data available
    assert isinstance(saved_files, list)
    assert len(saved_files) == 0


def test_partial_data_handling(dashboard):
    """Test handling of partial data in export."""
    # Only provide some of the possible data fields
    data = {
        "train_losses": [0.5, 0.4, 0.3],
        "privacy_budgets": [0.1, 1.0, 10.0],
        "attack_success_rates": [0.52, 0.65, 0.80]
    }
    
    saved_files = dashboard.export_all_figures_vector(data)
    
    # Should create plots for available data only
    assert len(saved_files) == 2  # convergence and MIA plots


def test_output_directory_creation(temp_output_dir):
    """Test that nested output directories are created automatically."""
    nested_dir = os.path.join(temp_output_dir, "nested", "output", "dir")
    dashboard = VisualizationDashboard(output_dir=nested_dir)
    
    assert os.path.exists(nested_dir)
    assert os.path.isdir(nested_dir)


def test_figure_format_restoration_after_export(dashboard):
    """Test that original figure format is restored after vector export."""
    original_format = dashboard.figure_format
    assert original_format == "png"
    
    data = {"train_losses": [0.5, 0.4, 0.3]}
    dashboard.export_all_figures_vector(data, vector_format="pdf")
    
    # Format should be restored to original
    assert dashboard.figure_format == original_format


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
