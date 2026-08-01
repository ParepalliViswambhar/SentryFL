"""
Unit tests for Experiment Management Infrastructure.

Tests for:
- ExperimentLogger (experiment_logger.py)
- CheckpointManager (checkpoint_manager.py)

Validates Requirements: 12.1, 15.1, 15.4, 15.8
"""

import unittest
import tempfile
import shutil
import json
import os
from pathlib import Path

import torch
import torch.nn as nn

from sentryfl.utils.experiment_logger import ExperimentLogger, compare_experiments
from sentryfl.utils.checkpoint_manager import CheckpointManager, CheckpointError


class SimpleModel(nn.Module):
    """Simple model for testing"""
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(10, 5)
        self.fc2 = nn.Linear(5, 2)
    
    def forward(self, x):
        x = torch.relu(self.fc1(x))
        return self.fc2(x)


class TestExperimentLogger(unittest.TestCase):
    """Test ExperimentLogger functionality"""
    
    def setUp(self):
        """Set up temporary directory for tests"""
        self.temp_dir = tempfile.mkdtemp()
        self.logger = ExperimentLogger(
            experiment_name="test_experiment",
            log_dir=self.temp_dir,
            use_tensorboard=False  # Disable TensorBoard for testing
        )
    
    def tearDown(self):
        """Clean up temporary directory"""
        self.logger.close()
        shutil.rmtree(self.temp_dir)
    
    def test_experiment_id_uniqueness(self):
        """
        Test that experiment IDs are unique.
        
        Validates: Requirement 12.1 - Assign unique experiment IDs
        """
        logger1 = ExperimentLogger(log_dir=self.temp_dir, use_tensorboard=False)
        logger2 = ExperimentLogger(log_dir=self.temp_dir, use_tensorboard=False)
        
        self.assertNotEqual(logger1.experiment_id, logger2.experiment_id)
        self.assertIsInstance(logger1.experiment_id, str)
        self.assertGreater(len(logger1.experiment_id), 0)
        
        logger1.close()
        logger2.close()
    
    def test_hyperparameter_logging(self):
        """Test hyperparameter logging"""
        hparams = {
            'learning_rate': 0.001,
            'batch_size': 32,
            'epsilon': 1.0,
            'num_clients': 10
        }
        
        self.logger.log_hyperparameters(hparams)
        
        # Check that hyperparameters are stored
        self.assertEqual(self.logger.hyperparameters, hparams)
        
        # Check that hyperparameters file was created
        hparams_file = Path(self.temp_dir) / self.logger.experiment_name / "hyperparameters.json"
        self.assertTrue(hparams_file.exists())
        
        # Verify file contents
        with open(hparams_file, 'r') as f:
            loaded_hparams = json.load(f)
        self.assertEqual(loaded_hparams, hparams)
    
    def test_training_metrics_logging(self):
        """Test training metrics logging"""
        for round_num in range(1, 6):
            self.logger.log_training_metrics(
                round_num=round_num,
                loss=1.0 / round_num,
                accuracy=0.5 + 0.1 * round_num
            )
        
        # Verify metrics were logged
        training_metrics = self.logger.get_metrics('training')
        self.assertEqual(len(training_metrics), 5)
        
        # Check first metric
        first_metric = training_metrics[0]
        self.assertEqual(first_metric['round'], 1)
        self.assertEqual(first_metric['loss'], 1.0)
        self.assertEqual(first_metric['accuracy'], 0.6)
    
    def test_privacy_metrics_logging(self):
        """Test privacy metrics logging"""
        for round_num in range(1, 4):
            self.logger.log_privacy_metrics(
                round_num=round_num,
                epsilon=0.5 * round_num,
                delta=1e-5,
                mia_success_rate=0.52 + 0.01 * round_num
            )
        
        privacy_metrics = self.logger.get_metrics('privacy')
        self.assertEqual(len(privacy_metrics), 3)
        
        # Check last metric
        last_metric = privacy_metrics[-1]
        self.assertEqual(last_metric['round'], 3)
        self.assertEqual(last_metric['epsilon'], 1.5)
    
    def test_communication_metrics_logging(self):
        """Test communication metrics logging"""
        self.logger.log_communication_metrics(
            round_num=1,
            bytes_transferred=10240,
            num_clients=5
        )
        
        comm_metrics = self.logger.get_metrics('communication')
        self.assertEqual(len(comm_metrics), 1)
        self.assertEqual(comm_metrics[0]['bytes_transferred'], 10240)
    
    def test_evaluation_metrics_logging(self):
        """Test evaluation metrics logging"""
        self.logger.log_evaluation_metrics(
            epoch_or_round=10,
            f1_score=0.85,
            auc_roc=0.90,
            auc_pr=0.88,
            precision=0.83,
            recall=0.87
        )
        
        eval_metrics = self.logger.get_metrics('evaluation')
        self.assertEqual(len(eval_metrics), 1)
        
        metric = eval_metrics[0]
        self.assertEqual(metric['f1_score'], 0.85)
        self.assertEqual(metric['auc_roc'], 0.90)
    
    def test_system_metrics_logging(self):
        """Test system metrics logging"""
        system_metrics = self.logger.log_system_metrics(
            round_num=1,
            include_gpu=False
        )
        
        # Verify returned metrics
        self.assertIn('cpu_percent', system_metrics)
        self.assertIn('memory_mb', system_metrics)
        self.assertIn('elapsed_time', system_metrics)
        
        # Verify stored metrics
        stored_metrics = self.logger.get_metrics('system')
        self.assertEqual(len(stored_metrics), 1)
    
    def test_json_export(self):
        """Test JSON export functionality"""
        # Log some data
        self.logger.log_hyperparameters({'lr': 0.001})
        self.logger.log_training_metrics(1, 0.5, 0.8)
        
        # Export to JSON
        json_path = self.logger.export_to_json()
        
        # Verify file exists
        self.assertTrue(Path(json_path).exists())
        
        # Verify contents
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        self.assertIn('experiment_id', data)
        self.assertIn('hyperparameters', data)
        self.assertIn('metrics', data)
        self.assertEqual(data['hyperparameters']['lr'], 0.001)
    
    def test_csv_export(self):
        """Test CSV export functionality"""
        # Log training metrics
        for i in range(1, 4):
            self.logger.log_training_metrics(i, 1.0 / i, 0.5 + 0.1 * i)
        
        # Export to CSV
        csv_path = self.logger.export_to_csv('training')
        
        # Verify file exists
        self.assertTrue(Path(csv_path).exists())
        
        # Verify CSV can be read
        import csv
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['round'], '1')
    
    def test_export_all_csv(self):
        """Test exporting all metrics to CSV"""
        # Log various metrics
        self.logger.log_training_metrics(1, 0.5, 0.8)
        self.logger.log_privacy_metrics(1, 1.0, 1e-5)
        
        # Export all
        exported_files = self.logger.export_all_csv()
        
        # Verify both categories exported
        self.assertIn('training', exported_files)
        self.assertIn('privacy', exported_files)
        
        # Verify files exist
        for filepath in exported_files.values():
            self.assertTrue(Path(filepath).exists())
    
    def test_get_summary(self):
        """Test summary generation"""
        self.logger.log_hyperparameters({'lr': 0.001})
        self.logger.log_training_metrics(1, 0.5, 0.8)
        
        summary = self.logger.get_summary()
        
        self.assertIn('experiment_id', summary)
        self.assertIn('experiment_name', summary)
        self.assertIn('hyperparameters', summary)
        self.assertIn('metric_counts', summary)
        self.assertIn('latest_training', summary)
    
    def test_compare_experiments(self):
        """Test experiment comparison functionality"""
        # Create two experiments
        logger1 = ExperimentLogger(
            experiment_name="exp1",
            log_dir=self.temp_dir,
            use_tensorboard=False
        )
        logger1.log_hyperparameters({'lr': 0.001})
        logger1.log_training_metrics(1, 0.5, 0.8)
        logger1.close()
        
        logger2 = ExperimentLogger(
            experiment_name="exp2",
            log_dir=self.temp_dir,
            use_tensorboard=False
        )
        logger2.log_hyperparameters({'lr': 0.01})
        logger2.log_training_metrics(1, 0.3, 0.9)
        logger2.close()
        
        # Compare experiments
        exp_dirs = [
            str(Path(self.temp_dir) / logger1.experiment_name),
            str(Path(self.temp_dir) / logger2.experiment_name)
        ]
        
        comparison_file = os.path.join(self.temp_dir, "comparison.json")
        comparison = compare_experiments(exp_dirs, comparison_file)
        
        # Verify comparison
        self.assertEqual(len(comparison['experiments']), 2)
        self.assertTrue(Path(comparison_file).exists())


