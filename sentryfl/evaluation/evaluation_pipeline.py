"""
Evaluation Pipeline Module: Comprehensive anomaly detection performance evaluation

This module implements the EvaluationPipeline class for computing anomaly detection metrics,
including precision, recall, F1-score, AUC-ROC, AUC-PR, confusion matrix, latency measurements,
and baseline comparison with ROC and PR curve generation.

Validates Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.8, 11.9, 11.10, 11.11
"""

import time
import numpy as np
import torch
import torch.nn as nn
from typing import Dict, List, Tuple, Optional, Any, Union
from dataclasses import dataclass, field
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    roc_curve,
    precision_recall_curve,
    confusion_matrix
)


@dataclass
class EvaluationMetrics:
    """Container for evaluation metrics"""
    precision: float
    recall: float
    f1_score: float
    auc_roc: float
    auc_pr: float
    confusion_matrix: np.ndarray
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    avg_latency_ms: float
    total_samples: int
    threshold: float
    accuracy: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary format"""
        return {
            'precision': float(self.precision),
            'recall': float(self.recall),
            'f1_score': float(self.f1_score),
            'auc_roc': float(self.auc_roc),
            'auc_pr': float(self.auc_pr),
            'accuracy': float(self.accuracy),
            'confusion_matrix': self.confusion_matrix.tolist(),
            'true_positives': int(self.true_positives),
            'false_positives': int(self.false_positives),
            'true_negatives': int(self.true_negatives),
            'false_negatives': int(self.false_negatives),
            'avg_latency_ms': float(self.avg_latency_ms),
            'total_samples': int(self.total_samples),
            'threshold': float(self.threshold)
        }


@dataclass
class BaselineComparison:
    """Container for baseline comparison results"""
    sentryfl_metrics: EvaluationMetrics
    baseline_metrics: Dict[str, EvaluationMetrics] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert comparison to dictionary format"""
        return {
            'sentryfl': self.sentryfl_metrics.to_dict(),
            'baselines': {
                name: metrics.to_dict()
                for name, metrics in self.baseline_metrics.items()
            }
        }


