"""
Unit tests for Dataset Module

Tests coverage:
- SMD loader on sample data files
- NSL-KDD loader with categorical feature conversion
- IID and non-IID partitioning produces correct shard counts
- Partition disjointness validation
- Error handling for invalid data

**Validates Requirements:** 1.1, 1.2, 1.3, 1.9, 18.1, 18.2
"""

import unittest
import tempfile
import shutil
from pathlib import Path
import numpy as np
import pandas as pd

from sentryfl.data import (
    SMDDatasetLoader,
    NSLKDDDatasetLoader,
    FederatedDataPartitioner
)


class TestSMDDatasetLoader(unittest.TestCase):
    """Test SMD dataset loader"""
    
    def setUp(self):
        """Create temporary directory with sample SMD data"""
        self.test_dir = tempfile.mkdtemp()
        self.machine_id = 'machine-1-1'
        self.machine_dir = Path(self.test_dir) / self.machine_id
        self.machine_dir.mkdir(parents=True)
        
        # Create sample data files
        # Train: 100 timesteps, 5 features
        self.train_data = np.random.randn(100, 5)
        np.savetxt(self.machine_dir / 'train.txt', self.train_data, delimiter=',')
        
        # Test: 50 timesteps, 5 features
        self.test_data = np.random.randn(50, 5)
        np.savetxt(self.machine_dir / 'test.txt', self.test_data, delimiter=',')
        
        # Test labels: 50 binary labels
        self.test_labels = np.random.randint(0, 2, 50)
        np.savetxt(self.machine_dir / 'test_label.txt', self.test_labels, delimiter=',')
    
    def tearDown(self):
        """Remove temporary directory"""
        shutil.rmtree(self.test_dir)
    
    def test_load_data_success(self):
        """Test successful data loading"""
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        data = loader.load_data(self.test_dir)
        
        # Check all keys present
        self.assertIn('train', data)
        self.assertIn('test', data)
        self.assertIn('test_labels', data)
        
        # Check shapes
        self.assertEqual(data['train'].shape, (100, 5))
        self.assertEqual(data['test'].shape, (50, 5))
        self.assertEqual(data['test_labels'].shape, (50,))
        
        # Check feature dimension
        self.assertEqual(loader.get_feature_dim(), 5)
    
    def test_load_data_missing_directory(self):
        """Test error when machine directory doesn't exist"""
        loader = SMDDatasetLoader(machine_id='nonexistent-machine')
        
        with self.assertRaises(FileNotFoundError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('not found', str(context.exception))
    
    def test_load_data_missing_files(self):
        """Test error when required files are missing"""
        # Remove test file
        (self.machine_dir / 'test.txt').unlink()
        
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        
        with self.assertRaises(FileNotFoundError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('Missing required', str(context.exception))
    
    def test_load_data_with_nan(self):
        """Test error handling for NaN values (Requirement 18.1)"""
        # Create data with NaN
        bad_data = np.random.randn(50, 5)
        bad_data[10, 2] = np.nan
        np.savetxt(self.machine_dir / 'test.txt', bad_data, delimiter=',')
        
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        
        with self.assertRaises(ValueError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('NaN', str(context.exception))
    
    def test_load_data_with_inf(self):
        """Test error handling for Inf values (Requirement 18.2)"""
        # Create data with Inf
        bad_data = np.random.randn(50, 5)
        bad_data[10, 2] = np.inf
        np.savetxt(self.machine_dir / 'test.txt', bad_data, delimiter=',')
        
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        
        with self.assertRaises(ValueError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('Inf', str(context.exception))
    
    def test_feature_dim_before_load(self):
        """Test error when getting feature dim before loading"""
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        
        with self.assertRaises(RuntimeError) as context:
            loader.get_feature_dim()
        
        self.assertIn('Call load_data() first', str(context.exception))
    
    def test_dimension_mismatch(self):
        """Test error when train and test have different dimensions"""
        # Create test data with different dimensions
        bad_test_data = np.random.randn(50, 8)  # 8 features instead of 5
        np.savetxt(self.machine_dir / 'test.txt', bad_test_data, delimiter=',')
        
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        
        with self.assertRaises(ValueError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('dimension mismatch', str(context.exception))
    
    def test_label_length_mismatch(self):
        """Test error when test data and labels have different lengths"""
        # Create labels with wrong length
        bad_labels = np.random.randint(0, 2, 30)  # 30 instead of 50
        np.savetxt(self.machine_dir / 'test_label.txt', bad_labels, delimiter=',')
        
        loader = SMDDatasetLoader(machine_id=self.machine_id)
        
        with self.assertRaises(ValueError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('length mismatch', str(context.exception))


class TestNSLKDDDatasetLoader(unittest.TestCase):
    """Test NSL-KDD dataset loader"""
    
    def setUp(self):
        """Create temporary directory with sample NSL-KDD data"""
        self.test_dir = tempfile.mkdtemp()
        
        # Create sample train data
        train_samples = [
            '0,tcp,http,SF,215,45076,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0.00,0.00,0.00,0.00,1.00,0.00,0.00,0,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,normal,21',
            '0,udp,private,SF,105,146,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0.00,0.00,0.00,0.00,1.00,0.00,0.00,1,1,1.00,0.00,1.00,0.00,0.00,0.00,0.00,0.00,normal,21',
            '0,tcp,http,SF,233,1337,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,3,3,0.00,0.00,0.00,0.00,1.00,0.00,0.00,2,2,1.00,0.00,0.50,0.00,0.00,0.00,0.00,0.00,neptune,21',
            '0,tcp,http,SF,233,1337,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,4,4,0.00,0.00,0.00,0.00,1.00,0.00,0.00,3,3,1.00,0.00,0.33,0.00,0.00,0.00,0.00,0.00,smurf,21'
        ]
        
        # Create sample test data
        test_samples = [
            '0,tcp,http,SF,215,45076,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,5,5,0.00,0.00,0.00,0.00,1.00,0.00,0.00,4,4,1.00,0.00,0.25,0.00,0.00,0.00,0.00,0.00,normal,21',
            '0,tcp,http,SF,233,1337,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,6,6,0.00,0.00,0.00,0.00,1.00,0.00,0.00,5,5,1.00,0.00,0.20,0.00,0.00,0.00,0.00,0.00,portsweep,21'
        ]
        
        # Write files
        train_file = Path(self.test_dir) / 'KDDTrain+.txt'
        test_file = Path(self.test_dir) / 'KDDTest+.txt'
        
        with open(train_file, 'w') as f:
            f.write('\n'.join(train_samples))
        
        with open(test_file, 'w') as f:
            f.write('\n'.join(test_samples))
    
    def tearDown(self):
        """Remove temporary directory"""
        shutil.rmtree(self.test_dir)
    
    def test_load_data_success(self):
        """Test successful data loading with categorical encoding"""
        loader = NSLKDDDatasetLoader()
        data = loader.load_data(self.test_dir)
        
        # Check all keys present
        self.assertIn('train', data)
        self.assertIn('test', data)
        self.assertIn('train_labels', data)
        self.assertIn('test_labels', data)
        
        # Check shapes
        self.assertEqual(data['train'].shape, (4, 41))
        self.assertEqual(data['test'].shape, (2, 41))
        self.assertEqual(data['train_labels'].shape, (4,))
        self.assertEqual(data['test_labels'].shape, (2,))
        
        # Check feature dimension
        self.assertEqual(loader.get_feature_dim(), 41)
    
    def test_categorical_encoding(self):
        """Test that categorical features are encoded numerically"""
        loader = NSLKDDDatasetLoader()
        data = loader.load_data(self.test_dir)
        
        # All features should be numeric (float)
        self.assertEqual(data['train'].dtype, np.float64)
        self.assertEqual(data['test'].dtype, np.float64)
    
    def test_binary_labels(self):
        """Test that attack types are converted to binary"""
        loader = NSLKDDDatasetLoader()
        data = loader.load_data(self.test_dir)
        
        # Train: 2 normal (0), 2 attacks (1)
        expected_train_labels = np.array([0, 0, 1, 1])
        np.testing.assert_array_equal(data['train_labels'], expected_train_labels)
        
        # Test: 1 normal (0), 1 attack (1)
        expected_test_labels = np.array([0, 1])
        np.testing.assert_array_equal(data['test_labels'], expected_test_labels)
    
    def test_load_data_missing_files(self):
        """Test error when required files are missing"""
        # Remove train file
        (Path(self.test_dir) / 'KDDTrain+.txt').unlink()
        
        loader = NSLKDDDatasetLoader()
        
        with self.assertRaises(FileNotFoundError) as context:
            loader.load_data(self.test_dir)
        
        self.assertIn('Missing required', str(context.exception))


class TestFederatedDataPartitioner(unittest.TestCase):
    """Test federated data partitioner"""
    
    def setUp(self):
        """Create sample data for partitioning"""
        # Create dataset with 100 samples, 10 features
        self.data = np.random.randn(100, 10)
        self.labels = np.random.randint(0, 2, 100)
        self.num_clients = 5
    
    def test_iid_partition_shard_count(self):
        """Test IID partitioning produces correct number of shards"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid',
            random_seed=42
        )
        
        shards = partitioner.partition(self.data, self.labels)
        
        # Check correct number of shards
        self.assertEqual(len(shards), self.num_clients)
    
    def test_iid_partition_sizes(self):
        """Test IID partitioning produces roughly equal shard sizes"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid',
            random_seed=42
        )
        
        shards = partitioner.partition(self.data, self.labels)
        
        # Check shard sizes are roughly equal
        shard_sizes = [shard[0].shape[0] for shard in shards]
        expected_size = 100 // self.num_clients
        
        for size in shard_sizes:
            self.assertLessEqual(abs(size - expected_size), 1)
    
    def test_iid_partition_total_samples(self):
        """Test IID partitioning preserves total number of samples"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid',
            random_seed=42
        )
        
        shards = partitioner.partition(self.data, self.labels)
        
        # Count total samples across all shards
        total_samples = sum(shard[0].shape[0] for shard in shards)
        self.assertEqual(total_samples, 100)
    
    def test_non_iid_partition_shard_count(self):
        """Test non-IID partitioning produces correct number of shards"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='non_iid',
            random_seed=42
        )
        
        shards = partitioner.partition(self.data, self.labels)
        
        # Check correct number of shards
        self.assertEqual(len(shards), self.num_clients)
    
    def test_non_iid_partition_total_samples(self):
        """Test non-IID partitioning preserves total number of samples"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='non_iid',
            random_seed=42
        )
        
        shards = partitioner.partition(self.data, self.labels)
        
        # Count total samples across all shards
        total_samples = sum(shard[0].shape[0] for shard in shards)
        self.assertEqual(total_samples, 100)
    
    def test_partition_disjointness(self):
        """Test that partitions are disjoint (Requirement 18.10)"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid',
            random_seed=42
        )
        
        shards = partitioner.partition(self.data, self.labels)
        
        # Validate disjointness
        is_disjoint = partitioner.validate_partition_disjointness(shards)
        self.assertTrue(is_disjoint)
    
    def test_invalid_num_clients(self):
        """Test error for invalid number of clients"""
        with self.assertRaises(ValueError) as context:
            FederatedDataPartitioner(num_clients=0, partition_strategy='iid')
        
        self.assertIn('must be positive', str(context.exception))
    
    def test_invalid_strategy(self):
        """Test error for invalid partition strategy"""
        with self.assertRaises(ValueError) as context:
            FederatedDataPartitioner(num_clients=5, partition_strategy='invalid')
        
        self.assertIn('must be', str(context.exception))
    
    def test_data_label_mismatch(self):
        """Test error for data and label length mismatch"""
        partitioner = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid'
        )
        
        bad_labels = np.random.randint(0, 2, 50)  # Wrong length
        
        with self.assertRaises(ValueError) as context:
            partitioner.partition(self.data, bad_labels)
        
        self.assertIn('mismatch', str(context.exception))
    
    def test_insufficient_samples(self):
        """Test error when not enough samples for clients"""
        small_data = np.random.randn(3, 10)
        small_labels = np.random.randint(0, 2, 3)
        
        partitioner = FederatedDataPartitioner(
            num_clients=5,
            partition_strategy='iid'
        )
        
        with self.assertRaises(ValueError) as context:
            partitioner.partition(small_data, small_labels)
        
        self.assertIn('Not enough data', str(context.exception))
    
    def test_reproducibility_with_seed(self):
        """Test that same seed produces same partition"""
        partitioner1 = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid',
            random_seed=42
        )
        
        partitioner2 = FederatedDataPartitioner(
            num_clients=self.num_clients,
            partition_strategy='iid',
            random_seed=42
        )
        
        shards1 = partitioner1.partition(self.data, self.labels)
        shards2 = partitioner2.partition(self.data, self.labels)
        
        # Check that partitions are identical
        for i in range(self.num_clients):
            np.testing.assert_array_equal(shards1[i][0], shards2[i][0])
            np.testing.assert_array_equal(shards1[i][1], shards2[i][1])


if __name__ == '__main__':
    unittest.main()
