"""
Unit tests for Configuration System

Tests coverage:
- YAML loading and parsing
- JSON loading and parsing
- Schema validation with invalid configurations
- Default value assignment
- Configuration round-trip (serialize → deserialize → serialize)
- Configuration inheritance and overrides
- Command-line argument override support
- Parameter range validation
- Nested configuration sections

**Validates Requirements:** 14.1, 14.2, 14.4, 14.10
"""

import unittest
import tempfile
import shutil
from pathlib import Path
import yaml
import json

from sentryfl.utils.config import (
    ConfigurationSystem,
    ConfigurationError,
    parse_cli_overrides
)


class TestConfigurationSystemLoading(unittest.TestCase):
    """Test configuration file loading and parsing (Requirement 14.1)"""
    
    def setUp(self):
        """Create temporary directory for test files"""
        self.test_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Remove temporary directory"""
        shutil.rmtree(self.test_dir)
    
    def test_load_valid_yaml_file(self):
        """Test loading valid YAML configuration"""
        config_dict = {
            'experiment': {'name': 'test_exp', 'seed': 42},
            'training': {'batch_size': 64, 'learning_rate': 0.01}
        }
        
        config_path = Path(self.test_dir) / 'config.yaml'
        with open(config_path, 'w') as f:
            yaml.dump(config_dict, f)
        
        system = ConfigurationSystem(config_path=str(config_path))
        
        # Check that custom values were loaded
        self.assertEqual(system.get('experiment.name'), 'test_exp')
        self.assertEqual(system.get('experiment.seed'), 42)
        self.assertEqual(system.get('training.batch_size'), 64)
        self.assertEqual(system.get('training.learning_rate'), 0.01)
    
    def test_load_valid_json_file(self):
        """Test loading valid JSON configuration"""
        config_dict = {
            'experiment': {'name': 'json_test', 'seed': 99},
            'privacy': {'enabled': True, 'epsilon': 5.0}
        }
        
        config_path = Path(self.test_dir) / 'config.json'
        with open(config_path, 'w') as f:
            json.dump(config_dict, f)
        
        system = ConfigurationSystem(config_path=str(config_path))
        
        # Check that custom values were loaded
        self.assertEqual(system.get('experiment.name'), 'json_test')
        self.assertEqual(system.get('experiment.seed'), 99)
        self.assertTrue(system.get('privacy.enabled'))
        self.assertEqual(system.get('privacy.epsilon'), 5.0)
    
    def test_load_nonexistent_file(self):
        """Test error when loading nonexistent file"""
        nonexistent_path = Path(self.test_dir) / 'nonexistent.yaml'
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem(config_path=str(nonexistent_path))
        
        self.assertIn('not found', str(context.exception))
    
    def test_load_invalid_yaml_syntax(self):
        """Test error when YAML file has syntax errors"""
        config_path = Path(self.test_dir) / 'invalid.yaml'
        with open(config_path, 'w') as f:
            f.write("invalid: yaml: syntax:\n  - bad indentation")
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem(config_path=str(config_path))
        
        self.assertIn('Failed to parse YAML', str(context.exception))
    
    def test_load_invalid_json_syntax(self):
        """Test error when JSON file has syntax errors"""
        config_path = Path(self.test_dir) / 'invalid.json'
        with open(config_path, 'w') as f:
            f.write('{"experiment": {"name": "test",}')  # Trailing comma
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem(config_path=str(config_path))
        
        self.assertIn('Failed to parse JSON', str(context.exception))
    
    def test_load_unsupported_format(self):
        """Test error when file format is unsupported"""
        config_path = Path(self.test_dir) / 'config.txt'
        with open(config_path, 'w') as f:
            f.write('some text')
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem(config_path=str(config_path))
        
        self.assertIn('Unsupported configuration file format', str(context.exception))
    
    def test_load_non_dict_config(self):
        """Test error when config is not a dictionary"""
        config_path = Path(self.test_dir) / 'config.yaml'
        with open(config_path, 'w') as f:
            yaml.dump(['list', 'of', 'items'], f)
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem(config_path=str(config_path))
        
        self.assertIn('must be a dictionary', str(context.exception))


class TestConfigurationSystemDefaults(unittest.TestCase):
    """Test default value assignment (Requirement 14.4)"""
    
    def test_default_values_without_config_file(self):
        """Test that default values are assigned when no config file provided"""
        system = ConfigurationSystem()
        
        # Check some default values from DEFAULT_CONFIG
        self.assertEqual(system.get('model.backbone'), 'bert-base-uncased')
        self.assertEqual(system.get('model.hidden_dim'), 768)
        self.assertEqual(system.get('training.num_rounds'), 100)
        self.assertEqual(system.get('training.batch_size'), 32)
        self.assertEqual(system.get('privacy.epsilon'), 1.0)
        self.assertEqual(system.get('federated.num_clients'), 10)
        self.assertEqual(system.get('data.window_size'), 100)
    
    def test_defaults_merged_with_partial_config(self):
        """Test that defaults are used for missing values in partial config"""
        # Create config with only a few values
        partial_config = {
            'experiment': {'name': 'partial_test'},
            'training': {'batch_size': 128}  # Override just batch_size
        }
        
        system = ConfigurationSystem.from_dict(partial_config)
        
        # Check that provided values override defaults
        self.assertEqual(system.get('experiment.name'), 'partial_test')
        self.assertEqual(system.get('training.batch_size'), 128)
        
        # Check that defaults are used for missing values
        self.assertEqual(system.get('training.num_rounds'), 100)  # Default
        self.assertEqual(system.get('training.learning_rate'), 0.001)  # Default
        self.assertEqual(system.get('model.backbone'), 'bert-base-uncased')  # Default
    
    def test_all_required_sections_have_defaults(self):
        """Test that all required sections exist in defaults"""
        system = ConfigurationSystem()
        
        required_sections = ['model', 'training', 'privacy', 'evaluation',
                           'federated', 'data', 'experiment']
        
        for section in required_sections:
            section_config = system.get_section(section)
            self.assertIsNotNone(section_config)
            self.assertIsInstance(section_config, dict)


class TestConfigurationSystemValidation(unittest.TestCase):
    """Test schema validation with invalid configurations (Requirement 14.2)"""
    
    def test_validation_epsilon_must_be_positive(self):
        """Test that epsilon must be > 0"""
        invalid_config = {
            'privacy': {'epsilon': 0.0}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('privacy.epsilon', str(context.exception))
        self.assertIn('must be >', str(context.exception))
    
    def test_validation_epsilon_negative(self):
        """Test that negative epsilon is rejected"""
        invalid_config = {
            'privacy': {'epsilon': -1.0}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('privacy.epsilon', str(context.exception))
    
    def test_validation_batch_size_must_be_positive(self):
        """Test that batch_size must be >= 1"""
        invalid_config = {
            'training': {'batch_size': 0}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('training.batch_size', str(context.exception))
        self.assertIn('must be >=', str(context.exception))
    
    def test_validation_learning_rate_must_be_positive(self):
        """Test that learning_rate must be > 0"""
        invalid_config = {
            'training': {'learning_rate': 0.0}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('training.learning_rate', str(context.exception))
    
    def test_validation_invalid_type_int_for_float_param(self):
        """Test that type validation works correctly"""
        invalid_config = {
            'privacy': {'epsilon': 'not_a_number'}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('privacy.epsilon', str(context.exception))
        self.assertIn('type', str(context.exception))
    
    def test_validation_clients_per_round_exceeds_num_clients(self):
        """Test cross-parameter validation"""
        invalid_config = {
            'federated': {
                'num_clients': 5,
                'clients_per_round': 10
            }
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('clients_per_round', str(context.exception))
        self.assertIn('cannot exceed', str(context.exception))
    
    def test_validation_train_val_ratio_sum_too_large(self):
        """Test that train_ratio + val_ratio < 1.0"""
        invalid_config = {
            'data': {
                'train_ratio': 0.8,
                'val_ratio': 0.3  # Sum = 1.1 > 1.0
            }
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('train_ratio', str(context.exception))
        self.assertIn('val_ratio', str(context.exception))
        self.assertIn('must be < 1.0', str(context.exception))
    
    def test_validation_invalid_dataset_choice(self):
        """Test validation of dataset enum"""
        invalid_config = {
            'data': {'dataset': 'INVALID_DATASET'}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('data.dataset', str(context.exception))
        self.assertIn('must be one of', str(context.exception))
    
    def test_validation_invalid_aggregation_method(self):
        """Test validation of aggregation method enum"""
        invalid_config = {
            'federated': {'aggregation': 'invalid_method'}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('federated.aggregation', str(context.exception))
    
    def test_validation_invalid_optimizer_choice(self):
        """Test validation of optimizer enum"""
        invalid_config = {
            'training': {'optimizer': 'invalid_optimizer'}
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('training.optimizer', str(context.exception))
    
    def test_validation_privacy_enabled_without_epsilon(self):
        """Test that epsilon is required when privacy is enabled"""
        invalid_config = {
            'privacy': {
                'enabled': True,
                'epsilon': None
            }
        }
        
        with self.assertRaises(ConfigurationError) as context:
            ConfigurationSystem.from_dict(invalid_config)
        
        self.assertIn('privacy.epsilon', str(context.exception))
        self.assertIn('must be specified', str(context.exception))
    
    def test_validation_passes_with_valid_config(self):
        """Test that validation passes with valid configuration"""
        valid_config = {
            'experiment': {'name': 'valid_test', 'seed': 42},
            'training': {'batch_size': 64, 'learning_rate': 0.01},
            'privacy': {'epsilon': 1.0, 'delta': 1e-5}
        }
        
        # Should not raise exception
        system = ConfigurationSystem.from_dict(valid_config)
        self.assertIsNotNone(system)


class TestConfigurationSystemRoundTrip(unittest.TestCase):
    """Test configuration round-trip serialization (Requirement 14.10)"""
    
    def setUp(self):
        """Create temporary directory for test files"""
        self.test_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Remove temporary directory"""
        shutil.rmtree(self.test_dir)
    
    def test_yaml_roundtrip_produces_identical_config(self):
        """Test YAML serialize → deserialize → serialize produces identical result"""
        # Create a configuration
        original_config = {
            'experiment': {'name': 'roundtrip_test', 'seed': 123},
            'training': {'batch_size': 64, 'learning_rate': 0.005},
            'privacy': {'enabled': True, 'epsilon': 2.0, 'delta': 1e-5},
            'federated': {'num_clients': 20, 'clients_per_round': 10}
        }
        
        system = ConfigurationSystem.from_dict(original_config)
        
        # Save to YAML (first serialization)
        yaml_path_1 = Path(self.test_dir) / 'config1.yaml'
        system.save_config(str(yaml_path_1), format='yaml')
        
        # Load from YAML (deserialization)
        system2 = ConfigurationSystem.from_yaml(str(yaml_path_1))
        
        # Save again to YAML (second serialization)
        yaml_path_2 = Path(self.test_dir) / 'config2.yaml'
        system2.save_config(str(yaml_path_2), format='yaml')
        
        # Compare the two YAML files
        with open(yaml_path_1, 'r') as f1, open(yaml_path_2, 'r') as f2:
            config1 = yaml.safe_load(f1)
            config2 = yaml.safe_load(f2)
        
        # Configs should be identical
        self.assertEqual(config1, config2)
    
    def test_json_roundtrip_produces_identical_config(self):
        """Test JSON serialize → deserialize → serialize produces identical result"""
        # Create a configuration
        original_config = {
            'experiment': {'name': 'json_roundtrip', 'seed': 456},
            'model': {'hidden_dim': 512, 'dropout': 0.2},
            'data': {'window_size': 50, 'stride': 5}
        }
        
        system = ConfigurationSystem.from_dict(original_config)
        
        # Save to JSON (first serialization)
        json_path_1 = Path(self.test_dir) / 'config1.json'
        system.save_config(str(json_path_1), format='json')
        
        # Load from JSON (deserialization)
        system2 = ConfigurationSystem.from_json(str(json_path_1))
        
        # Save again to JSON (second serialization)
        json_path_2 = Path(self.test_dir) / 'config2.json'
        system2.save_config(str(json_path_2), format='json')
        
        # Compare the two JSON files
        with open(json_path_1, 'r') as f1, open(json_path_2, 'r') as f2:
            config1 = json.load(f1)
            config2 = json.load(f2)
        
        # Configs should be identical
        self.assertEqual(config1, config2)
    
    def test_cross_format_roundtrip_yaml_to_json(self):
        """Test that YAML → JSON → YAML preserves configuration"""
        original_config = {
            'experiment': {'name': 'cross_format_test'},
            'training': {'num_rounds': 50}
        }
        
        system = ConfigurationSystem.from_dict(original_config)
        
        # Save as YAML
        yaml_path = Path(self.test_dir) / 'config.yaml'
        system.save_config(str(yaml_path), format='yaml')
        
        # Load and save as JSON
        system2 = ConfigurationSystem.from_yaml(str(yaml_path))
        json_path = Path(self.test_dir) / 'config.json'
        system2.save_config(str(json_path), format='json')
        
        # Load JSON and compare configurations
        system3 = ConfigurationSystem.from_json(str(json_path))
        
        # Compare using to_dict()
        config1 = system.to_dict()
        config3 = system3.to_dict()
        
        self.assertEqual(config1, config3)
    
    def test_roundtrip_preserves_all_data_types(self):
        """Test that roundtrip preserves integers, floats, booleans, and strings"""
        original_config = {
            'experiment': {
                'name': 'type_test',  # string
                'seed': 42,  # int
                'checkpoint_interval': 10,  # int
            },
            'training': {
                'learning_rate': 0.001,  # float
                'batch_size': 64,  # int
            },
            'privacy': {
                'enabled': True,  # bool
                'epsilon': 1.0,  # float
            },
            'model': {
                'freeze_backbone': False,  # bool
            }
        }
        
        system = ConfigurationSystem.from_dict(original_config)
        
        # Save and reload
        yaml_path = Path(self.test_dir) / 'types.yaml'
        system.save_config(str(yaml_path), format='yaml')
        system2 = ConfigurationSystem.from_yaml(str(yaml_path))
        
        # Check that types are preserved
        self.assertIsInstance(system2.get('experiment.name'), str)
        self.assertIsInstance(system2.get('experiment.seed'), int)
        self.assertIsInstance(system2.get('training.learning_rate'), float)
        self.assertIsInstance(system2.get('training.batch_size'), int)
        self.assertIsInstance(system2.get('privacy.enabled'), bool)
        self.assertIsInstance(system2.get('model.freeze_backbone'), bool)
        
        # Check that values are preserved
        self.assertEqual(system2.get('experiment.name'), 'type_test')
        self.assertEqual(system2.get('experiment.seed'), 42)
        self.assertEqual(system2.get('training.learning_rate'), 0.001)
        self.assertTrue(system2.get('privacy.enabled'))
        self.assertFalse(system2.get('model.freeze_backbone'))


