"""
VisualizationDashboard module for comprehensive result analysis.

This module provides plotting capabilities for:
- Training metrics (loss curves, convergence)
- Privacy evaluation (budget consumption, MIA results)
- Communication efficiency (cost vs client count)
- Model performance (ROC, PR curves, anomaly detection)
- Ablation studies and baseline comparisons
"""

import os
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for server environments
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# Set style for publication-quality figures
sns.set_style("whitegrid")
sns.set_palette("colorblind")
plt.rcParams['figure.dpi'] = 300
plt.rcParams['savefig.dpi'] = 300
plt.rcParams['font.size'] = 10
plt.rcParams['axes.labelsize'] = 11
plt.rcParams['axes.titlesize'] = 12
plt.rcParams['xtick.labelsize'] = 9
plt.rcParams['ytick.labelsize'] = 9
plt.rcParams['legend.fontsize'] = 9


class VisualizationDashboard:
    """
    Comprehensive visualization dashboard for SentryFL experiment analysis.
    
    Provides methods for plotting training metrics, privacy evaluation,
    communication efficiency, and model performance comparisons.
    
    Attributes:
        output_dir: Directory to save generated plots
        figure_format: File format for saved figures ('png', 'pdf', 'svg')
    """
    
    def __init__(self, output_dir: str = "visualization_results", 
                 figure_format: str = "png"):
        """
        Initialize the VisualizationDashboard.
        
        Args:
            output_dir: Directory to save plots
            figure_format: Format for saved figures ('png', 'pdf', 'svg')
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.figure_format = figure_format
        
        # Validate figure format
        valid_formats = ['png', 'pdf', 'svg', 'eps']
        if figure_format not in valid_formats:
            raise ValueError(
                f"Invalid figure format '{figure_format}'. "
                f"Must be one of {valid_formats}"
            )
    
    def _save_figure(self, fig: plt.Figure, filename: str, 
                     tight_layout: bool = True) -> str:
        """
        Save figure to disk with specified format.
        
        Args:
            fig: Matplotlib figure object
            filename: Base filename (without extension)
            tight_layout: Whether to apply tight_layout
            
        Returns:
            Full path to saved file
        """
        if tight_layout:
            fig.tight_layout()
        
        filepath = self.output_dir / f"{filename}.{self.figure_format}"
        fig.savefig(filepath, format=self.figure_format, bbox_inches='tight')
        plt.close(fig)
        
        return str(filepath)
    
    def plot_training_loss_per_client(
        self, 
        client_losses: Dict[str, List[float]], 
        rounds: Optional[List[int]] = None,
        title: str = "Training Loss per Client"
    ) -> str:
        """
        Plot training loss curves for each client.
        
        Args:
            client_losses: Dict mapping client IDs to loss values per round
            rounds: Optional list of round numbers (defaults to range)
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(10, 6))
        
        for client_id, losses in client_losses.items():
            if rounds is None:
                rounds = list(range(1, len(losses) + 1))
            ax.plot(rounds[:len(losses)], losses, label=client_id, alpha=0.7)
        
        ax.set_xlabel("Training Round")
        ax.set_ylabel("Loss")
        ax.set_title(title)
        ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
        ax.grid(True, alpha=0.3)
        
        return self._save_figure(fig, "training_loss_per_client")
    
    def plot_global_model_convergence(
        self,
        train_losses: List[float],
        val_losses: Optional[List[float]] = None,
        train_accuracies: Optional[List[float]] = None,
        val_accuracies: Optional[List[float]] = None,
        rounds: Optional[List[int]] = None,
        title: str = "Global Model Convergence"
    ) -> str:
        """
        Plot global model convergence metrics over training rounds.
        
        Args:
            train_losses: Training loss per round
            val_losses: Validation loss per round (optional)
            train_accuracies: Training accuracy per round (optional)
            val_accuracies: Validation accuracy per round (optional)
            rounds: Optional list of round numbers
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        if rounds is None:
            rounds = list(range(1, len(train_losses) + 1))
        
        # Create subplots based on available data
        has_accuracy = train_accuracies is not None
        n_plots = 2 if has_accuracy else 1
        
        fig, axes = plt.subplots(n_plots, 1, figsize=(10, 4 * n_plots))
        if n_plots == 1:
            axes = [axes]
        
        # Plot loss
        axes[0].plot(rounds[:len(train_losses)], train_losses, 
                     label='Train Loss', marker='o', markersize=3)
        if val_losses is not None:
            axes[0].plot(rounds[:len(val_losses)], val_losses, 
                         label='Val Loss', marker='s', markersize=3)
        axes[0].set_xlabel("Training Round")
        axes[0].set_ylabel("Loss")
        axes[0].set_title("Loss Convergence")
        axes[0].legend()
        axes[0].grid(True, alpha=0.3)
        
        # Plot accuracy if available
        if has_accuracy:
            axes[1].plot(rounds[:len(train_accuracies)], train_accuracies, 
                         label='Train Accuracy', marker='o', markersize=3)
            if val_accuracies is not None:
                axes[1].plot(rounds[:len(val_accuracies)], val_accuracies, 
                             label='Val Accuracy', marker='s', markersize=3)
            axes[1].set_xlabel("Training Round")
            axes[1].set_ylabel("Accuracy")
            axes[1].set_title("Accuracy Convergence")
            axes[1].legend()
            axes[1].grid(True, alpha=0.3)
        
        fig.suptitle(title, fontsize=14, y=1.0)
        
        return self._save_figure(fig, "global_model_convergence")
    
    def plot_privacy_budget_consumption(
        self,
        epsilon_values: List[float],
        rounds: Optional[List[int]] = None,
        target_epsilon: Optional[float] = None,
        title: str = "Privacy Budget Consumption"
    ) -> str:
        """
        Plot cumulative privacy budget (epsilon) consumption over rounds.
        
        Args:
            epsilon_values: Cumulative epsilon values per round
            rounds: Optional list of round numbers
            target_epsilon: Optional target epsilon to show as reference line
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        if rounds is None:
            rounds = list(range(1, len(epsilon_values) + 1))
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.plot(rounds[:len(epsilon_values)], epsilon_values, 
                marker='o', markersize=4, linewidth=2, label='ε consumed')
        
        if target_epsilon is not None:
            ax.axhline(y=target_epsilon, color='r', linestyle='--', 
                       linewidth=2, label=f'Target ε = {target_epsilon}')
        
        ax.set_xlabel("Training Round")
        ax.set_ylabel("Cumulative ε (Epsilon)")
        ax.set_title(title)
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        return self._save_figure(fig, "privacy_budget_consumption")
    
    def plot_communication_cost_vs_clients(
        self,
        client_counts: List[int],
        communication_costs: List[float],
        baseline_costs: Optional[List[float]] = None,
        title: str = "Communication Cost vs Client Count"
    ) -> str:
        """
        Plot communication cost as a function of client count.
        
        Args:
            client_counts: List of client counts (e.g., [5, 20, 50, 100, 500])
            communication_costs: Communication cost (bytes) for each client count
            baseline_costs: Optional baseline costs for comparison
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.plot(client_counts, communication_costs, marker='o', 
                linewidth=2, markersize=8, label='SentryFL (ADMS)')
        
        if baseline_costs is not None:
            ax.plot(client_counts, baseline_costs, marker='s', 
                    linewidth=2, markersize=8, label='Baseline (Full Model)')
        
        ax.set_xlabel("Number of Clients")
        ax.set_ylabel("Communication Cost (MB)")
        ax.set_title(title)
        ax.set_xscale('log')
        ax.set_yscale('log')
        ax.legend()
        ax.grid(True, alpha=0.3, which='both')
        
        return self._save_figure(fig, "communication_cost_vs_clients")
    
    def plot_roc_curve(
        self,
        fpr: np.ndarray,
        tpr: np.ndarray,
        auc_score: float,
        title: str = "ROC Curve"
    ) -> str:
        """
        Plot Receiver Operating Characteristic (ROC) curve.
        
        Args:
            fpr: False positive rates
            tpr: True positive rates
            auc_score: Area under ROC curve
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(8, 8))
        
        ax.plot(fpr, tpr, linewidth=2, 
                label=f'ROC Curve (AUC = {auc_score:.3f})')
        ax.plot([0, 1], [0, 1], 'k--', linewidth=1, label='Random Classifier')
        
        ax.set_xlabel("False Positive Rate")
        ax.set_ylabel("True Positive Rate")
        ax.set_title(title)
        ax.legend(loc='lower right')
        ax.grid(True, alpha=0.3)
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.05])
        
        return self._save_figure(fig, "roc_curve")
    
    def plot_precision_recall_curve(
        self,
        precision: np.ndarray,
        recall: np.ndarray,
        auc_score: float,
        title: str = "Precision-Recall Curve"
    ) -> str:
        """
        Plot Precision-Recall (PR) curve.
        
        Args:
            precision: Precision values
            recall: Recall values
            auc_score: Area under PR curve
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(8, 8))
        
        ax.plot(recall, precision, linewidth=2, 
                label=f'PR Curve (AUC = {auc_score:.3f})')
        
        ax.set_xlabel("Recall")
        ax.set_ylabel("Precision")
        ax.set_title(title)
        ax.legend(loc='upper right')
        ax.grid(True, alpha=0.3)
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.05])
        
        return self._save_figure(fig, "precision_recall_curve")
    
    def plot_time_series_with_anomalies(
        self,
        time_series: np.ndarray,
        true_labels: np.ndarray,
        predicted_labels: np.ndarray,
        feature_idx: int = 0,
        title: str = "Time-Series with Anomaly Detection"
    ) -> str:
        """
        Plot time-series data with true and predicted anomaly labels.
        
        Args:
            time_series: Time-series data [T, D] or [T]
            true_labels: Ground truth binary labels [T]
            predicted_labels: Predicted binary labels [T]
            feature_idx: Which feature to plot (for multivariate data)
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(14, 6))
        
        # Extract single feature if multivariate
        if len(time_series.shape) > 1:
            data = time_series[:, feature_idx]
        else:
            data = time_series
        
        timesteps = np.arange(len(data))
        
        # Plot time-series
        ax.plot(timesteps, data, linewidth=1, color='blue', 
                alpha=0.7, label='Time-Series')
        
        # Highlight true anomalies
        true_anomaly_idx = np.where(true_labels == 1)[0]
        ax.scatter(true_anomaly_idx, data[true_anomaly_idx], 
                   color='red', s=50, marker='x', 
                   label='True Anomaly', zorder=3)
        
        # Highlight predicted anomalies
        pred_anomaly_idx = np.where(predicted_labels == 1)[0]
        ax.scatter(pred_anomaly_idx, data[pred_anomaly_idx], 
                   color='orange', s=30, marker='o', 
                   facecolors='none', linewidths=1.5,
                   label='Predicted Anomaly', zorder=2)
        
        ax.set_xlabel("Timestep")
        ax.set_ylabel("Value")
        ax.set_title(title)
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        return self._save_figure(fig, "time_series_anomalies")
    
    def plot_mia_attack_success_rate(
        self,
        privacy_budgets: List[float],
        attack_success_rates: List[float],
        baseline_rate: float = 0.5,
        title: str = "MIA Attack Success Rate vs Privacy Budget"
    ) -> str:
        """
        Plot Membership Inference Attack success rate across privacy budgets.
        
        Args:
            privacy_budgets: List of epsilon values
            attack_success_rates: Attack success rate for each epsilon
            baseline_rate: Random guessing baseline (default 0.5)
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.plot(privacy_budgets, attack_success_rates, 
                marker='o', linewidth=2, markersize=8, 
                label='MIA Success Rate')
        ax.axhline(y=baseline_rate, color='r', linestyle='--', 
                   linewidth=2, label=f'Random Baseline ({baseline_rate})')
        
        ax.set_xlabel("Privacy Budget (ε)")
        ax.set_ylabel("Attack Success Rate")
        ax.set_title(title)
        ax.set_xscale('log')
        ax.legend()
        ax.grid(True, alpha=0.3, which='both')
        ax.set_ylim([0.4, 1.0])
        
        return self._save_figure(fig, "mia_attack_success_rate")
    
    def plot_model_size_comparison(
        self,
        model_names: List[str],
        model_sizes: List[float],
        title: str = "Model Size Comparison"
    ) -> str:
        """
        Plot model size comparison as bar chart.
        
        Args:
            model_names: List of model names
            model_sizes: Model sizes in MB
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(10, 6))
        
        colors = sns.color_palette("colorblind", len(model_names))
        bars = ax.bar(model_names, model_sizes, color=colors, alpha=0.8)
        
        # Add value labels on bars
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height:.1f} MB',
                    ha='center', va='bottom', fontsize=9)
        
        ax.set_xlabel("Model")
        ax.set_ylabel("Size (MB)")
        ax.set_title(title)
        ax.grid(True, alpha=0.3, axis='y')
        plt.xticks(rotation=45, ha='right')
        
        return self._save_figure(fig, "model_size_comparison")
    
    def plot_inference_latency_comparison(
        self,
        model_names: List[str],
        latencies: List[float],
        title: str = "Inference Latency Comparison"
    ) -> str:
        """
        Plot inference latency comparison as bar chart.
        
        Args:
            model_names: List of model names
            latencies: Inference latency in milliseconds
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=(10, 6))
        
        colors = sns.color_palette("colorblind", len(model_names))
        bars = ax.bar(model_names, latencies, color=colors, alpha=0.8)
        
        # Add value labels on bars
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height:.2f} ms',
                    ha='center', va='bottom', fontsize=9)
        
        ax.set_xlabel("Model")
        ax.set_ylabel("Latency (ms)")
        ax.set_title(title)
        ax.grid(True, alpha=0.3, axis='y')
        plt.xticks(rotation=45, ha='right')
        
        return self._save_figure(fig, "inference_latency_comparison")
    
    def plot_ablation_study_comparison(
        self,
        configurations: List[str],
        metrics: Dict[str, List[float]],
        title: str = "Ablation Study Comparison"
    ) -> str:
        """
        Plot ablation study comparison across configurations and metrics.
        
        Args:
            configurations: List of configuration names 
                           (e.g., ['Full System', 'No ADMS', 'No DP'])
            metrics: Dict mapping metric names to values for each configuration
                    (e.g., {'F1': [0.9, 0.85, 0.88], 'AUC': [0.95, 0.92, 0.94]})
            title: Plot title
            
        Returns:
            Path to saved figure
        """
        n_metrics = len(metrics)
        fig, axes = plt.subplots(1, n_metrics, figsize=(6 * n_metrics, 6))
        
        if n_metrics == 1:
            axes = [axes]
        
        for idx, (metric_name, values) in enumerate(metrics.items()):
            ax = axes[idx]
            colors = sns.color_palette("colorblind", len(configurations))
            bars = ax.bar(configurations, values, color=colors, alpha=0.8)
            
            # Add value labels on bars
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:.3f}',
                        ha='center', va='bottom', fontsize=9)
            
            ax.set_ylabel(metric_name)
            ax.set_title(f"{metric_name} Comparison")
            ax.grid(True, alpha=0.3, axis='y')
            ax.tick_params(axis='x', rotation=45)
            plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha='right')
        
        fig.suptitle(title, fontsize=14, y=1.0)
        
        return self._save_figure(fig, "ablation_study_comparison")
    
    def export_all_figures_vector(
        self,
        data: Dict[str, Any],
        vector_format: str = "pdf"
    ) -> List[str]:
        """
        Export all figures in vector graphics format for publication.
        
        Args:
            data: Dictionary containing all visualization data
            vector_format: Vector format ('pdf', 'svg', 'eps')
            
        Returns:
            List of paths to saved vector graphics files
        """
        original_format = self.figure_format
        self.figure_format = vector_format
        
        saved_files = []
        
        try:
            # Generate all plots based on available data
            if 'client_losses' in data:
                saved_files.append(self.plot_training_loss_per_client(
                    data['client_losses'],
                    data.get('rounds')
                ))
            
            if 'train_losses' in data:
                saved_files.append(self.plot_global_model_convergence(
                    data['train_losses'],
                    data.get('val_losses'),
                    data.get('train_accuracies'),
                    data.get('val_accuracies'),
                    data.get('rounds')
                ))
            
            if 'epsilon_values' in data:
                saved_files.append(self.plot_privacy_budget_consumption(
                    data['epsilon_values'],
                    data.get('rounds'),
                    data.get('target_epsilon')
                ))
            
            if 'client_counts' in data and 'communication_costs' in data:
                saved_files.append(self.plot_communication_cost_vs_clients(
                    data['client_counts'],
                    data['communication_costs'],
                    data.get('baseline_costs')
                ))
            
            if 'fpr' in data and 'tpr' in data and 'roc_auc' in data:
                saved_files.append(self.plot_roc_curve(
                    data['fpr'],
                    data['tpr'],
                    data['roc_auc']
                ))
            
            if 'precision' in data and 'recall' in data and 'pr_auc' in data:
                saved_files.append(self.plot_precision_recall_curve(
                    data['precision'],
                    data['recall'],
                    data['pr_auc']
                ))
            
            if 'time_series' in data and 'true_labels' in data and 'predicted_labels' in data:
                saved_files.append(self.plot_time_series_with_anomalies(
                    data['time_series'],
                    data['true_labels'],
                    data['predicted_labels'],
                    data.get('feature_idx', 0)
                ))
            
            if 'privacy_budgets' in data and 'attack_success_rates' in data:
                saved_files.append(self.plot_mia_attack_success_rate(
                    data['privacy_budgets'],
                    data['attack_success_rates'],
                    data.get('baseline_rate', 0.5)
                ))
            
            if 'model_names' in data and 'model_sizes' in data:
                saved_files.append(self.plot_model_size_comparison(
                    data['model_names'],
                    data['model_sizes']
                ))
            
            if 'model_names' in data and 'latencies' in data:
                saved_files.append(self.plot_inference_latency_comparison(
                    data['model_names'],
                    data['latencies']
                ))
            
            if 'configurations' in data and 'metrics' in data:
                saved_files.append(self.plot_ablation_study_comparison(
                    data['configurations'],
                    data['metrics']
                ))
        
        finally:
            # Restore original format
            self.figure_format = original_format
        
        return saved_files
    
    def generate_visualization_data_export(
        self,
        output_file: str = "visualization_data.json"
    ) -> Dict[str, Any]:
        """
        Generate JSON structure for API server to retrieve visualization data.
        
        This method defines the expected structure for visualization data
        that should be provided by the Python backend.
        
        Args:
            output_file: Filename for exported JSON schema
            
        Returns:
            Dictionary with visualization data schema
        """
        schema = {
            "experiment_id": "string",
            "timestamp": "ISO8601 datetime",
            "training_metrics": {
                "client_losses": {
                    "client_1": [0.5, 0.4, 0.3],
                    "client_2": [0.6, 0.5, 0.4]
                },
                "train_losses": [0.55, 0.45, 0.35],
                "val_losses": [0.58, 0.48, 0.38],
                "train_accuracies": [0.85, 0.88, 0.91],
                "val_accuracies": [0.83, 0.86, 0.89],
                "rounds": [1, 2, 3]
            },
            "privacy_metrics": {
                "epsilon_values": [0.1, 0.2, 0.3],
                "target_epsilon": 1.0,
                "rounds": [1, 2, 3],
                "privacy_budgets": [0.1, 1.0, 10.0],
                "attack_success_rates": [0.52, 0.65, 0.85],
                "baseline_rate": 0.5
            },
            "communication_metrics": {
                "client_counts": [5, 20, 50, 100, 500],
                "communication_costs": [10.5, 42.0, 105.0, 210.0, 1050.0],
                "baseline_costs": [100.0, 400.0, 1000.0, 2000.0, 10000.0]
            },
            "evaluation_metrics": {
                "fpr": [0.0, 0.1, 0.2, 1.0],
                "tpr": [0.0, 0.8, 0.95, 1.0],
                "roc_auc": 0.95,
                "precision": [1.0, 0.95, 0.9, 0.85],
                "recall": [0.0, 0.3, 0.6, 1.0],
                "pr_auc": 0.92
            },
            "anomaly_detection": {
                "time_series": "np.ndarray serialized as list",
                "true_labels": "np.ndarray serialized as list",
                "predicted_labels": "np.ndarray serialized as list",
                "feature_idx": 0
            },
            "model_comparison": {
                "model_names": ["Full Model", "Quantized INT8", "Distilled"],
                "model_sizes": [150.5, 37.6, 50.2],
                "latencies": [25.5, 8.3, 12.1]
            },
            "ablation_study": {
                "configurations": ["Full System", "No ADMS", "No DP", "No KD"],
                "metrics": {
                    "F1": [0.90, 0.85, 0.88, 0.89],
                    "AUC-ROC": [0.95, 0.92, 0.94, 0.94],
                    "AUC-PR": [0.92, 0.88, 0.90, 0.91]
                }
            }
        }
        
        return schema
