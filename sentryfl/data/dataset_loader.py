"""
Dataset Module for loading and partitioning time-series datasets.

This module provides:
- Base DatasetLoader class for dataset loading interface
- SMDDatasetLoader for Server Machine Dataset (multivariate telemetry)
- NSLKDDDatasetLoader for NSL-KDD network intrusion detection
- FederatedDataPartitioner for IID and non-IID data distribution

**Validates Requirements:** 1.1, 1.2, 1.3, 1.9
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from ..utils.validation import validate_no_nan_numpy, validate_no_inf_numpy
from ..utils.exceptions import DataValidationError


class DatasetLoader(ABC):
    """Base class for dataset loading"""
    
    @abstractmethod
    def load_data(self, data_path: str) -> Dict[str, np.ndarray]:
        """
        Load raw time-series data and labels
        
        Args:
            data_path: Path to dataset directory
            
        Returns:
            Dictionary containing dataset splits and labels
        """
        pass
    
    @abstractmethod
    def get_feature_dim(self) -> int:
        """
        Return dimensionality of time-series features
        
        Returns:
            Integer representing feature dimensionality
        """
        pass


class SMDDatasetLoader(DatasetLoader):
    """
    Server Machine Dataset loader for multivariate telemetry
    
    SMD contains server telemetry time-series with anomaly labels.
    Files:
    - train.txt: Normal time-series (no labels)
    - test.txt: Test time-series
    - test_label.txt: Binary anomaly labels (0=normal, 1=anomaly)
    
    **Validates Requirement:** 1.2
    """
    
    def __init__(self, machine_id: str = 'machine-1-1'):
        """
        Initialize SMD loader
        
        Args:
            machine_id: Machine identifier (e.g., 'machine-1-1')
        """
        self.machine_id = machine_id
        self._feature_dim = None
    
    def load_data(self, data_path: str) -> Dict[str, np.ndarray]:
        """
        Load SMD dataset files
        
        Args:
            data_path: Path to dataset directory containing machine folders
            
        Returns:
            Dictionary with keys:
            - 'train': array[T1, D] - Training time-series
            - 'test': array[T2, D] - Test time-series
            - 'test_labels': array[T2] - Binary anomaly labels
            
        Raises:
            FileNotFoundError: If required files are missing
            ValueError: If data is invalid (NaN, Inf, empty)
            
        **Validates Requirements:** 1.1, 1.2
        """
        data_dir = Path(data_path) / self.machine_id
        
        # Check if directory exists
        if not data_dir.exists():
            raise FileNotFoundError(
                f"SMD machine directory not found: {data_dir}\n"
                f"Expected structure: {data_path}/{self.machine_id}/"
            )
        
        # Define file paths
        train_file = data_dir / 'train.txt'
        test_file = data_dir / 'test.txt'
        label_file = data_dir / 'test_label.txt'
        
        # Check all required files exist
        missing_files = []
        for file_path in [train_file, test_file, label_file]:
            if not file_path.exists():
                missing_files.append(str(file_path))
        
        if missing_files:
            raise FileNotFoundError(
                f"Missing required SMD files:\n" + "\n".join(missing_files)
            )
        
        # Load data files
        try:
            train_data = np.loadtxt(train_file, delimiter=',')
            test_data = np.loadtxt(test_file, delimiter=',')
            test_labels = np.loadtxt(label_file, delimiter=',')
        except Exception as e:
            raise ValueError(f"Error loading SMD files: {e}")
        
        # Validate data shapes
        if train_data.ndim == 1:
            train_data = train_data.reshape(-1, 1)
        if test_data.ndim == 1:
            test_data = test_data.reshape(-1, 1)
        if test_labels.ndim == 1:
            test_labels = test_labels.reshape(-1)
        
        # Validate data integrity using centralized validation functions
        try:
            validate_no_nan_numpy(train_data, 'SMD train data')
            validate_no_inf_numpy(train_data, 'SMD train data')
            validate_no_nan_numpy(test_data, 'SMD test data')
            validate_no_inf_numpy(test_data, 'SMD test data')
        except DataValidationError as e:
            # Convert to ValueError for API consistency
            raise ValueError(str(e))
        
        self._validate_labels(test_labels, 'test_labels')
        
        # Check feature dimensions match
        if train_data.shape[1] != test_data.shape[1]:
            raise ValueError(
                f"Feature dimension mismatch: train={train_data.shape[1]}, "
                f"test={test_data.shape[1]}"
            )
        
        # Check test data and labels have same length
        if test_data.shape[0] != test_labels.shape[0]:
            raise ValueError(
                f"Test data and labels length mismatch: "
                f"data={test_data.shape[0]}, labels={test_labels.shape[0]}"
            )
        
        # Store feature dimension
        self._feature_dim = train_data.shape[1]
        
        return {
            'train': train_data,
            'test': test_data,
            'test_labels': test_labels
        }
    
    def get_feature_dim(self) -> int:
        """
        Return dimensionality of time-series features
        
        Returns:
            Integer representing feature dimensionality
            
        Raises:
            RuntimeError: If load_data() has not been called yet
            
        **Validates Requirement:** 1.1
        """
        if self._feature_dim is None:
            raise RuntimeError(
                "Feature dimension not available. Call load_data() first."
            )
        return self._feature_dim
    
    def _validate_data(self, data: np.ndarray, name: str):
        """
        Validate data array for NaN, Inf, and empty values
        
        Args:
            data: Data array to validate
            name: Name of the data for error messages
            
        Raises:
            ValueError: If data is invalid
            
        **Validates Requirement:** 18.1, 18.2
        """
        if data.size == 0:
            raise ValueError(f"{name} data is empty")
        
        if np.isnan(data).any():
            nan_count = np.isnan(data).sum()
            raise ValueError(
                f"{name} data contains {nan_count} NaN values. "
                f"Please clean the data before loading."
            )
        
        if np.isinf(data).any():
            inf_count = np.isinf(data).sum()
            raise ValueError(
                f"{name} data contains {inf_count} Inf values. "
                f"Please clean the data before loading."
            )
    
    def _validate_labels(self, labels: np.ndarray, name: str):
        """
        Validate label array
        
        Args:
            labels: Label array to validate
            name: Name of the labels for error messages
            
        Raises:
            ValueError: If labels are invalid
        """
        if labels.size == 0:
            raise ValueError(f"{name} is empty")
        
        if np.isnan(labels).any():
            raise ValueError(f"{name} contains NaN values")
        
        if np.isinf(labels).any():
            raise ValueError(f"{name} contains Inf values")
        
        # Check labels are binary (0 or 1)
        unique_labels = np.unique(labels)
        if not np.all(np.isin(unique_labels, [0, 1])):
            raise ValueError(
                f"{name} must be binary (0 or 1). Found: {unique_labels}"
            )


class NSLKDDDatasetLoader(DatasetLoader):
    """
    NSL-KDD network intrusion detection dataset loader
    
    NSL-KDD contains network flow features with categorical attributes.
    Files:
    - KDDTrain+.txt: Training network flows
    - KDDTest+.txt: Test network flows
    
    Categorical features are converted to numerical using LabelEncoder.
    Attack types are converted to binary (normal=0, attack=1).
    
    **Validates Requirement:** 1.3
    """
    
    # Column names for NSL-KDD dataset (41 features + 1 label + 1 difficulty)
    COLUMN_NAMES = [
        'duration', 'protocol_type', 'service', 'flag', 'src_bytes', 'dst_bytes',
        'land', 'wrong_fragment', 'urgent', 'hot', 'num_failed_logins',
        'logged_in', 'num_compromised', 'root_shell', 'su_attempted',
        'num_root', 'num_file_creations', 'num_shells', 'num_access_files',
        'num_outbound_cmds', 'is_host_login', 'is_guest_login', 'count',
        'srv_count', 'serror_rate', 'srv_serror_rate', 'rerror_rate',
        'srv_rerror_rate', 'same_srv_rate', 'diff_srv_rate',
        'srv_diff_host_rate', 'dst_host_count', 'dst_host_srv_count',
        'dst_host_same_srv_rate', 'dst_host_diff_srv_rate',
        'dst_host_same_src_port_rate', 'dst_host_srv_diff_host_rate',
        'dst_host_serror_rate', 'dst_host_srv_serror_rate',
        'dst_host_rerror_rate', 'dst_host_srv_rerror_rate',
        'label', 'difficulty'
    ]
    
    # Categorical feature indices
    CATEGORICAL_FEATURES = ['protocol_type', 'service', 'flag']
    
    def __init__(self):
        """Initialize NSL-KDD loader"""
        self._feature_dim = 41  # NSL-KDD has 41 features
        self._label_encoders = {}
    
    def load_data(self, data_path: str) -> Dict[str, np.ndarray]:
        """
        Load NSL-KDD CSV files
        
        Args:
            data_path: Path to dataset directory containing KDDTrain+.txt and KDDTest+.txt
            
        Returns:
            Dictionary with keys:
            - 'train': array[N1, 41] - Training features
            - 'test': array[N2, 41] - Test features
            - 'train_labels': array[N1] - Training labels (0=normal, 1=attack)
            - 'test_labels': array[N2] - Test labels (0=normal, 1=attack)
            
        Raises:
            FileNotFoundError: If required files are missing
            ValueError: If data is invalid
            
        **Validates Requirements:** 1.1, 1.3
        """
        data_dir = Path(data_path)
        
        # Check if directory exists
        if not data_dir.exists():
            raise FileNotFoundError(f"NSL-KDD directory not found: {data_dir}")
        
        # Define file paths
        train_file = data_dir / 'KDDTrain+.txt'
        test_file = data_dir / 'KDDTest+.txt'
        
        # Check all required files exist
        missing_files = []
        for file_path in [train_file, test_file]:
            if not file_path.exists():
                missing_files.append(str(file_path))
        
        if missing_files:
            raise FileNotFoundError(
                f"Missing required NSL-KDD files:\n" + "\n".join(missing_files)
            )
        
        # Load data files
        try:
            train_df = pd.read_csv(train_file, header=None, names=self.COLUMN_NAMES)
            test_df = pd.read_csv(test_file, header=None, names=self.COLUMN_NAMES)
        except Exception as e:
            raise ValueError(f"Error loading NSL-KDD files: {e}")
        
        # Process train data
        train_features, train_labels = self._process_data(train_df, is_train=True)
        
        # Process test data
        test_features, test_labels = self._process_data(test_df, is_train=False)
        
        # Validate data integrity using centralized validation functions
        try:
            validate_no_nan_numpy(train_features, 'NSL-KDD train data')
            validate_no_inf_numpy(train_features, 'NSL-KDD train data')
            validate_no_nan_numpy(test_features, 'NSL-KDD test data')
            validate_no_inf_numpy(test_features, 'NSL-KDD test data')
        except DataValidationError as e:
            # Convert to ValueError for API consistency
            raise ValueError(str(e))
        
        self._validate_labels(train_labels, 'train_labels')
        self._validate_labels(test_labels, 'test_labels')
        
        return {
            'train': train_features,
            'test': test_features,
            'train_labels': train_labels,
            'test_labels': test_labels
        }
    
    def get_feature_dim(self) -> int:
        """
        Return dimensionality of time-series features
        
        Returns:
            Integer representing feature dimensionality (41 for NSL-KDD)
            
        **Validates Requirement:** 1.1
        """
        return self._feature_dim
    
    def _process_data(self, df: pd.DataFrame, is_train: bool) -> Tuple[np.ndarray, np.ndarray]:
        """
        Process NSL-KDD dataframe
        
        Args:
            df: Pandas DataFrame with NSL-KDD data
            is_train: Whether this is training data (fit encoders) or test data (transform only)
            
        Returns:
            Tuple of (features, labels)
        """
        # Separate features and labels
        features_df = df.drop(columns=['label', 'difficulty'])
        labels = df['label']
        
        # Convert attack types to binary (normal=0, attack=1)
        binary_labels = (labels != 'normal').astype(int).values
        
        # Encode categorical features
        for col in self.CATEGORICAL_FEATURES:
            if is_train:
                # Fit and transform for training data
                le = LabelEncoder()
                features_df[col] = le.fit_transform(features_df[col].astype(str))
                self._label_encoders[col] = le
            else:
                # Transform only for test data
                le = self._label_encoders[col]
                # Handle unseen categories
                features_df[col] = features_df[col].astype(str).apply(
                    lambda x: le.transform([x])[0] if x in le.classes_ else -1
                )
        
        # Convert to numpy array
        features = features_df.values.astype(np.float64)
        
        return features, binary_labels
    
    def _validate_data(self, data: np.ndarray, name: str):
        """
        Validate data array for NaN, Inf, and empty values
        
        Args:
            data: Data array to validate
            name: Name of the data for error messages
            
        Raises:
            ValueError: If data is invalid
            
        **Validates Requirements:** 18.1, 18.2
        """
        if data.size == 0:
            raise ValueError(f"{name} data is empty")
        
        if np.isnan(data).any():
            nan_count = np.isnan(data).sum()
            raise ValueError(
                f"{name} data contains {nan_count} NaN values. "
                f"Please clean the data before loading."
            )
        
        if np.isinf(data).any():
            inf_count = np.isinf(data).sum()
            raise ValueError(
                f"{name} data contains {inf_count} Inf values. "
                f"Please clean the data before loading."
            )
    
    def _validate_labels(self, labels: np.ndarray, name: str):
        """
        Validate label array
        
        Args:
            labels: Label array to validate
            name: Name of the labels for error messages
            
        Raises:
            ValueError: If labels are invalid
        """
        if labels.size == 0:
            raise ValueError(f"{name} is empty")
        
        if np.isnan(labels).any():
            raise ValueError(f"{name} contains NaN values")
        
        if np.isinf(labels).any():
            raise ValueError(f"{name} contains Inf values")
        
        # Check labels are binary (0 or 1)
        unique_labels = np.unique(labels)
        if not np.all(np.isin(unique_labels, [0, 1])):
            raise ValueError(
                f"{name} must be binary (0 or 1). Found: {unique_labels}"
            )


class FederatedDataPartitioner:
    """
    Partitions dataset across federated clients
    
    Supports two partitioning strategies:
    - IID: Random shuffling and equal splits
    - Non-IID: Dirichlet distribution over label space (concentration=0.5)
    
    **Validates Requirement:** 1.9
    """
    
    def __init__(self, num_clients: int, partition_strategy: str = 'iid', 
                 random_seed: Optional[int] = None):
        """
        Initialize federated data partitioner
        
        Args:
            num_clients: Number of federated clients
            partition_strategy: 'iid' or 'non_iid'
            random_seed: Random seed for reproducibility
            
        Raises:
            ValueError: If parameters are invalid
        """
        if num_clients <= 0:
            raise ValueError(f"num_clients must be positive, got {num_clients}")
        
        if partition_strategy not in ['iid', 'non_iid']:
            raise ValueError(
                f"partition_strategy must be 'iid' or 'non_iid', "
                f"got '{partition_strategy}'"
            )
        
        self.num_clients = num_clients
        self.strategy = partition_strategy
        self.random_seed = random_seed
        
        # Set random seed if provided
        if random_seed is not None:
            np.random.seed(random_seed)
    
    def partition(self, data: np.ndarray, labels: np.ndarray) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        Partition data across clients
        
        Args:
            data: Data array [N, D] where N is number of samples, D is feature dimension
            labels: Label array [N] with binary labels
            
        Returns:
            List of (client_data, client_labels) tuples, one per client
            
        Raises:
            ValueError: If data and labels have mismatched lengths or invalid shapes
            
        **Validates Requirements:** 1.9, 18.10
        """
        # Validate inputs
        if data.shape[0] != labels.shape[0]:
            raise ValueError(
                f"Data and labels length mismatch: "
                f"data={data.shape[0]}, labels={labels.shape[0]}"
            )
        
        if data.shape[0] < self.num_clients:
            raise ValueError(
                f"Not enough data samples ({data.shape[0]}) for "
                f"{self.num_clients} clients"
            )
        
        # Reset random seed for reproducibility (if seed was provided)
        if self.random_seed is not None:
            np.random.seed(self.random_seed)
        
        # Partition based on strategy
        if self.strategy == 'iid':
            return self._partition_iid(data, labels)
        else:  # non_iid
            return self._partition_non_iid(data, labels)
    
    def _partition_iid(self, data: np.ndarray, labels: np.ndarray) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        IID partitioning via random shuffling and equal splits
        
        Args:
            data: Data array [N, D]
            labels: Label array [N]
            
        Returns:
            List of (client_data, client_labels) tuples
            
        **Validates Requirement:** 1.9
        """
        n_samples = data.shape[0]
        
        # Random shuffle
        indices = np.random.permutation(n_samples)
        
        # Split into equal parts
        split_indices = np.array_split(indices, self.num_clients)
        
        # Create client shards
        client_shards = []
        for client_idx in split_indices:
            client_data = data[client_idx]
            client_labels = labels[client_idx]
            client_shards.append((client_data, client_labels))
        
        return client_shards
    
    def _partition_non_iid(self, data: np.ndarray, labels: np.ndarray, 
                          concentration: float = 0.5) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        Non-IID partitioning using Dirichlet distribution
        
        Args:
            data: Data array [N, D]
            labels: Label array [N]
            concentration: Dirichlet concentration parameter (lower = more non-IID)
            
        Returns:
            List of (client_data, client_labels) tuples
            
        **Validates Requirement:** 1.9
        """
        n_samples = data.shape[0]
        unique_labels = np.unique(labels)
        n_classes = len(unique_labels)
        
        # Initialize client indices
        client_indices = [[] for _ in range(self.num_clients)]
        
        # For each class, use Dirichlet distribution to assign samples to clients
        for label in unique_labels:
            # Get indices for this class
            class_indices = np.where(labels == label)[0]
            n_class_samples = len(class_indices)
            
            # Sample proportions from Dirichlet distribution
            proportions = np.random.dirichlet(
                [concentration] * self.num_clients
            )
            
            # Convert proportions to sample counts
            proportions = (np.cumsum(proportions) * n_class_samples).astype(int)
            proportions = np.concatenate([[0], proportions])
            
            # Ensure last client gets all remaining samples (fix rounding errors)
            proportions[-1] = n_class_samples
            
            # Shuffle class indices
            np.random.shuffle(class_indices)
            
            # Assign samples to clients
            for client_id in range(self.num_clients):
                start_idx = proportions[client_id]
                end_idx = proportions[client_id + 1]
                client_indices[client_id].extend(
                    class_indices[start_idx:end_idx].tolist()
                )
        
        # Create client shards
        client_shards = []
        for client_idx_list in client_indices:
            if len(client_idx_list) > 0:
                client_idx_array = np.array(client_idx_list)
                client_data = data[client_idx_array]
                client_labels = labels[client_idx_array]
                client_shards.append((client_data, client_labels))
            else:
                # Empty shard (can happen with extreme non-IID and many clients)
                client_shards.append((
                    np.empty((0, data.shape[1]), dtype=data.dtype),
                    np.empty((0,), dtype=labels.dtype)
                ))
        
        return client_shards
    
    def validate_partition_disjointness(self, client_shards: List[Tuple[np.ndarray, np.ndarray]]) -> bool:
        """
        Validate that client shards are disjoint (no overlapping samples)
        
        Args:
            client_shards: List of (client_data, client_labels) tuples
            
        Returns:
            True if all shards are disjoint, False otherwise
            
        **Validates Requirement:** 18.10
        """
        # Note: This is a heuristic check based on data checksums
        # In practice, we track indices during partitioning to ensure disjointness
        
        all_checksums = []
        for client_data, client_labels in client_shards:
            if client_data.shape[0] > 0:
                # Compute checksum for each sample
                checksums = [hash(sample.tobytes()) for sample in client_data]
                all_checksums.extend(checksums)
        
        # Check for duplicates
        return len(all_checksums) == len(set(all_checksums))
