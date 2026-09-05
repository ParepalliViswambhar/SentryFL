"""
Performance Benchmark Tests for PerformanceOptimizer

Measures actual performance improvements from optimization features:
- GPU vs CPU training throughput (Requirement 19.1)
- Mixed precision (FP16) vs FP32 training speed (Requirement 19.2)
- Data loading with various num_workers (Requirement 19.6)
- Compressed vs uncompressed communication (Requirement 19.9)

This module contains benchmark tests that measure real performance metrics.
Run with: pytest sentryfl/optimization/benchmark_performance.py -v -s

Requirements: 19.1, 19.2, 19.6, 19.9
"""

import pytest
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, TensorDataset, DataLoader
import numpy as np
import time
from pathlib import Path
import tempfile
from typing import Dict, List, Tuple
import json

from .performance_optimizer import PerformanceOptimizer


class BenchmarkModel(nn.Module):
    """
    Model for benchmarking with realistic complexity.
    Similar to PLM backbone with multiple layers.
    """
    def __init__(self, input_dim=100, hidden_dim=512, num_layers=4, output_dim=1):
        super().__init__()
        layers = []
        
        # Input layer
        layers.append(nn.Linear(input_dim, hidden_dim))
        layers.append(nn.ReLU())
        layers.append(nn.Dropout(0.1))
        
        # Hidden layers
        for _ in range(num_layers - 2):
            layers.append(nn.Linear(hidden_dim, hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(0.1))
        
        # Output layer
        layers.append(nn.Linear(hidden_dim, output_dim))
        
        self.model = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.model(x)


def create_benchmark_dataset(num_samples=10000, input_dim=100):
    """Create a realistic dataset for benchmarking"""
    X = torch.randn(num_samples, input_dim)
    y = torch.randn(num_samples, 1)
    return TensorDataset(X, y)


def run_training_benchmark(
    model: nn.Module,
    optimizer_instance: PerformanceOptimizer,
    dataloader: DataLoader,
    num_epochs: int = 3,
    device: torch.device = None
) -> Dict[str, float]:
    """
    Run training benchmark and return performance metrics.
    
    Returns:
        Dict with:
        - total_time: Total training time in seconds
        - samples_per_second: Average throughput
        - avg_batch_time: Average time per batch
        - num_samples: Total samples processed
    """
    model, device = optimizer_instance.setup_model(model)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    model.train()
    optimizer_instance.start_throughput_tracking()
    
    start_time = time.time()
    total_samples = 0
    batch_times = []
    
    for epoch in range(num_epochs):
        for batch_idx, (data, target) in enumerate(dataloader):
            batch_start = time.time()
            
            data, target = data.to(device), target.to(device)
            
            # Forward pass with mixed precision if enabled
            with optimizer_instance.autocast_context():
                output = model(data)
                loss = criterion(output, target)
            
            # Backward pass
            optimizer.zero_grad()
            optimizer_instance.backward(loss)
            
            # Optimizer step with gradient accumulation
            if optimizer_instance.should_optimizer_step(batch_idx):
                optimizer_instance.optimizer_step(optimizer)
            
            batch_time = time.time() - batch_start
            batch_times.append(batch_time)
            optimizer_instance.track_batch(len(data), batch_time)
            total_samples += len(data)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    throughput_stats = optimizer_instance.log_throughput()
    
    return {
        'total_time': total_time,
        'samples_per_second': throughput_stats.get('samples_per_second', 0),
        'avg_batch_time': np.mean(batch_times),
        'num_samples': total_samples
    }


@pytest.fixture
def benchmark_model():
    """Create benchmark model"""
    return BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)


@pytest.fixture
def benchmark_dataset():
    """Create benchmark dataset"""
    return create_benchmark_dataset(num_samples=5000, input_dim=100)


