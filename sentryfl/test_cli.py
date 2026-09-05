"""
Unit tests for SentryFL CLI module

Tests configuration loading, override parsing, and command-line argument parsing.

Validates Requirements: 14.4, 14.8, 20.4
"""

import unittest
import tempfile
import os
from pathlib import Path
import yaml
import argparse

from sentryfl.cli import (
    load_config,
    parse_overrides,
    create_parser
)


class TestCLIConfigurationLoading(unittest.TestCase):
    """Test configuration loading and override functionality."""
    
    def setUp(self):
        """Create temporary config file for testing."""
        self.temp_dir = tempfile.mkdtemp()
        self.config_path = os.path.join(self.temp_dir, 'test_config.yaml')
        
        # Create test configuration
        self.test_config = {
            'experiment': {
                'name': 'test_experiment',
                'output_dir': './test_output',
                'seed': 42
            },
            'training': {
                'num_rounds': 10,
                'batch_size': 32,
                'learning_rate': 0.001
            },
            'privacy': {
                'enabled': True,
                'epsilon': 1.0,
                'delta': 1e-5
            }
        }
        
        with open(self.config_path, 'w') as f:
            yaml.dump(self.test_config, f)
    
    def tearDown(self):
        """Clean up temporary files."""
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def test_load_config_basic(self):
        """Test basic configuration loading without overrides."""
        config = load_config(self.config_path)
        
        self.assertEqual(config['experiment']['name'], 'test_experiment')
        self.assertEqual(config['training']['num_rounds'], 10)
        self.assertEqual(config['privacy']['epsilon'], 1.0)
    
    def test_load_config_with_overrides(self):
        """Test configuration loading with command-line overrides."""
        overrides = {
            'training.num_rounds': 20,
            'privacy.epsilon': 0.5,
            'experiment.seed': 123
        }
        
        config = load_config(self.config_path, overrides)
        
        # Check overrides were applied
        self.assertEqual(config['training']['num_rounds'], 20)
        self.assertEqual(config['privacy']['epsilon'], 0.5)
        self.assertEqual(config['experiment']['seed'], 123)
        
        # Check non-overridden values remain unchanged
        self.assertEqual(config['training']['batch_size'], 32)
        self.assertEqual(config['privacy']['enabled'], True)
    
    def test_load_config_nested_override_creation(self):
        """Test that overrides can create new nested keys."""
        overrides = {
            'new_section.new_param': 100
        }
        
        config = load_config(self.config_path, overrides)
        
        self.assertIn('new_section', config)
        self.assertEqual(config['new_section']['new_param'], 100)


class TestOverrideParsing(unittest.TestCase):
    """Test command-line override parsing."""
    
    def test_parse_overrides_empty(self):
        """Test parsing with no overrides."""
        result = parse_overrides(None)
        self.assertEqual(result, {})
        
        result = parse_overrides([])
        self.assertEqual(result, {})
    
    def test_parse_overrides_integers(self):
        """Test parsing integer values."""
        overrides = ['training.num_rounds=50', 'training.batch_size=64']
        result = parse_overrides(overrides)
        
        self.assertEqual(result['training.num_rounds'], 50)
        self.assertEqual(result['training.batch_size'], 64)
        self.assertIsInstance(result['training.num_rounds'], int)
    
    def test_parse_overrides_floats(self):
        """Test parsing float values."""
        overrides = ['privacy.epsilon=0.5', 'training.learning_rate=0.001']
        result = parse_overrides(overrides)
        
        self.assertEqual(result['privacy.epsilon'], 0.5)
        self.assertEqual(result['training.learning_rate'], 0.001)
        self.assertIsInstance(result['privacy.epsilon'], float)
    
    def test_parse_overrides_booleans(self):
        """Test parsing boolean values."""
        overrides = ['privacy.enabled=true', 'data.normalize=false']
        result = parse_overrides(overrides)
        
        self.assertEqual(result['privacy.enabled'], True)
        self.assertEqual(result['data.normalize'], False)
        self.assertIsInstance(result['privacy.enabled'], bool)
    
    def test_parse_overrides_strings(self):
        """Test parsing string values."""
        overrides = ['data.dataset=SMD', 'experiment.name=my_experiment']
        result = parse_overrides(overrides)
        
        self.assertEqual(result['data.dataset'], 'SMD')
        self.assertEqual(result['experiment.name'], 'my_experiment')
        self.assertIsInstance(result['data.dataset'], str)
    
    def test_parse_overrides_mixed_types(self):
        """Test parsing mixed type values."""
        overrides = [
            'training.num_rounds=100',
            'privacy.epsilon=1.5',
            'privacy.enabled=true',
            'experiment.name=test'
        ]
        result = parse_overrides(overrides)
        
        self.assertEqual(result['training.num_rounds'], 100)
        self.assertEqual(result['privacy.epsilon'], 1.5)
        self.assertEqual(result['privacy.enabled'], True)
        self.assertEqual(result['experiment.name'], 'test')
    
    def test_parse_overrides_invalid_format(self):
        """Test that invalid override format is handled gracefully."""
        overrides = ['invalid_override', 'valid.key=value']
        result = parse_overrides(overrides)
        
        # Invalid override should be ignored
        self.assertNotIn('invalid_override', result)
        # Valid override should be parsed
        self.assertEqual(result['valid.key'], 'value')
    
    def test_parse_overrides_with_equals_in_value(self):
        """Test parsing overrides where value contains '='."""
        overrides = ['experiment.note=epsilon=0.5']
        result = parse_overrides(overrides)
        
        # Should split only on first '='
        self.assertEqual(result['experiment.note'], 'epsilon=0.5')


