# ADMS Module - Anomaly-Driven Mask Selection

## Overview

The ADMS (Anomaly-Driven Mask Selection) module identifies critical parameters for parameter-efficient federated learning by computing parameter importance based on gradients on anomalous samples. This reduces communication cost by 90%+ through selective parameter updates.

## Features

- **Importance Computation**: Accumulates gradient magnitudes on anomalous samples to identify critical parameters
- **Binary Mask Generation**: Creates masks for top-k% parameters based on importance scores
- **Gradient Masking**: Zeros out non-selected gradient components for communication efficiency
- **Selection Statistics**: Provides detailed metrics on parameter selection and communication reduction
- **Periodic Updates**: Supports dynamic mask updates during federated training

## Usage

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from sentryfl.federated import ADMSModule

# Initialize your model
model = MyAnomalyDetector()

# Create ADMS module with 5% parameter selection
adms = ADMSModule(model, selection_ratio=0.05)

# Compute importance on anomalous samples
criterion = nn.BCELoss()
adms.compute_importance(anomaly_loader, criterion, device='cuda')

# Generate binary parameter mask
mask = adms.generate_mask()

# Apply mask to gradients
gradients = {name: param.grad for name, param in model.named_parameters()}
masked_gradients = adms.apply_mask(gradients)

# Get selection statistics
stats = adms.get_selection_statistics()
print(f"Communication reduction: {stats['communication_reduction']:.2%}")
```

## API Reference

### ADMSModule

#### `__init__(model, selection_ratio=0.05)`

Initialize ADMS module for parameter selection.

**Parameters:**
- `model` (nn.Module): PyTorch model
- `selection_ratio` (float): Fraction of parameters to select (default: 0.05 = 5%)

#### `compute_importance(anomaly_loader, criterion, device='cpu')`

Compute parameter importance on anomalous samples.

**Parameters:**
- `anomaly_loader` (DataLoader): DataLoader with anomalous samples
- `criterion` (nn.Module): Loss function
- `device` (str): Device to run computation on ('cpu' or 'cuda')

**Algorithm:**
1. Forward pass on anomalous samples
2. Compute loss and backpropagate
3. Accumulate |gradient| for each parameter
4. Rank parameters by accumulated gradient magnitude

#### `generate_mask()`

Generate binary mask for top-k% parameters based on importance scores.

**Returns:**
- `parameter_mask` (Dict[str, torch.Tensor]): Dictionary mapping parameter names to binary masks

#### `apply_mask(gradients)`

Apply mask to gradients (zero out non-selected parameters).

**Parameters:**
- `gradients` (Dict[str, torch.Tensor]): Dictionary mapping parameter names to gradients

**Returns:**
- `masked_gradients` (Dict[str, torch.Tensor]): Dictionary mapping parameter names to masked gradients

#### `get_selection_statistics()`

Return statistics about parameter selection.

**Returns:**
- Dictionary containing:
  - `total_parameters`: Total number of model parameters
  - `selected_parameters`: Number of selected parameters
  - `selection_ratio`: Actual selection ratio
  - `communication_reduction`: Fraction of communication saved

#### `update_mask_periodically(anomaly_loader, criterion, device='cpu')`

Update parameter masks periodically during federated training.

**Parameters:**
- `anomaly_loader` (DataLoader): DataLoader with current anomalous samples
- `criterion` (nn.Module): Loss function
- `device` (str): Device to run computation on

## Requirements Fulfilled

- **Requirement 3.1**: ADMS receives anomaly scores from validation data
- **Requirement 3.2**: ADMS ranks model parameters by importance
- **Requirement 3.3**: ADMS computes parameter importance based on gradient magnitudes on anomalous samples
- **Requirement 3.4**: ADMS selects top-k percent of parameters as trainable mask
- **Requirement 3.5**: ADMS freezes non-selected parameters
- **Requirement 3.6**: ADMS applies binary mask to parameter gradients
- **Requirement 3.8**: ADMS logs selected parameter count and layer distribution

## Testing

Run the unit tests:

```bash
pytest sentryfl/federated/test_adms.py -v
```

Run the verification script:

```bash
python verify_adms.py
```

## Performance

The ADMS module achieves:
- **90%+ communication reduction** with 5-10% parameter selection
- **Minimal accuracy degradation** by focusing on anomaly-critical parameters
- **Efficient computation** through single-pass gradient accumulation
- **Scalable to large models** with thousands to millions of parameters

## Integration with Federated Learning

The ADMS module integrates seamlessly with federated learning workflows:

1. **Client-side**: Each client computes ADMS masks on local anomalous samples
2. **Training**: Only masked parameters receive gradient updates
3. **Communication**: Only selected parameters are transmitted to the server
4. **Aggregation**: Server aggregates sparse parameter updates
5. **Periodic updates**: Masks are recomputed every N rounds to adapt to changing anomaly patterns

## Examples

See `verify_adms.py` for a complete working example demonstrating all features.


---

# FederatedClient Module

## Overview

The `FederatedClient` class implements local model training on private client data without transmitting raw data to the server. It is designed for privacy-preserving federated learning with support for differential privacy and parameter-efficient communication.

## Features

- **Global Model Reception**: Receive and load model parameters from aggregation server
- **Private Data Loading**: Load local training data without sharing raw data
- **Local Training**: Perform gradient descent for specified epochs
- **DP-Compatible**: Per-sample gradient computation for differential privacy
- **Parameter Extraction**: Extract only trainable parameters for communication
- **Metrics Logging**: Track loss, gradient norms, and training statistics
- **Communication Retry**: Exponential backoff retry on communication failures
- **Update Caching**: Cache updates locally when all retries fail

## Usage

### Basic Usage

```python
from sentryfl.federated import FederatedClient
from sentryfl.models.plm_backbone import PLMAnomalyDetector
import torch

