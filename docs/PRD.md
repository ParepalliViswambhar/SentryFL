# SentryFL Product Requirements Document

**Version:** 0.1 (audit-derived, approval required)  
**Date:** 2026-10-23  
**Status:** Proposed; no substantial implementation is authorized by this document

## 1. Vision and problem

SentryFL will provide a reproducible research and demonstration platform for differentially private, communication-efficient federated learning for multivariate time-series anomaly detection. It must preserve raw client data locality, make formal privacy scope explicit, measure real communication and utility trade-offs, and distinguish measured results from synthetic demonstrations and unverified hypotheses.

The product serves two purposes: a research execution environment for SMD and qualified network-security experiments, and an authenticated dashboard for inspecting approved experiments and downloading authorized global artifacts.

## 2. Users and journeys

| User | Journey | Required outcome |
|---|---|---|
| Researcher | Configure, run, resume, and compare experiments | Reproducible manifest, metrics, checkpoints, and report |
| Privacy evaluator | Compare non-private and DP models | Epsilon/delta scope, accountant details, MIA results, limitations |
| FL operator | Monitor rounds and client participation | Backend-sourced lifecycle, validation errors, payload and resource metrics |
| Local client owner | Obtain compatible global artifact and run locally | Authorized download, checksum, version/config compatibility |
| Reviewer | Inspect aggregation and anomaly demos | Clearly labelled synthetic data, formula, ground truth, and predictions |
| Administrator | Manage users and audit actions | Isolated access, retention, audit trail, and safe failure behavior |

## 3. Requirements

Priorities: **P0** mandatory for a valid core result; **P1** required for the full research product; **P2** optional/demo enhancement.

| ID | Requirement | Priority | Phase | Dependencies | Acceptance and verification |
|---|---|---:|---:|---|---|
| REQ-001 | Every run shall persist code revision, config, seed, dataset/split checksums, model revision, hardware, and command. | P0 | M1 | None | Manifest schema test and reproduce a smoke run |
| REQ-002 | SMD loading shall validate dimensions, labels, missing/Inf values, and deterministic temporal splits. | P0 | M1 | Existing loader | Unit/property tests and checksum report |
| REQ-003 | NSL-KDD experiments shall document sequence construction and shall not claim natural temporal ordering. | P0 | M1 | Dataset contract | Reviewable experiment protocol and tests |
| REQ-004 | Preprocessing shall fit statistics on training data only and create leakage-free windows/splits. | P0 | M2 | REQ-002 | Split-integrity tests |
| REQ-005 | Training shall use bounded chunks/minibatches with configurable batch, window, worker, and resource settings. | P0 | M2 | REQ-004 | Memory/throughput measurement and incomplete-batch tests |
| REQ-006 | Training shall checkpoint round, optimizer, RNG, privacy accountant, and configuration state and resume equivalently. | P0 | M2 | REQ-001 | Interrupt/resume integration test |
| REQ-007 | Plain FedAvg shall compute `sum(n_i * theta_i) / sum(n_i)` over validated compatible updates. | P0 | M3 | REQ-006 | Hand-calculated and randomized invariant tests |
| REQ-008 | DP-FedAvg shall clip client deltas, add calibrated server noise, compose one documented client/silo-level guarantee per round, and report epsilon/delta. | P0 | M4 | REQ-007 | Accountant cross-check, serialization, and resumed-budget tests |
| REQ-009 | Record-level DP-SGD shall remain explicitly labelled as a baseline with its own sampling/accounting assumptions. | P1 | M4 | Existing Opacus module | Configuration and report contract tests |
| REQ-010 | MIA shall use disjoint attack training/evaluation data and report ROC-AUC, balanced accuracy, precision, recall, and chance baseline. | P0 | M4 | REQ-001, 008 | Leakage test and fixed-seed evaluation |
| REQ-011 | FFA-LoRA/LoRA/ADMS comparisons shall identify trainable parameters and measure actual serialized bytes. | P0 | M3/M5 | REQ-007 | State-key, aggregation, and payload tests |
| REQ-012 | INT8 evaluation shall compare the same FP32/INT8 model on the same held-out split, including size, payload, latency, throughput, and metric deltas. | P1 | M5 | REQ-004 | Automated quantization report |
| REQ-013 | Scaling studies shall state simulated client count, participation rate, rounds, topology, payload assumptions, and resource measurements for 5/20/50/100/500 clients where feasible. | P1 | M5 | REQ-011 | Machine-readable scaling matrix |
| REQ-014 | The web platform shall expose authenticated experiment creation, status, pause/resume/cancel, metrics, reports, and authorized artifact download. | P0 | M6 | REQ-001 | API integration and authorization tests |
| REQ-015 | Live UI events shall represent backend state and shall expose loading, stale, error, and reconnect states. | P1 | M6 | REQ-014 | WebSocket/API integration and manual inspection |
| REQ-016 | User, client, experiment, artifact, and administrative actions shall be isolated and audited. | P0 | M6 | Existing auth | Owner/admin negative tests and audit assertions |
| REQ-017 | The aggregation visualizer shall compare correct weighted aggregation with an explicitly incorrect synthetic scenario. | P2 | M6 | REQ-007 | Formula/weight/norm display test |
| REQ-018 | The streaming demo shall use the actual inference path, generated labelled anomalies, and separate ground truth from predictions. | P2 | M7 | Model inference | Reset/pause/speed and prediction-vs-ground-truth test |
| REQ-019 | Optional PPDS/KD shall train client-local bounded generators, pool generated windows without raw-record release, and produce a versioned student artifact. | P1 | M2/M3 | REQ-004, REQ-006 | PPDS shape/provenance tests, student artifact test, held-out utility report |
| REQ-020 | Reports shall distinguish implemented, measured, simulated, experimentally unverified, and unsupported behavior. | P0 | All | REQ-001 | Report schema and review checklist |

