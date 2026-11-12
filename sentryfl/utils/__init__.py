"""
Utilities: configuration management, logging, checkpointing, and helper functions
"""

from .config import (
    ConfigurationSystem,
    ConfigurationError,
    parse_cli_overrides,
)

from .experiment_logger import (
    ExperimentLogger,
    compare_experiments,
)

from .checkpoint_manager import (
    CheckpointManager,
    CheckpointError,
)

from .exceptions import (
    SentryFLError,
    DataValidationError,
    ConfigurationValidationError,
    TrainingDivergenceError,
    StorageError,
    MemoryError,
    PrivacyBudgetExhaustedError,
    CommunicationError,
)

from .validation import (
    validate_no_nan_numpy,
    validate_no_inf_numpy,
    validate_no_nan_torch,
    validate_no_inf_torch,
    validate_data_shape,
    validate_dataset_disjointness,
    check_divergence,
    check_disk_space,
    check_gpu_memory,
    validate_configuration_before_training,
)

from .reproducibility import (
    ReproducibilityManager,
    set_global_seed,
    log_experiment_start,
)

from .manifest import (
    EVIDENCE_STATUSES,
    ExperimentManifest,
    build_manifest,
    canonical_json,
    dataset_descriptor,
    dependency_lock_descriptor,
    sha256_bytes,
    sha256_file,
    sha256_json,
)

__all__ = [
    'ConfigurationSystem',
    'ConfigurationError',
    'parse_cli_overrides',
    'ExperimentLogger',
    'compare_experiments',
    'CheckpointManager',
    'CheckpointError',
    # Exceptions
    'SentryFLError',
    'DataValidationError',
    'ConfigurationValidationError',
    'TrainingDivergenceError',
    'StorageError',
    'MemoryError',
    'PrivacyBudgetExhaustedError',
    'CommunicationError',
    # Validation functions
    'validate_no_nan_numpy',
    'validate_no_inf_numpy',
    'validate_no_nan_torch',
    'validate_no_inf_torch',
    'validate_data_shape',
    'validate_dataset_disjointness',
    'check_divergence',
    'check_disk_space',
    'check_gpu_memory',
    'validate_configuration_before_training',
    # Reproducibility
    'ReproducibilityManager',
    'set_global_seed',
    'log_experiment_start',
    # Provenance manifests
    'EVIDENCE_STATUSES',
    'ExperimentManifest',
    'build_manifest',
    'canonical_json',
    'dataset_descriptor',
    'dependency_lock_descriptor',
    'sha256_bytes',
    'sha256_file',
    'sha256_json',
]
