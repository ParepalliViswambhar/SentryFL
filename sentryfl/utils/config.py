"""
Configuration System for SentryFL Experiment Management

This module provides comprehensive configuration management for federated learning
experiments, including YAML/JSON loading, schema validation, default values,
nested sections, inheritance, command-line overrides, and parameter validation.

Satisfies Requirements:
- 14.1: Load experiment parameters from YAML or JSON files
- 14.2: Validate configuration schema before experiment execution
- 14.3: Support nested configuration sections (model, training, privacy, evaluation)
- 14.4: Provide default values for optional parameters
- 14.5: Raise descriptive error messages for invalid configurations
- 14.6: Support configuration inheritance and overrides
- 14.8: Support command-line argument overrides for configuration values
- 14.9: Validate parameter ranges (epsilon > 0, batch_size > 0)
"""

import yaml
import json
import os
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
from copy import deepcopy
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConfigurationError(Exception):
    """Raised when configuration validation fails"""
    pass


class ConfigurationSystem:
    """
    Manages experiment configuration with YAML/JSON loading, validation,
    defaults, inheritance, and command-line overrides.
    """
    
    # Default configuration values
    DEFAULT_CONFIG = {
        'model': {
            'backbone': 'bert-base-uncased',
            'hidden_dim': 768,
            'freeze_backbone': True,
            'dropout': 0.1,
        },
        'training': {
            'num_rounds': 100,
            'local_epochs': 5,
            'batch_size': 32,
            'learning_rate': 0.001,
            'optimizer': 'adam',
            'weight_decay': 0.0001,
            'gradient_accumulation_steps': 1,
        },
        'privacy': {
            'enabled': False,
            'epsilon': 1.0,
            'delta': 1e-5,
            'max_grad_norm': 1.0,
            'noise_multiplier': None,  # Auto-computed if None
        },
        'evaluation': {
            'metrics': ['f1', 'auc_roc', 'auc_pr', 'precision', 'recall'],
            'anomaly_threshold': 0.5,
            'save_predictions': True,
            'save_plots': True,
        },
        'federated': {
            'num_clients': 10,
            'clients_per_round': 5,
            'partition_strategy': 'iid',  # 'iid' or 'non_iid'
            'aggregation': 'fedavg',  # 'fedavg' or 'trimmed_mean'
            'byzantine_robust': False,
            'trimmed_mean_fraction': 0.1,
        },
        'parameter_efficiency': {
            'adms_enabled': True,
            'selection_ratio': 0.05,
            'ppds_enabled': False,
        },
        'data': {
            'dataset': 'SMD',  # 'SMD' or 'NSL-KDD'
            'window_size': 100,
            'stride': 1,
            'normalize': True,
            'train_ratio': 0.7,
            'val_ratio': 0.15,
        },
        'optimization': {
            'quantization_enabled': False,
            'quantization_dtype': 'int8',
            'knowledge_distillation_enabled': False,
            'distillation_temperature': 3.0,
            'distillation_alpha': 0.5,
        },
        'experiment': {
            'name': 'default_experiment',
            'output_dir': './experiments',
            'checkpoint_interval': 10,
            'log_interval': 1,
            'seed': 42,
        }
    }
    
    # Schema validation rules
    VALIDATION_RULES = {
        'privacy.epsilon': {'type': float, 'min': 0.0, 'exclusive_min': True},
        'privacy.delta': {'type': float, 'min': 0.0, 'max': 1.0},
        'privacy.max_grad_norm': {'type': (int, float), 'min': 0.0, 'exclusive_min': True},
        'training.batch_size': {'type': int, 'min': 1},
        'training.local_epochs': {'type': int, 'min': 1},
        'training.num_rounds': {'type': int, 'min': 1},
        'training.learning_rate': {'type': float, 'min': 0.0, 'exclusive_min': True},
        'federated.num_clients': {'type': int, 'min': 1},
        'federated.clients_per_round': {'type': int, 'min': 1},
        'data.window_size': {'type': int, 'min': 1},
        'data.stride': {'type': int, 'min': 1},
        'data.train_ratio': {'type': float, 'min': 0.0, 'max': 1.0},
        'data.val_ratio': {'type': float, 'min': 0.0, 'max': 1.0},
        'experiment.checkpoint_interval': {'type': int, 'min': 1},
        'experiment.log_interval': {'type': int, 'min': 1},
        'experiment.seed': {'type': int, 'min': 0},
        'parameter_efficiency.selection_ratio': {'type': float, 'min': 0.0, 'max': 1.0},
        'optimization.distillation_temperature': {'type': float, 'min': 0.0, 'exclusive_min': True},
        'optimization.distillation_alpha': {'type': float, 'min': 0.0, 'max': 1.0},
        'evaluation.anomaly_threshold': {'type': float, 'min': 0.0, 'max': 1.0},
    }
    
    def __init__(self, config_path: Optional[str] = None, base_config: Optional[Dict] = None):
        """
        Initialize Configuration System
        
        Args:
            config_path: Path to YAML or JSON configuration file
            base_config: Base configuration dictionary for inheritance
        """
        self.config = deepcopy(self.DEFAULT_CONFIG)
        
        # Apply base configuration (inheritance)
        if base_config is not None:
            self._merge_configs(self.config, base_config)
        
        # Load from file if provided
        if config_path is not None:
            loaded_config = self.load_config(config_path)
            self._merge_configs(self.config, loaded_config)
        
        # Validate configuration
        self.validate()
        
        # Log final resolved configuration
        logger.info("Configuration loaded and validated successfully")
        logger.info(f"Experiment: {self.config['experiment']['name']}")
    
    def load_config(self, config_path: str) -> Dict[str, Any]:
        """
        Load configuration from YAML or JSON file
        
        Args:
            config_path: Path to configuration file
            
        Returns:
            Configuration dictionary
            
        Raises:
            ConfigurationError: If file cannot be loaded or parsed
        """
        path = Path(config_path)
        
        if not path.exists():
            raise ConfigurationError(
                f"Configuration file not found: {config_path}"
            )
        
        try:
            with open(path, 'r') as f:
                if path.suffix in ['.yaml', '.yml']:
                    config = yaml.safe_load(f)
                elif path.suffix == '.json':
                    config = json.load(f)
                else:
                    raise ConfigurationError(
                        f"Unsupported configuration file format: {path.suffix}. "
                        "Supported formats: .yaml, .yml, .json"
                    )
            
            if not isinstance(config, dict):
                raise ConfigurationError(
                    f"Configuration must be a dictionary, got {type(config).__name__}"
                )
            
            logger.info(f"Loaded configuration from {config_path}")
            return config
            
        except yaml.YAMLError as e:
            raise ConfigurationError(
                f"Failed to parse YAML file {config_path}: {str(e)}"
            )
        except json.JSONDecodeError as e:
            raise ConfigurationError(
                f"Failed to parse JSON file {config_path}: {str(e)}"
            )
        except Exception as e:
            raise ConfigurationError(
                f"Failed to load configuration from {config_path}: {str(e)}"
            )
    
    def _merge_configs(self, base: Dict, override: Dict) -> None:
        """
        Recursively merge override config into base config (in-place)
        
        Args:
            base: Base configuration dictionary
            override: Override configuration dictionary
        """
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                # Recursively merge nested dictionaries
                self._merge_configs(base[key], value)
            else:
                # Override value
                base[key] = deepcopy(value)
    
    def apply_overrides(self, overrides: Dict[str, Any]) -> None:
        """
        Apply command-line or programmatic overrides to configuration
        
        Supports dot notation for nested keys (e.g., 'privacy.epsilon=10.0')
        
        Args:
            overrides: Dictionary of override values with dot-notation keys
            
        Example:
            config.apply_overrides({
                'privacy.epsilon': 10.0,
                'training.batch_size': 64
            })
        """
        for key, value in overrides.items():
            self._set_nested_value(self.config, key, value)
        
        # Re-validate after applying overrides
        self.validate()
        logger.info(f"Applied {len(overrides)} configuration overrides")
    
    def _set_nested_value(self, config: Dict, key: str, value: Any) -> None:
        """
        Set nested configuration value using dot notation
        
        Args:
            config: Configuration dictionary
            key: Dot-notation key (e.g., 'privacy.epsilon')
            value: Value to set
        """
        keys = key.split('.')
        current = config
        
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            elif not isinstance(current[k], dict):
                raise ConfigurationError(
                    f"Cannot set nested value: '{k}' in path '{key}' is not a dictionary"
                )
            current = current[k]
        
        current[keys[-1]] = value
    
    def _get_nested_value(self, config: Dict, key: str, default: Any = None) -> Any:
        """
        Get nested configuration value using dot notation
        
        Args:
            config: Configuration dictionary
            key: Dot-notation key (e.g., 'privacy.epsilon')
            default: Default value if key not found
            
        Returns:
            Configuration value or default
        """
        keys = key.split('.')
        current = config
        
        for k in keys:
            if not isinstance(current, dict) or k not in current:
                return default
            current = current[k]
        
        return current
    
    def validate(self) -> None:
        """
        Validate configuration against schema rules
        
        Raises:
            ConfigurationError: If validation fails
        """
        errors = []
        
        # Validate required sections exist
        required_sections = ['model', 'training', 'privacy', 'evaluation', 
                            'federated', 'data', 'experiment']
        for section in required_sections:
            if section not in self.config:
                errors.append(f"Missing required configuration section: '{section}'")
        
        if errors:
            raise ConfigurationError(
                f"Configuration validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
            )
        
        # Validate parameter rules
        for key, rules in self.VALIDATION_RULES.items():
            value = self._get_nested_value(self.config, key)
            
            if value is None:
                continue  # Optional parameter
            
            # Type validation
            expected_type = rules['type']
            
            # Try to convert string to expected type if it's a numeric type
            if isinstance(value, str) and expected_type in (int, float, (int, float)):
                try:
                    if expected_type == int:
                        value = int(value)
                    else:
                        value = float(value)
                    # Update the config with converted value
                    self._set_nested_value(self.config, key, value)
                except (ValueError, TypeError):
                    pass  # Will fail type check below
            
            if not isinstance(value, expected_type):
                type_name = expected_type.__name__ if hasattr(expected_type, '__name__') else str(expected_type)
                errors.append(
                    f"Parameter '{key}' must be of type {type_name}, got {type(value).__name__}"
                )
                continue
            
            # Range validation
            if 'min' in rules:
                exclusive = rules.get('exclusive_min', False)
                if exclusive and value <= rules['min']:
                    errors.append(
                        f"Parameter '{key}' must be > {rules['min']}, got {value}"
                    )
                elif not exclusive and value < rules['min']:
                    errors.append(
                        f"Parameter '{key}' must be >= {rules['min']}, got {value}"
                    )
            
            if 'max' in rules:
                exclusive = rules.get('exclusive_max', False)
                if exclusive and value >= rules['max']:
                    errors.append(
                        f"Parameter '{key}' must be < {rules['max']}, got {value}"
                    )
                elif not exclusive and value > rules['max']:
                    errors.append(
                        f"Parameter '{key}' must be <= {rules['max']}, got {value}"
                    )
        
        # Additional cross-parameter validations
        if self.config['federated']['clients_per_round'] > self.config['federated']['num_clients']:
            errors.append(
                f"'federated.clients_per_round' ({self.config['federated']['clients_per_round']}) "
                f"cannot exceed 'federated.num_clients' ({self.config['federated']['num_clients']})"
            )
        
        train_ratio = self.config['data']['train_ratio']
        val_ratio = self.config['data']['val_ratio']
        if train_ratio + val_ratio >= 1.0:
            errors.append(
                f"Sum of 'data.train_ratio' ({train_ratio}) and 'data.val_ratio' ({val_ratio}) "
                f"must be < 1.0 to leave data for test set"
            )
        
        # Validate privacy configuration
        if self.config['privacy']['enabled']:
            if self.config['privacy']['epsilon'] is None:
                errors.append("'privacy.epsilon' must be specified when privacy is enabled")
            if self.config['privacy']['delta'] is None:
                errors.append("'privacy.delta' must be specified when privacy is enabled")
        
        # Validate dataset choice
        valid_datasets = ['SMD', 'NSL-KDD']
        if self.config['data']['dataset'] not in valid_datasets:
            errors.append(
                f"'data.dataset' must be one of {valid_datasets}, "
                f"got '{self.config['data']['dataset']}'"
            )
        
        # Validate aggregation method
        valid_aggregation = ['fedavg', 'trimmed_mean']
        if self.config['federated']['aggregation'] not in valid_aggregation:
            errors.append(
                f"'federated.aggregation' must be one of {valid_aggregation}, "
                f"got '{self.config['federated']['aggregation']}'"
            )
        
        # Validate optimizer choice
        valid_optimizers = ['adam', 'sgd', 'adamw']
        if self.config['training']['optimizer'] not in valid_optimizers:
            errors.append(
                f"'training.optimizer' must be one of {valid_optimizers}, "
                f"got '{self.config['training']['optimizer']}'"
            )
        
        if errors:
            raise ConfigurationError(
                f"Configuration validation failed with {len(errors)} error(s):\n" +
                "\n".join(f"  - {e}" for e in errors)
            )
    
    def save_config(self, output_path: str, format: str = 'yaml') -> None:
        """
        Save current configuration to file
        
        Args:
            output_path: Path to save configuration file
            format: Output format ('yaml' or 'json')
            
        Raises:
            ConfigurationError: If saving fails
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(path, 'w') as f:
                if format == 'yaml':
                    yaml.dump(self.config, f, default_flow_style=False, sort_keys=False)
                elif format == 'json':
                    json.dump(self.config, f, indent=2)
                else:
                    raise ConfigurationError(f"Unsupported format: {format}")
            
            logger.info(f"Configuration saved to {output_path}")
            
        except Exception as e:
            raise ConfigurationError(f"Failed to save configuration: {str(e)}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Get configuration value using dot notation
        
        Args:
            key: Dot-notation key (e.g., 'privacy.epsilon')
            default: Default value if key not found
            
        Returns:
            Configuration value
        """
        return self._get_nested_value(self.config, key, default)
    
    def get_section(self, section: str) -> Dict[str, Any]:
        """
        Get entire configuration section
        
        Args:
            section: Section name ('model', 'training', 'privacy', etc.)
            
        Returns:
            Configuration section dictionary
            
        Raises:
            ConfigurationError: If section does not exist
        """
        if section not in self.config:
            raise ConfigurationError(f"Configuration section '{section}' not found")
        
        return deepcopy(self.config[section])
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Get complete configuration as dictionary
        
        Returns:
            Deep copy of configuration dictionary
        """
        return deepcopy(self.config)
    
    def log_config(self) -> None:
        """Log the final resolved configuration"""
        logger.info("=" * 60)
        logger.info("FINAL RESOLVED CONFIGURATION")
        logger.info("=" * 60)
        
        for section, values in self.config.items():
            logger.info(f"\n[{section.upper()}]")
            self._log_section(values, indent=2)
        
        logger.info("=" * 60)
    
    def _log_section(self, section: Dict[str, Any], indent: int = 0) -> None:
        """
        Recursively log configuration section
        
        Args:
            section: Configuration section
            indent: Indentation level
        """
        prefix = " " * indent
        for key, value in section.items():
            if isinstance(value, dict):
                logger.info(f"{prefix}{key}:")
                self._log_section(value, indent + 2)
            else:
                logger.info(f"{prefix}{key}: {value}")
    
    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> 'ConfigurationSystem':
        """
        Create ConfigurationSystem from dictionary
        
        Args:
            config_dict: Configuration dictionary
            
        Returns:
            ConfigurationSystem instance
        """
        system = cls()
        system._merge_configs(system.config, config_dict)
        system.validate()
        return system
    
    @classmethod
    def from_yaml(cls, yaml_path: str) -> 'ConfigurationSystem':
        """
        Create ConfigurationSystem from YAML file
        
        Args:
            yaml_path: Path to YAML configuration file
            
        Returns:
            ConfigurationSystem instance
        """
        return cls(config_path=yaml_path)
    
    @classmethod
    def from_json(cls, json_path: str) -> 'ConfigurationSystem':
        """
        Create ConfigurationSystem from JSON file
        
        Args:
            json_path: Path to JSON configuration file
            
        Returns:
            ConfigurationSystem instance
        """
        return cls(config_path=json_path)


def parse_cli_overrides(args: List[str]) -> Dict[str, Any]:
    """
    Parse command-line argument overrides
    
    Supports formats:
    - --privacy.epsilon=10.0
    - --training.batch_size=64
    - --privacy.enabled=true
    
    Args:
        args: List of command-line arguments
        
    Returns:
        Dictionary of parsed overrides
        
    Example:
        args = ['--privacy.epsilon=10.0', '--training.batch_size=64']
        overrides = parse_cli_overrides(args)
        # Returns: {'privacy.epsilon': 10.0, 'training.batch_size': 64}
    """
    overrides = {}
    
    for arg in args:
        if not arg.startswith('--'):
            continue
        
        arg = arg[2:]  # Remove '--'
        
        if '=' not in arg:
            # Boolean flag (--privacy.enabled means True)
            overrides[arg] = True
        else:
            key, value = arg.split('=', 1)
            
            # Try to parse value as appropriate type
            parsed_value = _parse_value(value)
            overrides[key] = parsed_value
    
    return overrides


def _parse_value(value: str) -> Union[int, float, bool, str]:
    """
    Parse string value to appropriate type
    
    Args:
        value: String value to parse
        
    Returns:
        Parsed value (int, float, bool, or str)
    """
    # Boolean
    if value.lower() in ['true', 'yes', 'on', '1']:
        return True
    if value.lower() in ['false', 'no', 'off', '0']:
        return False
    
    # None/null
    if value.lower() in ['none', 'null']:
        return None
    
    # Try integer
    try:
        if '.' not in value:
            return int(value)
    except ValueError:
        pass
    
    # Try float
    try:
        return float(value)
    except ValueError:
        pass
    
    # Return as string
    return value