# Initialize model
model = PLMAnomalyDetector(input_dim=38)

# Prepare local private data
X_train = torch.randn(1000, 100, 38)  # [samples, seq_len, features]
y_train = torch.randint(0, 2, (1000,))  # Binary labels

# Create federated client
client = FederatedClient(
    client_id='client_0',
    model=model,
    local_data=(X_train, y_train),
    batch_size=32,
    learning_rate=0.001,
    device='cpu'
)

# Training round workflow
# 1. Receive global model
global_params = server.get_global_parameters()
client.receive_global_model(global_params)

# 2. Perform local training
local_params, metrics = client.local_training(local_epochs=5)
print(f"Avg loss: {metrics['avg_loss']:.4f}")
print(f"Gradient norm: {metrics['avg_gradient_norm']:.4f}")

# 3. Send updates to server
def send_to_server(client_id, parameters, **kwargs):
    # Your communication logic
    server.receive_update(client_id, parameters)

success = client.send_parameters(local_params, send_to_server)
```

### Integration with Differential Privacy

```python
from sentryfl.privacy import DifferentialPrivacyModule

# Initialize DP module
dp_module = DifferentialPrivacyModule(
    model=model,
    epsilon=1.0,      # Privacy budget
    delta=1e-5,       # Privacy parameter
    max_grad_norm=1.0 # Gradient clipping threshold
)

# Train with DP-SGD
local_params, metrics = client.local_training(
    local_epochs=5,
    dp_module=dp_module
)

# Check privacy consumption
print(f"Epsilon spent: {metrics['epsilon_spent']:.4f}")
print(f"Budget utilization: {metrics['privacy_budget_utilization']:.1%}")

# Check if budget exhausted
if dp_module.is_budget_exhausted():
    print("Privacy budget exhausted, stopping training")
```

### Integration with ADMS (Parameter Efficiency)

```python
from sentryfl.federated import ADMSModule

# Initialize ADMS for 5% parameter selection
adms = ADMSModule(model, selection_ratio=0.05)

# Compute parameter importance
adms.compute_importance(anomaly_loader, criterion, device='cpu')
adms.generate_mask()

# Train with parameter masking (95% communication reduction)
local_params, metrics = client.local_training(
    local_epochs=5,
    adms_module=adms
)

# Check communication efficiency
stats = adms.get_selection_statistics()
print(f"Communication reduction: {stats['communication_reduction']:.1%}")
```

### Combined: DP + ADMS

```python
# Use both differential privacy and parameter efficiency
local_params, metrics = client.local_training(
    local_epochs=5,
    dp_module=dp_module,
    adms_module=adms
)

