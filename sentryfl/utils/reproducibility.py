"""
Reproducibility Utilities for SentryFL

This module provides utilities for ensuring reproducible experiments:
- Random seed setting across all libraries (Python, NumPy, PyTorch, CUDA)
- System information logging (Python version, library versions, hardware)
- Experiment metadata tracking

Requirements addressed:
- 20.5: Log system information (Python version, library versions, hardware)
- 20.11: Set random seeds for reproducible experiments
- 20.12: Log random seed values used in each experiment
"""

import os
import sys
import random
import logging
import platform
import subprocess
from typing import Dict, Optional, Any
from datetime import datetime
import json

import numpy as np
import torch

logger = logging.getLogger(__name__)


class ReproducibilityManager:
    """Manages reproducibility settings and system information logging"""
    
    def __init__(self, seed: Optional[int] = None, log_dir: Optional[str] = None):
        """
        Initialize reproducibility manager
        
        Args:
            seed: Random seed for reproducibility. If None, uses 42 as default.
            log_dir: Directory to save system info logs. If None, uses current directory.
        """
        self.seed = seed if seed is not None else 42
        self.log_dir = log_dir if log_dir is not None else '.'
        self.system_info = None
        
    def set_seed(self, seed: Optional[int] = None):
        """
        Set random seed for all libraries to ensure reproducibility
        
        Sets seeds for:
        - Python's random module
        - NumPy
        - PyTorch (CPU and CUDA)
        - CUDA (deterministic algorithms)
        
        Args:
            seed: Random seed. If None, uses self.seed.
        """
        if seed is not None:
            self.seed = seed
        
        logger.info(f"Setting random seed to {self.seed} for reproducibility")
        
        # Python random
        random.seed(self.seed)
        
        # NumPy
        np.random.seed(self.seed)
        
        # PyTorch
        torch.manual_seed(self.seed)
        
        # CUDA
        if torch.cuda.is_available():
            torch.cuda.manual_seed(self.seed)
            torch.cuda.manual_seed_all(self.seed)  # for multi-GPU
            
            # Use deterministic algorithms
            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False
            
            logger.info("CUDA deterministic mode enabled")
        
        # Set environment variables for additional reproducibility
        os.environ['PYTHONHASHSEED'] = str(self.seed)
        
        logger.info("✓ Random seed set successfully")
    
    def get_system_info(self) -> Dict[str, Any]:
        """
        Collect comprehensive system information
        
        Returns:
            Dictionary containing:
            - Python version
            - Library versions (PyTorch, NumPy, etc.)
            - Hardware information (CPU, GPU, memory)
            - Operating system details
            - Environment variables
        """
        logger.info("Collecting system information...")
        
        system_info = {
            'timestamp': datetime.now().isoformat(),
            'seed': self.seed,
            'python': self._get_python_info(),
            'libraries': self._get_library_versions(),
            'hardware': self._get_hardware_info(),
            'operating_system': self._get_os_info(),
            'environment': self._get_environment_vars()
        }
        
        self.system_info = system_info
        return system_info
    
    def _get_python_info(self) -> Dict[str, str]:
        """Get Python interpreter information"""
        return {
            'version': sys.version,
            'version_info': {
                'major': sys.version_info.major,
                'minor': sys.version_info.minor,
                'micro': sys.version_info.micro
            },
            'executable': sys.executable,
            'implementation': platform.python_implementation(),
            'compiler': platform.python_compiler()
        }
    
    def _get_library_versions(self) -> Dict[str, str]:
        """Get versions of critical libraries"""
        versions = {}
        
        # Core ML libraries
        try:
            import torch
            versions['torch'] = torch.__version__
            versions['torch_cuda_available'] = torch.cuda.is_available()
            if torch.cuda.is_available():
                versions['torch_cuda_version'] = torch.version.cuda
                versions['torch_cudnn_version'] = torch.backends.cudnn.version()
        except ImportError:
            versions['torch'] = 'Not installed'
        
        try:
            import numpy
            versions['numpy'] = numpy.__version__
        except ImportError:
            versions['numpy'] = 'Not installed'
        
        try:
            import pandas
            versions['pandas'] = pandas.__version__
        except ImportError:
            versions['pandas'] = 'Not installed'
        
        try:
            import sklearn
            versions['scikit-learn'] = sklearn.__version__
        except ImportError:
            versions['scikit-learn'] = 'Not installed'
        
        try:
            import transformers
            versions['transformers'] = transformers.__version__
        except ImportError:
            versions['transformers'] = 'Not installed'
        
        try:
            import opacus
            versions['opacus'] = opacus.__version__
        except ImportError:
            versions['opacus'] = 'Not installed'
        
        return versions
    
    def _get_hardware_info(self) -> Dict[str, Any]:
        """Get hardware information"""
        hardware = {
            'cpu': {
                'architecture': platform.machine(),
                'processor': platform.processor(),
                'physical_cores': os.cpu_count()
            },
            'memory': {}
        }
        
        # Memory information (platform-specific)
        try:
            if platform.system() == 'Linux':
                with open('/proc/meminfo', 'r') as f:
                    meminfo = f.read()
                    for line in meminfo.split('\n'):
                        if 'MemTotal' in line:
                            mem_kb = int(line.split()[1])
                            hardware['memory']['total_gb'] = round(mem_kb / (1024**2), 2)
        except Exception:
            pass
        
        # GPU information
        if torch.cuda.is_available():
            hardware['gpu'] = {
                'count': torch.cuda.device_count(),
                'devices': []
            }
            
            for i in range(torch.cuda.device_count()):
                gpu_props = torch.cuda.get_device_properties(i)
                hardware['gpu']['devices'].append({
                    'index': i,
                    'name': gpu_props.name,
                    'total_memory_gb': round(gpu_props.total_memory / (1024**3), 2),
                    'compute_capability': f"{gpu_props.major}.{gpu_props.minor}"
                })
        else:
            hardware['gpu'] = {'available': False}
        
        return hardware
    
    def _get_os_info(self) -> Dict[str, str]:
        """Get operating system information"""
        return {
            'system': platform.system(),
            'release': platform.release(),
            'version': platform.version(),
            'platform': platform.platform(),
            'machine': platform.machine()
        }
    
    def _get_environment_vars(self) -> Dict[str, str]:
        """Get relevant environment variables"""
        env_vars = {}
        
        # CUDA-related environment variables
        cuda_vars = [
            'CUDA_VISIBLE_DEVICES',
            'CUDA_DEVICE_ORDER',
            'CUDA_LAUNCH_BLOCKING',
            'CUDNN_DETERMINISTIC',
            'PYTHONHASHSEED'
        ]
        
        for var in cuda_vars:
            if var in os.environ:
                env_vars[var] = os.environ[var]
        
        return env_vars
    
    def log_system_info(self, output_path: Optional[str] = None) -> str:
        """
        Log system information to file
        
        Args:
            output_path: Path to save system info. If None, auto-generates filename.
            
        Returns:
            Path to saved system info file
        """
        if self.system_info is None:
            self.get_system_info()
        
        # Generate output path
        if output_path is None:
            os.makedirs(self.log_dir, exist_ok=True)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = os.path.join(self.log_dir, f'system_info_{timestamp}.json')
        
        # Save to JSON
        with open(output_path, 'w') as f:
            json.dump(self.system_info, f, indent=2)
        
        logger.info(f"✓ System information logged to {output_path}")
        
        # Also print summary to console
        self._print_system_summary()
        
        return output_path
    
    def _print_system_summary(self):
        """Print system information summary to console"""
        if self.system_info is None:
            return
        
        logger.info("=" * 80)
        logger.info("SYSTEM INFORMATION SUMMARY")
        logger.info("=" * 80)
        
        # Python
        py_info = self.system_info['python']
        logger.info(f"Python: {py_info['version_info']['major']}.{py_info['version_info']['minor']}.{py_info['version_info']['micro']}")
        
        # Libraries
        lib_info = self.system_info['libraries']
        logger.info(f"PyTorch: {lib_info.get('torch', 'N/A')}")
        logger.info(f"NumPy: {lib_info.get('numpy', 'N/A')}")
        logger.info(f"Transformers: {lib_info.get('transformers', 'N/A')}")
        logger.info(f"Opacus: {lib_info.get('opacus', 'N/A')}")
        
        # Hardware
        hw_info = self.system_info['hardware']
        logger.info(f"CPU: {hw_info['cpu']['processor']} ({hw_info['cpu']['physical_cores']} cores)")
        
        if 'gpu' in hw_info and hw_info['gpu'].get('available', True):
            logger.info(f"GPU: {hw_info['gpu']['count']} device(s)")
            for gpu in hw_info['gpu']['devices']:
                logger.info(f"  - {gpu['name']} ({gpu['total_memory_gb']} GB)")
        else:
            logger.info("GPU: Not available")
        
        # OS
        os_info = self.system_info['operating_system']
        logger.info(f"OS: {os_info['system']} {os_info['release']}")
        
        # Seed
        logger.info(f"Random Seed: {self.seed}")
        
        logger.info("=" * 80)
    
    def create_reproducibility_report(self, experiment_config: Dict[str, Any], 
                                     output_path: Optional[str] = None) -> str:
        """
        Create comprehensive reproducibility report
        
        Combines system info with experiment configuration for full reproducibility.
        
        Args:
            experiment_config: Experiment configuration dictionary
            output_path: Path to save report. If None, auto-generates filename.
            
        Returns:
            Path to saved report
        """
        if self.system_info is None:
            self.get_system_info()
        
        report = {
            'system_info': self.system_info,
            'experiment_config': experiment_config,
            'reproducibility': {
                'instructions': [
                    '1. Install Python version matching system_info.python.version',
                    '2. Install library versions matching system_info.libraries',
                    '3. Set random seed using: ReproducibilityManager(seed={}).set_seed()'.format(self.seed),
                    '4. Use experiment_config for training parameters',
                    '5. Ensure CUDA deterministic mode if using GPU'
                ],
                'seed': self.seed,
                'deterministic_mode': True
            }
        }
        
        # Generate output path
        if output_path is None:
            os.makedirs(self.log_dir, exist_ok=True)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = os.path.join(self.log_dir, f'reproducibility_report_{timestamp}.json')
        
        # Save to JSON
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"✓ Reproducibility report saved to {output_path}")
        
        return output_path


def set_global_seed(seed: int):
    """
    Convenience function to set global random seed
    
    Args:
        seed: Random seed for reproducibility
    """
    manager = ReproducibilityManager(seed=seed)
    manager.set_seed()


def log_experiment_start(config: Dict[str, Any], log_dir: str = '.') -> ReproducibilityManager:
    """
    Convenience function to setup reproducibility at experiment start
    
    Args:
        config: Experiment configuration dictionary
        log_dir: Directory to save logs
        
    Returns:
        ReproducibilityManager instance
    """
    seed = config.get('experiment', {}).get('seed', 42)
    
    manager = ReproducibilityManager(seed=seed, log_dir=log_dir)
    manager.set_seed()
    manager.get_system_info()
    manager.log_system_info()
    
    return manager


# Convenience exports
__all__ = [
    'ReproducibilityManager',
    'set_global_seed',
    'log_experiment_start'
]
