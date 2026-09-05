# SentryFL Architecture Documentation

This document provides comprehensive documentation of the SentryFL system architecture, model designs, and implementation details.

## Table of Contents

- [System Architecture](#system-architecture)
- [Model Architecture](#model-architecture)
- [Federated Learning Architecture](#federated-learning-architecture)
- [Privacy Architecture](#privacy-architecture)
- [Communication Architecture](#communication-architecture)
- [Module Descriptions](#module-descriptions)
- [Data Flow](#data-flow)
- [Implementation Details](#implementation-details)

## System Architecture

SentryFL is architected as a three-tier system that separates presentation, application logic, and machine learning computation:

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Tier 1: React Web Dashboard                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │Experiment│  │  Metrics │  │ Anomaly  │  │Configuration │   │
│  │  Control │  │  Viewer  │  │Visualizer│  │   Editor     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               ↕ REST API + WebSocket
┌─────────────────────────────────────────────────────────────────┐
│              Tier 2: Node.js + Express API Server               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │   REST   │  │WebSocket │  │  Auth &  │  │   Response   │   │
│  │Endpoints │  │  Server  │  │Validation│  │    Cache     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               ↕ IPC / HTTP
┌─────────────────────────────────────────────────────────────────┐
│                  Tier 3: Python Backend (ML)                    │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                 Federated Learning Engine                  │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │  FL Client  │  │  FL Server  │  │ ADMS Parameter  │  │ │
│  │  │  Trainer    │  │ Aggregator  │  │   Selection     │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │               Differential Privacy Engine                  │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │  DP-SGD     │  │  Privacy    │  │  MIA Attack     │  │ │
│  │  │  Mechanism  │  │ Accounting  │  │  Evaluation     │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Model Components                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │ PLM Backbone│  │  Knowledge  │  │  Quantization   │  │ │
│  │  │ (BERT/GPT-2)│  │ Distillation│  │  (INT8)         │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Data & Evaluation Pipeline                    │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │  Dataset    │  │Preprocessing│  │  Evaluation     │  │ │
│  │  │  Loaders    │  │  Pipeline   │  │  Metrics        │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Design Rationale

**Tier 1 (React Dashboard)**:
- **Purpose**: User interaction and visualization
- **Technology**: React, Redux, D3.js, WebSocket client
- **Responsibilities**: Experiment control, real-time metrics display, result visualization

**Tier 2 (API Server)**:
- **Purpose**: Request routing and protocol translation
- **Technology**: Node.js, Express, Socket.io
- **Responsibilities**: REST API endpoints, WebSocket management, authentication, caching

**Tier 3 (Python Backend)**:
- **Purpose**: Machine learning computation
- **Technology**: PyTorch, Opacus, Transformers, NumPy
- **Responsibilities**: Model training, federated learning, privacy mechanisms, evaluation

## Model Architecture

### PLM-Based Anomaly Detection Model

SentryFL uses pre-trained language models (BERT, GPT-2) as feature extractors for time-series data:

```
Input Time Series Window [batch, window_size, features]
                ↓
        ┌───────────────────┐
        │   Embedding Layer │
        │  (Linear: D → H)  │
        └───────────────────┘
                ↓
        ┌───────────────────┐
        │ Positional Encoding│
        │ (Sinusoidal/Learned)│
        └───────────────────┘
                ↓
        ┌───────────────────┐
        │  PLM Backbone      │
        │  (BERT/GPT-2)      │
        │  [12-24 Layers]    │
        └───────────────────┘
                ↓
        ┌───────────────────┐
        │  Global Pooling    │
        │  (Mean/CLS token)  │
        └───────────────────┘
                ↓
        ┌───────────────────┐
        │  Classification    │
        │  Head (H → 1)      │
        └───────────────────┘
                ↓
    Anomaly Score [batch, 1]
```

### Model Components

#### 1. Embedding Layer

Converts time-series features to high-dimensional embeddings:

```python
self.embedding = nn.Linear(input_dim, hidden_dim)
# input_dim: Number of features (38 for SMD, 41 for NSL-KDD)
# hidden_dim: 768 (BERT-base) or 1024 (BERT-large)
```

#### 2. Positional Encoding

Preserves temporal order information:

```python
# Sinusoidal positional encoding
pos = torch.arange(0, max_len).unsqueeze(1)
div_term = torch.exp(torch.arange(0, d_model, 2) * 
                     -(math.log(10000.0) / d_model))
pe[:, 0::2] = torch.sin(pos * div_term)
pe[:, 1::2] = torch.cos(pos * div_term)
```

#### 3. PLM Backbone

Pre-trained transformer encoder:

```python
from transformers import AutoModel

self.plm = AutoModel.from_pretrained("bert-base-uncased")
# Options: "bert-base-uncased", "bert-large-uncased", "gpt2", "gpt2-medium"
```

**Architecture Details**:
- **BERT-base**: 12 layers, 768 hidden, 12 attention heads, 110M parameters
- **BERT-large**: 24 layers, 1024 hidden, 16 attention heads, 340M parameters
- **GPT-2**: 12 layers, 768 hidden, 12 attention heads, 117M parameters

#### 4. Classification Head

Binary anomaly detection:

```python
self.classifier = nn.Sequential(
    nn.Dropout(0.1),
    nn.Linear(hidden_dim, 256),
    nn.ReLU(),
    nn.Dropout(0.1),
    nn.Linear(256, 1),
    nn.Sigmoid()
)
```

### Model Variants

#### Standard Model (Full Fine-tuning)

All parameters are trainable:
```yaml
model:
  backbone: "bert-base-uncased"
  freeze_backbone: false
  hidden_dim: 768
```

#### Frozen Backbone (Feature Extraction)

Only classification head is trainable:
```yaml
model:
  backbone: "bert-base-uncased"
  freeze_backbone: true
  hidden_dim: 768
```

#### ADMS-Enhanced Model (Parameter-Efficient)

Only 1-10% of parameters are trainable:
```yaml
model:
  backbone: "bert-base-uncased"
  freeze_backbone: false
parameter_efficiency:
  adms_enabled: true
  selection_ratio: 0.05  # 5% of parameters
```

#### Quantized Model (Edge Deployment)

INT8 quantized for CPU inference:
```yaml
optimization:
  quantization_enabled: true
  quantization_dtype: "int8"
```

## Federated Learning Architecture

### Federated Training Flow

```
Round 1:
Server ──[broadcast global model]──→ Client 1, Client 2, ..., Client N
                                      ↓ local training (E epochs)
Server ←─[send parameter updates]──── Client 1, Client 2, ..., Client N
  ↓ aggregate updates (FedAvg/Trimmed Mean)
  ↓ update global model
  
Round 2:
Server ──[broadcast updated model]──→ Client 1, Client 2, ..., Client N
  ...
```

### Federated Client Implementation

```python
class FederatedClient:
    def __init__(self, client_id, local_data, model_config, privacy_config):
        self.client_id = client_id
        self.local_data = local_data
        self.model = self._create_model(model_config)
        self.privacy_engine = self._setup_privacy(privacy_config)
    
    def local_train(self, global_params, num_epochs):
        # 1. Load global parameters
        self.model.load_state_dict(global_params)
        
        # 2. Train on local data
        for epoch in range(num_epochs):
            for batch in self.local_data:
                # Compute per-sample gradients (for DP)
                loss = self.compute_loss(batch)
                loss.backward()
                
                # Apply differential privacy
                if self.privacy_engine:
                    self.privacy_engine.step()
                else:
                    self.optimizer.step()
        
        # 3. Extract parameter updates
        return self.model.state_dict()
```

### Federated Server (Aggregator)

```python
class FederatedServer:
    def __init__(self, num_clients, aggregation_method):
        self.global_model = self._create_global_model()
        self.num_clients = num_clients
        self.aggregation_method = aggregation_method
    
    def aggregate(self, client_updates, client_weights):
        if self.aggregation_method == "fedavg":
            return self._fedavg(client_updates, client_weights)
        elif self.aggregation_method == "trimmed_mean":
            return self._trimmed_mean(client_updates)
    
    def _fedavg(self, client_updates, client_weights):
        # Weighted averaging by number of samples
        aggregated = {}
        total_weight = sum(client_weights)
        
        for key in client_updates[0].keys():
            aggregated[key] = sum(
                client_updates[i][key] * client_weights[i] / total_weight
                for i in range(len(client_updates))
            )
        
        return aggregated
    
    def _trimmed_mean(self, client_updates, trim_fraction=0.1):
        # Byzantine-robust aggregation
        aggregated = {}
        
        for key in client_updates[0].keys():
            values = torch.stack([u[key] for u in client_updates])
            
            # Sort and trim outliers
            sorted_values, _ = torch.sort(values, dim=0)
            trim_count = int(len(values) * trim_fraction)
            
            if trim_count > 0:
                trimmed = sorted_values[trim_count:-trim_count]
            else:
                trimmed = sorted_values
            
            # Compute mean
            aggregated[key] = trimmed.mean(dim=0)
        
        return aggregated
```

### ADMS (Anomaly-Driven Mask Selection)

Parameter-efficient federated learning via selective parameter updates:

```python
class ADMSModule:
    def __init__(self, model, selection_ratio):
        self.model = model
        self.selection_ratio = selection_ratio
        self.param_mask = None
    
    def compute_importance(self, anomaly_data):
        # 1. Forward pass on anomalous samples
        self.model.eval()
        anomaly_scores = []
        
        for batch in anomaly_data:
            output = self.model(batch)
            anomaly_scores.append(output)
        
        # 2. Compute gradient magnitudes
        self.model.zero_grad()
        loss = compute_anomaly_loss(anomaly_scores)
        loss.backward()
        
        # 3. Rank parameters by gradient magnitude
        param_importance = {}
        for name, param in self.model.named_parameters():
            if param.grad is not None:
                param_importance[name] = param.grad.abs().mean().item()
        
        # 4. Select top-k parameters
        sorted_params = sorted(param_importance.items(), 
                               key=lambda x: x[1], reverse=True)
        num_selected = int(len(sorted_params) * self.selection_ratio)
        selected_params = set(p[0] for p in sorted_params[:num_selected])
        
        # 5. Create binary mask
        self.param_mask = {
            name: (name in selected_params) 
            for name, _ in self.model.named_parameters()
        }
        
        return self.param_mask
    
    def apply_mask(self):
        # Freeze non-selected parameters
        for name, param in self.model.named_parameters():
            param.requires_grad = self.param_mask.get(name, False)
```

## Privacy Architecture

### DP-SGD Implementation

Differential privacy via gradient perturbation:

```python
class DPEngine:
    def __init__(self, model, optimizer, target_epsilon, target_delta, 
                 max_grad_norm, batch_size):
        from opacus import PrivacyEngine
        
        self.privacy_engine = PrivacyEngine()
        
        self.model, self.optimizer, self.data_loader = \
            self.privacy_engine.make_private(
                module=model,
                optimizer=optimizer,
                data_loader=data_loader,
                noise_multiplier=self._compute_noise_multiplier(
                    target_epsilon, target_delta
                ),
                max_grad_norm=max_grad_norm
            )
    
    def step(self):
        # Per-sample gradient clipping + Gaussian noise
        self.optimizer.step()
        
        # Update privacy accounting
        epsilon = self.privacy_engine.get_epsilon(delta=self.target_delta)
        
        return epsilon
```

### Privacy Accounting

Track cumulative privacy budget consumption:

```python
class PrivacyAccountant:
    def __init__(self, target_epsilon, target_delta):
        self.target_epsilon = target_epsilon
        self.target_delta = target_delta
        self.spent_epsilon = 0.0
    
    def account_step(self, noise_multiplier, sample_rate, steps):
        from opacus.accountants import RDPAccountant
        
        accountant = RDPAccountant()
        epsilon = accountant.get_epsilon(
            delta=self.target_delta,
            sigma=noise_multiplier,
            sample_rate=sample_rate,
            steps=steps
        )
        
        self.spent_epsilon = epsilon
        return epsilon
    
    def is_budget_exhausted(self):
        return self.spent_epsilon >= self.target_epsilon
```

### MIA (Membership Inference Attack) Evaluation

Measure empirical privacy leakage:

```python
class MIAEvaluator:
    def __init__(self, target_model):
        self.target_model = target_model
        self.shadow_models = []
        self.attack_model = None
    
    def train_shadow_models(self, member_data, non_member_data, 
                           num_shadows=10):
        # Train shadow models on different data splits
        for i in range(num_shadows):
            shadow_model = create_model()
            shadow_model.train_on(member_data[i])
            self.shadow_models.append(shadow_model)
    
    def extract_features(self, model, data):
        # Extract confidence scores as features
        model.eval()
        confidences = []
        
        with torch.no_grad():
            for sample in data:
                output = model(sample)
                confidences.append(output.item())
        
        return np.array(confidences)
    
    def train_attack_model(self, member_data, non_member_data):
        # Train binary classifier: member vs non-member
        from sklearn.ensemble import RandomForestClassifier
        
        X_train = []
        y_train = []
        
        for shadow_model in self.shadow_models:
            # Member samples
            member_features = self.extract_features(shadow_model, 
                                                   member_data)
            X_train.extend(member_features)
            y_train.extend([1] * len(member_features))
            
            # Non-member samples
            non_member_features = self.extract_features(shadow_model,
                                                       non_member_data)
            X_train.extend(non_member_features)
            y_train.extend([0] * len(non_member_features))
        
        self.attack_model = RandomForestClassifier()
        self.attack_model.fit(X_train, y_train)
    
    def evaluate_attack(self, member_data, non_member_data):
        # Evaluate attack success rate
        member_features = self.extract_features(self.target_model, 
                                                member_data)
        non_member_features = self.extract_features(self.target_model,
                                                    non_member_data)
        
        member_preds = self.attack_model.predict(member_features)
        non_member_preds = self.attack_model.predict(non_member_features)
        
        accuracy = (member_preds.sum() + 
                   (1 - non_member_preds).sum()) / \
                   (len(member_preds) + len(non_member_preds))
        
        return {
            'accuracy': accuracy,
            'precision': member_preds.sum() / len(member_preds),
            'recall': member_preds.sum() / len(member_preds)
        }
```

## Communication Architecture

### Communication Efficiency

ADMS reduces communication by 90%+ through selective parameter updates:

```
Full Model Update:
  Parameters: 110M (BERT-base)
  Size: 440MB (FP32) or 110MB (INT8)
  
ADMS 5% Selection:
  Parameters: 5.5M
  Size: 22MB (FP32) or 5.5MB (INT8)
  
Reduction: 95%
```

### Parameter Compression

```python
class ParameterCompressor:
    def compress(self, params, method="quantization"):
        if method == "quantization":
            return self._quantize_int8(params)
        elif method == "sparsification":
            return self._sparsify(params)
    
    def _quantize_int8(self, params):
        # INT8 quantization: 4x compression
        quantized = {}
        
        for key, tensor in params.items():
            # Compute scale and zero-point
            min_val = tensor.min()
            max_val = tensor.max()
            scale = (max_val - min_val) / 255
            zero_point = -min_val / scale
            
            # Quantize
            quantized[key] = {
                'values': ((tensor / scale) + zero_point).round().to(torch.int8),
                'scale': scale,
                'zero_point': zero_point
            }
        
        return quantized
    
    def decompress(self, quantized_params):
        # Dequantize
        params = {}
        
        for key, quant_data in quantized_params.items():
            params[key] = (quant_data['values'].float() - 
                          quant_data['zero_point']) * quant_data['scale']
        
        return params
```

## Module Descriptions

### sentryfl.data

**Dataset Loaders**:
- `SMDDatasetLoader`: Loads SMD server telemetry data
- `NSLKDDDatasetLoader`: Loads NSL-KDD network intrusion data
- `BaseDatasetLoader`: Abstract base class for custom datasets

**Preprocessing**:
- `Preprocessor`: Normalization, windowing, splitting
- `DataPartitioner`: IID/non-IID client data distribution

### sentryfl.federated

**Core Components**:
- `FederatedClient`: Local training on private data
- `FederatedServer`: Global model aggregation
- `ADMSModule`: Parameter importance ranking and selection
- `ByzantineAggregator`: Trimmed mean robust aggregation

### sentryfl.models

**Model Components**:
- `PLMBackbone`: BERT/GPT-2 transformer encoder
- `AnomalyDetectionHead`: Classification layers
- `KnowledgeDistillation`: Teacher-student model compression

### sentryfl.privacy

**Privacy Mechanisms**:
- `DPEngine`: DP-SGD implementation via Opacus
- `PrivacyAccountant`: Privacy budget tracking
- `MIAEvaluator`: Membership inference attack evaluation

### sentryfl.optimization

**Performance Optimization**:
- `QuantizationEngine`: INT8 post-training quantization
- `MixedPrecisionTrainer`: FP16 training
- `GradientAccumulator`: Large effective batch sizes

### sentryfl.evaluation

**Evaluation Tools**:
- `MetricsComputer`: Precision, recall, F1, AUC-ROC, AUC-PR
- `AblationStudy`: Component contribution analysis
- `BaselineComparator`: PeFAD, centralized, local baselines

### sentryfl.visualization

**Visualization Tools**:
- `PlotGenerator`: ROC curves, convergence plots, communication charts
- `ExportManager`: Publication-ready figure export

### sentryfl.utils

**Utilities**:
- `ConfigManager`: YAML configuration loading and validation
- `CheckpointManager`: Model saving and recovery
- `Logger`: Structured logging and experiment tracking

## Data Flow

### Training Data Flow

```
Raw Dataset Files
    ↓
[DatasetLoader]
    ↓
Time-Series Arrays [T, D]
    ↓
[Preprocessor]
    ↓
Normalized + Windowed Data [N, W, D]
    ↓
[DataPartitioner]
    ↓
Client-Specific Data Shards
    ↓
[FederatedClient.local_train()]
    ↓
Per-Sample Gradients
    ↓
[DPEngine.clip_and_noise()]
    ↓
Private Parameter Updates
    ↓
[FederatedServer.aggregate()]
    ↓
Updated Global Model
```

### Inference Data Flow

```
Test Time-Series
    ↓
[Preprocessor.normalize_and_window()]
    ↓
Test Windows [M, W, D]
    ↓
[Model.forward()]
    ↓
Anomaly Scores [M, 1]
    ↓
[Threshold Classification]
    ↓
Binary Predictions [M]
    ↓
[MetricsComputer.evaluate()]
    ↓
Precision, Recall, F1, AUC
```

## Implementation Details

### Tensor Shapes Throughout Pipeline

```python
# Input
input_batch: [batch_size, window_size, input_dim]
# e.g., [32, 100, 38]

# After embedding
embedded: [batch_size, window_size, hidden_dim]
# e.g., [32, 100, 768]

# After positional encoding
pos_encoded: [batch_size, window_size, hidden_dim]
# e.g., [32, 100, 768]

# After PLM backbone
plm_output: [batch_size, window_size, hidden_dim]
# e.g., [32, 100, 768]

# After pooling
pooled: [batch_size, hidden_dim]
# e.g., [32, 768]

# After classification head
anomaly_scores: [batch_size, 1]
# e.g., [32, 1]
```

### Key Hyperparameters

See [HYPERPARAMETERS.md](HYPERPARAMETERS.md) for tuning guidelines.

### Performance Characteristics

**Training Time** (SMD, 10 clients, 100 rounds):
- GPU (NVIDIA V100): ~2 hours
- GPU (NVIDIA T4): ~4 hours
- CPU-only: ~24 hours

**Memory Usage**:
- BERT-base: ~4GB GPU memory (batch_size=32)
- BERT-large: ~12GB GPU memory (batch_size=32)
- INT8 quantized: ~1GB CPU memory (inference)

**Inference Latency** (per sample):
- FP32 (GPU): ~2ms
- INT8 (CPU): ~50ms
- Quantized + Distilled (CPU): ~20ms

## References

- **Differential Privacy**: Abadi, M., et al. "Deep Learning with Differential Privacy." CCS 2016.
- **Federated Learning**: McMahan, B., et al. "Communication-Efficient Learning of Deep Networks from Decentralized Data." AISTATS 2017.
- **Transformers**: Vaswani, A., et al. "Attention is All You Need." NeurIPS 2017.

---

For hyperparameter tuning guidelines, see [HYPERPARAMETERS.md](HYPERPARAMETERS.md).