class TestCheckpointManager(unittest.TestCase):
    """Test CheckpointManager functionality"""
    
    def setUp(self):
        """Set up temporary directory and model for tests"""
        self.temp_dir = tempfile.mkdtemp()
        self.checkpoint_manager = CheckpointManager(
            checkpoint_dir=self.temp_dir,
            checkpoint_interval=5,
            max_checkpoints=3
        )
        self.model = SimpleModel()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
    
    def tearDown(self):
        """Clean up temporary directory"""
        shutil.rmtree(self.temp_dir)
    
    def test_checkpoint_save_and_load_roundtrip(self):
        """
        Test checkpoint save and load round-trip.
        
        Validates: Requirement 15.1 - Save and load checkpoints
        """
        # Save initial model state
        initial_state = self.model.state_dict()
        
        # Save checkpoint
        training_state = {
            'privacy_budget': {'epsilon': 1.0, 'delta': 1e-5},
            'some_other_state': 'value'
        }
        
        checkpoint_path = self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=5,
            training_state=training_state,
            validation_metric=0.85
        )
        
        self.assertTrue(Path(checkpoint_path).exists())
        
        # Modify model
        for param in self.model.parameters():
            param.data.fill_(999.0)
        
        # Load checkpoint
        loaded_state = self.checkpoint_manager.load_checkpoint(
            checkpoint_path=checkpoint_path,
            model=self.model,
            optimizer=self.optimizer
        )
        
        # Verify model state was restored
        restored_state = self.model.state_dict()
        for key in initial_state:
            self.assertTrue(torch.allclose(initial_state[key], restored_state[key]))
        
        # Verify training state was restored
        self.assertEqual(loaded_state['round_num'], 5)
        self.assertEqual(loaded_state['validation_metric'], 0.85)
        self.assertIn('privacy_budget', loaded_state)
    
    def test_checkpoint_integrity_validation(self):
        """
        Test checkpoint integrity validation.
        
        Validates: Requirement 15.4 - Validate checkpoint integrity before loading
        """
        # Save checkpoint
        checkpoint_path = self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=1,
            training_state={}
        )
        
        # Validate checkpoint
        is_valid = self.checkpoint_manager.validate_checkpoint(checkpoint_path)
        self.assertTrue(is_valid)
        
        # Corrupt checkpoint by modifying file
        with open(checkpoint_path, 'ab') as f:
            f.write(b'corrupted_data')
        
        # Validation should fail
        is_valid = self.checkpoint_manager.validate_checkpoint(checkpoint_path)
        self.assertFalse(is_valid)
    
    def test_checkpoint_interval(self):
        """Test checkpoint saving at specified intervals"""
        # Checkpoint interval is 5
        self.assertTrue(self.checkpoint_manager.should_save_checkpoint(5))
        self.assertTrue(self.checkpoint_manager.should_save_checkpoint(10))
        self.assertFalse(self.checkpoint_manager.should_save_checkpoint(3))
        self.assertFalse(self.checkpoint_manager.should_save_checkpoint(7))
    
    def test_best_model_tracking(self):
        """Test best model tracking based on validation metric"""
        # Save checkpoints with different metrics
        self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=5,
            training_state={},
            validation_metric=0.75
        )
        
        self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=10,
            training_state={},
            validation_metric=0.90  # Best
        )
        
        self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=15,
            training_state={},
            validation_metric=0.80
        )
        
        # Verify best checkpoint exists
        best_checkpoint_path = Path(self.temp_dir) / "best_model.pt"
        self.assertTrue(best_checkpoint_path.exists())
        
        # Verify best metric value
        self.assertEqual(self.checkpoint_manager.best_metric_value, 0.90)
        
        # Load best checkpoint
        best_state = self.checkpoint_manager.load_best_checkpoint(self.model, self.optimizer)
        self.assertIsNotNone(best_state)
    
    def test_training_resume_from_checkpoint(self):
        """
        Test training resume from checkpoint.
        
        Validates: Requirement 15.8 - Resume training from checkpoint
        """
        # Save multiple checkpoints
        for round_num in [5, 10, 15]:
            self.checkpoint_manager.save_checkpoint(
                model=self.model,
                optimizer=self.optimizer,
                round_num=round_num,
                training_state={'round': round_num}
            )
        
        # Load latest checkpoint
        latest_state = self.checkpoint_manager.load_latest_checkpoint(
            self.model,
            self.optimizer
        )
        
        self.assertIsNotNone(latest_state)
        self.assertEqual(latest_state['round_num'], 15)
    
    def test_cross_platform_compatibility(self):
        """
        Test cross-platform checkpoint compatibility (GPU/CPU).
        
        Validates: Requirement 15.10 - Cross-platform checkpoint compatibility
        """
        # Save checkpoint
        checkpoint_path = self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=1,
            training_state={}
        )
        
        # Load on CPU (regardless of training device)
        cpu_device = torch.device('cpu')
        loaded_state = self.checkpoint_manager.load_checkpoint(
            checkpoint_path=checkpoint_path,
            model=self.model,
            optimizer=self.optimizer,
            device=cpu_device
        )
        
        self.assertIsNotNone(loaded_state)
        
        # Verify model is on CPU
        for param in self.model.parameters():
            self.assertEqual(param.device.type, 'cpu')
    
    def test_corrupted_checkpoint_handling(self):
        """
        Test corrupted checkpoint error handling.
        
        Validates: Requirement 15.9 - Handle corrupted checkpoints
        """
        # Create a corrupted checkpoint file
        corrupted_path = os.path.join(self.temp_dir, "corrupted.pt")
        with open(corrupted_path, 'w') as f:
            f.write("not a valid checkpoint")
        
        # Attempt to load should raise CheckpointError
        with self.assertRaises(CheckpointError):
            self.checkpoint_manager.load_checkpoint(
                checkpoint_path=corrupted_path,
                model=self.model
            )
    
    def test_max_checkpoints_cleanup(self):
        """Test cleanup of old checkpoints when limit exceeded"""
        # Save more checkpoints than max_checkpoints (3)
        for round_num in [5, 10, 15, 20, 25]:
            self.checkpoint_manager.save_checkpoint(
                model=self.model,
                optimizer=self.optimizer,
                round_num=round_num,
                training_state={}
            )
        
        # Should only keep 3 most recent checkpoints
        checkpoints = self.checkpoint_manager.list_checkpoints()
        self.assertLessEqual(len(checkpoints), 3)
        
        # Verify most recent are kept
        round_nums = [cp['round_num'] for cp in checkpoints]
        self.assertIn(25, round_nums)
        self.assertIn(20, round_nums)
    
    def test_checkpoint_info(self):
        """Test checkpoint information retrieval"""
        # Save checkpoint
        self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=5,
            training_state={}
        )
        
        # Get info
        info = self.checkpoint_manager.get_checkpoint_info()
        
        self.assertIn('checkpoint_dir', info)
        self.assertIn('num_checkpoints', info)
        self.assertIn('checkpoint_interval', info)
        self.assertEqual(info['checkpoint_interval'], 5)
        self.assertEqual(info['num_checkpoints'], 1)
    
    def test_list_checkpoints(self):
        """Test listing all checkpoints"""
        # Save checkpoints
        for round_num in [5, 10, 15]:
            self.checkpoint_manager.save_checkpoint(
                model=self.model,
                optimizer=self.optimizer,
                round_num=round_num,
                training_state={}
            )
        
        # List checkpoints
        checkpoints = self.checkpoint_manager.list_checkpoints()
        
        self.assertEqual(len(checkpoints), 3)
        # Should be sorted by round number
        self.assertEqual(checkpoints[0]['round_num'], 5)
        self.assertEqual(checkpoints[2]['round_num'], 15)
    
    def test_delete_checkpoint(self):
        """Test deleting specific checkpoint"""
        # Save checkpoints
        self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=5,
            training_state={}
        )
        
        self.checkpoint_manager.save_checkpoint(
            model=self.model,
            optimizer=self.optimizer,
            round_num=10,
            training_state={}
        )
        
        # Delete one checkpoint
        success = self.checkpoint_manager.delete_checkpoint(5)
        self.assertTrue(success)
        
        # Verify only one checkpoint remains
        checkpoints = self.checkpoint_manager.list_checkpoints()
        self.assertEqual(len(checkpoints), 1)
        self.assertEqual(checkpoints[0]['round_num'], 10)
    
    def test_clear_all_checkpoints(self):
        """Test clearing all checkpoints"""
        # Save checkpoints
        for round_num in [5, 10, 15]:
            self.checkpoint_manager.save_checkpoint(
                model=self.model,
                optimizer=self.optimizer,
                round_num=round_num,
                training_state={},
                validation_metric=0.8 if round_num == 10 else 0.7,
                is_best=(round_num == 10)
            )
        
        # Clear all except best
        self.checkpoint_manager.clear_all_checkpoints(keep_best=True)
        
        # Should only have best checkpoint
        checkpoints = self.checkpoint_manager.list_checkpoints()
        self.assertEqual(len(checkpoints), 1)
        self.assertTrue(checkpoints[0]['is_best'])


def run_tests():
    """Run all unit tests"""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add tests
    suite.addTests(loader.loadTestsFromTestCase(TestExperimentLogger))
    suite.addTests(loader.loadTestsFromTestCase(TestCheckpointManager))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)