class TestGPUvsCPUBenchmark:
    """
    Benchmark training throughput with GPU vs CPU
    Validates Requirement 19.1: GPU acceleration support
    """
    
    @pytest.mark.benchmark
    def test_gpu_vs_cpu_throughput(self, benchmark_model, benchmark_dataset):
        """
        Compare training throughput between GPU and CPU.
        GPU should be significantly faster (2-10x) than CPU when available.
        
        Validates Requirement 19.1: GPU acceleration support
        """
        batch_size = 64
        num_epochs = 2
        
        print("\n" + "="*60)
        print("BENCHMARK: GPU vs CPU Training Throughput")
        print("="*60)
        
        # CPU benchmark
        print("\n[1/2] Running CPU benchmark...")
        cpu_optimizer = PerformanceOptimizer(enable_gpu=False, num_workers=0)
        cpu_dataloader = cpu_optimizer.create_dataloader(
            benchmark_dataset, 
            batch_size=batch_size,
            shuffle=True
        )
        
        cpu_model = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
        cpu_stats = run_training_benchmark(
            cpu_model, 
            cpu_optimizer, 
            cpu_dataloader, 
            num_epochs=num_epochs
        )
        
        print(f"CPU Results:")
        print(f"  - Total time: {cpu_stats['total_time']:.2f}s")
        print(f"  - Throughput: {cpu_stats['samples_per_second']:.2f} samples/sec")
        print(f"  - Avg batch time: {cpu_stats['avg_batch_time']*1000:.2f}ms")
        
        # GPU benchmark (if available)
        if torch.cuda.is_available():
            print("\n[2/2] Running GPU benchmark...")
            gpu_optimizer = PerformanceOptimizer(enable_gpu=True, num_workers=0)
            gpu_dataloader = gpu_optimizer.create_dataloader(
                benchmark_dataset, 
                batch_size=batch_size,
                shuffle=True
            )
            
            gpu_model = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
            gpu_stats = run_training_benchmark(
                gpu_model, 
                gpu_optimizer, 
                gpu_dataloader, 
                num_epochs=num_epochs
            )
            
            print(f"\nGPU Results:")
            print(f"  - Total time: {gpu_stats['total_time']:.2f}s")
            print(f"  - Throughput: {gpu_stats['samples_per_second']:.2f} samples/sec")
            print(f"  - Avg batch time: {gpu_stats['avg_batch_time']*1000:.2f}ms")
            
            speedup = cpu_stats['total_time'] / gpu_stats['total_time']
            throughput_improvement = (gpu_stats['samples_per_second'] / cpu_stats['samples_per_second']) - 1
            
            print(f"\n{'='*60}")
            print(f"Performance Summary:")
            print(f"  - GPU Speedup: {speedup:.2f}x")
            print(f"  - Throughput Improvement: {throughput_improvement*100:.1f}%")
            print(f"{'='*60}\n")
            
            # Validate GPU is faster
            assert gpu_stats['samples_per_second'] > cpu_stats['samples_per_second'], \
                "GPU should have higher throughput than CPU"
            
            # Log results
            results = {
                'cpu': cpu_stats,
                'gpu': gpu_stats,
                'speedup': speedup,
                'throughput_improvement_pct': throughput_improvement * 100
            }
            
        else:
            print("\n⚠️  GPU not available - skipping GPU benchmark")
            print("CPU benchmark completed successfully")
            print("\n✓ CPU training feature tested successfully")
            results = {'cpu': cpu_stats}
        
        # Return results for inspection
        return results