class TestCLIArgumentParsing(unittest.TestCase):
    """Test argument parser creation and parsing."""
    
    def setUp(self):
        """Create parser for testing."""
        self.parser = create_parser()
    
    def test_parser_help_exists(self):
        """Test that parser has help documentation."""
        # This should not raise an error
        help_text = self.parser.format_help()
        self.assertIn('SentryFL', help_text)
    
    def test_train_command_required_args(self):
        """Test train command with required arguments."""
        args = self.parser.parse_args([
            'train',
            '--config', 'config.yaml',
            '--data-path', './data/SMD'
        ])
        
        self.assertEqual(args.command, 'train')
        self.assertEqual(args.config, 'config.yaml')
        self.assertEqual(args.data_path, './data/SMD')
    
    def test_train_command_with_overrides(self):
        """Test train command with configuration overrides."""
        args = self.parser.parse_args([
            'train',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--override', 'privacy.epsilon=0.5', 'training.num_rounds=50'
        ])
        
        self.assertEqual(args.command, 'train')
        self.assertEqual(args.override, ['privacy.epsilon=0.5', 'training.num_rounds=50'])
    
    def test_train_command_with_device(self):
        """Test train command with device specification."""
        args = self.parser.parse_args([
            'train',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--device', 'cuda'
        ])
        
        self.assertEqual(args.device, 'cuda')
    
    def test_train_command_with_resume(self):
        """Test train command with checkpoint resume."""
        args = self.parser.parse_args([
            'train',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--resume-from', './checkpoints/round_30.pt'
        ])
        
        self.assertEqual(args.resume_from, './checkpoints/round_30.pt')
    
    def test_evaluate_command_required_args(self):
        """Test evaluate command with required arguments."""
        args = self.parser.parse_args([
            'evaluate',
            '--model-path', 'model.pt',
            '--config', 'config.yaml',
            '--data-path', './data/SMD'
        ])
        
        self.assertEqual(args.command, 'evaluate')
        self.assertEqual(args.model_path, 'model.pt')
        self.assertEqual(args.config, 'config.yaml')
    
    def test_evaluate_command_with_output(self):
        """Test evaluate command with output path."""
        args = self.parser.parse_args([
            'evaluate',
            '--model-path', 'model.pt',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--output', 'results.json'
        ])
        
        self.assertEqual(args.output, 'results.json')
    
    def test_ablation_command_with_components(self):
        """Test ablation command with specific components."""
        args = self.parser.parse_args([
            'ablation',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--components', 'adms', 'dp'
        ])
        
        self.assertEqual(args.command, 'ablation')
        self.assertEqual(args.components, ['adms', 'dp'])
    
    def test_ablation_command_with_num_rounds(self):
        """Test ablation command with round override."""
        args = self.parser.parse_args([
            'ablation',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--num-rounds', '20'
        ])
        
        self.assertEqual(args.num_rounds, 20)
    
    def test_baseline_command_with_baselines(self):
        """Test baseline command with specific baselines."""
        args = self.parser.parse_args([
            'baseline',
            '--config', 'config.yaml',
            '--data-path', './data/SMD',
            '--baselines', 'pefad', 'centralized'
        ])
        
        self.assertEqual(args.command, 'baseline')
        self.assertEqual(args.baselines, ['pefad', 'centralized'])
    
    def test_all_commands_exist(self):
        """Test that all expected commands are available."""
        # Get subparser actions
        subparsers_actions = [
            action for action in self.parser._actions 
            if isinstance(action, argparse._SubParsersAction)
        ]
        
        # Get command names
        commands = []
        for subparsers_action in subparsers_actions:
            for choice in subparsers_action.choices:
                commands.append(choice)
        
        expected_commands = ['train', 'evaluate', 'ablation', 'baseline']
        for cmd in expected_commands:
            self.assertIn(cmd, commands, f"Command '{cmd}' not found in parser")


class TestCLIIntegration(unittest.TestCase):
    """Integration tests for CLI functionality."""
    
    def test_end_to_end_config_loading_with_overrides(self):
        """Test complete workflow: parse args -> load config -> apply overrides."""
        # Create temporary config
        temp_dir = tempfile.mkdtemp()
        config_path = os.path.join(temp_dir, 'config.yaml')
        
        config_data = {
            'training': {'num_rounds': 10, 'batch_size': 32},
            'privacy': {'epsilon': 1.0}
        }
        
        with open(config_path, 'w') as f:
            yaml.dump(config_data, f)
        
        try:
            # Simulate CLI args
            parser = create_parser()
            args = parser.parse_args([
                'train',
                '--config', config_path,
                '--data-path', './data/SMD',
                '--override', 'training.num_rounds=50', 'privacy.epsilon=0.5'
            ])
            
            # Parse overrides
            overrides = parse_overrides(args.override)
            
            # Load config with overrides
            config = load_config(args.config, overrides)
            
            # Verify final configuration
            self.assertEqual(config['training']['num_rounds'], 50)
            self.assertEqual(config['privacy']['epsilon'], 0.5)
            self.assertEqual(config['training']['batch_size'], 32)  # Unchanged
            
        finally:
            import shutil
            shutil.rmtree(temp_dir)


if __name__ == '__main__':
    unittest.main()
