"""
ExperimentLogger for tracking and reproducibility in SentryFL.

This module provides comprehensive experiment logging capabilities including:
- Unique experiment ID generation
- Hyperparameter logging
- Training, privacy, communication, evaluation, and system metrics logging
- Structured export (JSON, CSV)
- TensorBoard integration
- System resource monitoring (CPU, memory, GPU)

Validates Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10
"""

import uuid
import json
import csv
import time
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from collections import defaultdict

import psutil
import torch
from torch.utils.tensorboard import SummaryWriter


class ExperimentLogger:
    """
    Comprehensive experiment logger for tracking and reproducibility.
    
    Features:
    - Unique experiment ID generation (UUID-based)
    - Hyperparameter logging
    - Multi-category metrics logging (training, privacy, communication, evaluation, system)
    - Structured export (JSON, CSV)
    - TensorBoard integration
    - System resource monitoring
    
    Attributes:
        experiment_id (str): Unique identifier for this experiment
        log_dir (Path): Directory where logs are saved
        hyperparameters (Dict): Logged hyperparameters
        metrics (Dict): All logged metrics organized by category
        tensorboard_writer (SummaryWriter): TensorBoard writer instance
    """
    
    def __init__(
        self,
        experiment_name: Optional[str] = None,
        log_dir: str = "experiments",
        use_tensorboard: bool = True,
        tensorboard_dir: Optional[str] = None
    ):
        """
        Initialize ExperimentLogger.
        
        Args:
            experiment_name: Optional name for the experiment. If None, auto-generated
            log_dir: Base directory for saving experiment logs
            use_tensorboard: Whether to enable TensorBoard logging
            tensorboard_dir: Optional separate directory for TensorBoard logs
        """
        # Generate unique experiment ID (Requirement 12.2)
        self.experiment_id = self._generate_experiment_id()
        
        # Set experiment name
        if experiment_name:
            self.experiment_name = f"{experiment_name}_{self.experiment_id}"
        else:
            self.experiment_name = self.experiment_id
        
        # Setup logging directories
        self.log_dir = Path(log_dir) / self.experiment_name
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize storage structures
        self.hyperparameters: Dict[str, Any] = {}
        self.metrics: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.start_time = time.time()
        
        # TensorBoard integration (Requirement 12.10)
        self.use_tensorboard = use_tensorboard
        self.tensorboard_writer: Optional[SummaryWriter] = None
        if use_tensorboard:
            tb_dir = tensorboard_dir if tensorboard_dir else str(self.log_dir / "tensorboard")
            self.tensorboard_writer = SummaryWriter(log_dir=tb_dir)
        
        # System monitoring
        self.process = psutil.Process()
        
        # Log initialization
        self._log_initialization()
    
    def _generate_experiment_id(self) -> str:
        """
        Generate unique experiment ID using UUID and timestamp.
        
        Returns:
            Unique experiment ID string
            
        Validates: Requirement 12.2 - Assign unique experiment IDs
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]  # Short UUID for readability
        return f"{timestamp}_{unique_id}"
    
    def _log_initialization(self):
        """Log experiment initialization details."""
        init_info = {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "start_time": datetime.now().isoformat(),
            "log_dir": str(self.log_dir),
            "tensorboard_enabled": self.use_tensorboard
        }
        
        init_file = self.log_dir / "experiment_info.json"
        with open(init_file, 'w') as f:
            json.dump(init_info, f, indent=2)
    
    def log_hyperparameters(self, hyperparameters: Dict[str, Any]):
        """
        Log all hyperparameters for the experiment.
        
        Args:
            hyperparameters: Dictionary of hyperparameter names and values
            
        Validates: Requirement 12.1 - Log all hyperparameters for each experiment run
        """
        self.hyperparameters.update(hyperparameters)
        
        # Save to file
        hparams_file = self.log_dir / "hyperparameters.json"
        with open(hparams_file, 'w') as f:
            json.dump(self.hyperparameters, f, indent=2)
        
        # Log to TensorBoard
        if self.tensorboard_writer:
            # Convert complex types to strings for TensorBoard
            tb_hparams = {k: str(v) if not isinstance(v, (int, float, bool)) else v 
                          for k, v in hyperparameters.items()}
            self.tensorboard_writer.add_hparams(tb_hparams, {})
    
    def log_training_metrics(
        self,
        round_num: int,
        loss: float,
        accuracy: Optional[float] = None,
        **kwargs
    ):
        """
        Log training metrics per round.
        
        Args:
            round_num: Training round number
            loss: Training loss
            accuracy: Training accuracy (optional)
            **kwargs: Additional training metrics
            
        Validates: Requirement 12.3 - Log training metrics per round (loss, accuracy)
        """
        metrics = {
            "round": round_num,
            "loss": loss,
            "accuracy": accuracy,
            "timestamp": time.time() - self.start_time,
            **kwargs
        }
        
        self.metrics["training"].append(metrics)
        
        # Log to TensorBoard
        if self.tensorboard_writer:
            self.tensorboard_writer.add_scalar("Training/Loss", loss, round_num)
            if accuracy is not None:
                self.tensorboard_writer.add_scalar("Training/Accuracy", accuracy, round_num)
            for key, value in kwargs.items():
                if isinstance(value, (int, float)):
                    self.tensorboard_writer.add_scalar(f"Training/{key}", value, round_num)
    
    def log_privacy_metrics(
        self,
        round_num: int,
        epsilon: float,
        delta: Optional[float] = None,
        mia_success_rate: Optional[float] = None,
        **kwargs
    ):
        """
        Log privacy metrics.
        
        Args:
            round_num: Training round number
            epsilon: Privacy budget consumed (epsilon)
            delta: Privacy parameter delta (optional)
            mia_success_rate: Membership inference attack success rate (optional)
            **kwargs: Additional privacy metrics
            
        Validates: Requirement 12.4 - Log privacy metrics (epsilon consumed, MIA success rate)
        """
        metrics = {
            "round": round_num,
            "epsilon": epsilon,
            "delta": delta,
            "mia_success_rate": mia_success_rate,
            "timestamp": time.time() - self.start_time,
            **kwargs
        }
        
        self.metrics["privacy"].append(metrics)
        
        # Log to TensorBoard
        if self.tensorboard_writer:
            self.tensorboard_writer.add_scalar("Privacy/Epsilon", epsilon, round_num)
            if delta is not None:
                self.tensorboard_writer.add_scalar("Privacy/Delta", delta, round_num)
            if mia_success_rate is not None:
                self.tensorboard_writer.add_scalar("Privacy/MIA_Success_Rate", mia_success_rate, round_num)
    
    def log_communication_metrics(
        self,
        round_num: int,
        bytes_transferred: int,
        num_clients: Optional[int] = None,
        **kwargs
    ):
        """
        Log communication metrics.
        
        Args:
            round_num: Training round number
            bytes_transferred: Total bytes transferred in this round
            num_clients: Number of participating clients (optional)
            **kwargs: Additional communication metrics
            
        Validates: Requirement 12.5 - Log communication metrics (bytes transferred, rounds)
        """
        metrics = {
            "round": round_num,
            "bytes_transferred": bytes_transferred,
            "num_clients": num_clients,
            "timestamp": time.time() - self.start_time,
            **kwargs
        }
        
        self.metrics["communication"].append(metrics)
        
        # Log to TensorBoard
        if self.tensorboard_writer:
            self.tensorboard_writer.add_scalar("Communication/Bytes_Transferred", bytes_transferred, round_num)
            if num_clients is not None:
                self.tensorboard_writer.add_scalar("Communication/Num_Clients", num_clients, round_num)
    
    def log_evaluation_metrics(
        self,
        epoch_or_round: int,
        f1_score: Optional[float] = None,
        auc_roc: Optional[float] = None,
        auc_pr: Optional[float] = None,
        precision: Optional[float] = None,
        recall: Optional[float] = None,
        **kwargs
    ):
        """
        Log evaluation metrics.
        
        Args:
            epoch_or_round: Epoch or round number
            f1_score: F1 score (optional)
            auc_roc: Area under ROC curve (optional)
            auc_pr: Area under Precision-Recall curve (optional)
            precision: Precision score (optional)
            recall: Recall score (optional)
            **kwargs: Additional evaluation metrics
            
        Validates: Requirement 12.6 - Log evaluation metrics (F1, AUC-ROC, AUC-PR)
        """
        metrics = {
            "epoch_or_round": epoch_or_round,
            "f1_score": f1_score,
            "auc_roc": auc_roc,
            "auc_pr": auc_pr,
            "precision": precision,
            "recall": recall,
            "timestamp": time.time() - self.start_time,
            **kwargs
        }
        
        self.metrics["evaluation"].append(metrics)
        
        # Log to TensorBoard
        if self.tensorboard_writer:
            if f1_score is not None:
                self.tensorboard_writer.add_scalar("Evaluation/F1_Score", f1_score, epoch_or_round)
            if auc_roc is not None:
                self.tensorboard_writer.add_scalar("Evaluation/AUC_ROC", auc_roc, epoch_or_round)
            if auc_pr is not None:
                self.tensorboard_writer.add_scalar("Evaluation/AUC_PR", auc_pr, epoch_or_round)
            if precision is not None:
                self.tensorboard_writer.add_scalar("Evaluation/Precision", precision, epoch_or_round)
            if recall is not None:
                self.tensorboard_writer.add_scalar("Evaluation/Recall", recall, epoch_or_round)
    
    def log_system_metrics(
        self,
        round_num: int,
        include_gpu: bool = True
    ) -> Dict[str, Any]:
        """
        Log system metrics including CPU, memory, and GPU utilization.
        
        Args:
            round_num: Training round number
            include_gpu: Whether to include GPU metrics
            
        Returns:
            Dictionary of logged system metrics
            
        Validates: Requirement 12.7 - Log system metrics (training time, memory usage, CPU/GPU utilization)
        """
        # CPU and memory metrics
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory_info = self.process.memory_info()
        memory_mb = memory_info.rss / (1024 * 1024)  # Convert to MB
        memory_percent = self.process.memory_percent()
        
        metrics = {
            "round": round_num,
            "elapsed_time": time.time() - self.start_time,
            "cpu_percent": cpu_percent,
            "memory_mb": memory_mb,
            "memory_percent": memory_percent,
            "timestamp": time.time() - self.start_time
        }
        
        # GPU metrics
        if include_gpu and torch.cuda.is_available():
            gpu_memory_allocated = torch.cuda.memory_allocated() / (1024 * 1024)  # MB
            gpu_memory_reserved = torch.cuda.memory_reserved() / (1024 * 1024)  # MB
            gpu_utilization = torch.cuda.utilization() if hasattr(torch.cuda, 'utilization') else None
            
            metrics.update({
                "gpu_memory_allocated_mb": gpu_memory_allocated,
                "gpu_memory_reserved_mb": gpu_memory_reserved,
                "gpu_utilization_percent": gpu_utilization
            })
        
        self.metrics["system"].append(metrics)
        
        # Log to TensorBoard
        if self.tensorboard_writer:
            self.tensorboard_writer.add_scalar("System/CPU_Percent", cpu_percent, round_num)
            self.tensorboard_writer.add_scalar("System/Memory_MB", memory_mb, round_num)
            if include_gpu and torch.cuda.is_available():
                self.tensorboard_writer.add_scalar("System/GPU_Memory_MB", gpu_memory_allocated, round_num)
        
        return metrics
    
    def export_to_json(self, filename: Optional[str] = None) -> str:
        """
        Export all experiment data to JSON format.
        
        Args:
            filename: Optional filename. If None, uses default naming
            
        Returns:
            Path to the exported JSON file
            
        Validates: Requirement 12.8 - Save experiment logs to structured format (JSON, CSV)
        """
        if filename is None:
            filename = f"experiment_{self.experiment_id}.json"
        
        filepath = self.log_dir / filename
        
        export_data = {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "start_time": datetime.fromtimestamp(self.start_time).isoformat(),
            "hyperparameters": self.hyperparameters,
            "metrics": dict(self.metrics)
        }
        
        with open(filepath, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        return str(filepath)
    
    def export_to_csv(self, metric_category: str, filename: Optional[str] = None) -> str:
        """
        Export specific metric category to CSV format.
        
        Args:
            metric_category: Category of metrics to export ('training', 'privacy', etc.)
            filename: Optional filename. If None, uses default naming
            
        Returns:
            Path to the exported CSV file
            
        Validates: Requirement 12.8 - Save experiment logs to structured format (JSON, CSV)
        """
        if metric_category not in self.metrics:
            raise ValueError(f"Metric category '{metric_category}' not found")
        
        if filename is None:
            filename = f"{metric_category}_metrics_{self.experiment_id}.csv"
        
        filepath = self.log_dir / filename
        
        metrics_data = self.metrics[metric_category]
        if not metrics_data:
            raise ValueError(f"No metrics logged for category '{metric_category}'")
        
        # Get all unique keys across all metric entries
        fieldnames = set()
        for entry in metrics_data:
            fieldnames.update(entry.keys())
        fieldnames = sorted(fieldnames)
        
        with open(filepath, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(metrics_data)
        
        return str(filepath)
    
    def export_all_csv(self) -> Dict[str, str]:
        """
        Export all metric categories to separate CSV files.
        
        Returns:
            Dictionary mapping metric categories to their CSV file paths
            
        Validates: Requirement 12.8 - Save experiment logs to structured format (JSON, CSV)
        """
        exported_files = {}
        
        for category in self.metrics.keys():
            if self.metrics[category]:  # Only export if there's data
                filepath = self.export_to_csv(category)
                exported_files[category] = filepath
        
        return exported_files
    
    def get_metrics(self, category: str) -> List[Dict[str, Any]]:
        """
        Retrieve metrics for a specific category.
        
        Args:
            category: Metric category to retrieve
            
        Returns:
            List of metric dictionaries for the specified category
            
        Validates: Requirement 12.9 - Support experiment comparison across multiple runs
        """
        return self.metrics.get(category, [])
    
    def get_all_metrics(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieve all metrics across all categories.
        
        Returns:
            Dictionary of all metrics organized by category
            
        Validates: Requirement 12.9 - Support experiment comparison across multiple runs
        """
        return dict(self.metrics)
    
    def get_summary(self) -> Dict[str, Any]:
        """
        Get a summary of the experiment.
        
        Returns:
            Dictionary containing experiment summary statistics
            
        Validates: Requirement 12.9 - Support experiment comparison across multiple runs
        """
        summary = {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "elapsed_time": time.time() - self.start_time,
            "hyperparameters": self.hyperparameters,
            "metric_counts": {category: len(metrics) for category, metrics in self.metrics.items()}
        }
        
        # Add latest metrics from each category
        for category, metrics in self.metrics.items():
            if metrics:
                summary[f"latest_{category}"] = metrics[-1]
        
        return summary
    
    def close(self):
        """
        Close the logger and finalize all exports.
        
        Ensures all data is written to disk and TensorBoard is properly closed.
        """
        # Export final data
        self.export_to_json()
        self.export_all_csv()
        
        # Close TensorBoard writer
        if self.tensorboard_writer:
            self.tensorboard_writer.close()
        
        # Write final summary
        summary_file = self.log_dir / "summary.json"
        with open(summary_file, 'w') as f:
            json.dump(self.get_summary(), f, indent=2)
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()


def compare_experiments(experiment_dirs: List[str], output_file: str = "comparison.json") -> Dict[str, Any]:
    """
    Compare multiple experiments.
    
    Args:
        experiment_dirs: List of experiment directory paths
        output_file: Output file for comparison results
        
    Returns:
        Dictionary containing comparison data
        
    Validates: Requirement 12.9 - Support experiment comparison across multiple runs
    """
    comparison = {
        "experiments": [],
        "comparison_time": datetime.now().isoformat()
    }
    
    for exp_dir in experiment_dirs:
        exp_path = Path(exp_dir)
        summary_file = exp_path / "summary.json"
        
        if summary_file.exists():
            with open(summary_file, 'r') as f:
                summary = json.load(f)
                comparison["experiments"].append(summary)
    
    # Write comparison to file
    with open(output_file, 'w') as f:
        json.dump(comparison, f, indent=2)
    
    return comparison
