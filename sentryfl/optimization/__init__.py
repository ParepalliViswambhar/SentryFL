"""
SentryFL Optimization Module

This module provides model optimization techniques for edge deployment,
including INT8 quantization, model compression, and performance optimization
for training and inference.
"""

from .quantization_engine import QuantizationEngine, QuantizationMetrics
from .performance_optimizer import PerformanceOptimizer

__all__ = ['QuantizationEngine', 'QuantizationMetrics', 'PerformanceOptimizer']