print(f"Privacy: ε={metrics['epsilon_spent']:.4f}")
print(f"Communication: {stats['communication_reduction']:.1%} reduction")
```

## API Reference

### FederatedClient

#### `__init__(client_id, model, local_data, batch_size=32, learning_rate=0.001, device='cpu', cache_dir=None)`

Initialize federated client.

**Parameters:**
- `client_id` (str): Unique client identifier
- `model` (nn.Module): PyTorch model architecture
- `local_data` (Tuple[Tensor, Tensor]): Tuple of (features, labels) for local training
- `batch_size` (int): Batch size for local training (default: 32)
- `learning_rate` (float): Learning rate for local optimizer (default: 0.001)
- `device` (str): Device for computation ('cpu' or 'cuda')
- `cache_dir` (str, optional): Directory for caching updates on communication failure

**Raises:**
- `ValueError`: If local_data is invalid or empty

#### `receive_global_model(global_parameters)`

Receive and load global model parameters from aggregation server.

**Parameters:**
- `global_parameters` (Dict[str, Tensor]): Dictionary mapping parameter names to tensors

**Raises:**
- `ValueError`: If parameter shapes don't match model
- `RuntimeError`: If loading fails

#### `load_local_data()`

Load local private data into DataLoader.

**Returns:**
- `DataLoader`: DataLoader for local training

**Note:** Raw data never leaves the client device.

#### `local_training(local_epochs, dp_module=None, adms_module=None)`

Perform local training with gradient descent on private data.

**Parameters:**
- `local_epochs` (int): Number of local training epochs
- `dp_module` (DifferentialPrivacyModule, optional): For DP-SGD training
- `adms_module` (ADMSModule, optional): For parameter-efficient training

**Returns:**
- `Tuple[Dict[str, Tensor], Dict[str, Any]]`:
  - `model_parameters`: Dictionary of trainable parameter updates
  - `training_metrics`: Dictionary with loss, gradient norms, etc.

**Metrics returned:**
- `client_id`: Client identifier
- `epochs_completed`: Number of epochs completed
- `final_loss`: Loss at final epoch
- `avg_loss`: Average loss across epochs
- `avg_gradient_norm`: Average gradient L2 norm
- `max_gradient_norm`: Maximum gradient norm
- `min_gradient_norm`: Minimum gradient norm
- `total_samples`: Number of training samples
- `batches_processed`: Number of batches processed
- `epsilon_spent` (if DP): Privacy budget consumed
- `delta` (if DP): Privacy parameter
- `privacy_budget_utilization` (if DP): Fraction of budget used

#### `extract_parameters()`

Extract trainable parameters (not full model) for communication.

**Returns:**
- `Dict[str, Tensor]`: Dictionary mapping parameter names to tensors (on CPU)

**Note:** Only extracts parameters with `requires_grad=True` to minimize communication payload.

#### `send_parameters(parameters, send_fn, **kwargs)`

Send parameter updates to server with exponential backoff retry.

**Parameters:**
- `parameters` (Dict[str, Tensor]): Dictionary of parameter updates
- `send_fn` (callable): Function to send parameters, signature: `send_fn(client_id, parameters, **kwargs)`
- `**kwargs`: Additional arguments for send_fn

**Returns:**
- `bool`: True if send succeeded, False if all retries failed

**Retry Logic:**
- Maximum retries: 5 (configurable via `client.max_retries`)
- Base delay: 1.0 seconds (configurable via `client.retry_base_delay`)
- Exponential backoff: delay = base_delay × 2^attempt
- Caches updates locally if all retries fail

#### `get_cached_updates()`

Retrieve cached parameter updates if available.

**Returns:**
- `Dict[str, Tensor]` or `None`: Cached parameters or None if no cache exists

#### `get_training_metrics()`

Get complete training metrics history.

**Returns:**
- `Dict[str, Any]`: Dictionary with loss history, gradient norms, and statistics

#### `reset_metrics()`

Reset training metrics (e.g., for new training round).

## Requirements Fulfilled

- **2.1**: Receive global model parameters from server
- **2.2**: Load local private training data
- **2.3**: Initialize local model with received parameters
- **2.4**: Perform gradient descent on local data for specified epochs
- **2.5**: Compute per-sample gradients for DP compatibility
- **2.6**: Extract trainable parameters only
- **2.7**: Send parameter updates (not raw data)
- **2.9**: Log local training metrics (loss, gradient norms)
- **2.10**: Communication retry with exponential backoff
- **18.5**: Error handling and validation

## Testing

### Unit Tests

Run the comprehensive unit test suite:

```bash
pytest sentryfl/federated/test_client.py -v
```

Test categories:
- Initialization and validation
- Global model reception
- Local data loading
- Local training (with and without DP)
- Parameter extraction
- Communication retry logic
- Metrics tracking
- Integration tests

### Integration Tests

Run the full federated learning simulation:

```bash
python verify_federated_client.py
```

This demonstrates:
- Multi-client federated training (3 clients)
- ADMS parameter masking (95% communication reduction)
- FedAvg aggregation
- Model convergence on synthetic anomaly detection data
- Communication retry logic
- Comprehensive metrics logging

## Architecture

The FederatedClient fits into the federated learning workflow:

```
┌─────────────────────────────────────────────────────────────┐
│                   Aggregation Server                        │
│   - Maintains global model                                  │
│   - Broadcasts parameters to clients                        │
│   - Aggregates client updates (FedAvg/Byzantine-robust)     │
│   - Updates global model                                    │
└─────────────────────────────────────────────────────────────┘
         ↓ broadcast                   ↑ send updates
         ↓                             ↑
