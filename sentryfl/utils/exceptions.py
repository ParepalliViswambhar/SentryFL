"""
Custom Exception Classes for SentryFL Error Handling

This module defines custom exception classes for descriptive error reporting
throughout the SentryFL system. Each exception provides clear, actionable
error messages to help users diagnose issues quickly.

Validates Requirements: 18.1, 18.2, 18.4, 18.6, 18.7, 18.8, 18.9, 18.10
"""


class SentryFLError(Exception):
    """Base exception class for all SentryFL errors"""
    pass


class DataValidationError(SentryFLError):
    """
    Raised when input data validation fails
    
    Used for:
    - NaN/Inf detection in data (Requirements 18.1, 18.2)
    - Shape mismatch detection (Requirement 18.9)
    - Dataset disjointness validation failures (Requirement 18.10)
    """
    pass


class ConfigurationValidationError(SentryFLError):
    """
    Raised when configuration validation fails
    
    Used for:
    - Invalid hyperparameter values (Requirement 18.8)
    - Out-of-range parameters
    - Missing required configuration values
    """
    pass


class TrainingDivergenceError(SentryFLError):
    """
    Raised when client training diverges
    
    Used for:
    - Loss exceeding divergence threshold (Requirement 18.4)
    - Gradient explosion detection
    - Model instability warnings
    """
    pass


class StorageError(SentryFLError):
    """
    Raised when storage operations fail
    
    Used for:
    - Insufficient disk space for checkpoints (Requirement 18.6)
    - Failed checkpoint saves
    - Storage I/O errors
    """
    pass


class MemoryError(SentryFLError):
    """
    Raised when GPU memory is insufficient
    
    Used for:
    - GPU memory allocation failures (Requirement 18.7)
    - Out-of-memory errors during training
    - Memory constraint warnings
    """
    pass


class PrivacyBudgetExhaustedError(SentryFLError):
    """
    Raised when privacy budget is exhausted
    
    Used for:
    - Differential privacy budget depletion (Requirement 18.3)
    - Epsilon/delta threshold exceeded
    - Privacy accounting warnings
    """
    pass


class CommunicationError(SentryFLError):
    """
    Raised when communication operations fail
    
    Used for:
    - Network connection failures (Requirement 18.5)
    - Timeout errors
    - Failed parameter transmission
    """
    pass

