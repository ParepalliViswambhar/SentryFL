"""
Unit tests for FederatedClient module

Tests Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, 18.5
"""

import pytest
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import tempfile
import shutil
from pathlib import Path

from sentryfl.federated.client import FederatedClient
from sentryfl.models.plm_backbone import AnomalyDetectionHead


class SimpleTestModel(nn.Module):
    """Simple model for testing (faster than full PLM)"""
    
    def __init__(self, input_dim: int = 10, hidden_dim: int = 20):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, 1)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Expect input [batch, seq_len, input_dim]
        # For simplicity, use mean pooling
        if x.dim() == 3:
            x = x.mean(dim=1)  # [batch, input_dim]
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        return x


@pytest.fixture
def simple_model():
    """Create a simple test model"""
    return SimpleTestModel(input_dim=10, hidden_dim=20)


@pytest.fixture
def local_data():
    """Create synthetic local training data"""
    # Create time-series data: [samples, seq_len, features]
    num_samples = 100
    seq_len = 5
    num_features = 10
    
    X = torch.randn(num_samples, seq_len, num_features)
    y = torch.randint(0, 2, (num_samples,))  # Binary labels
    
    return X, y


@pytest.fixture
def temp_cache_dir():
    """Create temporary cache directory"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


class TestFederatedClientInitialization:
    """Test FederatedClient initialization"""
    
    def test_successful_initialization(self, simple_model, local_data):
        """Test successful client initialization"""
        client = FederatedClient(
            client_id='test_client_0',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            learning_rate=0.001,
            device='cpu'
        )
        
        assert client.client_id == 'test_client_0'
        assert client.batch_size == 16
        assert client.learning_rate == 0.001
        assert client.device == 'cpu'
        assert client.data_size == 100
        assert isinstance(client.model, nn.Module)
        assert isinstance(client.optimizer, torch.optim.Optimizer)
    
    def test_initialization_with_invalid_data(self, simple_model):
        """Test initialization fails with invalid data"""
        # Empty data
        with pytest.raises(ValueError, match="cannot be empty"):
            FederatedClient(
                client_id='test_client',
                model=simple_model,
                local_data=(torch.tensor([]), torch.tensor([])),
                batch_size=16
            )
        
        # Mismatched lengths
        with pytest.raises(ValueError, match="must match"):
            FederatedClient(
                client_id='test_client',
                model=simple_model,
                local_data=(torch.randn(100, 5, 10), torch.randint(0, 2, (50,))),
                batch_size=16
            )
        
        # Invalid format
        with pytest.raises(ValueError, match="must be a tuple"):
            FederatedClient(
                client_id='test_client',
                model=simple_model,
                local_data=torch.randn(100, 5, 10),
                batch_size=16
            )


class TestReceiveGlobalModel:
    """Test receiving global model parameters - Requirement 2.1, 2.3"""
    
    def test_receive_valid_parameters(self, simple_model, local_data):
        """Test receiving valid global model parameters"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        # Create global parameters
        global_params = {
            name: param.clone() + 0.1
            for name, param in simple_model.named_parameters()
        }
        
        # Receive global model
        client.receive_global_model(global_params)
        
        # Verify parameters were loaded
        for name, param in client.model.named_parameters():
            assert torch.allclose(param, global_params[name], atol=1e-6)
    
    def test_receive_parameters_with_shape_mismatch(self, simple_model, local_data):
        """Test receiving parameters with wrong shapes fails"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        # Create parameters with wrong shape
        global_params = {
            'fc1.weight': torch.randn(30, 10),  # Wrong shape (should be 20x10)
        }
        
        with pytest.raises(RuntimeError, match="Shape mismatch"):
            client.receive_global_model(global_params)


class TestLoadLocalData:
    """Test loading local private data - Requirement 2.2"""
    
    def test_load_local_data_creates_dataloader(self, simple_model, local_data):
        """Test that load_local_data creates a valid DataLoader"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        data_loader = client.load_local_data()
        
        assert isinstance(data_loader, DataLoader)
        assert data_loader.batch_size == 16
        
        # Verify data can be iterated
        for batch_x, batch_y in data_loader:
            assert batch_x.shape[0] <= 16
            assert batch_y.shape[0] <= 16
            assert batch_x.shape[1:] == (5, 10)  # seq_len, features
            break
    
    def test_data_never_leaves_client(self, simple_model, local_data):
        """Test that raw data remains on client (not transmitted)"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        # This is a conceptual test - in practice, data stays local
        # We verify that only parameters are extracted, not data
        params = client.extract_parameters()
        
        # Verify no data in parameters
        for name, tensor in params.items():
            # Parameters should have expected shapes, not data shapes
            assert tensor.shape != local_data[0].shape
            assert tensor.shape != local_data[1].shape


class TestLocalTraining:
    """Test local training - Requirements 2.4, 2.5, 2.9"""
    
    def test_local_training_without_dp(self, simple_model, local_data):
        """Test local training without differential privacy"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            learning_rate=0.01
        )
        
        # Perform local training
        params, metrics = client.local_training(local_epochs=3)
        
        # Verify parameters returned
        assert isinstance(params, dict)
        assert len(params) > 0
        
        # Verify metrics
        assert metrics['client_id'] == 'test_client'
        assert metrics['epochs_completed'] == 3
        assert 'final_loss' in metrics
        assert 'avg_loss' in metrics
        assert 'avg_gradient_norm' in metrics
        assert metrics['total_samples'] == 100
    
    def test_gradient_norms_computed(self, simple_model, local_data):
        """Test that gradient norms are computed during training"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        params, metrics = client.local_training(local_epochs=2)
        
        # Verify gradient norms are tracked
        assert 'avg_gradient_norm' in metrics
        assert 'max_gradient_norm' in metrics
        assert 'min_gradient_norm' in metrics
        assert metrics['avg_gradient_norm'] >= 0
        assert metrics['max_gradient_norm'] >= metrics['min_gradient_norm']
    
    def test_training_updates_model_parameters(self, simple_model, local_data):
        """Test that training updates model parameters"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        # Save initial parameters
        initial_params = {
            name: param.clone()
            for name, param in client.model.named_parameters()
        }
        
        # Perform training
        client.local_training(local_epochs=2)
        
        # Verify parameters changed
        params_changed = False
        for name, param in client.model.named_parameters():
            if not torch.allclose(param, initial_params[name], atol=1e-6):
                params_changed = True
                break
        
        assert params_changed, "Model parameters should change after training"


