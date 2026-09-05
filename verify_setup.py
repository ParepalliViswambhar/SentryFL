"""
Verification script for SentryFL project setup
"""
import os
import sys
from pathlib import Path

def verify_directory_structure():
    """Verify all required directories exist"""
    print("Checking directory structure...")
    required_dirs = [
        'sentryfl',
        'sentryfl/data',
        'sentryfl/models',
        'sentryfl/federated',
        'sentryfl/privacy',
        'sentryfl/evaluation',
        'sentryfl/utils',
    ]
    
    all_exist = True
    for dir_path in required_dirs:
        exists = os.path.isdir(dir_path)
        status = "✓" if exists else "✗"
        print(f"  {status} {dir_path}")
        all_exist = all_exist and exists
    
    return all_exist

def verify_init_files():
    """Verify all __init__.py files exist"""
    print("\nChecking __init__.py files...")
    required_inits = [
        'sentryfl/__init__.py',
        'sentryfl/data/__init__.py',
        'sentryfl/models/__init__.py',
        'sentryfl/federated/__init__.py',
        'sentryfl/privacy/__init__.py',
        'sentryfl/evaluation/__init__.py',
        'sentryfl/utils/__init__.py',
    ]
    
    all_exist = True
    for init_path in required_inits:
        exists = os.path.isfile(init_path)
        status = "✓" if exists else "✗"
        print(f"  {status} {init_path}")
        all_exist = all_exist and exists
    
    return all_exist

def verify_configuration_files():
    """Verify configuration files exist"""
    print("\nChecking configuration files...")
    required_files = [
        'setup.py',
        'requirements.txt',
        '.gitignore',
        'README.md',
    ]
    
    all_exist = True
    for file_path in required_files:
        exists = os.path.isfile(file_path)
        status = "✓" if exists else "✗"
        print(f"  {status} {file_path}")
        all_exist = all_exist and exists
    
    return all_exist

def verify_git_initialization():
    """Verify Git repository is initialized"""
    print("\nChecking Git initialization...")
    git_exists = os.path.isdir('.git')
    status = "✓" if git_exists else "✗"
    print(f"  {status} .git directory")
    return git_exists

def verify_package_import():
    """Verify package can be imported"""
    print("\nChecking package import...")
    try:
        import sentryfl
        print(f"  ✓ sentryfl package imported successfully")
        print(f"    Version: {sentryfl.__version__}")
        return True
    except ImportError as e:
        print(f"  ✗ Failed to import sentryfl: {e}")
        return False

def main():
    """Run all verification checks"""
    print("=" * 60)
    print("SentryFL Project Setup Verification")
    print("=" * 60)
    
    checks = [
        ("Directory Structure", verify_directory_structure),
        ("Init Files", verify_init_files),
        ("Configuration Files", verify_configuration_files),
        ("Git Initialization", verify_git_initialization),
        ("Package Import", verify_package_import),
    ]
    
    results = {}
    for check_name, check_func in checks:
        results[check_name] = check_func()
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    all_passed = True
    for check_name, result in results.items():
        status = "PASSED" if result else "FAILED"
        symbol = "✓" if result else "✗"
        print(f"  {symbol} {check_name}: {status}")
        all_passed = all_passed and result
    
    print("=" * 60)
    if all_passed:
        print("✓ All verification checks passed!")
        return 0
    else:
        print("✗ Some verification checks failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
