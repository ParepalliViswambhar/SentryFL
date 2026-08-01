"""
Unit Tests for Ablation Study and Baseline Model Systems

Tests ablation configurations, baseline implementations, and statistical
significance computation.

Requirements: 16.6, 17.5, 17.10
"""

import unittest
import torch
import torch.nn as nn
import tempfile
import shutil
from pathlib import Path
import json
import numpy as np

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


class SimpleTestModel(nn.Module):
    """Simple model for testing"""
    def __init__(self, input_dim=10, hidden_dim=20, output_dim=1):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, output_dim)
        self.relu = nn.ReLU()
    
    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.fc2(x)
        return x


class TestAblationStudyRunner(unittest.TestCase):
    """Test cases for AblationStudyRunner"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        
        # Create test configuration
        self.full_config = {
            'model': {'hidden_dim': 768, 'freeze_backbone': True},
            'training': {'num_rounds': 10, 'batch_size': 32},
            'privacy': {'enabled': True, 'epsilon': 1.0},
            'federated': {'num_clients': 5, 'byzantine_robust': True, 'aggregation': 'trimmed_mean'},
            'parameter_efficiency': {'adms_enabled': True, 'selection_ratio': 0.05},
            'optimization': {
                'knowledge_distillation_enabled': True,
                'quantization_enabled': True
            },
            'experiment': {'name': 'test_experiment'}
        }
        
        self.runner = AblationStudyRunner(
            full_system_config=self.full_config,
            output_dir=self.temp_dir
        )
    
    def tearDown(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir)
    
    def test_initialization(self):
        """Test ablation runner initialization"""
        self.assertIsNotNone(self.runner)
        self.assertEqual(len(self.runner.ablation_configs), 6)  # 1 full + 5 ablations
        self.assertTrue(self.runner.output_dir.exists())
    
    def test_ablation_configurations_defined(self):
        """Test that all ablation configurations are properly defined"""
        config_names = [c.name for c in self.runner.ablation_configs]
        
        expected_names = [
            'full_system',
            'without_adms',
            'without_dp',
            'without_kd',
            'without_quantization',
            'fedavg_only'
        ]
        
        for expected_name in expected_names:
            self.assertIn(expected_name, config_names)
    
    def test_ablation_config_disables_correct_components(self):
        """Test ablation configurations disable correct components (Req 16.6)"""
        configs = self.runner.ablation_configs
        
        # Test full system
        full_system = next(c for c in configs if c.name == 'full_system')
        self.assertTrue(full_system.adms_enabled)
        self.assertTrue(full_system.privacy_enabled)
        self.assertTrue(full_system.knowledge_distillation_enabled)
        self.assertTrue(full_system.quantization_enabled)
        self.assertTrue(full_system.byzantine_robust)
        
        # Test without ADMS
        without_adms = next(c for c in configs if c.name == 'without_adms')
        self.assertFalse(without_adms.adms_enabled)
        self.assertTrue(without_adms.privacy_enabled)
        
        # Test without DP
        without_dp = next(c for c in configs if c.name == 'without_dp')
        self.assertTrue(without_dp.adms_enabled)
        self.assertFalse(without_dp.privacy_enabled)
        
        # Test without KD
        without_kd = next(c for c in configs if c.name == 'without_kd')
        self.assertFalse(without_kd.knowledge_distillation_enabled)
        
        # Test without Quantization
        without_quant = next(c for c in configs if c.name == 'without_quantization')
        self.assertFalse(without_quant.quantization_enabled)
        
        # Test FedAvg only (no Byzantine robustness)
        fedavg_only = next(c for c in configs if c.name == 'fedavg_only')
        self.assertFalse(fedavg_only.byzantine_robust)
    
    def test_create_ablation_config(self):
        """Test creation of ablation training configuration"""
        ablation_config = AblationConfiguration(
            name='test_ablation',
            description='Test ablation',
            adms_enabled=False,
            privacy_enabled=True,
            knowledge_distillation_enabled=True,
            quantization_enabled=True,
            byzantine_robust=True
        )
        
        config = self.runner.create_ablation_config(ablation_config)
        
        # Verify ADMS is disabled
        self.assertFalse(config['parameter_efficiency']['adms_enabled'])
        
        # Verify other components remain enabled
        self.assertTrue(config['privacy']['enabled'])
        self.assertTrue(config['optimization']['knowledge_distillation_enabled'])
        self.assertTrue(config['optimization']['quantization_enabled'])
        self.assertTrue(config['federated']['byzantine_robust'])
        
        # Verify config file is saved
        config_path = Path(self.temp_dir) / 'test_ablation_config.json'
        self.assertTrue(config_path.exists())
    
    def test_ablation_results_dataclass(self):
        """Test AblationResults dataclass"""
        results = AblationResults(
            config_name='test_ablation',
            f1_score=0.85,
            auc_roc=0.90,
            auc_pr=0.88,
            precision=0.86,
            recall=0.84,
            communication_cost_mb=50.0,
            model_size_mb=100.0,
            inference_latency_ms=15.0,
            training_time_seconds=600.0,
            privacy_epsilon=1.0
        )
        
        # Test conversion to dictionary
        results_dict = results.to_dict()
        self.assertEqual(results_dict['config_name'], 'test_ablation')
        self.assertEqual(results_dict['f1_score'], 0.85)
        self.assertEqual(results_dict['privacy_epsilon'], 1.0)
    
    def test_run_ablation_with_mock_functions(self):
        """Test running ablation with mock train/evaluate functions"""
        # Mock training function
        def mock_train_fn(config, **kwargs):
            model = SimpleTestModel()
            training_info = {
                'communication_cost_mb': 50.0,
                'model_size_mb': 100.0,
                'privacy_epsilon': 1.0 if config['privacy']['enabled'] else None
            }
            return model, training_info
        
        # Mock evaluation function
        def mock_evaluate_fn(model):
            return {
                'f1': 0.85,
                'auc_roc': 0.90,
                'auc_pr': 0.88,
                'precision': 0.86,
                'recall': 0.84,
                'inference_latency_ms': 15.0
            }
        
        # Run single ablation
        ablation_config = self.runner.ablation_configs[0]  # full_system
        results = self.runner.run_ablation(
            ablation_config=ablation_config,
            train_fn=mock_train_fn,
            evaluate_fn=mock_evaluate_fn
        )
        
        # Verify results
        self.assertEqual(results.config_name, 'full_system')
        self.assertAlmostEqual(results.f1_score, 0.85)
        self.assertAlmostEqual(results.auc_roc, 0.90)
        self.assertGreater(results.training_time_seconds, 0)
        
        # Verify results file is saved
        results_path = Path(self.temp_dir) / 'full_system_results.json'
        self.assertTrue(results_path.exists())
    
    def test_generate_comparison_table(self):
        """Test generation of ablation comparison table"""
        # Create mock results
        mock_results = [
            AblationResults(
                config_name='full_system',
                f1_score=0.90, auc_roc=0.92, auc_pr=0.91,
                precision=0.91, recall=0.89,
                communication_cost_mb=50.0, model_size_mb=100.0,
                inference_latency_ms=15.0, training_time_seconds=600.0
            ),
            AblationResults(
                config_name='without_adms',
                f1_score=0.88, auc_roc=0.90, auc_pr=0.89,
                precision=0.89, recall=0.87,
                communication_cost_mb=200.0, model_size_mb=100.0,
                inference_latency_ms=15.0, training_time_seconds=700.0
            ),
            AblationResults(
                config_name='without_dp',
                f1_score=0.91, auc_roc=0.93, auc_pr=0.92,
                precision=0.92, recall=0.90,
                communication_cost_mb=50.0, model_size_mb=100.0,
                inference_latency_ms=15.0, training_time_seconds=550.0
            )
        ]
        
        # Generate comparison table
        df = self.runner.generate_comparison_table(mock_results)
        
        # Verify table properties
        self.assertEqual(len(df), 3)
        self.assertIn('config_name', df.columns)
        self.assertIn('f1_score', df.columns)
        self.assertIn('f1_degradation_%', df.columns)
        
        # Verify CSV is saved
        table_path = Path(self.temp_dir) / 'ablation_comparison_table.csv'
        self.assertTrue(table_path.exists())
    
    def test_compute_component_contributions(self):
        """Test computation of component contributions"""
        # Create mock results with full system and ablations
        mock_results = [
            AblationResults(
                config_name='full_system',
                f1_score=0.90, auc_roc=0.92, auc_pr=0.91,
                precision=0.91, recall=0.89,
                communication_cost_mb=50.0, model_size_mb=100.0,
                inference_latency_ms=15.0, training_time_seconds=600.0
            ),
            AblationResults(
                config_name='without_adms',
                f1_score=0.85, auc_roc=0.88, auc_pr=0.87,
                precision=0.86, recall=0.84,
                communication_cost_mb=200.0, model_size_mb=100.0,
                inference_latency_ms=20.0, training_time_seconds=700.0
            )
        ]
        
        # Compute contributions
        contributions = self.runner.compute_component_contributions(mock_results)
        
        # Verify ADMS contribution
        self.assertIn('ADMS', contributions)
        adms_contrib = contributions['ADMS']
        
        # ADMS improves F1 score
        self.assertAlmostEqual(adms_contrib['f1_contribution'], 0.05)
        
        # ADMS reduces communication cost (negative because without_adms has higher cost)
        self.assertAlmostEqual(adms_contrib['communication_savings'], -150.0)


class TestBaselineModelRunner(unittest.TestCase):
    """Test cases for BaselineModelRunner"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        
        # Create test configuration
        self.base_config = {
            'model': {'hidden_dim': 768},
            'training': {'num_rounds': 10, 'batch_size': 32},
            'privacy': {'enabled': False},
            'federated': {'num_clients': 5, 'byzantine_robust': False},
            'parameter_efficiency': {'adms_enabled': True},
            'optimization': {
                'knowledge_distillation_enabled': False,
                'quantization_enabled': False
            },
            'experiment': {'name': 'test_baseline'}
        }
        
        # Mock test data
        self.test_data = torch.randn(100, 10)
        
        self.runner = BaselineModelRunner(
            base_config=self.base_config,
            test_data=self.test_data,
            output_dir=self.temp_dir
        )
    
    def tearDown(self):
        """Clean up test fixtures"""
        shutil.rmtree(self.temp_dir)
    
    def test_initialization(self):
        """Test baseline runner initialization"""
        self.assertIsNotNone(self.runner)
        self.assertEqual(len(self.runner.baseline_configs), 4)  # 4 baselines
        self.assertTrue(self.runner.output_dir.exists())
    
    def test_baseline_configurations_defined(self):
        """Test that all baseline configurations are properly defined"""
        config_names = [c.name for c in self.runner.baseline_configs]
        
        expected_names = ['pefad', 'centralized', 'local_only', 'fedavg']
        
        for expected_name in expected_names:
            self.assertIn(expected_name, config_names)
    
    def test_baseline_implementations_properties(self):
        """Test baseline implementations have correct properties (Req 17.5)"""
        configs = self.runner.baseline_configs
        
        # Test PeFAD baseline
        pefad = next(c for c in configs if c.name == 'pefad')
        self.assertTrue(pefad.is_federated)
        self.assertFalse(pefad.uses_privacy)
        self.assertTrue(pefad.uses_parameter_efficiency)
        self.assertFalse(pefad.uses_byzantine_robustness)
        
        # Test Centralized baseline
        centralized = next(c for c in configs if c.name == 'centralized')
        self.assertFalse(centralized.is_federated)
        self.assertFalse(centralized.uses_privacy)
        self.assertFalse(centralized.uses_parameter_efficiency)
        
        # Test Local-only baseline
        local_only = next(c for c in configs if c.name == 'local_only')
        self.assertFalse(local_only.is_federated)
        self.assertFalse(local_only.uses_privacy)
        
        # Test FedAvg baseline
        fedavg = next(c for c in configs if c.name == 'fedavg')
        self.assertTrue(fedavg.is_federated)
        self.assertFalse(fedavg.uses_parameter_efficiency)
    
    def test_create_baseline_config(self):
        """Test creation of baseline training configuration"""
        baseline_config = BaselineConfiguration(
            name='pefad',
            description='PeFAD baseline',
            is_federated=True,
            uses_privacy=False,
            uses_parameter_efficiency=True,
            uses_byzantine_robustness=False
        )
        
        config = self.runner.create_baseline_config(baseline_config)
        
        # Verify PeFAD settings
        self.assertTrue(config['parameter_efficiency']['adms_enabled'])
        self.assertFalse(config['privacy']['enabled'])
        self.assertFalse(config['federated']['byzantine_robust'])
        self.assertEqual(config['federated']['aggregation'], 'fedavg')
        
        # Verify config file is saved
        config_path = Path(self.temp_dir) / 'pefad_config.json'
        self.assertTrue(config_path.exists())
    
    def test_baseline_results_dataclass(self):
        """Test BaselineResults dataclass"""
        results = BaselineResults(
            baseline_name='pefad',
            f1_score=0.85,
            auc_roc=0.90,
            auc_pr=0.88,
            precision=0.86,
            recall=0.84,
            accuracy=0.87,
            communication_cost_mb=50.0,
            model_size_mb=100.0,
            inference_latency_ms=15.0,
            training_time_seconds=600.0,
            privacy_epsilon=None
        )
        
        # Test conversion to dictionary
        results_dict = results.to_dict()
        self.assertEqual(results_dict['baseline_name'], 'pefad')
        self.assertEqual(results_dict['f1_score'], 0.85)
        self.assertIsNone(results_dict['privacy_epsilon'])
    
    def test_run_baseline_with_mock_functions(self):
        """Test running baseline with mock train/evaluate functions"""
        # Mock training function
        def mock_train_fn(config, **kwargs):
            model = SimpleTestModel()
            training_info = {
                'communication_cost_mb': 100.0,
                'model_size_mb': 150.0
            }
            return model, training_info
        
        # Mock evaluation function
        def mock_evaluate_fn(model, test_data):
            return {
                'f1': 0.80,
                'auc_roc': 0.85,
                'auc_pr': 0.82,
                'precision': 0.81,
                'recall': 0.79,
                'accuracy': 0.83,
                'inference_latency_ms': 20.0
            }
        
        # Run single baseline
        baseline_config = self.runner.baseline_configs[0]  # pefad
        results = self.runner.run_baseline(
            baseline_config=baseline_config,
            train_fn=mock_train_fn,
            evaluate_fn=mock_evaluate_fn
        )
        
        # Verify results
        self.assertEqual(results.baseline_name, 'pefad')
        self.assertAlmostEqual(results.f1_score, 0.80)
        self.assertAlmostEqual(results.auc_roc, 0.85)
        self.assertGreaterEqual(results.training_time_seconds, 0)
        
        # Verify results file is saved
        results_path = Path(self.temp_dir) / 'pefad_results.json'
        self.assertTrue(results_path.exists())
    
    def test_compute_statistical_significance(self):
        """Test statistical significance computation (Req 17.10)"""
        # Create sample data with significant difference
        sentryfl_scores = [0.90, 0.91, 0.89, 0.92, 0.90]
        baseline_scores = [0.80, 0.81, 0.79, 0.82, 0.80]
        
        # Test t-test
        statistic, p_value, is_significant = self.runner.compute_statistical_significance(
            sentryfl_scores=sentryfl_scores,
            baseline_scores=baseline_scores,
            test_name='t-test'
        )
        
        # Verify significance (SentryFL is significantly better)
        self.assertLess(p_value, 0.05)
        self.assertTrue(is_significant)
        
        # Test Wilcoxon test (note: Wilcoxon may be less powerful with small samples)
        statistic_w, p_value_w, is_significant_w = self.runner.compute_statistical_significance(
            sentryfl_scores=sentryfl_scores,
            baseline_scores=baseline_scores,
            test_name='wilcoxon'
        )
        
        # Verify test completed (p-value may vary with Wilcoxon on small samples)
        self.assertIsNotNone(p_value_w)
        self.assertIn(type(is_significant_w).__name__, ['bool', 'bool_'])
    
    def test_statistical_significance_no_difference(self):
        """Test statistical significance with no real difference"""
        # Create sample data with no significant difference
        sentryfl_scores = [0.85, 0.86, 0.84, 0.85, 0.86]
        baseline_scores = [0.85, 0.85, 0.86, 0.84, 0.85]
        
        statistic, p_value, is_significant = self.runner.compute_statistical_significance(
            sentryfl_scores=sentryfl_scores,
            baseline_scores=baseline_scores,
            test_name='t-test'
        )
        
        # Verify no significance
        self.assertGreater(p_value, 0.05)
        self.assertFalse(is_significant)
    
    def test_generate_comparison_table(self):
        """Test generation of baseline comparison table"""
        # Create mock baseline results
        mock_baselines = [
            BaselineResults(
                baseline_name='pefad',
                f1_score=0.85, auc_roc=0.88, auc_pr=0.86,
                precision=0.86, recall=0.84, accuracy=0.87,
                communication_cost_mb=100.0, model_size_mb=150.0,
                inference_latency_ms=20.0, training_time_seconds=600.0
            ),
            BaselineResults(
                baseline_name='fedavg',
                f1_score=0.82, auc_roc=0.85, auc_pr=0.83,
                precision=0.83, recall=0.81, accuracy=0.84,
                communication_cost_mb=200.0, model_size_mb=150.0,
                inference_latency_ms=20.0, training_time_seconds=650.0
            )
        ]
        
        # Create mock SentryFL results
        sentryfl_results = BaselineResults(
            baseline_name='sentryfl',
            f1_score=0.90, auc_roc=0.92, auc_pr=0.91,
            precision=0.91, recall=0.89, accuracy=0.92,
            communication_cost_mb=50.0, model_size_mb=100.0,
            inference_latency_ms=15.0, training_time_seconds=550.0
        )
        
        # Generate comparison table
        df = self.runner.generate_comparison_table(mock_baselines, sentryfl_results)
        
        # Verify table properties
        self.assertEqual(len(df), 3)  # 2 baselines + SentryFL
        self.assertIn('baseline_name', df.columns)
        self.assertIn('f1_score', df.columns)
        self.assertIn('f1_vs_sentryfl_%', df.columns)
        
        # Verify CSV is saved
        table_path = Path(self.temp_dir) / 'baseline_comparison_table.csv'
        self.assertTrue(table_path.exists())
    
    def test_compare_communication_costs(self):
        """Test communication cost comparison"""
        mock_baselines = [
            BaselineResults(
                baseline_name='pefad',
                f1_score=0.85, auc_roc=0.88, auc_pr=0.86,
                precision=0.86, recall=0.84, accuracy=0.87,
                communication_cost_mb=100.0, model_size_mb=150.0,
                inference_latency_ms=20.0, training_time_seconds=600.0
            )
        ]
        
        sentryfl_results = BaselineResults(
            baseline_name='sentryfl',
            f1_score=0.90, auc_roc=0.92, auc_pr=0.91,
            precision=0.91, recall=0.89, accuracy=0.92,
            communication_cost_mb=50.0, model_size_mb=100.0,
            inference_latency_ms=15.0, training_time_seconds=550.0
        )
        
        comparisons = self.runner.compare_communication_costs(mock_baselines, sentryfl_results)
        
        # Verify comparisons
        self.assertIn('pefad', comparisons)
        self.assertIn('pefad_reduction_%', comparisons)
        self.assertIn('sentryfl', comparisons)
        
        # Verify reduction calculation
        expected_reduction = (100.0 - 50.0) / 100.0 * 100
        self.assertAlmostEqual(comparisons['pefad_reduction_%'], expected_reduction)


def run_tests():
    """Run all tests"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test cases
    suite.addTests(loader.loadTestsFromTestCase(TestAblationStudyRunner))
    suite.addTests(loader.loadTestsFromTestCase(TestBaselineModelRunner))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)
