"""
Scaling Evaluator Module for Communication Efficiency Analysis

This module implements the ScalingEvaluator class for evaluating communication
efficiency across varying client counts (5, 20, 50, 100, 500) to validate
framework scalability.

Key Features:
- Client count simulation (5, 20, 50, 100, 500)
- Dataset partitioning across variable client counts
- Bytes transferred per round measurement
- Convergence round counting
- Total communication cost calculation (bytes × rounds)
- Parameter-efficient vs full-model comparison
- Per-client payload size logging
- Wall-clock time measurement per round
- Communication efficiency plot generation

Validates Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10
"""

import time
import sys
import numpy as np
import torch
import torch.nn as nn
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from pathlib import Path
import matplotlib.pyplot as plt
import seaborn as sns
import logging

# Import SentryFL components
sys.path.insert(0, str(Path(__file__).parent.parent))
from sentryfl.data.dataset_loader import FederatedDataPartitioner
from sentryfl.federated.client import FederatedClient
from sentryfl.federated.server import AggregationServer

logger = logging.getLogger(__name__)


@dataclass
class ScalingMetrics:
    """Container for communication scaling metrics"""
    client_count: int
    bytes_per_round: float
    convergence_rounds: int
    total_communication_cost: float  # bytes × rounds
    per_client_payload_bytes: Dict[str, float]
    wall_clock_time_per_round: float  # seconds
    total_wall_clock_time: float  # seconds
    final_loss: float
    final_accuracy: float
    training_configuration: str  # 'parameter_efficient' or 'full_model'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary format"""
        return {
            'client_count': int(self.client_count),
            'bytes_per_round': float(self.bytes_per_round),
            'convergence_rounds': int(self.convergence_rounds),
            'total_communication_cost': float(self.total_communication_cost),
            'per_client_payload_bytes': {
                k: float(v) for k, v in self.per_client_payload_bytes.items()
            },
            'wall_clock_time_per_round': float(self.wall_clock_time_per_round),
            'total_wall_clock_time': float(self.total_wall_clock_time),
            'final_loss': float(self.final_loss),
            'final_accuracy': float(self.final_accuracy),
            'training_configuration': self.training_configuration
        }


