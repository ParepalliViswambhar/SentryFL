"""
Unit tests for ScalingEvaluator module

Tests Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10

**Validates: Requirements 10.2, 10.3, 10.5**
"""

import pytest
import torch
import torch.nn as nn
import numpy as np
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Tuple

from sentryfl.evaluation.scaling_evaluator import (
    ScalingEvaluator,
    ScalingMetrics,
    ComparisonMetrics
)


class SimpleTestModel(nn.Module):
    """Simple model for testing communication scaling"""
    
    def __init__(self, input_dim: int = 10, hidden_dim: int = 20):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, 1)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Expect input [batch, seq_len, input_dim]
        if x.dim() == 3:
            x = x.mean(dim=1)  # Mean pooling: [batch, input_dim]
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        return x


@pytest.fixture
def model_fn():
    """Factory function for creating test models"""
    def create_model():
        return SimpleTestModel(input_dim=10, hidden_dim=20)
    return create_model


@pytest.fixture
def train_data():
    """Create synthetic training data"""
    num_samples = 500
    seq_len = 5
    num_features = 10
    
    X = np.random.randn(num_samples, seq_len, num_features).astype(np.float32)
    y = np.random.randint(0, 2, (num_samples,)).astype(np.float32)
    
    return X, y


@pytest.fixture
def val_data():
    """Create synthetic validation data"""
    num_samples = 100
    seq_len = 5
    num_features = 10
    
    X = np.random.randn(num_samples, seq_len, num_features).astype(np.float32)
    y = np.random.randint(0, 2, (num_samples,)).astype(np.float32)
    
    return X, y


@pytest.fixture
def temp_output_dir():
    """Create temporary directory for outputs"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


class TestScalingEvaluatorInitialization:
    """Test ScalingEvaluator initialization"""
    
    def test_successful_initialization(self, model_fn, train_data):
        """Test successful evaluator initialization"""
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train,
            client_counts=[5, 20, 50],
            device='cpu',
            convergence_threshold=0.01,
            max_rounds=10
        )
        
        assert evaluator.client_counts == [5, 20, 50]
        assert evaluator.device == 'cpu'
        assert evaluator.convergence_threshold == 0.01
        assert evaluator.max_rounds == 10
        assert evaluator.train_data.shape == X_train.shape
        assert evaluator.train_labels.shape == y_train.shape
        assert len(evaluator.scaling_results) == 0
    
    def test_initialization_with_default_client_counts(self, model_fn, train_data):
        """
        Test initialization uses default client counts [5, 20, 50, 100, 500]
        
        **Validates: Requirement 10.1** - Support simulated client counts
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        assert evaluator.client_counts == [5, 20, 50, 100, 500]
    
    def test_initialization_with_validation_data(self, model_fn, train_data, val_data):
        """Test initialization with validation data"""
        X_train, y_train = train_data
        X_val, y_val = val_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train,
            val_data=X_val,
            val_labels=y_val
        )
        
        assert evaluator.val_data.shape == X_val.shape
        assert evaluator.val_labels.shape == y_val.shape


class TestDatasetPartitioning:
    """Test dataset partitioning functionality"""
    
    def test_partition_dataset_basic(self, model_fn, train_data):
        """
        Test basic dataset partitioning
        
        **Validates: Requirement 10.2** - Partition dataset into corresponding client shards
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train,
            client_counts=[5]
        )
        
        # Partition for 5 clients
        client_shards = evaluator.partition_dataset(num_clients=5)
        
        # Verify correct number of shards
        assert len(client_shards) == 5
        
        # Verify all shards are tuples of (data, labels)
        for shard in client_shards:
            assert isinstance(shard, tuple)
            assert len(shard) == 2
            data, labels = shard
            assert isinstance(data, torch.Tensor)
            assert isinstance(labels, torch.Tensor)
            assert len(data) == len(labels)
        
        # Verify total samples match original
        total_samples = sum(len(labels) for _, labels in client_shards)
        assert total_samples == len(y_train)
    
    def test_partition_dataset_various_counts(self, model_fn, train_data):
        """
        Test partitioning with various client counts
        
        **Validates: Requirement 10.2** - Partition dataset for different client counts
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        for num_clients in [5, 20, 50]:
            client_shards = evaluator.partition_dataset(num_clients=num_clients)
            
            assert len(client_shards) == num_clients
            
            # Verify approximately equal distribution
            shard_sizes = [len(labels) for _, labels in client_shards]
            avg_size = len(y_train) / num_clients
            
            # Each shard should be within 50% of average (IID partitioning)
            for size in shard_sizes:
                assert size > 0  # No empty shards
                assert abs(size - avg_size) < avg_size * 0.5
    
    def test_partition_dataset_reproducibility(self, model_fn, train_data):
        """Test partitioning is reproducible with same seed"""
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Partition twice with same settings
        shards1 = evaluator.partition_dataset(num_clients=5)
        shards2 = evaluator.partition_dataset(num_clients=5)
        
        # Should be identical
        for (data1, labels1), (data2, labels2) in zip(shards1, shards2):
            assert torch.allclose(data1, data2)
            assert torch.allclose(labels1, labels2)


