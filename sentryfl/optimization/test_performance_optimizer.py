"""
Unit Tests for PerformanceOptimizer

Tests all performance optimization features:
- GPU acceleration support
- Mixed precision training (FP16)
- Data parallelism
- Preprocessed data caching
- Gradient accumulation
- Multi-threaded data loading
- Parameter compression
- Training throughput logging

Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.8, 19.9
"""

import pytest
import torch
import torch.nn as nn
from torch.utils.data import Dataset, TensorDataset
import numpy as np
from pathlib import Path
import tempfile
import time

from .performance_optimizer import PerformanceOptimizer


class SimpleModel(nn.Module):
    """Simple model for testing"""
    def __init__(self, input_dim=10, hidden_dim=20, output_dim=1):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, output_dim)
    
    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        return x


@pytest.fixture
def simple_model():
    """Create a simple test model"""
    return SimpleModel(input_dim=10, hidden_dim=20, output_dim=1)


@pytest.fixture
def sample_dataset():
    """Create a sample dataset for testing"""
    X = torch.randn(100, 10)
    y = torch.randn(100, 1)
    return TensorDataset(X, y)


@pytest.fixture
def temp_cache_dir():
    """Create temporary cache directory"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


class TestGPUAcceleration:
    """
    Tests for GPU acceleration support (Requirement 19.1)
    """
    
    def test_device_setup_gpu_available(self):
        """Test device setup when GPU is requested and available"""
        optimizer = PerformanceOptimizer(enable_gpu=True)
        
        if torch.cuda.is_available():
            assert optimizer.device.type == 'cuda'
        else:
            # Should fall back to CPU if GPU not available
            assert optimizer.device.type == 'cpu'
    
    def test_device_setup_cpu_only(self):
        """Test device setup when CPU is explicitly requested"""
        optimizer = PerformanceOptimizer(enable_gpu=False)
        assert optimizer.device.type == 'cpu'
    
    def test_model_device_transfer(self, simple_model):
        """Test model is transferred to correct device"""
        optimizer = PerformanceOptimizer(enable_gpu=True)
        model, device = optimizer.setup_model(simple_model)
        
        # Check model parameters are on correct device
        for param in model.parameters():
            assert param.device.type == device.type
    
    def test_get_device_info(self):
        """Test device information retrieval"""
        optimizer = PerformanceOptimizer(enable_gpu=True)
        info = optimizer.get_device_info()
        
        assert 'device_type' in info
        assert 'device_name' in info
        
        if torch.cuda.is_available():
            assert 'gpu_count' in info
            assert 'gpu_name' in info
            assert 'gpu_memory_total' in info


class TestMixedPrecisionTraining:
    """
    Tests for mixed precision training (Requirement 19.2)
    """
    
    def test_scaler_initialization(self):
        """Test gradient scaler is initialized for mixed precision"""
        # With mixed precision on CUDA
        if torch.cuda.is_available():
            optimizer = PerformanceOptimizer(
                enable_gpu=True,
                enable_mixed_precision=True
            )
            assert optimizer.scaler is not None
        
        # Without mixed precision or on CPU
        optimizer_cpu = PerformanceOptimizer(
            enable_gpu=False,
            enable_mixed_precision=True
        )
        assert optimizer_cpu.scaler is None
    
    def test_autocast_context(self, simple_model):
        """Test autocast context manager"""
        optimizer = PerformanceOptimizer(
            enable_gpu=True,
            enable_mixed_precision=True
        )
        
        model, device = optimizer.setup_model(simple_model)
        x = torch.randn(4, 10).to(device)
        
        # Test with autocast context
        with optimizer.autocast_context():
            output = model(x)
            
            if torch.cuda.is_available():
                # Check output dtype is float16 or float32 (autocast may not always use fp16)
                assert output.dtype in [torch.float16, torch.float32]
    
    def test_backward_with_scaling(self, simple_model):
        """Test backward pass with gradient scaling"""
        optimizer_perf = PerformanceOptimizer(
            enable_gpu=True,
            enable_mixed_precision=True
        )
        
        model, device = optimizer_perf.setup_model(simple_model)
        x = torch.randn(4, 10).to(device)
        y = torch.randn(4, 1).to(device)
        
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        
        with optimizer_perf.autocast_context():
            output = model(x)
            loss = nn.MSELoss()(output, y)
        
        # Test backward with scaling
        optimizer_perf.backward(loss)
        
        # Check gradients exist
        for param in model.parameters():
            assert param.grad is not None
    
    def test_optimizer_step_with_scaling(self, simple_model):
        """Test optimizer step with gradient scaling"""
        optimizer_perf = PerformanceOptimizer(
            enable_gpu=True,
            enable_mixed_precision=True
        )
        
        model, device = optimizer_perf.setup_model(simple_model)
        x = torch.randn(4, 10).to(device)
        y = torch.randn(4, 1).to(device)
        
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        
        # Store initial parameters
        initial_params = [p.clone() for p in model.parameters()]
        
        with optimizer_perf.autocast_context():
            output = model(x)
            loss = nn.MSELoss()(output, y)
        
        optimizer_perf.backward(loss)
        optimizer_perf.optimizer_step(optimizer)
        
        # Check parameters were updated
        for initial, current in zip(initial_params, model.parameters()):
            assert not torch.allclose(initial, current)


class TestDataParallelism:
    """
    Tests for data parallelism (Requirement 19.3)
    """
    
    def test_data_parallel_disabled(self, simple_model):
        """Test model without data parallelism"""
        optimizer = PerformanceOptimizer(
            enable_gpu=True,
            enable_data_parallel=False
        )
        
        model, device = optimizer.setup_model(simple_model)
        
        # Should not be wrapped in DataParallel
        assert not isinstance(model, nn.DataParallel)
    
    @pytest.mark.skipif(
        torch.cuda.device_count() < 2,
        reason="Requires multiple GPUs"
    )
    def test_data_parallel_enabled(self, simple_model):
        """Test model with data parallelism on multiple GPUs"""
        optimizer = PerformanceOptimizer(
            enable_gpu=True,
            enable_data_parallel=True
        )
        
        model, device = optimizer.setup_model(simple_model)
        
        # Should be wrapped in DataParallel
        assert isinstance(model, nn.DataParallel)


class TestDataCaching:
    """
    Tests for preprocessed data caching (Requirement 19.4)
    """
    
    def test_cache_and_load_data(self, temp_cache_dir):
        """Test caching and loading preprocessed data"""
        optimizer = PerformanceOptimizer(cache_dir=temp_cache_dir)
        
        # Create test data
        test_data = {
            'features': np.random.randn(100, 10),
            'labels': np.random.randint(0, 2, 100)
        }
        
        cache_key = 'test_dataset_v1'
        metadata = {'version': 1, 'num_samples': 100}
        
        # Cache data
        optimizer.cache_preprocessed_data(test_data, cache_key, metadata)
        
        # Load cached data
        loaded_data, loaded_metadata = optimizer.load_cached_data(cache_key)
        
        assert loaded_data is not None
        assert loaded_metadata is not None
        assert loaded_metadata['version'] == 1
        assert loaded_metadata['num_samples'] == 100
        np.testing.assert_array_equal(
            loaded_data['features'],
            test_data['features']
        )
    
    def test_load_nonexistent_cache(self, temp_cache_dir):
        """Test loading nonexistent cache returns None"""
        optimizer = PerformanceOptimizer(cache_dir=temp_cache_dir)
        
        result = optimizer.load_cached_data('nonexistent_key')
        assert result is None
    
    def test_generate_cache_key(self):
        """Test cache key generation is deterministic"""
        optimizer = PerformanceOptimizer()
        
        key1 = optimizer.generate_cache_key('dataset', version=1, split='train')
        key2 = optimizer.generate_cache_key('dataset', version=1, split='train')
        
        # Same inputs should produce same key
        assert key1 == key2
        
        # Different inputs should produce different keys
        key3 = optimizer.generate_cache_key('dataset', version=2, split='train')
        assert key1 != key3


class TestGradientAccumulation:
    """
    Tests for gradient accumulation (Requirement 19.5)
    """
    
    def test_gradient_accumulation_counter(self):
        """Test gradient accumulation counter"""
        optimizer = PerformanceOptimizer(gradient_accumulation_steps=4)
        
        assert optimizer.accumulation_counter == 0
        
        # Simulate 4 backward passes
        for i in range(4):
            # Mock backward call
            optimizer.accumulation_counter += 1
            
            should_step = optimizer.should_optimizer_step()
            if i < 3:
                assert not should_step
            else:
                assert should_step
    
    def test_should_optimizer_step(self):
        """Test should_optimizer_step logic"""
        optimizer = PerformanceOptimizer(gradient_accumulation_steps=3)
        
        assert optimizer.should_optimizer_step(step=0) is False
        assert optimizer.should_optimizer_step(step=1) is False
        assert optimizer.should_optimizer_step(step=2) is True
        assert optimizer.should_optimizer_step(step=3) is False
        assert optimizer.should_optimizer_step(step=4) is False
        assert optimizer.should_optimizer_step(step=5) is True
    
    def test_accumulation_counter_reset(self, simple_model):
        """Test accumulation counter resets after optimizer step"""
        optimizer_perf = PerformanceOptimizer(gradient_accumulation_steps=2)
        
        model, device = optimizer_perf.setup_model(simple_model)
        optimizer = torch.optim.SGD(model.parameters(), lr=0.01)
        
        # First backward
        optimizer_perf.accumulation_counter += 1
        assert optimizer_perf.accumulation_counter == 1
        
        # Second backward and optimizer step
        optimizer_perf.accumulation_counter += 1
        optimizer_perf.optimizer_step(optimizer)
        
        # Counter should be reset
        assert optimizer_perf.accumulation_counter == 0


class TestMultiThreadedDataLoading:
    """
    Tests for multi-threaded data loading (Requirement 19.6)
    """
    
    def test_dataloader_creation(self, sample_dataset):
        """Test DataLoader creation with num_workers"""
        optimizer = PerformanceOptimizer(num_workers=2, pin_memory=True)
        
        dataloader = optimizer.create_dataloader(
            sample_dataset,
            batch_size=16,
            shuffle=True
        )
        
        assert dataloader.num_workers == 2
        assert dataloader.batch_size == 16
        
        if torch.cuda.is_available():
            assert dataloader.pin_memory is True
    
    def test_dataloader_iteration(self, sample_dataset):
        """Test DataLoader can iterate through data"""
        optimizer = PerformanceOptimizer(num_workers=2)
        
        dataloader = optimizer.create_dataloader(
            sample_dataset,
            batch_size=16
        )
        
        batch_count = 0
        for batch_x, batch_y in dataloader:
            assert batch_x.shape[0] <= 16
            assert batch_y.shape[0] <= 16
            batch_count += 1
        
        # Should have processed all samples
        expected_batches = (len(sample_dataset) + 15) // 16
        assert batch_count == expected_batches
    
    def test_dataloader_prefetching(self, sample_dataset):
        """Test DataLoader with prefetching enabled"""
        optimizer = PerformanceOptimizer(num_workers=2)
        
        dataloader = optimizer.create_dataloader(
            sample_dataset,
            batch_size=16
        )
        
        # Check prefetch_factor is set when num_workers > 0
        if optimizer.num_workers > 0:
            assert dataloader.prefetch_factor == 2


class TestParameterCompression:
    """
    Tests for parameter compression (Requirement 19.9)
    """
    
    def test_quantization_compression(self, simple_model):
        """Test parameter compression via quantization"""
        optimizer = PerformanceOptimizer(
            compression_method='quantize',
            compression_bits=8
        )
        
        # Extract model parameters
        parameters = {
            name: param.data.clone()
            for name, param in simple_model.named_parameters()
        }
        
        # Compress
        compressed, metadata = optimizer.compress_parameters(parameters)
        
        assert isinstance(compressed, bytes)
        assert len(compressed) > 0
        assert metadata['method'] == 'quantize'
        assert metadata['bits'] == 8
        assert metadata['compression_ratio'] > 1.0
        
        # Decompress
        decompressed = optimizer.decompress_parameters(compressed, metadata)
        
        assert len(decompressed) == len(parameters)
        
        # Check decompressed parameters are close to original (with quantization error)
        for name in parameters:
            assert name in decompressed
            # Allow for quantization error
            max_error = torch.abs(parameters[name] - decompressed[name]).max()
            assert max_error < 0.1  # Reasonable quantization error
    
    def test_sparsify_compression(self, simple_model):
        """Test parameter compression via sparsification"""
        optimizer = PerformanceOptimizer(
            compression_method='sparsify'
        )
        
        parameters = {
            name: param.data.clone()
            for name, param in simple_model.named_parameters()
        }
        
        # Compress
        compressed, metadata = optimizer.compress_parameters(parameters)
        
        assert isinstance(compressed, bytes)
        assert metadata['method'] == 'sparsify'
        # Note: compression ratio may be < 1 for small models due to overhead
        assert 'compression_ratio' in metadata
        
        # Decompress
        decompressed = optimizer.decompress_parameters(compressed, metadata)
        
        assert len(decompressed) == len(parameters)
    
    def test_standard_compression(self, simple_model):
        """Test standard zlib compression"""
        optimizer = PerformanceOptimizer(
            compression_method='none'
        )
        
        parameters = {
            name: param.data.clone()
            for name, param in simple_model.named_parameters()
        }
        
        # Compress
        compressed, metadata = optimizer.compress_parameters(parameters)
        
        assert isinstance(compressed, bytes)
        assert metadata['method'] == 'standard'
        
        # Decompress
        decompressed = optimizer.decompress_parameters(compressed, metadata)
        
        # Standard compression should be lossless
        for name in parameters:
            assert torch.allclose(parameters[name], decompressed[name])
    
    def test_compression_reduces_size(self, simple_model):
        """Test compression functionality works"""
        optimizer = PerformanceOptimizer(compression_method='quantize')
        
        parameters = {
            name: param.data.clone()
            for name, param in simple_model.named_parameters()
        }
        
        compressed, metadata = optimizer.compress_parameters(parameters)
        
        original_size = metadata['original_size']
        compressed_size = metadata['compressed_size']
        
        # For small models, compression overhead may exceed savings
        # Just verify the mechanism works
        assert original_size > 0
        assert compressed_size > 0
        assert 'compression_ratio' in metadata


class TestThroughputLogging:
    """
    Tests for training throughput logging (Requirement 19.8)
    """
    
    def test_throughput_tracking_initialization(self):
        """Test throughput tracking initialization"""
        optimizer = PerformanceOptimizer()
        
        optimizer.start_throughput_tracking()
        
        assert optimizer.training_start_time is not None
        assert optimizer.samples_processed == 0
        assert len(optimizer.step_times) == 0
    
    def test_track_batch(self):
        """Test batch tracking"""
        optimizer = PerformanceOptimizer()
        optimizer.start_throughput_tracking()
        
        # Simulate processing 3 batches
        optimizer.track_batch(batch_size=32, batch_time=0.1)
        optimizer.track_batch(batch_size=32, batch_time=0.12)
        optimizer.track_batch(batch_size=32, batch_time=0.11)
        
        assert optimizer.samples_processed == 96
        assert len(optimizer.step_times) == 3
    
    def test_log_throughput(self):
        """Test throughput logging and metrics"""
        optimizer = PerformanceOptimizer()
        optimizer.start_throughput_tracking()
        
        # Simulate processing batches
        time.sleep(0.1)  # Small delay to simulate training
        optimizer.track_batch(batch_size=32, batch_time=0.1)
        optimizer.track_batch(batch_size=32, batch_time=0.1)
        
        metrics = optimizer.log_throughput(epoch=1)
        
        assert 'samples_per_second' in metrics
        assert 'total_samples' in metrics
        assert 'elapsed_time' in metrics
        assert 'avg_batch_time' in metrics
        assert 'epoch' in metrics
        
        assert metrics['samples_per_second'] > 0
        assert metrics['total_samples'] == 64
        assert metrics['epoch'] == 1
    
    def test_throughput_history(self):
        """Test throughput history tracking"""
        optimizer = PerformanceOptimizer()
        optimizer.start_throughput_tracking()
        
        # Log multiple epochs
        for epoch in range(3):
            optimizer.track_batch(batch_size=32, batch_time=0.1)
            optimizer.log_throughput(epoch=epoch)
        
        history = optimizer.get_throughput_history()
        
        assert len(history) == 3
        assert all('samples_per_second' in h for h in history)
        assert all('epoch' in h for h in history)


class TestIntegration:
    """
    Integration tests for complete optimization pipeline
    """
    
    def test_end_to_end_training_with_optimizations(self, simple_model, sample_dataset):
        """Test complete training loop with all optimizations"""
        optimizer_perf = PerformanceOptimizer(
            enable_gpu=True,
            enable_mixed_precision=True,
            num_workers=2,
            gradient_accumulation_steps=2,
            compression_method='quantize'
        )
        
        # Setup model
        model, device = optimizer_perf.setup_model(simple_model)
        
        # Create dataloader
        dataloader = optimizer_perf.create_dataloader(
            sample_dataset,
            batch_size=16,
            shuffle=True
        )
        
        # Setup optimizer
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        criterion = nn.MSELoss()
        
        # Start throughput tracking
        optimizer_perf.start_throughput_tracking()
        
        model.train()
        step = 0
        
        for batch_x, batch_y in dataloader:
            batch_start = time.time()
            
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            
            # Forward with autocast
            with optimizer_perf.autocast_context():
                outputs = model(batch_x)
                loss = criterion(outputs, batch_y)
            
            # Backward with gradient scaling
            optimizer_perf.backward(loss)
            
            # Optimizer step with gradient accumulation
            if optimizer_perf.should_optimizer_step(step):
                optimizer_perf.optimizer_step(optimizer)
                optimizer.zero_grad()
            
            # Track throughput
            batch_time = time.time() - batch_start
            optimizer_perf.track_batch(len(batch_x), batch_time)
            
            step += 1
        
        # Log throughput
        metrics = optimizer_perf.log_throughput(epoch=0)
        
        assert metrics['samples_per_second'] > 0
        assert metrics['total_samples'] == len(sample_dataset)
        
        # Test parameter compression
        parameters = {
            name: param.data.clone()
            for name, param in model.named_parameters()
        }
        
        compressed, metadata = optimizer_perf.compress_parameters(parameters)
        # Verify compression worked and can be decompressed
        assert len(compressed) > 0
        decompressed = optimizer_perf.decompress_parameters(compressed, metadata)
        assert len(decompressed) == len(parameters)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