## 4. Non-functional requirements

- **Reproducibility:** fixed seeds, versioned configs, checksums, deterministic split records, and immutable result bundles.
- **Correctness:** no silent invalid-update acceptance, arbitrary perturbation, or success-shaped fallback.
- **Privacy:** raw records remain local to the client process/protocol; model updates and artifacts are treated as potentially leaky.
- **Security:** validate input, enforce owner/admin authorization, cap resources/uploads, use safe model loading, and never execute uploaded Python.
- **Observability:** round IDs, client IDs (pseudonymous where appropriate), timestamps, sample counts, payload bytes, losses, resource use, errors, and privacy accounting.
- **Accessibility and UX:** keyboard support, readable contrast, responsive layout, explicit units, accessible chart summaries, and error/reconnect states.
- **Performance:** budgets will be measured after the actual model/hardware baseline; no invented target is a completion criterion.

## 5. Proposed product surfaces

Existing pages remain the baseline: dashboard, experiment list/new/detail, comparison, settings, login, and register. Add or evolve:

1. Overview dashboard: model/version, round/client status, completed metrics, communication, privacy scope, recent events.
2. Federated monitor: backend-sourced lifecycle, per-round status, payload/resource/error details.
3. Comparison: model provenance, dataset/split/experiment IDs, metrics, size, latency, and communication.
4. Aggregation visualizer: formula, weights, update norms, synthetic/correctness labels.
5. Privacy evaluation: accountant, epsilon/delta, MIA curves/metrics, attack assumptions and limitations.
6. Artifact/client onboarding: permissions, checksums, compatibility, setup, and local-only operation.
7. Synthetic live anomaly demo: generated stream, score/threshold, ground truth, predictions, controls.

## 6. API and data contracts

The current Node API remains the public boundary; the Python FastAPI API remains the ML execution boundary. Contract changes must be versioned.

Core resources:

- `User {id, role, status, created_at}`
- `Experiment {id, owner_id, config, status, current_round, total_rounds, created_at, completed_at}`
- `ExperimentManifest {code_revision, seed, dataset, split_checksum, model_revision, hardware, command, dependency_lock}`
- `RoundEvent {experiment_id, round_id, participating_clients, accepted/rejected_updates, bytes_up, bytes_down, metrics, privacy}`
- `Artifact {id, experiment_id, version, type, sha256, size_bytes, compatibility, authorization}`
- `EvaluationRun {id, model_version, dataset, split, protocol, metrics, limitations}`

Required endpoint families: authentication; experiments create/list/read/status/control; metrics/report; evaluation; artifact list/download; health; internal signed/capability-limited event ingestion. Internal callbacks must not be treated as user-authorized public writes.

## 7. Definition of done

The complete project is done only when all P0 requirements pass automated tests, all P1 research studies have machine-readable evidence, security and isolation tests pass, the UI labels simulated/unverified data, a reproducibility run succeeds from a clean environment, and the final report lists limitations rather than inferring privacy or deployment guarantees.

## 8. Approval decisions

Before implementation, approve: (a) DP-FedAvg client/silo privacy unit and accountant, (b) whether PPDS/KD is a required contribution, (c) whether independent remote clients are in scope, (d) supported datasets and NSL-KDD sequence semantics, (e) model/backbone licensing and representation, and (f) acceptable CPU-only baseline duration/resource limits.
