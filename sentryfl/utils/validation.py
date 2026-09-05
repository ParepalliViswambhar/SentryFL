"""
Validation Utilities for SentryFL Error Handling

This module provides comprehensive validation functions for:
- NaN/Inf detection in data (numpy arrays and torch tensors)
- Data shape validation
- Dataset disjointness validation
- Disk space checking
- GPU memory checking
- Configuration parameter validation

All validation functions return descriptive error messages to help users
diagnose issues quickly.

Validates Requirements: 18.1, 18.2, 18.4, 18.6, 18.7, 18.8, 18.9, 18.10
"""

import os
import shutil
from typing import Tuple, List, Optional, Union, Set
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from .exceptions import (
    DataValidationError,
    ConfigurationValidationError,
    TrainingDivergenceError,
    StorageError,
    MemoryError as SentryFLMemoryError
)


def validate_no_nan_numpy(data: np.ndarray, name: str = "data") -> None:
    """
    Validate that numpy array contains no NaN values
    
    Args:
        data: Numpy array to validate
        name: Name of the data for error messages
        
    Raises:
        DataValidationError: If NaN values are detected
        
    Validates: Requirement 18.1
    """
    if not isinstance(data, np.ndarray):
        raise TypeError(f"Expected numpy array for {name}, got {type(data).__name__}")
    
    if np.isnan(data).any():
        nan_count = np.isnan(data).sum()
        nan_percentage = (nan_count / data.size) * 100
        
        # Find locations of NaN values (up to 5 examples)
        nan_indices = np.argwhere(np.isnan(data))
        example_locations = nan_indices[:5].tolist() if len(nan_indices) > 0 else []
        
        error_msg = (
            f"NaN values detected in {name}:\n"
            f"  - Total NaN values: {nan_count:,} ({nan_percentage:.2f}% of data)\n"
            f"  - Array shape: {data.shape}\n"
            f"  - Data type: {data.dtype}\n"
        )
        
        if example_locations:
            error_msg += f"  - Example NaN locations: {example_locations}\n"
        
        error_msg += (
            "\nPossible causes:\n"
            "  1. Missing values in source data\n"
            "  2. Division by zero in preprocessing\n"
            "  3. Invalid mathematical operations (e.g., log of negative number)\n"
            "\nSuggested fixes:\n"
            "  1. Clean source data before loading\n"
            "  2. Use forward-fill or other imputation methods\n"
            "  3. Check preprocessing pipeline for invalid operations"
        )
        
        raise DataValidationError(error_msg)


def validate_no_inf_numpy(data: np.ndarray, name: str = "data") -> None:
    """
    Validate that numpy array contains no Inf values
    
    Args:
        data: Numpy array to validate
        name: Name of the data for error messages
        
    Raises:
        DataValidationError: If Inf values are detected
        
    Validates: Requirement 18.2
    """
    if not isinstance(data, np.ndarray):
        raise TypeError(f"Expected numpy array for {name}, got {type(data).__name__}")
    
    if np.isinf(data).any():
        inf_count = np.isinf(data).sum()
        pos_inf_count = np.isposinf(data).sum()
        neg_inf_count = np.isneginf(data).sum()
        inf_percentage = (inf_count / data.size) * 100
        
        # Find locations of Inf values (up to 5 examples)
        inf_indices = np.argwhere(np.isinf(data))
        example_locations = inf_indices[:5].tolist() if len(inf_indices) > 0 else []
        
        error_msg = (
            f"Inf values detected in {name}:\n"
            f"  - Total Inf values: {inf_count:,} ({inf_percentage:.2f}% of data)\n"
            f"  - Positive Inf: {pos_inf_count:,}\n"
            f"  - Negative Inf: {neg_inf_count:,}\n"
            f"  - Array shape: {data.shape}\n"
            f"  - Data type: {data.dtype}\n"
        )
        
        if example_locations:
            error_msg += f"  - Example Inf locations: {example_locations}\n"
        
        error_msg += (
            "\nPossible causes:\n"
            "  1. Division by zero\n"
            "  2. Exponential overflow (e.g., exp(large_value))\n"
            "  3. Invalid scaling or normalization\n"
            "\nSuggested fixes:\n"
            "  1. Add epsilon to denominators (e.g., x / (y + 1e-8))\n"
            "  2. Clip values before exponential operations\n"
            "  3. Use log-space computations for numerical stability"
        )
        
        raise DataValidationError(error_msg)


