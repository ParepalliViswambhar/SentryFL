"""
Unit tests for Evaluation Pipeline

Tests cover:
- Anomaly score computation (Requirement 11.1)
- Threshold-based anomaly classification (Requirement 11.2)
- Precision, recall, F1-score computation (Requirement 11.3)
- AUC-ROC calculation (Requirement 11.4)
- AUC-PR calculation (Requirement 11.5)
- Point anomaly detection (Requirement 11.6)
- Sequence-level evaluation (Requirement 11.7)
- Confusion matrix logging (Requirement 11.8)
- Latency measurement (Requirement 11.9)
- Baseline comparison (Requirement 11.10)
- ROC and PR curve generation (Requirement 11.11)
"""

import pytest
import torch
import torch.nn as nn
import numpy as np
import tempfile
import os
from pathlib import Path

from sentryfl.evaluation.evaluation_pipeline import (
    EvaluationPipeline,
    EvaluationMetrics,
    BaselineComparison
)


class SimpleAnomalyDetector(nn.Module):
    """Simple anomaly detector for testing"""
    def __init__(self, input_dim=10, hidden_dim=32):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, 1)
        self.relu = nn.ReLU()
    
    def forward(self, x):
        """
        Args:
            x: [batch, seq_len, features]
        Returns:
            scores: [batch, 1]
        """
        # Mean pooling over sequence dimension
        x = x.mean(dim=1)  # [batch, features]
        x = self.relu(self.fc1(x))
        scores = self.fc2(x)  # [batch, 1]
        return scores


@pytest.fixture
def simple_model():
    """Create a simple model for testing"""
    model = SimpleAnomalyDetector(input_dim=10, hidden_dim=32)
    # Initialize with small random weights for reproducible tests
    torch.manual_seed(42)
    for param in model.parameters():
        nn.init.normal_(param, mean=0, std=0.01)
    return model