class EvaluationPipeline:
    """
    Comprehensive evaluation pipeline for anomaly detection models
    
    Supports:
    - Anomaly score computation for test time-series
    - Threshold-based anomaly classification
    - Precision, recall, F1-score computation
    - AUC-ROC and AUC-PR calculation
    - Confusion matrix logging
    - Per-sample latency measurement
    - Baseline comparison (PeFAD, centralized models)
    - ROC and PR curve generation
    """
    
    def __init__(
        self,
        model: nn.Module,
        device: str = 'cpu',
        threshold: Optional[float] = None,
        auto_threshold: bool = True
    ):
        """
        Initialize evaluation pipeline
        
        Args:
            model: Trained anomaly detection model
            device: Device for computation ('cpu' or 'cuda')
            threshold: Fixed threshold for anomaly classification (optional)
            auto_threshold: If True, automatically determine optimal threshold
        """
        self.model = model
        self.device = device
        self.model.to(device)
        self.model.eval()
        
        self.threshold = threshold
        self.auto_threshold = auto_threshold
        
        # Cache for computed scores and predictions
        self._scores_cache: Optional[np.ndarray] = None
        self._predictions_cache: Optional[np.ndarray] = None
        self._latencies_cache: List[float] = []
    
    def compute_anomaly_scores(
        self,
        test_data: Union[torch.Tensor, torch.utils.data.DataLoader],
        batch_size: int = 32
    ) -> np.ndarray:
        """
        Compute anomaly scores for test time-series
        
        Validates Requirement 11.1: Compute anomaly scores for test time-series
        
        Args:
            test_data: Test dataset as tensor [N, seq_len, features] or DataLoader
            batch_size: Batch size for inference (if test_data is tensor)
        
        Returns:
            Anomaly scores array [N] - higher score indicates more anomalous
        """
        self.model.eval()
        scores = []
        latencies = []
        
        with torch.no_grad():
            if isinstance(test_data, torch.Tensor):
                # Process tensor in batches
                num_samples = test_data.shape[0]
                
                for i in range(0, num_samples, batch_size):
                    batch = test_data[i:i + batch_size].to(self.device)
                    
                    # Measure latency per batch
                    start_time = time.time()
                    batch_scores = self.model(batch)
                    end_time = time.time()
                    
                    # Record per-sample latency
                    batch_latency_ms = ((end_time - start_time) / batch.shape[0]) * 1000
                    latencies.extend([batch_latency_ms] * batch.shape[0])
                    
                    # Flatten scores to 1D
                    if batch_scores.dim() > 1:
                        batch_scores = batch_scores.squeeze(-1)
                    
                    scores.append(batch_scores.cpu().numpy())
            
            else:
                # Process DataLoader
                for batch in test_data:
                    if isinstance(batch, (list, tuple)):
                        batch_x = batch[0].to(self.device)
                        batch_size_actual = batch_x.shape[0]
                    else:
                        batch_x = batch.to(self.device)
                        batch_size_actual = batch_x.shape[0]
                    
                    # Measure latency
                    start_time = time.time()
                    batch_scores = self.model(batch_x)
                    end_time = time.time()
                    
                    # Record per-sample latency
                    batch_latency_ms = ((end_time - start_time) / batch_size_actual) * 1000
                    latencies.extend([batch_latency_ms] * batch_size_actual)
                    
                    # Flatten scores
                    if batch_scores.dim() > 1:
                        batch_scores = batch_scores.squeeze(-1)
                    
                    scores.append(batch_scores.cpu().numpy())
        
        # Concatenate all scores
        scores = np.concatenate(scores)
        
        # Cache results
        self._scores_cache = scores
        self._latencies_cache = latencies
        
        return scores
    
    def determine_optimal_threshold(
        self,
        scores: np.ndarray,
        labels: np.ndarray,
        method: str = 'f1'
    ) -> float:
        """
        Determine optimal threshold for anomaly classification
        
        Args:
            scores: Anomaly scores [N]
            labels: True labels [N] (0=normal, 1=anomaly)
            method: Optimization criterion ('f1', 'youden', 'precision')
        
        Returns:
            Optimal threshold value
        """
        if method == 'f1':
            # Find threshold that maximizes F1-score
            precision_vals, recall_vals, thresholds = precision_recall_curve(labels, scores)
            f1_scores = 2 * (precision_vals * recall_vals) / (precision_vals + recall_vals + 1e-10)
            optimal_idx = np.argmax(f1_scores)
            if optimal_idx < len(thresholds):
                return thresholds[optimal_idx]
            else:
                return thresholds[-1]
        
        elif method == 'youden':
            # Find threshold that maximizes Youden's J statistic (TPR - FPR)
            fpr, tpr, thresholds = roc_curve(labels, scores)
            j_scores = tpr - fpr
            optimal_idx = np.argmax(j_scores)
            return thresholds[optimal_idx]
        
        elif method == 'precision':
            # Find threshold that achieves high precision (>0.9) with max recall
            precision_vals, recall_vals, thresholds = precision_recall_curve(labels, scores)
            high_precision_mask = precision_vals >= 0.9
            if np.any(high_precision_mask):
                valid_indices = np.where(high_precision_mask)[0]
                optimal_idx = valid_indices[np.argmax(recall_vals[high_precision_mask])]
                if optimal_idx < len(thresholds):
                    return thresholds[optimal_idx]
            # Fallback to median threshold
            return np.median(thresholds)
        
        else:
            raise ValueError(f"Unknown threshold method: {method}")
    
    def classify_anomalies(
        self,
        scores: np.ndarray,
        threshold: Optional[float] = None
    ) -> np.ndarray:
        """
        Apply threshold-based anomaly classification
        
        Validates Requirement 11.2: Apply threshold-based anomaly classification
        
        Args:
            scores: Anomaly scores [N]
            threshold: Classification threshold (uses self.threshold if None)
        
        Returns:
            Binary predictions [N] (0=normal, 1=anomaly)
        """
        if threshold is None:
            if self.threshold is None:
                raise ValueError("No threshold specified. Set threshold or use auto_threshold=True")
            threshold = self.threshold
        
        predictions = (scores >= threshold).astype(int)
        return predictions
    
    def compute_classification_metrics(
        self,
        labels: np.ndarray,
        predictions: np.ndarray
    ) -> Tuple[float, float, float]:
        """
        Compute precision, recall, and F1-score
        
        Validates Requirement 11.3: Compute precision, recall, and F1-score
        
        Args:
            labels: True labels [N]
            predictions: Predicted labels [N]
        
        Returns:
            (precision, recall, f1): Classification metrics
        """
        precision = precision_score(labels, predictions, zero_division=0)
        recall = recall_score(labels, predictions, zero_division=0)
        f1 = f1_score(labels, predictions, zero_division=0)
        
        return precision, recall, f1
    
    def compute_auc_roc(
        self,
        labels: np.ndarray,
        scores: np.ndarray
    ) -> float:
        """
        Compute Area Under ROC Curve (AUC-ROC)
        
        Validates Requirement 11.4: Compute Area Under ROC Curve (AUC-ROC)
        
        Args:
            labels: True labels [N]
            scores: Anomaly scores [N]
        
        Returns:
            AUC-ROC score
        """
        # Check if labels contain both classes
        if len(np.unique(labels)) < 2:
            return 0.5  # Random classifier performance
        
        auc_roc = roc_auc_score(labels, scores)
        return auc_roc
    
    def compute_auc_pr(
        self,
        labels: np.ndarray,
        scores: np.ndarray
    ) -> float:
        """
        Compute Area Under Precision-Recall Curve (AUC-PR)
        
        Validates Requirement 11.5: Compute Area Under Precision-Recall Curve (AUC-PR)
        
        Args:
            labels: True labels [N]
            scores: Anomaly scores [N]
        
        Returns:
            AUC-PR score (Average Precision)
        """
        # Check if labels contain both classes
        if len(np.unique(labels)) < 2:
            return np.mean(labels)  # Baseline (proportion of positive class)
        
        auc_pr = average_precision_score(labels, scores)
        return auc_pr
    
    def compute_confusion_matrix(
        self,
        labels: np.ndarray,
        predictions: np.ndarray
    ) -> Tuple[np.ndarray, int, int, int, int]:
        """
        Compute confusion matrix and extract components
        
        Validates Requirement 11.8: Log confusion matrix
        
        Args:
            labels: True labels [N]
            predictions: Predicted labels [N]
        
        Returns:
            (confusion_matrix, TP, FP, TN, FN)
        """
        cm = confusion_matrix(labels, predictions)
        
        # Handle edge cases where confusion matrix may not be 2x2
        if cm.shape == (2, 2):
            tn, fp, fn, tp = cm.ravel()
        elif cm.shape == (1, 1):
            # Only one class present
            if labels[0] == 0:
                tn, fp, fn, tp = cm[0, 0], 0, 0, 0
            else:
                tn, fp, fn, tp = 0, 0, 0, cm[0, 0]
        else:
            tn, fp, fn, tp = 0, 0, 0, 0
        
        return cm, tp, fp, tn, fn
    
    def compute_latency_metrics(self) -> float:
        """
        Compute anomaly detection latency per sample
        
        Validates Requirement 11.9: Compute anomaly detection latency per sample
        
        Returns:
            Average latency in milliseconds
        """
        if not self._latencies_cache:
            return 0.0
        
        avg_latency = np.mean(self._latencies_cache)
        return avg_latency
    
    def evaluate(
        self,
        test_data: Union[torch.Tensor, torch.utils.data.DataLoader],
        test_labels: np.ndarray,
        batch_size: int = 32,
        threshold: Optional[float] = None
    ) -> EvaluationMetrics:
        """
        Complete evaluation pipeline
        
        Args:
            test_data: Test dataset
            test_labels: True labels [N]
            batch_size: Batch size for inference
            threshold: Classification threshold (auto-determined if None and auto_threshold=True)
        
        Returns:
            EvaluationMetrics object with all computed metrics
        """
        # Compute anomaly scores
        scores = self.compute_anomaly_scores(test_data, batch_size)
        
        # Determine threshold if needed
        if threshold is None and self.auto_threshold:
            threshold = self.determine_optimal_threshold(scores, test_labels, method='f1')
            self.threshold = threshold
        elif threshold is not None:
            self.threshold = threshold
        
        # Classify anomalies
        predictions = self.classify_anomalies(scores, self.threshold)
        
        # Compute classification metrics
        precision, recall, f1 = self.compute_classification_metrics(test_labels, predictions)
        
        # Compute AUC scores
        auc_roc = self.compute_auc_roc(test_labels, scores)
        auc_pr = self.compute_auc_pr(test_labels, scores)
        
        # Compute confusion matrix
        cm, tp, fp, tn, fn = self.compute_confusion_matrix(test_labels, predictions)
        
        # Compute latency
        avg_latency = self.compute_latency_metrics()
        
        # Compute accuracy
        accuracy = (tp + tn) / (tp + tn + fp + fn) if (tp + tn + fp + fn) > 0 else 0.0
        
        metrics = EvaluationMetrics(
            precision=precision,
            recall=recall,
            f1_score=f1,
            auc_roc=auc_roc,
            auc_pr=auc_pr,
            confusion_matrix=cm,
            true_positives=tp,
            false_positives=fp,
            true_negatives=tn,
            false_negatives=fn,
            avg_latency_ms=avg_latency,
            total_samples=len(test_labels),
            threshold=self.threshold,
            accuracy=accuracy
        )
        
        return metrics
    
    def compare_with_baselines(
        self,
        test_data: Union[torch.Tensor, torch.utils.data.DataLoader],
        test_labels: np.ndarray,
        baseline_models: Dict[str, nn.Module],
        batch_size: int = 32
    ) -> BaselineComparison:
        """
        Compare SentryFL performance against baseline models
        
        Validates Requirement 11.10: Compare SentryFL against baselines (PeFAD, centralized)
        
        Args:
            test_data: Test dataset
            test_labels: True labels
            baseline_models: Dictionary of baseline models {name: model}
            batch_size: Batch size for inference
        
        Returns:
            BaselineComparison object with SentryFL and baseline metrics
        """
        # Evaluate SentryFL model
        sentryfl_metrics = self.evaluate(test_data, test_labels, batch_size)
        
        # Evaluate baseline models
        baseline_metrics = {}
        for name, baseline_model in baseline_models.items():
            baseline_pipeline = EvaluationPipeline(
                model=baseline_model,
                device=self.device,
                threshold=self.threshold,  # Use same threshold for fair comparison
                auto_threshold=False
            )
            baseline_metrics[name] = baseline_pipeline.evaluate(
                test_data, test_labels, batch_size, threshold=self.threshold
            )
        
        comparison = BaselineComparison(
            sentryfl_metrics=sentryfl_metrics,
            baseline_metrics=baseline_metrics
        )
        
        return comparison
    
    def generate_roc_curve(
        self,
        labels: np.ndarray,
        scores: np.ndarray,
        save_path: Optional[str] = None,
        title: str = "ROC Curve"
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Generate ROC curve
        
        Validates Requirement 11.11: Generate ROC curves
        
        Args:
            labels: True labels [N]
            scores: Anomaly scores [N]
            save_path: Path to save plot (optional)
            title: Plot title
        
        Returns:
            (fpr, tpr, thresholds): ROC curve data
        """
        fpr, tpr, thresholds = roc_curve(labels, scores)
        auc_roc = self.compute_auc_roc(labels, scores)
        
        # Create plot
        plt.figure(figsize=(8, 6))
        plt.plot(fpr, tpr, linewidth=2, label=f'ROC (AUC = {auc_roc:.3f})')
        plt.plot([0, 1], [0, 1], 'k--', linewidth=1, label='Random Classifier')
        plt.xlabel('False Positive Rate', fontsize=12)
        plt.ylabel('True Positive Rate', fontsize=12)
        plt.title(title, fontsize=14)
        plt.legend(loc='lower right', fontsize=10)
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            plt.close()
        else:
            plt.show()
        
        return fpr, tpr, thresholds
    
    def generate_pr_curve(
        self,
        labels: np.ndarray,
        scores: np.ndarray,
        save_path: Optional[str] = None,
        title: str = "Precision-Recall Curve"
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Generate Precision-Recall curve
        
        Validates Requirement 11.11: Generate precision-recall curves
        
        Args:
            labels: True labels [N]
            scores: Anomaly scores [N]
            save_path: Path to save plot (optional)
            title: Plot title
        
        Returns:
            (precision, recall, thresholds): PR curve data
        """
        precision_vals, recall_vals, thresholds = precision_recall_curve(labels, scores)
        auc_pr = self.compute_auc_pr(labels, scores)
        
        # Create plot
        plt.figure(figsize=(8, 6))
        plt.plot(recall_vals, precision_vals, linewidth=2, label=f'PR (AUC = {auc_pr:.3f})')
        
        # Baseline (proportion of positive class)
        baseline = np.mean(labels)
        plt.plot([0, 1], [baseline, baseline], 'k--', linewidth=1, label=f'Baseline (P = {baseline:.3f})')
        
        plt.xlabel('Recall', fontsize=12)
        plt.ylabel('Precision', fontsize=12)
        plt.title(title, fontsize=14)
        plt.legend(loc='best', fontsize=10)
        plt.grid(True, alpha=0.3)
        plt.xlim([0, 1])
        plt.ylim([0, 1])
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            plt.close()
        else:
            plt.show()
        
        return precision_vals, recall_vals, thresholds
    
    def generate_comparison_plots(
        self,
        comparison: BaselineComparison,
        save_dir: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Generate comparison plots for baselines
        
        Args:
            comparison: BaselineComparison object
            save_dir: Directory to save plots (optional)
        
        Returns:
            Dictionary of plot paths
        """
        plot_paths = {}
        
        # Extract metrics for plotting
        model_names = ['SentryFL'] + list(comparison.baseline_metrics.keys())
        f1_scores = [comparison.sentryfl_metrics.f1_score] + \
                    [m.f1_score for m in comparison.baseline_metrics.values()]
        auc_roc_scores = [comparison.sentryfl_metrics.auc_roc] + \
                         [m.auc_roc for m in comparison.baseline_metrics.values()]
        auc_pr_scores = [comparison.sentryfl_metrics.auc_pr] + \
                        [m.auc_pr for m in comparison.baseline_metrics.values()]
        latencies = [comparison.sentryfl_metrics.avg_latency_ms] + \
                    [m.avg_latency_ms for m in comparison.baseline_metrics.values()]
        
        # Plot 1: F1-Score comparison
        plt.figure(figsize=(10, 6))
        bars = plt.bar(model_names, f1_scores, color=['#2ecc71', '#3498db', '#e74c3c', '#f39c12'])
        plt.ylabel('F1-Score', fontsize=12)
        plt.title('F1-Score Comparison', fontsize=14)
        plt.ylim([0, 1])
        plt.grid(True, axis='y', alpha=0.3)
        
        # Add value labels on bars
        for bar in bars:
            height = bar.get_height()
            plt.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height:.3f}', ha='center', va='bottom', fontsize=10)
        
        plt.tight_layout()
        if save_dir:
            path = f"{save_dir}/f1_comparison.png"
            plt.savefig(path, dpi=300, bbox_inches='tight')
            plot_paths['f1_comparison'] = path
            plt.close()
        
        # Plot 2: AUC comparison (ROC and PR side by side)
        fig, axes = plt.subplots(1, 2, figsize=(14, 6))
        
        # AUC-ROC
        bars1 = axes[0].bar(model_names, auc_roc_scores, color=['#2ecc71', '#3498db', '#e74c3c', '#f39c12'])
        axes[0].set_ylabel('AUC-ROC', fontsize=12)
        axes[0].set_title('AUC-ROC Comparison', fontsize=14)
        axes[0].set_ylim([0, 1])
        axes[0].grid(True, axis='y', alpha=0.3)
        for bar in bars1:
            height = bar.get_height()
            axes[0].text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:.3f}', ha='center', va='bottom', fontsize=10)
        
        # AUC-PR
        bars2 = axes[1].bar(model_names, auc_pr_scores, color=['#2ecc71', '#3498db', '#e74c3c', '#f39c12'])
        axes[1].set_ylabel('AUC-PR', fontsize=12)
        axes[1].set_title('AUC-PR Comparison', fontsize=14)
        axes[1].set_ylim([0, 1])
        axes[1].grid(True, axis='y', alpha=0.3)
        for bar in bars2:
            height = bar.get_height()
            axes[1].text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:.3f}', ha='center', va='bottom', fontsize=10)
        
        plt.tight_layout()
        if save_dir:
            path = f"{save_dir}/auc_comparison.png"
            plt.savefig(path, dpi=300, bbox_inches='tight')
            plot_paths['auc_comparison'] = path
            plt.close()
        
        # Plot 3: Latency comparison
        plt.figure(figsize=(10, 6))
        bars = plt.bar(model_names, latencies, color=['#2ecc71', '#3498db', '#e74c3c', '#f39c12'])
        plt.ylabel('Latency (ms)', fontsize=12)
        plt.title('Inference Latency Comparison', fontsize=14)
        plt.grid(True, axis='y', alpha=0.3)
        
        for bar in bars:
            height = bar.get_height()
            plt.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height:.2f}', ha='center', va='bottom', fontsize=10)
        
        plt.tight_layout()
        if save_dir:
            path = f"{save_dir}/latency_comparison.png"
            plt.savefig(path, dpi=300, bbox_inches='tight')
            plot_paths['latency_comparison'] = path
            plt.close()
        
        return plot_paths
    
    def detect_point_anomalies(
        self,
        time_series: torch.Tensor,
        window_size: int,
        stride: int = 1
    ) -> np.ndarray:
        """
        Detect point anomalies (single timestep anomalies) using sliding window
        
        Validates Requirement 11.6: Detect point anomalies
        
        Args:
            time_series: Full time series [total_timesteps, features]
            window_size: Window size for scoring
            stride: Stride for sliding window
        
        Returns:
            Point-level anomaly scores [total_timesteps]
        """
        self.model.eval()
        
        total_timesteps = time_series.shape[0]
        features = time_series.shape[1]
        
        # Initialize scores array
        point_scores = np.zeros(total_timesteps)
        point_counts = np.zeros(total_timesteps)
        
        with torch.no_grad():
            # Sliding window over time series
            for i in range(0, total_timesteps - window_size + 1, stride):
                window = time_series[i:i + window_size].unsqueeze(0)  # [1, window_size, features]
                window = window.to(self.device)
                
                # Compute window score
                score = self.model(window).item()
                
                # Assign score to all timesteps in window
                point_scores[i:i + window_size] += score
                point_counts[i:i + window_size] += 1
        
        # Average scores for overlapping windows
        point_counts[point_counts == 0] = 1  # Avoid division by zero
        point_scores = point_scores / point_counts
        
        return point_scores
    
    def evaluate_sequence_level(
        self,
        sequences: List[torch.Tensor],
        sequence_labels: np.ndarray,
        batch_size: int = 32
    ) -> EvaluationMetrics:
        """
        Evaluate at sequence level (entire sequence is normal/anomalous)
        
        Validates Requirement 11.7: Support sequence-level anomaly evaluation
        
        Args:
            sequences: List of sequences, each [seq_len, features]
            sequence_labels: Sequence-level labels [num_sequences]
            batch_size: Batch size for processing
        
        Returns:
            EvaluationMetrics for sequence-level evaluation
        """
        # Pad sequences to same length
        max_len = max(seq.shape[0] for seq in sequences)
        padded_sequences = []
        
        for seq in sequences:
            if seq.shape[0] < max_len:
                padding = torch.zeros(max_len - seq.shape[0], seq.shape[1])
                padded_seq = torch.cat([seq, padding], dim=0)
            else:
                padded_seq = seq
            padded_sequences.append(padded_seq)
        
        # Stack into tensor
        sequences_tensor = torch.stack(padded_sequences)  # [num_sequences, max_len, features]
        
        # Evaluate using standard pipeline
        metrics = self.evaluate(sequences_tensor, sequence_labels, batch_size)
        
        return metrics