class TestConfigurationSystemOverrides(unittest.TestCase):
    """Test configuration overrides and inheritance"""
    
    def setUp(self):
        """Create temporary directory for test files"""
        self.test_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        """Remove temporary directory"""
        shutil.rmtree(self.test_dir)
    
    def test_apply_overrides_with_dot_notation(self):
        """Test applying overrides using dot notation"""
        system = ConfigurationSystem()
        
        # Apply overrides
        overrides = {
            'privacy.epsilon': 10.0,
            'training.batch_size': 128,
            'experiment.name': 'override_test'
        }
        system.apply_overrides(overrides)
        
        # Check that overrides were applied
        self.assertEqual(system.get('privacy.epsilon'), 10.0)
        self.assertEqual(system.get('training.batch_size'), 128)
        self.assertEqual(system.get('experiment.name'), 'override_test')
        
        # Check that non-overridden values remain at defaults
        self.assertEqual(system.get('training.learning_rate'), 0.001)
    
    def test_parse_cli_overrides(self):
        """Test parsing command-line overrides"""
        args = [
            '--privacy.epsilon=5.0',
            '--training.batch_size=64',
            '--privacy.enabled=true',
            '--experiment.name=cli_test'
        ]
        
        overrides = parse_cli_overrides(args)
        
        self.assertEqual(overrides['privacy.epsilon'], 5.0)
        self.assertEqual(overrides['training.batch_size'], 64)
        self.assertTrue(overrides['privacy.enabled'])
        self.assertEqual(overrides['experiment.name'], 'cli_test')
    
    def test_parse_cli_boolean_flags(self):
        """Test parsing boolean CLI flags"""
        args = ['--privacy.enabled', '--model.freeze_backbone']
        
        overrides = parse_cli_overrides(args)
        
        self.assertTrue(overrides['privacy.enabled'])
        self.assertTrue(overrides['model.freeze_backbone'])
    
    def test_configuration_inheritance_with_base_config(self):
        """Test configuration inheritance from base config"""
        base_config = {
            'training': {'batch_size': 64, 'learning_rate': 0.01},
            'experiment': {'name': 'base_exp'}
        }
        
        # Create config file that overrides some values
        override_config = {
            'training': {'batch_size': 128},  # Override batch_size
            'privacy': {'epsilon': 2.0}  # Add new value
        }
        
        config_path = Path(self.test_dir) / 'override.yaml'
        with open(config_path, 'w') as f:
            yaml.dump(override_config, f)
        
        # Create system with base config and file override
        system = ConfigurationSystem(config_path=str(config_path), base_config=base_config)
        
        # Check merged values
        self.assertEqual(system.get('training.batch_size'), 128)  # Overridden
        self.assertEqual(system.get('training.learning_rate'), 0.01)  # From base
        self.assertEqual(system.get('experiment.name'), 'base_exp')  # From base
        self.assertEqual(system.get('privacy.epsilon'), 2.0)  # From file


