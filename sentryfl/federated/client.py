"""
Federated Client Module for SentryFL

Implements the FederatedClient class that performs local model training on private
client data without transmitting raw data to the server.

Key Features:
- Receive and load global model parameters from server
- Local training with gradient descent on private data
- Per-sample gradient computation for DP compatibility
- Extract and send only trainable parameters (not full model)
- Local metrics logging (loss, gradient norms)
- Communication retry with exponential backoff

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, 18.5
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from typing import Dict, Tuple, Optional, Any
import logging
import time
import copy
from pathlib import Path

logger = logging.getLogger(__name__)


class FederatedClient:
    """
    Federated learning client for local model training on private data.
    
    The client:
    1. Receives global model parameters from the aggregation server
    2. Loads local private training data
    3. Performs local training for specified epochs
    4. Computes per-sample gradients (DP-compatible)
    5. Extracts trainable parameters only
    6. Sends updates to server with retry logic
    7. Never transmits raw data
    
    Args:
        client_id: Unique identifier for this client
        model: PyTorch model (architecture only, parameters loaded from server)
        local_data: Tuple of (X_train, y_train) local training data
        batch_size: Batch size for local training
        learning_rate: Learning rate for local optimizer
        device: Device for training ('cpu' or 'cuda')
        
    Example:
        >>> model = PLMAnomalyDetector(input_dim=38)
        >>> client = FederatedClient(
        ...     client_id='client_0',
        ...     model=model,
        ...     local_data=(X_train, y_train),
        ...     batch_size=32,
        ...     learning_rate=0.001
        ... )
        >>> # Receive global model from server
        >>> client.receive_global_model(global_params)
        >>> # Perform local training
        >>> local_params, metrics = client.local_training(local_epochs=5)
        >>> # Send updates to server (handled by aggregation server)
    """
    
    def __init__(
        self,
        client_id: str,
        model: nn.Module,
        local_data: Tuple[torch.Tensor, torch.Tensor],
        batch_size: int = 32,
        learning_rate: float = 0.001,
        device: str = 'cpu',
        cache_dir: Optional[str] = None
    ):
        """
        Initialize federated client.
        
        Args:
            client_id: Unique client identifier
            model: PyTorch model architecture
            local_data: Tuple of (features, labels) for local training
            batch_size: Batch size for local training
            learning_rate: Learning rate for local optimizer
            device: Device for computation ('cpu' or 'cuda')
            cache_dir: Directory for caching updates on communication failure
            
        Raises:
            ValueError: If local_data is invalid or empty
        """
        self.client_id = client_id
        self.model = model.to(device)
        self.device = device
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        
        # Validate local data
        if not isinstance(local_data, tuple) or len(local_data) != 2:
            raise ValueError("local_data must be a tuple of (features, labels)")
        
        X_train, y_train = local_data
        if len(X_train) == 0 or len(y_train) == 0:
            raise ValueError("local_data cannot be empty")
        if len(X_train) != len(y_train):
            raise ValueError(
                f"Feature and label counts must match: "
                f"{len(X_train)} != {len(y_train)}"
            )
        
        self.local_data = local_data
        self.data_size = len(X_train)
        
        # Initialize optimizer
        self.optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=learning_rate
        )
        
        # Initialize loss criterion
        self.criterion = nn.BCEWithLogitsLoss()
        
        # Metrics tracking
        self.training_metrics = {
            'loss_history': [],
            'gradient_norms': [],
            'per_epoch_loss': [],
            'total_samples_trained': 0
        }
        
        # Communication retry settings
        self.max_retries = 5
        self.retry_base_delay = 1.0  # seconds
        self.cached_updates = None
        
        # Setup cache directory
        if cache_dir is None:
            cache_dir = Path.cwd() / '.cache' / 'federated_updates'
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(
            f"Initialized FederatedClient '{client_id}' with "
            f"{self.data_size} samples, batch_size={batch_size}, "
            f"lr={learning_rate}, device={device}"
        )
    
    def receive_global_model(self, global_parameters: Dict[str, torch.Tensor]):
        """
        Receive and load global model parameters from aggregation server.
        
        This method updates the client's local model with parameters
        broadcasted by the server at the start of each training round.
        
        Args:
            global_parameters: Dictionary mapping parameter names to tensors
            
        Raises:
            ValueError: If parameter shapes don't match model
            RuntimeError: If loading fails
            
        Requirements: 2.1, 2.3
        """
        logger.info(f"Client {self.client_id}: Receiving global model parameters")
        
        try:
            # Load parameters into model
            model_state = self.model.state_dict()
            
            # Validate parameter shapes
            for name, param in global_parameters.items():
                if name not in model_state:
                    logger.warning(
                        f"Parameter '{name}' not found in model, skipping"
                    )
                    continue
                
                if model_state[name].shape != param.shape:
                    raise ValueError(
                        f"Shape mismatch for parameter '{name}': "
                        f"expected {model_state[name].shape}, got {param.shape}"
                    )
            
            # Update model state
            model_state.update(global_parameters)
            self.model.load_state_dict(model_state)
            
            logger.info(
                f"Client {self.client_id}: Successfully loaded "
                f"{len(global_parameters)} parameter tensors"
            )
            
        except Exception as e:
            logger.error(
                f"Client {self.client_id}: Failed to load global model: {e}"
            )
            raise RuntimeError(f"Global model loading failed: {e}")
    
    def load_local_data(self) -> DataLoader:
        """
        Load local private data into DataLoader.
        
        Creates a DataLoader from the client's private training data.
        The raw data never leaves the client device.
        
        Returns:
            DataLoader for local training
            
        Requirements: 2.2
        """
        logger.debug(
            f"Client {self.client_id}: Loading local data "
            f"({self.data_size} samples)"
        )
        
        X_train, y_train = self.local_data
        
        # Create TensorDataset
        dataset = TensorDataset(
            X_train.to(self.device),
            y_train.to(self.device)
        )
        
        # Create DataLoader
        data_loader = DataLoader(
            dataset,
            batch_size=self.batch_size,
            shuffle=True,
            drop_last=False  # Include all data even if last batch is smaller
        )
        
        return data_loader
    
    def local_training(
        self,
        local_epochs: int,
        dp_module: Optional[Any] = None,
        adms_module: Optional[Any] = None
    ) -> Tuple[Dict[str, torch.Tensor], Dict[str, Any]]:
        """
        Perform local training with gradient descent on private data.
        
        Trains the model for specified number of epochs on local data,
        computing per-sample gradients for DP compatibility if dp_module
        is provided. Supports parameter-efficient training via ADMS.
        
        Args:
            local_epochs: Number of local training epochs
            dp_module: Optional DifferentialPrivacyModule for DP-SGD
            adms_module: Optional ADMSModule for parameter efficiency
            
        Returns:
            Tuple of (model_parameters, training_metrics)
            - model_parameters: Dict of trainable parameter updates
            - training_metrics: Dict with loss, gradient norms, etc.
            
        Requirements: 2.4, 2.5, 2.9
        """
        logger.info(
            f"Client {self.client_id}: Starting local training "
            f"for {local_epochs} epochs"
        )
        
        self.model.train()
        data_loader = self.load_local_data()
        
        # Setup DP if provided
        if dp_module is not None and not dp_module.is_attached:
            logger.info("Attaching differential privacy module")
            self.model, self.optimizer, data_loader = dp_module.attach_privacy_engine(
                optimizer=self.optimizer,
                data_loader=data_loader,
                epochs=local_epochs
            )
        
        # Training loop
        epoch_losses = []
        batch_gradient_norms = []
        
        for epoch in range(local_epochs):
            epoch_loss = 0.0
            num_batches = 0
            
            for batch_idx, (batch_x, batch_y) in enumerate(data_loader):
                batch_x = batch_x.to(self.device)
                batch_y = batch_y.to(self.device)
                
                # Forward pass
                self.optimizer.zero_grad()
                outputs = self.model(batch_x)
                
                # Compute loss
                # Reshape outputs and labels for BCEWithLogitsLoss
                outputs = outputs.squeeze(-1) if outputs.dim() > 1 else outputs
                batch_y = batch_y.float()
                
                loss = self.criterion(outputs, batch_y)
                
                # Backward pass (per-sample gradients if DP is enabled)
                loss.backward()
                
                # Compute gradient norm before optimizer step
                grad_norm = self._compute_gradient_norm()
                batch_gradient_norms.append(grad_norm)
                
                # Apply ADMS mask if provided
                if adms_module is not None and adms_module.parameter_mask is not None:
                    self._apply_adms_mask(adms_module)
                
                # Optimizer step
                self.optimizer.step()
                
                # Track metrics
                epoch_loss += loss.item()
                num_batches += 1
                self.training_metrics['total_samples_trained'] += len(batch_x)
            
            # Record epoch metrics
            avg_epoch_loss = epoch_loss / num_batches if num_batches > 0 else 0.0
            epoch_losses.append(avg_epoch_loss)
            
            logger.debug(
                f"Client {self.client_id}: Epoch {epoch + 1}/{local_epochs}, "
                f"Loss: {avg_epoch_loss:.4f}"
            )
            
            # Check privacy budget if DP is enabled
            if dp_module is not None and dp_module.is_budget_exhausted():
                logger.warning(
                    f"Client {self.client_id}: Privacy budget exhausted "
                    f"at epoch {epoch + 1}/{local_epochs}"
                )
                break
        
        # Update metrics
        self.training_metrics['per_epoch_loss'] = epoch_losses
        self.training_metrics['loss_history'].extend(epoch_losses)
        self.training_metrics['gradient_norms'].extend(batch_gradient_norms)
        
        # Compute final metrics
        final_metrics = {
            'client_id': self.client_id,
            'epochs_completed': len(epoch_losses),
            'final_loss': epoch_losses[-1] if epoch_losses else float('inf'),
            'avg_loss': sum(epoch_losses) / len(epoch_losses) if epoch_losses else float('inf'),
            'avg_gradient_norm': sum(batch_gradient_norms) / len(batch_gradient_norms) if batch_gradient_norms else 0.0,
            'max_gradient_norm': max(batch_gradient_norms) if batch_gradient_norms else 0.0,
            'min_gradient_norm': min(batch_gradient_norms) if batch_gradient_norms else 0.0,
            'total_samples': self.data_size,
            'batches_processed': len(batch_gradient_norms)
        }
        
        # Add DP metrics if applicable
        if dp_module is not None:
            privacy_metrics = dp_module.log_privacy_metrics()
            final_metrics.update({
                'epsilon_spent': privacy_metrics['epsilon'],
                'delta': privacy_metrics['delta'],
                'privacy_budget_utilization': privacy_metrics['budget_utilization']
            })
        
        logger.info(
            f"Client {self.client_id}: Local training completed. "
            f"Avg loss: {final_metrics['avg_loss']:.4f}, "
            f"Avg gradient norm: {final_metrics['avg_gradient_norm']:.4f}"
        )
        
        # Extract trainable parameters
        model_parameters = self.extract_parameters()
        
        return model_parameters, final_metrics
    
    def _compute_gradient_norm(self) -> float:
        """
        Compute L2 norm of model gradients.
        
        Returns:
            L2 norm of concatenated gradients
            
        Requirements: 2.9
        """
        total_norm = 0.0
        for param in self.model.parameters():
            if param.grad is not None:
                param_norm = param.grad.data.norm(2)
                total_norm += param_norm.item() ** 2
        total_norm = total_norm ** 0.5
        return total_norm
    
    def _apply_adms_mask(self, adms_module: Any):
        """
        Apply ADMS parameter mask to gradients.
        
        Zeros out gradients for non-selected parameters to reduce
        communication cost.
        
        Args:
            adms_module: ADMSModule instance with generated mask
        """
        for name, param in self.model.named_parameters():
            if param.grad is not None and name in adms_module.parameter_mask:
                mask = adms_module.parameter_mask[name].to(param.device)
                param.grad.data *= mask
    
    def extract_parameters(self) -> Dict[str, torch.Tensor]:
        """
        Extract trainable parameters (not full model) for communication.
        
        Only extracts parameters that require gradients to minimize
        communication payload. Parameters are detached and moved to CPU
        to avoid GPU memory issues during communication.
        
        Returns:
            Dictionary mapping parameter names to tensors (on CPU)
            
        Requirements: 2.6, 2.7
        """
        logger.debug(
            f"Client {self.client_id}: Extracting trainable parameters"
        )
        
        parameters = {}
        total_params = 0
        trainable_params = 0
        
        for name, param in self.model.named_parameters():
            total_params += param.numel()
            if param.requires_grad:
                # Detach from computation graph and move to CPU
                parameters[name] = param.detach().clone().cpu()
                trainable_params += param.numel()
        
        logger.info(
            f"Client {self.client_id}: Extracted {len(parameters)} parameter "
            f"tensors ({trainable_params}/{total_params} trainable parameters, "
            f"{trainable_params/total_params:.1%})"
        )
        
        return parameters
    
    def send_parameters(
        self,
        parameters: Dict[str, torch.Tensor],
        send_fn: callable,
        **kwargs
    ) -> bool:
        """
        Send parameter updates to server with exponential backoff retry.
        
        Implements communication retry logic with exponential backoff
        to handle transient network failures. Caches updates locally
        if all retries fail.
        
        Args:
            parameters: Dictionary of parameter updates
            send_fn: Callable function to send parameters to server
                     Should accept (client_id, parameters, **kwargs)
            **kwargs: Additional arguments for send_fn
            
        Returns:
            True if send succeeded, False if all retries failed
            
        Requirements: 2.10, 18.5
        """
        logger.info(
            f"Client {self.client_id}: Attempting to send parameters to server"
        )
        
        for attempt in range(self.max_retries):
            try:
                # Attempt to send parameters
                send_fn(self.client_id, parameters, **kwargs)
                
                logger.info(
                    f"Client {self.client_id}: Successfully sent parameters "
                    f"(attempt {attempt + 1}/{self.max_retries})"
                )
                
                # Clear cached updates on success
                self.cached_updates = None
                return True
                
            except Exception as e:
                logger.warning(
                    f"Client {self.client_id}: Failed to send parameters "
                    f"(attempt {attempt + 1}/{self.max_retries}): {e}"
                )
                
                # Check if we should retry
                if attempt < self.max_retries - 1:
                    # Exponential backoff: delay = base_delay * 2^attempt
                    delay = self.retry_base_delay * (2 ** attempt)
                    logger.info(
                        f"Client {self.client_id}: Retrying in {delay:.1f} seconds..."
                    )
                    time.sleep(delay)
                else:
                    # Final attempt failed, cache updates
                    logger.error(
                        f"Client {self.client_id}: All retry attempts failed. "
                        f"Caching updates locally."
                    )
                    self._cache_updates(parameters)
                    return False
        
        return False
    
    def _cache_updates(self, parameters: Dict[str, torch.Tensor]):
        """
        Cache parameter updates locally when communication fails.
        
        Saves parameters to disk for later retry or analysis.
        
        Args:
            parameters: Dictionary of parameter updates
            
        Requirements: 2.10
        """
        cache_file = self.cache_dir / f"{self.client_id}_cached_update.pt"
        
        try:
            torch.save({
                'client_id': self.client_id,
                'timestamp': time.time(),
                'parameters': parameters,
                'metrics': self.training_metrics
            }, cache_file)
            
            self.cached_updates = cache_file
            
            logger.info(
                f"Client {self.client_id}: Cached updates to {cache_file}"
            )
            
        except Exception as e:
            logger.error(
                f"Client {self.client_id}: Failed to cache updates: {e}"
            )
    
    def get_cached_updates(self) -> Optional[Dict[str, torch.Tensor]]:
        """
        Retrieve cached parameter updates if available.
        
        Returns:
            Cached parameters dictionary or None if no cache exists
        """
        if self.cached_updates is None or not self.cached_updates.exists():
            return None
        
        try:
            cached_data = torch.load(self.cached_updates)
            logger.info(
                f"Client {self.client_id}: Retrieved cached updates from "
                f"{self.cached_updates}"
            )
            return cached_data['parameters']
        except Exception as e:
            logger.error(
                f"Client {self.client_id}: Failed to load cached updates: {e}"
            )
            return None
    
    def get_training_metrics(self) -> Dict[str, Any]:
        """
        Get complete training metrics history.
        
        Returns:
            Dictionary with loss history, gradient norms, and statistics
        """
        return copy.deepcopy(self.training_metrics)
    
    def reset_metrics(self):
        """Reset training metrics (e.g., for new training round)."""
        self.training_metrics = {
            'loss_history': [],
            'gradient_norms': [],
            'per_epoch_loss': [],
            'total_samples_trained': 0
        }
        logger.debug(f"Client {self.client_id}: Metrics reset")
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"FederatedClient(id='{self.client_id}', "
            f"data_size={self.data_size}, "
            f"batch_size={self.batch_size}, "
            f"lr={self.learning_rate}, "
            f"device='{self.device}')"
        )
