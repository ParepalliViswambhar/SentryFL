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

import copy
import json
import logging
import random
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from typing import Callable, Dict, List, Tuple, Optional, Any
from pathlib import Path
import numpy as np

from sentryfl.data.dataset_loader import SMDDatasetLoader, NSLKDDDatasetLoader, FederatedDataPartitioner
from sentryfl.data.preprocessor import TimeSeriesPreprocessor
from sentryfl.data.ppds import generate_pooled_synthetic_windows
from sentryfl.federated.client import FederatedClient
from sentryfl.federated.server import AggregationServer
from sentryfl.federated.adms import ADMSModule
from sentryfl.privacy.differential_privacy import DifferentialPrivacyModule
from sentryfl.privacy.privacy_ledger import PrivacyLedger
from sentryfl.evaluation.evaluation_pipeline import EvaluationPipeline
from sentryfl.utils.comm_meter import measure_update_bytes
from sentryfl.utils.config import ConfigurationSystem
from sentryfl.utils.checkpoint_manager import CheckpointManager
from sentryfl.utils.experiment_logger import ExperimentLogger
from sentryfl.utils.validation import check_gpu_memory
from sentryfl.utils.exceptions import MemoryError as SentryFLMemoryError
from sentryfl.utils.reproducibility import ReproducibilityManager
from sentryfl.utils.manifest import build_manifest, sha256_json
from sentryfl.optimization.quantization_engine import QuantizationEngine
from sentryfl.models.knowledge_distillation import KnowledgeDistillationModule

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
        device: str = 'cpu',
        on_round_metrics: Optional[Callable[[int, Dict[str, Any]], None]] = None,
        stop_event: Optional[Any] = None
    ):
        """Initialize MainTrainer with configuration and model."""
        self.config = config
        self.model = model
        self.data_path = data_path
        self.device = device
        self.on_round_metrics = on_round_metrics
        self.stop_event = stop_event
        self.model.to(device)
        
        # GPU memory check with CPU fallback (Requirement 18.7)
        if device == 'cuda' or device.startswith('cuda:'):
            device_id = 0 if device == 'cuda' else int(device.split(':')[1])
            is_available, message = check_gpu_memory(device_id=device_id)
            
            if not is_available:
                logger.warning(f"GPU memory check failed: {message}")
                logger.warning("Falling back to CPU for training")
                self.device = 'cpu'
                self.model.to('cpu')
            else:
                logger.info(message)
        
        # Extract configuration sections
        self.data_config = config.get_section('data')
        self.training_config = config.get_section('training')
        self.federated_config = config.get_section('federated')
        self.privacy_config = config.get_section('privacy')
        self.param_efficiency_config = config.get_section('parameter_efficiency')
        self.optimization_config = config.get_section('optimization')
        self.evaluation_config = config.get_section('evaluation')
        self.experiment_config = config.get_section('experiment')

        # v2: resolve the privacy mechanism and parameter-efficiency method with
        # backward-compatible defaults derived from the legacy flags.
        privacy_enabled = self.privacy_config.get('enabled', False)
        self.privacy_mechanism = self.privacy_config.get(
            'mechanism', 'record_dpsgd' if privacy_enabled else 'none'
        )
        if not privacy_enabled:
            self.privacy_mechanism = 'none'
        self.peft_method = self.param_efficiency_config.get(
            'method', 'adms' if self.param_efficiency_config.get('adms_enabled', False) else 'full_head'
        )
        # DP-FedAvg server-side components (built in _initialize_server).
        self.dp_fedavg_mechanism = None
        self.privacy_budget = None
        privacy_scope = (
            'client/silo/entity-level'
            if self.privacy_mechanism == 'dp_fedavg'
            else 'record-level client-side'
            if self.privacy_mechanism == 'record_dpsgd'
            else 'not applicable'
        )
        self.privacy_ledger = PrivacyLedger(
            mechanism=self.privacy_mechanism,
            scope=privacy_scope,
            accountant=self.privacy_config.get('accountant'),
            target_epsilon=self.privacy_config.get('epsilon'),
            target_delta=self.privacy_config.get('delta'),
        )
        self.privacy_ledger.record_release(
            release_type='raw_records',
            audience='client-local process',
            status='not_released',
            potentially_leaky=False,
            details={'federation_mode': 'in_process_simulation'},
        )
        self.privacy_ledger.record_release(
            release_type='global_model_artifact',
            audience='authorized artifact download',
            status='available_when_completed',
            details={'artifact_endpoint': '/experiments/:id/model'},
        )
        
        # Setup reproducibility with comprehensive seed setting (Requirements 20.11, 20.12)
        self.repro_manager = ReproducibilityManager(
            seed=self.experiment_config.get('seed', 42),
            log_dir=self.experiment_config.get('output_dir', '.')
        )
        self.repro_manager.set_seed()
        logger.info(f"Random seed set to {self.repro_manager.seed} for reproducibility")
        
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
        # Provenance populated during setup. Keeping these explicit makes the
        # manifest available to the API/reporting layer without re-reading raw
        # client data.
        self.dataset_provenance: Dict[str, Any] = {}
        self.split_provenance: Dict[str, Any] = {}
        self.manifest_path: Optional[str] = None
        self.result_report_path: Optional[str] = None
        self.distillation_report: Optional[Dict[str, Any]] = None
        
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
        
        # 4. Setup privacy modules. Client-side Opacus DP-SGD is only used in the
        # legacy record-level mechanism; DP-FedAvg adds noise server-side (already
        # configured in _initialize_server), so no per-client Opacus attach.
        if self.privacy_mechanism == 'record_dpsgd':
            logger.info("Step 4/6: Setting up record-level DP-SGD (Opacus) modules...")
            self._setup_privacy_modules()
        elif self.privacy_mechanism == 'dp_fedavg':
            logger.info("Step 4/6: Using aggregate-level DP-FedAvg (server-side noise); "
                        "skipping client Opacus attach...")
        else:
            logger.info("Step 4/6: Differential privacy disabled, skipping...")

        # 5. Setup ADMS modules (legacy parameter-efficiency baseline). LoRA/FFA-LoRA
        # are baked into the model architecture at construction, not here.
        if self.peft_method == 'adms':
            logger.info("Step 5/6: Setting up ADMS parameter efficiency modules...")
            self._setup_adms_modules()
        else:
            logger.info(f"Step 5/6: peft_method={self.peft_method}; ADMS masking not used...")
        
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
        
        # Split the source training stream before fitting statistics. Each
        # segment is windowed independently so a window cannot cross a split
        # boundary. The held-out dataset file remains the final test split.
        temporal_ranges = preprocessor.temporal_split_indices(
            len(train_data),
            train_ratio=self.data_config['train_ratio'],
            val_ratio=self.data_config['val_ratio'],
        )
        train_start, train_end = temporal_ranges['train']
        val_start, val_end = temporal_ranges['val']
        source_train = train_data[train_start:train_end]
        source_val = train_data[val_start:val_end]
        source_train_labels = train_labels[train_start:train_end]
        source_val_labels = train_labels[val_start:val_end]
        chunk_size = self.data_config.get('chunk_size', 4096)

        # Fit normalization on the training segment only. Validation and test
        # statistics are never allowed to influence the fitted scaler.
        logger.info("Normalizing training data using the training segment only...")
        train_data_normalized = preprocessor.fit_transform(source_train)
        val_data_normalized = preprocessor.transform(source_val)

        # Create windows independently for each split to preserve temporal
        # boundaries and deterministic sample membership.
        logger.info("Creating leakage-free temporal windows...")
        train_windows, train_window_labels = preprocessor.create_windows(
            train_data_normalized, source_train_labels, chunk_size=chunk_size
        )
        val_windows, val_window_labels = preprocessor.create_windows(
            val_data_normalized, source_val_labels, chunk_size=chunk_size
        )
        self.calibration_data = torch.FloatTensor(train_windows)
        self.validation_data = torch.FloatTensor(val_windows)
        self.validation_labels = val_window_labels

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
        
        # Transform and window the independent held-out test file with the
        # training-only scaler. The source range is recorded for provenance;
        # test-file rows are not mixed with the training stream.
        test_data_normalized = preprocessor.transform(test_data)
        test_windows, test_window_labels = preprocessor.create_windows(
            test_data_normalized,
            test_labels,
            chunk_size=chunk_size,
        )
        
        # Convert to tensors
        self.test_data = torch.FloatTensor(test_windows)
        self.test_labels = test_window_labels

        logger.info(f"Test set: {len(test_windows)} windows")

        self.split_provenance = {
            'strategy': 'temporal',
            'training_source_rows': len(train_data),
            'training_source_ranges': {
                'train': list(temporal_ranges['train']),
                'val': list(temporal_ranges['val']),
                'test_reserve': list(temporal_ranges['test']),
            },
            'held_out_test_source_rows': len(test_data),
            'window_size': self.data_config['window_size'],
            'stride': self.data_config['stride'],
            'window_counts': {
                'train': len(train_windows),
                'val': len(val_windows),
                'test': len(test_windows),
            },
            'normalization_fit_split': 'train',
            'test_source': 'held_out_dataset_file',
        }
        self.dataset_provenance = {
            'name': dataset_name,
            'path': str(Path(self.data_path).resolve()),
            'loader': f'{loader.__class__.__module__}.{loader.__class__.__qualname__}',
            **loader.get_data_contract(),
            'sequence_semantics': (
                'contiguous source-file order; not natural temporal order'
                if dataset_name == 'NSL-KDD'
                else 'contiguous machine telemetry order'
            ),
        }
        self.split_checksum = sha256_json(self.split_provenance)
        
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
        num_workers = self.training_config.get('num_workers', 0)
        pin_memory = self.training_config.get('pin_memory', False)
        prefetch_factor = self.training_config.get('prefetch_factor', 2)
        
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
            
            # Create client with a clone of the global model architecture. deepcopy
            # preserves the exact configuration (frozen backbone, injected LoRA /
            # FFA-LoRA adapters) that the main model was built with, unlike
            # reconstructing from a placeholder arg list.
            client = FederatedClient(
                client_id=f"client_{client_id}",
                model=copy.deepcopy(self.model),
                local_data=(client_data_tensor, client_labels_tensor),
                batch_size=batch_size,
                learning_rate=learning_rate,
                device=self.device,
                num_workers=num_workers,
                pin_memory=pin_memory,
                prefetch_factor=prefetch_factor,
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
        """Initialize aggregation server (with aggregate-level DP-FedAvg if selected)."""
        checkpoint_dir = Path(self.experiment_config['output_dir']) / 'server_checkpoints'

        # v2: build the DP-FedAvg mechanism + PRV budget when selected.
        if self.privacy_mechanism == 'dp_fedavg':
            from sentryfl.privacy.dp_fedavg import (
                DPFedAvgMechanism, PRVBudget, solve_noise_multiplier_fedavg,
            )
            num_clients = self.federated_config['num_clients']
            clients_per_round = self.federated_config.get('clients_per_round', num_clients)
            num_rounds = self.training_config['num_rounds']
            sample_rate = min(1.0, clients_per_round / max(1, num_clients))
            clip_norm = self.privacy_config.get('clip_norm', self.privacy_config.get('max_grad_norm', 1.0))
            accountant = self.privacy_config.get('accountant', 'prv')
            noise_multiplier = self.privacy_config.get('noise_multiplier')
            if noise_multiplier is None:
                noise_multiplier = solve_noise_multiplier_fedavg(
                    target_epsilon=self.privacy_config['epsilon'],
                    target_delta=self.privacy_config['delta'],
                    sample_rate=sample_rate,
                    num_rounds=num_rounds,
                    accountant=accountant,
                )
            self.dp_fedavg_mechanism = DPFedAvgMechanism(
                clip_norm=clip_norm,
                noise_multiplier=noise_multiplier,
                seed=self.experiment_config.get('seed', 42),
            )
            self.privacy_budget = PRVBudget(
                sample_rate=sample_rate,
                noise_multiplier=noise_multiplier,
                accountant=accountant,
            )
            logger.info(
                f"DP-FedAvg enabled: clip_norm={clip_norm}, "
                f"noise_multiplier={noise_multiplier:.4f}, sample_rate={sample_rate:.4f}, "
                f"accountant={accountant}, target ε={self.privacy_config['epsilon']}"
            )

        self.aggregation_server = AggregationServer(
            model=self.model,
            checkpoint_dir=str(checkpoint_dir),
            checkpoint_frequency=self.experiment_config['checkpoint_interval'],
            device=self.device,
            use_byzantine_robust=self.federated_config['byzantine_robust'],
            dp_fedavg=self.dp_fedavg_mechanism,
            privacy_budget=self.privacy_budget,
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
            # ADMS is a client-side importance mask. Generate it from the
            # client's private shard before the first round; otherwise the
            # module exists but its gradient mask remains unused.
            adms_module.compute_importance(
                anomaly_loader=client.load_local_data(),
                criterion=client.criterion,
                device=self.device,
            )
            adms_module.generate_mask()
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
        
        # Log system information for reproducibility (Requirements 20.5, 20.12)
        system_info_path = self.repro_manager.log_system_info(
            output_path=str(Path(self.experiment_config['output_dir']) / 'system_info.json')
        )
        logger.info(f"System information logged to {system_info_path}")
        
        # Create reproducibility report (combines system info + config)
        repro_report_path = self.repro_manager.create_reproducibility_report(
            experiment_config=self.config.to_dict(),
            output_path=str(Path(self.experiment_config['output_dir']) / 'reproducibility_report.json')
        )
        logger.info(f"Reproducibility report saved to {repro_report_path}")

        # Persist the PRD manifest alongside the existing human-oriented
        # reproducibility report. Dataset files are represented by checksums;
        # raw client records never enter the manifest.
        system_info = self.repro_manager.system_info or self.repro_manager.get_system_info()
        manifest = build_manifest(
            config=self.config.to_dict(),
            seed=self.repro_manager.seed,
            dataset_name=self.data_config['dataset'],
            dataset_root=self.data_path,
            dataset_contract=self.dataset_provenance,
            split_checksum=self.split_checksum,
            model=self.model,
            model_config=self.config.get_section('model'),
            hardware=system_info.get('hardware', {}),
            repo_dir=Path(__file__).resolve().parents[1],
            evidence_status='measured',
        )
        self.manifest_path = manifest.write(
            Path(self.experiment_config['output_dir']) / 'manifest.json'
        )
        logger.info(f"Experiment manifest saved to {self.manifest_path}")
        
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
        
        # A resumed checkpoint represents the completed round stored in
        # ``current_round``. Continue from the next round rather than replaying
        # the completed one.
        start_round = max(1, self.current_round + 1)
        for round_num in range(start_round, num_rounds + 1):
            if self.stop_event is not None and self.stop_event.is_set():
                break
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
            round_upload_bytes = 0  # measured serialized upload bytes this round
            for client in selected_clients:
                logger.info(f"\n--- {client.client_id} local training ---")
                
                # Load global model
                client.receive_global_model(global_params)
                
                # Get privacy and ADMS modules if applicable. In dp_fedavg mode
                # dp_modules is empty (noise is added server-side), so dp_module=None
                # and clients train plainly; the server clips+noises the aggregate.
                dp_module = self.dp_modules.get(client.client_id) if self.privacy_mechanism == 'record_dpsgd' else None
                adms_module = self.adms_modules.get(client.client_id) if self.peft_method == 'adms' else None
                
                # Perform local training
                try:
                    local_params, metrics = client.local_training(
                        local_epochs=local_epochs,
                        dp_module=dp_module,
                        adms_module=adms_module
                    )

                    # Measure the ACTUAL serialized bytes this client uploads (v2
                    # honest communication accounting). For FFA-LoRA this is just the
                    # small adapter matrices; for full-head/ADMS it is the dense set.
                    client_bytes = measure_update_bytes(local_params)
                    round_upload_bytes += client_bytes
                    metrics['upload_bytes'] = client_bytes

                    # Collect update from client
                    self.aggregation_server.collect_client_updates(
                        client_id=client.client_id,
                        parameters=local_params,
                        num_samples=client.data_size,
                        metrics=metrics
                    )

                    round_metrics.append(metrics)
                    logger.info(
                        f"{client.client_id} training complete: "
                        f"loss={metrics['final_loss']:.4f}, upload={client_bytes/1024:.1f} KiB"
                    )
                    
                except Exception as e:
                    logger.error(f"{client.client_id} training failed: {e}")
                    continue
            
            # 4. Aggregate client updates
            logger.info(f"\nAggregating updates from {len(round_metrics)} clients...")
            if not round_metrics:
                raise RuntimeError(
                    f"Round {round_num} produced no valid client updates; "
                    "training cannot continue with fabricated metrics"
                )
            agg_stats = self.aggregation_server.aggregate_updates(
                round_num=round_num,
                min_clients=1
            )
            if agg_stats.get('status') == 'insufficient_clients':
                raise RuntimeError(
                    f"Round {round_num} could not aggregate the accepted client "
                    f"updates: {agg_stats}"
                )
            
            # 5. Compute round metrics
            avg_loss = np.mean([m['final_loss'] for m in round_metrics])
            logger.info(f"Round {round_num} - Average loss: {avg_loss:.4f}")
            
            # 5b. Communication accounting (measured serialized bytes on the wire).
            n_participants = max(1, len(round_metrics))
            comm_stats = {
                'round_upload_bytes': round_upload_bytes,
                'avg_client_upload_bytes': round_upload_bytes / n_participants,
                'peft_method': self.peft_method,
            }
            logger.info(
                f"Round {round_num} communication: {round_upload_bytes/1024:.1f} KiB "
                f"uploaded across {n_participants} clients ({self.peft_method})"
            )

            # 6. Log training metrics
            self.experiment_logger.log_training_metrics(
                round_num=round_num,
                loss=avg_loss,
                **agg_stats,
                **comm_stats
            )

            # Keep communication as its own evidence category.  The payload
            # value is measured from the serialized client update above; no
            # download or network overhead is inferred when it was not
            # observed.
            self.experiment_logger.log_communication_metrics(
                round_num=round_num,
                bytes_transferred=round_upload_bytes,
                num_clients=n_participants,
                bytes_sent=round_upload_bytes,
                accepted_updates=agg_stats.get('accepted_updates', n_participants),
                rejected_updates=agg_stats.get('rejected_updates', {}),
                avg_client_upload_bytes=round_upload_bytes / n_participants,
                peft_method=self.peft_method,
                aggregation_method=agg_stats.get('aggregation_method'),
            )

            # Privacy accounting is a separate measured stream.  MIA is not
            # generated by training and therefore remains absent unless an
            # explicit attack evaluation supplies it.
            if self.privacy_mechanism == 'dp_fedavg':
                dp_stats = getattr(self.aggregation_server, '_last_dp_stats', {})
                if 'epsilon' in dp_stats:
                    self.experiment_logger.log_privacy_metrics(
                        round_num=round_num,
                        epsilon=dp_stats['epsilon'],
                        delta=self.privacy_config['delta'],
                        mechanism='dp_fedavg',
                        scope='client/silo/entity-level',
                        accountant=self.privacy_config.get('accountant'),
                    )
            elif self.privacy_mechanism == 'record_dpsgd':
                client_epsilons = [
                    metric['epsilon_spent']
                    for metric in round_metrics
                    if metric.get('epsilon_spent') is not None
                ]
                if client_epsilons:
                    self.experiment_logger.log_privacy_metrics(
                        round_num=round_num,
                        epsilon=max(client_epsilons),
                        delta=self.privacy_config['delta'],
                        mechanism='record_dpsgd',
                        scope='record-level client-side baseline',
                        participating_entities=len(client_epsilons),
                    )

            # The ledger records model-state exposure separately from formal
            # accountant events. This is an internal simulator boundary, not a
            # claim that released model updates are harmless.
            self.privacy_ledger.record_release(
                release_type='global_model_update',
                audience='simulated client shards',
                status='internal_round_state',
                round=round_num,
                details={'accepted_updates': agg_stats.get('accepted_updates', 0)},
            )
            if self.privacy_mechanism == 'dp_fedavg':
                dp_stats = getattr(self.aggregation_server, '_last_dp_stats', {})
                if 'epsilon' in dp_stats:
                    self.privacy_ledger.record_accounting(
                        round=round_num,
                        epsilon=dp_stats['epsilon'],
                        delta=self.privacy_config['delta'],
                        mechanism='dp_fedavg',
                        scope='client/silo/entity-level',
                        accountant=self.privacy_config.get('accountant'),
                        sample_rate=(
                            self.privacy_budget.sample_rate
                            if self.privacy_budget is not None else None
                        ),
                        participating_clients=agg_stats.get('accepted_updates'),
                    )
            elif self.privacy_mechanism == 'record_dpsgd':
                ledger_epsilons = []
                for dp_module in self.dp_modules.values():
                    epsilon, _ = dp_module.get_privacy_spent()
                    ledger_epsilons.append(epsilon)
                if ledger_epsilons:
                    self.privacy_ledger.record_accounting(
                        round=round_num,
                        epsilon=max(ledger_epsilons),
                        delta=self.privacy_config['delta'],
                        mechanism='record_dpsgd',
                        scope='record-level client-side',
                        accountant=self.privacy_config.get('accountant'),
                        participating_clients=len(round_metrics),
                    )

            if self.on_round_metrics is not None:
                self.on_round_metrics(round_num, self.experiment_logger.get_all_metrics())
            
            # 7. Check privacy budget exhaustion
            if self.privacy_mechanism != 'none':
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

        # INT8 is post-training static quantization in SentryFL.  It is applied
        # after federated optimization so quantized kernels never interfere with
        # autograd or DP accounting during local client training.
        if self.config.get_section('optimization').get('quantization_enabled', False):
            self._quantize_final_model()
        
        # Close logger
        self.experiment_logger.close()

    def _quantize_final_model(self):
        """Convert the trained global model to INT8 for edge inference."""
        logger.info("INT8 quantization enabled: quantizing the final global model")
        calibration_size = self.optimization_config.get('quantization_calibration_batches', 10)
        calibration_dataset = TensorDataset(
            self.calibration_data,
            torch.zeros(len(self.calibration_data), dtype=torch.float32),
        )
        calibration_loader = DataLoader(
            calibration_dataset,
            batch_size=self.training_config['batch_size'],
            shuffle=False,
        )
        engine = QuantizationEngine(
            self.aggregation_server.get_global_model(),
            device='cpu',
        )
        engine.calibrate(calibration_loader, num_batches=calibration_size)
        quantized_model = engine.convert_to_int8()
        quantized_path = Path(self.experiment_config['output_dir']) / 'global_model_int8.pt'
        torch.save(quantized_model.state_dict(), quantized_path)
        logger.info("INT8 global model saved to %s", quantized_path)
    
    def _select_clients(self, num_clients: int) -> List[FederatedClient]:
        """Select clients for training round (random selection)."""
        if num_clients >= len(self.clients):
            return self.clients
        
        indices = np.random.choice(len(self.clients), size=num_clients, replace=False)
        return [self.clients[i] for i in indices]
    
    def _check_privacy_budget(self) -> bool:
        """Check if privacy budget is exhausted (per-client for record-DP, or the
        federation-level PRV budget for DP-FedAvg)."""
        if self.privacy_mechanism == 'dp_fedavg' and self.privacy_budget is not None:
            if self.dp_fedavg_mechanism is not None and self.dp_fedavg_mechanism.noise_multiplier <= 0:
                return False  # no privacy target when noiseless
            exhausted = self.privacy_budget.is_exhausted(
                self.privacy_config['epsilon'], self.privacy_config['delta']
            )
            if exhausted:
                logger.warning(
                    f"Federation PRV budget exhausted: "
                    f"ε={self.privacy_budget.epsilon(self.privacy_config['delta']):.3f} "
                    f">= target {self.privacy_config['epsilon']}"
                )
            return exhausted
        for client_id, dp_module in self.dp_modules.items():
            if dp_module.is_budget_exhausted():
                logger.warning(f"{client_id} privacy budget exhausted")
                return True
        return False
    
    def _evaluate_validation(self) -> Any:
        """Evaluate model on the leakage-free validation split."""
        logger.info("Evaluating on validation split...")
        
        evaluator = EvaluationPipeline(
            model=self.aggregation_server.get_global_model(),
            device=self.device,
            threshold=None,  # v2: use honest thresholding, not a hard-coded 0.5
            auto_threshold=True,
            threshold_split=self.evaluation_config.get('threshold_split', 'val'),
        )

        metrics = evaluator.evaluate(
            test_data=self.validation_data,
            test_labels=self.validation_labels,
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
            'config': self.config.to_dict(),
            'optimizer_states': {
                client.client_id: client.optimizer.state_dict()
                for client in self.clients
            },
            'rng_state': self._capture_rng_state(),
            'dp_states': {
                client_id: dp_module.state_dict()
                for client_id, dp_module in self.dp_modules.items()
            },
            'privacy_ledger': self.privacy_ledger.state_dict(),
        }
        
        # Add privacy state if applicable
        if self.privacy_mechanism == 'dp_fedavg' and self.privacy_budget is not None:
            # Federation-level cumulative (ε, δ) for DP-FedAvg.
            try:
                eps = self.privacy_budget.epsilon(self.privacy_config['delta'])
            except (OverflowError, ValueError):
                eps = float('inf')
            training_state['privacy_metrics'] = {
                'federation': {
                    'epsilon': eps,
                    'delta': self.privacy_config['delta'],
                    'rounds': self.privacy_budget.rounds,
                    'mechanism': 'dp_fedavg',
                }
            }
        elif self.privacy_mechanism == 'record_dpsgd':
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
            auto_threshold=True,
            threshold_split=self.evaluation_config.get('threshold_split', 'val'),
        )

        # Evaluate on test set
        final_metrics = evaluator.evaluate(
            test_data=self.test_data,
            test_labels=self.test_labels,
            batch_size=self.training_config['batch_size'],
            val_data=self.validation_data,
            val_labels=self.validation_labels,
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
        with open(final_metrics_path, 'w') as f:
            json.dump(final_metrics.to_dict(), f, indent=2)

        self._run_optional_distillation()
        self._write_result_report(final_metrics.to_dict())
        
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

    def _run_optional_distillation(self) -> None:
        """Run client-local PPDS followed by teacher-to-student distillation."""
        peft = self.param_efficiency_config
        optimization = self.optimization_config
        if not (
            peft.get('ppds_enabled', False)
            and optimization.get('knowledge_distillation_enabled', False)
        ):
            return
        if not self.clients:
            raise RuntimeError("PPDS/KD requires initialized federated clients")

        client_windows = [client.local_data[0].detach().cpu() for client in self.clients]
        synthetic, ppds_metadata = generate_pooled_synthetic_windows(
            client_windows,
            samples_per_client=peft.get('ppds_samples_per_client', 32),
            epochs=peft.get('ppds_epochs', 5),
            latent_dim=peft.get('ppds_latent_dim', 16),
            batch_size=self.training_config['batch_size'],
            beta=peft.get('ppds_beta', 0.001),
            device=self.device,
        )
        teacher = self.aggregation_server.get_global_model()
        teacher.eval()
        with torch.no_grad():
            pseudo_labels = (torch.sigmoid(teacher(synthetic.to(self.device)).detach().cpu()) >= 0.5).float()
        student_data = TensorDataset(synthetic, pseudo_labels)
        student_loader = DataLoader(
            student_data,
            batch_size=self.training_config['batch_size'],
            shuffle=True,
        )
        distiller = KnowledgeDistillationModule(
            teacher_model=teacher,
            input_dim=synthetic.shape[-1],
            student_hidden_dim=optimization.get('distillation_hidden_dim', 256),
            student_num_layers=optimization.get('distillation_num_layers', 2),
            temperature=optimization.get('distillation_temperature', 3.0),
            alpha=optimization.get('distillation_alpha', 0.5),
            device=self.device,
        )
        optimizer = torch.optim.Adam(
            distiller.student_model.parameters(), lr=self.training_config['learning_rate']
        )
        history = distiller.train_student(
            student_loader,
            optimizer,
            num_epochs=optimization.get('distillation_epochs', 5),
        )
        output_dir = Path(self.experiment_config['output_dir'])
        student_path = output_dir / 'distilled_student.pt'
        torch.save(
            {
                'state_dict': distiller.student_model.state_dict(),
                'input_shape': list(synthetic.shape[1:]),
                'teacher_model': teacher.__class__.__name__,
                'config': {
                    'temperature': distiller.temperature,
                    'alpha': distiller.alpha,
                },
            },
            student_path,
        )
        self.distillation_report = {
            'status': 'measured',
            'ppds': {
                'clients': len(ppds_metadata),
                'synthetic_samples': len(synthetic),
                'client_reports': ppds_metadata,
            },
            'student': {
                'artifact': str(student_path),
                'teacher_parameters': sum(p.numel() for p in teacher.parameters()),
                'student_parameters': distiller.student_model.get_total_parameters(),
                'size_reduction_percentage': distiller.size_reduction_percentage,
                'history': history,
            },
        }

    def _write_result_report(self, metrics: Dict[str, Any]) -> None:
        """Write the machine-readable evidence and limitations report."""
        if self.privacy_mechanism == 'dp_fedavg':
            privacy_scope = (
                'client/silo/entity-level DP-FedAvg; this does not claim '
                'record-level or natural-user privacy for SMD/NSL-KDD'
            )
        elif self.privacy_mechanism == 'record_dpsgd':
            privacy_scope = 'record-level client-side DP-SGD baseline'
        else:
            privacy_scope = 'no formal differential privacy mechanism enabled'

        report = {
            'schema_version': '1.0',
            'experiment': {
                'name': self.experiment_config['name'],
                'seed': self.repro_manager.seed,
                'device': self.device,
                'federation_mode': 'in_process_simulation',
            },
            'provenance': {
                'manifest_path': self.manifest_path,
                'dataset': self.dataset_provenance,
                'split_checksum': getattr(self, 'split_checksum', None),
                'model_revision': self.config.get_section('model'),
            },
            'privacy': {
                'scope': privacy_scope,
                'mechanism': self.privacy_mechanism,
                'accountant': self.privacy_config.get('accountant'),
                'target_epsilon': self.privacy_config.get('epsilon'),
                'target_delta': self.privacy_config.get('delta'),
                'ledger': self.privacy_ledger.summary(),
                'release_inventory': self.privacy_ledger.summary()['release_inventory'],
                'unit': (
                    'client/silo/entity'
                    if self.privacy_mechanism == 'dp_fedavg'
                    else 'record'
                    if self.privacy_mechanism == 'record_dpsgd'
                    else None
                ),
            },
            'evidence': [
                {
                    'component': 'configured_training_pipeline',
                    'status': 'implemented',
                    'source': 'versioned_source_and_tests',
                },
                {
                    'component': 'training_metrics',
                    'status': 'measured',
                    'source': 'runtime_round_metrics',
                },
                {
                    'component': 'membership_inference_attack',
                    'status': 'experimentally_unverified',
                    'source': 'leakage_free_protocol_available_but_not_run_by_trainer',
                },
                {
                    'component': 'pretrained_backbone_result',
                    'status': 'experimentally_unverified',
                    'source': 'clean_seeded_model_study_not_yet_attached',
                },
                {
                    'component': 'federation_topology',
                    'status': 'simulated',
                    'source': 'process_local_client_shards',
                },
                {
                    'component': 'remote_client_deployment',
                    'status': 'unsupported',
                    'source': 'no_remote_enrollment_or_update_transport',
                },
                {
                    'component': 'knowledge_distillation',
                    'status': (
                        self.distillation_report['status']
                        if self.distillation_report else 'unsupported'
                    ),
                    'source': (
                        'client-local PPDS and teacher/student distillation'
                        if self.distillation_report else 'disabled in configuration'
                    ),
                },
                {
                    'component': 'ppds',
                    'status': (
                        self.distillation_report['status']
                        if self.distillation_report else 'unsupported'
                    ),
                    'source': (
                        'client-local VAE generation'
                        if self.distillation_report else 'disabled in configuration'
                    ),
                },
            ],
            'limitations': [
                'The federated workflow is an authenticated in-process simulator, not independent remote-client deployment.',
                'Model updates and artifacts may leak information even when a formal mechanism is enabled.',
                'NSL-KDD windows are constructed from source-file row order and are not natural temporal telemetry.',
                'CPU-only execution is the verified runtime path for this environment unless a CUDA manifest says otherwise.',
                'A failed or unrun research study must not be inferred from this report.',
            ],
            'mia': {
                'status': 'experimentally_unverified',
                'protocol': 'leakage_free_shadow_attack',
                'results': None,
                'limitation': (
                    'MIA must be run as a separate fixed-seed evaluation using '
                    'disjoint attack-train and attack-test partitions.'
                ),
            },
            'distillation': self.distillation_report,
            'metrics': metrics,
        }
        output_dir = Path(self.experiment_config['output_dir'])
        report_path = output_dir / 'report.json'
        with report_path.open('w', encoding='utf-8') as handle:
            json.dump(report, handle, indent=2, sort_keys=True)
            handle.write('\n')
        self.result_report_path = str(report_path)

        limitations_path = output_dir / 'limitations.md'
        with limitations_path.open('w', encoding='utf-8') as handle:
            handle.write('# Experiment limitations\n\n')
            for limitation in report['limitations']:
                handle.write(f'- {limitation}\n')
    
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

        # Restore optimizer moments for each local client. A missing client
        # state is tolerated for legacy checkpoints, but is reported clearly.
        optimizer_states = metadata.get('optimizer_states', {})
        clients_by_id = {client.client_id: client for client in self.clients}
        for client_id, state in optimizer_states.items():
            client = clients_by_id.get(client_id)
            if client is None:
                logger.warning("Checkpoint contains unknown client state: %s", client_id)
                continue
            try:
                client.optimizer.load_state_dict(state)
            except (KeyError, ValueError, RuntimeError) as exc:
                raise RuntimeError(
                    f"Could not restore optimizer state for {client_id}: {exc}"
                ) from exc

        rng_state = metadata.get('rng_state')
        if rng_state:
            self._restore_rng_state(rng_state)

        for client_id, state in metadata.get('dp_states', {}).items():
            dp_module = self.dp_modules.get(client_id)
            if dp_module is None:
                logger.warning("Checkpoint contains unknown DP client state: %s", client_id)
                continue
            dp_module.load_state_dict(state)
        
        # Restore privacy state if applicable. For DP-FedAvg the authoritative
        # cumulative budget is restored by AggregationServer.load_checkpoint (which
        # rebuilds the PRVBudget); here we just log the recorded values.
        if 'privacy_metrics' in metadata and self.privacy_mechanism != 'none':
            logger.info("Restoring privacy budget state...")
            for entity_id, privacy_state in metadata['privacy_metrics'].items():
                eps = privacy_state.get('epsilon', float('nan'))
                logger.info(f"  {entity_id}: ε={eps:.4f}")
            # Re-sync the trainer's budget handle to the server's restored one.
            if self.privacy_mechanism == 'dp_fedavg':
                self.privacy_budget = getattr(self.aggregation_server, 'privacy_budget', self.privacy_budget)

        if metadata.get('privacy_ledger'):
            self.privacy_ledger = PrivacyLedger.from_state_dict(metadata['privacy_ledger'])
            logger.info(
                "Restored privacy ledger: %s accounting events, %s releases",
                len(self.privacy_ledger.accounting_events),
                len(self.privacy_ledger.release_events),
            )
        
        logger.info(f"✓ Training resumed from round {self.current_round}")

    @staticmethod
    def _capture_rng_state() -> Dict[str, Any]:
        """Capture all process RNG streams used by the simulator."""
        state: Dict[str, Any] = {
            'python': random.getstate(),
            'numpy': np.random.get_state(),
            'torch': torch.get_rng_state(),
        }
        if torch.cuda.is_available():
            state['torch_cuda'] = torch.cuda.get_rng_state_all()
        return state

    @staticmethod
    def _restore_rng_state(state: Dict[str, Any]) -> None:
        """Restore RNG streams from a checkpoint when they are available."""
        if 'python' in state:
            random.setstate(state['python'])
        if 'numpy' in state:
            np.random.set_state(state['numpy'])
        if 'torch' in state:
            torch.set_rng_state(state['torch'])
        if torch.cuda.is_available() and 'torch_cuda' in state:
            torch.cuda.set_rng_state_all(state['torch_cuda'])


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
