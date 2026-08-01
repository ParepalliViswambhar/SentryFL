"""
Unit Tests for Error Handling and Validation (Task 23.2)

Tests comprehensive error handling throughout the SentryFL system:
- NaN/Inf detection in input data with descriptive errors
- Shape mismatch detection  
- Configuration validation errors
- Training divergence detection
- Disk space validation
- GPU memory checks
- Dataset disjointness validation

Validates Requirements: 18.1, 18.2, 18.4, 18.6, 18.7, 18.8, 18.9, 18.10
"""

import unittest
import tempfile
import shutil
from pathlib import Path
import numpy as np
import torch

from sentryfl.utils.validation import (
    validate_no_nan_numpy,
    validate_no_inf_numpy,
    validate_no_nan_torch,
    validate_no_inf_torch,
    validate_data_shape,
    validate_dataset_disjointness,
    check_divergence,
    check_disk_space,
    check_gpu_memory,
    validate_configuration_before_training
)
from sentryfl.utils.exceptions import (
    DataValidationError,
    ConfigurationValidationError,
    TrainingDivergenceError,
    StorageError
)


class TestNaNInfDetection(unittest.TestCase):
    """
    Test NaN and Inf detection in input data with descriptive errors
    
    Validates Requirements: 18.1, 18.2
    """
    
    def test_nan_detection_in_numpy_array(self):
        """Test NaN input data raises descriptive error (Requirement 18.1)"""
        # Create data with NaN values
        data = np.array([[1.0, 2.0, 3.0],
                        [4.0, np.nan, 6.0],
                        [7.0, 8.0, 9.0]])
        
        with self.assertRaises(DataValidationError) as context:
            validate_no_nan_numpy(data, "test_data")
        
        error_msg = str(context.exception)
        # Verify descriptive error message
        self.assertIn("NaN values detected", error_msg)
        self.assertIn("test_data", error_msg)
        self.assertIn("1", error_msg)  # NaN count
        self.assertIn("Possible causes", error_msg)
        self.assertIn("Suggested fixes", error_msg)
    
    def test_inf_detection_in_numpy_array(self):
        """Test Inf input data raises descriptive error (Requirement 18.2)"""
        # Create data with Inf values
        data = np.array([[1.0, 2.0, 3.0],
                        [4.0, np.inf, 6.0],
                        [7.0, -np.inf, 9.0]])
        
        with self.assertRaises(DataValidationError) as context:
            validate_no_inf_numpy(data, "test_data")
        
        error_msg = str(context.exception)
        # Verify descriptive error message
        self.assertIn("Inf values detected", error_msg)
        self.assertIn("test_data", error_msg)
        self.assertIn("2", error_msg)  # Inf count
        self.assertIn("Positive Inf: 1", error_msg)
        self.assertIn("Negative Inf: 1", error_msg)
        self.assertIn("Possible causes", error_msg)
        self.assertIn("division by zero", error_msg.lower())
    
    def test_nan_detection_in_torch_tensor(self):
        """Test NaN detection in torch tensors (Requirement 18.1)"""
        tensor = torch.tensor([[1.0, 2.0, 3.0],
                              [4.0, float('nan'), 6.0],
                              [7.0, 8.0, 9.0]])
        
        with self.assertRaises(DataValidationError) as context:
            validate_no_nan_torch(tensor, "test_tensor")
        
        error_msg = str(context.exception)
        self.assertIn("NaN values detected", error_msg)
        self.assertIn("torch.Tensor", error_msg)
        self.assertIn("Gradient explosion", error_msg)
    
    def test_inf_detection_in_torch_tensor(self):
        """Test Inf detection in torch tensors (Requirement 18.2)"""
        tensor = torch.tensor([[1.0, 2.0, 3.0],
                              [4.0, float('inf'), 6.0],
                              [7.0, float('-inf'), 9.0]])
        
        with self.assertRaises(DataValidationError) as context:
            validate_no_inf_torch(tensor, "test_tensor")
        
        error_msg = str(context.exception)
        self.assertIn("Inf values detected", error_msg)
        self.assertIn("torch.Tensor", error_msg)
        self.assertIn("Gradient explosion", error_msg)
    
    def test_valid_numpy_array_passes(self):
        """Test that valid numpy array passes validation"""
        data = np.array([[1.0, 2.0, 3.0],
                        [4.0, 5.0, 6.0],
                        [7.0, 8.0, 9.0]])
        
        # Should not raise any exceptions
        validate_no_nan_numpy(data, "valid_data")
        validate_no_inf_numpy(data, "valid_data")
    
    def test_valid_torch_tensor_passes(self):
        """Test that valid torch tensor passes validation"""
        tensor = torch.tensor([[1.0, 2.0, 3.0],
                              [4.0, 5.0, 6.0],
                              [7.0, 8.0, 9.0]])
        
        # Should not raise any exceptions
        validate_no_nan_torch(tensor, "valid_tensor")
        validate_no_inf_torch(tensor, "valid_tensor")


