from sentryfl.utils import ConfigurationSystem

# Test YAML loading
config = ConfigurationSystem(config_path='config_example.yaml')
print('✓ YAML loading works')
print(f'Experiment: {config.get("experiment.name")}')
print(f'Privacy epsilon: {config.get("privacy.epsilon")}')
print(f'Batch size: {config.get("training.batch_size")}')

# Test overrides
config.apply_overrides({
    'privacy.epsilon': 10.0,
    'training.batch_size': 64
})
print('\n✓ Overrides applied')
print(f'New epsilon: {config.get("privacy.epsilon")}')
print(f'New batch size: {config.get("training.batch_size")}')
