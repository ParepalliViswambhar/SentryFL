# Performance Optimizer Module

## Overview

The PerformanceOptimizer module provides comprehensive performance optimization features for SentryFL's federated learning training and inference:

- **GPU Acceleration** (Requirement 19.1): Automatic GPU detection and model transfer
- **Mixed Precision Training** (Requirement 19.2): FP16 training for memory and speed improvements
- **Data Parallelism** (Requirement 19.3): Multi-GPU training support
- **Data Caching** (Requirement 19.4): Cache preprocessed data to avoid redundant computation
- **Gradient Accumulation** (Requirement 19.5): Simulate large batch sizes with limited memory
- **Multi-threaded Data Loading** (Requirement 19.6): Parallel data loading with prefetching
- **Parameter Compression** (Requirement 19.9): Reduce communication overhead via quantization/sparsification
- **Throughput Logging** (Requirement 19.8): Track samples per second and training metrics

## Quick Start

### Basic Usage

```python
from sentryfl.optimization import PerformanceOptimizer

# Initialize optimizer with all features enabled
optimizer = PerformanceOptimizer(
    enable_gpu=True,                      # Use GPU if available
    enable_mixed_precision=True,          # Use FP16 training
    enable_data_parallel=False,           # Single GPU mode
    num_workers=4,                        # 4 data loading threads
    gradient_accumulation_steps=4,        # Accumulate 4 batches before update
    compression_method='quantize',        # Quantize parameters for communication
    compression_bits=16                   # Use 16-bit quantization
)

# Setup model for optimized training
model, device = optimizer.setup_model(your_model)

# Create optimized DataLoader
train_loader = optimizer.create_dataloader(
    dataset=train_dataset,
    batch_size=32,
    shuffle=True
)
```

### Training Loop with All Optimizations

```python
import torch
import torch.nn as nn
from sentryfl.optimization import PerformanceOptimizer

# Initialize
optimizer_perf = PerformanceOptimizer(
    enable_gpu=True,
    enable_mixed_precision=True,
    num_workers=4,
    gradient_accumulation_steps=4
)

# Setup
model, device = optimizer_perf.setup_model(model)
train_loader = optimizer_perf.create_dataloader(train_dataset, batch_size=32)
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
criterion = nn.BCEWithLogitsLoss()

# Start throughput tracking
optimizer_perf.start_throughput_tracking()

# Training loop
model.train()
for epoch in range(num_epochs):
    for step, (batch_x, batch_y) in enumerate(train_loader):
        batch_start_time = time.time()
        
        batch_x = batch_x.to(device)
        batch_y = batch_y.to(device)
        
        # Forward pass with automatic mixed precision
        with optimizer_perf.autocast_context():
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
        
        # Backward pass with gradient scaling
        optimizer_perf.backward(loss)
        
        # Optimizer step with gradient accumulation
        if optimizer_perf.should_optimizer_step(step):
            optimizer_perf.optimizer_step(optimizer, max_grad_norm=1.0)
            optimizer.zero_grad()
        
        # Track throughput
        batch_time = time.time() - batch_start_time
        optimizer_perf.track_batch(len(batch_x), batch_time)
    
    # Log throughput per epoch
    metrics = optimizer_perf.log_throughput(epoch=epoch)
    print(f"Epoch {epoch}: {metrics['samples_per_second']:.2f} samples/sec")
```

## Feature Details

### 1. GPU Acceleration (Requirement 19.1)

Automatically detects and uses GPU if available:

```python
optimizer = PerformanceOptimizer(enable_gpu=True)

# Check device info
info = optimizer.get_device_info()
print(f"Using: {info['device_type']}")
if info['device_type'] == 'cuda':
    print(f"GPU: {info['gpu_name']}")
    print(f"Memory: {info['gpu_memory_total']:.2f} GB")
```

### 2. Mixed Precision Training (Requirement 19.2)

Uses FP16 for faster training and reduced memory:

```python
optimizer = PerformanceOptimizer(
    enable_gpu=True,
    enable_mixed_precision=True  # Enable FP16
)

# Use autocast context for mixed precision
with optimizer.autocast_context():
    outputs = model(inputs)
    loss = criterion(outputs, labels)

# Backward with gradient scaling
optimizer.backward(loss)
optimizer.optimizer_step(torch_optimizer)
```