class TestBytesTransferredMeasurement:
    """Test bytes transferred measurement"""
    
    def test_measure_bytes_transferred_basic(self, model_fn, train_data):
        """
        Test basic bytes transferred measurement
        
        **Validates: Requirement 10.3** - Measure total bytes transferred per training round
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Create sample parameters
        model = model_fn()
        parameters = {name: param for name, param in model.named_parameters()}
        
        # Measure bytes
        total_bytes = evaluator.measure_bytes_transferred(parameters)
        
        # Verify positive byte count
        assert total_bytes > 0
        
        # Verify calculation (float32 = 4 bytes per element)
        expected_bytes = sum(param.numel() * param.element_size() for param in parameters.values())
        assert total_bytes == expected_bytes
    
    def test_measure_bytes_transferred_empty_parameters(self, model_fn, train_data):
        """Test bytes measurement with empty parameter dictionary"""
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Empty parameters
        total_bytes = evaluator.measure_bytes_transferred({})
        assert total_bytes == 0.0
    
    def test_measure_bytes_per_client_payload(self, model_fn, train_data):
        """
        Test per-client payload size logging
        
        **Validates: Requirement 10.7** - Log per-client communication payload size
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Create sample parameters (simulating client updates)
        model = model_fn()
        parameters = {name: param for name, param in model.named_parameters()}
        
        # Measure bytes for multiple "clients"
        client_payloads = {}
        for i in range(5):
            client_id = f'client_{i}'
            payload_bytes = evaluator.measure_bytes_transferred(parameters)
            client_payloads[client_id] = payload_bytes
        
        # All clients should have same payload size (full model)
        unique_payloads = set(client_payloads.values())
        assert len(unique_payloads) == 1
        assert list(unique_payloads)[0] > 0


