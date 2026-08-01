"""
MainTrainer: End-to-end Federated Training Orchestrator for SentryFL

This module implements the main training orchestrator that coordinates the entire
federated learning process, integrating all system modules:
- Data loading and preprocessing
- Federated client and server coordination
- Differential privacy mechanisms
- ADMS parameter efficiency
- Evaluation pipeline
- Checkpoint management and progress logging

Validates Requirements: 2.1-2.10, 5.7, 7.1-7.11, 18.3
"""

import logging
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from typing import Dict, List, Tuple, Optional, Any
from pathlib import Path
import numpy as np

from sentryfl.data.dataset_loader import SMDDatasetLoader, NSLKDDDatasetLoader, FederatedDataPartitioner
from sentryfl.data.preprocessor import TimeSeriesPreprocessor
from sentryfl.federated.client import FederatedClient
from sentryfl.federated.server import AggregationServer
from sentryfl.federated.adms import ADMSModule
from sentryfl.privacy.differential_privacy import DifferentialPrivacyModule
from sentryfl.evaluation.evaluation_pipeline import EvaluationPipeline
from sentryfl.utils.config import ConfigurationSystem
from sentryfl.utils.checkpoint_manager import CheckpointManager
from sentryfl.utils.experiment_logger import ExperimentLogger

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MainTrainer:
    """
    Main training orchestrator for end-to-end federated learning.
    
    This class coordinates:
    1. Data loading and partitioning across clients
    2. Model initialization and distribution
    3. Federated training rounds with client-server communication
    4. Privacy budget monitoring and enforcement
    5. Early stopping based on validation metrics
    6. Checkpoint management and progress logging
    
    Args:
        config: Configuration system with experiment parameters
        model: PyTorch model for anomaly detection
        data_path: Path to dataset directory
        device: Device for computation ('cpu' or 'cuda')
        
    Example:
        >>> config = ConfigurationSystem.from_yaml('config.yaml')
        >>> model = PLMAnomalyDetector(input_dim=38)
        >>> trainer = MainTrainer(config, model, data_path='./data/SMD')
        >>> trainer.train()
    """
    
    def __init__(
        self,
        config: ConfigurationSystem,
        model: nn.Module,
        data_path: str,
        device: str = 'cpu'
    ):
        """Initialize MainTrainer with configuration and model."""
        self.config = config
        self.model = model
        self.data_path = data_path
        self.device = device
        self.model.to(device)
        
        # Extract configuration sections
        self.data_config = config.get_section('data')
        self.training_config = config.get_section('training')
        self.federated_config = config.get_section('federated')
        self.privacy_config = config.get_section('privacy')
        self.param_efficiency_config = config.get_section('parameter_efficiency')
        self.evaluation_config = config.get_section('evaluation')
        self.experiment_config = config.get_section('experiment')
        
        # Set random seed for reproducibility
        torch.manual_seed(self.experiment_config['seed'])
        np.random.seed(self.experiment_config['seed'])
        
        # Initialize components
        self.checkpoint_manager = None
        self.experiment_logger = None
        self.aggregation_server = None
        self.clients: List[FederatedClient] = []
        self.dp_modules: Dict[str, DifferentialPrivacyModule] = {}
        self.adms_modules: Dict[str, ADMSModule] = {}
        
        # Training state
        self.current_round = 0
        self.best_val_metric = 0.0
        self.early_stop_counter = 0
        self.training_complete = False
        
        logger.info(f"MainTrainer initialized with device={device}")
    
    def setup(self):
        """
        Setup all components: data, clients, server, privacy, logging.
        
        This method:
        1. Loads and partitions dataset across clients
        2. Initializes federated clients with local data
        3. Initializes aggregation server
        4. Sets up privacy modules if enabled
        5. Sets up ADMS modules if enabled
        6. Initializes checkpoint manager and experiment logger
        
        Validates Requirements: 2.1, 2.2, 7.1
        """
        logger.info("=" * 80)
        logger.info("SETUP: Initializing all components")
        logger.info("=" * 80)
        
        # 1. Load and partition data
        logger.info("Step 1/6: Loading and partitioning dataset...")
        self._load_and_partition_data()
        
        # 2. Initialize federated clients
        logger.info("Step 2/6: Initializing federated clients...")
        self._initialize_clients()
        
        # 3. Initialize aggregation server
        logger.info("Step 3/6: Initializing aggregation server...")
        self._initialize_server()
        
        # 4. Setup privacy modules
        if self.privacy_config['enabled']:
            logger.info("Step 4/6: Setting up differential privacy modules...")
            self._setup_privacy_modules()
        else:
            logger.info("Step 4/6: Differential privacy disabled, skipping...")
        
        # 5. Setup ADMS modules
        if self.param_efficiency_config['adms_enabled']:
            logger.info("Step 5/6: Setting up ADMS parameter efficiency modules...")
            self._setup_adms_modules()
        else:
            logger.info("Step 5/6: ADMS disabled, skipping...")
        
        # 6. Initialize experiment infrastructure
        logger.info("Step 6/6: Initializing checkpoint manager and experiment logger...")
        self._initialize_experiment_infrastructure()
        
        logger.info("=" * 80)
        logger.info("SETUP COMPLETE: All components initialized successfully")
        logger.info("=" * 80)
    
    def _load_and_partition_data(self):
        """Load dataset and partition across federated clients."""
        dataset_name = self.data_config['dataset']
        
        # Select appropriate dataset loader
        if dataset_name == 'SMD':
            loader = SMDDatasetLoader(machine_id='machine-1-1')
        elif dataset_name == 'NSL-KDD':
            loader = NSLKDDDatasetLoader()
        else:
            raise ValueError(f"Unknown dataset: {dataset_name}")
        
        # Load raw data
        logger.info(f"Loading {dataset_name} dataset from {self.data_path}")
        data_dict = loader.load_data(self.data_path)
        
        # Get feature dimension
        self.feature_dim = loader.get_feature_dim()
        logger.info(f"Feature dimension: {self.feature_dim}")
        
        # Initialize preprocessor
        preprocessor = TimeSeriesPreprocessor(
            window_size=self.data_config['window_size'],
            stride=self.data_config['stride'],
            normalize=self.data_config['normalize']
        )
        
        # Preprocess training data
        if dataset_name == 'SMD':
            train_data = data_dict['train']
            # For SMD, we don't have training labels (unsupervised)
            # Use zeros as placeholder for compatibility
            train_labels = np.zeros(train_data.shape[0])
        else:  # NSL-KDD
            train_data = data_dict['train']
            train_labels = data_dict['train_labels']
        
        # Fit and transform training data
        logger.info("Normalizing training data...")
        train_data_normalized = preprocessor.fit_transform(train_data)
        
        # Create windows
        logger.info("Creating time windows...")
        train_windows, train_window_labels = preprocessor.create_windows(
            train_data_normalized,
            train_labels
        )
        
        logger.info(f"Created {len(train_windows)} training windows")
        
        # Partition data across clients
        logger.info(f"Partitioning data across {self.federated_config['num_clients']} clients...")
        partitioner = FederatedDataPartitioner(
            num_clients=self.federated_config['num_clients'],
            partition_strategy=self.federated_config['partition_strategy'],
            random_seed=self.experiment_config['seed']
        )
        
        client_shards = partitioner.partition(train_windows, train_window_labels)
        
        # Validate partition disjointness
        is_disjoint = partitioner.validate_partition_disjointness(client_shards)
        if is_disjoint:
            logger.info("✓ Data partition validation passed: all shards are disjoint")
        else:
            logger.warning("⚠ Data partition may have overlapping samples")
        
        # Store client data shards
        self.client_data_shards = client_shards
        
        # Process test data for evaluation
        logger.info("Processing test data...")
        if dataset_name == 'SMD':
            test_data = data_dict['test']
            test_labels = data_dict['test_labels']
        else:  # NSL-KDD
            test_data = data_dict['test']
            test_labels = data_dict['test_labels']
        
        # Transform and window test data
        test_data_normalized = preprocessor.transform(test_data)
        test_windows, test_window_labels = preprocessor.create_windows(
            test_data_normalized,
            test_labels
        )
        
        # Convert to tensors
        self.test_data = torch.FloatTensor(test_windows)
        self.test_labels = test_window_labels
        
        logger.info(f"Test set: {len(test_windows)} windows")
        
        # Save preprocessor for inference
        preprocessor_path = Path(self.experiment_config['output_dir']) / 'preprocessor.pkl'
        preprocessor_path.parent.mkdir(parents=True, exist_ok=True)
        preprocessor.save_scaler(str(preprocessor_path))
        
        logger.info(f"Preprocessor saved to {preprocessor_path}")
    
    def _initialize_clients(self):
        """Initialize federated clients with local data shards."""
        num_clients = self.federated_config['num_clients']
        batch_size = self.training_config['batch_size']
        learning_rate = self.training_config['learning_rate']
        
        self.clients = []
        
        for client_id in range(num_clients):
            # Get client data shard
            client_data, client_labels = self.client_data_shards[client_id]
            
            if len(client_data) == 0:
                logger.warning(f"Client {client_id} has empty data shard, skipping...")
                continue
            
            # Convert to tensors
            client_data_tensor = torch.FloatTensor(client_data)
            client_labels_tensor = torch.FloatTensor(client_labels)
            
            # Create client
            client = FederatedClient(
                client_id=f"client_{client_id}",
                model=self.model.__class__(*self._get_model_init_args()),  # Create new model instance
                local_data=(client_data_tensor, client_labels_tensor),
                batch_size=batch_size,
                learning_rate=learning_rate,
                device=self.device
            )
            
            self.clients.append(client)
            
            logger.info(f"Initialized {client.client_id} with {len(client_data)} samples")
        
        logger.info(f"Total clients initialized: {len(self.clients)}")
    
    def _get_model_init_args(self) -> tuple:
        """Get model initialization arguments (to be customized based on model type)."""
        # This is a placeholder - should be customized based on actual model
        # For now, return empty tuple
        return ()
    
    def _initialize_server(self):
        """Initialize aggregation server."""
        checkpoint_dir = Path(self.experiment_config['output_dir']) / 'server_checkpoints'
        
        self.aggregation_server = AggregationServer(
            model=self.model,
            checkpoint_dir=str(checkpoint_dir),
            checkpoint_frequency=self.experiment_config['checkpoint_interval'],
            device=self.device,
            use_byzantine_robust=self.federated_config['byzantine_robust']
        )
        
        logger.info("Aggregation server initialized")
    
    def _setup_privacy_modules(self):
        """Setup differential privacy modules for clients."""
        epsilon = self.privacy_config['epsilon']
        delta = self.privacy_config['delta']
        max_grad_norm = self.privacy_config['max_grad_norm']
        
        for client in self.clients:
            dp_module = DifferentialPrivacyModule(
                model=client.model,
                epsilon=epsilon,
                delta=delta,
                max_grad_norm=max_grad_norm
            )
            self.dp_modules[client.client_id] = dp_module
        
        logger.info(f"Differential privacy enabled: ε={epsilon}, δ={delta}")
    
    def _setup_adms_modules(self):
        """Setup ADMS parameter efficiency modules for clients."""
        selection_ratio = self.param_efficiency_config['selection_ratio']
        
        for client in self.clients:
            adms_module = ADMSModule(
                model=client.model,
                selection_ratio=selection_ratio
            )
            self.adms_modules[client.client_id] = adms_module
        
        logger.info(f"ADMS enabled: selection_ratio={selection_ratio:.1%}")
    
    def _initialize_experiment_infrastructure(self):
        """Initialize checkpoint manager and experiment logger."""
        # Checkpoint manager
        checkpoint_dir = Path(self.experiment_config['output_dir']) / 'checkpoints'
        self.checkpoint_manager = CheckpointManager(
            checkpoint_dir=str(checkpoint_dir),
            checkpoint_interval=self.experiment_config['checkpoint_interval'],
            max_checkpoints=5,
            metric_name='f1_score',
            metric_mode='max'
        )
        
        # Experiment logger
        log_dir = Path(self.experiment_config['output_dir']) / 'logs'
        self.experiment_logger = ExperimentLogger(
            experiment_name=self.experiment_config['name'],
            log_dir=str(log_dir),
            use_tensorboard=True
        )
        
        # Log hyperparameters
        self.experiment_logger.log_hyperparameters(self.config.to_dict())
        
        logger.info("Experiment infrastructure initialized")
    
    def train(self):
        """
        Execute end-to-end federated training loop.
        
        Training loop:
        1. Broadcast global model to selected clients
        2. Clients perform local training
        3. Collect and aggregate client updates
        4. Evaluate on validation set
        5. Check early stopping conditions
        6. Check privacy budget exhaustion
        7. Save checkpoints and log progress
        
        Validates Requirements: 2.1-2.10, 5.7, 7.1-7.11, 18.3
        """
        if not hasattr(self, 'clients') or len(self.clients) == 0:
            raise RuntimeError("Setup not complete. Call setup() before train()")
        
        logger.info("=" * 80)
        logger.info("TRAINING: Starting federated learning")
        logger.info("=" * 80)
        
        num_rounds = self.training_config['num_rounds']
        local_epochs = self.training_config['local_epochs']
        clients_per_round = self.federated_config['clients_per_round']
        
        for round_num in range(1, num_rounds + 1):
            self.current_round = round_num
            logger.info(f"\n{'=' * 80}")
            logger.info(f"ROUND {round_num}/{num_rounds}")
            logger.info(f"{'=' * 80}")
            
            # 1. Broadcast global model to clients
            logger.info(f"Broadcasting global model to {clients_per_round} clients...")
            global_params = self.aggregation_server.broadcast_global_model()
            
            # 2. Select clients for this round
            selected_clients = self._select_clients(clients_per_round)
            logger.info(f"Selected clients: {[c.client_id for c in selected_clients]}")
            
            # 3. Client local training
            round_metrics = []
            for client in selected_clients:
                logger.info(f"\n--- {client.client_id} local training ---")
                
                # Load global model
                client.receive_global_model(global_params)
                
                # Get privacy and ADMS modules if applicable
                dp_module = self.dp_modules.get(client.client_id) if self.privacy_config['enabled'] else None
                adms_module = self.adms_modules.get(client.client_id) if self.param_efficiency_config['adms_enabled'] else None
                
                # Perform local training
                try:
                    local_params, metrics = client.local_training(
                        local_epochs=local_epochs,
                        dp_module=dp_module,
                        adms_module=adms_module
                    )
                    
                    # Collect update from client
                    self.aggregation_server.collect_client_updates(
                        client_id=client.client_id,
                        parameters=local_params,
                        num_samples=client.data_size,
                        metrics=metrics
                    )
                    
                    round_metrics.append(metrics)
                    logger.info(f"{client.client_id} training complete: loss={metrics['final_loss']:.4f}")
                    
                except Exception as e:
                    logger.error(f"{client.client_id} training failed: {e}")
                    continue
            
            # 4. Aggregate client updates
            logger.info(f"\nAggregating updates from {len(round_metrics)} clients...")
            agg_stats = self.aggregation_server.aggregate_updates(
                round_num=round_num,
                min_clients=1
            )
            
            # 5. Compute round metrics
            avg_loss = np.mean([m['final_loss'] for m in round_metrics])
            logger.info(f"Round {round_num} - Average loss: {avg_loss:.4f}")
            
            # 6. Log training metrics
            self.experiment_logger.log_training_metrics(
                round_num=round_num,
                loss=avg_loss,
                **agg_stats
            )
            
            # 7. Check privacy budget exhaustion
            if self.privacy_config['enabled']:
                privacy_exhausted = self._check_privacy_budget()
                if privacy_exhausted:
                    logger.warning("Privacy budget exhausted! Terminating training.")
                    self.training_complete = True
                    break
            
            # 8. Evaluate on validation set (every N rounds)
            if round_num % self.experiment_config['log_interval'] == 0:
                val_metrics = self._evaluate_validation()
                self.experiment_logger.log_evaluation_metrics(
                    epoch_or_round=round_num,
                    **val_metrics.to_dict()
                )
                
                # Check early stopping
                if self._check_early_stopping(val_metrics.f1_score):
                    logger.info("Early stopping triggered!")
                    self.training_complete = True
                    break
            
            # 9. Save checkpoint
            if self.checkpoint_manager.should_save_checkpoint(round_num):
                self._save_checkpoint(round_num, val_metrics.f1_score if 'val_metrics' in locals() else None)
            
            # 10. Log system metrics
            self.experiment_logger.log_system_metrics(round_num)
        
        # Training complete
        logger.info("=" * 80)
        logger.info("TRAINING COMPLETE")
        logger.info("=" * 80)
        
        # Final evaluation
        self._final_evaluation()
        
        # Close logger
        self.experiment_logger.close()
    
    def _select_clients(self, num_clients: int) -> List[FederatedClient]:
        """Select clients for training round (random selection)."""
        if num_clients >= len(self.clients):
            return self.clients
        
        indices = np.random.choice(len(self.clients), size=num_clients, replace=False)
        return [self.clients[i] for i in indices]
    
    def _check_privacy_budget(self) -> bool:
        """Check if privacy budget is exhausted for any client."""
        for client_id, dp_module in self.dp_modules.items():
            if dp_module.is_budget_exhausted():
                logger.warning(f"{client_id} privacy budget exhausted")
                return True
        return False
    
    def _evaluate_validation(self) -> Any:
        """Evaluate model on validation/test set."""
        logger.info("Evaluating on test set...")
        
        evaluator = EvaluationPipeline(
            model=self.aggregation_server.get_global_model(),
            device=self.device,
            threshold=self.evaluation_config.get('anomaly_threshold', 0.5),
            auto_threshold=True
        )
        
        metrics = evaluator.evaluate(
            test_data=self.test_data,
            test_labels=self.test_labels,
            batch_size=self.training_config['batch_size']
        )
        
        logger.info(f"Validation metrics: F1={metrics.f1_score:.4f}, "
                   f"AUC-ROC={metrics.auc_roc:.4f}, AUC-PR={metrics.auc_pr:.4f}")
        
        return metrics
    
    def _check_early_stopping(self, current_metric: float, patience: int = 5) -> bool:
        """
        Check early stopping based on validation metric.
        
        Args:
            current_metric: Current validation metric value
            patience: Number of rounds without improvement before stopping
            
        Returns:
            True if early stopping should trigger, False otherwise
        """
        if current_metric > self.best_val_metric:
            self.best_val_metric = current_metric
            self.early_stop_counter = 0
            logger.info(f"✓ New best validation metric: {current_metric:.4f}")
            return False
        else:
            self.early_stop_counter += 1
            logger.info(f"No improvement ({self.early_stop_counter}/{patience})")
            
            if self.early_stop_counter >= patience:
                return True
            return False
    
    def _save_checkpoint(self, round_num: int, validation_metric: Optional[float]):
        """Save training checkpoint."""
        logger.info(f"Saving checkpoint for round {round_num}...")
        
        training_state = {
            'round_num': round_num,
            'best_val_metric': self.best_val_metric,
            'early_stop_counter': self.early_stop_counter,
            'config': self.config.to_dict()
        }
        
        # Add privacy state if applicable
        if self.privacy_config['enabled']:
            privacy_metrics = {}
            for client_id, dp_module in self.dp_modules.items():
                epsilon, delta = dp_module.get_privacy_spent()
                privacy_metrics[client_id] = {'epsilon': epsilon, 'delta': delta}
            training_state['privacy_metrics'] = privacy_metrics
        
        # Save via aggregation server (which uses checkpoint manager internally)
        self.aggregation_server.save_checkpoint(
            round_num=round_num,
            metadata=training_state
        )
        
        logger.info(f"✓ Checkpoint saved for round {round_num}")
    
    def _final_evaluation(self):
        """Perform final comprehensive evaluation."""
        logger.info("\n" + "=" * 80)
        logger.info("FINAL EVALUATION")
        logger.info("=" * 80)
        
        evaluator = EvaluationPipeline(
            model=self.aggregation_server.get_global_model(),
            device=self.device,
            auto_threshold=True
        )
        
        # Evaluate on test set
        final_metrics = evaluator.evaluate(
            test_data=self.test_data,
            test_labels=self.test_labels,
            batch_size=self.training_config['batch_size']
        )
        
        logger.info("\nFinal Test Metrics:")
        logger.info(f"  Precision:  {final_metrics.precision:.4f}")
        logger.info(f"  Recall:     {final_metrics.recall:.4f}")
        logger.info(f"  F1-Score:   {final_metrics.f1_score:.4f}")
        logger.info(f"  AUC-ROC:    {final_metrics.auc_roc:.4f}")
        logger.info(f"  AUC-PR:     {final_metrics.auc_pr:.4f}")
        logger.info(f"  Accuracy:   {final_metrics.accuracy:.4f}")
        logger.info(f"  Latency:    {final_metrics.avg_latency_ms:.2f} ms")
        
        # Save final metrics
        final_metrics_path = Path(self.experiment_config['output_dir']) / 'final_metrics.json'
        import json
        with open(final_metrics_path, 'w') as f:
            json.dump(final_metrics.to_dict(), f, indent=2)
        
        # Generate and save plots if requested
        if self.evaluation_config.get('save_plots', False):
            plot_dir = Path(self.experiment_config['output_dir']) / 'plots'
            plot_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate ROC curve
            scores = evaluator.compute_anomaly_scores(self.test_data, self.training_config['batch_size'])
            evaluator.generate_roc_curve(
                self.test_labels,
                scores,
                save_path=str(plot_dir / 'roc_curve.png')
            )
            
            # Generate PR curve
            evaluator.generate_pr_curve(
                self.test_labels,
                scores,
                save_path=str(plot_dir / 'pr_curve.png')
            )
            
            logger.info(f"✓ Evaluation plots saved to {plot_dir}")
        
        logger.info("=" * 80)
        logger.info("EXPERIMENT COMPLETE")
        logger.info("=" * 80)
    
    def resume_from_checkpoint(self, checkpoint_path: str):
        """
        Resume training from a saved checkpoint.
        
        Args:
            checkpoint_path: Path to checkpoint file
        """
        logger.info(f"Resuming training from checkpoint: {checkpoint_path}")
        
        # Load checkpoint via aggregation server
        metadata = self.aggregation_server.load_checkpoint(checkpoint_path)
        
        # Restore training state
        self.current_round = metadata.get('round_num', 0)
        self.best_val_metric = metadata.get('best_val_metric', 0.0)
        self.early_stop_counter = metadata.get('early_stop_counter', 0)
        
        # Restore privacy state if applicable
        if 'privacy_metrics' in metadata and self.privacy_config['enabled']:
            logger.info("Restoring privacy budget state...")
            # Note: Actual privacy budget restoration would require more sophisticated handling
            # For now, we just log the previous state
            for client_id, privacy_state in metadata['privacy_metrics'].items():
                logger.info(f"  {client_id}: ε={privacy_state['epsilon']:.4f}")
        
        logger.info(f"✓ Training resumed from round {self.current_round}")


def create_trainer_from_config(
    config_path: str,
    model: nn.Module,
    data_path: str,
    device: Optional[str] = None
) -> MainTrainer:
    """
    Convenience function to create MainTrainer from configuration file.
    
    Args:
        config_path: Path to YAML or JSON configuration file
        model: PyTorch model for anomaly detection
        data_path: Path to dataset directory
        device: Device for computation (auto-detected if None)
        
    Returns:
        Configured MainTrainer instance
    """
    # Load configuration
    config = ConfigurationSystem.from_yaml(config_path)
    
    # Auto-detect device if not specified
    if device is None:
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    # Create trainer
    trainer = MainTrainer(
        config=config,
        model=model,
        data_path=data_path,
        device=device
    )
    
    return trainer
