"""
Preprocessing Module for time-series data normalization and windowing.

This module provides:
- TimeSeriesPreprocessor for feature normalization and windowing
- Forward-fill imputation for missing values
- Train/validation/test data splitting
- Scaler persistence for inference

**Validates Requirements:** 1.4, 1.5, 1.6, 1.7, 1.8
"""

from typing import Dict, Tuple, Optional
import numpy as np
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path

from ..utils.validation import validate_no_nan_numpy, validate_no_inf_numpy, validate_data_shape
from ..utils.exceptions import DataValidationError


class TimeSeriesPreprocessor:
    """
    Preprocessing pipeline for time-series data
    
    Provides normalization, windowing, and data splitting functionality
    for time-series anomaly detection.
    
    **Validates Requirements:** 1.4, 1.5, 1.6, 1.7, 1.8
    """
    
    def __init__(self, window_size: int, stride: int = 1, normalize: bool = True):
        """
        Initialize time-series preprocessor
        
        Args:
            window_size: Length of sliding windows (e.g., 100 timesteps)
            stride: Stride for sliding windows (1 = overlapping windows)
            normalize: Whether to apply normalization (zero mean, unit variance)
            
        Raises:
            ValueError: If parameters are invalid
        """
        if window_size <= 0:
            raise ValueError(f"window_size must be positive, got {window_size}")
        
        if stride <= 0:
            raise ValueError(f"stride must be positive, got {stride}")
        
        if stride > window_size:
            raise ValueError(
                f"stride ({stride}) cannot be greater than window_size ({window_size})"
            )
        
        self.window_size = window_size
        self.stride = stride
        self.normalize = normalize
        self.scaler = StandardScaler() if normalize else None
        self._is_fitted = False
    
    def fit_transform(self, data: np.ndarray) -> np.ndarray:
        """
        Fit normalization parameters on training data and transform
        
        Steps:
        1. Handle missing values (forward-fill)
        2. Fit StandardScaler on training data
        3. Transform data to zero mean, unit variance
        
        Args:
            data: array[T, D] - T timesteps, D features
            
        Returns:
            normalized_data: array[T, D]
            
        Raises:
            ValueError: If data is invalid or contains all NaN values
            
        **Validates Requirements:** 1.4, 1.8
        """
        # Validate input
        if data.size == 0:
            raise DataValidationError("Input data is empty")
        
        if data.ndim != 2:
            raise DataValidationError(
                f"Expected 2D array [timesteps, features], got shape {data.shape}"
            )
        
        # Validate no NaN/Inf before preprocessing
        validate_no_nan_numpy(data, "fit_transform input data")
        validate_no_inf_numpy(data, "fit_transform input data")
        
        # Check for all-NaN columns
        if np.all(np.isnan(data), axis=0).any():
            raise ValueError(
                "Data contains columns with all NaN values. Cannot impute."
            )
        
        # Handle missing values with forward-fill
        data = self._forward_fill_imputation(data)
        
        # Apply normalization if enabled
        if self.normalize:
            # Fit scaler on training data
            data = self.scaler.fit_transform(data)
            self._is_fitted = True
        
        return data
    
    def transform(self, data: np.ndarray) -> np.ndarray:
        """
        Transform data using fitted scaler
        
        Args:
            data: array[T, D] - T timesteps, D features
            
        Returns:
            normalized_data: array[T, D]
            
        Raises:
            RuntimeError: If scaler has not been fitted
            ValueError: If data is invalid
            
        **Validates Requirement:** 1.4
        """
        # Validate input
        if data.size == 0:
            raise DataValidationError("Input data is empty")
        
        if data.ndim != 2:
            raise DataValidationError(
                f"Expected 2D array [timesteps, features], got shape {data.shape}"
            )
        
        # Validate no NaN/Inf before preprocessing
        validate_no_nan_numpy(data, "transform input data")
        validate_no_inf_numpy(data, "transform input data")
        
        # Handle missing values with forward-fill
        data = self._forward_fill_imputation(data)
        
        # Apply normalization if enabled
        if self.normalize:
            if not self._is_fitted:
                raise RuntimeError(
                    "Scaler has not been fitted. Call fit_transform() first."
                )
            data = self.scaler.transform(data)
        
        return data
    
    def _forward_fill_imputation(self, data: np.ndarray) -> np.ndarray:
        """
        Apply forward-fill imputation for missing values
        
        Forward-fill propagates the last valid observation forward.
        If first value is NaN, it is replaced with the column mean.
        
        Args:
            data: array[T, D] with potential NaN values
            
        Returns:
            imputed_data: array[T, D] with NaN values filled
            
        **Validates Requirement:** 1.8
        """
        data = data.copy()  # Avoid modifying original data
        
        # Check if there are any NaN values
        if not np.isnan(data).any():
            return data
        
        # Forward-fill for each feature column
        for col_idx in range(data.shape[1]):
            col = data[:, col_idx]
            
            # Find NaN positions
            nan_mask = np.isnan(col)
            
            if nan_mask.any():
                # Forward-fill
                # Get indices of non-NaN values
                valid_indices = np.where(~nan_mask)[0]
                
                if len(valid_indices) == 0:
                    # All values are NaN - this should be caught by validation
                    raise ValueError(
                        f"Column {col_idx} contains all NaN values"
                    )
                
                # If first value is NaN, fill with first valid value
                if nan_mask[0]:
                    first_valid_idx = valid_indices[0]
                    col[:first_valid_idx] = col[first_valid_idx]
                    nan_mask = np.isnan(col)  # Update mask
                
                # Forward-fill remaining NaNs
                if nan_mask.any():
                    # Use numpy's forward-fill approach
                    indices = np.arange(len(col))
                    valid_mask = ~nan_mask
                    col[nan_mask] = np.interp(
                        indices[nan_mask],
                        indices[valid_mask],
                        col[valid_mask],
                        left=col[valid_mask][0],
                        right=col[valid_mask][-1]
                    )
                
                data[:, col_idx] = col
        
        return data
    
    def create_windows(self, data: np.ndarray, 
                      labels: Optional[np.ndarray] = None) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Create fixed-length sliding windows
        
        Args:
            data: array[T, D] - T timesteps, D features
            labels: array[T] or None - Binary labels for each timestep
            
        Returns:
            windows: array[N, window_size, D] - N windows
            window_labels: array[N] or None - Label of last timestep in each window
            
        Raises:
            ValueError: If data is invalid or too short for windowing
            
        **Validates Requirements:** 1.5, 1.6
        """
        # Validate input
        if data.size == 0:
            raise ValueError("Input data is empty")
        
        if data.ndim != 2:
            raise ValueError(
                f"Expected 2D array [timesteps, features], got shape {data.shape}"
            )
        
        if data.shape[0] < self.window_size:
            raise ValueError(
                f"Data length ({data.shape[0]}) is less than window_size ({self.window_size})"
            )
        
        if labels is not None:
            if labels.shape[0] != data.shape[0]:
                raise ValueError(
                    f"Data and labels length mismatch: "
                    f"data={data.shape[0]}, labels={labels.shape[0]}"
                )
        
        # Calculate number of windows
        n_windows = (data.shape[0] - self.window_size) // self.stride + 1
        
        # Create windows
        windows = []
        window_labels = [] if labels is not None else None
        
        for i in range(n_windows):
            start_idx = i * self.stride
            end_idx = start_idx + self.window_size
            
            # Extract window
            window = data[start_idx:end_idx, :]
            windows.append(window)
            
            # Extract label (last timestep in window)
            if labels is not None:
                label = labels[end_idx - 1]
                window_labels.append(label)
        
        # Convert to numpy arrays
        windows = np.array(windows)
        
        if window_labels is not None:
            window_labels = np.array(window_labels)
        
        return windows, window_labels
    
    def split_data(self, data: np.ndarray, labels: np.ndarray,
                   train_ratio: float = 0.7, val_ratio: float = 0.15) -> Dict[str, Tuple[np.ndarray, np.ndarray]]:
        """
        Split into train/val/test sets
        
        Split is performed sequentially (not randomly) to preserve temporal order.
        
        Args:
            data: array[N, ...] - N samples (can be windows or raw data)
            labels: array[N] - Labels for each sample
            train_ratio: Fraction of data for training (default 0.7)
            val_ratio: Fraction of data for validation (default 0.15)
            
        Returns:
            Dictionary with keys:
            - 'train': (X_train, y_train)
            - 'val': (X_val, y_val)
            - 'test': (X_test, y_test)
            
        Raises:
            ValueError: If ratios are invalid or data is too small
            
        **Validates Requirement:** 1.7
        """
        # Validate ratios
        if train_ratio <= 0 or train_ratio >= 1:
            raise ValueError(
                f"train_ratio must be in (0, 1), got {train_ratio}"
            )
        
        if val_ratio < 0 or val_ratio >= 1:
            raise ValueError(
                f"val_ratio must be in [0, 1), got {val_ratio}"
            )
        
        test_ratio = 1.0 - train_ratio - val_ratio
        if test_ratio <= 0:
            raise ValueError(
                f"train_ratio + val_ratio must be less than 1.0, "
                f"got {train_ratio} + {val_ratio} = {train_ratio + val_ratio}"
            )
        
        # Validate input
        if data.shape[0] != labels.shape[0]:
            raise ValueError(
                f"Data and labels length mismatch: "
                f"data={data.shape[0]}, labels={labels.shape[0]}"
            )
        
        n_samples = data.shape[0]
        
        # Check minimum samples for split
        if n_samples < 3:
            raise ValueError(
                f"Not enough samples ({n_samples}) for train/val/test split. "
                f"Need at least 3 samples."
            )
        
        # Calculate split indices
        train_end = int(n_samples * train_ratio)
        val_end = int(n_samples * (train_ratio + val_ratio))
        
        # Ensure each split has at least one sample
        if train_end == 0:
            train_end = 1
        if val_end == train_end:
            val_end = train_end + 1
        if val_end >= n_samples:
            val_end = n_samples - 1
        
        # Split data
        X_train = data[:train_end]
        y_train = labels[:train_end]
        
        X_val = data[train_end:val_end]
        y_val = labels[train_end:val_end]
        
        X_test = data[val_end:]
        y_test = labels[val_end:]
        
        return {
            'train': (X_train, y_train),
            'val': (X_val, y_val),
            'test': (X_test, y_test)
        }
    
    def save_scaler(self, path: str):
        """
        Save fitted scaler for inference
        
        Args:
            path: File path to save scaler (will create parent directories)
            
        Raises:
            RuntimeError: If scaler has not been fitted
            IOError: If save fails
            
        **Validates Requirement:** 1.8
        """
        if not self.normalize:
            raise RuntimeError(
                "Cannot save scaler when normalize=False"
            )
        
        if not self._is_fitted:
            raise RuntimeError(
                "Scaler has not been fitted. Call fit_transform() first."
            )
        
        # Create parent directories if needed
        path_obj = Path(path)
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        
        # Save scaler
        try:
            joblib.dump(self.scaler, path)
        except Exception as e:
            raise IOError(f"Failed to save scaler: {e}")
    
    def load_scaler(self, path: str):
        """
        Load fitted scaler
        
        Args:
            path: File path to load scaler from
            
        Raises:
            RuntimeError: If normalize is False
            FileNotFoundError: If scaler file doesn't exist
            IOError: If load fails
            
        **Validates Requirement:** 1.8
        """
        if not self.normalize:
            raise RuntimeError(
                "Cannot load scaler when normalize=False"
            )
        
        # Check if file exists
        if not Path(path).exists():
            raise FileNotFoundError(f"Scaler file not found: {path}")
        
        # Load scaler
        try:
            self.scaler = joblib.load(path)
            self._is_fitted = True
        except Exception as e:
            raise IOError(f"Failed to load scaler: {e}")
    
    def get_parameters(self) -> Dict[str, any]:
        """
        Get preprocessor parameters
        
        Returns:
            Dictionary with preprocessor configuration
        """
        return {
            'window_size': self.window_size,
            'stride': self.stride,
            'normalize': self.normalize,
            'is_fitted': self._is_fitted
        }
