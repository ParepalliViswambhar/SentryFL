"""
Comprehensive test to verify ConfigurationSystem implementation
against task 16.1 requirements
"""

import yaml
import json
import tempfile
import os
from pathlib import Path

from sentryfl.utils.config import ConfigurationSystem, ConfigurationError, parse_cli_overrides

def test_yaml_loading():
    """Test YAML configuration file loading and parsing"""
    print("Testing YAML loading...")
    
    config = ConfigurationSystem.from_yaml('config_example.yaml')
    assert config.get('experiment.name') == 'smd_privacy_experiment'
    assert config.get('privacy.epsilon') == 1.0
    print("✓ YAML loading works")

def test_json_loading():
    """Test JSON configuration file loading"""
    print("\nTesting JSON loading...")
    
    # Create temporary JSON config
    config_dict = {
        'experiment': {'name': 'test_json'},
        'privacy': {'epsilon': 5.0}
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(config_dict, f)
        json_path = f.name
    
    try:
        config = ConfigurationSystem.from_json(json_path)
        assert config.get('experiment.name') == 'test_json'
        assert config.get('privacy.epsilon') == 5.0
        print("✓ JSON loading works")
    finally:
        os.unlink(json_path)

def test_schema_validation():
    """Test configuration schema validation"""
    print("\nTesting schema validation...")
    
    # Test valid config
    config = ConfigurationSystem()
    config.validate()  # Should not raise
    print("✓ Valid config passes validation")
    
    # Test invalid epsilon (must be > 0)
    try:
        config.apply_overrides({'privacy.enabled': True, 'privacy.epsilon': -1.0})
        assert False, "Should have raised ConfigurationError"
    except ConfigurationError as e:
        assert "epsilon" in str(e).lower()
        print(f"✓ Invalid epsilon rejected: {e}")
    
    # Reset and test invalid batch_size (must be > 0)
    config = ConfigurationSystem()
    try:
        config.apply_overrides({'training.batch_size': 0})
        assert False, "Should have raised ConfigurationError"
    except ConfigurationError as e:
        assert "batch_size" in str(e).lower()
        print(f"✓ Invalid batch_size rejected: {e}")

def test_nested_sections():
    """Test nested configuration sections"""
    print("\nTesting nested configuration sections...")
    
    config = ConfigurationSystem()
    
    # Verify all required sections exist
    model_section = config.get_section('model')
    assert 'backbone' in model_section
    
    training_section = config.get_section('training')
    assert 'batch_size' in training_section
    
    privacy_section = config.get_section('privacy')
    assert 'epsilon' in privacy_section
    
    evaluation_section = config.get_section('evaluation')
    assert 'metrics' in evaluation_section
    
    print("✓ All required nested sections present")

def test_default_values():
    """Test default value assignment for optional parameters"""
    print("\nTesting default values...")
    
    config = ConfigurationSystem()
    
    # Check some default values
    assert config.get('training.batch_size') == 32
    assert config.get('model.backbone') == 'bert-base-uncased'
    assert config.get('privacy.enabled') == False
    assert config.get('federated.num_clients') == 10
    
    print("✓ Default values assigned correctly")

def test_descriptive_errors():
    """Test descriptive error messages for invalid configurations"""
    print("\nTesting descriptive error messages...")
    
    config = ConfigurationSystem()
    
    # Test epsilon validation error
    try:
        config.apply_overrides({'privacy.enabled': True, 'privacy.epsilon': 0.0})
        assert False, "Should raise error"
    except ConfigurationError as e:
        error_msg = str(e)
        assert "epsilon" in error_msg.lower()
        assert ">" in error_msg
        print(f"✓ Descriptive error for epsilon: {error_msg}")
    
    # Test missing file error
    try:
        ConfigurationSystem.from_yaml('nonexistent_file.yaml')
        assert False, "Should raise error"
    except ConfigurationError as e:
        error_msg = str(e)
        assert "not found" in error_msg.lower()
        print(f"✓ Descriptive error for missing file: {error_msg}")

def test_configuration_inheritance():
    """Test configuration inheritance and override mechanism"""
    print("\nTesting configuration inheritance...")
    
    # Base configuration
    base_config = {
        'training': {
            'batch_size': 64,
            'learning_rate': 0.01
        }
    }
    
    # Override configuration
    override_config = {
        'training': {
            'batch_size': 128  # Override batch_size but keep learning_rate
        }
    }
    
    # Create config with base
    config = ConfigurationSystem(base_config=base_config)
    assert config.get('training.batch_size') == 64
    
    # Apply overrides
    config._merge_configs(config.config, override_config)
    assert config.get('training.batch_size') == 128
    assert config.get('training.learning_rate') == 0.01  # Should be preserved
    
    print("✓ Configuration inheritance works")

def test_cli_overrides():
    """Test command-line argument override support"""
    print("\nTesting CLI argument overrides...")
    
    # Test parse_cli_overrides function
    args = [
        '--privacy.epsilon=10.0',
        '--training.batch_size=64',
        '--privacy.enabled=true'
    ]
    
    overrides = parse_cli_overrides(args)
    assert overrides['privacy.epsilon'] == 10.0
    assert overrides['training.batch_size'] == 64
    assert overrides['privacy.enabled'] == True
    
    # Apply to config
    config = ConfigurationSystem()
    config.apply_overrides(overrides)
    
    assert config.get('privacy.epsilon') == 10.0
    assert config.get('training.batch_size') == 64
    assert config.get('privacy.enabled') == True
    
    print("✓ CLI overrides work")

def test_parameter_range_validation():
    """Test parameter range validation (epsilon > 0, batch_size > 0)"""
    print("\nTesting parameter range validation...")
    
    config = ConfigurationSystem()
    
    # Test epsilon > 0
    try:
        config.apply_overrides({'privacy.enabled': True, 'privacy.epsilon': 0.0})
        assert False, "Should fail"
    except ConfigurationError as e:
        assert "epsilon" in str(e).lower() and ">" in str(e)
        print(f"✓ epsilon > 0 enforced")
    
    # Test batch_size > 0
    config = ConfigurationSystem()
    try:
        config.apply_overrides({'training.batch_size': -5})
        assert False, "Should fail"
    except ConfigurationError as e:
        assert "batch_size" in str(e).lower()
        print(f"✓ batch_size > 0 enforced")
    
    # Test valid ranges
    config = ConfigurationSystem()
    config.apply_overrides({
        'privacy.enabled': True,
        'privacy.epsilon': 1.0,
        'training.batch_size': 32
    })
    print("✓ Valid parameter ranges accepted")

def test_round_trip_serialization():
    """Test configuration round-trip property (serialize -> deserialize -> serialize)"""
    print("\nTesting round-trip serialization...")
    
    # Create config
    config1 = ConfigurationSystem()
    
    # Save to YAML
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        yaml_path1 = f.name
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        yaml_path2 = f.name
    
    try:
        # First serialization
        config1.save_config(yaml_path1, format='yaml')
        
        # Deserialize
        config2 = ConfigurationSystem.from_yaml(yaml_path1)
        
        # Second serialization
        config2.save_config(yaml_path2, format='yaml')
        
        # Compare the two YAML files
        with open(yaml_path1, 'r') as f1:
            content1 = yaml.safe_load(f1)
        
        with open(yaml_path2, 'r') as f2:
            content2 = yaml.safe_load(f2)
        
        assert content1 == content2, "Round-trip serialization should produce identical configs"
        print("✓ Round-trip serialization preserves configuration")
        
    finally:
        os.unlink(yaml_path1)
        os.unlink(yaml_path2)

def test_configuration_logging():
    """Test that configuration is logged"""
    print("\nTesting configuration logging...")
    
    config = ConfigurationSystem()
    config.log_config()  # Should print without errors
    print("✓ Configuration logging works")

def main():
    """Run all tests"""
    print("=" * 70)
    print("COMPREHENSIVE CONFIGURATION SYSTEM TEST")
    print("Testing Task 16.1 Requirements")
    print("=" * 70)
    
    try:
        test_yaml_loading()
        test_json_loading()
        test_schema_validation()
        test_nested_sections()
        test_default_values()
        test_descriptive_errors()
        test_configuration_inheritance()
        test_cli_overrides()
        test_parameter_range_validation()
        test_round_trip_serialization()
        test_configuration_logging()
        
        print("\n" + "=" * 70)
        print("✓ ALL TESTS PASSED")
        print("=" * 70)
        print("\nTask 16.1 Implementation Verified:")
        print("  ✓ YAML configuration file loading and parsing")
        print("  ✓ Configuration schema validation")
        print("  ✓ Nested configuration sections (model, training, privacy, evaluation)")
        print("  ✓ Default value assignment for optional parameters")
        print("  ✓ Descriptive error messages for invalid configurations")
        print("  ✓ Configuration inheritance and override mechanism")
        print("  ✓ Command-line argument override support")
        print("  ✓ Parameter range validation (epsilon > 0, batch_size > 0)")
        print("  ✓ Round-trip serialization property")
        
        return True
        
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
