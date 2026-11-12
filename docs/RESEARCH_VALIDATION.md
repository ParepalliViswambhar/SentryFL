# Research Validation Protocol

## Claims policy

The project may claim only what is supported by a stored result bundle. A failed or missing experiment is reported as missing, not replaced by a target number. “Private” means the stated mechanism, adjacency unit, sampling model, releases, accountant, epsilon, and delta are all documented; MIA failure alone is never a privacy proof.

## Dataset protocols

### SMD

Use the official machine files where available. Preserve machine identity, temporal order, feature count, train/test files, and labels. Fit preprocessing only on training data. Validation must be carved from training chronology or another predeclared leakage-free protocol; test labels are never used to select a threshold except in an explicitly labelled oracle baseline.

### NSL-KDD

Records are connection observations, not an inherently ordered sensor stream. Any sequence construction must define ordering, grouping, window size/stride, label aggregation, and client partition. Results must be labelled as constructed-record sequences and not presented as realistic temporal telemetry without qualification.

## Model and baseline matrix

At minimum report: unfine-tuned/representation baseline where meaningful, centralized/local fine-tuned model, plain FedAvg global model, non-private model, DP-FedAvg models at multiple budgets, record-DP baseline, FFA-LoRA, ADMS, and FP32/INT8 inference. Every row includes exact model revision, trainable parameter count, seed, data split, and command.

## Federated correctness

For a round with compatible client models:

`theta_next = sum(n_i * theta_i) / sum(n_i)`.

Test hand-calculated values, permutation invariance, unequal sample counts, missing/malformed updates, non-finite values, and checkpoint resume. For DP-FedAvg report pre-clip norms, clip rate, participating count, sample rate, noise multiplier, accountant family, cumulative rounds, epsilon, and delta.

## Privacy and MIA

For each setting:

- Define adjacency and protected unit.
- Record sampling rate, number of rounds/steps, clipping bound, noise, accountant, delta, and all model releases.
- Use disjoint member/non-member data and disjoint attack-training/evaluation data.
- Report ROC-AUC, balanced accuracy, precision, recall, F1 when meaningful, confidence intervals where feasible, and a chance baseline.
- Compare non-private and private models using the same target and evaluation protocol.

## Communication and quantization

Measure actual serialized upload/download payloads, representation, metadata/protocol overhead, trainable parameter count, model artifact bytes, total round/run bytes, and any compression separately. Compare FP32 and INT8 on the same held-out data and measure CPU latency/throughput; GPU measurements require a verified CUDA environment. Theoretical size estimates are labelled separately.

## Scaling

Run defined matrices such as 5, 20, 50, 100, and 500 simulated clients with documented participation, rounds, shard sizes, topology, and payload assumptions. Report wall time, peak memory, bytes, accepted/rejected updates, and convergence. These are simulator results and do not prove physical deployment capacity.

## Result bundle

Each run contains `manifest.json`, immutable config, dependency/runtime details, dataset/split checksums, checkpoints, round metrics, privacy ledger, communication ledger, predictions, plots, and a human-readable limitations section. A result is publication-ready only when a clean rerun reproduces its protocol and the report links every displayed metric to its provenance.
