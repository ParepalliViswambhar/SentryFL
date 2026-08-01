"""
Demonstration script for VisualizationDashboard capabilities.

This script generates sample data and creates all supported visualizations
to demonstrate the dashboard's plotting capabilities for SentryFL analysis.
"""

import numpy as np
from sentryfl.visualization import VisualizationDashboard


def generate_sample_training_data():
    """Generate realistic sample training data."""
    rounds = list(range(1, 51))
    
    # Client-specific losses (simulating federated learning)
    client_losses = {
        f"client_{i}": [
            0.8 * np.exp(-r * 0.05) + np.random.normal(0, 0.02)
            for r in rounds
        ]
        for i in range(1, 6)
    }
    
    # Global model metrics
    train_losses = [0.75 * np.exp(-r * 0.05) + np.random.normal(0, 0.01) 
                    for r in rounds]
    val_losses = [0.78 * np.exp(-r * 0.05) + np.random.normal(0, 0.015) 
                  for r in rounds]
    train_accuracies = [1 - 0.75 * np.exp(-r * 0.05) + np.random.normal(0, 0.01) 
                        for r in rounds]
    val_accuracies = [1 - 0.78 * np.exp(-r * 0.05) + np.random.normal(0, 0.015) 
                      for r in rounds]
    
    return {
        "rounds": rounds,
        "client_losses": client_losses,
        "train_losses": train_losses,
        "val_losses": val_losses,
        "train_accuracies": train_accuracies,
        "val_accuracies": val_accuracies
    }


def generate_sample_privacy_data():
    """Generate sample privacy evaluation data."""
    rounds = list(range(1, 51))
    
    # Privacy budget consumption (monotonically increasing)
    epsilon_values = [0.02 * r + 0.001 * r**1.1 for r in rounds]
    
    # MIA evaluation across different privacy budgets
    privacy_budgets = [0.1, 0.5, 1.0, 5.0, 10.0, 50.0]
    attack_success_rates = [0.51, 0.55, 0.62, 0.75, 0.85, 0.93]
    
    return {
        "rounds": rounds,
        "epsilon_values": epsilon_values,
        "target_epsilon": 1.0,
        "privacy_budgets": privacy_budgets,
        "attack_success_rates": attack_success_rates,
        "baseline_rate": 0.5
    }


def generate_sample_communication_data():
    """Generate sample communication efficiency data."""
    client_counts = [5, 20, 50, 100, 500]
    
    # ADMS communication cost (parameter-efficient)
    communication_costs = [c * 0.21 for c in client_counts]
    
    # Baseline full model communication cost
    baseline_costs = [c * 2.0 for c in client_counts]
    
    return {
        "client_counts": client_counts,
        "communication_costs": communication_costs,
        "baseline_costs": baseline_costs
    }


def generate_sample_evaluation_data():
    """Generate sample anomaly detection evaluation data."""
    # ROC curve data
    fpr = np.linspace(0, 1, 100)
    tpr = 1 - np.exp(-5 * fpr)  # Realistic ROC curve
    roc_auc = np.trapz(tpr, fpr)
    
    # PR curve data
    recall = np.linspace(0, 1, 100)
    precision = 0.9 * np.exp(-1.5 * recall) + 0.1
    pr_auc = np.trapz(precision, recall)
    
    return {
        "fpr": fpr,
        "tpr": tpr,
        "roc_auc": roc_auc,
        "precision": precision,
        "recall": recall,
        "pr_auc": pr_auc
    }


def generate_sample_time_series_data():
    """Generate sample time-series with anomalies."""
    # Create synthetic time-series with periodic pattern
    t = np.linspace(0, 10*np.pi, 1000)
    time_series = np.sin(t) + 0.5*np.sin(3*t) + np.random.normal(0, 0.1, 1000)
    
    # Inject anomalies
    anomaly_ranges = [(200, 220), (450, 470), (750, 770)]
    true_labels = np.zeros(1000)
    for start, end in anomaly_ranges:
        time_series[start:end] += np.random.uniform(2, 3)
        true_labels[start:end] = 1
    
    # Simulate predictions (with some errors)
    predicted_labels = np.zeros(1000)
    for start, end in anomaly_ranges:
        # Slightly shift detection window
        pred_start = max(0, start - 2)
        pred_end = min(1000, end + 3)
        predicted_labels[pred_start:pred_end] = 1
    
    return {
        "time_series": time_series,
        "true_labels": true_labels,
        "predicted_labels": predicted_labels,
        "feature_idx": 0
    }


def generate_sample_model_comparison_data():
    """Generate sample model comparison data."""
    model_names = [
        "Full Model (FP32)",
        "Quantized (INT8)",
        "Distilled Student",
        "Quantized + Distilled"
    ]
    
    # Model sizes in MB
    model_sizes = [152.3, 38.1, 51.7, 12.9]
    
    # Inference latencies in milliseconds
    latencies = [27.5, 8.9, 13.2, 4.1]
    
    return {
        "model_names": model_names,
        "model_sizes": model_sizes,
        "latencies": latencies
    }


def generate_sample_ablation_data():
    """Generate sample ablation study data."""
    configurations = [
        "Full SentryFL",
        "w/o ADMS",
        "w/o Differential Privacy",
        "w/o Knowledge Distillation",
        "w/o Quantization"
    ]
    
    metrics = {
        "F1 Score": [0.902, 0.856, 0.885, 0.898, 0.900],
        "AUC-ROC": [0.955, 0.921, 0.943, 0.951, 0.954],
        "AUC-PR": [0.923, 0.887, 0.908, 0.919, 0.922]
    }
    
    return {
        "configurations": configurations,
        "metrics": metrics
    }