def validate_no_nan_torch(tensor: torch.Tensor, name: str = "tensor") -> None:
    """
    Validate that torch tensor contains no NaN values
    
    Args:
        tensor: Torch tensor to validate
        name: Name of the tensor for error messages
        
    Raises:
        DataValidationError: If NaN values are detected
        
    Validates: Requirement 18.1
    """
    if not isinstance(tensor, torch.Tensor):
        raise TypeError(f"Expected torch tensor for {name}, got {type(tensor).__name__}")
    
    if torch.isnan(tensor).any():
        nan_count = torch.isnan(tensor).sum().item()
        nan_percentage = (nan_count / tensor.numel()) * 100
        
        error_msg = (
            f"NaN values detected in {name} (torch.Tensor):\n"
            f"  - Total NaN values: {nan_count:,} ({nan_percentage:.2f}% of tensor)\n"
            f"  - Tensor shape: {tensor.shape}\n"
            f"  - Tensor dtype: {tensor.dtype}\n"
            f"  - Device: {tensor.device}\n"
            "\nPossible causes:\n"
            "  1. Gradient explosion during training\n"
            "  2. Invalid loss computation\n"
            "  3. Numerical instability in model forward pass\n"
            "\nSuggested fixes:\n"
            "  1. Reduce learning rate\n"
            "  2. Apply gradient clipping\n"
            "  3. Check model architecture for numerical instability\n"
            "  4. Use mixed precision training with loss scaling"
        )
        
        raise DataValidationError(error_msg)


def validate_no_inf_torch(tensor: torch.Tensor, name: str = "tensor") -> None:
    """
    Validate that torch tensor contains no Inf values
    
    Args:
        tensor: Torch tensor to validate
        name: Name of the tensor for error messages
        
    Raises:
        DataValidationError: If Inf values are detected
        
    Validates: Requirement 18.2
    """
    if not isinstance(tensor, torch.Tensor):
        raise TypeError(f"Expected torch tensor for {name}, got {type(tensor).__name__}")
    
    if torch.isinf(tensor).any():
        inf_count = torch.isinf(tensor).sum().item()
        inf_percentage = (inf_count / tensor.numel()) * 100
        
        error_msg = (
            f"Inf values detected in {name} (torch.Tensor):\n"
            f"  - Total Inf values: {inf_count:,} ({inf_percentage:.2f}% of tensor)\n"
            f"  - Tensor shape: {tensor.shape}\n"
            f"  - Tensor dtype: {tensor.dtype}\n"
            f"  - Device: {tensor.device}\n"
            "\nPossible causes:\n"
            "  1. Gradient explosion\n"
            "  2. Division by zero in loss computation\n"
            "  3. Exponential overflow\n"
            "\nSuggested fixes:\n"
            "  1. Apply gradient clipping\n"
            "  2. Use log-space computations\n"
            "  3. Add epsilon to denominators\n"
            "  4. Reduce learning rate"
        )
        
        raise DataValidationError(error_msg)