**Benefits:**
- ~2x faster training on modern GPUs (Volta, Turing, Ampere)
- ~50% memory reduction
- Minimal accuracy loss with gradient scaling

### 3. Data Parallelism (Requirement 19.3)

Distributes training across multiple GPUs:

```python
optimizer = PerformanceOptimizer(
    enable_gpu=True,
    enable_data_parallel=True  # Enable multi-GPU
)

# Automatically wraps model with DataParallel
model, device = optimizer.setup_model(model)

# Training scales linearly with GPU count
```

### 4. Data Caching (Requirement 19.4)

Cache preprocessed data to disk:

```python
# Generate cache key from preprocessing parameters
cache_key = optimizer.generate_cache_key(
    'smd_dataset', 
    window_size=100,
    stride=1,
    normalize=True
)

# Try to load from cache
cached = optimizer.load_cached_data(cache_key)
if cached is not None:
    preprocessed_data, metadata = cached
    print("Loaded from cache!")
else:
    # Preprocess data (expensive operation)
    preprocessed_data = preprocess_dataset(raw_data)
    
    # Cache for next time
    optimizer.cache_preprocessed_data(
        preprocessed_data,
        cache_key,
        metadata={'samples': len(preprocessed_data)}
    )
```

### 5. Gradient Accumulation (Requirement 19.5)

Simulate large batch sizes with limited memory:

```python
optimizer = PerformanceOptimizer(
    gradient_accumulation_steps=4  # Accumulate 4 batches
)

for step, batch in enumerate(train_loader):
    # Forward and backward
    loss = compute_loss(batch)
    optimizer.backward(loss)
    
    # Step every 4 batches
    if optimizer.should_optimizer_step(step):
        optimizer.optimizer_step(torch_optimizer)
        torch_optimizer.zero_grad()
```

**Effective batch size** = `batch_size * gradient_accumulation_steps`

### 6. Multi-threaded Data Loading (Requirement 19.6)

Parallel data loading with prefetching:

```python
optimizer = PerformanceOptimizer(
    num_workers=4,      # 4 parallel workers
    pin_memory=True     # Pin memory for faster GPU transfer
)

dataloader = optimizer.create_dataloader(
    dataset,
    batch_size=32,
    shuffle=True
)

# DataLoader automatically:
# - Loads batches in parallel
# - Prefetches 2 batches ahead
# - Keeps workers alive (persistent_workers)
```

**Performance tips:**
- Set `num_workers = 4 * num_gpus` as a starting point
- Use `pin_memory=True` for GPU training
- Balance with CPU cores and RAM

### 7. Parameter Compression (Requirement 19.9)

Compress model updates for efficient communication:

```python
optimizer = PerformanceOptimizer(
    compression_method='quantize',  # or 'sparsify', 'none'
    compression_bits=8              # 8-bit or 16-bit
)

# Extract model parameters
parameters = {
    name: param.data.clone()
    for name, param in model.named_parameters()
}

# Compress for transmission
compressed_bytes, metadata = optimizer.compress_parameters(parameters)

print(f"Original: {metadata['original_size']/1e6:.2f} MB")
print(f"Compressed: {metadata['compressed_size']/1e6:.2f} MB")
print(f"Ratio: {metadata['compression_ratio']:.2f}x")

# On receiver side, decompress
decompressed_params = optimizer.decompress_parameters(
    compressed_bytes,
    metadata
)
```

**Compression methods:**
- `quantize`: Convert FP32 → INT8/INT16 (lossy, high compression)
- `sparsify`: Zero out small values (lossy, good for sparse models)
- `none`: Standard zlib compression (lossless, lower compression)

### 8. Throughput Logging (Requirement 19.8)

Track training performance:

```python
optimizer = PerformanceOptimizer()

# Start tracking
optimizer.start_throughput_tracking()

# During training
for batch in train_loader:
    batch_start = time.time()
    
    # ... training code ...
    
    batch_time = time.time() - batch_start
    optimizer.track_batch(len(batch), batch_time)

# Log metrics
metrics = optimizer.log_throughput(epoch=0)
print(f"Throughput: {metrics['samples_per_second']:.2f} samples/sec")
print(f"Avg batch time: {metrics['avg_batch_time']*1000:.2f} ms")

# Get full history
history = optimizer.get_throughput_history()
```

## Federated Learning Integration

### Client-Side Usage