class TestConfigurationSystemUtilityMethods(unittest.TestCase):
    """Test utility methods of ConfigurationSystem"""
    
    def test_get_nested_value(self):
        """Test getting nested values with dot notation"""
        system = ConfigurationSystem()
        
        # Test various nesting levels
        self.assertEqual(system.get('model.backbone'), 'bert-base-uncased')
        self.assertEqual(system.get('training.batch_size'), 32)
        self.assertIsNotNone(system.get('privacy.epsilon'))
    
    def test_get_with_default_value(self):
        """Test get with default value for missing keys"""
        system = ConfigurationSystem()
        
        # Non-existent key should return default
        self.assertEqual(system.get('nonexistent.key', 'default'), 'default')
        self.assertIsNone(system.get('another.missing.key'))
    
    def test_get_section(self):
        """Test getting entire configuration section"""
        system = ConfigurationSystem()
        
        # Get training section
        training_config = system.get_section('training')
        
        self.assertIsInstance(training_config, dict)
        self.assertIn('batch_size', training_config)
        self.assertIn('learning_rate', training_config)
        self.assertIn('num_rounds', training_config)
    
    def test_get_section_nonexistent(self):
        """Test error when getting non-existent section"""
        system = ConfigurationSystem()
        
        with self.assertRaises(ConfigurationError) as context:
            system.get_section('nonexistent_section')
        
        self.assertIn('not found', str(context.exception))
    
    def test_to_dict_returns_deep_copy(self):
        """Test that to_dict returns a deep copy"""
        system = ConfigurationSystem()
        
        config_dict = system.to_dict()
        
        # Modify the returned dict
        config_dict['training']['batch_size'] = 9999
        
        # Original should be unchanged
        self.assertEqual(system.get('training.batch_size'), 32)
    
    def test_from_dict_factory_method(self):
        """Test creating ConfigurationSystem from dictionary"""
        config_dict = {
            'experiment': {'name': 'factory_test'},
            'training': {'batch_size': 256}
        }
        
        system = ConfigurationSystem.from_dict(config_dict)
        
        self.assertEqual(system.get('experiment.name'), 'factory_test')
        self.assertEqual(system.get('training.batch_size'), 256)
    
    def test_from_yaml_factory_method(self):
        """Test creating ConfigurationSystem from YAML file"""
        config_dict = {
            'experiment': {'name': 'yaml_factory_test'},
            'training': {'learning_rate': 0.005}
        }
        
        # Create temp YAML file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(config_dict, f)
            yaml_path = f.name
        
        try:
            system = ConfigurationSystem.from_yaml(yaml_path)
            
            self.assertEqual(system.get('experiment.name'), 'yaml_factory_test')
            self.assertEqual(system.get('training.learning_rate'), 0.005)
        finally:
            Path(yaml_path).unlink()
    
    def test_from_json_factory_method(self):
        """Test creating ConfigurationSystem from JSON file"""
        config_dict = {
            'experiment': {'name': 'json_factory_test'},
            'privacy': {'epsilon': 3.0}
        }
        
        # Create temp JSON file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(config_dict, f)
            json_path = f.name
        
        try:
            system = ConfigurationSystem.from_json(json_path)
            
            self.assertEqual(system.get('experiment.name'), 'json_factory_test')
            self.assertEqual(system.get('privacy.epsilon'), 3.0)
        finally:
            Path(json_path).unlink()


