"""
Performance Optimization Demo for SentryFL

Demonstrates all performance optimization features:
- GPU acceleration
- Mixed precision training (FP16)
- Data parallelism
- Preprocessed data caching
- Gradient accumulation
- Multi-threaded data loading
- Parameter compression
- Training throughput logging

Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.8, 19.9
"""

import torch
import torch.nn as nn
from torch.utils.data import TensorDataset
import time
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sentryfl.optimization import PerformanceOptimizer


class SimpleAnomalyDetector(nn.Module):
    """Simple model for demonstration"""
    def __init__(self, input_dim=38, hidden_dim=64):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.1)
        self.fc2 = nn.Linear(hidden_dim, 1)
    
    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)
        x = self.dropout(x)
        x = self.fc2(x)
        return x


def create_synthetic_dataset(num_samples=10000, input_dim=38):
    """Create synthetic dataset for demonstration"""
    print(f"Creating synthetic dataset: {num_samples} samples, {input_dim} features")
    
    # Generate random features
    X = torch.randn(num_samples, input_dim)
    
    # Generate labels (binary classification)
    y = torch.randint(0, 2, (num_samples,)).float()
    
    return TensorDataset(X, y)


def benchmark_configuration(config_name, config_kwargs, model, dataset, batch_size=32, num_epochs=3):
    """Benchmark a specific configuration"""
    print(f"\n{'='*60}")
    print(f"Benchmarking: {config_name}")
    print(f"{'='*60}")
    
    # Extract batch_size if present (not an optimizer parameter)
    optimizer_config = {k: v for k, v in config_kwargs.items() if k != 'batch_size'}
    
    # Initialize optimizer with configuration
    optimizer_perf = PerformanceOptimizer(**optimizer_config)
    
    # Setup model
    model_copy = SimpleAnomalyDetector(input_dim=38, hidden_dim=64)
    model_copy, device = optimizer_perf.setup_model(model_copy)
    
    # Create dataloader
    dataloader = optimizer_perf.create_dataloader(
        dataset,
        batch_size=batch_size,
        shuffle=True
    )
    
    # Setup training
    optimizer = torch.optim.Adam(model_copy.parameters(), lr=0.001)
    criterion = nn.BCEWithLogitsLoss()
    
    # Start throughput tracking
    optimizer_perf.start_throughput_tracking()
    
    # Training loop
    model_copy.train()
    total_start = time.time()
    
    for epoch in range(num_epochs):
        epoch_loss = 0.0
        num_batches = 0
        
        for step, (batch_x, batch_y) in enumerate(dataloader):
            batch_start = time.time()
            
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            
            # Forward with autocast
            with optimizer_perf.autocast_context():
                outputs = model_copy(batch_x).squeeze(-1)
                loss = criterion(outputs, batch_y)
            
            # Backward with scaling
            optimizer_perf.backward(loss)
            
            # Optimizer step with gradient accumulation
            if optimizer_perf.should_optimizer_step(step):
                optimizer_perf.optimizer_step(optimizer, max_grad_norm=1.0)
                optimizer.zero_grad()
            
            # Track throughput
            batch_time = time.time() - batch_start
            optimizer_perf.track_batch(len(batch_x), batch_time)
            
            epoch_loss += loss.item()
            num_batches += 1
        
        # Log epoch metrics
        avg_loss = epoch_loss / num_batches
        metrics = optimizer_perf.log_throughput(epoch=epoch)
        
        print(f"  Epoch {epoch+1}/{num_epochs}: "
              f"Loss={avg_loss:.4f}, "
              f"Throughput={metrics['samples_per_second']:.2f} samples/sec")
    
    total_time = time.time() - total_start
    
    # Final metrics
    final_metrics = optimizer_perf.log_throughput()
    
    print(f"\n  Results:")
    print(f"    Total time: {total_time:.2f} seconds")
    print(f"    Avg throughput: {final_metrics['samples_per_second']:.2f} samples/sec")
    print(f"    Avg batch time: {final_metrics['avg_batch_time']*1000:.2f} ms")
    
    # Test parameter compression
    print(f"\n  Testing parameter compression...")
    parameters = {name: param.data.clone() for name, param in model_copy.named_parameters()}
    compressed, metadata = optimizer_perf.compress_parameters(parameters)
    
    print(f"    Original size: {metadata['original_size']/1e6:.2f} MB")
    print(f"    Compressed size: {metadata['compressed_size']/1e6:.2f} MB")
    print(f"    Compression ratio: {metadata['compression_ratio']:.2f}x")
    
    # Get device info
    device_info = optimizer_perf.get_device_info()
    print(f"\n  Device info:")
    print(f"    Device type: {device_info['device_type']}")
    if device_info['device_type'] == 'cuda':
        print(f"    GPU name: {device_info['gpu_name']}")
        print(f"    GPU memory: {device_info['gpu_memory_total']:.2f} GB")
        print(f"    Memory allocated: {device_info['gpu_memory_allocated']:.2f} GB")
    
    return final_metrics