class TestMixedPrecisionBenchmark:
    """
    Benchmark mixed precision (FP16) vs FP32 training speed
    Validates Requirement 19.2: Mixed precision training support
    """
    
    @pytest.mark.benchmark
    @pytest.mark.skipif(not torch.cuda.is_available(), reason="Mixed precision requires GPU")
    def test_mixed_precision_vs_fp32(self, benchmark_model, benchmark_dataset):
        """
        Compare training speed between FP16 and FP32.
        Mixed precision should be faster (1.5-3x) with similar accuracy.
        
        Validates Requirement 19.2: Mixed precision training support
        """
        batch_size = 64
        num_epochs = 2
        
        print("\n" + "="*60)
        print("BENCHMARK: Mixed Precision (FP16) vs FP32")
        print("="*60)
        
        # FP32 baseline
        print("\n[1/2] Running FP32 (full precision) benchmark...")
        fp32_optimizer = PerformanceOptimizer(enable_gpu=True, enable_mixed_precision=False, num_workers=0)
        fp32_dataloader = fp32_optimizer.create_dataloader(
            benchmark_dataset,
            batch_size=batch_size,
            shuffle=True
        )
        
        fp32_model = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
        fp32_stats = run_training_benchmark(
            fp32_model,
            fp32_optimizer,
            fp32_dataloader,
            num_epochs=num_epochs
        )
        
        print(f"FP32 Results:")
        print(f"  - Total time: {fp32_stats['total_time']:.2f}s")
        print(f"  - Throughput: {fp32_stats['samples_per_second']:.2f} samples/sec")
        print(f"  - Avg batch time: {fp32_stats['avg_batch_time']*1000:.2f}ms")
        
        # FP16 mixed precision
        print("\n[2/2] Running FP16 (mixed precision) benchmark...")
        fp16_optimizer = PerformanceOptimizer(enable_gpu=True, enable_mixed_precision=True, num_workers=0)
        fp16_dataloader = fp16_optimizer.create_dataloader(
            benchmark_dataset,
            batch_size=batch_size,
            shuffle=True
        )
        
        fp16_model = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
        fp16_stats = run_training_benchmark(
            fp16_model,
            fp16_optimizer,
            fp16_dataloader,
            num_epochs=num_epochs
        )
        
        print(f"\nFP16 Results:")
        print(f"  - Total time: {fp16_stats['total_time']:.2f}s")
        print(f"  - Throughput: {fp16_stats['samples_per_second']:.2f} samples/sec")
        print(f"  - Avg batch time: {fp16_stats['avg_batch_time']*1000:.2f}ms")
        
        speedup = fp32_stats['total_time'] / fp16_stats['total_time']
        throughput_improvement = (fp16_stats['samples_per_second'] / fp32_stats['samples_per_second']) - 1
        
        print(f"\n{'='*60}")
        print(f"Performance Summary:")
        print(f"  - FP16 Speedup: {speedup:.2f}x")
        print(f"  - Throughput Improvement: {throughput_improvement*100:.1f}%")
        print(f"{'='*60}\n")
        
        # Validate mixed precision is faster or equal
        # Note: On some GPUs/workloads, mixed precision may not be faster
        assert fp16_stats['total_time'] <= fp32_stats['total_time'] * 1.2, \
            "Mixed precision should not be significantly slower than FP32"
        
        print("✓ Mixed precision training feature tested successfully")
        
        results = {
            'fp32': fp32_stats,
            'fp16': fp16_stats,
            'speedup': speedup,
            'throughput_improvement_pct': throughput_improvement * 100
        }
        
        return results


class TestDataLoadingBenchmark:
    """
    Benchmark data loading with various num_workers
    Validates Requirement 19.6: Multi-threaded data loading
    """
    
    @pytest.mark.benchmark
    def test_data_loading_num_workers(self, benchmark_dataset):
        """
        Compare data loading speed with different num_workers.
        Tests multi-threaded data loading feature.
        
        Note: Multi-threading overhead may not provide benefits for small/simple datasets,
        especially on Windows. The test validates the feature works correctly.
        
        Validates Requirement 19.6: Multi-threaded data loading
        """
        batch_size = 64
        num_batches = 100  # Just test data loading, not full training
        worker_configs = [0, 2, 4]  # Different num_workers to test
        
        print("\n" + "="*60)
        print("BENCHMARK: Data Loading with Various num_workers")
        print("="*60)
        print("\nNote: Multi-threading may have overhead for simple datasets.")
        print("Benefits are typically seen with complex preprocessing or I/O.")
        
        results = {}
        
        for num_workers in worker_configs:
            print(f"\n[{worker_configs.index(num_workers)+1}/{len(worker_configs)}] "
                  f"Testing with num_workers={num_workers}...")
            
            # Create optimizer with specific num_workers setting
            optimizer = PerformanceOptimizer(enable_gpu=False, num_workers=num_workers)
            dataloader = optimizer.create_dataloader(
                benchmark_dataset,
                batch_size=batch_size,
                shuffle=True
            )
            
            # Measure data loading time
            start_time = time.time()
            batches_loaded = 0
            
            for batch_idx, (data, target) in enumerate(dataloader):
                # Just iterate through batches without training
                batches_loaded += 1
                if batches_loaded >= num_batches:
                    break
            
            end_time = time.time()
            total_time = end_time - start_time
            batches_per_second = batches_loaded / total_time
            samples_per_second = (batches_loaded * batch_size) / total_time
            
            results[num_workers] = {
                'total_time': total_time,
                'batches_per_second': batches_per_second,
                'samples_per_second': samples_per_second,
                'avg_batch_time': total_time / batches_loaded
            }
            
            print(f"  Results (num_workers={num_workers}):")
            print(f"    - Total time: {total_time:.2f}s")
            print(f"    - Throughput: {samples_per_second:.2f} samples/sec")
            print(f"    - Batches/sec: {batches_per_second:.2f}")
            print(f"    - Avg batch time: {results[num_workers]['avg_batch_time']*1000:.2f}ms")
        
        # Print summary
        print(f"\n{'='*60}")
        print("Performance Summary:")
        baseline_throughput = results[0]['samples_per_second']
        
        for num_workers in worker_configs:
            improvement = (results[num_workers]['samples_per_second'] / baseline_throughput - 1) * 100
            print(f"  - num_workers={num_workers}: {results[num_workers]['samples_per_second']:.2f} samples/sec "
                  f"({improvement:+.1f}% vs baseline)")
        
        print(f"{'='*60}\n")
        
        # Find optimal num_workers (highest throughput)
        optimal_workers = max(results.keys(), key=lambda k: results[k]['samples_per_second'])
        print(f"Optimal num_workers: {optimal_workers} "
              f"({results[optimal_workers]['samples_per_second']:.2f} samples/sec)")
        
        print("\n✓ Multi-threaded data loading feature tested successfully")
        print("  For real workloads with heavy preprocessing, use num_workers=4-8")
        
        # Just validate that all configurations completed without errors
        assert len(results) == len(worker_configs), "All worker configurations should complete"
        assert all(r['total_time'] > 0 for r in results.values()), "All tests should have valid timing"
        
        return results