def main():
    """Generate all visualizations with sample data."""
    print("=" * 70)
    print("SentryFL Visualization Dashboard Demo")
    print("=" * 70)
    
    # Initialize dashboard
    print("\n[1/11] Initializing VisualizationDashboard...")
    dashboard = VisualizationDashboard(
        output_dir="demo_visualization_results",
        figure_format="png"
    )
    print(f"       Output directory: {dashboard.output_dir}")
    
    # Generate and plot training metrics
    print("\n[2/11] Generating training loss per client plot...")
    training_data = generate_sample_training_data()
    filepath = dashboard.plot_training_loss_per_client(
        training_data["client_losses"],
        training_data["rounds"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot global model convergence
    print("\n[3/11] Generating global model convergence plot...")
    filepath = dashboard.plot_global_model_convergence(
        training_data["train_losses"],
        training_data["val_losses"],
        training_data["train_accuracies"],
        training_data["val_accuracies"],
        training_data["rounds"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot privacy budget consumption
    print("\n[4/11] Generating privacy budget consumption plot...")
    privacy_data = generate_sample_privacy_data()
    filepath = dashboard.plot_privacy_budget_consumption(
        privacy_data["epsilon_values"],
        privacy_data["rounds"],
        privacy_data["target_epsilon"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot communication cost vs clients
    print("\n[5/11] Generating communication cost vs clients plot...")
    comm_data = generate_sample_communication_data()
    filepath = dashboard.plot_communication_cost_vs_clients(
        comm_data["client_counts"],
        comm_data["communication_costs"],
        comm_data["baseline_costs"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot ROC curve
    print("\n[6/11] Generating ROC curve plot...")
    eval_data = generate_sample_evaluation_data()
    filepath = dashboard.plot_roc_curve(
        eval_data["fpr"],
        eval_data["tpr"],
        eval_data["roc_auc"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot Precision-Recall curve
    print("\n[7/11] Generating Precision-Recall curve plot...")
    filepath = dashboard.plot_precision_recall_curve(
        eval_data["precision"],
        eval_data["recall"],
        eval_data["pr_auc"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot time-series with anomalies
    print("\n[8/11] Generating time-series with anomalies plot...")
    ts_data = generate_sample_time_series_data()
    filepath = dashboard.plot_time_series_with_anomalies(
        ts_data["time_series"],
        ts_data["true_labels"],
        ts_data["predicted_labels"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot MIA attack success rate
    print("\n[9/11] Generating MIA attack success rate plot...")
    filepath = dashboard.plot_mia_attack_success_rate(
        privacy_data["privacy_budgets"],
        privacy_data["attack_success_rates"],
        privacy_data["baseline_rate"]
    )
    print(f"       Saved: {filepath}")
    
    # Plot model comparison
    print("\n[10/11] Generating model comparison plots...")
    model_data = generate_sample_model_comparison_data()
    filepath1 = dashboard.plot_model_size_comparison(
        model_data["model_names"],
        model_data["model_sizes"]
    )
    print(f"        Model size: {filepath1}")
    
    filepath2 = dashboard.plot_inference_latency_comparison(
        model_data["model_names"],
        model_data["latencies"]
    )
    print(f"        Inference latency: {filepath2}")
    
    # Plot ablation study
    print("\n[11/11] Generating ablation study comparison plot...")
    ablation_data = generate_sample_ablation_data()
    filepath = dashboard.plot_ablation_study_comparison(
        ablation_data["configurations"],
        ablation_data["metrics"]
    )
    print(f"        Saved: {filepath}")
    
    # Export all figures as vector graphics
    print("\n" + "=" * 70)
    print("Exporting all figures as PDF vector graphics...")
    print("=" * 70)
    
    all_data = {
        **training_data,
        **privacy_data,
        **comm_data,
        **eval_data,
        **ts_data,
        **model_data,
        **ablation_data
    }
    
    vector_files = dashboard.export_all_figures_vector(
        all_data,
        vector_format="pdf"
    )
    
    print(f"\nExported {len(vector_files)} vector graphics files:")
    for vf in vector_files:
        print(f"  - {vf}")
    
    # Display visualization data schema
    print("\n" + "=" * 70)
    print("Visualization Data Export Schema")
    print("=" * 70)
    schema = dashboard.generate_visualization_data_export()
    print("\nExpected data structure for API integration:")
    print(f"  - Training metrics: {len(schema['training_metrics'])} fields")
    print(f"  - Privacy metrics: {len(schema['privacy_metrics'])} fields")
    print(f"  - Communication metrics: {len(schema['communication_metrics'])} fields")
    print(f"  - Evaluation metrics: {len(schema['evaluation_metrics'])} fields")
    print(f"  - Anomaly detection: {len(schema['anomaly_detection'])} fields")
    print(f"  - Model comparison: {len(schema['model_comparison'])} fields")
    print(f"  - Ablation study: {len(schema['ablation_study'])} fields")
    
    print("\n" + "=" * 70)
    print("Demo completed successfully!")
    print(f"All visualizations saved to: {dashboard.output_dir}")
    print("=" * 70)


if __name__ == "__main__":
    main()