class TestExtractParameters:
    """Test parameter extraction - Requirements 2.6, 2.7"""
    
    def test_extract_only_trainable_parameters(self, simple_model, local_data):
        """Test that only trainable parameters are extracted"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        # Freeze some parameters
        for name, param in client.model.named_parameters():
            if 'fc1' in name:
                param.requires_grad = False
        
        # Extract parameters
        extracted = client.extract_parameters()
        
        # Verify only trainable parameters extracted
        for name in extracted.keys():
            assert 'fc1' not in name
    
    def test_parameters_on_cpu(self, simple_model, local_data):
        """Test that extracted parameters are moved to CPU"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            device='cpu'
        )
        
        params = client.extract_parameters()
        
        # Verify all parameters are on CPU
        for name, tensor in params.items():
            assert tensor.device.type == 'cpu'
    
    def test_parameters_are_detached(self, simple_model, local_data):
        """Test that extracted parameters are detached from computation graph"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        params = client.extract_parameters()
        
        # Verify all parameters are detached
        for name, tensor in params.items():
            assert not tensor.requires_grad


class TestCommunicationRetry:
    """Test communication retry with exponential backoff - Requirements 2.10, 18.5"""
    
    def test_successful_send_on_first_attempt(self, simple_model, local_data, temp_cache_dir):
        """Test successful parameter send on first attempt"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            cache_dir=temp_cache_dir
        )
        
        params = client.extract_parameters()
        
        # Mock successful send function
        send_called = []
        def mock_send(client_id, parameters, **kwargs):
            send_called.append(True)
        
        success = client.send_parameters(params, mock_send)
        
        assert success is True
        assert len(send_called) == 1
        assert client.cached_updates is None
    
    def test_retry_on_failure(self, simple_model, local_data, temp_cache_dir):
        """Test retry logic with exponential backoff"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            cache_dir=temp_cache_dir
        )
        client.max_retries = 3
        client.retry_base_delay = 0.01  # Short delay for testing
        
        params = client.extract_parameters()
        
        # Mock function that fails first 2 times, succeeds on 3rd
        attempt_count = []
        def mock_send_with_retries(client_id, parameters, **kwargs):
            attempt_count.append(True)
            if len(attempt_count) < 3:
                raise ConnectionError("Network error")
        
        success = client.send_parameters(params, mock_send_with_retries)
        
        assert success is True
        assert len(attempt_count) == 3
    
    def test_cache_on_all_failures(self, simple_model, local_data, temp_cache_dir):
        """Test that updates are cached when all retries fail"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            cache_dir=temp_cache_dir
        )
        client.max_retries = 3
        client.retry_base_delay = 0.01
        
        params = client.extract_parameters()
        
        # Mock function that always fails
        def mock_send_always_fails(client_id, parameters, **kwargs):
            raise ConnectionError("Network error")
        
        success = client.send_parameters(params, mock_send_always_fails)
        
        assert success is False
        assert client.cached_updates is not None
        assert client.cached_updates.exists()
    
    def test_retrieve_cached_updates(self, simple_model, local_data, temp_cache_dir):
        """Test retrieving cached updates"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            cache_dir=temp_cache_dir
        )
        client.max_retries = 2
        client.retry_base_delay = 0.01
        
        params = client.extract_parameters()
        
        # Force cache by failing all attempts
        def mock_fail(client_id, parameters, **kwargs):
            raise ConnectionError("Network error")
        
        client.send_parameters(params, mock_fail)
        
        # Retrieve cached updates
        cached_params = client.get_cached_updates()
        
        assert cached_params is not None
        assert isinstance(cached_params, dict)
        # Verify cached parameters match original
        for name in params.keys():
            assert torch.allclose(cached_params[name], params[name])


class TestMetricsTracking:
    """Test training metrics logging - Requirement 2.9"""
    
    def test_metrics_tracked_during_training(self, simple_model, local_data):
        """Test that metrics are tracked during training"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        params, metrics = client.local_training(local_epochs=2)
        
        # Verify metrics structure
        assert 'loss_history' in client.training_metrics
        assert 'gradient_norms' in client.training_metrics
        assert 'per_epoch_loss' in client.training_metrics
        assert 'total_samples_trained' in client.training_metrics
        
        # Verify metrics populated
        assert len(client.training_metrics['per_epoch_loss']) == 2
        assert len(client.training_metrics['gradient_norms']) > 0
        assert client.training_metrics['total_samples_trained'] > 0
    
    def test_get_training_metrics(self, simple_model, local_data):
        """Test retrieving training metrics"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        client.local_training(local_epochs=2)
        metrics = client.get_training_metrics()
        
        assert isinstance(metrics, dict)
        assert 'loss_history' in metrics
        assert 'gradient_norms' in metrics
    
    def test_reset_metrics(self, simple_model, local_data):
        """Test resetting training metrics"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16
        )
        
        client.local_training(local_epochs=2)
        assert len(client.training_metrics['per_epoch_loss']) > 0
        
        client.reset_metrics()
        assert len(client.training_metrics['per_epoch_loss']) == 0
        assert len(client.training_metrics['loss_history']) == 0
        assert client.training_metrics['total_samples_trained'] == 0


class TestIntegration:
    """Integration tests for complete client workflow"""
    
    def test_complete_training_round(self, simple_model, local_data, temp_cache_dir):
        """Test complete training round workflow"""
        client = FederatedClient(
            client_id='test_client',
            model=simple_model,
            local_data=local_data,
            batch_size=16,
            learning_rate=0.01,
            cache_dir=temp_cache_dir
        )
        
        # Step 1: Receive global model
        global_params = {
            name: param.clone()
            for name, param in simple_model.named_parameters()
        }
        client.receive_global_model(global_params)
        
        # Step 2: Local training
        local_params, metrics = client.local_training(local_epochs=2)
        
        # Step 3: Send parameters
        sent_params = []
        def mock_send(client_id, parameters, **kwargs):
            sent_params.append((client_id, parameters))
        
        success = client.send_parameters(local_params, mock_send)
        
        # Verify workflow completed
        assert success is True
        assert len(sent_params) == 1
        assert sent_params[0][0] == 'test_client'
        assert isinstance(metrics, dict)
        assert metrics['epochs_completed'] == 2


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