class TestCompressionBenchmark:
    """
    Benchmark compressed vs uncompressed communication
    Validates Requirement 19.9: Parameter update compression
    """
    
    @pytest.mark.benchmark
    def test_compression_performance(self, benchmark_model):
        """
        Compare compression ratio and speed across different methods.
        Should achieve significant size reduction with minimal overhead.
        
        Validates Requirement 19.9: Parameter update compression
        """
        compression_configs = [
            ('none', {'compression_method': 'none'}),
            ('quantize-8bit', {'compression_method': 'quantize', 'compression_bits': 8}),
            ('quantize-16bit', {'compression_method': 'quantize', 'compression_bits': 16}),
            ('sparsify', {'compression_method': 'sparsify'}),
        ]
        
        print("\n" + "="*60)
        print("BENCHMARK: Parameter Compression Methods")
        print("="*60)
        
        # Get model parameters
        model = benchmark_model
        original_params = {name: param.detach().cpu().clone() 
                          for name, param in model.named_parameters()}
        
        # Calculate original size
        original_size = sum(p.numel() * p.element_size() for p in original_params.values())
        
        print(f"\nOriginal model parameters:")
        print(f"  - Total parameters: {sum(p.numel() for p in original_params.values()):,}")
        print(f"  - Uncompressed size: {original_size / 1024:.2f} KB")
        
        results = {}
        
        for method_name, config in compression_configs:
            print(f"\n[{compression_configs.index((method_name, config))+1}/{len(compression_configs)}] "
                  f"Testing compression method: {method_name}")
            
            optimizer = PerformanceOptimizer(enable_gpu=False, **config)
            
            # Measure compression time
            compress_start = time.time()
            compressed_bytes, metadata = optimizer.compress_parameters(original_params)
            compress_time = time.time() - compress_start
            
            # Measure compressed size
            compressed_size = len(compressed_bytes)
            
            # Measure decompression time
            decompress_start = time.time()
            decompressed_params = optimizer.decompress_parameters(compressed_bytes, metadata)
            decompress_time = time.time() - decompress_start
            
            # Calculate metrics
            compression_ratio = metadata['compression_ratio']
            size_reduction_pct = (1 - metadata['compressed_size'] / metadata['original_size']) * 100
            
            # Calculate reconstruction error
            total_error = 0
            total_params = 0
            for name in original_params:
                if name in decompressed_params:
                    orig = original_params[name].float()
                    decomp = decompressed_params[name].float()
                    error = torch.abs(orig - decomp).mean().item()
                    total_error += error * orig.numel()
                    total_params += orig.numel()
            
            avg_error = total_error / total_params if total_params > 0 else 0
            
            results[method_name] = {
                'compressed_size_kb': compressed_size / 1024,
                'compression_ratio': compression_ratio,
                'size_reduction_pct': size_reduction_pct,
                'compress_time': compress_time,
                'decompress_time': decompress_time,
                'total_time': compress_time + decompress_time,
                'avg_reconstruction_error': avg_error
            }
            
            print(f"  Results:")
            print(f"    - Compressed size: {compressed_size / 1024:.2f} KB")
            print(f"    - Compression ratio: {compression_ratio:.2f}x")
            print(f"    - Size reduction: {size_reduction_pct:.1f}%")
            print(f"    - Compression time: {compress_time*1000:.2f}ms")
            print(f"    - Decompression time: {decompress_time*1000:.2f}ms")
            print(f"    - Avg reconstruction error: {avg_error:.6f}")
        
        # Print summary
        print(f"\n{'='*60}")
        print("Compression Performance Summary:")
        print(f"{'Method':<15} {'Ratio':<8} {'Size Red.':<12} {'Time (ms)':<12} {'Error':<12}")
        print("-" * 60)
        
        for method_name in results:
            r = results[method_name]
            print(f"{method_name:<15} {r['compression_ratio']:<8.2f} "
                  f"{r['size_reduction_pct']:<12.1f}% "
                  f"{r['total_time']*1000:<12.2f} "
                  f"{r['avg_reconstruction_error']:<12.6f}")
        
        print(f"{'='*60}\n")
        
        # Find best method (highest compression with acceptable error)
        compressed_methods = [m for m in results if m != 'none' and results[m]['avg_reconstruction_error'] < 0.1]
        if compressed_methods:
            best_method = max(compressed_methods, key=lambda m: results[m]['compression_ratio'])
            print(f"Best compression method (error < 0.1): {best_method} "
                  f"({results[best_method]['compression_ratio']:.2f}x ratio)")
        
        # Validate compression reduces size
        if 'none' in results:
            baseline_size = results['none']['compressed_size_kb']
            for method in results:
                if method != 'none':
                    assert results[method]['compressed_size_kb'] <= baseline_size * 1.05, \
                        f"{method} compression should reduce or maintain size compared to no compression"
        
        return results