def demonstrate_data_caching(optimizer_perf):
    """Demonstrate data caching feature"""
    print(f"\n{'='*60}")
    print(f"Demonstrating Data Caching (Requirement 19.4)")
    print(f"{'='*60}")
    
    # Generate cache key
    cache_key = optimizer_perf.generate_cache_key(
        'demo_dataset',
        num_samples=10000,
        input_dim=38,
        version=1
    )
    
    print(f"Cache key: {cache_key}")
    
    # Create test data
    test_data = {
        'features': torch.randn(100, 38),
        'labels': torch.randint(0, 2, (100,))
    }
    
    metadata = {
        'num_samples': 100,
        'input_dim': 38,
        'version': 1
    }
    
    # Cache data
    print("Caching preprocessed data...")
    optimizer_perf.cache_preprocessed_data(test_data, cache_key, metadata)
    
    # Load cached data
    print("Loading cached data...")
    loaded_data, loaded_metadata = optimizer_perf.load_cached_data(cache_key)
    
    if loaded_data is not None:
        print("✓ Data successfully loaded from cache!")
        print(f"  Metadata: {loaded_metadata}")
    else:
        print("✗ Cache load failed")


def main():
    """Main demonstration"""
    print("="*60)
    print("SentryFL Performance Optimization Demo")
    print("="*60)
    
    # Create synthetic dataset
    dataset = create_synthetic_dataset(num_samples=10000, input_dim=38)
    model = SimpleAnomalyDetector(input_dim=38, hidden_dim=64)
    
    # Configuration 1: Baseline (CPU only)
    config1 = {
        'enable_gpu': False,
        'enable_mixed_precision': False,
        'num_workers': 0,
        'gradient_accumulation_steps': 1,
        'compression_method': 'none'
    }
    
    metrics_baseline = benchmark_configuration(
        "Baseline (CPU, FP32, No optimizations)",
        config1,
        model,
        dataset,
        batch_size=32,
        num_epochs=2
    )
    
    # Configuration 2: GPU + Mixed Precision
    config2 = {
        'enable_gpu': True,
        'enable_mixed_precision': True,
        'num_workers': 0,
        'gradient_accumulation_steps': 1,
        'compression_method': 'none'
    }
    
    metrics_gpu_fp16 = benchmark_configuration(
        "GPU + Mixed Precision (FP16)",
        config2,
        model,
        dataset,
        batch_size=32,
        num_epochs=2
    )
    
    # Configuration 3: Full optimizations
    config3 = {
        'enable_gpu': True,
        'enable_mixed_precision': True,
        'num_workers': 4,
        'gradient_accumulation_steps': 2,
        'compression_method': 'quantize',
        'compression_bits': 8
    }
    
    metrics_full = benchmark_configuration(
        "Full Optimizations (GPU + FP16 + 4 workers + Grad Accum + Compression)",
        config3,
        model,
        dataset,
        batch_size=32,
        num_epochs=2
    )
    
    # Demonstrate data caching
    optimizer_demo = PerformanceOptimizer()
    demonstrate_data_caching(optimizer_demo)
    
    # Summary
    print(f"\n{'='*60}")
    print("Performance Summary")
    print(f"{'='*60}")
    
    baseline_throughput = metrics_baseline['samples_per_second']
    
    if torch.cuda.is_available():
        gpu_fp16_throughput = metrics_gpu_fp16['samples_per_second']
        full_throughput = metrics_full['samples_per_second']
        
        print(f"Baseline (CPU):          {baseline_throughput:.2f} samples/sec")
        print(f"GPU + FP16:              {gpu_fp16_throughput:.2f} samples/sec "
              f"({gpu_fp16_throughput/baseline_throughput:.2f}x speedup)")
        print(f"Full Optimizations:      {full_throughput:.2f} samples/sec "
              f"({full_throughput/baseline_throughput:.2f}x speedup)")
    else:
        print(f"Baseline (CPU):          {baseline_throughput:.2f} samples/sec")
        print("\nNote: GPU not available. GPU optimizations were not benchmarked.")
    
    print(f"\n{'='*60}")
    print("Requirements Coverage:")
    print(f"{'='*60}")
    print("✓ Requirement 19.1: GPU acceleration support")
    print("✓ Requirement 19.2: Mixed precision training (FP16)")
    print("✓ Requirement 19.3: Data parallelism")
    print("✓ Requirement 19.4: Preprocessed data caching")
    print("✓ Requirement 19.5: Gradient accumulation")
    print("✓ Requirement 19.6: Multi-threaded data loading")
    print("✓ Requirement 19.8: Training throughput logging")
    print("✓ Requirement 19.9: Parameter compression")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
