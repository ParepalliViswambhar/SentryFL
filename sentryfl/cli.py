"""
Command-Line Interface for SentryFL

This module provides a user-friendly CLI for training, evaluating, and running
experiments with the SentryFL federated learning framework.

Validates Requirements: 14.4, 14.8, 20.4

Usage:
    python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD
    python -m sentryfl.cli evaluate --model-path ./models/global_model.pt --config config.yaml
    python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD
    python -m sentryfl.cli baseline --config config.yaml --data-path ./data/SMD --baseline fedavg
"""

import argparse
import sys
import logging
from pathlib import Path
from typing import Optional, Dict, Any

import torch
import yaml

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def load_config(config_path: str, overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Load configuration from YAML file with optional command-line overrides.
    
    Args:
        config_path: Path to YAML configuration file
        overrides: Dictionary of configuration overrides from command-line
        
    Returns:
        Configuration dictionary
    """
    logger.info(f"Loading configuration from {config_path}")
    
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Apply command-line overrides
    if overrides:
        logger.info("Applying command-line configuration overrides...")
        for key, value in overrides.items():
            # Support nested keys like 'training.learning_rate'
            keys = key.split('.')
            current = config
            for k in keys[:-1]:
                if k not in current:
                    current[k] = {}
                current = current[k]
            current[keys[-1]] = value
            logger.info(f"  Override: {key} = {value}")
    
    return config


def parse_overrides(override_args: Optional[list]) -> Dict[str, Any]:
    """
    Parse command-line configuration overrides.
    
    Args:
        override_args: List of override strings in format 'key=value'
        
    Returns:
        Dictionary of overrides
    """
    if not override_args:
        return {}
    
    overrides = {}
    for arg in override_args:
        if '=' not in arg:
            logger.warning(f"Ignoring invalid override format: {arg} (expected key=value)")
            continue
        
        key, value = arg.split('=', 1)
        
        # Attempt type conversion
        try:
            # Try integer
            value = int(value)
        except ValueError:
            try:
                # Try float
                value = float(value)
            except ValueError:
                # Try boolean
                if value.lower() in ('true', 'false'):
                    value = value.lower() == 'true'
                # Otherwise keep as string
        
        overrides[key] = value
    
    return overrides


def train_command(args):
    """Execute federated training command."""
    logger.info("=" * 80)
    logger.info("SENTRYFL FEDERATED TRAINING")
    logger.info("=" * 80)
    
    # Load configuration
    overrides = parse_overrides(args.override)
    config_dict = load_config(args.config, overrides)
    
    # Import here to avoid circular dependencies
    from sentryfl.utils.config import ConfigurationSystem
    from sentryfl.trainer import create_trainer_from_config
    from sentryfl.models.plm_backbone import PLMAnomalyDetector
    
    # Create configuration object
    config = ConfigurationSystem(config_dict)
    
    # Validate required paths
    data_path = Path(args.data_path)
    if not data_path.exists():
        logger.error(f"Data path does not exist: {data_path}")
        sys.exit(1)
    
    # Auto-detect device
    device = args.device if args.device else ('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"Using device: {device}")
    
    # Create model
    model_config = config.get_section('model')
    data_config = config.get_section('data')
    
    # Determine input dimension based on dataset
    if data_config['dataset'] == 'SMD':
        input_dim = 38  # SMD has 38 telemetry features
    elif data_config['dataset'] == 'NSL-KDD':
        input_dim = 41  # NSL-KDD has 41 network flow features
    else:
        logger.error(f"Unknown dataset: {data_config['dataset']}")
        sys.exit(1)
    
    logger.info(f"Creating PLM anomaly detection model (input_dim={input_dim})...")
    pe_cfg = config.get_section('parameter_efficiency')
    peft_method = pe_cfg.get('method', 'adms' if pe_cfg.get('adms_enabled') else 'full_head')
    model = PLMAnomalyDetector(
        input_dim=input_dim,
        hidden_dim=model_config['hidden_dim'],
        model_name=model_config['backbone'],
        freeze_backbone=model_config['freeze_backbone'],
        dropout=model_config.get('dropout', 0.1),
        peft_method=peft_method,
        lora_rank=pe_cfg.get('lora_rank', 8),
        lora_alpha=pe_cfg.get('lora_alpha', 16),
        lora_targets=pe_cfg.get('lora_targets'),
    )
    logger.info(f"Parameter-efficiency method: {peft_method}")
    
    # Create trainer
    trainer = create_trainer_from_config(
        config_path=args.config,
        model=model,
        data_path=str(data_path),
        device=device
    )
    
    # Setup all components
    logger.info("Setting up trainer components...")
    trainer.setup()
    
    # Resume from checkpoint if specified
    if args.resume_from:
        logger.info(f"Resuming training from checkpoint: {args.resume_from}")
        trainer.resume_from_checkpoint(args.resume_from)
    
    # Start training
    logger.info("Starting federated training...")
    trainer.train()
    
    logger.info("=" * 80)
    logger.info("TRAINING COMPLETE")
    logger.info("=" * 80)


def evaluate_command(args):
    """Execute model evaluation command."""
    logger.info("=" * 80)
    logger.info("SENTRYFL MODEL EVALUATION")
    logger.info("=" * 80)
    
    # Load configuration
    overrides = parse_overrides(args.override)
    config_dict = load_config(args.config, overrides)
    
    from sentryfl.utils.config import ConfigurationSystem
    from sentryfl.evaluation.evaluation_pipeline import EvaluationPipeline
    from sentryfl.data.dataset_loader import SMDDatasetLoader, NSLKDDDatasetLoader
    from sentryfl.data.preprocessor import TimeSeriesPreprocessor
    
    config = ConfigurationSystem(config_dict)
    data_config = config.get_section('data')
    eval_config = config.get_section('evaluation')
    
    # Load model
    logger.info(f"Loading model from {args.model_path}")
    device = args.device if args.device else ('cuda' if torch.cuda.is_available() else 'cpu')
    model = torch.load(args.model_path, map_location=device)
    model.eval()
    
    # Load and preprocess test data
    logger.info(f"Loading test data from {args.data_path}")
    data_path = Path(args.data_path)
    
    if data_config['dataset'] == 'SMD':
        loader = SMDDatasetLoader(machine_id='machine-1-1')
    elif data_config['dataset'] == 'NSL-KDD':
        loader = NSLKDDDatasetLoader()
    else:
        logger.error(f"Unknown dataset: {data_config['dataset']}")
        sys.exit(1)
    
    data_dict = loader.load_data(str(data_path))
    
    # Preprocess test data
    preprocessor = TimeSeriesPreprocessor(
        window_size=data_config['window_size'],
        stride=data_config['stride'],
        normalize=data_config['normalize']
    )
    
    # Load scaler if exists
    scaler_path = Path(args.model_path).parent / 'preprocessor.pkl'
    if scaler_path.exists():
        preprocessor.load_scaler(str(scaler_path))
    
    if data_config['dataset'] == 'SMD':
        test_data = data_dict['test']
        test_labels = data_dict['test_labels']
    else:
        test_data = data_dict['test']
        test_labels = data_dict['test_labels']
    
    # Transform and window test data
    test_data_normalized = preprocessor.transform(test_data)
    test_windows, test_window_labels = preprocessor.create_windows(
        test_data_normalized,
        test_labels
    )
    
    # Convert to tensors
    test_data_tensor = torch.FloatTensor(test_windows)
    
    # Create evaluation pipeline
    evaluator = EvaluationPipeline(
        model=model,
        device=device,
        threshold=eval_config.get('anomaly_threshold', 0.5),
        auto_threshold=True
    )
    
    # Evaluate
    logger.info("Evaluating model on test set...")
    metrics = evaluator.evaluate(
        test_data=test_data_tensor,
        test_labels=test_window_labels,
        batch_size=32
    )
    
    # Print results
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION RESULTS")
    logger.info("=" * 80)
    logger.info(f"Precision:     {metrics.precision:.4f}")
    logger.info(f"Recall:        {metrics.recall:.4f}")
    logger.info(f"F1-Score:      {metrics.f1_score:.4f}")
    logger.info(f"AUC-ROC:       {metrics.auc_roc:.4f}")
    logger.info(f"AUC-PR:        {metrics.auc_pr:.4f}")
    logger.info(f"Accuracy:      {metrics.accuracy:.4f}")
    logger.info(f"Avg Latency:   {metrics.avg_latency_ms:.2f} ms")
    logger.info("=" * 80)
    
    # Save results if output path specified
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        import json
        with open(output_path, 'w') as f:
            json.dump(metrics.to_dict(), f, indent=2)
        logger.info(f"Results saved to {output_path}")
    
    # Generate plots if requested
    if eval_config.get('save_plots', False):
        plot_dir = Path(args.model_path).parent / 'evaluation_plots'
        plot_dir.mkdir(parents=True, exist_ok=True)
        
        scores = evaluator.compute_anomaly_scores(test_data_tensor, batch_size=32)
        
        evaluator.generate_roc_curve(
            test_window_labels,
            scores,
            save_path=str(plot_dir / 'roc_curve.png')
        )
        
        evaluator.generate_pr_curve(
            test_window_labels,
            scores,
            save_path=str(plot_dir / 'pr_curve.png')
        )
        
        logger.info(f"Evaluation plots saved to {plot_dir}")


def _build_train_evaluate_fns(config_path, data_path, device, num_rounds=None):
    """
    Build train_fn / evaluate_fn callbacks used by the ablation and baseline
    runners.

    The runners expect:
        train_fn(config: Dict, **kwargs) -> (trained_model, training_info)
        evaluate_fn(model) -> Dict[str, float]

    Returns a tuple of (train_fn, evaluate_fn).
    """
    from sentryfl.trainer import create_trainer_from_config
    from sentryfl.models.plm_backbone import PLMAnomalyDetector

    def _input_dim_for(dataset):
        if dataset == 'SMD':
            return 38
        if dataset == 'NSL-KDD':
            return 41
        raise ValueError(f"Unknown dataset: {dataset}")

    def train_fn(config, **kwargs):
        """Train a model for a single ablation/baseline configuration."""
        model_cfg = config.get('model', {})
        data_cfg = config.get('data', {})
        input_dim = _input_dim_for(data_cfg.get('dataset'))

        pe_cfg = config.get('parameter_efficiency', {})
        peft_method = pe_cfg.get('method', 'adms' if pe_cfg.get('adms_enabled') else 'full_head')
        model = PLMAnomalyDetector(
            input_dim=input_dim,
            hidden_dim=model_cfg.get('hidden_dim', 128),
            model_name=model_cfg.get('backbone', 'bert-base-uncased'),
            freeze_backbone=model_cfg.get('freeze_backbone', True),
            dropout=model_cfg.get('dropout', 0.1),
            peft_method=peft_method,
            lora_rank=pe_cfg.get('lora_rank', 8),
            lora_alpha=pe_cfg.get('lora_alpha', 16),
            lora_targets=pe_cfg.get('lora_targets'),
        )

        # create_trainer_from_config reloads config from disk; apply the
        # in-memory ablation/baseline overrides afterwards so the disabled
        # components are honored.
        trainer = create_trainer_from_config(
            config_path=config_path,
            model=model,
            data_path=str(data_path),
            device=device,
        )
        trainer.config.config = config
        if num_rounds is not None:
            trainer.training_config['num_rounds'] = num_rounds
        trainer.setup()
        trainer.train()

        training_info = {
            'communication_cost_mb': getattr(trainer, 'total_communication_mb', 0.0),
            'model_size_mb': getattr(trainer, 'model_size_mb', 0.0),
            'privacy_epsilon': getattr(trainer, 'privacy_epsilon_spent', None),
        }
        return trainer.model, training_info

    def evaluate_fn(model, _test_data=None):
        """Evaluate a trained model on the held-out test set.

        The baseline runner passes its ``test_data`` as a second argument while
        the ablation runner passes only the model, so the second parameter is
        optional. Both load the test set from ``data_path`` here for an
        identical-test-set comparison.
        """
        from sentryfl.utils.config import ConfigurationSystem
        from sentryfl.evaluation.evaluation_pipeline import EvaluationPipeline
        from sentryfl.data.dataset_loader import SMDDatasetLoader, NSLKDDDatasetLoader
        from sentryfl.data.preprocessor import TimeSeriesPreprocessor

        config = ConfigurationSystem.from_yaml(config_path)
        data_cfg = config.get_section('data')
        eval_cfg = config.get_section('evaluation')

        if data_cfg['dataset'] == 'SMD':
            loader = SMDDatasetLoader(machine_id='machine-1-1')
        else:
            loader = NSLKDDDatasetLoader()
        data_dict = loader.load_data(str(data_path))

        preprocessor = TimeSeriesPreprocessor(
            window_size=data_cfg['window_size'],
            stride=data_cfg['stride'],
            normalize=data_cfg['normalize'],
        )
        test_norm = preprocessor.fit_transform(data_dict['test'])
        test_windows, test_labels = preprocessor.create_windows(
            test_norm, data_dict['test_labels']
        )

        evaluator = EvaluationPipeline(
            model=model,
            device=device,
            threshold=eval_cfg.get('anomaly_threshold', 0.5),
            auto_threshold=True,
        )
        metrics = evaluator.evaluate(
            test_data=torch.FloatTensor(test_windows),
            test_labels=test_labels,
            batch_size=32,
        )
        return {
            'f1': metrics.f1_score,
            'auc_roc': metrics.auc_roc,
            'auc_pr': metrics.auc_pr,
            'precision': metrics.precision,
            'recall': metrics.recall,
            'inference_latency_ms': metrics.avg_latency_ms,
        }

    return train_fn, evaluate_fn


def ablation_command(args):
    """Execute ablation study command."""
    logger.info("=" * 80)
    logger.info("SENTRYFL ABLATION STUDY")
    logger.info("=" * 80)

    # Load configuration
    overrides = parse_overrides(args.override)
    config_dict = load_config(args.config, overrides)

    from sentryfl.evaluation.ablation_study import AblationStudyRunner

    # Validate data path
    data_path = Path(args.data_path)
    if not data_path.exists():
        logger.error(f"Data path does not exist: {data_path}")
        sys.exit(1)

    # Auto-detect device
    device = args.device if args.device else ('cuda' if torch.cuda.is_available() else 'cpu')

    output_dir = Path(args.output).parent if args.output else Path('./ablation_results')

    # Create ablation study runner from the full-system config dict
    runner = AblationStudyRunner(
        full_system_config=config_dict,
        output_dir=str(output_dir),
    )

    # Optionally filter to a subset of ablation configurations. The --components
    # flag names the components to ablate; map each to its "without_*" config.
    component_map = {
        'adms': 'without_adms',
        'dp': 'without_dp',
        'quantization': 'without_quantization',
        'distillation': 'without_kd',
        'byzantine': 'fedavg_only',
    }
    if args.components:
        selected = {'full_system'} | {component_map[c] for c in args.components}
        runner.ablation_configs = [
            cfg for cfg in runner.ablation_configs if cfg.name in selected
        ]
        logger.info(f"Ablating components {args.components} -> configs {sorted(selected)}")

    # Build training / evaluation callbacks
    train_fn, evaluate_fn = _build_train_evaluate_fns(
        args.config, data_path, device, num_rounds=args.num_rounds
    )

    # Run ablation studies
    results = runner.run_all_ablations(train_fn=train_fn, evaluate_fn=evaluate_fn)

    # Print results
    logger.info("\n" + "=" * 80)
    logger.info("ABLATION STUDY RESULTS")
    logger.info("=" * 80)
    for res in results:
        logger.info(f"\n{res.config_name}:")
        logger.info(f"  F1-Score:  {res.f1_score:.4f}")
        logger.info(f"  AUC-ROC:   {res.auc_roc:.4f}")
        logger.info(f"  AUC-PR:    {res.auc_pr:.4f}")
    logger.info("=" * 80)

    # Generate comparison table (per-config JSON already saved by the runner)
    table = runner.generate_comparison_table(results)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        table.to_csv(output_path.with_suffix('.csv'), index=False)
        logger.info(f"Ablation comparison table saved to {output_path.with_suffix('.csv')}")


def baseline_command(args):
    """Execute baseline comparison command."""
    logger.info("=" * 80)
    logger.info("SENTRYFL BASELINE COMPARISON")
    logger.info("=" * 80)

    # Load configuration
    overrides = parse_overrides(args.override)
    config_dict = load_config(args.config, overrides)

    from sentryfl.evaluation.baseline_models import BaselineModelRunner

    # Validate data path
    data_path = Path(args.data_path)
    if not data_path.exists():
        logger.error(f"Data path does not exist: {data_path}")
        sys.exit(1)

    # Auto-detect device
    device = args.device if args.device else ('cuda' if torch.cuda.is_available() else 'cpu')

    output_dir = Path(args.output).parent if args.output else Path('./baseline_results')

    # Build training / evaluation callbacks (evaluate_fn also loads the test set
    # the runner needs for identical-test-set evaluation).
    train_fn, evaluate_fn = _build_train_evaluate_fns(
        args.config, data_path, device, num_rounds=args.num_rounds
    )

    # Create baseline comparison runner
    baseline_runner = BaselineModelRunner(
        base_config=config_dict,
        test_data=str(data_path),
        output_dir=str(output_dir),
    )

    # Optionally filter to a subset of baselines (note: 'local' maps to 'local_only')
    if args.baselines:
        name_map = {'local': 'local_only'}
        selected = {name_map.get(b, b) for b in args.baselines}
        baseline_runner.baseline_configs = [
            cfg for cfg in baseline_runner.baseline_configs if cfg.name in selected
        ]
        logger.info(f"Running baselines: {sorted(selected)}")

    # Run baseline comparisons
    results = baseline_runner.run_all_baselines(train_fn=train_fn, evaluate_fn=evaluate_fn)

    # Print results
    logger.info("\n" + "=" * 80)
    logger.info("BASELINE COMPARISON RESULTS")
    logger.info("=" * 80)
    for res in results:
        logger.info(f"\n{res.baseline_name}:")
        logger.info(f"  F1-Score:   {res.f1_score:.4f}")
        logger.info(f"  AUC-ROC:    {res.auc_roc:.4f}")
        logger.info(f"  Precision:  {res.precision:.4f}")
        logger.info(f"  Recall:     {res.recall:.4f}")
    logger.info("=" * 80)

    # Generate comparison table (per-baseline JSON already saved by the runner)
    table = baseline_runner.generate_comparison_table(results)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        table.to_csv(output_path.with_suffix('.csv'), index=False)
        logger.info(f"Baseline comparison table saved to {output_path.with_suffix('.csv')}")


def create_parser():
    """Create argument parser with all commands and options."""
    parser = argparse.ArgumentParser(
        description="SentryFL: Differentially Private Federated Learning for Anomaly Detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with default configuration
  python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD
  
  # Train with configuration overrides
  python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD \\
      --override privacy.epsilon=0.5 training.num_rounds=50
  
  # Resume training from checkpoint
  python -m sentryfl.cli train --config config.yaml --data-path ./data/SMD \\
      --resume-from ./checkpoints/round_30.pt
  
  # Evaluate trained model
  python -m sentryfl.cli evaluate --model-path ./models/global_model.pt \\
      --config config.yaml --data-path ./data/SMD --output results.json
  
  # Run ablation study
  python -m sentryfl.cli ablation --config config.yaml --data-path ./data/SMD \\
      --components adms dp --output ablation_results.json
  
  # Run baseline comparison
  python -m sentryfl.cli baseline --config config.yaml --data-path ./data/SMD \\
      --baselines pefad centralized --output baseline_results.json

For more information, visit: https://github.com/your-repo/sentryfl
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Train command
    train_parser = subparsers.add_parser(
        'train',
        help='Train federated anomaly detection model',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    train_parser.add_argument(
        '--config', '-c',
        type=str,
        required=True,
        help='Path to YAML configuration file'
    )
    train_parser.add_argument(
        '--data-path', '-d',
        type=str,
        required=True,
        help='Path to dataset directory (SMD or NSL-KDD)'
    )
    train_parser.add_argument(
        '--device',
        type=str,
        default=None,
        choices=['cpu', 'cuda'],
        help='Device for training (default: auto-detect)'
    )
    train_parser.add_argument(
        '--resume-from',
        type=str,
        default=None,
        help='Resume training from checkpoint path'
    )
    train_parser.add_argument(
        '--override', '-o',
        nargs='*',
        help='Override configuration values (format: key=value, e.g., privacy.epsilon=0.5)'
    )
    train_parser.set_defaults(func=train_command)
    
    # Evaluate command
    eval_parser = subparsers.add_parser(
        'evaluate',
        help='Evaluate trained model on test data',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    eval_parser.add_argument(
        '--model-path', '-m',
        type=str,
        required=True,
        help='Path to trained model file (.pt or .pth)'
    )
    eval_parser.add_argument(
        '--config', '-c',
        type=str,
        required=True,
        help='Path to YAML configuration file'
    )
    eval_parser.add_argument(
        '--data-path', '-d',
        type=str,
        required=True,
        help='Path to dataset directory'
    )
    eval_parser.add_argument(
        '--device',
        type=str,
        default=None,
        choices=['cpu', 'cuda'],
        help='Device for evaluation (default: auto-detect)'
    )
    eval_parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Path to save evaluation results (JSON format)'
    )
    eval_parser.add_argument(
        '--override', '-o',
        nargs='*',
        help='Override configuration values (format: key=value)'
    )
    eval_parser.set_defaults(func=evaluate_command)
    
    # Ablation command
    ablation_parser = subparsers.add_parser(
        'ablation',
        help='Run ablation study to measure component contributions',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ablation_parser.add_argument(
        '--config', '-c',
        type=str,
        required=True,
        help='Path to YAML configuration file'
    )
    ablation_parser.add_argument(
        '--data-path', '-d',
        type=str,
        required=True,
        help='Path to dataset directory'
    )
    ablation_parser.add_argument(
        '--components',
        nargs='+',
        choices=['adms', 'dp', 'quantization', 'distillation', 'byzantine'],
        help='Components to ablate (default: all)'
    )
    ablation_parser.add_argument(
        '--device',
        type=str,
        default=None,
        choices=['cpu', 'cuda'],
        help='Device for training (default: auto-detect)'
    )
    ablation_parser.add_argument(
        '--num-rounds',
        type=int,
        default=None,
        help='Override number of training rounds for ablation study'
    )
    ablation_parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Path to save ablation results (JSON format)'
    )
    ablation_parser.add_argument(
        '--override', '-o',
        nargs='*',
        help='Override configuration values (format: key=value)'
    )
    ablation_parser.set_defaults(func=ablation_command)
    
    # Baseline command
    baseline_parser = subparsers.add_parser(
        'baseline',
        help='Run baseline model comparisons',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    baseline_parser.add_argument(
        '--config', '-c',
        type=str,
        required=True,
        help='Path to YAML configuration file'
    )
    baseline_parser.add_argument(
        '--data-path', '-d',
        type=str,
        required=True,
        help='Path to dataset directory'
    )
    baseline_parser.add_argument(
        '--baselines',
        nargs='+',
        choices=['pefad', 'centralized', 'local', 'fedavg'],
        help='Baselines to run (default: all)'
    )
    baseline_parser.add_argument(
        '--device',
        type=str,
        default=None,
        choices=['cpu', 'cuda'],
        help='Device for training (default: auto-detect)'
    )
    baseline_parser.add_argument(
        '--num-rounds',
        type=int,
        default=None,
        help='Override number of training rounds for baseline comparison'
    )
    baseline_parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Path to save baseline results (JSON format)'
    )
    baseline_parser.add_argument(
        '--override', '-o',
        nargs='*',
        help='Override configuration values (format: key=value)'
    )
    baseline_parser.set_defaults(func=baseline_command)
    
    return parser


def main():
    """Main entry point for CLI."""
    parser = create_parser()
    args = parser.parse_args()
    
    if not hasattr(args, 'func'):
        parser.print_help()
        sys.exit(1)
    
    try:
        args.func(args)
    except KeyboardInterrupt:
        logger.info("\nOperation cancelled by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
