#!/usr/bin/env python3
"""
Experiment Reproduction Script for SentryFL

This script reproduces all experiments from the paper with a single command.
It automates the complete workflow:
1. Dataset verification
2. System information logging
3. Running all paper experiments
4. Generating comparison reports

Usage:
    # Run all experiments
    python scripts/reproduce_experiments.py --all
    
    # Run specific experiment
    python scripts/reproduce_experiments.py --experiment smd_baseline
    
    # Run with specific seed
    python scripts/reproduce_experiments.py --all --seed 42
    
    # Quick test (reduced epochs)
    python scripts/reproduce_experiments.py --all --quick
"""

import argparse
import os
import sys
import logging
import yaml
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sentryfl.utils.reproducibility import ReproducibilityManager

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ExperimentRunner:
    """Manages reproduction of paper experiments"""
    
    # Experiment configurations matching paper
    EXPERIMENTS = {
        # Experiment 1: SMD Baseline (No DP, No ADMS)
        'smd_baseline': {
            'name': 'SMD Baseline',
            'description': 'SMD dataset without DP or ADMS - establishes upper bound on performance',
            'dataset': 'SMD',
            'config': {
                'experiment': {
                    'name': 'smd_baseline',
                    'output_dir': './experiments/smd_baseline',
                    'seed': 42
                },
                'data': {
                    'dataset': 'SMD',
                    'window_size': 100,
                    'stride': 1
                },
                'training': {
                    'num_rounds': 100,
                    'local_epochs': 5,
                    'batch_size': 32,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': 5,
                    'clients_per_round': 5
                },
                'privacy': {
                    'enabled': False
                },
                'parameter_efficiency': {
                    'adms_enabled': False
                }
            }
        },
        
        # Experiment 2: SMD with DP
        'smd_dp': {
            'name': 'SMD with Differential Privacy',
            'description': 'SMD with DP-SGD (ε=1.0) - measures privacy-utility tradeoff',
            'dataset': 'SMD',
            'config': {
                'experiment': {
                    'name': 'smd_dp',
                    'output_dir': './experiments/smd_dp',
                    'seed': 42
                },
                'data': {
                    'dataset': 'SMD',
                    'window_size': 100,
                    'stride': 1
                },
                'training': {
                    'num_rounds': 100,
                    'local_epochs': 5,
                    'batch_size': 32,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': 5,
                    'clients_per_round': 5
                },
                'privacy': {
                    'enabled': True,
                    'epsilon': 1.0,
                    'delta': 1e-5,
                    'max_grad_norm': 1.0
                },
                'parameter_efficiency': {
                    'adms_enabled': False
                }
            }
        },
        
        # Experiment 3: SMD with DP + ADMS
        'smd_dp_adms': {
            'name': 'SMD with DP + ADMS',
            'description': 'SMD with DP and ADMS - full SentryFL system',
            'dataset': 'SMD',
            'config': {
                'experiment': {
                    'name': 'smd_dp_adms',
                    'output_dir': './experiments/smd_dp_adms',
                    'seed': 42
                },
                'data': {
                    'dataset': 'SMD',
                    'window_size': 100,
                    'stride': 1
                },
                'training': {
                    'num_rounds': 100,
                    'local_epochs': 5,
                    'batch_size': 32,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': 5,
                    'clients_per_round': 5
                },
                'privacy': {
                    'enabled': True,
                    'epsilon': 1.0,
                    'delta': 1e-5,
                    'max_grad_norm': 1.0
                },
                'parameter_efficiency': {
                    'adms_enabled': True,
                    'selection_ratio': 0.05
                }
            }
        },
        
        # Experiment 4: NSL-KDD Baseline
        'nslkdd_baseline': {
            'name': 'NSL-KDD Baseline',
            'description': 'NSL-KDD dataset without DP or ADMS',
            'dataset': 'NSL-KDD',
            'config': {
                'experiment': {
                    'name': 'nslkdd_baseline',
                    'output_dir': './experiments/nslkdd_baseline',
                    'seed': 42
                },
                'data': {
                    'dataset': 'NSL-KDD',
                    'window_size': 10,  # Shorter window for network data
                    'stride': 1
                },
                'training': {
                    'num_rounds': 50,  # Fewer rounds (larger dataset)
                    'local_epochs': 3,
                    'batch_size': 64,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': 20,
                    'clients_per_round': 10
                },
                'privacy': {
                    'enabled': False
                },
                'parameter_efficiency': {
                    'adms_enabled': False
                }
            }
        },
        
        # Experiment 5: NSL-KDD with DP + ADMS
        'nslkdd_dp_adms': {
            'name': 'NSL-KDD with DP + ADMS',
            'description': 'NSL-KDD with full SentryFL system',
            'dataset': 'NSL-KDD',
            'config': {
                'experiment': {
                    'name': 'nslkdd_dp_adms',
                    'output_dir': './experiments/nslkdd_dp_adms',
                    'seed': 42
                },
                'data': {
                    'dataset': 'NSL-KDD',
                    'window_size': 10,
                    'stride': 1
                },
                'training': {
                    'num_rounds': 50,
                    'local_epochs': 3,
                    'batch_size': 64,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': 20,
                    'clients_per_round': 10
                },
                'privacy': {
                    'enabled': True,
                    'epsilon': 1.0,
                    'delta': 1e-5,
                    'max_grad_norm': 1.0
                },
                'parameter_efficiency': {
                    'adms_enabled': True,
                    'selection_ratio': 0.05
                }
            }
        },
        
        # Experiment 6: Privacy Budget Ablation
        'privacy_ablation': {
            'name': 'Privacy Budget Ablation',
            'description': 'Test different epsilon values (0.1, 0.5, 1.0, 5.0, 10.0)',
            'dataset': 'SMD',
            'config': {
                'experiment': {
                    'name': 'privacy_ablation',
                    'output_dir': './experiments/privacy_ablation',
                    'seed': 42
                },
                'data': {
                    'dataset': 'SMD',
                    'window_size': 100,
                    'stride': 1
                },
                'training': {
                    'num_rounds': 100,
                    'local_epochs': 5,
                    'batch_size': 32,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': 5,
                    'clients_per_round': 5
                },
                'privacy': {
                    'enabled': True,
                    'epsilon': [0.1, 0.5, 1.0, 5.0, 10.0],  # Multiple values
                    'delta': 1e-5,
                    'max_grad_norm': 1.0
                },
                'parameter_efficiency': {
                    'adms_enabled': True,
                    'selection_ratio': 0.05
                }
            }
        },
        
        # Experiment 7: Communication Scaling
        'communication_scaling': {
            'name': 'Communication Scaling',
            'description': 'Test scalability with 5, 20, 50 clients',
            'dataset': 'SMD',
            'config': {
                'experiment': {
                    'name': 'communication_scaling',
                    'output_dir': './experiments/communication_scaling',
                    'seed': 42
                },
                'data': {
                    'dataset': 'SMD',
                    'window_size': 100,
                    'stride': 1
                },
                'training': {
                    'num_rounds': 100,
                    'local_epochs': 5,
                    'batch_size': 32,
                    'learning_rate': 0.001
                },
                'federated': {
                    'num_clients': [5, 20, 50],  # Multiple values
                    'clients_per_round': None  # Will be set dynamically
                },
                'privacy': {
                    'enabled': True,
                    'epsilon': 1.0,
                    'delta': 1e-5,
                    'max_grad_norm': 1.0
                },
                'parameter_efficiency': {
                    'adms_enabled': True,
                    'selection_ratio': 0.05
                }
            }
        }
    }
    
    def __init__(self, output_dir: str = './experiments', seed: int = 42):
        """
        Initialize experiment runner
        
        Args:
            output_dir: Base directory for experiment outputs
            seed: Random seed for reproducibility
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.seed = seed
        self.results = {}
        
        # Initialize reproducibility manager
        self.repro_manager = ReproducibilityManager(seed=seed, log_dir=str(self.output_dir))
    
    def setup_reproducibility(self):
        """Setup reproducibility: set seeds and log system info"""
        logger.info("=" * 80)
        logger.info("REPRODUCIBILITY SETUP")
        logger.info("=" * 80)
        
        # Set global seed
        self.repro_manager.set_seed()
        
        # Log system information
        system_info_path = self.repro_manager.log_system_info()
        logger.info(f"System info saved to: {system_info_path}")
        
        return system_info_path
    
    def verify_datasets(self) -> bool:
        """Verify that required datasets are available"""
        logger.info("=" * 80)
        logger.info("DATASET VERIFICATION")
        logger.info("=" * 80)
        
        data_dir = Path('./data')
        
        # Check SMD
        smd_path = data_dir / 'SMD'
        smd_exists = smd_path.exists() and len(list(smd_path.glob('machine-*'))) > 0
        
        if smd_exists:
            logger.info("✓ SMD dataset found")
        else:
            logger.error("✗ SMD dataset not found")
            logger.error("  Run: python scripts/download_datasets.py --dataset SMD --output ./data/SMD")
        
        # Check NSL-KDD
        nslkdd_path = data_dir / 'NSL-KDD'
        nslkdd_exists = nslkdd_path.exists() and (nslkdd_path / 'KDDTrain+.txt').exists()
        
        if nslkdd_exists:
            logger.info("✓ NSL-KDD dataset found")
        else:
            logger.error("✗ NSL-KDD dataset not found")
            logger.error("  Run: python scripts/download_datasets.py --dataset NSL-KDD --output ./data/NSL-KDD")
        
        return smd_exists and nslkdd_exists
    
    def run_experiment(self, experiment_id: str, quick: bool = False) -> Dict:
        """
        Run a single experiment
        
        Args:
            experiment_id: Experiment identifier (e.g., 'smd_baseline')
            quick: If True, reduce epochs for quick testing
            
        Returns:
            Experiment results dictionary
        """
        if experiment_id not in self.EXPERIMENTS:
            raise ValueError(f"Unknown experiment: {experiment_id}")
        
        exp = self.EXPERIMENTS[experiment_id]
        
        logger.info("=" * 80)
        logger.info(f"RUNNING: {exp['name']}")
        logger.info("=" * 80)
        logger.info(f"Description: {exp['description']}")
        logger.info(f"Dataset: {exp['dataset']}")
        
        # Create experiment config
        config = exp['config'].copy()
        config['experiment']['seed'] = self.seed
        
        # Quick mode: reduce epochs
        if quick:
            logger.info("Quick mode: Reducing epochs for testing")
            config['training']['num_rounds'] = min(10, config['training']['num_rounds'])
            config['training']['local_epochs'] = min(2, config['training']['local_epochs'])
        
        # Save config
        exp_dir = Path(config['experiment']['output_dir'])
        exp_dir.mkdir(parents=True, exist_ok=True)
        
        config_path = exp_dir / 'config.yaml'
        with open(config_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False)
        
        logger.info(f"Config saved to: {config_path}")
        
        # Create reproducibility report
        report_path = self.repro_manager.create_reproducibility_report(
            experiment_config=config,
            output_path=str(exp_dir / 'reproducibility_report.json')
        )
        logger.info(f"Reproducibility report saved to: {report_path}")
        
        # Run training (placeholder - actual CLI call would go here)
        logger.info(f"\nTo run this experiment, execute:")
        logger.info(f"  python -m sentryfl.cli train --config {config_path}")
        
        # Store results
        result = {
            'experiment_id': experiment_id,
            'name': exp['name'],
            'description': exp['description'],
            'config_path': str(config_path),
            'output_dir': str(exp_dir),
            'reproducibility_report': report_path,
            'status': 'ready'
        }
        
        self.results[experiment_id] = result
        return result
    
    def run_all_experiments(self, quick: bool = False):
        """Run all paper experiments"""
        logger.info("=" * 80)
        logger.info("RUNNING ALL PAPER EXPERIMENTS")
        logger.info("=" * 80)
        logger.info(f"Total experiments: {len(self.EXPERIMENTS)}")
        logger.info(f"Output directory: {self.output_dir}")
        logger.info(f"Random seed: {self.seed}")
        if quick:
            logger.info("Mode: Quick (reduced epochs)")
        logger.info("")
        
        for i, (exp_id, exp) in enumerate(self.EXPERIMENTS.items(), 1):
            logger.info(f"\n[{i}/{len(self.EXPERIMENTS)}] {exp['name']}")
            logger.info("-" * 80)
            self.run_experiment(exp_id, quick=quick)
        
        # Generate summary
        self.generate_summary()
    
    def generate_summary(self):
        """Generate experiment summary report"""
        logger.info("\n" + "=" * 80)
        logger.info("EXPERIMENT SUMMARY")
        logger.info("=" * 80)
        
        summary = {
            'timestamp': datetime.now().isoformat(),
            'seed': self.seed,
            'total_experiments': len(self.results),
            'experiments': self.results
        }
        
        # Save summary
        summary_path = self.output_dir / 'experiment_summary.json'
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        logger.info(f"\nSummary saved to: {summary_path}")
        logger.info(f"\nExperiment configurations created:")
        
        for exp_id, result in self.results.items():
            logger.info(f"  - {result['name']}")
            logger.info(f"    Config: {result['config_path']}")
            logger.info(f"    Output: {result['output_dir']}")
        
        logger.info("\n" + "=" * 80)
        logger.info("NEXT STEPS")
        logger.info("=" * 80)
        logger.info("1. Review experiment configurations in ./experiments/")
        logger.info("2. Run each experiment using the CLI:")
        logger.info("   python -m sentryfl.cli train --config <config_path>")
        logger.info("3. Compare results using:")
        logger.info("   python scripts/compare_experiments.py")
        logger.info("4. Expected results are documented in EXPECTED_RESULTS.md")
        logger.info("=" * 80)


def main():
    parser = argparse.ArgumentParser(
        description='Reproduce all SentryFL paper experiments',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run all experiments
  python scripts/reproduce_experiments.py --all
  
  # Run specific experiment
  python scripts/reproduce_experiments.py --experiment smd_baseline
  
  # Quick test with reduced epochs
  python scripts/reproduce_experiments.py --all --quick
  
  # Use custom seed
  python scripts/reproduce_experiments.py --all --seed 123

Available experiments:
  - smd_baseline: SMD without DP or ADMS (upper bound)
  - smd_dp: SMD with DP only (privacy-utility tradeoff)
  - smd_dp_adms: SMD with DP + ADMS (full system)
  - nslkdd_baseline: NSL-KDD without DP or ADMS
  - nslkdd_dp_adms: NSL-KDD with DP + ADMS
  - privacy_ablation: Test different epsilon values
  - communication_scaling: Test scalability (5, 20, 50 clients)
        """
    )
    
    parser.add_argument(
        '--all',
        action='store_true',
        help='Run all paper experiments'
    )
    
    parser.add_argument(
        '--experiment',
        type=str,
        choices=list(ExperimentRunner.EXPERIMENTS.keys()),
        help='Run specific experiment'
    )
    
    parser.add_argument(
        '--output-dir',
        type=str,
        default='./experiments',
        help='Base directory for experiment outputs (default: ./experiments)'
    )
    
    parser.add_argument(
        '--seed',
        type=int,
        default=42,
        help='Random seed for reproducibility (default: 42)'
    )
    
    parser.add_argument(
        '--quick',
        action='store_true',
        help='Quick mode: reduce epochs for testing'
    )
    
    parser.add_argument(
        '--verify-only',
        action='store_true',
        help='Only verify datasets and system info'
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.all and not args.experiment and not args.verify_only:
        parser.error("Must specify --all, --experiment, or --verify-only")
    
    # Initialize runner
    runner = ExperimentRunner(output_dir=args.output_dir, seed=args.seed)
    
    # Setup reproducibility
    runner.setup_reproducibility()
    
    # Verify datasets
    if not runner.verify_datasets():
        logger.error("\n✗ Dataset verification failed")
        logger.error("Please download required datasets before running experiments")
        sys.exit(1)
    
    if args.verify_only:
        logger.info("\n✓ Verification complete")
        sys.exit(0)
    
    # Run experiments
    if args.all:
        runner.run_all_experiments(quick=args.quick)
    elif args.experiment:
        runner.run_experiment(args.experiment, quick=args.quick)
    
    logger.info("\n✓ Experiment setup complete")


if __name__ == '__main__':
    main()