def validate_data_shape(
    data: Union[np.ndarray, torch.Tensor],
    expected_shape: Tuple[Optional[int], ...],
    name: str = "data"
) -> None:
    """
    Validate that data matches expected shape dimensions
    
    Use None in expected_shape for dimensions that can vary (e.g., batch size).
    
    Args:
        data: Data array or tensor to validate
        expected_shape: Expected shape tuple (None for flexible dimensions)
        name: Name of the data for error messages
        
    Raises:
        DataValidationError: If shape doesn't match
        
    Example:
        validate_data_shape(data, (None, 100, 38), "time_series")
        # Validates that data has 3 dimensions with shape [*, 100, 38]
        
    Validates: Requirement 18.9
    """
    if isinstance(data, np.ndarray):
        actual_shape = data.shape
    elif isinstance(data, torch.Tensor):
        actual_shape = tuple(data.shape)
    else:
        raise TypeError(
            f"Expected numpy array or torch tensor for {name}, "
            f"got {type(data).__name__}"
        )
    
    # Check number of dimensions
    if len(actual_shape) != len(expected_shape):
        raise DataValidationError(
            f"Shape mismatch for {name}:\n"
            f"  - Expected {len(expected_shape)} dimensions: {expected_shape}\n"
            f"  - Got {len(actual_shape)} dimensions: {actual_shape}\n"
            "\nThis usually indicates:\n"
            "  1. Incorrect data preprocessing\n"
            "  2. Missing or extra dimension squeeze/unsqueeze\n"
            "  3. Batch dimension not added/removed properly"
        )
    
    # Check each dimension
    mismatches = []
    for i, (expected_dim, actual_dim) in enumerate(zip(expected_shape, actual_shape)):
        if expected_dim is not None and expected_dim != actual_dim:
            mismatches.append(
                f"    Dimension {i}: expected {expected_dim}, got {actual_dim}"
            )
    
    if mismatches:
        raise DataValidationError(
            f"Shape mismatch for {name}:\n"
            f"  - Expected shape: {expected_shape}\n"
            f"  - Actual shape: {actual_shape}\n"
            "  - Mismatches:\n" + "\n".join(mismatches) +
            "\n\nPlease check:\n"
            "  1. Data preprocessing pipeline\n"
            "  2. Window size and feature dimensions\n"
            "  3. Model input requirements"
        )


def validate_dataset_disjointness(
    train_data: Union[np.ndarray, torch.Tensor],
    val_data: Union[np.ndarray, torch.Tensor],
    test_data: Union[np.ndarray, torch.Tensor],
    tolerance: float = 1e-6
) -> None:
    """
    Validate that train/val/test datasets are disjoint (no overlapping samples)
    
    Args:
        train_data: Training dataset
        val_data: Validation dataset
        test_data: Test dataset
        tolerance: Tolerance for floating-point comparison
        
    Raises:
        DataValidationError: If datasets overlap
        
    Validates: Requirement 18.10
    """
    # Convert to numpy for comparison
    if isinstance(train_data, torch.Tensor):
        train_data = train_data.cpu().numpy()
    if isinstance(val_data, torch.Tensor):
        val_data = val_data.cpu().numpy()
    if isinstance(test_data, torch.Tensor):
        test_data = test_data.cpu().numpy()
    
    # Compute checksums for each sample to detect duplicates
    def compute_sample_hashes(data: np.ndarray) -> Set[int]:
        """Compute hash for each sample in dataset"""
        hashes = set()
        for i in range(len(data)):
            sample = data[i]
            # Flatten and round to tolerance to handle floating-point precision
            sample_rounded = np.round(sample.flatten() / tolerance) * tolerance
            sample_hash = hash(sample_rounded.tobytes())
            hashes.add(sample_hash)
        return hashes
    
    train_hashes = compute_sample_hashes(train_data)
    val_hashes = compute_sample_hashes(val_data)
    test_hashes = compute_sample_hashes(test_data)
    
    # Check for overlaps
    train_val_overlap = train_hashes & val_hashes
    train_test_overlap = train_hashes & test_hashes
    val_test_overlap = val_hashes & test_hashes
    
    if train_val_overlap or train_test_overlap or val_test_overlap:
        error_msg = "Dataset disjointness validation failed:\n"
        
        if train_val_overlap:
            overlap_pct = (len(train_val_overlap) / len(train_hashes)) * 100
            error_msg += (
                f"  - Train/Val overlap: {len(train_val_overlap)} samples "
                f"({overlap_pct:.2f}% of train set)\n"
            )
        
        if train_test_overlap:
            overlap_pct = (len(train_test_overlap) / len(train_hashes)) * 100
            error_msg += (
                f"  - Train/Test overlap: {len(train_test_overlap)} samples "
                f"({overlap_pct:.2f}% of train set)\n"
            )
        
        if val_test_overlap:
            overlap_pct = (len(val_test_overlap) / len(val_hashes)) * 100
            error_msg += (
                f"  - Val/Test overlap: {len(val_test_overlap)} samples "
                f"({overlap_pct:.2f}% of val set)\n"
            )
        
        error_msg += (
            "\nDataset splits must be disjoint to prevent:\n"
            "  1. Overly optimistic performance estimates\n"
            "  2. Data leakage from training to evaluation\n"
            "  3. Invalid experimental results\n"
            "\nPossible causes:\n"
            "  1. Incorrect data splitting logic\n"
            "  2. Data augmentation creating duplicates\n"
            "  3. Overlapping time windows in time-series data\n"
            "\nSuggested fixes:\n"
            "  1. Use proper train/val/test split functions\n"
            "  2. Ensure data is shuffled before splitting\n"
            "  3. For time-series, use non-overlapping sequential splits"
        )
        
        raise DataValidationError(error_msg)


