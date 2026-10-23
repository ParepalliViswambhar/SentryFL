# PeFAD and Proposal Gap Analysis

Reference documents:

- PeFAD: *A Parameter-Efficient Federated Framework for Time Series Anomaly Detection* (KDD 2024).
- SentryFL project proposal (2026-2027).

This document distinguishes code that exists from features that are wired into the
main experiment path and from proposal claims that still require implementation or
measurement.

## Implemented And Exercised

- Horizontal federated simulation with a server-side global model, local client
  training, update collection, and FedAvg / trimmed-mean aggregation.
- FFA-LoRA and LoRA parameter-efficient model variants.
- ADMS importance scoring and gradient masking. ADMS masks are generated from
  each client's private shard during trainer setup.
- Record-level Opacus DP-SGD and aggregate-level DP-FedAvg with privacy accounting.
- Membership-inference attack utilities and unit tests.
- INT8 post-training quantization for a completed global model, plus model-size and
  quantization-error utilities.
- SMD and NSL-KDD loaders, held-out threshold evaluation, and anomaly metrics.
- PostgreSQL-backed API authentication/audit persistence.
- Dashboard control, live metrics, and authenticated global-model download.

## Partial Or Missing Against PeFAD/Proposal

### 1. PPDS and Shared Synthetic Data

PeFAD and the proposal describe a client-side VAE that generates privacy-preserving
synthetic samples, pools them into a shared dataset, and uses knowledge distillation
to reduce client heterogeneity. The repository has a standalone knowledge-
distillation module, but no VAE/PPDS implementation and no call from `MainTrainer`.
The `knowledge_distillation_enabled` configuration flag currently does not alter the
main training loop.

**Priority: high.** Either implement PPDS + KD end to end, or remove it from the
claimed implemented-techniques list and label it as future work.

### 2. True Remote Client Transport

The current web pipeline is a correct federated *simulation*: the Python backend
loads one dataset, creates `FederatedClient` objects in-process, and keeps their
private shards in that process. It is not yet a deployment with independent client
machines fetching model parameters and posting signed updates over a client API.
The new model-download endpoint supports client inference and local use, but remote
client update submission is not implemented.

**Priority: high for deployment claims, medium for the academic simulation.** Keep
calling the current path a simulation unless a client enrollment, update-upload,
round-token, and server-side aggregation protocol is added.

### 3. Automated MIA During Experiments

The MIA evaluator exists and is tested, but the normal trainer does not run MIA at
each privacy budget or attach attack accuracy to the experiment's privacy metrics.
The dashboard therefore visualizes available privacy/MIA records rather than
producing the proposal's complete F1-vs-epsilon and MIA-vs-epsilon study itself.

**Priority: high for the proposal's core privacy claim.** Add an explicit evaluation
command that trains/evaluates MIA against non-private and DP checkpoints and writes
machine-readable tradeoff results.

### 4. Quantization Evaluation

The final global model can be converted to INT8 after training and downloaded, but
quantization is not part of the per-round upload protocol. The proposal's required
model-size, retained-F1, and CPU-latency table still needs an automated experiment
that evaluates FP32 and INT8 on the same held-out data.

**Priority: medium.** Add a reproducible `quantization-report` command and include
FP32/INT8 size, latency, error, and metric deltas in the experiment report.

### 5. Dataset Coverage

SMD and NSL-KDD are implemented primary datasets. PeFAD used SMD, PSM, SWaT, and
MSL; the proposal marks PSM/MSL as secondary and SWaT as optional. Those loaders do
not exist yet.

**Priority: medium.** Add a loader registry and implement PSM/MSL before claiming
cross-dataset comparability. Keep SWaT optional because access may require approval.

### 6. Scaling And Baseline Evidence

The repository contains scaling and baseline utilities, but the proposal's concrete
5/20/50/100/500-client tables, reproduced PeFAD baseline, centralized upper bound,
plain LSTM baseline, and privacy/utility sweeps still require completed runs with
real result artifacts. Existing target numbers must remain hypotheses until those
runs are produced.

**Priority: high before publication.** Store every result with configuration,
seed, hardware, dataset split, and measured bytes so figures are reproducible.

## Recommended Next Order

1. Make the main trainer produce a complete experiment manifest and result bundle.
2. Wire or explicitly disable PPDS/KD rather than leaving a no-op configuration flag.
3. Add automated MIA and FP32-vs-INT8 evaluation reports.
4. Run the required baselines and client-scaling matrix on SMD and NSL-KDD.
5. Only then decide whether independent remote-client transport is needed for the
   target venue; if it is, add it as a separate authenticated protocol rather than
   describing the current in-process simulation as a production FL network.
