"""
Byzantine Robust Aggregator Module for SentryFL

Implements Byzantine-robust aggregation methods to defend against malicious
client updates in federated learning.

Key Features:
- Trimmed Mean aggregation (exclude top and bottom percentiles)
- Outlier detection in parameter updates
- Robust to malicious client submissions

Requirements: 7.4, 7.5
"""

import torch
from typing import Dict, List, Any
import logging
import numpy as np

logger = logging.getLogger(__name__)


class ByzantineRobustAggregator:
    """
    Byzantine-robust aggregator using Trimmed Mean.
    
    Trimmed Mean aggregation excludes outlier updates by removing
    the top and bottom percentiles of parameter values across clients.
    This provides robustness against malicious clients submitting
    extreme parameter values.
    
    Algorithm:
        For each parameter dimension:
            1. Collect values from all clients
            2. Sort values
            3. Exclude top trim_ratio% and bottom trim_ratio%
            4. Average remaining values
    
    Args:
        trim_ratio: Fraction to trim from each end (e.g., 0.1 = 10%)
        
    Example:
        >>> aggregator = ByzantineRobustAggregator(trim_ratio=0.1)
        >>> aggregated = aggregator.aggregate(client_updates, device='cpu')
    """
    
    def __init__(self, trim_ratio: float = 0.1):
        """
        Initialize Byzantine-robust aggregator.
        
        Args:
            trim_ratio: Fraction to trim from top and bottom (0.0 to 0.5)
                       0.1 means exclude top 10% and bottom 10%
        
        Raises:
            ValueError: If trim_ratio is not in [0.0, 0.5)
            
        Requirements: 7.4, 7.5
        """
        if not (0.0 <= trim_ratio < 0.5):
            raise ValueError(
                f"trim_ratio must be in [0.0, 0.5), got {trim_ratio}"
            )
        
        self.trim_ratio = trim_ratio
        
        logger.info(
            f"Initialized ByzantineRobustAggregator with trim_ratio={trim_ratio}"
        )
    
    def aggregate(
        self,
        client_updates: Dict[str, Dict[str, Any]],
        device: str = 'cpu'
    ) -> Dict[str, torch.Tensor]:
        """
        Aggregate client updates using Trimmed Mean.
        
        For each parameter, computes trimmed mean across all clients
        by excluding top and bottom trim_ratio% of values.
        
        Args:
            client_updates: Dictionary mapping client_id to update info
                           Each update contains 'parameters' and 'num_samples'
            device: Device for computation
            
        Returns:
            Dictionary of aggregated parameters
            
        Requirements: 7.4, 7.5
        """
        logger.info(
            f"Performing Trimmed Mean aggregation with "
            f"{len(client_updates)} clients, trim_ratio={self.trim_ratio}"
        )
        
        # Get parameter names from first client
        param_names = list(
            next(iter(client_updates.values()))['parameters'].keys()
        )
        
        # Detect outliers before aggregation
        outlier_clients = self._detect_outliers(client_updates, param_names, device)
        
        if outlier_clients:
            logger.warning(
                f"Detected {len(outlier_clients)} outlier clients: {outlier_clients}"
            )
        
        # Perform trimmed mean aggregation
        aggregated_params = {}
        
        for param_name in param_names:
            aggregated_params[param_name] = self._trimmed_mean_parameter(
                client_updates,
                param_name,
                device
            )
        
        logger.info(
            f"Trimmed Mean aggregation complete for {len(aggregated_params)} parameters"
        )
        
        return aggregated_params
    
    def _trimmed_mean_parameter(
        self,
        client_updates: Dict[str, Dict[str, Any]],
        param_name: str,
        device: str
    ) -> torch.Tensor:
        """
        Compute trimmed mean for a single parameter.
        
        Args:
            client_updates: Dictionary of client updates
            param_name: Name of parameter to aggregate
            device: Device for computation
            
        Returns:
            Aggregated parameter tensor
            
        Requirements: 7.5
        """
        # Collect parameter values from all clients
        param_values = []
        
        for client_id, update in client_updates.items():
            param = update['parameters'][param_name].to(device)
            param_values.append(param.unsqueeze(0))  # Add batch dimension
        
        # Stack parameters: [num_clients, *param_shape]
        param_stack = torch.cat(param_values, dim=0)
        
        # Compute trimmed mean along client dimension
        trimmed_mean = self._trimmed_mean_tensor(param_stack, dim=0)
        
        return trimmed_mean
    
    def _trimmed_mean_tensor(
        self,
        tensor: torch.Tensor,
        dim: int = 0
    ) -> torch.Tensor:
        """
        Compute trimmed mean along specified dimension.
        
        Excludes top and bottom trim_ratio% of values before averaging.
        
        Args:
            tensor: Input tensor [num_clients, ...]
            dim: Dimension to compute mean along (typically 0 for clients)
            
        Returns:
            Trimmed mean tensor
            
        Requirements: 7.5
        """
        num_clients = tensor.size(dim)
        
        # Calculate number of values to trim from each end
        num_trim = int(num_clients * self.trim_ratio)
        
        # If trimming would remove all values, use regular mean
        if num_trim * 2 >= num_clients:
            logger.warning(
                f"Trim ratio too high for {num_clients} clients, "
                f"using regular mean"
            )
            return tensor.mean(dim=dim)
        
        # Sort along client dimension
        sorted_tensor, _ = torch.sort(tensor, dim=dim)
        
        # Exclude top and bottom trim_ratio%
        if num_trim > 0:
            # Select middle values
            if dim == 0:
                trimmed_tensor = sorted_tensor[num_trim:-num_trim]
            else:
                # Handle other dimensions if needed
                indices = list(range(tensor.dim()))
                indices[0], indices[dim] = indices[dim], indices[0]
                permuted = sorted_tensor.permute(indices)
                trimmed = permuted[num_trim:-num_trim]
                trimmed_tensor = trimmed.permute(indices)
        else:
            trimmed_tensor = sorted_tensor
        
        # Compute mean of remaining values
        trimmed_mean = trimmed_tensor.mean(dim=dim)
        
        return trimmed_mean
    
    def _detect_outliers(
        self,
        client_updates: Dict[str, Dict[str, Any]],
        param_names: List[str],
        device: str,
        threshold: float = 3.0
    ) -> List[str]:
        """
        Detect outlier clients based on parameter update magnitudes.
        
        Uses z-score based outlier detection: clients whose parameter
        L2 norms deviate more than threshold standard deviations from
        the mean are flagged as outliers.
        
        Args:
            client_updates: Dictionary of client updates
            param_names: List of parameter names
            device: Device for computation
            threshold: Z-score threshold for outlier detection (default: 3.0)
            
        Returns:
            List of outlier client IDs
            
        Requirements: 7.5
        """
        # Compute L2 norm of parameter updates for each client
        client_norms = {}
        
        for client_id, update in client_updates.items():
            total_norm = 0.0
            
            for param_name in param_names:
                param = update['parameters'][param_name].to(device)
                param_norm = torch.norm(param, p=2).item()
                total_norm += param_norm ** 2
            
            client_norms[client_id] = total_norm ** 0.5
        
        # Convert to numpy array for statistics
        norms_array = np.array(list(client_norms.values()))
        
        # Compute mean and std
        mean_norm = np.mean(norms_array)
        std_norm = np.std(norms_array)
        
        # Detect outliers using z-score
        outliers = []
        
        for client_id, norm in client_norms.items():
            if std_norm > 0:
                z_score = abs(norm - mean_norm) / std_norm
                if z_score > threshold:
                    outliers.append(client_id)
                    logger.debug(
                        f"Client {client_id} flagged as outlier: "
                        f"norm={norm:.4f}, z_score={z_score:.2f}"
                    )
        
        return outliers
    
    def get_trim_statistics(
        self,
        client_updates: Dict[str, Dict[str, Any]],
        param_name: str,
        device: str
    ) -> Dict[str, Any]:
        """
        Get statistics about trimming for a specific parameter.
        
        Useful for monitoring and debugging aggregation.
        
        Args:
            client_updates: Dictionary of client updates
            param_name: Name of parameter to analyze
            device: Device for computation
            
        Returns:
            Dictionary with trimming statistics
        """
        # Collect parameter values
        param_values = []
        client_ids = []
        
        for client_id, update in client_updates.items():
            param = update['parameters'][param_name].to(device)
            param_values.append(param.flatten())
            client_ids.append(client_id)
        
        # Stack and compute statistics
        param_stack = torch.stack([p.mean() for p in param_values])
        
        num_clients = len(param_values)
        num_trim = int(num_clients * self.trim_ratio)
        
        sorted_means, sorted_indices = torch.sort(param_stack)
        
        # Identify trimmed clients
        trimmed_bottom = [client_ids[i] for i in sorted_indices[:num_trim].tolist()]
        trimmed_top = [client_ids[i] for i in sorted_indices[-num_trim:].tolist()]
        
        stats = {
            'parameter_name': param_name,
            'num_clients': num_clients,
            'num_trimmed_each_end': num_trim,
            'trimmed_bottom_clients': trimmed_bottom,
            'trimmed_top_clients': trimmed_top,
            'min_value': sorted_means[0].item(),
            'max_value': sorted_means[-1].item(),
            'trimmed_mean': sorted_means[num_trim:-num_trim].mean().item() if num_trim > 0 else sorted_means.mean().item(),
            'full_mean': sorted_means.mean().item()
        }
        
        return stats
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return f"ByzantineRobustAggregator(trim_ratio={self.trim_ratio})"
