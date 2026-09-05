"""
Verification script for Configuration System

Tests all key features:
- YAML loading and parsing
- Configuration validation
- Nested sections
- Default values
- Error messages
- Inheritance and overrides
- Command-line argument overrides
- Parameter range validation
- Round-trip serialization
"""

import sys
import os
from pathlib import Path

# Add project to path
sys.path.insert(0, str(Path(__file__).parent))

from sentryfl.utils import ConfigurationSystem, ConfigurationError, parse_cli_overrides


def test_default_config():
    """Test 1: Default configuration loading"""
    print("\n" + "="*60)
    print("TEST 1: Default Configuration")
    print("="*60)
    
    config = ConfigurationSystem()
    print("✓ Default configuration loaded successfully")
    print(f"  - Experiment name: {config.get('experiment.name')}")
    print(f"  - Privacy epsilon: {config.get('privacy.epsilon')}")
    print(f"  - Training batch size: {config.get('training.batch_size')}")
    print(f"  - Num clients: {config.get('federated.num_clients')}")
    return True


def test_yaml_loading():
    """Test 2: Load configuration from YAML file"""
    print("\n" + "="*60)
    print("TEST 2: YAML Configuration Loading")
    print("="*60)
    
    yaml_path = "config_example.yaml"
    if not os.path.exists(yaml_path):
        print(f"⚠ Skipping: {yaml_path} not found")
        return True
    
    config = ConfigurationSystem(config_path=yaml_path)