class TestShapeValidation(unittest.TestCase):
    """
    Test input data shape validation
    
    Validates Requirement: 18.9
    """
    
    def test_shape_mismatch_dimension_count(self):
        """Test shape mismatch detection - wrong number of dimensions"""
        data = np.array([1.0, 2.0, 3.0])  # 1D array
        expected_shape = (None, 100, 38)  # Expecting 3D
        
        with self.assertRaises(DataValidationError) as context:
            validate_data_shape(data, expected_shape, "test_data")
        
        error_msg = str(context.exception)
        self.assertIn("Shape mismatch", error_msg)
        self.assertIn("Expected 3 dimensions", error_msg)
        self.assertIn("Got 1 dimensions", error_msg)
    
    def test_shape_mismatch_dimension_size(self):
        """Test shape mismatch detection - wrong dimension size"""
        data = np.random.randn(32, 100, 50)  # Wrong feature dimension
        expected_shape = (None, 100, 38)  # Expecting 38 features
        
        with self.assertRaises(DataValidationError) as context:
            validate_data_shape(data, expected_shape, "test_data")
        
        error_msg = str(context.exception)
        self.assertIn("Shape mismatch", error_msg)
        self.assertIn("Dimension 2: expected 38, got 50", error_msg)
    
    def test_valid_shape_with_flexible_dimensions(self):
        """Test that flexible dimensions (None) work correctly"""
        data = np.random.randn(32, 100, 38)  # Batch size can vary
        expected_shape = (None, 100, 38)  # None allows any batch size
        
        # Should not raise exception
        validate_data_shape(data, expected_shape, "test_data")
    
    def test_shape_validation_with_torch_tensor(self):
        """Test shape validation works with torch tensors"""
        tensor = torch.randn(16, 50, 20)
        expected_shape = (None, 50, 20)
        
        # Should not raise exception
        validate_data_shape(tensor, expected_shape, "test_tensor")