@pytest.fixture
def synthetic_data():
    """
    Create synthetic anomaly detection dataset
    
    Returns:
        (test_data, test_labels): Test data and binary labels
    """
    np.random.seed(42)
    torch.manual_seed(42)
    
    num_samples = 200
    seq_len = 50
    features = 10
    
    # Generate normal samples (Gaussian noise)
    normal_samples = torch.randn(num_samples // 2, seq_len, features) * 0.5
    
    # Generate anomalous samples (larger magnitude + offset)
    anomalous_samples = torch.randn(num_samples // 2, seq_len, features) * 2.0 + 3.0
    
    # Combine and create labels
    test_data = torch.cat([normal_samples, anomalous_samples], dim=0)
    test_labels = np.array([0] * (num_samples // 2) + [1] * (num_samples // 2))
    
    # Shuffle
    indices = np.random.permutation(num_samples)
    test_data = test_data[indices]
    test_labels = test_labels[indices]
    
    return test_data, test_labels


@pytest.fixture
def evaluation_pipeline(simple_model):
    """Create evaluation pipeline with simple model"""
    return EvaluationPipeline(
        model=simple_model,
        device='cpu',
        threshold=None,
        auto_threshold=True
    )


class TestEvaluationMetrics:
    """Test suite for EvaluationMetrics dataclass"""
    
    def test_metrics_initialization(self):
        """Test that metrics can be initialized"""
        cm = np.array([[50, 10], [5, 35]])
        metrics = EvaluationMetrics(
            precision=0.85,
            recall=0.88,
            f1_score=0.86,
            auc_roc=0.92,
            auc_pr=0.89,
            confusion_matrix=cm,
            true_positives=35,
            false_positives=10,
            true_negatives=50,
            false_negatives=5,
            avg_latency_ms=1.5,
            total_samples=100,
            threshold=0.5,
            accuracy=0.85
        )
        
        assert metrics.precision == 0.85
        assert metrics.recall == 0.88
        assert metrics.f1_score == 0.86
        assert metrics.auc_roc == 0.92
        assert metrics.total_samples == 100
    
    def test_metrics_to_dict(self):
        """Test metrics serialization to dictionary"""
        cm = np.array([[50, 10], [5, 35]])
        metrics = EvaluationMetrics(
            precision=0.85,
            recall=0.88,
            f1_score=0.86,
            auc_roc=0.92,
            auc_pr=0.89,
            confusion_matrix=cm,
            true_positives=35,
            false_positives=10,
            true_negatives=50,
            false_negatives=5,
            avg_latency_ms=1.5,
            total_samples=100,
            threshold=0.5
        )
        
        metrics_dict = metrics.to_dict()
        
        assert isinstance(metrics_dict, dict)
        assert 'precision' in metrics_dict
        assert 'recall' in metrics_dict
        assert 'f1_score' in metrics_dict
        assert 'auc_roc' in metrics_dict
        assert 'confusion_matrix' in metrics_dict
        assert isinstance(metrics_dict['confusion_matrix'], list)


class TestAnomalyScoreComputation:
    """Test suite for anomaly score computation (Requirement 11.1)"""
    
    def test_compute_anomaly_scores_tensor(self, evaluation_pipeline, synthetic_data):
        """Test computing anomaly scores from tensor input"""
        test_data, _ = synthetic_data
        
        scores = evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        assert isinstance(scores, np.ndarray)
        assert scores.shape == (test_data.shape[0],)
        assert len(scores) == 200
    
    def test_compute_anomaly_scores_dataloader(self, evaluation_pipeline, synthetic_data):
        """Test computing anomaly scores from DataLoader input"""
        test_data, test_labels = synthetic_data
        
        # Create DataLoader
        dataset = torch.utils.data.TensorDataset(test_data, torch.tensor(test_labels))
        dataloader = torch.utils.data.DataLoader(dataset, batch_size=32, shuffle=False)
        
        scores = evaluation_pipeline.compute_anomaly_scores(dataloader)
        
        assert isinstance(scores, np.ndarray)
        assert scores.shape == (test_data.shape[0],)
    
    def test_scores_cached(self, evaluation_pipeline, synthetic_data):
        """Test that scores are cached after computation"""
        test_data, _ = synthetic_data
        
        scores = evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        assert evaluation_pipeline._scores_cache is not None
        assert np.array_equal(evaluation_pipeline._scores_cache, scores)
    
    def test_latencies_recorded(self, evaluation_pipeline, synthetic_data):
        """Test that latencies are recorded during score computation"""
        test_data, _ = synthetic_data
        
        evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        assert len(evaluation_pipeline._latencies_cache) > 0
        assert all(latency >= 0 for latency in evaluation_pipeline._latencies_cache)


class TestThresholdBasedClassification:
    """Test suite for threshold-based classification (Requirement 11.2)"""
    
    def test_classify_with_fixed_threshold(self, evaluation_pipeline):
        """Test classification with fixed threshold"""
        scores = np.array([0.1, 0.3, 0.5, 0.7, 0.9])
        threshold = 0.5
        
        predictions = evaluation_pipeline.classify_anomalies(scores, threshold)
        
        expected = np.array([0, 0, 1, 1, 1])
        assert np.array_equal(predictions, expected)
    
    def test_classify_with_pipeline_threshold(self, evaluation_pipeline):
        """Test classification using pipeline's stored threshold"""
        evaluation_pipeline.threshold = 0.6
        scores = np.array([0.1, 0.3, 0.5, 0.7, 0.9])
        
        predictions = evaluation_pipeline.classify_anomalies(scores)
        
        expected = np.array([0, 0, 0, 1, 1])
        assert np.array_equal(predictions, expected)
    
    def test_classify_no_threshold_raises_error(self, evaluation_pipeline):
        """Test that classification without threshold raises error"""
        evaluation_pipeline.threshold = None
        scores = np.array([0.1, 0.5, 0.9])
        
        with pytest.raises(ValueError, match="No threshold specified"):
            evaluation_pipeline.classify_anomalies(scores)
    
    def test_determine_optimal_threshold_f1(self, evaluation_pipeline):
        """Test optimal threshold determination using F1 method"""
        # Perfect separation scenario
        scores = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
        labels = np.array([0, 0, 0, 1, 1, 1])
        
        threshold = evaluation_pipeline.determine_optimal_threshold(scores, labels, method='f1')
        
        assert isinstance(threshold, float)
        assert 0.3 <= threshold <= 0.7  # Should be at or between the two groups
    
    def test_determine_optimal_threshold_youden(self, evaluation_pipeline):
        """Test optimal threshold determination using Youden's J statistic"""
        scores = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
        labels = np.array([0, 0, 0, 1, 1, 1])
        
        threshold = evaluation_pipeline.determine_optimal_threshold(scores, labels, method='youden')
        
        assert isinstance(threshold, float)
        assert 0.0 <= threshold <= 1.0


class TestClassificationMetrics:
    """Test suite for classification metrics (Requirement 11.3)"""
    
    def test_compute_classification_metrics_perfect(self, evaluation_pipeline):
        """Test metrics with perfect predictions"""
        labels = np.array([0, 0, 1, 1, 1])
        predictions = np.array([0, 0, 1, 1, 1])
        
        precision, recall, f1 = evaluation_pipeline.compute_classification_metrics(labels, predictions)
        
        assert precision == 1.0
        assert recall == 1.0
        assert f1 == 1.0
    
    def test_compute_classification_metrics_imperfect(self, evaluation_pipeline):
        """Test metrics with imperfect predictions"""
        labels = np.array([0, 0, 0, 1, 1, 1, 1, 1])
        predictions = np.array([0, 0, 1, 1, 1, 0, 1, 1])
        
        precision, recall, f1 = evaluation_pipeline.compute_classification_metrics(labels, predictions)
        
        # TP=4, FP=1, FN=1
        # Precision = 4/(4+1) = 0.8
        # Recall = 4/(4+1) = 0.8
        # F1 = 0.8
        assert abs(precision - 0.8) < 1e-6
        assert abs(recall - 0.8) < 1e-6
        assert abs(f1 - 0.8) < 1e-6
    
    def test_compute_classification_metrics_all_negative(self, evaluation_pipeline):
        """Test metrics when all predictions are negative"""
        labels = np.array([0, 0, 1, 1])
        predictions = np.array([0, 0, 0, 0])
        
        precision, recall, f1 = evaluation_pipeline.compute_classification_metrics(labels, predictions)
        
        # Precision is 0 with zero_division=0
        # Recall = 0
        assert precision == 0.0
        assert recall == 0.0
        assert f1 == 0.0


class TestAUCMetrics:
    """Test suite for AUC-ROC and AUC-PR (Requirements 11.4, 11.5)"""
    
    def test_compute_auc_roc_perfect(self, evaluation_pipeline):
        """Test AUC-ROC with perfect separation"""
        labels = np.array([0, 0, 0, 1, 1, 1])
        scores = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
        
        auc_roc = evaluation_pipeline.compute_auc_roc(labels, scores)
        
        assert auc_roc == 1.0
    
    def test_compute_auc_roc_random(self, evaluation_pipeline):
        """Test AUC-ROC with random predictions"""
        np.random.seed(42)
        labels = np.array([0, 1, 0, 1, 0, 1] * 10)
        scores = np.random.rand(60)
        
        auc_roc = evaluation_pipeline.compute_auc_roc(labels, scores)
        
        # Random classifier should have AUC around 0.5
        assert 0.3 < auc_roc < 0.7
    
    def test_compute_auc_roc_single_class(self, evaluation_pipeline):
        """Test AUC-ROC when only one class is present"""
        labels = np.array([0, 0, 0, 0])
        scores = np.array([0.1, 0.2, 0.3, 0.4])
        
        auc_roc = evaluation_pipeline.compute_auc_roc(labels, scores)
        
        # Should return 0.5 (random classifier baseline)
        assert auc_roc == 0.5
    
    def test_compute_auc_pr_perfect(self, evaluation_pipeline):
        """Test AUC-PR with perfect separation"""
        labels = np.array([0, 0, 0, 1, 1, 1])
        scores = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
        
        auc_pr = evaluation_pipeline.compute_auc_pr(labels, scores)
        
        assert auc_pr == 1.0
    
    def test_compute_auc_pr_single_class(self, evaluation_pipeline):
        """Test AUC-PR when only one class is present"""
        labels = np.array([0, 0, 0, 0])
        scores = np.array([0.1, 0.2, 0.3, 0.4])
        
        auc_pr = evaluation_pipeline.compute_auc_pr(labels, scores)
        
        # Should return baseline (proportion of positive class = 0)
        assert auc_pr == 0.0


class TestConfusionMatrix:
    """Test suite for confusion matrix (Requirement 11.8)"""
    
    def test_compute_confusion_matrix_perfect(self, evaluation_pipeline):
        """Test confusion matrix with perfect predictions"""
        labels = np.array([0, 0, 1, 1])
        predictions = np.array([0, 0, 1, 1])
        
        cm, tp, fp, tn, fn = evaluation_pipeline.compute_confusion_matrix(labels, predictions)
        
        assert tn == 2
        assert fp == 0
        assert fn == 0
        assert tp == 2
        assert cm.shape == (2, 2)
    
    def test_compute_confusion_matrix_with_errors(self, evaluation_pipeline):
        """Test confusion matrix with misclassifications"""
        labels = np.array([0, 0, 0, 1, 1, 1])
        predictions = np.array([0, 1, 0, 1, 0, 1])
        
        cm, tp, fp, tn, fn = evaluation_pipeline.compute_confusion_matrix(labels, predictions)
        
        # TN=2, FP=1, FN=1, TP=2
        assert tn == 2
        assert fp == 1
        assert fn == 1
        assert tp == 2
    
    def test_compute_confusion_matrix_all_negative_predictions(self, evaluation_pipeline):
        """Test confusion matrix when all predictions are negative"""
        labels = np.array([0, 0, 1, 1])
        predictions = np.array([0, 0, 0, 0])
        
        cm, tp, fp, tn, fn = evaluation_pipeline.compute_confusion_matrix(labels, predictions)
        
        assert tn == 2
        assert fp == 0
        assert fn == 2
        assert tp == 0


class TestLatencyMeasurement:
    """Test suite for latency measurement (Requirement 11.9)"""
    
    def test_compute_latency_metrics(self, evaluation_pipeline, synthetic_data):
        """Test latency computation after score computation"""
        test_data, _ = synthetic_data
        
        # Compute scores (which records latencies)
        evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        # Compute latency
        avg_latency = evaluation_pipeline.compute_latency_metrics()
        
        assert isinstance(avg_latency, float)
        assert avg_latency > 0
    
    def test_latency_metrics_no_cache(self, evaluation_pipeline):
        """Test latency computation with empty cache"""
        avg_latency = evaluation_pipeline.compute_latency_metrics()
        
        assert avg_latency == 0.0


class TestCompleteEvaluation:
    """Test suite for complete evaluation pipeline"""
    
    def test_evaluate_full_pipeline(self, evaluation_pipeline, synthetic_data):
        """Test complete evaluation pipeline"""
        test_data, test_labels = synthetic_data
        
        metrics = evaluation_pipeline.evaluate(test_data, test_labels, batch_size=32)
        
        assert isinstance(metrics, EvaluationMetrics)
        assert 0 <= metrics.precision <= 1
        assert 0 <= metrics.recall <= 1
        assert 0 <= metrics.f1_score <= 1
        assert 0 <= metrics.auc_roc <= 1
        assert 0 <= metrics.auc_pr <= 1
        assert metrics.avg_latency_ms >= 0
        assert metrics.total_samples == 200
        assert metrics.threshold is not None
    
    def test_evaluate_with_fixed_threshold(self, evaluation_pipeline, synthetic_data):
        """Test evaluation with fixed threshold"""
        test_data, test_labels = synthetic_data
        
        metrics = evaluation_pipeline.evaluate(test_data, test_labels, batch_size=32, threshold=0.0)
        
        assert metrics.threshold == 0.0
    
    def test_evaluate_accuracy_computation(self, evaluation_pipeline, synthetic_data):
        """Test that accuracy is computed correctly"""
        test_data, test_labels = synthetic_data
        
        metrics = evaluation_pipeline.evaluate(test_data, test_labels, batch_size=32)
        
        expected_accuracy = (metrics.true_positives + metrics.true_negatives) / metrics.total_samples
        assert abs(metrics.accuracy - expected_accuracy) < 1e-6


class TestBaselineComparison:
    """Test suite for baseline comparison (Requirement 11.10)"""
    
    def test_compare_with_baselines(self, evaluation_pipeline, simple_model, synthetic_data):
        """Test comparison with baseline models"""
        test_data, test_labels = synthetic_data
        
        # Create baseline models (slightly different architectures)
        baseline1 = SimpleAnomalyDetector(input_dim=10, hidden_dim=16)
        baseline2 = SimpleAnomalyDetector(input_dim=10, hidden_dim=64)
        
        baseline_models = {
            'baseline_small': baseline1,
            'baseline_large': baseline2
        }
        
        comparison = evaluation_pipeline.compare_with_baselines(
            test_data,
            test_labels,
            baseline_models,
            batch_size=32
        )
        
        assert isinstance(comparison, BaselineComparison)
        assert isinstance(comparison.sentryfl_metrics, EvaluationMetrics)
        assert 'baseline_small' in comparison.baseline_metrics
        assert 'baseline_large' in comparison.baseline_metrics
        assert isinstance(comparison.baseline_metrics['baseline_small'], EvaluationMetrics)
    
    def test_baseline_comparison_to_dict(self, evaluation_pipeline, simple_model, synthetic_data):
        """Test baseline comparison serialization"""
        test_data, test_labels = synthetic_data
        
        baseline1 = SimpleAnomalyDetector(input_dim=10, hidden_dim=16)
        baseline_models = {'baseline': baseline1}
        
        comparison = evaluation_pipeline.compare_with_baselines(
            test_data, test_labels, baseline_models, batch_size=32
        )
        
        comparison_dict = comparison.to_dict()
        
        assert isinstance(comparison_dict, dict)
        assert 'sentryfl' in comparison_dict
        assert 'baselines' in comparison_dict
        assert 'baseline' in comparison_dict['baselines']


class TestCurveGeneration:
    """Test suite for ROC and PR curve generation (Requirement 11.11)"""
    
    def test_generate_roc_curve(self, evaluation_pipeline, synthetic_data):
        """Test ROC curve generation"""
        test_data, test_labels = synthetic_data
        
        # Compute scores first
        scores = evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        # Generate ROC curve (without saving)
        fpr, tpr, thresholds = evaluation_pipeline.generate_roc_curve(
            test_labels, scores, save_path=None
        )
        
        assert isinstance(fpr, np.ndarray)
        assert isinstance(tpr, np.ndarray)
        assert isinstance(thresholds, np.ndarray)
        assert len(fpr) == len(tpr)
        # sklearn roc_curve returns fpr/tpr with one more point than thresholds
        assert len(fpr) >= len(thresholds)
    
    def test_generate_roc_curve_save(self, evaluation_pipeline, synthetic_data):
        """Test ROC curve generation with file save"""
        test_data, test_labels = synthetic_data
        scores = evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            save_path = os.path.join(tmpdir, 'roc_curve.png')
            
            fpr, tpr, thresholds = evaluation_pipeline.generate_roc_curve(
                test_labels, scores, save_path=save_path
            )
            
            assert os.path.exists(save_path)
            assert os.path.getsize(save_path) > 0
    
    def test_generate_pr_curve(self, evaluation_pipeline, synthetic_data):
        """Test Precision-Recall curve generation"""
        test_data, test_labels = synthetic_data
        scores = evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        precision_vals, recall_vals, thresholds = evaluation_pipeline.generate_pr_curve(
            test_labels, scores, save_path=None
        )
        
        assert isinstance(precision_vals, np.ndarray)
        assert isinstance(recall_vals, np.ndarray)
        assert isinstance(thresholds, np.ndarray)
        assert len(precision_vals) == len(recall_vals)
    
    def test_generate_pr_curve_save(self, evaluation_pipeline, synthetic_data):
        """Test PR curve generation with file save"""
        test_data, test_labels = synthetic_data
        scores = evaluation_pipeline.compute_anomaly_scores(test_data, batch_size=32)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            save_path = os.path.join(tmpdir, 'pr_curve.png')
            
            precision_vals, recall_vals, thresholds = evaluation_pipeline.generate_pr_curve(
                test_labels, scores, save_path=save_path
            )
            
            assert os.path.exists(save_path)
            assert os.path.getsize(save_path) > 0
    
    def test_generate_comparison_plots(self, evaluation_pipeline, simple_model, synthetic_data):
        """Test comparison plot generation"""
        test_data, test_labels = synthetic_data
        
        baseline1 = SimpleAnomalyDetector(input_dim=10, hidden_dim=16)
        baseline_models = {'baseline': baseline1}
        
        comparison = evaluation_pipeline.compare_with_baselines(
            test_data, test_labels, baseline_models, batch_size=32
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            plot_paths = evaluation_pipeline.generate_comparison_plots(
                comparison, save_dir=tmpdir
            )
            
            assert isinstance(plot_paths, dict)
            assert 'f1_comparison' in plot_paths
            assert 'auc_comparison' in plot_paths
            assert 'latency_comparison' in plot_paths
            
            # Check that files exist
            for path in plot_paths.values():
                assert os.path.exists(path)
                assert os.path.getsize(path) > 0


class TestPointAnomalyDetection:
    """Test suite for point anomaly detection (Requirement 11.6)"""
    
    def test_detect_point_anomalies(self, evaluation_pipeline):
        """Test point-level anomaly detection"""
        # Create simple time series
        total_timesteps = 200
        features = 10
        time_series = torch.randn(total_timesteps, features)
        
        window_size = 50
        stride = 10
        
        point_scores = evaluation_pipeline.detect_point_anomalies(
            time_series, window_size, stride
        )
        
        assert isinstance(point_scores, np.ndarray)
        assert point_scores.shape == (total_timesteps,)
        assert np.all(point_scores >= 0)  # Scores should be non-negative after averaging
    
    def test_point_anomalies_sliding_window(self, evaluation_pipeline):
        """Test that sliding window covers entire time series"""
        total_timesteps = 100
        features = 10
        time_series = torch.randn(total_timesteps, features)
        
        window_size = 20
        stride = 5
        
        point_scores = evaluation_pipeline.detect_point_anomalies(
            time_series, window_size, stride
        )
        
        # All timesteps should have scores (no zeros except possibly at edges)
        non_zero_scores = np.count_nonzero(point_scores)
        assert non_zero_scores >= total_timesteps - window_size


class TestSequenceLevelEvaluation:
    """Test suite for sequence-level evaluation (Requirement 11.7)"""
    
    def test_evaluate_sequence_level(self, evaluation_pipeline):
        """Test sequence-level evaluation"""
        # Create sequences of varying lengths
        sequences = [
            torch.randn(50, 10),
            torch.randn(75, 10),
            torch.randn(60, 10),
            torch.randn(80, 10)
        ]
        sequence_labels = np.array([0, 1, 0, 1])
        
        metrics = evaluation_pipeline.evaluate_sequence_level(
            sequences, sequence_labels, batch_size=2
        )
        
        assert isinstance(metrics, EvaluationMetrics)
        assert metrics.total_samples == 4
        assert 0 <= metrics.f1_score <= 1
    
    def test_sequence_level_padding(self, evaluation_pipeline):
        """Test that sequences are padded correctly"""
        # Create sequences of different lengths
        # Use correct feature dimension (10) to match the model
        sequences = [
            torch.randn(30, 10),
            torch.randn(50, 10),
            torch.randn(40, 10)
        ]
        sequence_labels = np.array([0, 1, 1])
        
        metrics = evaluation_pipeline.evaluate_sequence_level(
            sequences, sequence_labels, batch_size=3
        )
        
        assert metrics.total_samples == 3


class TestEdgeCases:
    """Test suite for edge cases and error handling"""
    
    def test_empty_latency_cache(self, evaluation_pipeline):
        """Test latency computation with empty cache"""
        avg_latency = evaluation_pipeline.compute_latency_metrics()
        assert avg_latency == 0.0
    
    def test_single_sample_evaluation(self, evaluation_pipeline):
        """Test evaluation with single sample"""
        test_data = torch.randn(1, 50, 10)
        test_labels = np.array([1])
        
        # Should not raise errors
        metrics = evaluation_pipeline.evaluate(test_data, test_labels, batch_size=1)
        assert metrics.total_samples == 1
    
    def test_all_same_predictions(self, evaluation_pipeline):
        """Test metrics when all predictions are the same"""
        labels = np.array([0, 0, 1, 1])
        predictions = np.array([1, 1, 1, 1])
        
        precision, recall, f1 = evaluation_pipeline.compute_classification_metrics(labels, predictions)
        
        # All predictions are positive
        # Precision = TP / (TP + FP) = 2 / 4 = 0.5
        # Recall = TP / (TP + FN) = 2 / 2 = 1.0
        assert abs(precision - 0.5) < 1e-6
        assert recall == 1.0
    
    def test_threshold_edge_values(self, evaluation_pipeline):
        """Test classification with edge threshold values"""
        scores = np.array([0.0, 0.5, 1.0])
        
        # Threshold at 0.0 - all should be anomalies
        preds = evaluation_pipeline.classify_anomalies(scores, threshold=0.0)
        assert np.all(preds == 1)
        
        # Threshold at 1.0 - only score >= 1.0 is anomaly
        preds = evaluation_pipeline.classify_anomalies(scores, threshold=1.0)
        assert np.array_equal(preds, np.array([0, 0, 1]))


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