def check_divergence(
    loss: float,
    threshold: float = 1000.0,
    client_id: str = "unknown"
) -> None:
    """
    Check if client training loss indicates divergence
    
    Args:
        loss: Current training loss value
        threshold: Loss threshold above which training is considered divergent
        client_id: Client identifier for error messages
        
    Raises:
        TrainingDivergenceError: If loss exceeds threshold
        
    Validates: Requirement 18.4
    """
    if not isinstance(loss, (int, float)):
        raise TypeError(f"Loss must be numeric, got {type(loss).__name__}")
    
    if np.isnan(loss):
        raise TrainingDivergenceError(
            f"Client {client_id} training diverged: Loss is NaN\n"
            "\nPossible causes:\n"
            "  1. Learning rate too high\n"
            "  2. Gradient explosion\n"
            "  3. Numerical instability in model\n"
            "\nSuggested fixes:\n"
            "  1. Reduce learning rate (try 10x smaller)\n"
            "  2. Apply gradient clipping (max_grad_norm=1.0)\n"
            "  3. Check model architecture for numerical issues\n"
            "  4. Ensure input data is normalized"
        )
    
    if np.isinf(loss):
        raise TrainingDivergenceError(
            f"Client {client_id} training diverged: Loss is Inf\n"
            "\nThis indicates severe numerical instability.\n"
            "\nImmediate fixes:\n"
            "  1. Reduce learning rate by 100x\n"
            "  2. Apply strong gradient clipping (max_grad_norm=0.1)\n"
            "  3. Check for division by zero in loss computation"
        )
    
    if loss > threshold:
        raise TrainingDivergenceError(
            f"Client {client_id} training diverged: Loss ({loss:.2f}) exceeds threshold ({threshold})\n"
            f"\nThis indicates the model is not learning properly.\n"
            f"\nPossible causes:\n"
            f"  1. Learning rate too high for this client's data\n"
            f"  2. Corrupted or mislabeled training data\n"
            f"  3. Adversarial or Byzantine client behavior\n"
            f"\nRecommended actions:\n"
            f"  1. Exclude this client's update from aggregation\n"
            f"  2. Reduce client learning rate\n"
            f"  3. Inspect client's local data for anomalies\n"
            f"  4. Enable Byzantine-robust aggregation (trimmed mean)"
        )


def check_disk_space(
    path: Union[str, Path],
    required_bytes: int,
    buffer_fraction: float = 0.1
) -> None:
    """
    Check if sufficient disk space is available for saving checkpoints
    
    Args:
        path: Directory path where checkpoint will be saved
        required_bytes: Required space in bytes
        buffer_fraction: Additional buffer fraction (default 10%)
        
    Raises:
        StorageError: If insufficient disk space
        
    Validates: Requirement 18.6
    """
    path = Path(path)
    
    # Create directory if it doesn't exist
    path.mkdir(parents=True, exist_ok=True)
    
    # Get disk usage statistics
    try:
        stat = shutil.disk_usage(path)
        available_bytes = stat.free
    except Exception as e:
        raise StorageError(
            f"Failed to check disk space for {path}: {e}\n"
            "Please verify:\n"
            "  1. Directory path is valid\n"
            "  2. You have read permissions\n"
            "  3. Disk is accessible"
        )
    
    # Add buffer for safety
    required_with_buffer = required_bytes * (1 + buffer_fraction)
    
    if available_bytes < required_with_buffer:
        available_gb = available_bytes / (1024 ** 3)
        required_gb = required_with_buffer / (1024 ** 3)
        
        raise StorageError(
            f"Insufficient disk space for checkpoint at {path}:\n"
            f"  - Available: {available_gb:.2f} GB\n"
            f"  - Required: {required_gb:.2f} GB (including {buffer_fraction*100:.0f}% buffer)\n"
            f"  - Shortage: {(required_with_buffer - available_bytes) / (1024**3):.2f} GB\n"
            "\nSuggested fixes:\n"
            "  1. Free up disk space by deleting old checkpoints\n"
            "  2. Change checkpoint directory to a larger disk\n"
            "  3. Reduce checkpoint frequency (increase checkpoint_interval)\n"
            "  4. Use checkpoint compression\n"
            "  5. Set max_checkpoints limit to auto-delete old checkpoints"
        )


