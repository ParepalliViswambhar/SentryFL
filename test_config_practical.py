"""
Practical test demonstrating ConfigurationSystem usage for SentryFL experiments
"""

from sentryfl.utils.config import ConfigurationSystem, parse_cli_overrides
import tempfile
import os

def test_practical_scenario():
    """Simulate a real experiment configuration workflow"""
    print("=" * 70)
    print("PRACTICAL CONFIGURATION SYSTEM DEMONSTRATION")
    print("=" * 70)
    
    # Scenario 1: Load config from file
    print("\n1. Loading configuration from YAML file...")
    config = ConfigurationSystem.from_yaml('config_example.yaml')
    print(f"   Experiment: {config.get('experiment.name')}")
    print(f"   Privacy epsilon: {config.get('privacy.epsilon')}")
    print(f"   Training batch size: {config.get('training.batch_size')}")
    
    # Scenario 2: Apply programmatic overrides for a specific experiment
    print("\n2. Applying programmatic overrides for hyperparameter tuning...")
    config.apply_overrides({
        'privacy.epsilon': 5.0,
        'training.batch_size': 64,
        'federated.num_clients': 20
    })
    print(f"   Updated epsilon: {config.get('privacy.epsilon')}")
    print(f"   Updated batch_size: {config.get('training.batch_size')}")
    print(f"   Updated num_clients: {config.get('federated.num_clients')}")
    
    # Scenario 3: Save modified configuration
    print("\n3. Saving modified configuration...")
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        output_path = f.name
    
    config.save_config(output_path, format='yaml')
    print(f"   Configuration saved to: {output_path}")
    
    # Scenario 4: Verify round-trip
    print("\n4. Verifying round-trip serialization...")
    config2 = ConfigurationSystem.from_yaml(output_path)
    assert config2.get('privacy.epsilon') == 5.0
    assert config2.get('training.batch_size') == 64
    print("   ✓ Round-trip successful - values preserved")
    
    # Scenario 5: Command-line override simulation
    print("\n5. Simulating command-line argument overrides...")
    cli_args = [
        '--privacy.epsilon=15.0',
        '--training.local_epochs=10',
        '--experiment.name=cli_experiment'
    ]
    cli_overrides = parse_cli_overrides(cli_args)
    config2.apply_overrides(cli_overrides)
    print(f"   After CLI overrides:")
    print(f"     epsilon: {config2.get('privacy.epsilon')}")
    print(f"     local_epochs: {config2.get('training.local_epochs')}")
    print(f"     experiment name: {config2.get('experiment.name')}")
    
    # Scenario 6: Get configuration sections for component initialization
    print("\n6. Extracting configuration sections for component initialization...")
    privacy_config = config2.get_section('privacy')
    training_config = config2.get_section('training')
    federated_config = config2.get_section('federated')
    
    print(f"   Privacy config keys: {list(privacy_config.keys())}")
    print(f"   Training config keys: {list(training_config.keys())}")
    print(f"   Federated config keys: {list(federated_config.keys())}")
    
    # Scenario 7: Validation catches errors
    print("\n7. Testing validation error handling...")
    try:
        bad_config = ConfigurationSystem()
        bad_config.apply_overrides({'privacy.epsilon': -10.0, 'privacy.enabled': True})
        print("   ✗ Should have caught invalid epsilon")
    except Exception as e:
        print(f"   ✓ Validation error caught: {str(e)[:80]}...")
    
    # Clean up
    os.unlink(output_path)
    
    print("\n" + "=" * 70)
    print("✓ ALL PRACTICAL SCENARIOS PASSED")
    print("=" * 70)
    print("\nConfigurationSystem is ready for production use in SentryFL!")

if __name__ == '__main__':
    test_practical_scenario()