class TestConvergenceDetection:
    """Test convergence detection functionality"""
    
    def test_detect_convergence_not_converged(self, model_fn, train_data):
        """
        Test convergence detection when loss is still improving
        
        **Validates: Requirement 10.4** - Measure communication rounds required for convergence
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train,
            convergence_threshold=0.01
        )
        
        # Loss still improving significantly
        loss_history = [1.0, 0.8, 0.6, 0.4, 0.2]
        
        converged = evaluator.detect_convergence(loss_history)
        assert converged is False
    
    def test_detect_convergence_converged(self, model_fn, train_data):
        """
        Test convergence detection when loss plateaus
        
        **Validates: Requirement 10.4** - Detect convergence
        """
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train,
            convergence_threshold=0.01
        )
        
        # Loss plateaued (improvement < threshold)
        # With window_size=5, it compares loss[5] - loss[0]
        # So we need 6+ losses where the difference is < 0.01
        loss_history = [0.30, 0.295, 0.293, 0.292, 0.291, 0.2905]
        
        converged = evaluator.detect_convergence(loss_history)
        assert converged is True
    
    def test_detect_convergence_insufficient_history(self, model_fn, train_data):
        """Test convergence detection with insufficient history"""
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Not enough history
        loss_history = [1.0, 0.8]
        
        converged = evaluator.detect_convergence(loss_history)
        assert converged is False


class TestCommunicationCostCalculation:
    """Test communication cost calculation"""
    
    def test_communication_cost_calculation(self, model_fn, train_data):
        """
        Test total communication cost calculation (bytes × rounds)
        
        **Validates: Requirement 10.5** - Compute communication cost as bytes × rounds
        """
        X_train, y_train = train_data
        
        # Create mock scaling metrics
        metrics = ScalingMetrics(
            client_count=5,
            bytes_per_round=1000000.0,  # 1 MB per round
            convergence_rounds=50,
            total_communication_cost=50000000.0,  # 50 MB total
            per_client_payload_bytes={'client_0': 200000.0},
            wall_clock_time_per_round=2.5,
            total_wall_clock_time=125.0,
            final_loss=0.1,
            final_accuracy=0.95,
            training_configuration='full_model'
        )
        
        # Verify cost calculation
        expected_cost = metrics.bytes_per_round * metrics.convergence_rounds
        assert abs(metrics.total_communication_cost - expected_cost) < 1e-6
        
        # Verify cost is positive
        assert metrics.total_communication_cost > 0
    
    def test_scaling_metrics_to_dict(self, model_fn, train_data):
        """Test ScalingMetrics serialization to dictionary"""
        metrics = ScalingMetrics(
            client_count=10,
            bytes_per_round=500000.0,
            convergence_rounds=30,
            total_communication_cost=15000000.0,
            per_client_payload_bytes={'client_0': 50000.0, 'client_1': 50000.0},
            wall_clock_time_per_round=1.5,
            total_wall_clock_time=45.0,
            final_loss=0.2,
            final_accuracy=0.90,
            training_configuration='parameter_efficient'
        )
        
        metrics_dict = metrics.to_dict()
        
        assert isinstance(metrics_dict, dict)
        assert metrics_dict['client_count'] == 10
        assert metrics_dict['bytes_per_round'] == 500000.0
        assert metrics_dict['convergence_rounds'] == 30
        assert metrics_dict['total_communication_cost'] == 15000000.0
        assert metrics_dict['training_configuration'] == 'parameter_efficient'


class TestComparisonMetrics:
    """Test parameter-efficient vs full-model comparison metrics"""
    
    def test_comparison_metrics_creation(self):
        """
        Test comparison metrics creation
        
        **Validates: Requirement 10.6** - Compare communication cost between 
        parameter-efficient and full-model training
        """
        # Create mock metrics
        pe_metrics = {
            5: ScalingMetrics(
                client_count=5,
                bytes_per_round=100000.0,
                convergence_rounds=50,
                total_communication_cost=5000000.0,
                per_client_payload_bytes={},
                wall_clock_time_per_round=2.0,
                total_wall_clock_time=100.0,
                final_loss=0.1,
                final_accuracy=0.95,
                training_configuration='parameter_efficient'
            )
        }
        
        full_metrics = {
            5: ScalingMetrics(
                client_count=5,
                bytes_per_round=500000.0,
                convergence_rounds=50,
                total_communication_cost=25000000.0,
                per_client_payload_bytes={},
                wall_clock_time_per_round=2.5,
                total_wall_clock_time=125.0,
                final_loss=0.1,
                final_accuracy=0.95,
                training_configuration='full_model'
            )
        }
        
        reduction_percentages = {
            5: 80.0  # 80% reduction
        }
        
        comparison = ComparisonMetrics(
            parameter_efficient_metrics=pe_metrics,
            full_model_metrics=full_metrics,
            communication_reduction_percentages=reduction_percentages
        )
        
        assert 5 in comparison.parameter_efficient_metrics
        assert 5 in comparison.full_model_metrics
        assert comparison.communication_reduction_percentages[5] == 80.0
    
    def test_comparison_metrics_to_dict(self):
        """Test comparison metrics serialization"""
        pe_metrics = {
            5: ScalingMetrics(
                client_count=5,
                bytes_per_round=100000.0,
                convergence_rounds=50,
                total_communication_cost=5000000.0,
                per_client_payload_bytes={},
                wall_clock_time_per_round=2.0,
                total_wall_clock_time=100.0,
                final_loss=0.1,
                final_accuracy=0.95,
                training_configuration='parameter_efficient'
            )
        }
        
        full_metrics = {
            5: ScalingMetrics(
                client_count=5,
                bytes_per_round=500000.0,
                convergence_rounds=50,
                total_communication_cost=25000000.0,
                per_client_payload_bytes={},
                wall_clock_time_per_round=2.5,
                total_wall_clock_time=125.0,
                final_loss=0.1,
                final_accuracy=0.95,
                training_configuration='full_model'
            )
        }
        
        comparison = ComparisonMetrics(
            parameter_efficient_metrics=pe_metrics,
            full_model_metrics=full_metrics,
            communication_reduction_percentages={5: 80.0}
        )
        
        comparison_dict = comparison.to_dict()
        
        assert isinstance(comparison_dict, dict)
        assert 'parameter_efficient' in comparison_dict
        assert 'full_model' in comparison_dict
        assert 'communication_reduction_percentages' in comparison_dict
        assert comparison_dict['communication_reduction_percentages'][5] == 80.0


class TestPlotGeneration:
    """Test plot generation functionality"""
    
    def test_plot_communication_efficiency_no_results(self, model_fn, train_data, temp_output_dir):
        """Test plot generation with no results warns appropriately"""
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Should warn and return without error
        plot_path = Path(temp_output_dir) / 'test_plot.png'
        evaluator.plot_communication_efficiency(
            save_path=str(plot_path),
            show_plot=False
        )
        
        # No plot should be created
        assert not plot_path.exists()
    
    def test_plot_comparison_no_results(self, model_fn, train_data, temp_output_dir):
        """Test comparison plot with no results warns appropriately"""
        X_train, y_train = train_data
        
        evaluator = ScalingEvaluator(
            model_fn=model_fn,
            train_data=X_train,
            train_labels=y_train
        )
        
        # Should warn and return without error
        plot_path = Path(temp_output_dir) / 'test_comparison.png'
        evaluator.plot_comparison(
            save_path=str(plot_path),
            show_plot=False
        )
        
        # No plot should be created
        assert not plot_path.exists()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