```python
from sentryfl.federated import FederatedClient
from sentryfl.optimization import PerformanceOptimizer

class OptimizedFederatedClient(FederatedClient):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Initialize performance optimizer
        self.perf_optimizer = PerformanceOptimizer(
            enable_gpu=True,
            enable_mixed_precision=True,
            num_workers=4,
            gradient_accumulation_steps=2,
            compression_method='quantize',
            compression_bits=8
        )
        
        # Setup model for optimized training
        self.model, self.device = self.perf_optimizer.setup_model(self.model)
    
    def local_training(self, local_epochs, dp_module=None, adms_module=None):
        """Optimized local training with performance features"""
        
        # Create optimized data loader
        data_loader = self.perf_optimizer.create_dataloader(
            TensorDataset(*self.local_data),
            batch_size=self.batch_size,
            shuffle=True
        )
        
        # Start throughput tracking
        self.perf_optimizer.start_throughput_tracking()
        
        self.model.train()
        
        for epoch in range(local_epochs):
            for step, (batch_x, batch_y) in enumerate(data_loader):
                batch_start = time.time()
                
                batch_x = batch_x.to(self.device)
                batch_y = batch_y.to(self.device)
                
                # Mixed precision forward
                with self.perf_optimizer.autocast_context():
                    outputs = self.model(batch_x)
                    loss = self.criterion(outputs, batch_y.float())
                
                # Backward with scaling
                self.perf_optimizer.backward(loss)
                
                # Gradient accumulation
                if self.perf_optimizer.should_optimizer_step(step):
                    self.perf_optimizer.optimizer_step(
                        self.optimizer,
                        max_grad_norm=1.0
                    )
                    self.optimizer.zero_grad()
                
                # Track throughput
                batch_time = time.time() - batch_start
                self.perf_optimizer.track_batch(len(batch_x), batch_time)
            
            # Log epoch throughput
            metrics = self.perf_optimizer.log_throughput(epoch=epoch)
        
        # Extract and compress parameters for communication
        parameters = self.extract_parameters()
        compressed, metadata = self.perf_optimizer.compress_parameters(parameters)
        
        return compressed, metadata, self.perf_optimizer.get_throughput_history()
```

### Server-Side Usage

```python
from sentryfl.federated import AggregationServer
from sentryfl.optimization import PerformanceOptimizer

class OptimizedAggregationServer(AggregationServer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        self.perf_optimizer = PerformanceOptimizer()
    
    def collect_client_updates(self, client_updates_compressed):
        """Decompress and collect client updates"""
        
        decompressed_updates = []
        
        for compressed, metadata in client_updates_compressed:
            # Decompress parameters
            parameters = self.perf_optimizer.decompress_parameters(
                compressed,
                metadata
            )
            decompressed_updates.append(parameters)
        
        return decompressed_updates
```

## Performance Benchmarks

### Expected Speedups

| Optimization | Speedup | Memory Savings |
|-------------|---------|----------------|
| GPU Acceleration | 10-100x | N/A |
| Mixed Precision (FP16) | 1.5-2x | 50% |
| Multi-threaded Loading (4 workers) | 1.2-1.5x | N/A |
| Gradient Accumulation (4x) | N/A | 75% |
| Parameter Compression (8-bit) | N/A (communication) | 75% |

### Benchmark Script

```python
import time
from sentryfl.optimization import PerformanceOptimizer

def benchmark_configuration(config_name, **kwargs):
    optimizer = PerformanceOptimizer(**kwargs)
    model, device = optimizer.setup_model(test_model)
    dataloader = optimizer.create_dataloader(test_dataset, batch_size=32)
    
    optimizer.start_throughput_tracking()
    
    # Run training
    start = time.time()
    for epoch in range(3):
        for batch in dataloader:
            # ... training ...
            pass
    elapsed = time.time() - start
    
    metrics = optimizer.log_throughput()
    print(f"{config_name}: {metrics['samples_per_second']:.2f} samples/sec")

# Benchmark different configurations
benchmark_configuration("Baseline", enable_gpu=False, enable_mixed_precision=False)
benchmark_configuration("GPU", enable_gpu=True, enable_mixed_precision=False)
benchmark_configuration("GPU + FP16", enable_gpu=True, enable_mixed_precision=True)
benchmark_configuration("GPU + FP16 + 4 workers", 
                       enable_gpu=True, 
                       enable_mixed_precision=True, 
                       num_workers=4)
```

## Troubleshooting

### Out of Memory Errors

