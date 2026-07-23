"""
Quantization Engine Module: INT8 Post-Training Static Quantization

This module implements post-training static quantization to reduce model size
and inference latency for edge deployment. It converts FP32 models to INT8
using calibration data to compute activation ranges.

Requirements Addressed:
- 9.1: Load trained floating-point model
- 9.2: Implement INT8 post-training static quantization
- 9.3: Compute activation ranges from calibration data
- 9.4: Convert model weights from FP32 to INT8
- 9.5: Compute quantization scale and zero-point per layer
- 9.6: Apply quantization to all linear and convolutional layers
- 9.7: Measure quantized model size in megabytes
- 9.8: Measure communication payload size reduction percentage
- 9.11: Log quantization error (FP32 vs INT8 output difference)
"""

import os
import copy
import logging
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import torch.quantization as quant


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class QuantizationMetrics:
    """Metrics collected during quantization process"""
    fp32_model_size_mb: float
    int8_model_size_mb: float
    size_reduction_percentage: float
    communication_reduction_percentage: float
    quantization_error_mean: float
    quantization_error_std: float
    quantization_error_max: float
    per_layer_scales: Dict[str, float]
    per_layer_zero_points: Dict[str, int]


class QuantizationEngine:
    """
    INT8 Post-Training Static Quantization Engine
    
    This class implements post-training static quantization using PyTorch's
    quantization API. It supports:
    - FP32 model loading
    - INT8 static quantization with calibration
    - Activation range computation
    - Weight conversion from FP32 to INT8
    - Scale and zero-point computation per layer
    - Model size and communication cost measurement
    - Quantization error logging
    """
    
    def __init__(self, model: nn.Module, device: str = 'cpu'):
        """
        Initialize Quantization Engine
        
        Args:
            model: Trained FP32 PyTorch model
            device: Device for computation ('cpu' or 'cuda')
        
        Requirements: 9.1 - Load trained floating-point model
        """
        self.fp32_model = model
        self.device = device
        self.quantized_model = None
        self.calibration_stats = {}
        self.quantization_metrics = None
        
        # Move model to device
        self.fp32_model.to(self.device)
        self.fp32_model.eval()
        
        logger.info(f"QuantizationEngine initialized with model on device: {device}")
        logger.info(f"Model has {self._count_parameters(self.fp32_model)} parameters")
    
    def prepare_model_for_quantization(self) -> nn.Module:
        """
        Prepare model for quantization by inserting observer modules
        
        Requirements: 9.2 - Implement INT8 post-training static quantization
        
        Returns:
            Model with observers attached
        """
        # Create a copy of the model for quantization
        model_copy = copy.deepcopy(self.fp32_model)
        model_copy.to(self.device)
        model_copy.eval()
        
        # Set quantization configuration
        # Use fbgemm backend for x86 CPUs (server/edge deployment)
        model_copy.qconfig = quant.get_default_qconfig('fbgemm')
        
        # Prepare model - insert observers for activation and weight statistics
        # Requirements: 9.6 - Apply quantization to all linear and convolutional layers
        quant.prepare(model_copy, inplace=True)
        
        logger.info("Model prepared for quantization with observers attached")
        return model_copy
    
    def calibrate(self, calibration_loader: DataLoader, num_batches: Optional[int] = None):
        """
        Calibrate quantization parameters using calibration data
        
        This method computes activation ranges by running calibration data through
        the model with observers enabled.
        
        Requirements: 9.3 - Compute activation ranges from calibration data
        
        Args:
            calibration_loader: DataLoader with calibration samples
            num_batches: Number of batches to use for calibration (None = all)
        """
        if self.quantized_model is None:
            self.quantized_model = self.prepare_model_for_quantization()
        
        self.quantized_model.eval()
        
        logger.info("Starting calibration phase...")
        batch_count = 0
        
        with torch.no_grad():
            for batch_idx, batch in enumerate(calibration_loader):
                # Handle different batch formats
                if isinstance(batch, (list, tuple)):
                    x = batch[0]
                else:
                    x = batch
                
                x = x.to(self.device)
                
                # Forward pass to collect statistics
                _ = self.quantized_model(x)
                
                batch_count += 1
                
                if num_batches is not None and batch_count >= num_batches:
                    break
        
        logger.info(f"Calibration completed using {batch_count} batches")
        
        # Collect calibration statistics
        self._collect_calibration_stats()
    
    def _collect_calibration_stats(self):
        """
        Collect activation range statistics from observers
        
        Requirements: 9.3 - Compute activation ranges from calibration data
        Requirements: 9.5 - Compute quantization scale and zero-point per layer
        """
        self.calibration_stats = {}
        
        for name, module in self.quantized_model.named_modules():
            # Check if module has activation_post_process (observer)
            if hasattr(module, 'activation_post_process'):
                observer = module.activation_post_process
                
                # Extract scale and zero_point from observer
                if hasattr(observer, 'calculate_qparams'):
                    scale, zero_point = observer.calculate_qparams()
                    
                    self.calibration_stats[name] = {
                        'scale': scale.item() if torch.is_tensor(scale) else scale,
                        'zero_point': zero_point.item() if torch.is_tensor(zero_point) else zero_point,
                        'dtype': observer.dtype,
                        'qscheme': observer.qscheme
                    }
                    
                    logger.debug(f"Layer {name}: scale={scale}, zero_point={zero_point}")
        
        logger.info(f"Collected calibration statistics for {len(self.calibration_stats)} layers")
    
    def convert_to_int8(self) -> nn.Module:
        """
        Convert calibrated model to INT8
        
        This method converts weights and activations from FP32 to INT8 using
        the calibrated scales and zero-points.
        
        Requirements: 9.2 - Implement INT8 post-training static quantization
        Requirements: 9.4 - Convert model weights from FP32 to INT8
        
        Returns:
            Quantized INT8 model
        """
        if self.quantized_model is None:
            raise RuntimeError("Model must be prepared and calibrated before conversion")
        
        logger.info("Converting model to INT8...")
        
        # Convert model to quantized version
        # This replaces FP32 operations with INT8 operations
        quant.convert(self.quantized_model, inplace=True)
        
        logger.info("Model successfully converted to INT8")
        
        # Log layer-wise quantization parameters
        self._log_quantization_parameters()
        
        return self.quantized_model
    
    def _log_quantization_parameters(self):
        """
        Log scale and zero-point for each quantized layer
        
        Requirements: 9.5 - Compute quantization scale and zero-point per layer
        """
        logger.info("=== Quantization Parameters Per Layer ===")
        
        for name, module in self.quantized_model.named_modules():
            # Check for quantized linear layers
            if isinstance(module, (torch.nn.quantized.Linear, 
                                  torch.nn.quantized.Conv2d,
                                  torch.nn.quantized.Conv1d)):
                # Get weight quantization parameters
                if hasattr(module, 'weight'):
                    try:
                        # Try to get per-tensor quantization parameters
                        weight_scale = module.weight().q_scale()
                        weight_zero_point = module.weight().q_zero_point()
                        
                        logger.info(f"{name}: weight_scale={weight_scale:.6f}, "
                                  f"weight_zero_point={weight_zero_point}")
                    except RuntimeError:
                        # Per-channel quantization - get per-channel scales
                        weight_scales = module.weight().q_per_channel_scales()
                        weight_zero_points = module.weight().q_per_channel_zero_points()
                        
                        logger.info(f"{name}: per_channel_scales (count={len(weight_scales)}), "
                                  f"scale_range=[{weight_scales.min():.6f}, {weight_scales.max():.6f}]")
    
    def quantize(self, calibration_loader: DataLoader, 
                 num_calibration_batches: Optional[int] = None) -> nn.Module:
        """
        Complete quantization pipeline: prepare -> calibrate -> convert
        
        Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
        
        Args:
            calibration_loader: DataLoader with calibration data
            num_calibration_batches: Number of batches for calibration
            
        Returns:
            Quantized INT8 model
        """
        # Step 1: Prepare model with observers
        self.quantized_model = self.prepare_model_for_quantization()
        
        # Step 2: Calibrate on calibration data
        self.calibrate(calibration_loader, num_calibration_batches)
        
        # Step 3: Convert to INT8
        self.convert_to_int8()
        
        return self.quantized_model
    
    def measure_model_size(self) -> Tuple[float, float, float]:
        """
        Measure model size before and after quantization
        
        Requirements: 9.7 - Measure quantized model size in megabytes
        Requirements: 9.8 - Measure communication payload size reduction percentage
        
        Returns:
            Tuple of (fp32_size_mb, int8_size_mb, reduction_percentage)
        """
        # Measure FP32 model size
        fp32_size_bytes = self._get_model_size_bytes(self.fp32_model)
        fp32_size_mb = fp32_size_bytes / (1024 * 1024)
        
        # Measure INT8 model size
        if self.quantized_model is not None:
            int8_size_bytes = self._get_model_size_bytes(self.quantized_model)
            int8_size_mb = int8_size_bytes / (1024 * 1024)
        else:
            raise RuntimeError("Quantized model not available. Run quantize() first.")
        
        # Calculate reduction percentage
        reduction_percentage = ((fp32_size_mb - int8_size_mb) / fp32_size_mb) * 100
        
        logger.info(f"FP32 Model Size: {fp32_size_mb:.2f} MB")
        logger.info(f"INT8 Model Size: {int8_size_mb:.2f} MB")
        logger.info(f"Size Reduction: {reduction_percentage:.2f}%")
        
        return fp32_size_mb, int8_size_mb, reduction_percentage
    
    def _get_model_size_bytes(self, model: nn.Module) -> int:
        """
        Calculate model size in bytes by saving to temporary buffer
        
        Args:
            model: PyTorch model
            
        Returns:
            Model size in bytes
        """
        import io
        
        # Save model to buffer
        buffer = io.BytesIO()
        torch.save(model.state_dict(), buffer)
        size_bytes = buffer.tell()
        buffer.close()
        
        return size_bytes
    
    def compute_quantization_error(self, test_loader: DataLoader, 
                                   num_batches: Optional[int] = None) -> Dict[str, float]:
        """
        Compute quantization error by comparing FP32 and INT8 outputs
        
        Requirements: 9.11 - Log quantization error (FP32 vs INT8 output difference)
        
        Args:
            test_loader: DataLoader with test samples
            num_batches: Number of batches to evaluate (None = all)
            
        Returns:
            Dictionary with error statistics (mean, std, max)
        """
        if self.quantized_model is None:
            raise RuntimeError("Quantized model not available. Run quantize() first.")
        
        self.fp32_model.eval()
        self.quantized_model.eval()
        
        errors = []
        
        logger.info("Computing quantization error...")
        
        with torch.no_grad():
            for batch_idx, batch in enumerate(test_loader):
                # Handle different batch formats
                if isinstance(batch, (list, tuple)):
                    x = batch[0]
                else:
                    x = batch
                
                x = x.to(self.device)
                
                # FP32 output
                fp32_output = self.fp32_model(x)
                
                # INT8 output
                int8_output = self.quantized_model(x)
                
                # Compute absolute difference
                error = torch.abs(fp32_output - int8_output)
                errors.extend(error.cpu().numpy().flatten().tolist())
                
                if num_batches is not None and batch_idx + 1 >= num_batches:
                    break
        
        # Compute error statistics
        import numpy as np
        errors_array = np.array(errors)
        
        error_stats = {
            'mean': float(np.mean(errors_array)),
            'std': float(np.std(errors_array)),
            'max': float(np.max(errors_array)),
            'median': float(np.median(errors_array)),
            'min': float(np.min(errors_array))
        }
        
        logger.info(f"Quantization Error - Mean: {error_stats['mean']:.6f}, "
                   f"Std: {error_stats['std']:.6f}, Max: {error_stats['max']:.6f}")
        
        return error_stats
    
    def get_quantization_metrics(self, calibration_loader: DataLoader,
                                 test_loader: DataLoader,
                                 num_calibration_batches: Optional[int] = None,
                                 num_test_batches: Optional[int] = None) -> QuantizationMetrics:
        """
        Complete quantization pipeline with full metrics collection
        
        Requirements: 9.1-9.8, 9.11
        
        Args:
            calibration_loader: DataLoader for calibration
            test_loader: DataLoader for error computation
            num_calibration_batches: Number of calibration batches
            num_test_batches: Number of test batches
            
        Returns:
            QuantizationMetrics object with all metrics
        """
        # Step 1: Quantize model
        self.quantize(calibration_loader, num_calibration_batches)
        
        # Step 2: Measure model sizes
        fp32_size_mb, int8_size_mb, size_reduction = self.measure_model_size()
        
        # Step 3: Compute quantization error
        error_stats = self.compute_quantization_error(test_loader, num_test_batches)
        
        # Step 4: Extract per-layer scales and zero-points
        per_layer_scales = {}
        per_layer_zero_points = {}
        
        for name, stats in self.calibration_stats.items():
            per_layer_scales[name] = stats['scale']
            per_layer_zero_points[name] = stats['zero_point']
        
        # Step 5: Create metrics object
        self.quantization_metrics = QuantizationMetrics(
            fp32_model_size_mb=fp32_size_mb,
            int8_model_size_mb=int8_size_mb,
            size_reduction_percentage=size_reduction,
            communication_reduction_percentage=size_reduction,  # Same as size reduction
            quantization_error_mean=error_stats['mean'],
            quantization_error_std=error_stats['std'],
            quantization_error_max=error_stats['max'],
            per_layer_scales=per_layer_scales,
            per_layer_zero_points=per_layer_zero_points
        )
        
        return self.quantization_metrics
    
    def save_quantized_model(self, path: str):
        """
        Save quantized model to disk
        
        Args:
            path: File path to save model
        """
        if self.quantized_model is None:
            raise RuntimeError("No quantized model to save. Run quantize() first.")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
        
        # Save quantized model
        torch.save(self.quantized_model.state_dict(), path)
        logger.info(f"Quantized model saved to: {path}")
    
    def load_quantized_model(self, path: str, model_architecture: nn.Module):
        """
        Load quantized model from disk
        
        Args:
            path: File path to load model
            model_architecture: Model architecture (must match saved model)
        """
        # Prepare model architecture for quantization
        model_architecture.qconfig = quant.get_default_qconfig('fbgemm')
        quant.prepare(model_architecture, inplace=True)
        quant.convert(model_architecture, inplace=True)
        
        # Load state dict
        model_architecture.load_state_dict(torch.load(path))
        model_architecture.to(self.device)
        model_architecture.eval()
        
        self.quantized_model = model_architecture
        logger.info(f"Quantized model loaded from: {path}")
        
        return self.quantized_model
    
    def _count_parameters(self, model: nn.Module) -> int:
        """Count total parameters in model"""
        return sum(p.numel() for p in model.parameters())
    
    def log_quantization_report(self):
        """
        Log comprehensive quantization report
        
        Requirements: 9.7, 9.8, 9.11
        """
        if self.quantization_metrics is None:
            logger.warning("No quantization metrics available. Run get_quantization_metrics() first.")
            return
        
        metrics = self.quantization_metrics
        
        logger.info("=" * 70)
        logger.info("QUANTIZATION REPORT")
        logger.info("=" * 70)
        logger.info(f"FP32 Model Size: {metrics.fp32_model_size_mb:.2f} MB")
        logger.info(f"INT8 Model Size: {metrics.int8_model_size_mb:.2f} MB")
        logger.info(f"Size Reduction: {metrics.size_reduction_percentage:.2f}%")
        logger.info(f"Communication Payload Reduction: {metrics.communication_reduction_percentage:.2f}%")
        logger.info("-" * 70)
        logger.info("Quantization Error Statistics:")
        logger.info(f"  Mean Error: {metrics.quantization_error_mean:.6f}")
        logger.info(f"  Std Error: {metrics.quantization_error_std:.6f}")
        logger.info(f"  Max Error: {metrics.quantization_error_max:.6f}")
        logger.info("-" * 70)
        logger.info(f"Per-Layer Quantization Parameters: {len(metrics.per_layer_scales)} layers")
        logger.info("=" * 70)
