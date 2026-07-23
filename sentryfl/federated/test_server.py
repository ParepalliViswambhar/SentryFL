"""
Unit tests for Aggregation Server and Byzantine Robust Aggregator

Tests cover:
- FedAvg weighted averaging
- Trimmed Mean Byzantine-robust aggregation
- NaN/Inf validation
- Checkpoint saving and loading
- Client participation tracking
- Aggregation statistics

Requirements: 7.3, 7.4, 7.5, 7.9, 7.11
"""

import pytest
import torch
import torch.nn as nn
import tempfile
import shutil
from pathlib import Path
import numpy as np

from sentryfl.federated.server import AggregationServer
from sentryfl.federated.byzantine_aggregator import ByzantineRobustAggregator


class SimpleModel(nn.Module):
    """Simple model for testing"""
    def __init__(self, input_dim=10, hidden_dim=5, output_dim=1):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, output_dim)
    
    def forward(self, x):
        x = torch.relu(self.fc1(x))
        return self.fc2(x)


@pytest.fixture
def simple_model():
    """Fixture providing a simple model"""
    return SimpleModel(input_dim=10, hidden_dim=5, output_dim=1)


@pytest.fixture
def temp_checkpoint_dir():
    """Fixture providing a temporary checkpoint directory"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture
def aggregation_server(simple_model, temp_checkpoint_dir):
    """Fixture providing an AggregationServer instance"""
    return AggregationServer(
        model=simple_model,
        checkpoint_dir=temp_checkpoint_dir,
        checkpoint_frequency=5,
        device='cpu'
    )


@pytest.fixture
def client_updates(simple_model):
    """
    Fixture providing mock client updates.
    
    Creates 3 clients with different sample counts:
    - Client 0: 100 samples
    - Client 1: 200 samples  
    - Client 2: 150 samples
    """
    updates = {}
    
    for i in range(3):
        # Create perturbed copy of model parameters
        params = {}
        for name, param in simple_model.named_parameters():
            # Add small random perturbation
            perturbation = torch.randn_like(param) * 0.1
            params[name] = param.detach().clone() + perturbation
        
        updates[f'client_{i}'] = {
            'parameters': params,
            'num_samples': 100 * (i + 1),  # 100, 200, 300 samples
            'metrics': {'loss': 0.5 - i * 0.1}
        }
    
    return updates


class TestAggregationServer:
    """Test suite for AggregationServer"""
    
    def test_initialization(self, simple_model, temp_checkpoint_dir):
        """Test server initialization"""
        server = AggregationServer(
            model=simple_model,
            checkpoint_dir=temp_checkpoint_dir,
            checkpoint_frequency=10,
            device='cpu'
        )
        
        assert server.current_round == 0
        assert server.checkpoint_frequency == 10
        assert len(server.pending_updates) == 0
        assert Path(temp_checkpoint_dir).exists()
    
    def test_broadcast_global_model(self, aggregation_server, simple_model):
        """
        Test broadcasting global model parameters.
        
        Requirements: 7.1
        """
        # Broadcast model
        global_params = aggregation_server.broadcast_global_model()
        
        # Check all parameters are present
        model_params = dict(simple_model.named_parameters())
        assert len(global_params) == len(model_params)
        
        # Check parameters are on CPU
        for name, param in global_params.items():
            assert param.device.type == 'cpu'
            assert name in model_params
            # Check values match
            assert torch.allclose(param, model_params[name].cpu(), rtol=1e-5)
    
    def test_collect_client_updates(self, aggregation_server):
        """
        Test collecting client updates.
        
        Requirements: 7.2
        """
        # Create mock parameters
        params = {
            'fc1.weight': torch.randn(5, 10),
            'fc1.bias': torch.randn(5),
            'fc2.weight': torch.randn(1, 5),
            'fc2.bias': torch.randn(1)
        }
        
        # Collect update
        aggregation_server.collect_client_updates(
            client_id='client_0',
            parameters=params,
            num_samples=100,
            metrics={'loss': 0.5}
        )
        
        # Verify update stored
        assert 'client_0' in aggregation_server.pending_updates
        assert aggregation_server.pending_updates['client_0']['num_samples'] == 100
        assert 'client_0' in aggregation_server.participating_clients
    
    def test_nan_inf_validation(self, aggregation_server):
        """
        Test NaN/Inf validation excludes invalid updates.
        
        Requirements: 7.9
        """
        # Create parameters with NaN
        params_with_nan = {
            'fc1.weight': torch.randn(5, 10),
            'fc1.bias': torch.tensor([float('nan')] * 5),
            'fc2.weight': torch.randn(1, 5),
            'fc2.bias': torch.randn(1)
        }
        
        # Try to collect update with NaN
        aggregation_server.collect_client_updates(
            client_id='client_nan',
            parameters=params_with_nan,
            num_samples=100
        )
        
        # Should be rejected
        assert 'client_nan' not in aggregation_server.pending_updates
        
        # Create parameters with Inf
        params_with_inf = {
            'fc1.weight': torch.tensor([[float('inf')] * 10] * 5),
            'fc1.bias': torch.randn(5),
            'fc2.weight': torch.randn(1, 5),
            'fc2.bias': torch.randn(1)
        }
        
        # Try to collect update with Inf
        aggregation_server.collect_client_updates(
            client_id='client_inf',
            parameters=params_with_inf,
            num_samples=100
        )
        
        # Should be rejected
        assert 'client_inf' not in aggregation_server.pending_updates
        
        # Valid parameters should be accepted
        valid_params = {
            'fc1.weight': torch.randn(5, 10),
            'fc1.bias': torch.randn(5),
            'fc2.weight': torch.randn(1, 5),
            'fc2.bias': torch.randn(1)
        }
        
        aggregation_server.collect_client_updates(
            client_id='client_valid',
            parameters=valid_params,
            num_samples=100
        )
        
        assert 'client_valid' in aggregation_server.pending_updates
    
    def test_fedavg_aggregation(self, aggregation_server, client_updates):
        """
        Test FedAvg produces correct weighted average.
        
        Requirements: 7.3
        """
        # Collect client updates
        for client_id, update in client_updates.items():
            aggregation_server.collect_client_updates(
                client_id=client_id,
                parameters=update['parameters'],
                num_samples=update['num_samples'],
                metrics=update['metrics']
            )
        
        # Perform aggregation
        stats = aggregation_server.aggregate_updates(round_num=1, min_clients=2)
        
        # Check aggregation succeeded (status only present if failed)
        assert stats.get('status') != 'insufficient_clients'
        assert stats['num_participating_clients'] == 3
        assert stats['aggregation_method'] == 'fedavg'
        
        # Manually compute expected weighted average for verification
        total_samples = sum(update['num_samples'] for update in client_updates.values())
        
        # Get first parameter to check
        param_name = 'fc1.weight'
        expected = None
        
        for client_id, update in client_updates.items():
            weight = update['num_samples'] / total_samples
            client_param = update['parameters'][param_name]
            
            if expected is None:
                expected = weight * client_param
            else:
                expected += weight * client_param
        
        # Get actual aggregated parameter
        actual = aggregation_server.get_global_model().state_dict()[param_name]
        
        # Check they match (allowing for floating point errors)
        assert torch.allclose(actual, expected, rtol=1e-4, atol=1e-6)
    
    def test_checkpoint_save_and_load(self, aggregation_server, client_updates, temp_checkpoint_dir):
        """
        Test checkpoint saving and loading.
        
        Requirements: 7.11
        """
        # Collect updates and aggregate
        for client_id, update in client_updates.items():
            aggregation_server.collect_client_updates(
                client_id=client_id,
                parameters=update['parameters'],
                num_samples=update['num_samples']
            )
        
        aggregation_server.aggregate_updates(round_num=5)
        
        # Save checkpoint (should trigger at round 5 with frequency 5)
        checkpoint_path = Path(temp_checkpoint_dir) / "global_model_round_5.pt"
        assert checkpoint_path.exists()
        
        # Store original model state
        original_state = aggregation_server.get_global_model().state_dict()
        
        # Create new server and load checkpoint
        new_server = AggregationServer(
            model=SimpleModel(),
            checkpoint_dir=temp_checkpoint_dir,
            device='cpu'
        )
        
        metadata = new_server.load_checkpoint(str(checkpoint_path))
        
        # Verify state restored
        assert new_server.current_round == 5
        
        # Verify model parameters match
        loaded_state = new_server.get_global_model().state_dict()
        for name in original_state:
            assert torch.allclose(
                original_state[name],
                loaded_state[name],
                rtol=1e-5
            )
    
    def test_aggregation_statistics(self, aggregation_server, client_updates):
        """
        Test aggregation statistics computation.
        
        Requirements: 7.8
        """
        # Collect updates
        for client_id, update in client_updates.items():
            aggregation_server.collect_client_updates(
                client_id=client_id,
                parameters=update['parameters'],
                num_samples=update['num_samples']
            )
        
        # Aggregate
        stats = aggregation_server.aggregate_updates(round_num=1)
        
        # Check statistics present
        assert 'avg_parameter_variance' in stats
        assert 'max_parameter_variance' in stats
        assert 'min_parameter_variance' in stats
        assert 'total_samples' in stats
        assert 'client_sample_counts' in stats
        assert 'avg_samples_per_client' in stats
        
        # Verify sample counts
        total_samples = sum(update['num_samples'] for update in client_updates.values())
        assert stats['total_samples'] == total_samples
        assert stats['avg_samples_per_client'] == total_samples / 3
        
        # Variance should be positive (clients have different parameters)
        assert stats['avg_parameter_variance'] > 0
    
    def test_minimum_clients_requirement(self, aggregation_server):
        """Test aggregation requires minimum number of clients"""
        # Try to aggregate with no clients
        stats = aggregation_server.aggregate_updates(round_num=1, min_clients=2)
        
        assert stats['status'] == 'insufficient_clients'
        assert stats['num_clients'] == 0
    
    def test_asynchronous_participation(self, aggregation_server, client_updates):
        """
        Test asynchronous client participation.
        
        Requirements: 7.10
        """
        # Round 1: Only 2 clients participate
        for i, (client_id, update) in enumerate(client_updates.items()):
            if i < 2:  # Only first 2 clients
                aggregation_server.collect_client_updates(
                    client_id=client_id,
                    parameters=update['parameters'],
                    num_samples=update['num_samples']
                )
        
        stats1 = aggregation_server.aggregate_updates(round_num=1, min_clients=1)
        assert stats1['num_participating_clients'] == 2
        
        # Round 2: All 3 clients participate
        for client_id, update in client_updates.items():
            aggregation_server.collect_client_updates(
                client_id=client_id,
                parameters=update['parameters'],
                num_samples=update['num_samples']
            )
        
        stats2 = aggregation_server.aggregate_updates(round_num=2, min_clients=1)
        assert stats2['num_participating_clients'] == 3


class TestByzantineRobustAggregator:
    """Test suite for ByzantineRobustAggregator"""
    
    def test_initialization(self):
        """Test aggregator initialization"""
        aggregator = ByzantineRobustAggregator(trim_ratio=0.1)
        assert aggregator.trim_ratio == 0.1
        
        # Invalid trim ratio should raise error
        with pytest.raises(ValueError):
            ByzantineRobustAggregator(trim_ratio=0.6)
        
        with pytest.raises(ValueError):
            ByzantineRobustAggregator(trim_ratio=-0.1)
    
    def test_trimmed_mean_excludes_outliers(self):
        """
        Test Trimmed Mean excludes outliers.
        
        Requirements: 7.4, 7.5
        """
        aggregator = ByzantineRobustAggregator(trim_ratio=0.2)
        
        # Create updates with one outlier
        updates = {}
        
        # 4 normal clients
        for i in range(4):
            params = {
                'weight': torch.ones(5, 5) * (i + 1.0),  # Values: 1, 2, 3, 4
                'bias': torch.ones(5) * (i + 1.0)
            }
            updates[f'client_{i}'] = {
                'parameters': params,
                'num_samples': 100
            }
        
        # 1 malicious client with extreme values
        updates['client_malicious'] = {
            'parameters': {
                'weight': torch.ones(5, 5) * 100.0,  # Outlier
                'bias': torch.ones(5) * 100.0
            },
            'num_samples': 100
        }
        
        # Aggregate with trimmed mean
        aggregated = aggregator.aggregate(updates, device='cpu')
        
        # With 5 clients and trim_ratio=0.2, we trim 1 from each end
        # Remaining clients: 2, 3, 4 (values 2.0, 3.0, 4.0)
        # Expected mean: (2 + 3 + 4) / 3 = 3.0
        expected_mean = 3.0
        
        # Check weight parameter
        actual_mean = aggregated['weight'].mean().item()
        assert abs(actual_mean - expected_mean) < 0.1
        
        # Check bias parameter
        actual_bias = aggregated['bias'].mean().item()
        assert abs(actual_bias - expected_mean) < 0.1
    
    def test_trimmed_mean_with_small_client_count(self):
        """Test trimmed mean handles small client counts gracefully"""
        aggregator = ByzantineRobustAggregator(trim_ratio=0.4)
        
        # Only 2 clients - trimming would remove all
        updates = {
            'client_0': {
                'parameters': {'weight': torch.ones(3, 3)},
                'num_samples': 100
            },
            'client_1': {
                'parameters': {'weight': torch.ones(3, 3) * 2.0},
                'num_samples': 100
            }
        }
        
        # Should fall back to regular mean
        aggregated = aggregator.aggregate(updates, device='cpu')
        
        # Expected: (1 + 2) / 2 = 1.5
        expected = 1.5
        actual = aggregated['weight'].mean().item()
        assert abs(actual - expected) < 0.01
    
    def test_outlier_detection(self):
        """
        Test outlier detection in parameter updates.
        
        Requirements: 7.5
        """
        aggregator = ByzantineRobustAggregator(trim_ratio=0.1)
        
        # Create updates with normal and outlier clients
        updates = {}
        
        # 3 normal clients with similar parameters (deterministic for consistency)
        for i in range(3):
            params = {
                'weight': torch.ones(10, 10) * 0.01,  # Small consistent values
                'bias': torch.ones(10) * 0.01
            }
            updates[f'client_{i}'] = {
                'parameters': params,
                'num_samples': 100
            }
        
        # 1 outlier client with extremely large parameters
        updates['client_outlier'] = {
            'parameters': {
                'weight': torch.ones(10, 10) * 100.0,  # Very large values
                'bias': torch.ones(10) * 100.0
            },
            'num_samples': 100
        }
        
        # Detect outliers with lower threshold
        param_names = ['weight', 'bias']
        outliers = aggregator._detect_outliers(updates, param_names, 'cpu', threshold=1.5)
        
        # Should detect the outlier client
        assert 'client_outlier' in outliers
        assert len(outliers) >= 1
    
    def test_trim_statistics(self):
        """Test trim statistics computation"""
        aggregator = ByzantineRobustAggregator(trim_ratio=0.2)
        
        # Create 5 clients with different parameter values
        updates = {}
        for i in range(5):
            params = {
                'weight': torch.ones(3, 3) * (i + 1.0)  # Values: 1, 2, 3, 4, 5
            }
            updates[f'client_{i}'] = {
                'parameters': params,
                'num_samples': 100
            }
        
        # Get statistics
        stats = aggregator.get_trim_statistics(updates, 'weight', 'cpu')
        
        # Check statistics
        assert stats['parameter_name'] == 'weight'
        assert stats['num_clients'] == 5
        assert stats['num_trimmed_each_end'] == 1  # 20% of 5 = 1
        assert len(stats['trimmed_bottom_clients']) == 1
        assert len(stats['trimmed_top_clients']) == 1
        
        # Bottom should be client_0 (value 1.0)
        assert 'client_0' in stats['trimmed_bottom_clients']
        
        # Top should be client_4 (value 5.0)
        assert 'client_4' in stats['trimmed_top_clients']
        
        # Trimmed mean should be (2 + 3 + 4) / 3 = 3.0
        assert abs(stats['trimmed_mean'] - 3.0) < 0.01


class TestByzantineRobustServer:
    """Test Byzantine-robust aggregation server"""
    
    def test_server_with_byzantine_robustness(self, simple_model, temp_checkpoint_dir):
        """
        Test server with Byzantine-robust aggregation enabled.
        
        Requirements: 7.4
        """
        server = AggregationServer(
            model=simple_model,
            checkpoint_dir=temp_checkpoint_dir,
            use_byzantine_robust=True,
            device='cpu'
        )
        
        assert server.use_byzantine_robust is True
        
        # Create updates with outlier
        updates = {}
        for i in range(5):
            params = {}
            for name, param in simple_model.named_parameters():
                if i < 4:
                    # Normal clients
                    params[name] = param.detach().clone() + torch.randn_like(param) * 0.1
                else:
                    # Malicious client with extreme values
                    params[name] = param.detach().clone() + torch.randn_like(param) * 10.0
            
            updates[f'client_{i}'] = {
                'parameters': params,
                'num_samples': 100
            }
        
        # Collect updates
        for client_id, update in updates.items():
            server.collect_client_updates(
                client_id=client_id,
                parameters=update['parameters'],
                num_samples=update['num_samples']
            )
        
        # Aggregate with Byzantine robustness
        stats = server.aggregate_updates(round_num=1)
        
        # Should complete successfully
        assert stats['aggregation_method'] == 'trimmed_mean'
        assert stats['num_participating_clients'] == 5


def test_integration_federated_training_round(simple_model, temp_checkpoint_dir):
    """
    Integration test: Complete federated training round.
    
    Tests the full workflow:
    1. Server broadcasts model
    2. Clients receive and train (simulated)
    3. Server collects updates
    4. Server aggregates
    5. Global model updated
    """
    # Initialize server
    server = AggregationServer(
        model=simple_model,
        checkpoint_dir=temp_checkpoint_dir,
        checkpoint_frequency=1,
        device='cpu'
    )
    
    # Round 1: Broadcast model
    global_params = server.broadcast_global_model()
    assert len(global_params) > 0
    
    # Simulate 3 clients training
    for i in range(3):
        # Simulate client update (add small perturbation)
        client_params = {}
        for name, param in global_params.items():
            client_params[name] = param + torch.randn_like(param) * 0.01
        
        # Client sends update to server
        server.collect_client_updates(
            client_id=f'client_{i}',
            parameters=client_params,
            num_samples=(i + 1) * 50,  # Different sample counts
            metrics={'loss': 0.5 - i * 0.05}
        )
    
    # Server aggregates updates
    stats = server.aggregate_updates(round_num=1, min_clients=2)
    
    # Verify aggregation succeeded
    assert stats['num_participating_clients'] == 3
    assert stats['total_samples'] == 50 + 100 + 150
    assert 'avg_parameter_variance' in stats
    
    # Checkpoint should be saved (frequency=1)
    checkpoint_path = Path(temp_checkpoint_dir) / "global_model_round_1.pt"
    assert checkpoint_path.exists()
    
    # Verify aggregation history
    history = server.get_aggregation_history()
    assert len(history) == 1
    assert history[0]['round'] == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