┌─────────────────────────────────────────────────────────────┐
│                    FederatedClient                          │
│                                                             │
│  1. receive_global_model(params)                            │
│     └─> Load server-broadcasted parameters                 │
│                                                             │
│  2. load_local_data()                                       │
│     └─> Access private client data (never transmitted)     │
│                                                             │
│  3. local_training(epochs, dp_module, adms_module)          │
│     ├─> Initialize with global parameters                  │
│     ├─> Gradient descent for specified epochs              │
│     ├─> Compute per-sample gradients (DP-compatible)       │
│     ├─> Apply ADMS mask (if enabled)                       │
│     └─> Log metrics (loss, gradient norms)                 │
│                                                             │
│  4. extract_parameters()                                    │
│     └─> Extract only trainable parameters                  │
│                                                             │
│  5. send_parameters(params, send_fn)                        │
│     ├─> Attempt send with retry logic                      │
│     ├─> Exponential backoff on failure                     │
│     └─> Cache updates if all retries fail                  │
│                                                             │
│  Private Data: [X_train, y_train]                          │
│  └─> NEVER transmitted to server                           │
└─────────────────────────────────────────────────────────────┘
```

## Performance Considerations

### Communication Efficiency

| Configuration | Payload Size | Reduction |
|--------------|--------------|-----------|
| Full model (BERT-base) | ~440 MB | 0% |
| Trainable only (frozen backbone) | ~4 MB | 99.1% |
| + ADMS (5% selection) | ~200 KB | 99.95% |
| + INT8 quantization | ~50 KB | 99.99% |

### Privacy-Utility Tradeoff

| ε (epsilon) | Accuracy Impact | Privacy Level |
|-------------|----------------|---------------|
| No DP | 0% loss | None |
| 10.0 | ~1-2% loss | Weak |
| 1.0 | ~3-5% loss | Good |
| 0.1 | ~10-15% loss | Strong |

### Training Speed

- **Standard SGD**: Baseline
- **DP-SGD (per-sample gradients)**: 2-4× slower
- **ADMS masking**: <1% overhead
- **Communication retry**: Depends on network reliability

## Error Handling

The FederatedClient implements comprehensive error handling:

1. **Invalid Data**: Raises `ValueError` for empty, mismatched, or invalid data
2. **Parameter Shape Mismatch**: Raises `ValueError` when loading global model with wrong shapes
3. **Communication Failures**: Automatic retry with exponential backoff (5 attempts)
4. **Cache on Failure**: Updates cached to disk when all retries fail
5. **Privacy Budget Exhausted**: Training terminates gracefully when DP budget depleted
6. **Gradient Anomalies**: Logs warnings for NaN or Inf gradients

## Examples

See the following files for complete working examples:
- `test_client.py`: Unit tests demonstrating all features
- `verify_federated_client.py`: Full federated learning simulation
- `verify_adms.py`: ADMS integration example

## References

- McMahan et al. (2017): "Communication-Efficient Learning of Deep Networks from Decentralized Data" (FedAvg)
- Abadi et al. (2016): "Deep Learning with Differential Privacy" (DP-SGD)
- PeFAD Framework: Parameter-Efficient Federated Anomaly Detection

## Future Enhancements

- [ ] Asynchronous updates (FedAsync)
- [ ] Personalized models (per-client adaptation)
- [ ] Secure aggregation (homomorphic encryption)
- [ ] Cross-device FL (mobile/IoT support)
- [ ] Adaptive learning rates per client