class TestConfigurationValidation(unittest.TestCase):
    """
    Test configuration parameter validation before training
    
    Validates Requirement: 18.8
    """
    
    def test_invalid_batch_size_raises_error(self):
        """Test invalid batch_size raises validation error"""
        config = {
            'training': {
                'batch_size': -1,  # Invalid: must be positive
                'learning_rate': 0.001,
                'local_epochs': 5
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("batch_size", error_msg)
        self.assertIn("positive integer", error_msg)
    
    def test_invalid_learning_rate_raises_error(self):
        """Test invalid learning_rate raises validation error"""
        config = {
            'training': {
                'batch_size': 32,
                'learning_rate': 0,  # Invalid: must be > 0
                'local_epochs': 5
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("learning_rate", error_msg)
        self.assertIn("positive number", error_msg)
    
    def test_invalid_epsilon_raises_error(self):
        """Test invalid privacy epsilon raises validation error"""
        config = {
            'privacy': {
                'enabled': True,
                'epsilon': -1.0,  # Invalid: must be > 0
                'delta': 1e-5
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("epsilon", error_msg)
        self.assertIn("positive number", error_msg)
    
    def test_invalid_delta_raises_error(self):
        """Test invalid privacy delta raises validation error"""
        config = {
            'privacy': {
                'enabled': True,
                'epsilon': 1.0,
                'delta': 1.5  # Invalid: must be in (0, 1)
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("delta", error_msg)
        self.assertIn("(0, 1)", error_msg)
    
    def test_missing_required_privacy_params_raises_error(self):
        """Test missing required privacy parameters raises error"""
        config = {
            'privacy': {
                'enabled': True
                # Missing epsilon and delta
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("epsilon is required", error_msg)
    
    def test_clients_per_round_exceeds_num_clients(self):
        """Test cross-parameter validation: clients_per_round > num_clients"""
        config = {
            'federated': {
                'num_clients': 5,
                'clients_per_round': 10  # Invalid: exceeds num_clients
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("clients_per_round", error_msg)
        self.assertIn("cannot exceed", error_msg)
    
    def test_train_val_ratio_sum_exceeds_one(self):
        """Test train_ratio + val_ratio < 1.0 validation"""
        config = {
            'data': {
                'train_ratio': 0.7,
                'val_ratio': 0.4  # Invalid: sum = 1.1 > 1.0
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        self.assertIn("train_ratio", error_msg)
        self.assertIn("val_ratio", error_msg)
        self.assertIn("< 1.0", error_msg)
    
    def test_valid_configuration_passes(self):
        """Test that valid configuration passes validation"""
        config = {
            'training': {
                'batch_size': 32,
                'learning_rate': 0.001,
                'local_epochs': 5,
                'num_rounds': 100
            },
            'privacy': {
                'enabled': True,
                'epsilon': 1.0,
                'delta': 1e-5,
                'max_grad_norm': 1.0
            },
            'federated': {
                'num_clients': 10,
                'clients_per_round': 5
            },
            'data': {
                'window_size': 100,
                'stride': 1,
                'train_ratio': 0.7,
                'val_ratio': 0.15
            }
        }
        
        # Should not raise exception
        validate_configuration_before_training(config)


class TestDivergenceDetection(unittest.TestCase):
    """
    Test training divergence detection
    
    Validates Requirement: 18.4
    """
    
    def test_nan_loss_raises_divergence_error(self):
        """Test that NaN loss raises divergence error"""
        with self.assertRaises(TrainingDivergenceError) as context:
            check_divergence(float('nan'), threshold=1000.0, client_id='client_0')
        
        error_msg = str(context.exception)
        self.assertIn("diverged", error_msg)
        self.assertIn("NaN", error_msg)
        self.assertIn("client_0", error_msg)
        self.assertIn("Learning rate too high", error_msg)
    
    def test_inf_loss_raises_divergence_error(self):
        """Test that Inf loss raises divergence error"""
        with self.assertRaises(TrainingDivergenceError) as context:
            check_divergence(float('inf'), threshold=1000.0, client_id='client_1')
        
        error_msg = str(context.exception)
        self.assertIn("diverged", error_msg)
        self.assertIn("Inf", error_msg)
        self.assertIn("client_1", error_msg)
        self.assertIn("severe numerical instability", error_msg)
    
    def test_loss_exceeds_threshold_raises_error(self):
        """Test that loss exceeding threshold raises divergence error"""
        with self.assertRaises(TrainingDivergenceError) as context:
            check_divergence(1500.0, threshold=1000.0, client_id='client_2')
        
        error_msg = str(context.exception)
        self.assertIn("diverged", error_msg)
        self.assertIn("exceeds threshold", error_msg)
        self.assertIn("1500", error_msg)
        self.assertIn("1000", error_msg)
        self.assertIn("Exclude this client's update", error_msg)
    
    def test_valid_loss_passes(self):
        """Test that valid loss below threshold passes"""
        # Should not raise exception
        check_divergence(10.5, threshold=1000.0, client_id='client_3')
        check_divergence(0.001, threshold=1000.0, client_id='client_4')


class TestDiskSpaceValidation(unittest.TestCase):
    """
    Test disk space validation before checkpoint saving
    
    Validates Requirement: 18.6
    """
    
    def setUp(self):
        """Create temporary directory for tests"""
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Clean up temporary directory"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_insufficient_disk_space_raises_error(self):
        """Test that insufficient disk space raises storage error"""
        # Request an impossibly large amount of space (1 PB)
        required_bytes = 1024 ** 5  # 1 petabyte
        
        with self.assertRaises(StorageError) as context:
            check_disk_space(self.temp_dir, required_bytes)
        
        error_msg = str(context.exception)
        self.assertIn("Insufficient disk space", error_msg)
        self.assertIn("Available", error_msg)
        self.assertIn("Required", error_msg)
        self.assertIn("Shortage", error_msg)
        self.assertIn("Suggested fixes", error_msg)
    
    def test_sufficient_disk_space_passes(self):
        """Test that sufficient disk space passes validation"""
        # Request small amount (1 KB)
        required_bytes = 1024
        
        # Should not raise exception
        check_disk_space(self.temp_dir, required_bytes)
    
    def test_creates_directory_if_not_exists(self):
        """Test that check_disk_space creates directory if it doesn't exist"""
        new_dir = Path(self.temp_dir) / "nested" / "path"
        
        # Directory should not exist initially
        self.assertFalse(new_dir.exists())
        
        # Check disk space (creates directory)
        check_disk_space(str(new_dir), required_bytes=1024)
        
        # Directory should now exist
        self.assertTrue(new_dir.exists())


class TestGPUMemoryCheck(unittest.TestCase):
    """
    Test GPU memory checks with CPU fallback
    
    Validates Requirement: 18.7
    """
    
    def test_cuda_not_available_returns_false(self):
        """Test that check returns False when CUDA not available"""
        is_available, message = check_gpu_memory()
        
        if not torch.cuda.is_available():
            self.assertFalse(is_available)
            self.assertIn("CUDA not available", message)
            self.assertIn("CPU", message)
    
    def test_gpu_memory_status_message(self):
        """Test that GPU memory check returns descriptive message"""
        is_available, message = check_gpu_memory()
        
        # Message should contain useful information
        self.assertIsInstance(message, str)
        self.assertGreater(len(message), 0)
        
        if torch.cuda.is_available():
            self.assertIn("GPU", message)
            self.assertIn("memory", message.lower())
    
    def test_insufficient_memory_returns_false_with_guidance(self):
        """Test insufficient GPU memory returns False with CPU fallback guidance"""
        if not torch.cuda.is_available():
            self.skipTest("CUDA not available, skipping GPU memory test")
        
        # Request impossibly large amount (1 TB)
        required_bytes = 1024 ** 4
        
        is_available, message = check_gpu_memory(required_bytes=required_bytes)
        
        if not is_available:
            # Should provide guidance
            self.assertIn("Insufficient", message)
            self.assertIn("CPU", message)
            self.assertIn("batch size", message.lower())


class TestDatasetDisjointnessValidation(unittest.TestCase):
    """
    Test train/val/test dataset disjointness validation
    
    Validates Requirement: 18.10
    """
    
    def test_overlapping_train_val_raises_error(self):
        """Test that overlapping train/val datasets raise error"""
        # Create overlapping datasets
        train_data = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
        val_data = np.array([[4, 5, 6], [10, 11, 12]])  # Overlaps with train
        test_data = np.array([[13, 14, 15], [16, 17, 18]])
        
        with self.assertRaises(DataValidationError) as context:
            validate_dataset_disjointness(train_data, val_data, test_data)
        
        error_msg = str(context.exception)
        self.assertIn("disjointness validation failed", error_msg)
        self.assertIn("Train/Val overlap", error_msg)
    
    def test_overlapping_train_test_raises_error(self):
        """Test that overlapping train/test datasets raise error"""
        train_data = np.array([[1, 2, 3], [4, 5, 6]])
        val_data = np.array([[7, 8, 9], [10, 11, 12]])
        test_data = np.array([[1, 2, 3], [13, 14, 15]])  # Overlaps with train
        
        with self.assertRaises(DataValidationError) as context:
            validate_dataset_disjointness(train_data, val_data, test_data)
        
        error_msg = str(context.exception)
        self.assertIn("disjointness validation failed", error_msg)
        self.assertIn("Train/Test overlap", error_msg)
    
    def test_overlapping_val_test_raises_error(self):
        """Test that overlapping val/test datasets raise error"""
        train_data = np.array([[1, 2, 3], [4, 5, 6]])
        val_data = np.array([[7, 8, 9], [10, 11, 12]])
        test_data = np.array([[10, 11, 12], [13, 14, 15]])  # Overlaps with val
        
        with self.assertRaises(DataValidationError) as context:
            validate_dataset_disjointness(train_data, val_data, test_data)
        
        error_msg = str(context.exception)
        self.assertIn("disjointness validation failed", error_msg)
        self.assertIn("Val/Test overlap", error_msg)
    
    def test_disjoint_datasets_pass_validation(self):
        """Test that disjoint datasets pass validation"""
        train_data = np.array([[1, 2, 3], [4, 5, 6]])
        val_data = np.array([[7, 8, 9], [10, 11, 12]])
        test_data = np.array([[13, 14, 15], [16, 17, 18]])
        
        # Should not raise exception
        validate_dataset_disjointness(train_data, val_data, test_data)
    
    def test_disjointness_with_torch_tensors(self):
        """Test disjointness validation works with torch tensors"""
        train_data = torch.tensor([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        val_data = torch.tensor([[7.0, 8.0, 9.0], [10.0, 11.0, 12.0]])
        test_data = torch.tensor([[13.0, 14.0, 15.0], [16.0, 17.0, 18.0]])
        
        # Should not raise exception
        validate_dataset_disjointness(train_data, val_data, test_data)


class TestErrorMessageQuality(unittest.TestCase):
    """
    Test that error messages are descriptive and helpful
    
    All errors should include:
    - Clear description of what went wrong
    - Possible causes
    - Suggested fixes
    """
    
    def test_nan_error_message_contains_guidance(self):
        """Test NaN error messages contain guidance"""
        data = np.array([[1.0, np.nan, 3.0]])
        
        with self.assertRaises(DataValidationError) as context:
            validate_no_nan_numpy(data, "test")
        
        error_msg = str(context.exception)
        self.assertIn("Possible causes", error_msg)
        self.assertIn("Suggested fixes", error_msg)
        # Should suggest specific actions
        self.assertIn("imputation", error_msg.lower())
    
    def test_configuration_error_lists_all_issues(self):
        """Test configuration errors list all validation failures"""
        config = {
            'training': {
                'batch_size': -1,  # Error 1
                'learning_rate': 0,  # Error 2
                'local_epochs': 0  # Error 3
            }
        }
        
        with self.assertRaises(ConfigurationValidationError) as context:
            validate_configuration_before_training(config)
        
        error_msg = str(context.exception)
        # Should list multiple errors
        self.assertIn("batch_size", error_msg)
        self.assertIn("learning_rate", error_msg)
        self.assertIn("local_epochs", error_msg)
    
    def test_divergence_error_suggests_remediation(self):
        """Test divergence errors suggest specific remediation steps"""
        with self.assertRaises(TrainingDivergenceError) as context:
            check_divergence(float('nan'), client_id='test_client')
        
        error_msg = str(context.exception)
        # Should suggest concrete actions
        self.assertIn("Reduce learning rate", error_msg)
        self.assertIn("gradient clipping", error_msg)


if __name__ == '__main__':
    unittest.main()