def check_gpu_memory(
    required_bytes: Optional[int] = None,
    device_id: int = 0,
    buffer_fraction: float = 0.1
) -> Tuple[bool, str]:
    """
    Check if sufficient GPU memory is available
    
    Args:
        required_bytes: Required memory in bytes (optional)
        device_id: GPU device ID to check
        buffer_fraction: Additional buffer fraction (default 10%)
        
    Returns:
        Tuple of (is_available, message)
        - is_available: True if GPU memory is sufficient or GPU not available
        - message: Descriptive message about GPU memory status
        
    Validates: Requirement 18.7
    """
    if not torch.cuda.is_available():
        return False, "CUDA not available. Will use CPU for training."
    
    try:
        # Get GPU memory statistics
        device = torch.device(f'cuda:{device_id}')
        total_memory = torch.cuda.get_device_properties(device).total_memory
        reserved_memory = torch.cuda.memory_reserved(device)
        allocated_memory = torch.cuda.memory_allocated(device)
        free_memory = total_memory - reserved_memory
        
        if required_bytes is None:
            # No specific requirement, just report status
            free_gb = free_memory / (1024 ** 3)
            total_gb = total_memory / (1024 ** 3)
            return True, (
                f"GPU {device_id} memory available:\n"
                f"  - Total: {total_gb:.2f} GB\n"
                f"  - Free: {free_gb:.2f} GB\n"
                f"  - Allocated: {allocated_memory / (1024**3):.2f} GB"
            )
        
        # Check if required memory is available
        required_with_buffer = required_bytes * (1 + buffer_fraction)
        
        if free_memory < required_with_buffer:
            free_gb = free_memory / (1024 ** 3)
            required_gb = required_with_buffer / (1024 ** 3)
            total_gb = total_memory / (1024 ** 3)
            
            error_msg = (
                f"Insufficient GPU memory on device {device_id}:\n"
                f"  - Total: {total_gb:.2f} GB\n"
                f"  - Free: {free_gb:.2f} GB\n"
                f"  - Required: {required_gb:.2f} GB (including {buffer_fraction*100:.0f}% buffer)\n"
                f"  - Shortage: {(required_with_buffer - free_memory) / (1024**3):.2f} GB\n"
                "\nWill attempt to fall back to CPU training.\n"
                "\nTo avoid CPU fallback:\n"
                "  1. Reduce batch size\n"
                "  2. Use gradient accumulation\n"
                "  3. Enable mixed precision training (FP16)\n"
                "  4. Use a smaller model architecture\n"
                "  5. Clear GPU memory: torch.cuda.empty_cache()"
            )
            return False, error_msg
        
        return True, f"GPU {device_id} has sufficient memory ({free_memory / (1024**3):.2f} GB free)"
        
    except Exception as e:
        return False, f"Failed to check GPU memory: {e}. Will use CPU."


