"""
ADMS Module: Anomaly-Driven Mask Selection for parameter efficiency

This module identifies critical parameters for parameter-efficient federated learning
by computing parameter importance based on gradients on anomalous samples.
Reduces communication cost by 90%+ through selective parameter updates.
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from typing import Dict, Tuple
import logging

logger = logging.getLogger(__name__)


class ADMSModule:
    """Anomaly-Driven Mask Selection for parameter efficiency"""
    
    def __init__(self, model: nn.Module, selection_ratio: float = 0.05):
        """
        Initialize ADMS module for parameter selection
        
        Args:
            model: PyTorch model
            selection_ratio: Fraction of parameters to select (e.g., 0.05 = 5%)
        
        Requirements: 3.1, 3.4, 3.7
        """
        self.model = model
        self.selection_ratio = selection_ratio
        self.parameter_mask = None  # Binary mask for selected parameters
        self.importance_scores = {}  # Parameter name -> importance score
        
        logger.info(f"Initialized ADMS Module with selection_ratio={selection_ratio:.2%}")
    
    def compute_importance(self, anomaly_loader: DataLoader, criterion: nn.Module, device: str = 'cpu'):
        """
        Compute parameter importance on anomalous samples
        
        Algorithm:
        1. Forward pass on anomalous samples
        2. Compute loss and backpropagate
        3. Accumulate |gradient| for each parameter
        4. Rank parameters by accumulated gradient magnitude
        
        Args:
            anomaly_loader: DataLoader with anomalous samples
            criterion: Loss function
            device: Device to run computation on ('cpu' or 'cuda')
        
        Requirements: 3.2, 3.3
        """
        logger.info("Computing parameter importance on anomalous samples...")
        
        self.model.eval()
        self.model.to(device)
        
        # Initialize importance scores with zeros
        importance = {name: torch.zeros_like(param, device=device) 
                     for name, param in self.model.named_parameters() 
                     if param.requires_grad}
        
        total_samples = 0
        
        for batch_idx, batch in enumerate(anomaly_loader):
            # Unpack batch (handle both (x, y) and x only formats)
            if isinstance(batch, (list, tuple)) and len(batch) == 2:
                x, y = batch
                x = x.to(device)
                y = y.to(device)
            else:
                x = batch.to(device)
                y = None
            
            # Forward pass
            output = self.model(x)
            
            # Compute loss
            if y is not None:
                loss = criterion(output, y)
            else:
                # For unsupervised scenarios, use reconstruction loss or anomaly score
                loss = criterion(output)
            
            # Backward pass
            self.model.zero_grad()
            loss.backward()
            
            # Accumulate gradient magnitudes
            for name, param in self.model.named_parameters():
                if param.requires_grad and param.grad is not None:
                    importance[name] += param.grad.abs()
            
            total_samples += x.size(0)
        
        # Normalize importance scores by number of samples
        for name in importance:
            importance[name] /= total_samples
        
        self.importance_scores = importance
        
        logger.info(f"Computed importance scores for {len(importance)} parameter tensors "
                   f"across {len(anomaly_loader)} batches ({total_samples} samples)")
    
    def generate_mask(self) -> Dict[str, torch.Tensor]:
        """
        Generate binary mask for top-k% parameters based on importance scores
        
        Returns:
            parameter_mask: Dict[param_name -> binary_mask]
        
        Requirements: 3.4, 3.5
        """
        logger.info("Generating parameter mask...")
        
        if not self.importance_scores:
            raise RuntimeError("Importance scores not computed. Call compute_importance() first.")
        
        # Flatten all importance scores
        flat_importance = []
        param_positions = {}  # Track which parameters contribute which values
        current_pos = 0
        
        for name, score in self.importance_scores.items():
            flat_scores = score.flatten().cpu()
            flat_importance.extend(flat_scores.tolist())
            param_positions[name] = (current_pos, current_pos + len(flat_scores))
            current_pos += len(flat_scores)
        
        # Compute threshold for top-k%
        k = max(1, int(len(flat_importance) * self.selection_ratio))
        sorted_importance = sorted(flat_importance, reverse=True)
        threshold = sorted_importance[k - 1] if k <= len(sorted_importance) else sorted_importance[-1]
        
        logger.info(f"Selection threshold: {threshold:.6e} (top {k}/{len(flat_importance)} parameters)")
        
        # Generate binary masks
        self.parameter_mask = {}
        total_selected = 0
        
        for name, score in self.importance_scores.items():
            # Create mask: 1 for parameters >= threshold, 0 otherwise
            self.parameter_mask[name] = (score >= threshold).float()
            selected_count = self.parameter_mask[name].sum().item()
            total_selected += selected_count
            
            logger.debug(f"{name}: {selected_count}/{score.numel()} parameters selected "
                        f"({selected_count/score.numel():.2%})")
        
        logger.info(f"Generated mask selecting {total_selected}/{len(flat_importance)} parameters "
                   f"({total_selected/len(flat_importance):.2%})")
        
        return self.parameter_mask
    
    def apply_mask(self, gradients: Dict[str, torch.Tensor]) -> Dict[str, torch.Tensor]:
        """
        Apply mask to gradients (zero out non-selected parameters)
        
        Args:
            gradients: Dict[param_name -> gradient]
        
        Returns:
            masked_gradients: Dict[param_name -> masked_gradient]
        
        Requirements: 3.6
        """
        if self.parameter_mask is None:
            raise RuntimeError("Parameter mask not generated. Call generate_mask() first.")
        
        masked_grads = {}
        
        for name, grad in gradients.items():
            if name in self.parameter_mask:
                # Apply mask: element-wise multiplication
                masked_grads[name] = grad * self.parameter_mask[name].to(grad.device)
            else:
                # If parameter not in mask, keep original gradient
                masked_grads[name] = grad
        
        return masked_grads
    
    def get_selection_statistics(self) -> Dict[str, float]:
        """
        Return statistics about parameter selection
        
        Returns:
            Dictionary containing:
                - total_parameters: Total number of model parameters
                - selected_parameters: Number of selected parameters
                - selection_ratio: Actual selection ratio
                - communication_reduction: Fraction of communication saved
        
        Requirements: 3.8
        """
        if self.parameter_mask is None:
            raise RuntimeError("Parameter mask not generated. Call generate_mask() first.")
        
        total_params = sum(mask.numel() for mask in self.parameter_mask.values())
        selected_params = sum(mask.sum().item() for mask in self.parameter_mask.values())
        
        stats = {
            'total_parameters': total_params,
            'selected_parameters': selected_params,
            'selection_ratio': selected_params / total_params if total_params > 0 else 0.0,
            'communication_reduction': 1 - (selected_params / total_params) if total_params > 0 else 0.0
        }
        
        logger.info(f"Selection Statistics: {stats}")
        
        return stats
    
    def update_mask_periodically(self, anomaly_loader: DataLoader, criterion: nn.Module, 
                                 device: str = 'cpu'):
        """
        Update parameter masks periodically during federated training
        
        This method recomputes importance scores and regenerates masks,
        allowing the system to adapt to changing anomaly patterns.
        
        Args:
            anomaly_loader: DataLoader with current anomalous samples
            criterion: Loss function
            device: Device to run computation on
        
        Requirements: 3.10
        """
        logger.info("Updating parameter mask periodically...")
        self.compute_importance(anomaly_loader, criterion, device)
        self.generate_mask()
        logger.info("Parameter mask updated successfully")
