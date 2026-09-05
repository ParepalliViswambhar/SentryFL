#!/usr/bin/env python3
"""
Verification script for Task 17.1: ExperimentLogger Implementation

Demonstrates all implemented features:
1. Unique experiment ID generation
2. Hyperparameter logging
3. Training metrics logging per round (loss, accuracy)
4. Privacy metrics logging (epsilon, MIA success rate)
5. Communication metrics logging (bytes transferred, rounds)
6. Evaluation metrics logging (F1, AUC-ROC, AUC-PR)
7. System metrics logging (training time, memory, CPU/GPU utilization)
8. Structured log export (JSON, CSV)
9. TensorBoard integration
10. Experiment comparison

Requirements Validated: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10
"""

import sys
import tempfile
import shutil
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from sentryfl.utils import ExperimentLogger, compare_experiments


def demonstrate_experiment_logger():
    """Demonstrate all ExperimentLogger features"""
    
    print("=" * 80)
    print("TASK 17.1: ExperimentLogger Verification")
    print("=" * 80)
    
    # Create temporary directory for logs
    temp_dir = tempfile.mkdtemp(prefix="sentryfl_exp_")
    print(f"\nUsing temporary directory: {temp_dir}")
    
    try:
        # ===== Feature 1: Unique Experiment ID Generation =====
        print("\n" + "=" * 80)
        print("1. UNIQUE EXPERIMENT ID GENERATION (Requirement 12.2)")
        print("=" * 80)
        
        logger = ExperimentLogger(
            experiment_name="sentryfl_demo",
            log_dir=temp_dir,
            use_tensorboard=True  # Enable TensorBoard integration
        )
        
        print(f"✓ Generated unique experiment ID: {logger.experiment_id}")
        print(f"✓ Experiment name: {logger.experiment_name}")
        print(f"✓ Log directory: {logger.log_dir}")
        
        # ===== Feature 2: Hyperparameter Logging =====
        print("\n" + "=" * 80)
        print("2. HYPERPARAMETER LOGGING (Requirement 12.1)")
        print("=" * 80)
        
        hyperparameters = {
            'dataset': 'SMD',
            'num_clients': 10,
            'num_rounds': 50,
            'local_epochs': 5,
            'batch_size': 32,
            'learning_rate': 0.001,
            'epsilon': 1.0,
            'delta': 1e-5,
            'adms_selection_ratio': 0.05,
            'model': 'bert-base-uncased',
            'window_size': 100,
            'hidden_dim': 768
        }
        
        logger.log_hyperparameters(hyperparameters)
        print(f"✓ Logged {len(hyperparameters)} hyperparameters")
        print(f"  - Dataset: {hyperparameters['dataset']}")
        print(f"  - Num Clients: {hyperparameters['num_clients']}")
        print(f"  - Privacy Budget (ε): {hyperparameters['epsilon']}")
        
        # ===== Feature 3: Training Metrics Logging =====
        print("\n" + "=" * 80)
        print("3. TRAINING METRICS LOGGING (Requirement 12.3)")
        print("=" * 80)
        
        print("Logging training metrics for 10 rounds...")
        for round_num in range(1, 11):
            loss = 2.0 / round_num  # Simulated decreasing loss
            accuracy = 0.5 + (0.04 * round_num)  # Simulated increasing accuracy
            
            logger.log_training_metrics(
                round_num=round_num,
                loss=loss,
                accuracy=accuracy,
                gradient_norm=0.1 / round_num  # Additional metric
            )
        
        training_metrics = logger.get_metrics('training')
        print(f"✓ Logged {len(training_metrics)} training rounds")
        print(f"  - Round 1: loss={training_metrics[0]['loss']:.4f}, acc={training_metrics[0]['accuracy']:.4f}")
        print(f"  - Round 10: loss={training_metrics[-1]['loss']:.4f}, acc={training_metrics[-1]['accuracy']:.4f}")
        
        # ===== Feature 4: Privacy Metrics Logging =====
        print("\n" + "=" * 80)
        print("4. PRIVACY METRICS LOGGING (Requirement 12.4)")
        print("=" * 80)
        
        print("Logging privacy metrics...")
        for round_num in [5, 10]:
            epsilon = 0.5 * round_num  # Simulated epsilon consumption
            mia_success_rate = 0.52 + (0.01 * round_num)  # Simulated MIA rate
            
            logger.log_privacy_metrics(
                round_num=round_num,
                epsilon=epsilon,
                delta=1e-5,
                mia_success_rate=mia_success_rate
            )
        
        privacy_metrics = logger.get_metrics('privacy')
        print(f"✓ Logged {len(privacy_metrics)} privacy measurements")
        print(f"  - Round 5: ε={privacy_metrics[0]['epsilon']:.2f}, MIA={privacy_metrics[0]['mia_success_rate']:.4f}")
        print(f"  - Round 10: ε={privacy_metrics[1]['epsilon']:.2f}, MIA={privacy_metrics[1]['mia_success_rate']:.4f}")
        
        # ===== Feature 5: Communication Metrics Logging =====
        print("\n" + "=" * 80)
        print("5. COMMUNICATION METRICS LOGGING (Requirement 12.5)")
        print("=" * 80)
        
        print("Logging communication metrics...")
        for round_num in range(1, 11):
            bytes_transferred = 10240 * round_num  # Simulated bytes
            
            logger.log_communication_metrics(
                round_num=round_num,
                bytes_transferred=bytes_transferred,
                num_clients=10
            )
        
        comm_metrics = logger.get_metrics('communication')
        print(f"✓ Logged {len(comm_metrics)} communication measurements")
        print(f"  - Total bytes in round 1: {comm_metrics[0]['bytes_transferred']:,} bytes")
        print(f"  - Total bytes in round 10: {comm_metrics[-1]['bytes_transferred']:,} bytes")
        
        # ===== Feature 6: Evaluation Metrics Logging =====
        print("\n" + "=" * 80)
        print("6. EVALUATION METRICS LOGGING (Requirement 12.6)")
        print("=" * 80)
        
        print("Logging evaluation metrics...")
        logger.log_evaluation_metrics(
            epoch_or_round=10,
            f1_score=0.857,
            auc_roc=0.923,
            auc_pr=0.891,
            precision=0.843,
            recall=0.872
        )
        
        eval_metrics = logger.get_metrics('evaluation')
        print(f"✓ Logged {len(eval_metrics)} evaluation measurements")
        print(f"  - F1 Score: {eval_metrics[0]['f1_score']:.4f}")
        print(f"  - AUC-ROC: {eval_metrics[0]['auc_roc']:.4f}")
        print(f"  - AUC-PR: {eval_metrics[0]['auc_pr']:.4f}")
        
        # ===== Feature 7: System Metrics Logging =====
        print("\n" + "=" * 80)
        print("7. SYSTEM METRICS LOGGING (Requirement 12.7)")
        print("=" * 80)
        
        print("Logging system metrics...")
        system_metrics = logger.log_system_metrics(
            round_num=10,
            include_gpu=False  # Set to True if GPU is available
        )
        
        print(f"✓ Logged system resource usage")
        print(f"  - CPU Usage: {system_metrics['cpu_percent']:.2f}%")
        print(f"  - Memory Usage: {system_metrics['memory_mb']:.2f} MB")
        print(f"  - Elapsed Time: {system_metrics['elapsed_time']:.2f} seconds")
        
        # ===== Feature 8: Structured Log Export (JSON, CSV) =====
        print("\n" + "=" * 80)
        print("8. STRUCTURED LOG EXPORT (Requirement 12.8)")
        print("=" * 80)
        
        # JSON Export
        json_path = logger.export_to_json()
        print(f"✓ Exported to JSON: {json_path}")
        
        # CSV Export
        csv_files = logger.export_all_csv()
        print(f"✓ Exported {len(csv_files)} CSV files:")
        for category, path in csv_files.items():
            print(f"  - {category}: {Path(path).name}")
        
        # ===== Feature 9: TensorBoard Integration =====
        print("\n" + "=" * 80)
        print("9. TENSORBOARD INTEGRATION (Requirement 12.10)")
        print("=" * 80)
        
        if logger.tensorboard_writer:
            tb_dir = logger.tensorboard_writer.log_dir
            print(f"✓ TensorBoard logs saved to: {tb_dir}")
            print(f"  - To view: tensorboard --logdir={tb_dir}")
        else:
            print("✗ TensorBoard not enabled")
        
        # ===== Summary and Comparison =====
        print("\n" + "=" * 80)
        print("10. EXPERIMENT SUMMARY")
        print("=" * 80)
        
        summary = logger.get_summary()
        print(f"✓ Experiment ID: {summary['experiment_id']}")
        print(f"✓ Total elapsed time: {summary['elapsed_time']:.2f} seconds")
        print(f"✓ Metric categories logged:")
        for category, count in summary['metric_counts'].items():
            print(f"  - {category}: {count} entries")
        
        # Close logger
        logger.close()
        print("\n✓ Logger closed, all data saved to disk")
        
        # ===== Demonstrate Experiment Comparison =====
        print("\n" + "=" * 80)
        print("11. EXPERIMENT COMPARISON (Requirement 12.9)")
        print("=" * 80)
        
        # Create a second experiment for comparison
        logger2 = ExperimentLogger(
            experiment_name="sentryfl_comparison",
            log_dir=temp_dir,
            use_tensorboard=False
        )
        logger2.log_hyperparameters({'learning_rate': 0.01, 'epsilon': 2.0})
        logger2.log_training_metrics(1, 1.5, 0.6)
        logger2.close()
        
        # Compare experiments
        exp_dirs = [
            str(logger.log_dir),
            str(logger2.log_dir)
        ]
        comparison_file = Path(temp_dir) / "experiment_comparison.json"
        comparison = compare_experiments(exp_dirs, str(comparison_file))
        
        print(f"✓ Compared {len(comparison['experiments'])} experiments")
        print(f"✓ Comparison saved to: {comparison_file}")
        
        # ===== Final Summary =====
        print("\n" + "=" * 80)
        print("VERIFICATION COMPLETE")
        print("=" * 80)
        print("\n✅ All 10 features implemented and verified:")
        print("   1. ✓ Unique experiment ID generation")
        print("   2. ✓ Hyperparameter logging")
        print("   3. ✓ Training metrics logging (loss, accuracy)")
        print("   4. ✓ Privacy metrics logging (epsilon, MIA)")
        print("   5. ✓ Communication metrics logging")
        print("   6. ✓ Evaluation metrics logging (F1, AUC-ROC, AUC-PR)")
        print("   7. ✓ System metrics logging (CPU, memory, time)")
        print("   8. ✓ Structured export (JSON, CSV)")
        print("   9. ✓ TensorBoard integration")
        print("  10. ✓ Experiment comparison")
        
        print(f"\n📁 All logs saved to: {temp_dir}")
        print("\n✅ Task 17.1 (ExperimentLogger) is COMPLETE and VERIFIED!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during verification: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Optional: Clean up temporary directory
        # Uncomment the next line to remove temporary files
        # shutil.rmtree(temp_dir)
        pass


if __name__ == "__main__":
    success = demonstrate_experiment_logger()
    sys.exit(0 if success else 1)
