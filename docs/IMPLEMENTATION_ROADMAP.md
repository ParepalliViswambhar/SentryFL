# SentryFL Implementation Roadmap

This roadmap is approval-gated. No milestone authorizes a broad rewrite; each milestone preserves existing paths and adds tests before changing defaults.

## M0 — Audit and PRD

**Prerequisites:** none.  
**Deliverables:** audit, PRD, architecture, validation protocol, test plan, risk register.  
**Tests/manual:** inspect tracked source; record Python/GPU probe; review unresolved decisions.  
**Done:** owner approves scope and privacy/dataset/model decisions.  
**Recovery:** documentation-only revert; no runtime impact.

## M1 — Environment and reproducible baseline

**Prerequisites:** M0; approved environment.  
**Changes:** `requirements.txt`/lock strategy, setup docs, manifest utilities, baseline CLI/report path.  
**Deliverables:** CPU baseline first; optional CUDA environment; SMD baseline and qualified NSL-KDD protocol.  
**Tests:** environment smoke, seed, split/checksum, model forward/backward, clean rerun.  
**Done:** no fabricated metrics; result bundle is complete.  
**Recovery:** retain current dependency set and disable new runner behind a flag.

## M2 — Bounded ML pipeline and recovery

**Prerequisites:** M1.  
**Changes:** dataset/preprocessor/trainer/checkpoint manager.  
**Deliverables:** chunked preprocessing, minibatches, resource logging, checkpoint/resume, explicit PPDS/KD decision.  
**Tests:** memory behavior, incomplete batches, missing values, temporal boundaries, interrupted resume.  
**Done:** baseline utility is comparable and provenance is preserved.  
**Recovery:** keep existing in-memory path as an explicitly bounded small-data mode.

## M3 — Federated correctness and synthetic demonstration

**Prerequisites:** M1; M2 for production-sized runs.  
**Changes:** pure aggregation/serialization contracts, server/client validation, comm meter, visualizer data API.  
**Deliverables:** FedAvg invariant suite; FFA-LoRA/ADMS byte comparison; heterogeneous synthetic demonstration.  
**Tests:** weighted formula, incompatible updates, deterministic incorrect variant, payload bytes.  
**Done:** correct and incorrect aggregation are unmistakably labelled.  
**Recovery:** retain tested existing server implementation.

## M4 — Privacy and MIA

**Prerequisites:** M1–M3; approved adjacency unit/accountant.  
**Changes:** privacy ledger, trainer integration, MIA protocol/report.  
**Deliverables:** non-private and multiple-DP settings, cumulative accounting, leakage-free MIA results.  
**Tests:** accountant/noise cross-check, budget resume, attack split disjointness, chance baseline.  
**Done:** formal scope and limitations accompany every privacy metric.  
**Recovery:** keep DP modes opt-in until validation passes.

## M5 — Quantization and scaling

**Prerequisites:** M3; completed baseline model.  
**Changes:** quantization report and scaling runner.  
**Deliverables:** FP32/INT8 artifact/payload/latency/utility table and client-count matrix.  
**Tests:** same split/model inputs, output tolerance, artifact load, byte accounting, resource limits.  
**Done:** actual measurements stored and simulator caveat displayed.  
**Recovery:** keep PTQ as an offline utility and do not alter training.

## M6 — Backend and UI research surfaces

**Prerequisites:** M0–M5 contracts.  
**Changes:** Node routes/services/schemas, event envelope, dashboard pages/components.  
**Deliverables:** overview, monitor, comparison, privacy, aggregation, artifact surfaces; auth/isolation.  
**Tests:** API authorization/integration, event reconnect/errors, UI tests and manual accessibility review.  
**Done:** no fabricated live state; every metric has provenance.  
**Recovery:** preserve current routes and feature-flag new surfaces.

## M7 — Local-client and synthetic anomaly demonstration

**Prerequisites:** M6; approved remote-client scope.  
**Changes:** artifact manifest/download policy, optional client protocol, demo generator/inference UI.  
**Deliverables:** checksummed onboarding and ground-truth-vs-prediction demo.  
**Tests:** authorization, checksum/version, pause/reset/speed, false positive/negative display.  
**Done:** local-only and remote modes are clearly distinguished.  
**Recovery:** artifact download-only mode; no remote update acceptance.

## M8 — Final validation

**Prerequisites:** all applicable milestones.  
**Changes:** documentation and report assembly only unless defects are found.  
**Deliverables:** regression suite, ablations, reproducible reports, limitations, release checklist.  
**Tests:** unit/integration/E2E, clean rerun, security review, artifact isolation.  
**Done:** P0 requirements pass; P1 results exist or are explicitly deferred.  
**Recovery:** release the last validated milestone and retain failed evidence.