class TestConfigurationSystemNestedSections(unittest.TestCase):
    """Test nested configuration sections (Requirement 14.3)"""
    
    def test_all_required_nested_sections_exist(self):
        """Test that all required nested sections are present"""
        system = ConfigurationSystem()
        
        # Check top-level sections
        required_sections = ['model', 'training', 'privacy', 'evaluation',
                           'federated', 'data', 'experiment', 'optimization', 'parameter_efficiency']
        
        for section in required_sections:
            self.assertIn(section, system.config)
            self.assertIsInstance(system.config[section], dict)
    
    def test_model_section_structure(self):
        """Test model section has expected nested structure"""
        system = ConfigurationSystem()
        model_config = system.get_section('model')
        
        expected_keys = ['backbone', 'hidden_dim', 'freeze_backbone', 'dropout']
        for key in expected_keys:
            self.assertIn(key, model_config)
    
    def test_training_section_structure(self):
        """Test training section has expected nested structure"""
        system = ConfigurationSystem()
        training_config = system.get_section('training')
        
        expected_keys = ['num_rounds', 'local_epochs', 'batch_size', 
                        'learning_rate', 'optimizer', 'weight_decay']
        for key in expected_keys:
            self.assertIn(key, training_config)
    
    def test_privacy_section_structure(self):
        """Test privacy section has expected nested structure"""
        system = ConfigurationSystem()
        privacy_config = system.get_section('privacy')
        
        expected_keys = ['enabled', 'epsilon', 'delta', 'max_grad_norm']
        for key in expected_keys:
            self.assertIn(key, privacy_config)
    
    def test_evaluation_section_structure(self):
        """Test evaluation section has expected nested structure"""
        system = ConfigurationSystem()
        eval_config = system.get_section('evaluation')
        
        expected_keys = ['metrics', 'anomaly_threshold', 'save_predictions', 'save_plots']
        for key in expected_keys:
            self.assertIn(key, eval_config)
    
    def test_federated_section_structure(self):
        """Test federated section has expected nested structure"""
        system = ConfigurationSystem()
        fed_config = system.get_section('federated')
        
        expected_keys = ['num_clients', 'clients_per_round', 'partition_strategy', 
                        'aggregation', 'byzantine_robust']
        for key in expected_keys:
            self.assertIn(key, fed_config)
    
    def test_deep_nested_value_access(self):
        """Test accessing deeply nested values"""
        system = ConfigurationSystem()
        
        # Test multiple levels of nesting
        self.assertIsNotNone(system.get('model.backbone'))
        self.assertIsNotNone(system.get('training.batch_size'))
        self.assertIsNotNone(system.get('privacy.epsilon'))
        
        # Test that nested sections can be updated
        system.apply_overrides({'model.hidden_dim': 1024})
        self.assertEqual(system.get('model.hidden_dim'), 1024)


if __name__ == '__main__':
    unittest.main()
