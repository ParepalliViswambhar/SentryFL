"""
CheckpointManager for model persistence and training recovery in SentryFL.

This module provides comprehensive checkpoint management capabilities including:
- Global model checkpoint saving every N rounds
- Optimizer state persistence
- Training state persistence (round number, privacy budget)
- Checkpoint integrity validation
- Best model tracking based on validation metrics
- Training resume from checkpoints
- Cross-platform checkpoint compatibility
- Corrupted checkpoint error handling

Validates Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10
"""

import os
import json
import hashlib
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

import torch
import torch.nn as nn

from .validation import check_disk_space
from .exceptions import StorageError


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CheckpointError(Exception):
    """Raised when checkpoint operations fail"""
    pass


class CheckpointManager:
    """
    Manages model checkpointing and training state persistence.
    
    Features:
    - Periodic checkpoint saving every N rounds
    - Optimizer and training state persistence
    - Checkpoint integrity validation via SHA-256 hashing
    - Best model tracking based on validation metrics
    - Automatic checkpoint loading for training resume
    - Cross-platform compatibility (GPU/CPU)
    - Corrupted checkpoint detection and recovery
    
    Attributes:
        checkpoint_dir (Path): Directory where checkpoints are saved
        checkpoint_interval (int): Save checkpoint every N rounds
        max_checkpoints (int): Maximum number of checkpoints to keep
        best_checkpoint_path (Optional[Path]): Path to best model checkpoint
        best_metric_value (float): Best validation metric value achieved
    """
    
    def __init__(
        self,
        checkpoint_dir: str = "checkpoints",
        checkpoint_interval: int = 10,
        max_checkpoints: int = 5,
        metric_name: str = "f1_score",
        metric_mode: str = "max"
    ):
        """
        Initialize CheckpointManager.
        
        Args:
            checkpoint_dir: Directory to save checkpoints
            checkpoint_interval: Save checkpoint every N rounds
            max_checkpoints: Maximum number of recent checkpoints to keep (0 = unlimited)
            metric_name: Name of metric to track for best model
            metric_mode: 'max' for metrics to maximize (F1, accuracy), 'min' for loss
        """
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        
        self.checkpoint_interval = checkpoint_interval
        self.max_checkpoints = max_checkpoints
        self.metric_name = metric_name
        self.metric_mode = metric_mode
        
        # Best model tracking (Requirement 15.5)
        self.best_checkpoint_path: Optional[Path] = None
        self.best_metric_value = float('-inf') if metric_mode == 'max' else float('inf')
        
        # Checkpoint registry for tracking saved checkpoints
        self.checkpoint_registry_path = self.checkpoint_dir / "checkpoint_registry.json"
        self.checkpoint_registry: List[Dict[str, Any]] = self._load_registry()
        
        logger.info(f"CheckpointManager initialized at {self.checkpoint_dir}")
        logger.info(f"Tracking best model by {metric_name} ({metric_mode})")
    
    def _load_registry(self) -> List[Dict[str, Any]]:
        """Load checkpoint registry from disk."""
        if self.checkpoint_registry_path.exists():
            try:
                with open(self.checkpoint_registry_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load checkpoint registry: {e}")
                return []
        return []
    
    def _save_registry(self):
        """Save checkpoint registry to disk."""
        try:
            with open(self.checkpoint_registry_path, 'w') as f:
                json.dump(self.checkpoint_registry, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save checkpoint registry: {e}")
    
    def _compute_checksum(self, filepath: Path) -> str:
        """
        Compute SHA-256 checksum of a file.
        
        Args:
            filepath: Path to file
            
        Returns:
            Hexadecimal checksum string
            
        Validates: Requirement 15.4 - Validate checkpoint integrity before loading
        """
        sha256_hash = hashlib.sha256()
        
        with open(filepath, "rb") as f:
            # Read in 64kb chunks to handle large files
            for byte_block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(byte_block)
        
        return sha256_hash.hexdigest()
    
    def save_checkpoint(
        self,
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
        round_num: int,
        training_state: Dict[str, Any],
        validation_metric: Optional[float] = None,
        is_best: bool = False
    ) -> str:
        """
        Save checkpoint with model, optimizer, and training state.
        
        Args:
            model: PyTorch model to save
            optimizer: Optimizer to save
            round_num: Current training round number
            training_state: Dictionary containing training state (privacy budget, etc.)
            validation_metric: Optional validation metric value
            is_best: Whether this is the best model so far
            
        Returns:
            Path to saved checkpoint file
            
        Validates:
            - Requirement 15.1: Save global model checkpoints every N training rounds
            - Requirement 15.2: Save optimizer state with model checkpoints
            - Requirement 15.3: Save training round number and privacy budget state
        """
        checkpoint_filename = f"checkpoint_round_{round_num}.pt"
        checkpoint_path = self.checkpoint_dir / checkpoint_filename
        
        # Prepare checkpoint data
        checkpoint = {
            'round_num': round_num,
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'training_state': training_state,
            'validation_metric': validation_metric,
            'metric_name': self.metric_name,
            'timestamp': datetime.now().isoformat(),
            'pytorch_version': torch.__version__
        }
        
        # Estimate checkpoint size (Requirement 18.6)
        # Rough estimate: serialize to get actual size
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            tmp_path = tmp_file.name
        
        try:
            torch.save(checkpoint, tmp_path)
            estimated_size = os.path.getsize(tmp_path)
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
        
        # Check disk space before saving (Requirement 18.6)
        try:
            check_disk_space(
                path=self.checkpoint_dir,
                required_bytes=estimated_size,
                buffer_fraction=0.1
            )
        except StorageError as e:
            logger.error(f"Disk space check failed: {e}")
            raise CheckpointError(f"Cannot save checkpoint due to insufficient disk space: {e}")
        
        try:
            # Save checkpoint
            torch.save(checkpoint, checkpoint_path)
            
            # Compute checksum for integrity validation
            checksum = self._compute_checksum(checkpoint_path)
            
            # Update registry
            registry_entry = {
                'round_num': round_num,
                'filepath': str(checkpoint_path),
                'timestamp': checkpoint['timestamp'],
                'validation_metric': validation_metric,
                'checksum': checksum,
                'is_best': is_best
            }
            self.checkpoint_registry.append(registry_entry)
            self._save_registry()
            
            logger.info(f"Checkpoint saved: {checkpoint_path}")
            
            # Handle best model tracking (Requirement 15.5)
            if validation_metric is not None:
                if self._is_better_metric(validation_metric):
                    self._save_best_checkpoint(checkpoint_path, validation_metric)
            elif is_best:
                self._save_best_checkpoint(checkpoint_path, validation_metric)
            
            # Clean up old checkpoints if limit exceeded
            self._cleanup_old_checkpoints()
            
            return str(checkpoint_path)
            
        except Exception as e:
            error_msg = f"Failed to save checkpoint at round {round_num}: {str(e)}"
            logger.error(error_msg)
            raise CheckpointError(error_msg) from e
    
    def _is_better_metric(self, metric_value: float) -> bool:
        """
        Check if metric value is better than current best.
        
        Args:
            metric_value: New metric value to compare
            
        Returns:
            True if new value is better, False otherwise
        """
        if self.metric_mode == 'max':
            return metric_value > self.best_metric_value
        else:
            return metric_value < self.best_metric_value
    
    def _save_best_checkpoint(self, checkpoint_path: Path, metric_value: Optional[float]):
        """
        Save copy of checkpoint as best model.
        
        Args:
            checkpoint_path: Path to checkpoint to copy
            metric_value: Validation metric value
            
        Validates: Requirement 15.5 - Save best-performing model based on validation metrics
        """
        best_checkpoint_path = self.checkpoint_dir / "best_model.pt"
        
        try:
            shutil.copy2(checkpoint_path, best_checkpoint_path)
            self.best_checkpoint_path = best_checkpoint_path
            
            if metric_value is not None:
                self.best_metric_value = metric_value
            
            # Save best model metadata
            best_model_info = {
                'checkpoint_path': str(checkpoint_path),
                'metric_name': self.metric_name,
                'metric_value': metric_value,
                'timestamp': datetime.now().isoformat()
            }
            
            best_info_path = self.checkpoint_dir / "best_model_info.json"
            with open(best_info_path, 'w') as f:
                json.dump(best_model_info, f, indent=2)
            
            logger.info(f"Best model updated: {self.metric_name} = {metric_value}")
            
        except Exception as e:
            logger.error(f"Failed to save best checkpoint: {e}")
    
    def _cleanup_old_checkpoints(self):
        """
        Remove old checkpoints if limit exceeded.
        
        Keeps the most recent checkpoints up to max_checkpoints limit.
        Always preserves the best model checkpoint.
        """
        if self.max_checkpoints <= 0:
            return  # No limit
        
        # Sort checkpoints by round number (descending)
        sorted_registry = sorted(
            self.checkpoint_registry,
            key=lambda x: x['round_num'],
            reverse=True
        )
        
        # Keep only the most recent checkpoints
        if len(sorted_registry) > self.max_checkpoints:
            checkpoints_to_remove = sorted_registry[self.max_checkpoints:]
            
            for entry in checkpoints_to_remove:
                checkpoint_path = Path(entry['filepath'])
                
                # Don't delete best model checkpoint
                if entry.get('is_best', False):
                    continue
                
                try:
                    if checkpoint_path.exists():
                        checkpoint_path.unlink()
                        logger.info(f"Removed old checkpoint: {checkpoint_path}")
                except Exception as e:
                    logger.warning(f"Failed to remove checkpoint {checkpoint_path}: {e}")
            
            # Update registry
            self.checkpoint_registry = sorted_registry[:self.max_checkpoints]
            self._save_registry()
    
    def validate_checkpoint(self, checkpoint_path: str) -> bool:
        """
        Validate checkpoint integrity using checksum.
        
        Args:
            checkpoint_path: Path to checkpoint file
            
        Returns:
            True if checkpoint is valid, False otherwise
            
        Validates: Requirement 15.4 - Validate checkpoint integrity before loading
        """
        checkpoint_path = Path(checkpoint_path)
        
        if not checkpoint_path.exists():
            logger.error(f"Checkpoint file not found: {checkpoint_path}")
            return False
        
        # Find checkpoint in registry
        registry_entry = None
        for entry in self.checkpoint_registry:
            if Path(entry['filepath']) == checkpoint_path:
                registry_entry = entry
                break
        
        if registry_entry is None:
            logger.warning(f"Checkpoint not found in registry: {checkpoint_path}")
            # Try to load anyway, but without checksum validation
            try:
                torch.load(checkpoint_path, map_location='cpu')
                return True
            except Exception as e:
                logger.error(f"Checkpoint validation failed: {e}")
                return False
        
        # Verify checksum
        try:
            current_checksum = self._compute_checksum(checkpoint_path)
            expected_checksum = registry_entry['checksum']
            
            if current_checksum != expected_checksum:
                logger.error(f"Checkpoint integrity check failed: checksum mismatch")
                logger.error(f"Expected: {expected_checksum}")
                logger.error(f"Got: {current_checksum}")
                return False
            
            logger.info(f"Checkpoint integrity validated: {checkpoint_path}")
            return True
            
        except Exception as e:
            logger.error(f"Checkpoint validation error: {e}")
            return False
    
    def load_checkpoint(
        self,
        checkpoint_path: str,
        model: nn.Module,
        optimizer: Optional[torch.optim.Optimizer] = None,
        device: Optional[torch.device] = None,
        strict: bool = True
    ) -> Dict[str, Any]:
        """
        Load checkpoint and restore model, optimizer, and training state.
        
        Args:
            checkpoint_path: Path to checkpoint file
            model: Model to load state into
            optimizer: Optional optimizer to load state into
            device: Device to map tensors to (for cross-platform compatibility)
            strict: Whether to strictly enforce model state dict keys match
            
        Returns:
            Dictionary containing training state
            
        Raises:
            CheckpointError: If checkpoint is corrupted or invalid
            
        Validates:
            - Requirement 15.6: Load checkpoints for training resume
            - Requirement 15.7: Support loading checkpoints for inference
            - Requirement 15.8: Support cross-platform checkpoint compatibility
            - Requirement 15.9: Log error and skip corrupted checkpoint
        """
        checkpoint_path = Path(checkpoint_path)
        
        if not checkpoint_path.exists():
            raise CheckpointError(f"Checkpoint file not found: {checkpoint_path}")
        
        # Validate checkpoint integrity (Requirement 15.4, 15.9)
        if not self.validate_checkpoint(str(checkpoint_path)):
            error_msg = f"Checkpoint validation failed: {checkpoint_path}"
            logger.error(error_msg)
            raise CheckpointError(error_msg)
        
        try:
            # Load checkpoint with device mapping for cross-platform compatibility (Requirement 15.10)
            if device is None:
                device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            
            checkpoint = torch.load(checkpoint_path, map_location=device)
            
            # Load model state
            model.load_state_dict(checkpoint['model_state_dict'], strict=strict)
            logger.info(f"Model state loaded from {checkpoint_path}")
            
            # Load optimizer state if provided (Requirement 15.2)
            if optimizer is not None and 'optimizer_state_dict' in checkpoint:
                optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                logger.info(f"Optimizer state loaded from {checkpoint_path}")
            
            # Extract training state (Requirement 15.3)
            training_state = checkpoint.get('training_state', {})
            training_state['round_num'] = checkpoint.get('round_num', 0)
            training_state['validation_metric'] = checkpoint.get('validation_metric')
            training_state['timestamp'] = checkpoint.get('timestamp')
            
            logger.info(f"Successfully loaded checkpoint from round {training_state['round_num']}")
            
            return training_state
            
        except Exception as e:
            error_msg = f"Failed to load checkpoint {checkpoint_path}: {str(e)}"
            logger.error(error_msg)
            raise CheckpointError(error_msg) from e
    
    def load_latest_checkpoint(
        self,
        model: nn.Module,
        optimizer: Optional[torch.optim.Optimizer] = None,
        device: Optional[torch.device] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Load the most recent checkpoint for training resume.
        
        Args:
            model: Model to load state into
            optimizer: Optional optimizer to load state into
            device: Device to map tensors to
            
        Returns:
            Training state dictionary if checkpoint found, None otherwise
            
        Validates: Requirement 15.4 - Resume training from latest checkpoint
        """
        if not self.checkpoint_registry:
            logger.info("No checkpoints found in registry")
            return None
        
        # Sort by round number (descending) to get latest
        sorted_registry = sorted(
            self.checkpoint_registry,
            key=lambda x: x['round_num'],
            reverse=True
        )
        
        # Try to load checkpoints in order until one succeeds
        for entry in sorted_registry:
            checkpoint_path = entry['filepath']
            
            try:
                logger.info(f"Attempting to load latest checkpoint: {checkpoint_path}")
                training_state = self.load_checkpoint(
                    checkpoint_path,
                    model,
                    optimizer,
                    device
                )
                return training_state
                
            except CheckpointError as e:
                logger.warning(f"Failed to load checkpoint, trying next: {e}")
                continue
        
        logger.error("Failed to load any checkpoint from registry")
        return None
    
    def load_best_checkpoint(
        self,
        model: nn.Module,
        optimizer: Optional[torch.optim.Optimizer] = None,
        device: Optional[torch.device] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Load the best checkpoint based on validation metric.
        
        Args:
            model: Model to load state into
            optimizer: Optional optimizer to load state into
            device: Device to map tensors to
            
        Returns:
            Training state dictionary if checkpoint found, None otherwise
            
        Validates: Requirement 15.5 - Load best-performing model
        """
        best_checkpoint_path = self.checkpoint_dir / "best_model.pt"
        
        if not best_checkpoint_path.exists():
            logger.info("No best checkpoint found")
            return None
        
        try:
            logger.info(f"Loading best checkpoint: {best_checkpoint_path}")
            training_state = self.load_checkpoint(
                str(best_checkpoint_path),
                model,
                optimizer,
                device,
                strict=False  # More lenient for best model
            )
            return training_state
            
        except CheckpointError as e:
            logger.error(f"Failed to load best checkpoint: {e}")
            return None
    
    def should_save_checkpoint(self, round_num: int) -> bool:
        """
        Check if checkpoint should be saved at this round.
        
        Args:
            round_num: Current training round number
            
        Returns:
            True if checkpoint should be saved, False otherwise
            
        Validates: Requirement 15.1 - Save checkpoint every N rounds
        """
        return round_num % self.checkpoint_interval == 0
    
    def get_checkpoint_info(self) -> Dict[str, Any]:
        """
        Get information about all checkpoints.
        
        Returns:
            Dictionary containing checkpoint information
        """
        info = {
            'checkpoint_dir': str(self.checkpoint_dir),
            'num_checkpoints': len(self.checkpoint_registry),
            'checkpoint_interval': self.checkpoint_interval,
            'max_checkpoints': self.max_checkpoints,
            'metric_name': self.metric_name,
            'metric_mode': self.metric_mode,
            'best_metric_value': self.best_metric_value,
            'best_checkpoint_path': str(self.best_checkpoint_path) if self.best_checkpoint_path else None,
            'checkpoints': self.checkpoint_registry
        }
        return info
    
    def list_checkpoints(self) -> List[Dict[str, Any]]:
        """
        List all available checkpoints.
        
        Returns:
            List of checkpoint metadata dictionaries
        """
        return sorted(self.checkpoint_registry, key=lambda x: x['round_num'])
    
    def delete_checkpoint(self, round_num: int) -> bool:
        """
        Delete a specific checkpoint by round number.
        
        Args:
            round_num: Round number of checkpoint to delete
            
        Returns:
            True if deleted successfully, False otherwise
        """
        # Find checkpoint in registry
        checkpoint_entry = None
        for entry in self.checkpoint_registry:
            if entry['round_num'] == round_num:
                checkpoint_entry = entry
                break
        
        if checkpoint_entry is None:
            logger.warning(f"Checkpoint for round {round_num} not found in registry")
            return False
        
        # Don't delete best checkpoint
        if checkpoint_entry.get('is_best', False):
            logger.warning(f"Cannot delete best checkpoint (round {round_num})")
            return False
        
        # Delete file
        checkpoint_path = Path(checkpoint_entry['filepath'])
        try:
            if checkpoint_path.exists():
                checkpoint_path.unlink()
                logger.info(f"Deleted checkpoint: {checkpoint_path}")
            
            # Remove from registry
            self.checkpoint_registry.remove(checkpoint_entry)
            self._save_registry()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete checkpoint: {e}")
            return False
    
    def clear_all_checkpoints(self, keep_best: bool = True):
        """
        Delete all checkpoints.
        
        Args:
            keep_best: Whether to keep the best checkpoint
        """
        for entry in list(self.checkpoint_registry):
            if keep_best and entry.get('is_best', False):
                continue
            
            checkpoint_path = Path(entry['filepath'])
            try:
                if checkpoint_path.exists():
                    checkpoint_path.unlink()
                    logger.info(f"Deleted checkpoint: {checkpoint_path}")
            except Exception as e:
                logger.warning(f"Failed to delete checkpoint {checkpoint_path}: {e}")
        
        # Update registry
        if keep_best:
            self.checkpoint_registry = [e for e in self.checkpoint_registry if e.get('is_best', False)]
        else:
            self.checkpoint_registry = []
        
        self._save_registry()
        logger.info("Cleared all checkpoints")