@dataclass
class ComparisonMetrics:
    """Container for parameter-efficient vs full-model comparison"""
    parameter_efficient_metrics: Dict[int, ScalingMetrics]
    full_model_metrics: Dict[int, ScalingMetrics]
    communication_reduction_percentages: Dict[int, float]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert comparison to dictionary format"""
        return {
            'parameter_efficient': {
                k: v.to_dict() for k, v in self.parameter_efficient_metrics.items()
            },
            'full_model': {
                k: v.to_dict() for k, v in self.full_model_metrics.items()
            },
            'communication_reduction_percentages': {
                k: float(v) for k, v in self.communication_reduction_percentages.items()
            }
        }


class ScalingEvaluator:
    """
    Communication scaling evaluator for multi-client federated learning experiments
    
    Evaluates communication efficiency across client counts: 5, 20, 50, 100, 500
    Measures bytes transferred, convergence rounds, total cost, and wall-clock time
    Compares parameter-efficient training vs full-model training
    Generates communication efficiency plots
    """
    
    def __init__(
        self,
        model_fn: callable,
        train_data: np.ndarray,
        train_labels: np.ndarray,
        val_data: Optional[np.ndarray] = None,
        val_labels: Optional[np.ndarray] = None,
        client_counts: List[int] = None,
        device: str = 'cpu',
        convergence_threshold: float = 0.01,
        max_rounds: int = 100
    ):
        """
        Initialize scaling evaluator
        
        Validates Requirement 10.1: Support simulated client counts of 5, 20, 50, 100, 500
        
        Args:
            model_fn: Callable that returns a new model instance
            train_data: Training data array [N, seq_len, features]
            train_labels: Training labels array [N]
            val_data: Validation data array [N_val, seq_len, features] (optional)
            val_labels: Validation labels array [N_val] (optional)
            client_counts: List of client counts to evaluate (default: [5, 20, 50, 100, 500])
            device: Device for computation ('cpu' or 'cuda')
            convergence_threshold: Loss improvement threshold for convergence detection
            max_rounds: Maximum number of training rounds
        """
        self.model_fn = model_fn
        self.train_data = train_data
        self.train_labels = train_labels
        self.val_data = val_data
        self.val_labels = val_labels
        self.device = device
        self.convergence_threshold = convergence_threshold
        self.max_rounds = max_rounds
        
        # Default client counts for scaling evaluation
        if client_counts is None:
            self.client_counts = [5, 20, 50, 100, 500]
        else:
            self.client_counts = sorted(client_counts)
        
        # Storage for evaluation results
        self.scaling_results: Dict[int, ScalingMetrics] = {}
        self.comparison_results: Optional[ComparisonMetrics] = None
        
        logger.info(
            f"Initialized ScalingEvaluator with {len(self.client_counts)} client configurations: "
            f"{self.client_counts}"
        )
    
    def partition_dataset(
        self,
        num_clients: int,
        partition_strategy: str = 'iid'
    ) -> List[Tuple[torch.Tensor, torch.Tensor]]:
        """
        Partition dataset across specified number of clients
        
        Validates Requirement 10.2: Partition dataset into corresponding client shards
        
        Args:
            num_clients: Number of clients to partition data for
            partition_strategy: 'iid' or 'non_iid'
        
        Returns:
            List of (client_data, client_labels) tuples as torch tensors
        """
        logger.info(
            f"Partitioning dataset for {num_clients} clients using '{partition_strategy}' strategy"
        )
        
        # Create partitioner
        partitioner = FederatedDataPartitioner(
            num_clients=num_clients,
            partition_strategy=partition_strategy,
            random_seed=42  # For reproducibility
        )
        
        # Partition data
        client_shards = partitioner.partition(self.train_data, self.train_labels)
        
        # Convert to torch tensors
        torch_shards = []
        for client_data, client_labels in client_shards:
            data_tensor = torch.from_numpy(client_data).float()
            labels_tensor = torch.from_numpy(client_labels).float()
            torch_shards.append((data_tensor, labels_tensor))
        
        logger.info(
            f"Dataset partitioned: {num_clients} clients, "
            f"avg {np.mean([len(labels) for _, labels in torch_shards]):.0f} samples per client"
        )
        
        return torch_shards
    
    def measure_bytes_transferred(
        self,
        parameters: Dict[str, torch.Tensor]
    ) -> float:
        """
        Measure total bytes in parameter dictionary
        
        Validates Requirement 10.3: Measure total bytes transferred per training round
        Validates Requirement 10.7: Log per-client communication payload size
        
        Args:
            parameters: Dictionary of parameter tensors
        
        Returns:
            Total bytes in parameters
        """
        total_bytes = 0.0
        
        for name, param in parameters.items():
            # Each float32 value is 4 bytes
            param_bytes = param.numel() * param.element_size()
            total_bytes += param_bytes
        
        return total_bytes
    
    def detect_convergence(
        self,
        loss_history: List[float],
        window_size: int = 5
    ) -> bool:
        """
        Detect convergence based on loss improvement
        
        Validates Requirement 10.4: Measure communication rounds required for convergence
        
        Args:
            loss_history: List of loss values per round
            window_size: Number of recent rounds to check for improvement
        
        Returns:
            True if converged, False otherwise
        """
        if len(loss_history) < window_size + 1:
            return False
        
        # Check if loss improvement is below threshold
        recent_losses = loss_history[-window_size:]
        previous_loss = loss_history[-(window_size + 1)]
        current_loss = recent_losses[-1]
        
        improvement = abs(previous_loss - current_loss)
        converged = improvement < self.convergence_threshold
        
        return converged
    
    def run_federated_training(
        self,
        num_clients: int,
        local_epochs: int = 5,
        use_parameter_efficient: bool = False,
        adms_module: Optional[Any] = None,
        batch_size: int = 32,
        learning_rate: float = 0.001
    ) -> ScalingMetrics:
        """
        Run federated training experiment for specified client count
        
        Validates Requirements: 10.3, 10.4, 10.5, 10.7, 10.8
        
        Args:
            num_clients: Number of federated clients
            local_epochs: Number of local training epochs per round
            use_parameter_efficient: Whether to use ADMS parameter efficiency
            adms_module: Optional ADMS module for parameter selection
            batch_size: Batch size for local training
            learning_rate: Learning rate for local optimizers
        
        Returns:
            ScalingMetrics object with experiment results
        """
        logger.info(
            f"Starting federated training: {num_clients} clients, "
            f"parameter_efficient={use_parameter_efficient}"
        )
        
        # Partition dataset
        client_shards = self.partition_dataset(num_clients)
        
        # Initialize global model and server
        global_model = self.model_fn()
        server = AggregationServer(
            model=global_model,
            device=self.device,
            checkpoint_frequency=9999  # Disable checkpointing for evaluation
        )
        
        # Initialize clients
        clients = []
        for i, (client_data, client_labels) in enumerate(client_shards):
            client_model = self.model_fn()
            client = FederatedClient(
                client_id=f'client_{i}',
                model=client_model,
                local_data=(client_data, client_labels),
                batch_size=batch_size,
                learning_rate=learning_rate,
                device=self.device
            )
            clients.append(client)
        
        # Training loop
        loss_history = []
        bytes_per_round_list = []
        round_times = []
        per_client_payloads = {}
        
        for round_num in range(1, self.max_rounds + 1):
            round_start_time = time.time()
            
            # Broadcast global model
            global_params = server.broadcast_global_model()
            
            # Measure broadcast bytes (server to clients)
            broadcast_bytes = self.measure_bytes_transferred(global_params)
            
            # Track per-client payload sizes
            for i, client in enumerate(clients):
                client_id = f'client_{i}'
                if client_id not in per_client_payloads:
                    per_client_payloads[client_id] = []
                per_client_payloads[client_id].append(broadcast_bytes)
            
            # Client local training
            round_upload_bytes = 0.0
            for client in clients:
                # Receive global model
                client.receive_global_model(global_params)
                
                # Local training with optional ADMS
                if use_parameter_efficient and adms_module is not None:
                    client_params, _ = client.local_training(
                        local_epochs=local_epochs,
                        adms_module=adms_module
                    )
                else:
                    client_params, _ = client.local_training(
                        local_epochs=local_epochs
                    )
                
                # Measure upload bytes (client to server)
                upload_bytes = self.measure_bytes_transferred(client_params)
                round_upload_bytes += upload_bytes
                
                # Collect updates at server
                server.collect_client_updates(
                    client_id=client.client_id,
                    parameters=client_params,
                    num_samples=client.data_size
                )
            
            # Server aggregation
            server.aggregate_updates(round_num=round_num)
            
            # Total bytes transferred this round (bidirectional)
            # Broadcast: server->clients (num_clients × broadcast_bytes)
            # Upload: clients->server (sum of all client uploads)
            total_round_bytes = (broadcast_bytes * num_clients) + round_upload_bytes
            bytes_per_round_list.append(total_round_bytes)
            
            # Compute round loss on validation set (if available)
            if self.val_data is not None and self.val_labels is not None:
                val_loss = self._compute_validation_loss(server.global_model)
                loss_history.append(val_loss)
            else:
                # Use average client training loss as proxy
                loss_history.append(0.0)  # Placeholder
            
            # Measure round wall-clock time
            round_time = time.time() - round_start_time
            round_times.append(round_time)
            
            logger.debug(
                f"Round {round_num}/{self.max_rounds}: "
                f"loss={loss_history[-1]:.4f}, "
                f"bytes={total_round_bytes:.0f}, "
                f"time={round_time:.2f}s"
            )
            
            # Check convergence
            if self.detect_convergence(loss_history):
                logger.info(f"Converged at round {round_num}")
                break
        
        # Calculate final metrics
        convergence_rounds = len(loss_history)
        avg_bytes_per_round = np.mean(bytes_per_round_list)
        total_communication_cost = avg_bytes_per_round * convergence_rounds
        avg_wall_clock_time = np.mean(round_times)
        total_wall_clock_time = np.sum(round_times)
        
        # Compute final model performance
        final_loss = loss_history[-1] if loss_history else float('inf')
        final_accuracy = self._compute_accuracy(server.global_model)
        
        # Aggregate per-client payload statistics
        avg_per_client_payloads = {
            client_id: float(np.mean(payload_list))
            for client_id, payload_list in per_client_payloads.items()
        }
        
        # Create metrics object
        metrics = ScalingMetrics(
            client_count=num_clients,
            bytes_per_round=avg_bytes_per_round,
            convergence_rounds=convergence_rounds,
            total_communication_cost=total_communication_cost,
            per_client_payload_bytes=avg_per_client_payloads,
            wall_clock_time_per_round=avg_wall_clock_time,
            total_wall_clock_time=total_wall_clock_time,
            final_loss=final_loss,
            final_accuracy=final_accuracy,
            training_configuration='parameter_efficient' if use_parameter_efficient else 'full_model'
        )
        
        logger.info(
            f"Training complete: {num_clients} clients, "
            f"{convergence_rounds} rounds, "
            f"total cost={total_communication_cost:.2e} bytes"
        )
        
        return metrics
    
    def _compute_validation_loss(self, model: nn.Module) -> float:
        """
        Compute validation loss for convergence detection
        
        Args:
            model: Model to evaluate
        
        Returns:
            Average validation loss
        """
        model.eval()
        
        # Convert to tensors if numpy
        if isinstance(self.val_data, np.ndarray):
            val_data = torch.from_numpy(self.val_data).float()
            val_labels = torch.from_numpy(self.val_labels).float()
        else:
            val_data = self.val_data
            val_labels = self.val_labels
        
        val_data = val_data.to(self.device)
        val_labels = val_labels.to(self.device)
        
        criterion = nn.BCEWithLogitsLoss()
        
        with torch.no_grad():
            outputs = model(val_data)
            outputs = outputs.squeeze(-1) if outputs.dim() > 1 else outputs
            loss = criterion(outputs, val_labels)
        
        model.train()
        return loss.item()
    
    def _compute_accuracy(self, model: nn.Module) -> float:
        """
        Compute model accuracy on validation set
        
        Args:
            model: Model to evaluate
        
        Returns:
            Classification accuracy (0-1)
        """
        if self.val_data is None or self.val_labels is None:
            return 0.0
        
        model.eval()
        
        # Convert to tensors if numpy
        if isinstance(self.val_data, np.ndarray):
            val_data = torch.from_numpy(self.val_data).float()
            val_labels = torch.from_numpy(self.val_labels).float()
        else:
            val_data = self.val_data
            val_labels = self.val_labels
        
        val_data = val_data.to(self.device)
        val_labels = val_labels.to(self.device)
        
        with torch.no_grad():
            outputs = model(val_data)
            outputs = outputs.squeeze(-1) if outputs.dim() > 1 else outputs
            predictions = (torch.sigmoid(outputs) > 0.5).float()
            accuracy = (predictions == val_labels).float().mean()
        
        model.train()
        return accuracy.item()
    
    def evaluate_client_scaling(
        self,
        local_epochs: int = 5,
        use_parameter_efficient: bool = False,
        adms_module: Optional[Any] = None
    ) -> Dict[int, ScalingMetrics]:
        """
        Evaluate communication efficiency across all client counts
        
        Validates Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8, 10.9
        
        Args:
            local_epochs: Number of local training epochs per round
            use_parameter_efficient: Whether to use ADMS parameter efficiency
            adms_module: Optional ADMS module for parameter selection
        
        Returns:
            Dictionary mapping client_count -> ScalingMetrics
        """
        logger.info(
            f"Starting scaling evaluation across {len(self.client_counts)} "
            f"client configurations"
        )
        
        results = {}
        
        for num_clients in self.client_counts:
            logger.info(f"\n{'='*60}")
            logger.info(f"Evaluating {num_clients} clients")
            logger.info(f"{'='*60}")
            
            # Run federated training experiment
            metrics = self.run_federated_training(
                num_clients=num_clients,
                local_epochs=local_epochs,
                use_parameter_efficient=use_parameter_efficient,
                adms_module=adms_module
            )
            
            results[num_clients] = metrics
            
            logger.info(
                f"Completed {num_clients} clients: "
                f"cost={metrics.total_communication_cost:.2e} bytes, "
                f"rounds={metrics.convergence_rounds}"
            )
        
        self.scaling_results = results
        return results
    
    def compare_parameter_efficient_vs_full(
        self,
        local_epochs: int = 5,
        adms_module: Optional[Any] = None
    ) -> ComparisonMetrics:
        """
        Compare parameter-efficient vs full-model training
        
        Validates Requirement 10.6: Compare communication cost between 
        parameter-efficient and full-model training
        
        Args:
            local_epochs: Number of local training epochs per round
            adms_module: ADMS module for parameter-efficient training
        
        Returns:
            ComparisonMetrics with both configurations
        """
        logger.info("Starting parameter-efficient vs full-model comparison")
        
        # Evaluate full-model training
        logger.info("\n" + "="*60)
        logger.info("Evaluating FULL-MODEL training")
        logger.info("="*60)
        full_model_results = self.evaluate_client_scaling(
            local_epochs=local_epochs,
            use_parameter_efficient=False,
            adms_module=None
        )
        
        # Evaluate parameter-efficient training
        logger.info("\n" + "="*60)
        logger.info("Evaluating PARAMETER-EFFICIENT training")
        logger.info("="*60)
        pe_results = self.evaluate_client_scaling(
            local_epochs=local_epochs,
            use_parameter_efficient=True,
            adms_module=adms_module
        )
        
        # Compute communication reduction percentages
        reduction_percentages = {}
        for num_clients in self.client_counts:
            full_cost = full_model_results[num_clients].total_communication_cost
            pe_cost = pe_results[num_clients].total_communication_cost
            
            if full_cost > 0:
                reduction_pct = ((full_cost - pe_cost) / full_cost) * 100.0
            else:
                reduction_pct = 0.0
            
            reduction_percentages[num_clients] = reduction_pct
            
            logger.info(
                f"Clients={num_clients}: "
                f"Reduction={reduction_pct:.1f}% "
                f"(full={full_cost:.2e}, PE={pe_cost:.2e})"
            )
        
        # Create comparison metrics
        comparison = ComparisonMetrics(
            parameter_efficient_metrics=pe_results,
            full_model_metrics=full_model_results,
            communication_reduction_percentages=reduction_percentages
        )
        
        self.comparison_results = comparison
        return comparison
    
    def plot_communication_efficiency(
        self,
        save_path: Optional[str] = None,
        show_plot: bool = False
    ) -> None:
        """
        Generate communication efficiency plots
        
        Validates Requirement 10.10: Generate communication efficiency plots
        (clients vs bytes transferred)
        
        Args:
            save_path: Path to save plot (if None, uses default)
            show_plot: Whether to display plot interactively
        """
        if not self.scaling_results:
            logger.warning("No scaling results available. Run evaluation first.")
            return
        
        # Extract data for plotting
        client_counts = sorted(self.scaling_results.keys())
        bytes_per_round = [
            self.scaling_results[nc].bytes_per_round for nc in client_counts
        ]
        total_costs = [
            self.scaling_results[nc].total_communication_cost for nc in client_counts
        ]
        
        # Create figure with subplots
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        # Plot 1: Bytes per round vs client count
        axes[0].plot(client_counts, bytes_per_round, marker='o', linewidth=2, markersize=8)
        axes[0].set_xlabel('Number of Clients', fontsize=12)
        axes[0].set_ylabel('Bytes per Round', fontsize=12)
        axes[0].set_title('Communication per Round vs Client Count', fontsize=14, fontweight='bold')
        axes[0].grid(True, alpha=0.3)
        axes[0].set_xscale('log')
        axes[0].set_yscale('log')
        
        # Plot 2: Total communication cost vs client count
        axes[1].plot(client_counts, total_costs, marker='s', linewidth=2, markersize=8, color='orange')
        axes[1].set_xlabel('Number of Clients', fontsize=12)
        axes[1].set_ylabel('Total Communication Cost (bytes)', fontsize=12)
        axes[1].set_title('Total Communication Cost vs Client Count', fontsize=14, fontweight='bold')
        axes[1].grid(True, alpha=0.3)
        axes[1].set_xscale('log')
        axes[1].set_yscale('log')
        
        plt.tight_layout()
        
        # Save plot
        if save_path is None:
            save_path = 'communication_efficiency_scaling.png'
        
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        logger.info(f"Communication efficiency plot saved to {save_path}")
        
        if show_plot:
            plt.show()
        else:
            plt.close()
    
    def plot_comparison(
        self,
        save_path: Optional[str] = None,
        show_plot: bool = False
    ) -> None:
        """
        Plot parameter-efficient vs full-model comparison
        
        Args:
            save_path: Path to save plot (if None, uses default)
            show_plot: Whether to display plot interactively
        """
        if self.comparison_results is None:
            logger.warning("No comparison results available. Run comparison first.")
            return
        
        # Extract data
        client_counts = sorted(self.client_counts)
        pe_costs = [
            self.comparison_results.parameter_efficient_metrics[nc].total_communication_cost
            for nc in client_counts
        ]
        full_costs = [
            self.comparison_results.full_model_metrics[nc].total_communication_cost
            for nc in client_counts
        ]
        
        # Create plot
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.plot(client_counts, full_costs, marker='o', linewidth=2, markersize=8,
                label='Full Model', color='red')
        ax.plot(client_counts, pe_costs, marker='s', linewidth=2, markersize=8,
                label='Parameter Efficient', color='green')
        
        ax.set_xlabel('Number of Clients', fontsize=12)
        ax.set_ylabel('Total Communication Cost (bytes)', fontsize=12)
        ax.set_title('Communication Cost: Parameter-Efficient vs Full Model',
                     fontsize=14, fontweight='bold')
        ax.legend(fontsize=11)
        ax.grid(True, alpha=0.3)
        ax.set_xscale('log')
        ax.set_yscale('log')
        
        plt.tight_layout()
        
        # Save plot
        if save_path is None:
            save_path = 'parameter_efficient_vs_full_comparison.png'
        
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        logger.info(f"Comparison plot saved to {save_path}")
        
        if show_plot:
            plt.show()
        else:
            plt.close()
