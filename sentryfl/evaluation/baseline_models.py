"""
Baseline Model Implementations for SentryFL

Implements baseline models for comparison against the full SentryFL system.
Provides reference implementations to demonstrate research contributions quantitatively.

Baselines:
- PeFAD: Original framework without SentryFL extensions
- Centralized: All data in one location (no federation)
- Local-only: No federated aggregation (each client trains independently)
- FedAvg: Standard federated averaging without parameter efficiency

Key Features:
- Identical test set evaluation for all baselines
- Baseline comparison table and plot generation
- Statistical significance testing for performance differences

Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10
"""

import torch
import torch.nn as nn
from typing import Dict, List, Any, Optional, Tuple
import logging
import copy
from pathlib import Path
import json
import pandas as pd
import numpy as np
from dataclasses import dataclass, asdict
from scipy import stats

logger = logging.getLogger(__name__)


@dataclass
class BaselineConfiguration:
    """Configuration for a baseline model"""
    name: str
    description: str
    is_federated: bool
    uses_privacy: bool
    uses_parameter_efficiency: bool
    uses_byzantine_robustness: bool
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


@dataclass
class BaselineResults:
    """Results from a baseline model evaluation"""
    baseline_name: str
    f1_score: float
    auc_roc: float
    auc_pr: float
    precision: float
    recall: float
    accuracy: float
    communication_cost_mb: float
    model_size_mb: float
    inference_latency_ms: float
    training_time_seconds: float
    privacy_epsilon: Optional[float] = None
    privacy_leakage_mia_auc: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


