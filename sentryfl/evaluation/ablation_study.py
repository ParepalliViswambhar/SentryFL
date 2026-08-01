"""
Ablation Study Runner for SentryFL

Implements comprehensive ablation study infrastructure for measuring individual
component contributions to overall system performance. Allows selective disabling
of components (ADMS, DP, KD, Quantization, Byzantine robustness) and generates
comparison tables.

Key Features:
- Training configurations without ADMS (full model training)
- Training configurations without DP (no privacy)
- Training configurations without Knowledge Distillation
- Training configurations without Quantization
- Training configurations with FedAvg only (no Byzantine robustness)
- Ablation component configuration logging
- Ablation vs full system performance comparison
- Ablation comparison table generation

Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
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

logger = logging.getLogger(__name__)


@dataclass
class AblationConfiguration:
    """Configuration for a single ablation experiment"""
    name: str
    description: str
    adms_enabled: bool
    privacy_enabled: bool
    knowledge_distillation_enabled: bool
    quantization_enabled: bool
    byzantine_robust: bool
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


@dataclass
class AblationResults:
    """Results from an ablation experiment"""
    config_name: str
    f1_score: float
    auc_roc: float
    auc_pr: float
    precision: float
    recall: float
    communication_cost_mb: float
    model_size_mb: float
    inference_latency_ms: float
    training_time_seconds: float
    privacy_epsilon: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


class AblationStudyRunner:
    """
    Ablation Study Runner for measuring component contributions.
    
    Provides infrastructure to:
    1. Define ablation configurations (which components to disable)
    2. Run training with different component combinations
    3. Compare performance against full system
    4. Generate comparison tables and visualizations
    
    Args:
        full_system_config: Full system configuration (all components enabled)
        output_dir: Directory for saving ablation results
        
    Example:
        >>> from sentryfl.utils.config import ConfigurationSystem
        >>> config = ConfigurationSystem.from_yaml('config.yaml')
        >>> 
        >>> runner = AblationStudyRunner(
        ...     full_system_config=config.to_dict(),
        ...     output_dir='./ablation_results'
        ... )
        >>> 
        >>> # Run all ablation studies
        >>> results = runner.run_all_ablations(
        ...     train_fn=train_federated_model,
        ...     evaluate_fn=evaluate_model
        ... )
        >>> 
        >>> # Generate comparison table
        >>> runner.generate_comparison_table(results)
    """
    
    def __init__(
        self,
        full_system_config: Dict[str, Any],
        output_dir: str = './ablation_results'
    ):
        """
        Initialize Ablation Study Runner.
        
        Args:
            full_system_config: Full system configuration dictionary
            output_dir: Directory for saving ablation results
            
        Requirements: 16.6
        """
        self.full_system_config = copy.deepcopy(full_system_config)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Define ablation configurations
        self.ablation_configs = self._define_ablation_configurations()
        
        # Storage for results
        self.results: List[AblationResults] = []
        
        logger.info(
            f"Initialized AblationStudyRunner with {len(self.ablation_configs)} "
            f"ablation configurations"
        )
    
    def _define_ablation_configurations(self) -> List[AblationConfiguration]:
        """
        Define all ablation study configurations.
        
        Creates configurations for:
        - Full system (baseline)
        - Without ADMS
        - Without DP
        - Without Knowledge Distillation
        - Without Quantization
        - Without Byzantine robustness (FedAvg only)
        
        Returns:
            List of ablation configurations
            
        Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
        """
        configs = []
        
        # Full system (baseline)
        configs.append(AblationConfiguration(
            name="full_system",
            description="Full SentryFL system with all components enabled",
            adms_enabled=True,
            privacy_enabled=True,
            knowledge_distillation_enabled=True,
            quantization_enabled=True,
            byzantine_robust=True
        ))
        
        # Ablation: Without ADMS (full model training)
        configs.append(AblationConfiguration(
            name="without_adms",
            description="Training without ADMS - full model parameter updates",
            adms_enabled=False,
            privacy_enabled=True,
            knowledge_distillation_enabled=True,
            quantization_enabled=True,
            byzantine_robust=True
        ))
        
        # Ablation: Without DP (no privacy)
        configs.append(AblationConfiguration(
            name="without_dp",
            description="Training without Differential Privacy",
            adms_enabled=True,
            privacy_enabled=False,
            knowledge_distillation_enabled=True,
            quantization_enabled=True,
            byzantine_robust=True
        ))
        
        # Ablation: Without Knowledge Distillation
        configs.append(AblationConfiguration(
            name="without_kd",
            description="Training without Knowledge Distillation",
            adms_enabled=True,
            privacy_enabled=True,
            knowledge_distillation_enabled=False,
            quantization_enabled=True,
            byzantine_robust=True
        ))
        
        # Ablation: Without Quantization
        configs.append(AblationConfiguration(
            name="without_quantization",
            description="Training without INT8 Quantization",
            adms_enabled=True,
            privacy_enabled=True,
            knowledge_distillation_enabled=True,
            quantization_enabled=False,
            byzantine_robust=True
        ))
        
        # Ablation: FedAvg only (no Byzantine robustness)
        configs.append(AblationConfiguration(
            name="fedavg_only",
            description="Training with FedAvg only (no Byzantine robustness)",
            adms_enabled=True,
            privacy_enabled=True,
            knowledge_distillation_enabled=True,
            quantization_enabled=True,
            byzantine_robust=False
        ))
        
        logger.info(f"Defined {len(configs)} ablation configurations")
        return configs
    
    def create_ablation_config(
        self,
        ablation_config: AblationConfiguration
    ) -> Dict[str, Any]:
        """
        Create training configuration for an ablation study.
        
        Takes base configuration and modifies it according to ablation settings.
        
        Args:
            ablation_config: Ablation configuration specifying which components to disable
            
        Returns:
            Modified configuration dictionary for training
            
        Requirements: 16.6
        """
        # Deep copy base configuration
        config = copy.deepcopy(self.full_system_config)
        
        # Apply ablation settings
        config['parameter_efficiency']['adms_enabled'] = ablation_config.adms_enabled
        config['privacy']['enabled'] = ablation_config.privacy_enabled
        config['optimization']['knowledge_distillation_enabled'] = ablation_config.knowledge_distillation_enabled
        config['optimization']['quantization_enabled'] = ablation_config.quantization_enabled
        config['federated']['byzantine_robust'] = ablation_config.byzantine_robust
        
        # Adjust aggregation method based on Byzantine robustness
        if not ablation_config.byzantine_robust:
            config['federated']['aggregation'] = 'fedavg'
        else:
            config['federated']['aggregation'] = 'trimmed_mean'
        
        # Update experiment name
        config['experiment']['name'] = f"ablation_{ablation_config.name}"
        
        # Log configuration
        logger.info(f"Created ablation configuration: {ablation_config.name}")
        logger.debug(
            f"  ADMS: {ablation_config.adms_enabled}, "
            f"DP: {ablation_config.privacy_enabled}, "
            f"KD: {ablation_config.knowledge_distillation_enabled}, "
            f"Quant: {ablation_config.quantization_enabled}, "
            f"Byzantine: {ablation_config.byzantine_robust}"
        )
        
        # Save configuration to file
        config_path = self.output_dir / f"{ablation_config.name}_config.json"
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        logger.debug(f"Saved ablation config to {config_path}")
        
        return config
    
    def run_ablation(
        self,
        ablation_config: AblationConfiguration,
        train_fn: callable,
        evaluate_fn: callable,
        **kwargs
    ) -> AblationResults:
        """
        Run a single ablation experiment.
        
        Args:
            ablation_config: Ablation configuration
            train_fn: Training function that takes config and returns trained model
                     Signature: train_fn(config: Dict) -> trained_model
            evaluate_fn: Evaluation function that takes model and returns metrics
                        Signature: evaluate_fn(model) -> Dict[str, float]
            **kwargs: Additional arguments to pass to train_fn
            
        Returns:
            AblationResults with performance metrics
            
        Requirements: 16.6, 16.7
        """
        logger.info(f"Running ablation study: {ablation_config.name}")
        logger.info(f"  Description: {ablation_config.description}")
        
        # Create ablation configuration
        config = self.create_ablation_config(ablation_config)
        
        # Run training
        import time
        start_time = time.time()
        
        trained_model, training_info = train_fn(config, **kwargs)
        
        training_time = time.time() - start_time
        
        # Run evaluation
        eval_metrics = evaluate_fn(trained_model)
        
        # Extract results
        results = AblationResults(
            config_name=ablation_config.name,
            f1_score=eval_metrics.get('f1', 0.0),
            auc_roc=eval_metrics.get('auc_roc', 0.0),
            auc_pr=eval_metrics.get('auc_pr', 0.0),
            precision=eval_metrics.get('precision', 0.0),
            recall=eval_metrics.get('recall', 0.0),
            communication_cost_mb=training_info.get('communication_cost_mb', 0.0),
            model_size_mb=training_info.get('model_size_mb', 0.0),
            inference_latency_ms=eval_metrics.get('inference_latency_ms', 0.0),
            training_time_seconds=training_time,
            privacy_epsilon=training_info.get('privacy_epsilon', None) if ablation_config.privacy_enabled else None
        )
        
        # Save results
        self.results.append(results)
        
        results_path = self.output_dir / f"{ablation_config.name}_results.json"
        with open(results_path, 'w') as f:
            json.dump(results.to_dict(), f, indent=2)
        
        logger.info(
            f"Ablation '{ablation_config.name}' complete: "
            f"F1={results.f1_score:.4f}, AUC-ROC={results.auc_roc:.4f}"
        )
        
        return results
    
    def run_all_ablations(
        self,
        train_fn: callable,
        evaluate_fn: callable,
        **kwargs
    ) -> List[AblationResults]:
        """
        Run all defined ablation studies.
        
        Args:
            train_fn: Training function
            evaluate_fn: Evaluation function
            **kwargs: Additional arguments to pass to train_fn
            
        Returns:
            List of ablation results
            
        Requirements: 16.7
        """
        logger.info(f"Running {len(self.ablation_configs)} ablation studies")
        
        all_results = []
        
        for i, ablation_config in enumerate(self.ablation_configs, 1):
            logger.info(f"\n{'=' * 60}")
            logger.info(f"Ablation Study {i}/{len(self.ablation_configs)}")
            logger.info(f"{'=' * 60}")
            
            try:
                results = self.run_ablation(
                    ablation_config=ablation_config,
                    train_fn=train_fn,
                    evaluate_fn=evaluate_fn,
                    **kwargs
                )
                all_results.append(results)
                
            except Exception as e:
                logger.error(
                    f"Ablation study '{ablation_config.name}' failed: {e}",
                    exc_info=True
                )
                # Continue with next ablation
                continue
        
        logger.info(f"\nAll ablation studies complete: {len(all_results)} successful")
        
        return all_results
    
    def generate_comparison_table(
        self,
        results: Optional[List[AblationResults]] = None
    ) -> pd.DataFrame:
        """
        Generate ablation study comparison table.
        
        Creates a pandas DataFrame comparing all ablation results against
        the full system baseline.
        
        Args:
            results: List of ablation results (uses self.results if None)
            
        Returns:
            DataFrame with comparison metrics
            
        Requirements: 16.8
        """
        if results is None:
            results = self.results
        
        if not results:
            logger.warning("No ablation results to compare")
            return pd.DataFrame()
        
        logger.info("Generating ablation comparison table")
        
        # Convert results to DataFrame
        data = [result.to_dict() for result in results]
        df = pd.DataFrame(data)
        
        # Find full system baseline
        baseline_idx = df[df['config_name'] == 'full_system'].index
        if len(baseline_idx) == 0:
            logger.warning("No full_system baseline found in results")
            baseline = None
        else:
            baseline = df.loc[baseline_idx[0]]
        
        # Compute performance degradation relative to baseline
        if baseline is not None:
            df['f1_degradation_%'] = ((df['f1_score'] - baseline['f1_score']) / baseline['f1_score'] * 100)
            df['auc_roc_degradation_%'] = ((df['auc_roc'] - baseline['auc_roc']) / baseline['auc_roc'] * 100)
            df['communication_reduction_%'] = ((baseline['communication_cost_mb'] - df['communication_cost_mb']) / baseline['communication_cost_mb'] * 100)
        
        # Reorder columns for better readability
        column_order = [
            'config_name',
            'f1_score', 'f1_degradation_%',
            'auc_roc', 'auc_roc_degradation_%',
            'auc_pr',
            'precision', 'recall',
            'communication_cost_mb', 'communication_reduction_%',
            'model_size_mb',
            'inference_latency_ms',
            'training_time_seconds',
            'privacy_epsilon'
        ]
        
        # Filter to only existing columns
        column_order = [col for col in column_order if col in df.columns]
        df = df[column_order]
        
        # Save to CSV
        table_path = self.output_dir / 'ablation_comparison_table.csv'
        df.to_csv(table_path, index=False, float_format='%.4f')
        logger.info(f"Saved ablation comparison table to {table_path}")
        
        # Print formatted table
        logger.info("\n" + "=" * 80)
        logger.info("ABLATION STUDY COMPARISON TABLE")
        logger.info("=" * 80)
        logger.info("\n" + df.to_string(index=False, float_format=lambda x: f'{x:.4f}'))
        logger.info("=" * 80)
        
        return df
    
    def compute_component_contributions(
        self,
        results: Optional[List[AblationResults]] = None
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute individual component contributions to performance.
        
        For each component, compares full system performance with
        ablation (component removed) to measure contribution.
        
        Args:
            results: List of ablation results (uses self.results if None)
            
        Returns:
            Dictionary mapping component names to their contributions
            
        Requirements: 16.7, 16.8
        """
        if results is None:
            results = self.results
        
        logger.info("Computing component contributions")
        
        # Find full system baseline
        full_system = next(
            (r for r in results if r.config_name == 'full_system'),
            None
        )
        
        if full_system is None:
            logger.error("Cannot compute contributions without full_system baseline")
            return {}
        
        # Compute contributions
        contributions = {}
        
        component_map = {
            'without_adms': 'ADMS',
            'without_dp': 'Differential Privacy',
            'without_kd': 'Knowledge Distillation',
            'without_quantization': 'Quantization',
            'fedavg_only': 'Byzantine Robustness'
        }
        
        for result in results:
            if result.config_name in component_map:
                component_name = component_map[result.config_name]
                
                # Compute contributions (positive = component improves performance)
                contributions[component_name] = {
                    'f1_contribution': full_system.f1_score - result.f1_score,
                    'auc_roc_contribution': full_system.auc_roc - result.auc_roc,
                    'auc_pr_contribution': full_system.auc_pr - result.auc_pr,
                    'communication_savings': full_system.communication_cost_mb - result.communication_cost_mb,
                    'model_size_savings': full_system.model_size_mb - result.model_size_mb,
                    'latency_overhead': result.inference_latency_ms - full_system.inference_latency_ms
                }
        
        # Save contributions
        contrib_path = self.output_dir / 'component_contributions.json'
        with open(contrib_path, 'w') as f:
            json.dump(contributions, f, indent=2)
        
        logger.info(f"Saved component contributions to {contrib_path}")
        
        # Log contributions
        logger.info("\n" + "=" * 80)
        logger.info("COMPONENT CONTRIBUTIONS")
        logger.info("=" * 80)
        for component, metrics in contributions.items():
            logger.info(f"\n{component}:")
            for metric, value in metrics.items():
                logger.info(f"  {metric}: {value:+.4f}")
        logger.info("=" * 80)
        
        return contributions
    
    def get_ablation_configs(self) -> List[AblationConfiguration]:
        """
        Get list of all ablation configurations.
        
        Returns:
            List of ablation configurations
        """
        return copy.deepcopy(self.ablation_configs)
    
    def get_results(self) -> List[AblationResults]:
        """
        Get list of all ablation results.
        
        Returns:
            List of ablation results
        """
        return copy.deepcopy(self.results)
    
    def save_all_results(self):
        """
        Save all ablation results to a single JSON file.
        
        Requirements: 16.6
        """
        if not self.results:
            logger.warning("No results to save")
            return
        
        all_results_path = self.output_dir / 'all_ablation_results.json'
        
        results_dict = {
            'full_system_config': self.full_system_config,
            'num_ablations': len(self.results),
            'results': [result.to_dict() for result in self.results]
        }
        
        with open(all_results_path, 'w') as f:
            json.dump(results_dict, f, indent=2)
        
        logger.info(f"Saved all ablation results to {all_results_path}")
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"AblationStudyRunner("
            f"num_configs={len(self.ablation_configs)}, "
            f"num_results={len(self.results)}, "
            f"output_dir='{self.output_dir}')"
        )