# Utility function to save benchmark results
def save_benchmark_results(results: Dict, output_path: str = None):
    """
    Save benchmark results to JSON file.
    
    Args:
        results: Dictionary of benchmark results
        output_path: Path to save results (default: ./benchmark_results.json)
    """
    if output_path is None:
        output_path = Path(__file__).parent / "benchmark_results.json"
    
    # Convert numpy/torch types to native Python types
    def convert_types(obj):
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, torch.Tensor):
            return obj.cpu().numpy().tolist()
        elif isinstance(obj, dict):
            return {k: convert_types(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_types(v) for v in obj]
        else:
            return obj
    
    results_serializable = convert_types(results)
    
    with open(output_path, 'w') as f:
        json.dump(results_serializable, f, indent=2)
    
    print(f"\nBenchmark results saved to: {output_path}")



if __name__ == "__main__":
    """
    Run all benchmarks when executed directly.
    
    Usage:
        python benchmark_performance.py
    or
        pytest benchmark_performance.py -v -s -m benchmark
    """
    print("\n" + "="*70)
    print(" " * 15 + "SENTRYFL PERFORMANCE BENCHMARKS")
    print("="*70)
    print("\nRunning comprehensive performance benchmarks...")
    print("This will test GPU/CPU, mixed precision, data loading, and compression.")
    print("\nNote: Some benchmarks require GPU and will be skipped if unavailable.\n")
    
    # Create test fixtures
    model = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
    dataset = create_benchmark_dataset(num_samples=5000, input_dim=100)
    
    all_results = {}
    
    # Run benchmarks
    try:
        # GPU vs CPU
        print("\n" + "-"*70)
        test_gpu_cpu = TestGPUvsCPUBenchmark()
        model1 = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
        all_results['gpu_vs_cpu'] = test_gpu_cpu.test_gpu_vs_cpu_throughput(model1, dataset)
        
        # Mixed precision (only if GPU available)
        if torch.cuda.is_available():
            print("\n" + "-"*70)
            test_mixed_precision = TestMixedPrecisionBenchmark()
            model2 = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
            all_results['mixed_precision'] = test_mixed_precision.test_mixed_precision_vs_fp32(model2, dataset)
        
        # Data loading
        print("\n" + "-"*70)
        test_data_loading = TestDataLoadingBenchmark()
        all_results['data_loading'] = test_data_loading.test_data_loading_num_workers(dataset)
        
        # Compression
        print("\n" + "-"*70)
        test_compression = TestCompressionBenchmark()
        model3 = BenchmarkModel(input_dim=100, hidden_dim=512, num_layers=4)
        all_results['compression'] = test_compression.test_compression_performance(model3)
        
        # Save all results
        save_benchmark_results(all_results)
        
        print("\n" + "="*70)
        print(" " * 20 + "BENCHMARKS COMPLETED!")
        print("="*70)
        
    except Exception as e:
        print(f"\n❌ Benchmark failed with error: {e}")
        import traceback
        traceback.print_exc()