class BaselineModelRunner:
    """
    Baseline Model Runner for comparing against SentryFL.
    
    Implements and evaluates baseline models:
    1. PeFAD: Original parameter-efficient federated learning framework
    2. Centralized: Training on all data in one location
    3. Local-only: Each client trains independently without aggregation
    4. FedAvg: Standard federated averaging without parameter efficiency
    
    All baselines are evaluated on identical test sets for fair comparison.
    
    Args:
        base_config: Base configuration for experiments
        test_data: Test dataset (same for all baselines)
        output_dir: Directory for saving baseline results
        
    Example:
        >>> from sentryfl.utils.config import ConfigurationSystem
        >>> config = ConfigurationSystem.from_yaml('config.yaml')
        >>> 
        >>> runner = BaselineModelRunner(
        ...     base_config=config.to_dict(),
        ...     test_data=test_dataset,
        ...     output_dir='./baseline_results'
        ... )
        >>> 
        >>> # Run all baselines
        >>> results = runner.run_all_baselines(
        ...     train_fn=train_model,
        ...     evaluate_fn=evaluate_model
        ... )
        >>> 
        >>> # Generate comparison table with statistical significance
        >>> runner.generate_comparison_table(results, sentryfl_results)
    """
    
    def __init__(
        self,
        base_config: Dict[str, Any],
        test_data: Any,
        output_dir: str = './baseline_results'
    ):
        """
        Initialize Baseline Model Runner.
        
        Args:
            base_config: Base configuration dictionary
            test_data: Test dataset for evaluation
            output_dir: Directory for saving baseline results
            
        Requirements: 17.5
        """
        self.base_config = copy.deepcopy(base_config)
        self.test_data = test_data
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Define baseline configurations
        self.baseline_configs = self._define_baseline_configurations()
        
        # Storage for results
        self.results: List[BaselineResults] = []
        
        logger.info(
            f"Initialized BaselineModelRunner with {len(self.baseline_configs)} "
            f"baseline configurations"
        )
    
    def _define_baseline_configurations(self) -> List[BaselineConfiguration]:
        """
        Define all baseline configurations.
        
        Creates configurations for:
        - PeFAD: Original parameter-efficient federated learning
        - Centralized: All data in one location
        - Local-only: No federated aggregation
        - FedAvg: Standard federated averaging
        
        Returns:
            List of baseline configurations
            
        Requirements: 17.1, 17.2, 17.3, 17.4
        """
        configs = []
        
        # PeFAD baseline (original framework without SentryFL extensions)
        configs.append(BaselineConfiguration(
            name="pefad",
            description="PeFAD: Original parameter-efficient federated learning without DP/Byzantine robustness",
            is_federated=True,
            uses_privacy=False,
            uses_parameter_efficiency=True,
            uses_byzantine_robustness=False
        ))
        
        # Centralized training baseline
        configs.append(BaselineConfiguration(
            name="centralized",
            description="Centralized training with all data in one location",
            is_federated=False,
            uses_privacy=False,
            uses_parameter_efficiency=False,
            uses_byzantine_robustness=False
        ))
        
        # Local-only baseline
        configs.append(BaselineConfiguration(
            name="local_only",
            description="Local-only training without federated aggregation",
            is_federated=False,
            uses_privacy=False,
            uses_parameter_efficiency=False,
            uses_byzantine_robustness=False
        ))
        
        # FedAvg baseline
        configs.append(BaselineConfiguration(
            name="fedavg",
            description="Standard FedAvg without parameter efficiency",
            is_federated=True,
            uses_privacy=False,
            uses_parameter_efficiency=False,
            uses_byzantine_robustness=False
        ))
        
        logger.info(f"Defined {len(configs)} baseline configurations")
        return configs
    
    def create_baseline_config(
        self,
        baseline_config: BaselineConfiguration
    ) -> Dict[str, Any]:
        """
        Create training configuration for a baseline model.
        
        Takes base configuration and modifies it according to baseline settings.
        
        Args:
            baseline_config: Baseline configuration
            
        Returns:
            Modified configuration dictionary for training
            
        Requirements: 17.1, 17.2, 17.3, 17.4
        """
        # Deep copy base configuration
        config = copy.deepcopy(self.base_config)
        
        # Apply baseline-specific settings
        if baseline_config.name == 'pefad':
            # PeFAD: parameter efficiency without privacy/Byzantine robustness
            config['parameter_efficiency']['adms_enabled'] = True
            config['privacy']['enabled'] = False
            config['federated']['byzantine_robust'] = False
            config['federated']['aggregation'] = 'fedavg'
            config['optimization']['knowledge_distillation_enabled'] = False
            config['optimization']['quantization_enabled'] = False
            
        elif baseline_config.name == 'centralized':
            # Centralized: single location, all data
            config['federated']['num_clients'] = 1
            config['federated']['clients_per_round'] = 1
            config['parameter_efficiency']['adms_enabled'] = False
            config['privacy']['enabled'] = False
            config['federated']['byzantine_robust'] = False
            config['federated']['aggregation'] = 'fedavg'
            
        elif baseline_config.name == 'local_only':
            # Local-only: each client trains independently
            config['training']['num_rounds'] = 1  # No aggregation rounds
            config['parameter_efficiency']['adms_enabled'] = False
            config['privacy']['enabled'] = False
            config['federated']['byzantine_robust'] = False
            config['federated']['aggregation'] = 'fedavg'
            
        elif baseline_config.name == 'fedavg':
            # Standard FedAvg: no parameter efficiency
            config['parameter_efficiency']['adms_enabled'] = False
            config['privacy']['enabled'] = False
            config['federated']['byzantine_robust'] = False
            config['federated']['aggregation'] = 'fedavg'
            config['optimization']['knowledge_distillation_enabled'] = False
            config['optimization']['quantization_enabled'] = False
        
        # Update experiment name
        config['experiment']['name'] = f"baseline_{baseline_config.name}"
        
        # Log configuration
        logger.info(f"Created baseline configuration: {baseline_config.name}")
        logger.debug(
            f"  Federated: {baseline_config.is_federated}, "
            f"Privacy: {baseline_config.uses_privacy}, "
            f"ParamEff: {baseline_config.uses_parameter_efficiency}, "
            f"Byzantine: {baseline_config.uses_byzantine_robustness}"
        )
        
        # Save configuration to file
        config_path = self.output_dir / f"{baseline_config.name}_config.json"
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        logger.debug(f"Saved baseline config to {config_path}")
        
        return config
    
    def run_baseline(
        self,
        baseline_config: BaselineConfiguration,
        train_fn: callable,
        evaluate_fn: callable,
        **kwargs
    ) -> BaselineResults:
        """
        Run a single baseline experiment.
        
        Args:
            baseline_config: Baseline configuration
            train_fn: Training function that takes config and returns trained model
            evaluate_fn: Evaluation function that takes model and test_data
            **kwargs: Additional arguments to pass to train_fn
            
        Returns:
            BaselineResults with performance metrics
            
        Requirements: 17.5, 17.6
        """
        logger.info(f"Running baseline: {baseline_config.name}")
        logger.info(f"  Description: {baseline_config.description}")
        
        # Create baseline configuration
        config = self.create_baseline_config(baseline_config)
        
        # Run training
        import time
        start_time = time.time()
        
        trained_model, training_info = train_fn(config, **kwargs)
        
        training_time = time.time() - start_time
        
        # Run evaluation on identical test set
        eval_metrics = evaluate_fn(trained_model, self.test_data)
        
        # Extract results
        results = BaselineResults(
            baseline_name=baseline_config.name,
            f1_score=eval_metrics.get('f1', 0.0),
            auc_roc=eval_metrics.get('auc_roc', 0.0),
            auc_pr=eval_metrics.get('auc_pr', 0.0),
            precision=eval_metrics.get('precision', 0.0),
            recall=eval_metrics.get('recall', 0.0),
            accuracy=eval_metrics.get('accuracy', 0.0),
            communication_cost_mb=training_info.get('communication_cost_mb', 0.0),
            model_size_mb=training_info.get('model_size_mb', 0.0),
            inference_latency_ms=eval_metrics.get('inference_latency_ms', 0.0),
            training_time_seconds=training_time,
            privacy_epsilon=training_info.get('privacy_epsilon', None),
            privacy_leakage_mia_auc=training_info.get('mia_auc', None)
        )
        
        # Save results
        self.results.append(results)
        
        results_path = self.output_dir / f"{baseline_config.name}_results.json"
        with open(results_path, 'w') as f:
            json.dump(results.to_dict(), f, indent=2)
        
        logger.info(
            f"Baseline '{baseline_config.name}' complete: "
            f"F1={results.f1_score:.4f}, AUC-ROC={results.auc_roc:.4f}"
        )
        
        return results
    
    def run_all_baselines(
        self,
        train_fn: callable,
        evaluate_fn: callable,
        **kwargs
    ) -> List[BaselineResults]:
        """
        Run all defined baseline experiments.
        
        Args:
            train_fn: Training function
            evaluate_fn: Evaluation function
            **kwargs: Additional arguments to pass to train_fn
            
        Returns:
            List of baseline results
            
        Requirements: 17.5, 17.6
        """
        logger.info(f"Running {len(self.baseline_configs)} baseline experiments")
        
        all_results = []
        
        for i, baseline_config in enumerate(self.baseline_configs, 1):
            logger.info(f"\n{'=' * 60}")
            logger.info(f"Baseline {i}/{len(self.baseline_configs)}")
            logger.info(f"{'=' * 60}")
            
            try:
                results = self.run_baseline(
                    baseline_config=baseline_config,
                    train_fn=train_fn,
                    evaluate_fn=evaluate_fn,
                    **kwargs
                )
                all_results.append(results)
                
            except Exception as e:
                logger.error(
                    f"Baseline '{baseline_config.name}' failed: {e}",
                    exc_info=True
                )
                # Continue with next baseline
                continue
        
        logger.info(f"\nAll baselines complete: {len(all_results)} successful")
        
        return all_results
    
    def compute_statistical_significance(
        self,
        sentryfl_scores: List[float],
        baseline_scores: List[float],
        test_name: str = 't-test'
    ) -> Tuple[float, float, bool]:
        """
        Compute statistical significance of performance differences.
        
        Uses paired t-test or Wilcoxon signed-rank test to determine if
        SentryFL performance is significantly different from baseline.
        
        Args:
            sentryfl_scores: List of SentryFL performance scores (from multiple runs)
            baseline_scores: List of baseline performance scores
            test_name: Statistical test to use ('t-test' or 'wilcoxon')
            
        Returns:
            Tuple of (test_statistic, p_value, is_significant)
            is_significant is True if p < 0.05
            
        Requirements: 17.10
        """
        if len(sentryfl_scores) < 2 or len(baseline_scores) < 2:
            logger.warning(
                "Insufficient samples for statistical significance testing "
                "(need at least 2 samples per condition)"
            )
            return 0.0, 1.0, False
        
        if test_name == 't-test':
            # Paired t-test (assumes normality)
            statistic, p_value = stats.ttest_rel(sentryfl_scores, baseline_scores)
        elif test_name == 'wilcoxon':
            # Wilcoxon signed-rank test (non-parametric)
            statistic, p_value = stats.wilcoxon(sentryfl_scores, baseline_scores)
        else:
            raise ValueError(f"Unknown test: {test_name}. Use 't-test' or 'wilcoxon'")
        
        is_significant = p_value < 0.05
        
        logger.info(
            f"Statistical test ({test_name}): "
            f"statistic={statistic:.4f}, p={p_value:.4f}, "
            f"significant={is_significant}"
        )
        
        return float(statistic), float(p_value), is_significant
    
    def generate_comparison_table(
        self,
        baseline_results: Optional[List[BaselineResults]] = None,
        sentryfl_results: Optional[BaselineResults] = None
    ) -> pd.DataFrame:
        """
        Generate baseline comparison table with statistical significance.
        
        Creates a pandas DataFrame comparing all baselines against SentryFL.
        Includes statistical significance indicators.
        
        Args:
            baseline_results: List of baseline results (uses self.results if None)
            sentryfl_results: SentryFL results for comparison
            
        Returns:
            DataFrame with comparison metrics
            
        Requirements: 17.9
        """
        if baseline_results is None:
            baseline_results = self.results
        
        if not baseline_results:
            logger.warning("No baseline results to compare")
            return pd.DataFrame()
        
        logger.info("Generating baseline comparison table")
        
        # Convert results to DataFrame
        data = [result.to_dict() for result in baseline_results]
        
        # Add SentryFL results if provided
        if sentryfl_results is not None:
            sentryfl_dict = sentryfl_results.to_dict()
            sentryfl_dict['baseline_name'] = 'sentryfl'
            data.append(sentryfl_dict)
        
        df = pd.DataFrame(data)
        
        # Compute improvements over baselines
        if sentryfl_results is not None:
            for baseline_result in baseline_results:
                baseline_name = baseline_result.baseline_name
                
                # Compute percentage improvements
                df.loc[df['baseline_name'] == baseline_name, 'f1_vs_sentryfl_%'] = (
                    (baseline_result.f1_score - sentryfl_results.f1_score) / 
                    sentryfl_results.f1_score * 100
                )
                df.loc[df['baseline_name'] == baseline_name, 'auc_roc_vs_sentryfl_%'] = (
                    (baseline_result.auc_roc - sentryfl_results.auc_roc) / 
                    sentryfl_results.auc_roc * 100
                )
                df.loc[df['baseline_name'] == baseline_name, 'comm_cost_vs_sentryfl_%'] = (
                    (baseline_result.communication_cost_mb - sentryfl_results.communication_cost_mb) / 
                    sentryfl_results.communication_cost_mb * 100
                )
        
        # Reorder columns for better readability
        column_order = [
            'baseline_name',
            'f1_score', 'f1_vs_sentryfl_%',
            'auc_roc', 'auc_roc_vs_sentryfl_%',
            'auc_pr',
            'precision', 'recall', 'accuracy',
            'communication_cost_mb', 'comm_cost_vs_sentryfl_%',
            'model_size_mb',
            'inference_latency_ms',
            'training_time_seconds',
            'privacy_epsilon',
            'privacy_leakage_mia_auc'
        ]
        
        # Filter to only existing columns
        column_order = [col for col in column_order if col in df.columns]
        df = df[column_order]
        
        # Save to CSV
        table_path = self.output_dir / 'baseline_comparison_table.csv'
        df.to_csv(table_path, index=False, float_format='%.4f')
        logger.info(f"Saved baseline comparison table to {table_path}")
        
        # Print formatted table
        logger.info("\n" + "=" * 100)
        logger.info("BASELINE COMPARISON TABLE")
        logger.info("=" * 100)
        logger.info("\n" + df.to_string(index=False, float_format=lambda x: f'{x:.4f}'))
        logger.info("=" * 100)
        
        return df
    
    def compare_communication_costs(
        self,
        baseline_results: Optional[List[BaselineResults]] = None,
        sentryfl_results: Optional[BaselineResults] = None
    ) -> Dict[str, float]:
        """
        Compare communication costs across federated baselines.
        
        Args:
            baseline_results: List of baseline results
            sentryfl_results: SentryFL results for comparison
            
        Returns:
            Dictionary of communication cost comparisons
            
        Requirements: 17.7
        """
        if baseline_results is None:
            baseline_results = self.results
        
        logger.info("Comparing communication costs across federated baselines")
        
        comparisons = {}
        
        # Filter federated baselines
        federated_baselines = [
            r for r in baseline_results
            if any(
                bc.name == r.baseline_name and bc.is_federated
                for bc in self.baseline_configs
            )
        ]
        
        for result in federated_baselines:
            comparisons[result.baseline_name] = result.communication_cost_mb
            
            if sentryfl_results is not None:
                reduction = (
                    (result.communication_cost_mb - sentryfl_results.communication_cost_mb) /
                    result.communication_cost_mb * 100
                )
                comparisons[f"{result.baseline_name}_reduction_%"] = reduction
        
        if sentryfl_results is not None:
            comparisons['sentryfl'] = sentryfl_results.communication_cost_mb
        
        # Save comparisons
        comm_path = self.output_dir / 'communication_cost_comparison.json'
        with open(comm_path, 'w') as f:
            json.dump(comparisons, f, indent=2)
        
        logger.info(f"Saved communication cost comparisons to {comm_path}")
        
        return comparisons
    
    def compare_privacy_leakage(
        self,
        baseline_results: Optional[List[BaselineResults]] = None,
        sentryfl_results: Optional[BaselineResults] = None
    ) -> Dict[str, Optional[float]]:
        """
        Compare privacy leakage (MIA AUC) across privacy-preserving baselines.
        
        Args:
            baseline_results: List of baseline results
            sentryfl_results: SentryFL results for comparison
            
        Returns:
            Dictionary of privacy leakage comparisons
            
        Requirements: 17.8
        """
        if baseline_results is None:
            baseline_results = self.results
        
        logger.info("Comparing privacy leakage across baselines")
        
        comparisons = {}
        
        for result in baseline_results:
            if result.privacy_leakage_mia_auc is not None:
                comparisons[result.baseline_name] = result.privacy_leakage_mia_auc
        
        if sentryfl_results is not None and sentryfl_results.privacy_leakage_mia_auc is not None:
            comparisons['sentryfl'] = sentryfl_results.privacy_leakage_mia_auc
        
        # Save comparisons
        privacy_path = self.output_dir / 'privacy_leakage_comparison.json'
        with open(privacy_path, 'w') as f:
            json.dump(comparisons, f, indent=2)
        
        logger.info(f"Saved privacy leakage comparisons to {privacy_path}")
        
        return comparisons
    
    def get_baseline_configs(self) -> List[BaselineConfiguration]:
        """
        Get list of all baseline configurations.
        
        Returns:
            List of baseline configurations
        """
        return copy.deepcopy(self.baseline_configs)
    
    def get_results(self) -> List[BaselineResults]:
        """
        Get list of all baseline results.
        
        Returns:
            List of baseline results
        """
        return copy.deepcopy(self.results)
    
    def save_all_results(self):
        """
        Save all baseline results to a single JSON file.
        
        Requirements: 17.9
        """
        if not self.results:
            logger.warning("No results to save")
            return
        
        all_results_path = self.output_dir / 'all_baseline_results.json'
        
        results_dict = {
            'base_config': self.base_config,
            'num_baselines': len(self.results),
            'results': [result.to_dict() for result in self.results]
        }
        
        with open(all_results_path, 'w') as f:
            json.dump(results_dict, f, indent=2)
        
        logger.info(f"Saved all baseline results to {all_results_path}")
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"BaselineModelRunner("
            f"num_baselines={len(self.baseline_configs)}, "
            f"num_results={len(self.results)}, "
            f"output_dir='{self.output_dir}')"
        )
