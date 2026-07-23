"""
SentryFL Optimization Module

This module provides model optimization techniques for edge deployment,
including INT8 quantization and model compression.
"""

from .quantization_engine import QuantizationEngine, QuantizationMetrics

__all__ = ['QuantizationEngine', 'QuantizationMetrics']
