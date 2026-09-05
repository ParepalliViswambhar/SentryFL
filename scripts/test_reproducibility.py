#!/usr/bin/env python3
"""
Test script for reproducibility utilities

This script verifies that:
1. Random seed setting works correctly
2. System information logging captures all details
3. Reproducibility reports are generated correctly
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sentryfl.utils.reproducibility import ReproducibilityManager, set_global_seed
import torch
import numpy as np


def test_seed_setting():
    """Test that seed setting produces reproducible results"""
    print("=" * 80)
    print("TEST 1: Random Seed Setting")
    print("=" * 80)
    
    # Test with seed 42
    set_global_seed(42)
    
    # Generate some random numbers
    py_rand1 = [np.random.randint(0, 100) for _ in range(5)]
    np_rand1 = np.random.randn(3)
    torch_rand1 = torch.randn(3)
    
    print(f"First run (seed=42):")
    print(f"  Python random: {py_rand1}")
    print(f"  NumPy random: {np_rand1}")
    print(f"  PyTorch random: {torch_rand1}")
    
    # Reset seed and generate again
    set_global_seed(42)
    
    py_rand2 = [np.random.randint(0, 100) for _ in range(5)]
    np_rand2 = np.random.randn(3)
    torch_rand2 = torch.randn(3)
    
    print(f"\nSecond run (seed=42):")
    print(f"  Python random: {py_rand2}")
    print(f"  NumPy random: {np_rand2}")
    print(f"  PyTorch random: {torch_rand2}")
    
    # Verify reproducibility
    np_match = np.allclose(np_rand1, np_rand2)
    torch_match = torch.allclose(torch_rand1, torch_rand2)
    
    print(f"\nReproducibility check:")
    print(f"  NumPy reproducible: {np_match}")
    print(f"  PyTorch reproducible: {torch_match}")
    
    if np_match and torch_match:
        print("✓ TEST PASSED: Seed setting produces reproducible results")
    else:
        print("✗ TEST FAILED: Results not reproducible")
        return False
    
    return True


def test_system_info_logging():
    """Test system information logging"""
    print("\n" + "=" * 80)
    print("TEST 2: System Information Logging")
    print("=" * 80)
    
    # Initialize manager
    manager = ReproducibilityManager(seed=42, log_dir='./test_output')
    
    # Get system info
    system_info = manager.get_system_info()
    
    print("\nSystem Information Captured:")
    print(f"  Python version: {system_info['python']['version_info']}")
    print(f"  PyTorch version: {system_info['libraries'].get('torch', 'N/A')}")
    print(f"  NumPy version: {system_info['libraries'].get('numpy', 'N/A')}")
    print(f"  CPU cores: {system_info['hardware']['cpu']['physical_cores']}")
    print(f"  GPU available: {system_info['libraries'].get('torch_cuda_available', False)}")
    print(f"  OS: {system_info['operating_system']['system']}")
    print(f"  Random seed: {system_info['seed']}")
    
    # Save system info
    output_path = manager.log_system_info()
    print(f"\n✓ System info saved to: {output_path}")
    
    # Verify file exists
    if Path(output_path).exists():
        print("✓ TEST PASSED: System info file created")
        return True
    else:
        print("✗ TEST FAILED: System info file not created")
        return False


def test_reproducibility_report():
    """Test reproducibility report generation"""
    print("\n" + "=" * 80)
    print("TEST 3: Reproducibility Report Generation")
    print("=" * 80)
    
    # Initialize manager
    manager = ReproducibilityManager(seed=42, log_dir='./test_output')
    manager.set_seed()
    manager.get_system_info()
    
    # Sample experiment config
    experiment_config = {
        'experiment': {
            'name': 'test_experiment',
            'seed': 42
        },
        'training': {
            'num_rounds': 100,
            'batch_size': 32
        },
        'privacy': {
            'enabled': True,
            'epsilon': 1.0
        }
    }
    
    # Create report
    report_path = manager.create_reproducibility_report(
        experiment_config=experiment_config,
        output_path='./test_output/test_reproducibility_report.json'
    )
    
    print(f"\n✓ Reproducibility report saved to: {report_path}")
    
    # Verify file exists
    if Path(report_path).exists():
        print("✓ TEST PASSED: Reproducibility report created")
        return True
    else:
        print("✗ TEST FAILED: Reproducibility report not created")
        return False


def main():
    print("SentryFL Reproducibility Utilities Test Suite")
    print("=" * 80)
    
    # Create output directory
    os.makedirs('./test_output', exist_ok=True)
    
    # Run tests
    results = []
    
    results.append(test_seed_setting())
    results.append(test_system_info_logging())
    results.append(test_reproducibility_report())
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Tests passed: {sum(results)}/{len(results)}")
    
    if all(results):
        print("\n✓ ALL TESTS PASSED")
        print("\nReproducibility utilities are working correctly!")
        print("\nNext steps:")
        print("  1. Use scripts/download_datasets.py to download datasets")
        print("  2. Use scripts/reproduce_experiments.py to setup experiments")
        print("  3. Review EXPECTED_RESULTS.md for reference performance numbers")
        return 0
    else:
        print("\n✗ SOME TESTS FAILED")
        print("Please check the error messages above")
        return 1


if __name__ == '__main__':
    sys.exit(main())
