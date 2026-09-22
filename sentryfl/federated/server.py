"""
Aggregation Server Module for SentryFL

Implements the AggregationServer class that coordinates federated learning rounds,
aggregates client model updates, and manages the global model.

Key Features:
- Broadcast global model to selected clients
- Collect parameter updates from participating clients
- FedAvg aggregation (weighted averaging by client sample counts)
- NaN/Inf validation to exclude invalid updates
- Asynchronous client participation support
- Checkpoint saving every N rounds
- Aggregation statistics logging (parameter variance, client participation)

Requirements: 7.1, 7.2, 7.3, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11
"""

import torch
import torch.nn as nn
from typing import Dict, List, Tuple, Optional, Any
import logging
import copy
from pathlib import Path
import time
import numpy as np

logger = logging.getLogger(__name__)


class AggregationServer:
    """
    Federated learning aggregation server for global model coordination.
    
    The server:
    1. Broadcasts global model parameters to selected clients
    2. Collects parameter updates from participating clients
    3. Performs FedAvg aggregation (weighted by client sample counts)
    4. Validates updates for NaN/Inf values
    5. Supports asynchronous client participation
    6. Saves checkpoints periodically
    7. Logs aggregation statistics
    
    Args:
        model: PyTorch model (global model architecture)
        checkpoint_dir: Directory for saving model checkpoints
        checkpoint_frequency: Save checkpoint every N rounds
        device: Device for computation ('cpu' or 'cuda')
        
    Example:
        >>> model = PLMAnomalyDetector(input_dim=38)
        >>> server = AggregationServer(
        ...     model=model,
        ...     checkpoint_dir='./checkpoints',
        ...     checkpoint_frequency=10
        ... )
        >>> # Broadcast to clients
        >>> global_params = server.broadcast_global_model()
        >>> 
        >>> # Collect updates from clients
        >>> server.collect_client_updates(client_id='client_0', 
        ...                                parameters=client_params,
        ...                                num_samples=1000)
        >>> 
        >>> # Aggregate updates
        >>> server.aggregate_updates(round_num=1)
    """
    
    def __init__(
        self,
        model: nn.Module,
        checkpoint_dir: str = './checkpoints',
        checkpoint_frequency: int = 10,
        device: str = 'cpu',
        use_byzantine_robust: bool = False,
        dp_fedavg: Optional[Any] = None,
        privacy_budget: Optional[Any] = None,
        dp_min_clients: int = 2
    ):
        """
        Initialize aggregation server.

        Args:
            model: Global model architecture
            checkpoint_dir: Directory for saving checkpoints
            checkpoint_frequency: Save checkpoint every N rounds
            device: Device for computation
            use_byzantine_robust: Enable Byzantine-robust aggregation
            dp_fedavg: Optional DPFedAvgMechanism. When provided, aggregation uses
                aggregate-level DP-FedAvg (clip client deltas + add Gaussian noise
                once per round) instead of plain FedAvg / trimmed mean. This is the
                v2 default privacy mechanism (see sentryfl/privacy/dp_fedavg.py).
            privacy_budget: Optional PRVBudget stepped once per DP-FedAvg round to
                track a single cumulative (epsilon, delta) across the federation.
            dp_min_clients: Minimum participating clients required for a DP-FedAvg
                round (the added noise scales as 1/num_clients; too few clients makes
                the aggregate unusable). Ignored for non-DP aggregation.

        Requirements: 7.1, 7.11; v2 FR-1.1-1.5
        """
        self.global_model = model.to(device)
        self.device = device
        self.checkpoint_frequency = checkpoint_frequency
        self.use_byzantine_robust = use_byzantine_robust
        self.dp_fedavg = dp_fedavg
        self.privacy_budget = privacy_budget
        self.dp_min_clients = dp_min_clients
        # Cache of the global (trainable) params at the start of the round, used to
        # form per-client update deltas for DP-FedAvg.
        self._round_global: Optional[Dict[str, torch.Tensor]] = None

        # Setup checkpoint directory
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        # Client update storage
        self.pending_updates: Dict[str, Dict[str, Any]] = {}
        self.aggregation_history: List[Dict[str, Any]] = []

        # Training state
        self.current_round = 0
        self.total_clients = 0
        self.participating_clients = set()

        logger.info(
            f"Initialized AggregationServer with checkpoint_dir={checkpoint_dir}, "
            f"checkpoint_frequency={checkpoint_frequency}, device={device}, "
            f"byzantine_robust={use_byzantine_robust}, "
            f"dp_fedavg={'on' if dp_fedavg is not None else 'off'}"
        )
    
    def broadcast_global_model(self, client_ids: Optional[List[str]] = None) -> Dict[str, torch.Tensor]:
        """
        Broadcast global model parameters to selected clients.
        
        Creates a copy of global model parameters to send to clients.
        Parameters are detached from computation graph and moved to CPU
        for transmission.
        
        Args:
            client_ids: Optional list of client IDs to broadcast to
                       If None, broadcasts to all clients
        
        Returns:
            Dictionary of global model parameters (on CPU)
            
        Requirements: 7.1
        """
        logger.info(
            f"Broadcasting global model to "
            f"{len(client_ids) if client_ids else 'all'} clients"
        )
        
        # Extract global model parameters
        global_parameters = {}
        for name, param in self.global_model.named_parameters():
            # Detach and move to CPU for transmission
            global_parameters[name] = param.detach().clone().cpu()

        # Cache the round's global params so DP-FedAvg can form per-client deltas
        # (delta = client_params - global_params at broadcast time).
        self._round_global = {
            name: p.clone() for name, p in global_parameters.items()
        }

        logger.debug(
            f"Broadcasted {len(global_parameters)} parameter tensors"
        )

        return global_parameters
    
    def collect_client_updates(
        self,
        client_id: str,
        parameters: Dict[str, torch.Tensor],
        num_samples: int,
        metrics: Optional[Dict[str, Any]] = None
    ):
        """
        Collect parameter updates from a participating client.
        
        Validates updates for NaN/Inf values before accepting.
        Stores updates with client metadata for aggregation.
        
        Args:
            client_id: Unique client identifier
            parameters: Dictionary of updated parameters from client
            num_samples: Number of training samples used by client
            metrics: Optional training metrics from client
            
        Requirements: 7.2, 7.9
        """
        logger.info(
            f"Collecting updates from client {client_id} "
            f"({num_samples} samples)"
        )
        
        # Validate updates for NaN/Inf
        is_valid, invalid_params = self._validate_parameters(parameters)
        
        if not is_valid:
            logger.warning(
                f"Client {client_id} sent invalid updates "
                f"(NaN/Inf in parameters: {invalid_params}). "
                f"Excluding client from aggregation."
            )
            return
        
        # Store valid update
        self.pending_updates[client_id] = {
            'parameters': parameters,
            'num_samples': num_samples,
            'metrics': metrics or {},
            'timestamp': time.time()
        }
        
        self.participating_clients.add(client_id)
        
        logger.info(
            f"Accepted updates from client {client_id}. "
            f"Total pending: {len(self.pending_updates)}"
        )
    
    def _validate_parameters(
        self,
        parameters: Dict[str, torch.Tensor]
    ) -> Tuple[bool, List[str]]:
        """
        Validate parameters for NaN/Inf values.
        
        Args:
            parameters: Dictionary of parameter tensors
            
        Returns:
            Tuple of (is_valid, invalid_parameter_names)
            
        Requirements: 7.9
        """
        invalid_params = []
        
        for name, param in parameters.items():
            if torch.isnan(param).any():
                invalid_params.append(f"{name} (NaN)")
            if torch.isinf(param).any():
                invalid_params.append(f"{name} (Inf)")
        
        return len(invalid_params) == 0, invalid_params
    
    def aggregate_updates(
        self,
        round_num: int,
        min_clients: int = 1
    ) -> Dict[str, Any]:
        """
        Aggregate client updates using FedAvg or Byzantine-robust method.
        
        Performs weighted averaging of client parameters by their sample counts.
        Updates global model with aggregated parameters.
        Logs aggregation statistics and saves checkpoints periodically.
        
        Args:
            round_num: Current training round number
            min_clients: Minimum number of clients required for aggregation
            
        Returns:
            Dictionary with aggregation statistics
            
        Requirements: 7.3, 7.6, 7.7, 7.8, 7.10, 7.11
        """
        self.current_round = round_num
        
        logger.info(
            f"Starting aggregation for round {round_num} "
            f"with {len(self.pending_updates)} clients"
        )
        
        # DP-FedAvg needs enough clients for the (1/n)-scaled noise to be usable.
        effective_min = max(min_clients, self.dp_min_clients) if self.dp_fedavg is not None else min_clients

        # Check minimum client requirement
        if len(self.pending_updates) < effective_min:
            logger.warning(
                f"Insufficient clients for aggregation: "
                f"{len(self.pending_updates)} < {effective_min}"
            )
            return {
                'round': round_num,
                'status': 'insufficient_clients',
                'num_clients': len(self.pending_updates)
            }

        # Choose aggregation method. DP-FedAvg takes precedence when configured.
        if self.dp_fedavg is not None:
            aggregated_params = self._dp_fedavg_aggregate()
        elif self.use_byzantine_robust:
            aggregated_params = self._byzantine_robust_aggregate()
        else:
            aggregated_params = self._fedavg_aggregate()
        
        # Update global model
        self._update_global_model(aggregated_params)
        
        # Compute aggregation statistics
        stats = self._compute_aggregation_statistics()
        stats['round'] = round_num
        stats['num_participating_clients'] = len(self.pending_updates)
        if self.dp_fedavg is not None:
            stats['aggregation_method'] = 'dp_fedavg'
            stats.update(getattr(self, '_last_dp_stats', {}))
        elif self.use_byzantine_robust:
            stats['aggregation_method'] = 'trimmed_mean'
        else:
            stats['aggregation_method'] = 'fedavg'
        
        # Log statistics
        logger.info(
            f"Round {round_num} aggregation complete: "
            f"{stats['num_participating_clients']} clients, "
            f"avg_param_variance={stats['avg_parameter_variance']:.6f}"
        )
        
        # Save aggregation history
        self.aggregation_history.append(stats)
        
        # Save checkpoint if needed
        if round_num % self.checkpoint_frequency == 0:
            self.save_checkpoint(round_num)
        
        # Clear pending updates for next round
        self.pending_updates.clear()
        
        return stats
    
    def _fedavg_aggregate(self) -> Dict[str, torch.Tensor]:
        """
        Perform FedAvg aggregation (weighted averaging by sample counts).
        
        Algorithm:
        For each parameter:
            aggregated_param = sum(client_param * client_samples) / total_samples
        
        Returns:
            Dictionary of aggregated parameters
            
        Requirements: 7.3
        """
        logger.debug("Performing FedAvg aggregation")
        
        # Calculate total samples across all clients
        total_samples = sum(
            update['num_samples'] 
            for update in self.pending_updates.values()
        )
        
        # Initialize aggregated parameters
        aggregated_params = {}
        param_names = list(next(iter(self.pending_updates.values()))['parameters'].keys())
        
        for param_name in param_names:
            # Weighted sum of parameters
            weighted_sum = None
            
            for client_id, update in self.pending_updates.items():
                client_param = update['parameters'][param_name].to(self.device)
                weight = update['num_samples'] / total_samples
                
                if weighted_sum is None:
                    weighted_sum = weight * client_param
                else:
                    weighted_sum += weight * client_param
            
            aggregated_params[param_name] = weighted_sum
        
        logger.debug(
            f"FedAvg aggregation complete for {len(aggregated_params)} parameters"
        )
        
        return aggregated_params
    
    def _byzantine_robust_aggregate(self) -> Dict[str, torch.Tensor]:
        """
        Perform Byzantine-robust aggregation using Trimmed Mean.
        
        This method is imported from ByzantineRobustAggregator if enabled.
        Falls back to FedAvg if not available.
        
        Returns:
            Dictionary of aggregated parameters
            
        Requirements: 7.4, 7.5
        """
        logger.debug("Byzantine-robust aggregation requested")
        
        # Import Byzantine aggregator
        try:
            from sentryfl.federated.byzantine_aggregator import ByzantineRobustAggregator
            
            aggregator = ByzantineRobustAggregator(trim_ratio=0.1)
            aggregated_params = aggregator.aggregate(self.pending_updates, self.device)
            
            logger.debug("Byzantine-robust aggregation complete")
            return aggregated_params
            
        except ImportError:
            logger.warning(
                "ByzantineRobustAggregator not available, "
                "falling back to FedAvg"
            )
            return self._fedavg_aggregate()
    
    def _dp_fedavg_aggregate(self) -> Dict[str, torch.Tensor]:
        """
        Aggregate-level DP-FedAvg: clip each client's update delta, average the
        clipped deltas, add one Gaussian noise draw, and return the new absolute
        global parameters (global + noised mean delta).

        Steps the privacy budget once (one round = one subsampled-Gaussian
        mechanism at the client/entity level).

        Returns:
            Dictionary of new absolute global parameters.

        Requirements: v2 FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5
        """
        logger.debug("Performing DP-FedAvg aggregation (clip delta + Gaussian noise)")

        # Reference global params at round start; fall back to current model params.
        if self._round_global is not None:
            reference = self._round_global
        else:
            reference = {
                name: p.detach().clone().cpu()
                for name, p in self.global_model.named_parameters()
            }

        # Form per-client deltas over the parameter names the clients actually sent
        # (adapters/head for FFA-LoRA; whatever was transmitted otherwise).
        deltas: List[Dict[str, torch.Tensor]] = []
        for client_id, update in self.pending_updates.items():
            params = update['parameters']
            delta = {}
            for name, tensor in params.items():
                if name in reference:
                    delta[name] = tensor.detach().cpu() - reference[name].cpu()
                else:
                    # Parameter not in the broadcast reference (e.g. new adapter):
                    # treat the reference as zero so the full value is the delta.
                    delta[name] = tensor.detach().cpu().clone()
            deltas.append(delta)

        # Clip each delta and aggregate (mean + noise).
        aggregated_delta, pre_clip_norms = self.dp_fedavg.clip_and_aggregate(deltas)

        # Apply the noised mean delta to the reference to get new absolute params.
        aggregated_params: Dict[str, torch.Tensor] = {}
        for name, d in aggregated_delta.items():
            base = reference[name].to(d.device) if name in reference else torch.zeros_like(d)
            aggregated_params[name] = base + d

        # Account one round of privacy budget.
        self._last_dp_stats = {
            'clip_norm': self.dp_fedavg.clip_norm,
            'noise_multiplier': self.dp_fedavg.noise_multiplier,
            'mean_pre_clip_norm': float(sum(pre_clip_norms) / len(pre_clip_norms)) if pre_clip_norms else 0.0,
            'max_pre_clip_norm': float(max(pre_clip_norms)) if pre_clip_norms else 0.0,
        }
        if self.privacy_budget is not None:
            self.privacy_budget.step()
            # epsilon is undefined/infinite when noise_multiplier == 0 (no privacy);
            # guard the accountant call so a noiseless clipping-only ablation still runs.
            try:
                if getattr(self.dp_fedavg, 'noise_multiplier', 0.0) > 0:
                    self._last_dp_stats['epsilon'] = self.privacy_budget.epsilon(
                        getattr(self.privacy_budget, 'target_delta', 1e-5)
                    )
                else:
                    self._last_dp_stats['epsilon'] = float('inf')
            except (OverflowError, ValueError) as exc:
                logger.warning(f"Could not compute epsilon this round: {exc}")
                self._last_dp_stats['epsilon'] = float('inf')

        logger.debug("DP-FedAvg aggregation complete")
        return aggregated_params

    def _update_global_model(self, aggregated_params: Dict[str, torch.Tensor]):
        """
        Update global model with aggregated parameters.
        
        Args:
            aggregated_params: Dictionary of aggregated parameters
            
        Requirements: 7.6
        """
        logger.debug("Updating global model with aggregated parameters")
        
        # Load aggregated parameters into global model
        model_state = self.global_model.state_dict()
        
        for name, param in aggregated_params.items():
            if name in model_state:
                model_state[name] = param
        
        self.global_model.load_state_dict(model_state)
        
        logger.debug("Global model updated successfully")
    
    def _compute_aggregation_statistics(self) -> Dict[str, Any]:
        """
        Compute aggregation statistics for logging and monitoring.
        
        Computes:
        - Parameter variance across clients
        - Client participation rate
        - Sample distribution
        
        Returns:
            Dictionary with aggregation statistics
            
        Requirements: 7.8
        """
        stats = {}
        
        # Get parameter names
        param_names = list(next(iter(self.pending_updates.values()))['parameters'].keys())
        
        # Compute parameter variance across clients
        param_variances = []
        
        for param_name in param_names:
            # Collect parameter values from all clients
            param_values = []
            for update in self.pending_updates.values():
                param = update['parameters'][param_name].flatten().cpu().numpy()
                param_values.append(param)
            
            # Stack and compute variance
            param_stack = np.vstack(param_values)
            variance = np.var(param_stack, axis=0).mean()
            param_variances.append(variance)
        
        stats['avg_parameter_variance'] = np.mean(param_variances)
        stats['max_parameter_variance'] = np.max(param_variances)
        stats['min_parameter_variance'] = np.min(param_variances)
        
        # Client participation statistics
        total_samples = sum(update['num_samples'] for update in self.pending_updates.values())
        stats['total_samples'] = total_samples
        stats['client_sample_counts'] = {
            client_id: update['num_samples']
            for client_id, update in self.pending_updates.items()
        }
        stats['avg_samples_per_client'] = total_samples / len(self.pending_updates) if self.pending_updates else 0
        
        return stats
    
    def save_checkpoint(
        self,
        round_num: int,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Save global model checkpoint.
        
        Saves:
        - Global model state dict
        - Round number
        - Aggregation history
        - Optional metadata (privacy budget, etc.)
        
        Args:
            round_num: Current training round
            metadata: Optional additional metadata to save
            
        Requirements: 7.11
        """
        checkpoint_path = self.checkpoint_dir / f"global_model_round_{round_num}.pt"
        
        logger.info(f"Saving checkpoint to {checkpoint_path}")
        
        checkpoint = {
            'round': round_num,
            'model_state_dict': self.global_model.state_dict(),
            'aggregation_history': self.aggregation_history,
            'participating_clients': list(self.participating_clients),
            'timestamp': time.time(),
            'metadata': metadata or {},
            # Persist the federation-level privacy budget so resume keeps the
            # cumulative (epsilon, delta) instead of silently resetting it.
            'privacy_budget': (
                self.privacy_budget.state_dict()
                if self.privacy_budget is not None else None
            ),
        }
        
        try:
            torch.save(checkpoint, checkpoint_path)
            logger.info(f"Checkpoint saved successfully to {checkpoint_path}")
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            raise
    
    def load_checkpoint(self, checkpoint_path: str) -> Dict[str, Any]:
        """
        Load global model checkpoint for resuming training.
        
        Args:
            checkpoint_path: Path to checkpoint file
            
        Returns:
            Dictionary with checkpoint metadata
            
        Requirements: 7.11
        """
        logger.info(f"Loading checkpoint from {checkpoint_path}")
        
        try:
            checkpoint = torch.load(checkpoint_path, map_location=self.device)
            
            # Load model state
            self.global_model.load_state_dict(checkpoint['model_state_dict'])
            
            # Restore training state
            self.current_round = checkpoint['round']
            self.aggregation_history = checkpoint.get('aggregation_history', [])
            self.participating_clients = set(checkpoint.get('participating_clients', []))

            # Restore the privacy budget (cumulative epsilon) if present.
            budget_state = checkpoint.get('privacy_budget')
            if budget_state is not None:
                from sentryfl.privacy.dp_fedavg import PRVBudget
                self.privacy_budget = PRVBudget.from_state_dict(budget_state)
            
            logger.info(
                f"Checkpoint loaded successfully: round {self.current_round}, "
                f"{len(self.aggregation_history)} history entries"
            )
            
            return checkpoint.get('metadata', {})
            
        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            raise
    
    def get_global_model(self) -> nn.Module:
        """
        Get reference to global model.
        
        Returns:
            Global model
        """
        return self.global_model
    
    def get_aggregation_history(self) -> List[Dict[str, Any]]:
        """
        Get complete aggregation history.
        
        Returns:
            List of aggregation statistics per round
        """
        return copy.deepcopy(self.aggregation_history)
    
    def reset_round(self):
        """
        Reset server state for new training round.
        
        Clears pending updates but preserves global model and history.
        """
        self.pending_updates.clear()
        logger.debug("Server state reset for new round")
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"AggregationServer("
            f"round={self.current_round}, "
            f"clients={len(self.participating_clients)}, "
            f"checkpoint_dir='{self.checkpoint_dir}', "
            f"byzantine_robust={self.use_byzantine_robust})"
        )
