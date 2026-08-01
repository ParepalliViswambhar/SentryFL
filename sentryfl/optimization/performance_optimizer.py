"""
Performance Optimization Module for SentryFL

Implements performance optimizations for training and inference:
- GPU acceleration support for all model components
- Mixed precision training (FP16) configuration
- Data parallelism for batch processing
- Preprocessed data caching to avoid redundant computation
- Efficient gradient accumulation for large batch sizes
- Multi-threaded data loading with DataLoader num_workers
- Parameter update compression for communication efficiency
- Training throughput logging (samples per second)

Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.8, 19.9
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from torch.cuda.amp import autocast, GradScaler
import torch.distributed as dist
from typing import Dict, List, Optional, Any, Tuple
import logging
import time
import pickle
from pathlib import Path
import numpy as np
import hashlib
import json
import zlib

logger = logging.getLogger(__name__)


class PerformanceOptimizer:
    """
    Performance optimization manager for federated learning.
    
    Provides:
    - GPU acceleration with automatic device management
    - Mixed precision training (FP16) for memory and speed
    - Data parallelism across multiple GPUs
    - Data preprocessing cache management
    - Gradient accumulation for large effective batch sizes
    - Optimized data loading with multi-threading
    - Parameter compression for communication efficiency
    - Throughput monitoring and logging
    
    Args:
        enable_gpu: Enable GPU acceleration if available
        enable_mixed_precision: Use FP16 mixed precision training
        enable_data_parallel: Use DataParallel for multi-GPU training
        cache_dir: Directory for caching preprocessed data
        num_workers: Number of worker threads for data loading
        pin_memory: Pin memory for faster GPU transfer
        gradient_accumulation_steps: Steps to accumulate gradients
        compression_method: Method for parameter compression ('quantize', 'sparsify', 'none')
        compression_bits: Bit width for quantization (8 or 16)
        
    Example:
        >>> optimizer = PerformanceOptimizer(
        ...     enable_gpu=True,
        ...     enable_mixed_precision=True,
        ...     num_workers=4,
        ...     gradient_accumulation_steps=4
        ... )
        >>> # Setup model for optimized training
        >>> model, device = optimizer.setup_model(model)
        >>> # Create optimized data loader
        >>> dataloader = optimizer.create_dataloader(dataset, batch_size=32)
        >>> # Training with automatic mixed precision
        >>> with optimizer.autocast_context():
        ...     outputs = model(inputs)
        ...     loss = criterion(outputs, labels)
        >>> optimizer.backward(loss)
        >>> if optimizer.should_optimizer_step(step):
        ...     optimizer.optimizer_step(optimizer_obj)
    """
    
    def __init__(
        self,
        enable_gpu: bool = True,
        enable_mixed_precision: bool = True,
        enable_data_parallel: bool = False,
        cache_dir: str = '.cache/preprocessed',
        num_workers: int = 4,
        pin_memory: bool = True,
        gradient_accumulation_steps: int = 1,
        compression_method: str = 'quantize',
        compression_bits: int = 16
    ):
        """
        Initialize performance optimizer.
        
        Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
        """
        self.enable_gpu = enable_gpu
        self.enable_mixed_precision = enable_mixed_precision
        self.enable_data_parallel = enable_data_parallel
        self.num_workers = num_workers
        self.pin_memory = pin_memory
        self.gradient_accumulation_steps = gradient_accumulation_steps
        self.compression_method = compression_method
        self.compression_bits = compression_bits
        
        # Setup device (Requirement 19.1)
        self.device = self._setup_device()
        
        # Setup mixed precision scaler (Requirement 19.2)
        self.scaler = GradScaler() if enable_mixed_precision and self.device.type == 'cuda' else None
        
        # Setup cache directory (Requirement 19.4)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_enabled = True
        
        # Throughput tracking (Requirement 19.8)
        self.throughput_history = []
        self.step_times = []
        self.samples_processed = 0
        self.training_start_time = None
        
        # Gradient accumulation tracking (Requirement 19.5)
        self.accumulation_counter = 0
        
        logger.info(
            f"PerformanceOptimizer initialized: "
            f"device={self.device}, "
            f"mixed_precision={enable_mixed_precision}, "
            f"data_parallel={enable_data_parallel}, "
            f"num_workers={num_workers}, "
            f"grad_accum_steps={gradient_accumulation_steps}, "
            f"compression={compression_method}"
        )
    
    def _setup_device(self) -> torch.device:
        """
        Setup compute device with GPU support.
        
        Returns:
            torch.device for computation
            
        Requirement: 19.1 - GPU acceleration support
        """
        if self.enable_gpu and torch.cuda.is_available():
            device = torch.device('cuda')
            gpu_count = torch.cuda.device_count()
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
            
            logger.info(
                f"GPU acceleration enabled: {gpu_count} GPU(s) available"
            )
            logger.info(
                f"Using GPU: {gpu_name} ({gpu_memory:.2f} GB memory)"
            )
            
            # Enable TF32 for faster computation on Ampere GPUs
            if hasattr(torch.backends.cuda.matmul, 'allow_tf32'):
                torch.backends.cuda.matmul.allow_tf32 = True
                torch.backends.cudnn.allow_tf32 = True
                logger.debug("Enabled TF32 for faster computation")
        else:
            device = torch.device('cpu')
            if self.enable_gpu:
                logger.warning("GPU requested but not available, using CPU")
            else:
                logger.info("Using CPU for computation")
        
        return device
    
    def setup_model(
        self,
        model: nn.Module,
        use_compile: bool = False
    ) -> Tuple[nn.Module, torch.device]:
        """
        Setup model for optimized training.
        
        Applies:
        - Device transfer (GPU/CPU)
        - Data parallelism for multi-GPU
        - Model compilation (PyTorch 2.0+)
        
        Args:
            model: PyTorch model
            use_compile: Use torch.compile for optimization (PyTorch 2.0+)
            
        Returns:
            Tuple of (optimized_model, device)
            
        Requirements: 19.1 - GPU acceleration, 19.3 - Data parallelism
        """
        logger.info("Setting up model for optimized training")
        
        # Move model to device (Requirement 19.1)
        model = model.to(self.device)
        
        # Apply data parallelism if multiple GPUs available (Requirement 19.3)
        if self.enable_data_parallel and torch.cuda.device_count() > 1:
            logger.info(f"Wrapping model with DataParallel ({torch.cuda.device_count()} GPUs)")
            model = nn.DataParallel(model)
        
        # Compile model for optimization (PyTorch 2.0+)
        if use_compile and hasattr(torch, 'compile'):
            logger.info("Compiling model with torch.compile")
            try:
                model = torch.compile(model)
            except Exception as e:
                logger.warning(f"Model compilation failed: {e}, using standard model")
        
        # Log model memory footprint
        if self.device.type == 'cuda':
            torch.cuda.reset_peak_memory_stats()
            model_memory = torch.cuda.memory_allocated() / 1e6
            logger.info(f"Model memory footprint: {model_memory:.2f} MB")
        
        return model, self.device
    
    def create_dataloader(
        self,
        dataset: Dataset,
        batch_size: int,
        shuffle: bool = True,
        drop_last: bool = False
    ) -> DataLoader:
        """
        Create optimized DataLoader with multi-threading.
        
        Args:
            dataset: PyTorch Dataset
            batch_size: Batch size
            shuffle: Shuffle data
            drop_last: Drop last incomplete batch
            
        Returns:
            Optimized DataLoader
            
        Requirement: 19.6 - Multi-threaded data loading with num_workers
        """
        logger.debug(
            f"Creating DataLoader: batch_size={batch_size}, "
            f"num_workers={self.num_workers}, shuffle={shuffle}"
        )
        
        dataloader = DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=shuffle,
            num_workers=self.num_workers,
            pin_memory=self.pin_memory and self.device.type == 'cuda',
            drop_last=drop_last,
            persistent_workers=self.num_workers > 0,  # Keep workers alive
            prefetch_factor=2 if self.num_workers > 0 else None  # Prefetch batches
        )
        
        return dataloader
    
    def autocast_context(self):
        """
        Get automatic mixed precision context manager.
        
        Use with 'with' statement for mixed precision training.
        
        Returns:
            Context manager for autocast (or dummy context if disabled)
            
        Requirement: 19.2 - Mixed precision training (FP16)
        
        Example:
            >>> with optimizer.autocast_context():
            ...     outputs = model(inputs)
            ...     loss = criterion(outputs, labels)
        """
        if self.enable_mixed_precision and self.device.type == 'cuda':
            return autocast()
        else:
            # Return dummy context manager that does nothing
            from contextlib import nullcontext
            return nullcontext()
    
    def backward(self, loss: torch.Tensor):
        """
        Perform backward pass with gradient scaling.
        
        Automatically handles mixed precision gradient scaling.
        
        Args:
            loss: Loss tensor
            
        Requirement: 19.2 - Mixed precision training
        """
        if self.scaler is not None:
            # Scale loss for mixed precision
            self.scaler.scale(loss).backward()
        else:
            # Standard backward pass
            loss.backward()
        
        self.accumulation_counter += 1
    
    def should_optimizer_step(self, step: Optional[int] = None) -> bool:
        """
        Check if optimizer should step based on gradient accumulation.
        
        Args:
            step: Optional current step number
            
        Returns:
            True if optimizer should step
            
        Requirement: 19.5 - Efficient gradient accumulation
        """
        if step is not None:
            return (step + 1) % self.gradient_accumulation_steps == 0
        else:
            return self.accumulation_counter >= self.gradient_accumulation_steps
    
    def optimizer_step(
        self,
        optimizer: torch.optim.Optimizer,
        max_grad_norm: Optional[float] = None
    ):
        """
        Perform optimizer step with gradient scaling and clipping.
        
        Args:
            optimizer: PyTorch optimizer
            max_grad_norm: Optional gradient clipping threshold
            
        Requirement: 19.2 - Mixed precision training, 19.5 - Gradient accumulation
        """
        if self.scaler is not None:
            # Unscale gradients for clipping
            if max_grad_norm is not None:
                self.scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(
                    optimizer.param_groups[0]['params'],
                    max_grad_norm
                )
            
            # Optimizer step with gradient scaling
            self.scaler.step(optimizer)
            self.scaler.update()
        else:
            # Standard optimizer step
            if max_grad_norm is not None:
                torch.nn.utils.clip_grad_norm_(
                    optimizer.param_groups[0]['params'],
                    max_grad_norm
                )
            optimizer.step()
        
        # Reset accumulation counter
        self.accumulation_counter = 0
    
    def cache_preprocessed_data(
        self,
        data: Any,
        cache_key: str,
        metadata: Optional[Dict] = None
    ):
        """
        Cache preprocessed data to disk to avoid redundant computation.
        
        Args:
            data: Data to cache (numpy arrays, tensors, etc.)
            cache_key: Unique identifier for cached data
            metadata: Optional metadata to store with cache
            
        Requirement: 19.4 - Preprocessed data caching
        """
        if not self.cache_enabled:
            return
        
        cache_file = self.cache_dir / f"{cache_key}.pkl"
        metadata_file = self.cache_dir / f"{cache_key}_meta.json"
        
        try:
            logger.debug(f"Caching preprocessed data: {cache_key}")
            
            # Save data
            with open(cache_file, 'wb') as f:
                pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
            
            # Save metadata
            if metadata is not None:
                with open(metadata_file, 'w') as f:
                    json.dump(metadata, f)
            
            cache_size = cache_file.stat().st_size / 1e6
            logger.debug(f"Cached {cache_key} ({cache_size:.2f} MB)")
            
        except Exception as e:
            logger.warning(f"Failed to cache data {cache_key}: {e}")
    
    def load_cached_data(
        self,
        cache_key: str
    ) -> Optional[Tuple[Any, Optional[Dict]]]:
        """
        Load cached preprocessed data from disk.
        
        Args:
            cache_key: Unique identifier for cached data
            
        Returns:
            Tuple of (data, metadata) if cache exists, None otherwise
            
        Requirement: 19.4 - Preprocessed data caching
        """
        if not self.cache_enabled:
            return None
        
        cache_file = self.cache_dir / f"{cache_key}.pkl"
        metadata_file = self.cache_dir / f"{cache_key}_meta.json"
        
        if not cache_file.exists():
            return None
        
        try:
            logger.debug(f"Loading cached data: {cache_key}")
            
            # Load data
            with open(cache_file, 'rb') as f:
                data = pickle.load(f)
            
            # Load metadata if exists
            metadata = None
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
            
            cache_size = cache_file.stat().st_size / 1e6
            logger.debug(f"Loaded cached {cache_key} ({cache_size:.2f} MB)")
            
            return data, metadata
            
        except Exception as e:
            logger.warning(f"Failed to load cached data {cache_key}: {e}")
            return None
    
    def generate_cache_key(self, *args, **kwargs) -> str:
        """
        Generate unique cache key from arguments.
        
        Args:
            *args: Positional arguments to hash
            **kwargs: Keyword arguments to hash
            
        Returns:
            SHA256 hash as cache key
            
        Requirement: 19.4 - Preprocessed data caching
        """
        # Create deterministic string from arguments
        key_str = str(args) + str(sorted(kwargs.items()))
        
        # Generate hash
        cache_key = hashlib.sha256(key_str.encode()).hexdigest()[:16]
        
        return cache_key
    
    def compress_parameters(
        self,
        parameters: Dict[str, torch.Tensor]
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Compress model parameters for efficient communication.
        
        Supports:
        - Quantization (16-bit or 8-bit)
        - Sparsification (zero out small values)
        - Standard compression (zlib)
        
        Args:
            parameters: Dictionary of parameter tensors
            
        Returns:
            Tuple of (compressed_bytes, compression_metadata)
            
        Requirement: 19.9 - Parameter update compression
        """
        logger.debug(
            f"Compressing {len(parameters)} parameters with "
            f"method={self.compression_method}"
        )
        
        if self.compression_method == 'quantize':
            compressed, metadata = self._quantize_parameters(parameters)
        elif self.compression_method == 'sparsify':
            compressed, metadata = self._sparsify_parameters(parameters)
        else:
            compressed, metadata = self._compress_parameters_standard(parameters)
        
        # Log compression statistics
        original_size = sum(p.numel() * p.element_size() for p in parameters.values())
        compressed_size = len(compressed)
        compression_ratio = original_size / compressed_size if compressed_size > 0 else 1.0
        
        metadata['original_size'] = original_size
        metadata['compressed_size'] = compressed_size
        metadata['compression_ratio'] = compression_ratio
        
        logger.info(
            f"Compressed parameters: {original_size/1e6:.2f} MB -> "
            f"{compressed_size/1e6:.2f} MB ({compression_ratio:.2f}x reduction)"
        )
        
        return compressed, metadata
    
    def _quantize_parameters(
        self,
        parameters: Dict[str, torch.Tensor]
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Quantize parameters to lower bit width.
        
        Requirement: 19.9 - Parameter compression via quantization
        """
        compressed_params = {}
        scales = {}
        zero_points = {}
        
        for name, param in parameters.items():
            # Compute quantization scale and zero point
            if self.compression_bits == 8:
                qmin, qmax = 0, 255
            elif self.compression_bits == 16:
                qmin, qmax = 0, 65535
            else:
                qmin, qmax = 0, 255
            
            param_min = param.min().item()
            param_max = param.max().item()
            
            scale = (param_max - param_min) / (qmax - qmin) if param_max != param_min else 1.0
            zero_point = qmin - param_min / scale if scale != 0 else 0.0
            
            # Quantize
            quantized = torch.clamp(
                torch.round(param / scale + zero_point),
                qmin,
                qmax
            )
            
            # Store as uint8 or uint16
            if self.compression_bits == 8:
                quantized = quantized.to(torch.uint8)
            else:
                quantized = quantized.to(torch.int16)
            
            compressed_params[name] = quantized
            scales[name] = scale
            zero_points[name] = zero_point
        
        # Serialize
        serialized = pickle.dumps({
            'parameters': compressed_params,
            'scales': scales,
            'zero_points': zero_points,
            'shapes': {name: param.shape for name, param in parameters.items()}
        })
        
        # Apply standard compression on top
        compressed = zlib.compress(serialized, level=6)
        
        metadata = {
            'method': 'quantize',
            'bits': self.compression_bits,
            'num_parameters': len(parameters)
        }
        
        return compressed, metadata
    
    def _sparsify_parameters(
        self,
        parameters: Dict[str, torch.Tensor],
        sparsity_threshold: float = 0.01
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Sparsify parameters by zeroing small values.
        
        Requirement: 19.9 - Parameter compression via sparsification
        """
        sparse_params = {}
        
        for name, param in parameters.items():
            # Compute threshold as percentile of absolute values
            threshold = torch.quantile(param.abs(), sparsity_threshold)
            
            # Create sparse mask
            mask = param.abs() > threshold
            sparse_param = param * mask
            
            sparse_params[name] = sparse_param
        
        # Serialize and compress
        serialized = pickle.dumps(sparse_params)
        compressed = zlib.compress(serialized, level=6)
        
        metadata = {
            'method': 'sparsify',
            'threshold': sparsity_threshold,
            'num_parameters': len(parameters)
        }
        
        return compressed, metadata
    
    def _compress_parameters_standard(
        self,
        parameters: Dict[str, torch.Tensor]
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Standard compression using zlib.
        
        Requirement: 19.9 - Parameter compression
        """
        serialized = pickle.dumps(parameters)
        compressed = zlib.compress(serialized, level=6)
        
        metadata = {
            'method': 'standard',
            'num_parameters': len(parameters)
        }
        
        return compressed, metadata
    
    def decompress_parameters(
        self,
        compressed: bytes,
        metadata: Dict[str, Any]
    ) -> Dict[str, torch.Tensor]:
        """
        Decompress parameters.
        
        Args:
            compressed: Compressed bytes
            metadata: Compression metadata
            
        Returns:
            Dictionary of decompressed parameters
            
        Requirement: 19.9 - Parameter update compression
        """
        logger.debug(f"Decompressing parameters with method={metadata['method']}")
        
        # Decompress
        decompressed = zlib.decompress(compressed)
        
        if metadata['method'] == 'quantize':
            data = pickle.loads(decompressed)
            parameters = {}
            
            for name, quantized in data['parameters'].items():
                scale = data['scales'][name]
                zero_point = data['zero_points'][name]
                shape = data['shapes'][name]
                
                # Dequantize
                dequantized = (quantized.float() - zero_point) * scale
                parameters[name] = dequantized.reshape(shape)
            
            return parameters
        else:
            # Standard or sparsify
            return pickle.loads(decompressed)
    
    def start_throughput_tracking(self):
        """
        Start tracking training throughput.
        
        Requirement: 19.8 - Training throughput logging
        """
        self.training_start_time = time.time()
        self.samples_processed = 0
        self.step_times = []
        logger.debug("Started throughput tracking")
    
    def track_batch(self, batch_size: int, batch_time: float):
        """
        Track batch processing time and samples.
        
        Args:
            batch_size: Number of samples in batch
            batch_time: Time taken to process batch (seconds)
            
        Requirement: 19.8 - Training throughput logging
        """
        self.samples_processed += batch_size
        self.step_times.append(batch_time)
    
    def log_throughput(self, epoch: Optional[int] = None) -> Dict[str, float]:
        """
        Log training throughput metrics.
        
        Args:
            epoch: Optional epoch number for logging
            
        Returns:
            Dictionary with throughput metrics
            
        Requirement: 19.8 - Training throughput logging (samples per second)
        """
        if self.training_start_time is None or self.samples_processed == 0:
            return {}
        
        # Compute metrics
        elapsed_time = time.time() - self.training_start_time
        samples_per_second = self.samples_processed / elapsed_time if elapsed_time > 0 else 0
        avg_batch_time = np.mean(self.step_times) if self.step_times else 0
        
        metrics = {
            'samples_per_second': samples_per_second,
            'total_samples': self.samples_processed,
            'elapsed_time': elapsed_time,
            'avg_batch_time': avg_batch_time
        }
        
        if epoch is not None:
            metrics['epoch'] = epoch
        
        # Store in history
        self.throughput_history.append(metrics.copy())
        
        # Log
        logger.info(
            f"Training throughput: {samples_per_second:.2f} samples/sec, "
            f"avg batch time: {avg_batch_time*1000:.2f} ms, "
            f"total samples: {self.samples_processed}"
        )
        
        return metrics
    
    def get_throughput_history(self) -> List[Dict[str, float]]:
        """
        Get complete throughput tracking history.
        
        Returns:
            List of throughput metrics per epoch
            
        Requirement: 19.8 - Training throughput logging
        """
        return self.throughput_history.copy()
    
    def get_device_info(self) -> Dict[str, Any]:
        """
        Get compute device information.
        
        Returns:
            Dictionary with device information
        """
        info = {
            'device_type': self.device.type,
            'device_name': str(self.device)
        }
        
        if self.device.type == 'cuda':
            info.update({
                'gpu_count': torch.cuda.device_count(),
                'gpu_name': torch.cuda.get_device_name(0),
                'gpu_memory_total': torch.cuda.get_device_properties(0).total_memory / 1e9,
                'gpu_memory_allocated': torch.cuda.memory_allocated() / 1e9,
                'gpu_memory_reserved': torch.cuda.memory_reserved() / 1e9,
                'cuda_version': torch.version.cuda,
            })
        
        return info
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"PerformanceOptimizer("
            f"device={self.device}, "
            f"mixed_precision={self.enable_mixed_precision}, "
            f"data_parallel={self.enable_data_parallel}, "
            f"num_workers={self.num_workers}, "
            f"grad_accum={self.gradient_accumulation_steps})"
        )