1. **Reduce batch size**:
   ```python
   dataloader = optimizer.create_dataloader(dataset, batch_size=16)
   ```

2. **Enable gradient accumulation**:
   ```python
   optimizer = PerformanceOptimizer(gradient_accumulation_steps=4)
   ```

3. **Use mixed precision**:
   ```python
   optimizer = PerformanceOptimizer(enable_mixed_precision=True)
   ```

### Slow Data Loading

1. **Increase num_workers**:
   ```python
   optimizer = PerformanceOptimizer(num_workers=8)
   ```

2. **Enable pin_memory for GPU**:
   ```python
   optimizer = PerformanceOptimizer(pin_memory=True)
   ```

3. **Cache preprocessed data**:
   ```python
   cache_key = optimizer.generate_cache_key('dataset', version=1)
   optimizer.cache_preprocessed_data(data, cache_key)
   ```

### Communication Overhead

1. **Use aggressive compression**:
   ```python
   optimizer = PerformanceOptimizer(
       compression_method='quantize',
       compression_bits=8  # 8-bit quantization
   )
   ```

2. **Combine with ADMS** for parameter efficiency:
   ```python
   # ADMS already selects top 5% of parameters
   # Compression further reduces communication cost
   ```

## API Reference

### PerformanceOptimizer

#### Constructor

```python
PerformanceOptimizer(
    enable_gpu: bool = True,
    enable_mixed_precision: bool = True,
    enable_data_parallel: bool = False,
    cache_dir: str = '.cache/preprocessed',
    num_workers: int = 4,
    pin_memory: bool = True,
    gradient_accumulation_steps: int = 1,
    compression_method: str = 'quantize',
    compression_bits: int = 16
)
```

#### Methods

- `setup_model(model, use_compile=False)`: Setup model for optimized training
- `create_dataloader(dataset, batch_size, shuffle=True)`: Create optimized DataLoader
- `autocast_context()`: Get mixed precision context manager
- `backward(loss)`: Backward pass with gradient scaling
- `should_optimizer_step(step)`: Check if optimizer should step
- `optimizer_step(optimizer, max_grad_norm=None)`: Perform optimizer step
- `cache_preprocessed_data(data, cache_key, metadata=None)`: Cache data
- `load_cached_data(cache_key)`: Load cached data
- `generate_cache_key(*args, **kwargs)`: Generate cache key
- `compress_parameters(parameters)`: Compress model parameters
- `decompress_parameters(compressed, metadata)`: Decompress parameters
- `start_throughput_tracking()`: Start tracking throughput
- `track_batch(batch_size, batch_time)`: Track batch processing
- `log_throughput(epoch=None)`: Log throughput metrics
- `get_throughput_history()`: Get throughput history
- `get_device_info()`: Get device information

## Requirements Coverage

- ✅ **Requirement 19.1**: GPU acceleration support for all model components
- ✅ **Requirement 19.2**: Mixed precision training (FP16) configuration
- ✅ **Requirement 19.3**: Data parallelism for batch processing
- ✅ **Requirement 19.4**: Preprocessed data caching to avoid redundant computation
- ✅ **Requirement 19.5**: Efficient gradient accumulation for large batch sizes
- ✅ **Requirement 19.6**: Multi-threaded data loading with DataLoader num_workers
- ✅ **Requirement 19.8**: Training throughput logging (samples per second)
- ✅ **Requirement 19.9**: Parameter update compression for communication efficiency

## Testing

Run the test suite:

```bash
pytest sentryfl/optimization/test_performance_optimizer.py -v
```

Test coverage:
- GPU acceleration (device setup, model transfer)
- Mixed precision (autocast, gradient scaling)
- Data parallelism (multi-GPU wrapping)
- Data caching (save/load, cache keys)
- Gradient accumulation (counter, stepping logic)
- Multi-threaded loading (DataLoader creation, prefetching)
- Parameter compression (quantize, sparsify, standard)
- Throughput logging (tracking, metrics)
- End-to-end integration

## References

- [PyTorch Mixed Precision Training](https://pytorch.org/docs/stable/amp.html)
- [PyTorch DataLoader](https://pytorch.org/docs/stable/data.html#torch.utils.data.DataLoader)
- [Gradient Accumulation](https://pytorch.org/docs/stable/notes/amp_examples.html#gradient-accumulation)
- [Model Quantization](https://pytorch.org/docs/stable/quantization.html)
