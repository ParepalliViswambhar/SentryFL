#!/usr/bin/env python3
"""
Dataset Download Script for SentryFL

This script automates the download and setup of benchmark datasets (SMD, NSL-KDD)
for reproducible experiments.

Usage:
    python scripts/download_datasets.py --dataset all --output ./data
    python scripts/download_datasets.py --dataset SMD --output ./data/SMD
    python scripts/download_datasets.py --dataset NSL-KDD --output ./data/NSL-KDD
"""

import argparse
import os
import sys
import logging
import urllib.request
import zipfile
import tarfile
import shutil
from pathlib import Path
from typing import Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatasetDownloader:
    """Handles downloading and setup of benchmark datasets"""
    
    # Dataset URLs
    DATASETS = {
        'SMD': {
            'url': 'https://github.com/NetManAIOps/OmniAnomaly/archive/refs/heads/master.zip',
            'archive_name': 'OmniAnomaly-master.zip',
            'extract_path': 'OmniAnomaly-master/ServerMachineDataset',
            'final_name': 'SMD',
            'size_mb': 140,
            'description': 'Server Machine Dataset - 28 machines with multivariate telemetry'
        },
        'NSL-KDD': {
            'url': 'https://raw.githubusercontent.com/jmnwong/NSL-KDD-Dataset/master/',
            'files': [
                'KDDTrain+.txt',
                'KDDTest+.txt',
                'KDDTrain+_20Percent.txt'
            ],
            'final_name': 'NSL-KDD',
            'size_mb': 20,
            'description': 'NSL-KDD Network Intrusion Detection Dataset'
        }
    }
    
    def __init__(self, output_dir: str = './data'):
        """
        Initialize dataset downloader
        
        Args:
            output_dir: Base directory for downloaded datasets
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def download_smd(self, force: bool = False) -> bool:
        """
        Download and setup SMD dataset
        
        Args:
            force: If True, re-download even if dataset exists
            
        Returns:
            True if successful, False otherwise
        """
        dataset_info = self.DATASETS['SMD']
        final_path = self.output_dir / dataset_info['final_name']
        
        # Check if already exists
        if final_path.exists() and not force:
            logger.info(f"SMD dataset already exists at {final_path}")
            logger.info("Use --force to re-download")
            return True
        
        logger.info(f"Downloading SMD dataset (~{dataset_info['size_mb']}MB)...")
        logger.info(f"Description: {dataset_info['description']}")
        
        try:
            # Download archive
            archive_path = self.output_dir / dataset_info['archive_name']
            self._download_file(dataset_info['url'], archive_path)
            
            # Extract archive
            logger.info("Extracting archive...")
            extract_dir = self.output_dir / 'temp_extract'
            extract_dir.mkdir(exist_ok=True)
            
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            # Move dataset to final location
            source_path = extract_dir / dataset_info['extract_path']
            if final_path.exists():
                shutil.rmtree(final_path)
            shutil.move(str(source_path), str(final_path))
            
            # Cleanup
            logger.info("Cleaning up temporary files...")
            archive_path.unlink()
            shutil.rmtree(extract_dir)
            
            # Verify dataset
            self._verify_smd(final_path)
            
            logger.info(f"✓ SMD dataset successfully downloaded to {final_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to download SMD dataset: {e}")
            return False
    
    def download_nslkdd(self, force: bool = False) -> bool:
        """
        Download and setup NSL-KDD dataset
        
        Args:
            force: If True, re-download even if dataset exists
            
        Returns:
            True if successful, False otherwise
        """
        dataset_info = self.DATASETS['NSL-KDD']
        final_path = self.output_dir / dataset_info['final_name']
        
        # Check if already exists
        if final_path.exists() and not force:
            logger.info(f"NSL-KDD dataset already exists at {final_path}")
            logger.info("Use --force to re-download")
            return True
        
        logger.info(f"Downloading NSL-KDD dataset (~{dataset_info['size_mb']}MB)...")
        logger.info(f"Description: {dataset_info['description']}")
        
        try:
            # Create directory
            final_path.mkdir(parents=True, exist_ok=True)
            
            # Download each file
            base_url = dataset_info['url']
            for filename in dataset_info['files']:
                file_url = base_url + filename
                file_path = final_path / filename
                logger.info(f"Downloading {filename}...")
                self._download_file(file_url, file_path)
            
            # Verify dataset
            self._verify_nslkdd(final_path)
            
            logger.info(f"✓ NSL-KDD dataset successfully downloaded to {final_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to download NSL-KDD dataset: {e}")
            return False
    
    def download_all(self, force: bool = False) -> bool:
        """
        Download all datasets
        
        Args:
            force: If True, re-download even if datasets exist
            
        Returns:
            True if all successful, False otherwise
        """
        logger.info("=" * 80)
        logger.info("Downloading all SentryFL benchmark datasets")
        logger.info("=" * 80)
        
        success = True
        
        # Download SMD
        logger.info("\n[1/2] SMD Dataset")
        logger.info("-" * 80)
        if not self.download_smd(force):
            success = False
        
        # Download NSL-KDD
        logger.info("\n[2/2] NSL-KDD Dataset")
        logger.info("-" * 80)
        if not self.download_nslkdd(force):
            success = False
        
        logger.info("\n" + "=" * 80)
        if success:
            logger.info("✓ All datasets downloaded successfully!")
        else:
            logger.error("✗ Some datasets failed to download")
        logger.info("=" * 80)
        
        return success
    
    def _download_file(self, url: str, output_path: Path):
        """Download file with progress reporting"""
        def _progress_hook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100, downloaded * 100 / total_size)
                mb_downloaded = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                sys.stdout.write(f"\r  Progress: {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)")
                sys.stdout.flush()
        
        try:
            urllib.request.urlretrieve(url, output_path, reporthook=_progress_hook)
            sys.stdout.write("\n")
        except Exception as e:
            raise RuntimeError(f"Failed to download {url}: {e}")
    
    def _verify_smd(self, dataset_path: Path):
        """Verify SMD dataset integrity"""
        logger.info("Verifying SMD dataset...")
        
        # Check for machine directories
        machine_dirs = list(dataset_path.glob("machine-*"))
        if len(machine_dirs) == 0:
            raise RuntimeError("No machine directories found in SMD dataset")
        
        logger.info(f"  Found {len(machine_dirs)} machine directories")
        
        # Check first machine has required files
        first_machine = machine_dirs[0]
        required_files = ['train.txt', 'test.txt', 'test_label.txt']
        for filename in required_files:
            filepath = first_machine / filename
            if not filepath.exists():
                raise RuntimeError(f"Missing required file: {filepath}")
        
        logger.info(f"  ✓ Dataset structure verified")
    
    def _verify_nslkdd(self, dataset_path: Path):
        """Verify NSL-KDD dataset integrity"""
        logger.info("Verifying NSL-KDD dataset...")
        
        # Check required files
        required_files = ['KDDTrain+.txt', 'KDDTest+.txt']
        for filename in required_files:
            filepath = dataset_path / filename
            if not filepath.exists():
                raise RuntimeError(f"Missing required file: {filepath}")
            
            # Check file is not empty
            if filepath.stat().st_size == 0:
                raise RuntimeError(f"File is empty: {filepath}")
        
        logger.info(f"  ✓ Dataset structure verified")


def main():
    parser = argparse.ArgumentParser(
        description='Download benchmark datasets for SentryFL experiments',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download all datasets
  python scripts/download_datasets.py --dataset all --output ./data
  
  # Download only SMD
  python scripts/download_datasets.py --dataset SMD --output ./data/SMD
  
  # Download only NSL-KDD
  python scripts/download_datasets.py --dataset NSL-KDD --output ./data/NSL-KDD
  
  # Force re-download
  python scripts/download_datasets.py --dataset all --output ./data --force
        """
    )
    
    parser.add_argument(
        '--dataset',
        type=str,
        choices=['all', 'SMD', 'NSL-KDD'],
        default='all',
        help='Dataset to download (default: all)'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default='./data',
        help='Output directory for datasets (default: ./data)'
    )
    
    parser.add_argument(
        '--force',
        action='store_true',
        help='Force re-download even if dataset exists'
    )
    
    parser.add_argument(
        '--verify-only',
        action='store_true',
        help='Only verify existing datasets without downloading'
    )
    
    args = parser.parse_args()
    
    # Initialize downloader
    downloader = DatasetDownloader(output_dir=args.output)
    
    # Verify only mode
    if args.verify_only:
        logger.info("Verification mode - checking existing datasets...")
        success = True
        
        if args.dataset in ['all', 'SMD']:
            smd_path = Path(args.output) / 'SMD'
            if smd_path.exists():
                try:
                    downloader._verify_smd(smd_path)
                    logger.info("✓ SMD dataset verified")
                except Exception as e:
                    logger.error(f"✗ SMD verification failed: {e}")
                    success = False
            else:
                logger.warning("SMD dataset not found")
                success = False
        
        if args.dataset in ['all', 'NSL-KDD']:
            nslkdd_path = Path(args.output) / 'NSL-KDD'
            if nslkdd_path.exists():
                try:
                    downloader._verify_nslkdd(nslkdd_path)
                    logger.info("✓ NSL-KDD dataset verified")
                except Exception as e:
                    logger.error(f"✗ NSL-KDD verification failed: {e}")
                    success = False
            else:
                logger.warning("NSL-KDD dataset not found")
                success = False
        
        sys.exit(0 if success else 1)
    
    # Download datasets
    if args.dataset == 'all':
        success = downloader.download_all(force=args.force)
    elif args.dataset == 'SMD':
        success = downloader.download_smd(force=args.force)
    elif args.dataset == 'NSL-KDD':
        success = downloader.download_nslkdd(force=args.force)
    else:
        logger.error(f"Unknown dataset: {args.dataset}")
        sys.exit(1)
    
    # Print summary
    logger.info("\nNext steps:")
    logger.info("  1. Verify datasets: python scripts/download_datasets.py --verify-only")
    logger.info("  2. Run preprocessing: python -m sentryfl.data.test_preprocessor")
    logger.info("  3. Start training: python scripts/reproduce_experiments.py")
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
