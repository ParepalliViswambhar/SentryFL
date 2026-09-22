"""
Differential Privacy Module for SentryFL

Implements DP-SGD (Differentially Private Stochastic Gradient Descent) using Opacus
to provide formal privacy guarantees for federated learning.

Key Features:
- Per-sample gradient computation with Opacus
- Gradient clipping to bounded L2 norm
- Calibrated Gaussian noise injection
- Privacy budget tracking via a configurable accountant (PRV by default, RDP optional)
- Support for configurable epsilon (ε) and delta (δ) privacy parameters

Note (SentryFL v2): this module implements RECORD-level (per-sample) DP-SGD and is
retained as a selectable baseline (``privacy.mechanism = "record_dpsgd"``). The default
mechanism is aggregate-level DP-FedAvg (see ``sentryfl/privacy/dp_fedavg.py``). The
accountant used for noise SIZING and for privacy SPENDING is the same family, pinned via
the ``accountant`` argument, to avoid the RDP-vs-PRV mismatch present in earlier versions.
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from typing import Tuple, Dict, Optional
import logging

from opacus import PrivacyEngine
from opacus.validators import ModuleValidator
from opacus.accountants.utils import get_noise_multiplier


logger = logging.getLogger(__name__)


class DifferentialPrivacyModule:
    """
    DP-SGD implementation using Opacus for formal privacy guarantees.
    
    This module wraps a PyTorch model and optimizer to apply differential privacy
    during training through per-sample gradient clipping and noise injection.
    
    Privacy Guarantees:
    - Implements (ε, δ)-differential privacy
    - Uses a configurable accountant (PRV by default; RDP optional) for tight,
      consistent privacy accounting across sizing and spending
    - Tracks cumulative privacy budget across the local training composition

    Args:
        model: PyTorch neural network model
        epsilon: Target privacy budget (smaller = more private, typical: 0.1-10.0)
        delta: Privacy parameter (typically 1e-5 or 1e-6)
        max_grad_norm: Maximum L2 norm for gradient clipping (default: 1.0)
        accountant: Privacy accountant family, "prv" (default, tighter) or "rdp"
    
    Example:
        >>> model = MyModel()
        >>> optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        >>> dp_module = DifferentialPrivacyModule(model, epsilon=1.0, delta=1e-5)
        >>> model, optimizer, loader = dp_module.attach_privacy_engine(
        ...     optimizer, train_loader, epochs=10
        ... )
        >>> # Train with DP-SGD
        >>> for batch in loader:
        ...     # Training loop
        ...     epsilon_spent, _ = dp_module.get_privacy_spent()
        ...     if dp_module.is_budget_exhausted():
        ...         break
    """
    
    # Accountant families supported by Opacus that this module pins explicitly.
    SUPPORTED_ACCOUNTANTS = ("prv", "rdp")

    def __init__(
        self,
        model: nn.Module,
        epsilon: float,
        delta: float,
        max_grad_norm: float = 1.0,
        accountant: str = "prv"
    ):
        """
        Initialize the Differential Privacy Module.

        Args:
            model: PyTorch model to apply DP to
            epsilon: Privacy budget (ε), smaller values provide stronger privacy
            delta: Failure probability (δ), typically 1e-5 or 1e-6
            max_grad_norm: Maximum L2 norm for gradient clipping
            accountant: Privacy accountant family, "prv" (default) or "rdp".
                The SAME family is used for both noise sizing and spending, so the
                reported ε is internally consistent.

        Raises:
            ValueError: If epsilon <= 0, delta not in (0, 1), max_grad_norm <= 0,
                or accountant is unsupported.
        """
        if epsilon <= 0:
            raise ValueError(f"epsilon must be > 0, got {epsilon}")
        if delta <= 0 or delta >= 1:
            raise ValueError(f"delta must be in (0, 1), got {delta}")
        if max_grad_norm <= 0:
            raise ValueError(f"max_grad_norm must be > 0, got {max_grad_norm}")
        if accountant not in self.SUPPORTED_ACCOUNTANTS:
            raise ValueError(
                f"accountant must be one of {self.SUPPORTED_ACCOUNTANTS}, got {accountant!r}"
            )

        self.model = model
        self.target_epsilon = epsilon
        self.target_delta = delta
        self.max_grad_norm = max_grad_norm
        self.accountant = accountant
        self.privacy_engine: Optional[PrivacyEngine] = None
        self.current_epsilon = 0.0

        logger.info(
            f"Initialized DifferentialPrivacyModule with ε={epsilon}, "
            f"δ={delta}, max_grad_norm={max_grad_norm}, accountant={accountant}"
        )
    
    def attach_privacy_engine(
        self,
        optimizer: torch.optim.Optimizer,
        data_loader: DataLoader,
        epochs: int
    ) -> Tuple[nn.Module, torch.optim.Optimizer, DataLoader]:
        """
        Attach Opacus PrivacyEngine to model and optimizer for DP-SGD training.
        
        This method:
        1. Validates and fixes the model for Opacus compatibility
        2. Computes the noise multiplier to achieve target (ε, δ)
        3. Wraps the model with per-sample gradient computation hooks
        4. Wraps the optimizer with gradient clipping and noise injection
        5. Wraps the data loader for Poisson sampling (if needed)
        
        Args:
            optimizer: PyTorch optimizer (e.g., Adam, SGD)
            data_loader: Training data loader
            epochs: Number of training epochs
            
        Returns:
            Tuple of (dp_model, dp_optimizer, dp_data_loader) ready for DP training
            
        Raises:
            ValueError: If model is incompatible with Opacus
            RuntimeError: If privacy engine attachment fails
        """
        logger.info("Attaching privacy engine to model and optimizer...")
        
        # Step 1: Validate model for Opacus compatibility (without fixing yet)
        # Opacus requires certain layer types and no unsupported operations
        try:
            errors = ModuleValidator.validate(self.model, strict=False)
            if errors:
                logger.warning(f"Model has compatibility issues, will attempt to fix: {errors}")
                # Fix the model for Opacus compatibility
                self.model = ModuleValidator.fix(self.model)
                logger.info("Model fixed for Opacus compatibility")
                
                # CRITICAL: After fixing, we need to recreate the optimizer with the new parameters
                # Get the optimizer class and state
                optimizer_class = type(optimizer)
                optimizer_state = optimizer.state_dict()
                optimizer_params = optimizer.param_groups[0].copy()
                
                # Remove 'params' from the config as we'll provide new params
                optimizer_config = {k: v for k, v in optimizer_params.items() if k != 'params'}
                
                # Create new optimizer with fixed model parameters
                optimizer = optimizer_class(self.model.parameters(), **optimizer_config)
                logger.info(f"Recreated optimizer with fixed model parameters")
            else:
                logger.info("Model is compatible with Opacus")
        except Exception as e:
            logger.error(f"Model validation failed: {e}")
            raise ValueError(f"Model incompatible with Opacus: {e}")
        
        # Step 2: Compute noise multiplier for target privacy budget
        noise_multiplier = self._compute_noise_multiplier(data_loader, epochs)
        logger.info(f"Computed noise multiplier: {noise_multiplier:.4f}")
        
        # Step 3: Initialize and attach privacy engine.
        # Pin the accountant explicitly so SPENDING (get_epsilon) uses the same
        # family as SIZING (get_noise_multiplier), removing the RDP/PRV mismatch.
        self.privacy_engine = PrivacyEngine(accountant=self.accountant)
        
        try:
            self.model, optimizer, data_loader = self.privacy_engine.make_private(
                module=self.model,
                optimizer=optimizer,
                data_loader=data_loader,
                noise_multiplier=noise_multiplier,
                max_grad_norm=self.max_grad_norm,
            )
            logger.info(
                "Privacy engine attached successfully. "
                f"DP-SGD enabled with noise_multiplier={noise_multiplier:.4f}, "
                f"max_grad_norm={self.max_grad_norm}"
            )
        except Exception as e:
            logger.error(f"Failed to attach privacy engine: {e}")
            raise RuntimeError(f"Privacy engine attachment failed: {e}")
        
        return self.model, optimizer, data_loader
    
    def _compute_noise_multiplier(
        self,
        data_loader: DataLoader,
        epochs: int
    ) -> float:
        """
        Compute noise multiplier to achieve target (ε, δ) privacy guarantee.
        
        Uses Opacus's privacy analysis to determine the noise scale needed
        for Gaussian mechanism in DP-SGD. The noise multiplier is the ratio
        of noise standard deviation to gradient clipping norm.
        
        Args:
            data_loader: Training data loader (to determine sample rate)
            epochs: Number of training epochs
            
        Returns:
            Noise multiplier (sigma / max_grad_norm)
            
        Raises:
            ValueError: If privacy parameters are infeasible
        """
        dataset_size = len(data_loader.dataset)
        batch_size = data_loader.batch_size
        sample_rate = batch_size / dataset_size
        
        logger.debug(
            f"Computing noise multiplier for: "
            f"ε={self.target_epsilon}, δ={self.target_delta}, "
            f"sample_rate={sample_rate:.4f}, epochs={epochs}"
        )
        
        try:
            noise_multiplier = get_noise_multiplier(
                target_epsilon=self.target_epsilon,
                target_delta=self.target_delta,
                sample_rate=sample_rate,
                epochs=epochs,
                accountant=self.accountant,
            )
        except Exception as e:
            logger.error(
                f"Failed to compute noise multiplier. "
                f"Privacy parameters may be infeasible: {e}"
            )
            raise ValueError(
                f"Cannot achieve target privacy budget (ε={self.target_epsilon}, "
                f"δ={self.target_delta}) with given training parameters. "
                f"Consider increasing epsilon or reducing epochs."
            )
        
        return noise_multiplier

    @staticmethod
    def compare_accountants(
        noise_multiplier: float,
        sample_rate: float,
        steps: int,
        delta: float = 1e-5,
    ) -> Dict[str, float]:
        """
        Compute ε under both RDP and PRV accountants for the SAME mechanism.

        This quantifies the tightness gain from PRV over RDP (experiment E4):
        for identical (noise_multiplier, sample_rate, steps), PRV reports a
        smaller (tighter) ε, so PRV lets you hit the same target ε with less
        noise. Returns a dict with both ε and their ratio.

        Args:
            noise_multiplier: Gaussian noise multiplier σ (std / clip norm)
            sample_rate: Poisson subsampling rate (batch_size / dataset_size)
            steps: Number of DP-SGD steps composed
            delta: Target δ for the (ε, δ) readout

        Returns:
            {"rdp": ε_rdp, "prv": ε_prv, "ratio_rdp_over_prv": ε_rdp / ε_prv}
        """
        from opacus.accountants import RDPAccountant, PRVAccountant

        results: Dict[str, float] = {}
        for name, cls in (("rdp", RDPAccountant), ("prv", PRVAccountant)):
            acct = cls()
            # Compose the identical subsampled-Gaussian mechanism `steps` times.
            acct.history = [(noise_multiplier, sample_rate, int(steps))]
            results[name] = float(acct.get_epsilon(delta=delta))

        results["ratio_rdp_over_prv"] = (
            results["rdp"] / results["prv"] if results["prv"] > 0 else float("inf")
        )
        logger.info(
            f"Accountant comparison (σ={noise_multiplier}, q={sample_rate}, "
            f"steps={steps}, δ={delta}): RDP ε={results['rdp']:.4f}, "
            f"PRV ε={results['prv']:.4f} (RDP/PRV={results['ratio_rdp_over_prv']:.3f})"
        )
        return results

    def get_privacy_spent(self) -> Tuple[float, float]:
        """
        Get current privacy budget consumption.
        
        Queries the privacy accountant to compute the cumulative privacy
        expenditure across all training steps so far.
        
        Returns:
            Tuple of (epsilon, delta) representing current privacy consumption
            Returns (0.0, 0.0) if privacy engine not attached
            
        Example:
            >>> epsilon_spent, delta = dp_module.get_privacy_spent()
            >>> print(f"Privacy spent: ε={epsilon_spent:.2f}, δ={delta:.2e}")
        """
        if self.privacy_engine is not None:
            epsilon = self.privacy_engine.get_epsilon(delta=self.target_delta)
            self.current_epsilon = epsilon
            return epsilon, self.target_delta
        
        logger.warning("Privacy engine not attached. Returning (0.0, 0.0)")
        return 0.0, 0.0
    
    def is_budget_exhausted(self) -> bool:
        """
        Check if privacy budget has been exhausted.
        
        Returns:
            True if current epsilon >= target epsilon, False otherwise
            
        Note:
            Training should be terminated when this returns True to maintain
            the formal privacy guarantee.
            
        Example:
            >>> for epoch in range(max_epochs):
            ...     for batch in train_loader:
            ...         # Training step
            ...         if dp_module.is_budget_exhausted():
            ...             print("Privacy budget exhausted, stopping training")
            ...             break
        """
        current_eps, _ = self.get_privacy_spent()
        exhausted = current_eps >= self.target_epsilon
        
        if exhausted:
            logger.warning(
                f"Privacy budget exhausted! "
                f"Current ε={current_eps:.4f} >= Target ε={self.target_epsilon}"
            )
        
        return exhausted
    
    def log_privacy_metrics(self) -> Dict[str, float]:
        """
        Return comprehensive privacy metrics for monitoring and logging.
        
        Returns:
            Dictionary containing:
            - epsilon: Current privacy budget consumption (ε)
            - delta: Privacy parameter (δ)
            - max_grad_norm: Gradient clipping threshold
            - budget_remaining: Remaining privacy budget (target - current)
            - budget_utilization: Fraction of budget used (0.0 to 1.0)
            
        Example:
            >>> metrics = dp_module.log_privacy_metrics()
            >>> logger.info(f"Privacy metrics: {metrics}")
            >>> print(f"Budget utilization: {metrics['budget_utilization']:.1%}")
        """
        epsilon, delta = self.get_privacy_spent()
        budget_remaining = max(0, self.target_epsilon - epsilon)
        budget_utilization = (
            epsilon / self.target_epsilon if self.target_epsilon > 0 else 0
        )
        
        metrics = {
            'epsilon': epsilon,
            'delta': delta,
            'max_grad_norm': self.max_grad_norm,
            'budget_remaining': budget_remaining,
            'budget_utilization': budget_utilization,
            'target_epsilon': self.target_epsilon,
            'target_delta': self.target_delta,
            'accountant': self.accountant,
        }
        
        logger.debug(
            f"Privacy metrics - ε: {epsilon:.4f}/{self.target_epsilon}, "
            f"δ: {delta:.2e}, utilization: {budget_utilization:.1%}"
        )
        
        return metrics
    
    def reset(self):
        """
        Reset the privacy engine (for starting a new training run).
        
        Note: This should only be called between completely separate training
        runs, not between epochs of the same training run.
        """
        self.privacy_engine = None
        self.current_epsilon = 0.0
        logger.info("Privacy engine reset")
    
    @property
    def is_attached(self) -> bool:
        """Check if privacy engine is currently attached."""
        return self.privacy_engine is not None
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"DifferentialPrivacyModule(epsilon={self.target_epsilon}, "
            f"delta={self.target_delta}, max_grad_norm={self.max_grad_norm}, "
            f"accountant={self.accountant}, attached={self.is_attached})"
        )
