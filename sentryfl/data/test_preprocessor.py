"""
Unit tests for Preprocessing Module

Tests coverage:
- Normalization produces zero mean and unit variance
- Windowing with various stride configurations
- Scaler round-trip (save → load → transform)
- Missing value imputation
- Train/val/test splitting
- Error handling for invalid inputs

**Validates Requirements:** 1.4, 1.5, 1.6, 1.7, 1.8, 1.10
"""

import unittest
import tempfile
import shutil
from pathlib import Path
import numpy as np

from sentryfl.data import TimeSeriesPreprocessor


class TestTimeSeriesPreprocessor(unittest.TestCase):
    """Test TimeSeriesPreprocessor class"""
    
    def setUp(self):
        """Create sample time-series data"""
        # Create deterministic data for testing
        np.random.seed(42)
        
        # 200 timesteps, 5 features
        self.data = np.random.randn(200, 5) * 10 + 50  # Mean ~50, std ~10
        self.labels = np.random.randint(0, 2, 200)
        
        # Create temporary directory for scaler persistence
        self.test_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Remove temporary directory"""
        shutil.rmtree(self.test_dir)
    
    def test_initialization_valid(self):
        """Test valid initialization"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=10,
            normalize=True
        )
        
        self.assertEqual(preprocessor.window_size, 100)
        self.assertEqual(preprocessor.stride, 10)
        self.assertTrue(preprocessor.normalize)
    
    def test_initialization_invalid_window_size(self):
        """Test error for invalid window size"""
        with self.assertRaises(ValueError) as context:
            TimeSeriesPreprocessor(window_size=0, stride=1)
        
        self.assertIn('must be positive', str(context.exception))
    
    def test_initialization_invalid_stride(self):
        """Test error for invalid stride"""
        with self.assertRaises(ValueError) as context:
            TimeSeriesPreprocessor(window_size=100, stride=0)
        
        self.assertIn('must be positive', str(context.exception))
    
    def test_initialization_stride_greater_than_window(self):
        """Test error when stride > window_size"""
        with self.assertRaises(ValueError) as context:
            TimeSeriesPreprocessor(window_size=100, stride=150)
        
        self.assertIn('cannot be greater than', str(context.exception))
    
    def test_fit_transform_normalization(self):
        """Test normalization produces zero mean and unit variance (Requirement 1.4)"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        normalized_data = preprocessor.fit_transform(self.data)
        
        # Check shape is preserved
        self.assertEqual(normalized_data.shape, self.data.shape)
        
        # Check mean is approximately zero for each feature
        means = np.mean(normalized_data, axis=0)
        np.testing.assert_allclose(means, 0.0, atol=1e-10)
        
        # Check std is approximately one for each feature
        # Note: StandardScaler uses ddof=0, so we use ddof=0 for comparison
        stds = np.std(normalized_data, axis=0, ddof=0)
        np.testing.assert_allclose(stds, 1.0, atol=1e-2)
    
    def test_fit_transform_without_normalization(self):
        """Test fit_transform without normalization"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        transformed_data = preprocessor.fit_transform(self.data)
        
        # Data should be unchanged (except potential imputation)
        np.testing.assert_array_equal(transformed_data, self.data)
    
    def test_transform_with_fitted_scaler(self):
        """Test transform with fitted scaler"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        # Fit on training data
        preprocessor.fit_transform(self.data[:150])
        
        # Transform test data
        test_data = self.data[150:]
        transformed_test = preprocessor.transform(test_data)
        
        # Check shape is preserved
        self.assertEqual(transformed_test.shape, test_data.shape)
    
    def test_transform_without_fitting(self):
        """Test error when transform is called before fitting"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        with self.assertRaises(RuntimeError) as context:
            preprocessor.transform(self.data)
        
        self.assertIn('not been fitted', str(context.exception))
    
    def test_forward_fill_imputation(self):
        """Test missing value imputation (Requirement 1.8)"""
        # Create data with missing values
        data_with_nan = self.data.copy()
        data_with_nan[10, 2] = np.nan
        data_with_nan[15, 2] = np.nan
        data_with_nan[20, 3] = np.nan
        
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        imputed_data = preprocessor.fit_transform(data_with_nan)
        
        # Check no NaN values remain
        self.assertFalse(np.isnan(imputed_data).any())
        
        # Check shape is preserved
        self.assertEqual(imputed_data.shape, data_with_nan.shape)
    
    def test_forward_fill_first_value_nan(self):
        """Test imputation when first value is NaN"""
        data_with_nan = self.data.copy()
        data_with_nan[0, 2] = np.nan
        data_with_nan[1, 2] = np.nan
        
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        imputed_data = preprocessor.fit_transform(data_with_nan)
        
        # Check no NaN values remain
        self.assertFalse(np.isnan(imputed_data).any())
    
    def test_all_nan_column_error(self):
        """Test error when column has all NaN values"""
        data_with_all_nan = self.data.copy()
        data_with_all_nan[:, 2] = np.nan
        
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        with self.assertRaises(ValueError) as context:
            preprocessor.fit_transform(data_with_all_nan)
        
        self.assertIn('all NaN', str(context.exception))
    
    def test_create_windows_overlapping(self):
        """Test sliding window generation with stride=1 (Requirement 1.6)"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        # Create simple data for easy verification
        simple_data = np.arange(100).reshape(100, 1)
        simple_labels = np.arange(100)
        
        windows, window_labels = preprocessor.create_windows(simple_data, simple_labels)
        
        # Calculate expected number of windows
        expected_n_windows = (100 - 10) // 1 + 1
        self.assertEqual(windows.shape[0], expected_n_windows)
        
        # Check window shape
        self.assertEqual(windows.shape, (expected_n_windows, 10, 1))
        
        # Check first window
        expected_first_window = np.arange(10).reshape(10, 1)
        np.testing.assert_array_equal(windows[0], expected_first_window)
        
        # Check window labels (last timestep in each window)
        self.assertEqual(window_labels[0], 9)
        self.assertEqual(window_labels[1], 10)
    
    def test_create_windows_non_overlapping(self):
        """Test sliding window generation with stride=window_size (Requirement 1.6)"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=10,
            normalize=False
        )
        
        simple_data = np.arange(100).reshape(100, 1)
        simple_labels = np.arange(100)
        
        windows, window_labels = preprocessor.create_windows(simple_data, simple_labels)
        
        # Calculate expected number of windows
        expected_n_windows = (100 - 10) // 10 + 1
        self.assertEqual(windows.shape[0], expected_n_windows)
        
        # Check window shape
        self.assertEqual(windows.shape, (expected_n_windows, 10, 1))
        
        # Check first and second windows don't overlap
        self.assertNotEqual(windows[0][-1, 0], windows[1][0, 0])
    
    def test_create_windows_without_labels(self):
        """Test windowing without labels"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=5,
            normalize=False
        )
        
        windows, window_labels = preprocessor.create_windows(self.data, labels=None)
        
        # Check windows are created
        self.assertIsNotNone(windows)
        
        # Check labels are None
        self.assertIsNone(window_labels)
    
    def test_create_windows_data_too_short(self):
        """Test error when data is shorter than window_size"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        short_data = np.random.randn(50, 5)
        
        with self.assertRaises(ValueError) as context:
            preprocessor.create_windows(short_data)
        
        self.assertIn('less than window_size', str(context.exception))
    
    def test_create_windows_data_label_mismatch(self):
        """Test error when data and labels have different lengths"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        wrong_labels = np.random.randint(0, 2, 150)  # Wrong length
        
        with self.assertRaises(ValueError) as context:
            preprocessor.create_windows(self.data, wrong_labels)
        
        self.assertIn('mismatch', str(context.exception))
    
    def test_split_data_default_ratios(self):
        """Test train/val/test split with default ratios (Requirement 1.7)"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        # Create windowed data
        windows, window_labels = preprocessor.create_windows(self.data, self.labels)
        
        # Split data
        splits = preprocessor.split_data(windows, window_labels)
        
        # Check all splits exist
        self.assertIn('train', splits)
        self.assertIn('val', splits)
        self.assertIn('test', splits)
        
        # Check splits are tuples
        self.assertEqual(len(splits['train']), 2)
        self.assertEqual(len(splits['val']), 2)
        self.assertEqual(len(splits['test']), 2)
        
        # Check total samples preserved
        total_samples = (
            splits['train'][0].shape[0] +
            splits['val'][0].shape[0] +
            splits['test'][0].shape[0]
        )
        self.assertEqual(total_samples, windows.shape[0])
    
    def test_split_data_custom_ratios(self):
        """Test split with custom ratios"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        windows, window_labels = preprocessor.create_windows(self.data, self.labels)
        
        # Split with custom ratios
        splits = preprocessor.split_data(
            windows, window_labels,
            train_ratio=0.6,
            val_ratio=0.2
        )
        
        # Check train split is approximately 60%
        train_size = splits['train'][0].shape[0]
        expected_train_size = int(windows.shape[0] * 0.6)
        self.assertAlmostEqual(train_size, expected_train_size, delta=1)
    
    def test_split_data_invalid_ratios(self):
        """Test error for invalid split ratios"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        windows, window_labels = preprocessor.create_windows(self.data, self.labels)
        
        # Test train_ratio > 1
        with self.assertRaises(ValueError):
            preprocessor.split_data(windows, window_labels, train_ratio=1.5)
        
        # Test train_ratio + val_ratio >= 1
        with self.assertRaises(ValueError):
            preprocessor.split_data(windows, window_labels, train_ratio=0.7, val_ratio=0.4)
    
    def test_split_data_too_few_samples(self):
        """Test error when too few samples for splitting"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        tiny_data = np.random.randn(2, 5)
        tiny_labels = np.array([0, 1])
        
        with self.assertRaises(ValueError) as context:
            preprocessor.split_data(tiny_data, tiny_labels)
        
        self.assertIn('Not enough samples', str(context.exception))
    
    def test_save_and_load_scaler_roundtrip(self):
        """Test scaler round-trip persistence (Requirement 1.10)"""
        # Create and fit preprocessor
        preprocessor1 = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        normalized_data1 = preprocessor1.fit_transform(self.data)
        
        # Save scaler
        scaler_path = Path(self.test_dir) / 'scaler.pkl'
        preprocessor1.save_scaler(str(scaler_path))
        
        # Check file was created
        self.assertTrue(scaler_path.exists())
        
        # Create new preprocessor and load scaler
        preprocessor2 = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        preprocessor2.load_scaler(str(scaler_path))
        
        # Transform data with loaded scaler
        normalized_data2 = preprocessor2.transform(self.data)
        
        # Check outputs are identical (within floating-point tolerance)
        np.testing.assert_allclose(normalized_data1, normalized_data2, rtol=1e-10)
    
    def test_save_scaler_without_fitting(self):
        """Test error when saving unfitted scaler"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        scaler_path = Path(self.test_dir) / 'scaler.pkl'
        
        with self.assertRaises(RuntimeError) as context:
            preprocessor.save_scaler(str(scaler_path))
        
        self.assertIn('not been fitted', str(context.exception))
    
    def test_save_scaler_without_normalization(self):
        """Test error when trying to save scaler with normalize=False"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        preprocessor.fit_transform(self.data)
        
        scaler_path = Path(self.test_dir) / 'scaler.pkl'
        
        with self.assertRaises(RuntimeError) as context:
            preprocessor.save_scaler(str(scaler_path))
        
        self.assertIn('normalize=False', str(context.exception))
    
    def test_load_scaler_nonexistent_file(self):
        """Test error when loading from nonexistent file"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=True
        )
        
        nonexistent_path = Path(self.test_dir) / 'nonexistent.pkl'
        
        with self.assertRaises(FileNotFoundError) as context:
            preprocessor.load_scaler(str(nonexistent_path))
        
        self.assertIn('not found', str(context.exception))
    
    def test_load_scaler_without_normalization(self):
        """Test error when trying to load scaler with normalize=False"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=100,
            stride=1,
            normalize=False
        )
        
        scaler_path = Path(self.test_dir) / 'scaler.pkl'
        
        with self.assertRaises(RuntimeError) as context:
            preprocessor.load_scaler(str(scaler_path))
        
        self.assertIn('normalize=False', str(context.exception))
    
    def test_get_parameters(self):
        """Test parameter retrieval"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=50,
            stride=5,
            normalize=True
        )
        
        params = preprocessor.get_parameters()
        
        self.assertEqual(params['window_size'], 50)
        self.assertEqual(params['stride'], 5)
        self.assertTrue(params['normalize'])
        self.assertFalse(params['is_fitted'])
        
        # Fit and check again
        preprocessor.fit_transform(self.data)
        params = preprocessor.get_parameters()
        self.assertTrue(params['is_fitted'])
    
    def test_empty_data_error(self):
        """Test error for empty data"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        empty_data = np.array([]).reshape(0, 5)
        
        with self.assertRaises(ValueError) as context:
            preprocessor.fit_transform(empty_data)
        
        self.assertIn('empty', str(context.exception))
    
    def test_wrong_dimension_error(self):
        """Test error for wrong data dimensions"""
        preprocessor = TimeSeriesPreprocessor(
            window_size=10,
            stride=1,
            normalize=False
        )
        
        # 1D array instead of 2D
        wrong_dim_data = np.arange(100)
        
        with self.assertRaises(ValueError) as context:
            preprocessor.fit_transform(wrong_dim_data)
        
        self.assertIn('2D array', str(context.exception))
    
    def test_integration_full_pipeline(self):
        """Test complete preprocessing pipeline"""
        # Step 1: Create preprocessor
        preprocessor = TimeSeriesPreprocessor(
            window_size=50,
            stride=10,
            normalize=True
        )
        
        # Step 2: Fit and transform training data
        train_data = self.data[:150]
        train_labels = self.labels[:150]
        
        normalized_train = preprocessor.fit_transform(train_data)
        
        # Step 3: Create windows
        train_windows, train_window_labels = preprocessor.create_windows(
            normalized_train, train_labels
        )
        
        # Step 4: Split data
        splits = preprocessor.split_data(
            train_windows, train_window_labels,
            train_ratio=0.7,
            val_ratio=0.15
        )
        
        # Step 5: Transform test data
        test_data = self.data[150:]
        normalized_test = preprocessor.transform(test_data)
        
        # Verify all steps completed successfully
        self.assertIsNotNone(splits['train'])
        self.assertIsNotNone(splits['val'])
        self.assertIsNotNone(splits['test'])
        self.assertIsNotNone(normalized_test)
        
        # Verify normalized test data has correct properties
        self.assertEqual(normalized_test.shape[0], 50)


if __name__ == '__main__':
    unittest.main()
