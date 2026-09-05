"""
Evaluation and metrics: anomaly detection metrics, privacy metrics, communication efficiency,
ablation studies, and baseline comparisons
"""

from sentryfl.evaluation.evaluation_pipeline import EvaluationPipeline
from sentryfl.evaluation.scaling_evaluator import ScalingEvaluator
from sentryfl.evaluation.ablation_study import (
    AblationStudyRunner,
    AblationConfiguration,
    AblationResults
)
from sentryfl.evaluation.baseline_models import (
    BaselineModelRunner,
    BaselineConfiguration,
    BaselineResults
)

__all__ = [
    'EvaluationPipeline',
    'ScalingEvaluator',
    'AblationStudyRunner',
    'AblationConfiguration',
    'AblationResults',
    'BaselineModelRunner',
    'BaselineConfiguration',
    'BaselineResults',
]