def validate_configuration_before_training(config: dict) -> None:
    """
    Validate configuration parameters before training starts
    
    Performs comprehensive validation of all configuration parameters
    to catch errors early before training begins.
    
    Args:
        config: Configuration dictionary
        
    Raises:
        ConfigurationValidationError: If configuration is invalid
        
    Validates: Requirement 18.8
    """
    errors = []
    
    # Training parameters
    if 'training' in config:
        training = config['training']
        
        if 'batch_size' in training:
            if not isinstance(training['batch_size'], int) or training['batch_size'] <= 0:
                errors.append(
                    f"training.batch_size must be a positive integer, "
                    f"got {training['batch_size']}"
                )
        
        if 'learning_rate' in training:
            if not isinstance(training['learning_rate'], (int, float)) or training['learning_rate'] <= 0:
                errors.append(
                    f"training.learning_rate must be a positive number, "
                    f"got {training['learning_rate']}"
                )
        
        if 'local_epochs' in training:
            if not isinstance(training['local_epochs'], int) or training['local_epochs'] <= 0:
                errors.append(
                    f"training.local_epochs must be a positive integer, "
                    f"got {training['local_epochs']}"
                )
        
        if 'num_rounds' in training:
            if not isinstance(training['num_rounds'], int) or training['num_rounds'] <= 0:
                errors.append(
                    f"training.num_rounds must be a positive integer, "
                    f"got {training['num_rounds']}"
                )
    
    # Privacy parameters
    if 'privacy' in config and config['privacy'].get('enabled', False):
        privacy = config['privacy']
        
        if 'epsilon' in privacy:
            if not isinstance(privacy['epsilon'], (int, float)) or privacy['epsilon'] <= 0:
                errors.append(
                    f"privacy.epsilon must be a positive number, "
                    f"got {privacy['epsilon']}"
                )
        else:
            errors.append("privacy.epsilon is required when privacy is enabled")
        
        if 'delta' in privacy:
            if not isinstance(privacy['delta'], (int, float)) or not (0 < privacy['delta'] < 1):
                errors.append(
                    f"privacy.delta must be in range (0, 1), "
                    f"got {privacy['delta']}"
                )
        else:
            errors.append("privacy.delta is required when privacy is enabled")
        
        if 'max_grad_norm' in privacy:
            if not isinstance(privacy['max_grad_norm'], (int, float)) or privacy['max_grad_norm'] <= 0:
                errors.append(
                    f"privacy.max_grad_norm must be a positive number, "
                    f"got {privacy['max_grad_norm']}"
                )
    
    # Federated parameters
    if 'federated' in config:
        federated = config['federated']
        
        if 'num_clients' in federated:
            if not isinstance(federated['num_clients'], int) or federated['num_clients'] <= 0:
                errors.append(
                    f"federated.num_clients must be a positive integer, "
                    f"got {federated['num_clients']}"
                )
        
        if 'clients_per_round' in federated:
            if not isinstance(federated['clients_per_round'], int) or federated['clients_per_round'] <= 0:
                errors.append(
                    f"federated.clients_per_round must be a positive integer, "
                    f"got {federated['clients_per_round']}"
                )
            
            # Cross-parameter validation
            if 'num_clients' in federated:
                if federated['clients_per_round'] > federated['num_clients']:
                    errors.append(
                        f"federated.clients_per_round ({federated['clients_per_round']}) "
                        f"cannot exceed federated.num_clients ({federated['num_clients']})"
                    )
    
    # Data parameters
    if 'data' in config:
        data = config['data']
        
        if 'window_size' in data:
            if not isinstance(data['window_size'], int) or data['window_size'] <= 0:
                errors.append(
                    f"data.window_size must be a positive integer, "
                    f"got {data['window_size']}"
                )
        
        if 'stride' in data:
            if not isinstance(data['stride'], int) or data['stride'] <= 0:
                errors.append(
                    f"data.stride must be a positive integer, "
                    f"got {data['stride']}"
                )
        
        if 'train_ratio' in data:
            if not isinstance(data['train_ratio'], (int, float)) or not (0 < data['train_ratio'] < 1):
                errors.append(
                    f"data.train_ratio must be in range (0, 1), "
                    f"got {data['train_ratio']}"
                )
        
        if 'val_ratio' in data:
            if not isinstance(data['val_ratio'], (int, float)) or not (0 <= data['val_ratio'] < 1):
                errors.append(
                    f"data.val_ratio must be in range [0, 1), "
                    f"got {data['val_ratio']}"
                )
        
        # Cross-parameter validation
        if 'train_ratio' in data and 'val_ratio' in data:
            if data['train_ratio'] + data['val_ratio'] >= 1.0:
                errors.append(
                    f"Sum of data.train_ratio ({data['train_ratio']}) and "
                    f"data.val_ratio ({data['val_ratio']}) must be < 1.0 "
                    f"to leave data for test set"
                )
    
    if errors:
        error_msg = (
            "Configuration validation failed before training:\n" +
            "\n".join(f"  {i+1}. {err}" for i, err in enumerate(errors)) +
            "\n\nPlease fix these configuration errors before starting training."
        )
        raise ConfigurationValidationError(error_msg)

