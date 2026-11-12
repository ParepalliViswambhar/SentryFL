# SentryFL Repository Audit

**Audit date:** 2026-10-23  
**Scope:** tracked source, configuration, documentation, tests, local runtime probes, and existing experiment artifacts. Generated `node_modules`, build output, caches, and model binaries were not treated as source evidence.

## Executive summary

SentryFL is a three-tier research platform:

1. **Python ML backend:** PyTorch, Transformers, Opacus, FastAPI, and an in-process federated simulator.
2. **Node.js control plane:** Express, JWT authentication, PostgreSQL persistence, REST proxying, caching, audit logging, and Socket.IO.
3. **React dashboard:** Vite, React 18, Redux Toolkit, Material UI, Chart.js, authenticated experiment control, live metrics, privacy and communication charts, and model download.

The Python code contains working-looking implementations for SMD/NSL-KDD loading, windowing, local training, FedAvg, DP-FedAvg, record-level DP-SGD, LoRA/FFA-LoRA, ADMS, MIA utilities, INT8 post-training quantization, checkpointing, and metrics. Existing tests cover many units and integration seams.

The most important qualification is that the web workflow is an **authenticated in-process federated simulation**, not a multi-machine federated deployment. Raw records remain in Python process-local shards, but there is no independent client enrollment/update-upload protocol. PPDS/VAE synthetic-data generation is absent, knowledge distillation is not wired into the main trainer, automated MIA and FP32-vs-INT8 study orchestration are incomplete, and required research result tables have not been established from reproducible runs.

## Inventory and evidence

| Area | Evidence | Status |
|---|---|---|
| Python package and CLI | `sentryfl/`, `sentryfl/cli.py`, `setup.py`, `requirements.txt` | Implemented; runtime results require a pinned environment |
| Dataset loaders | `sentryfl/data/dataset_loader.py`, `data/_demo/SMD/` | SMD and NSL-KDD loaders present; bounded streaming is not established |
| Preprocessing | `sentryfl/data/preprocessor.py` | Normalization, imputation, windows, and persistence utilities present; split/window leakage needs an experiment-level audit |
| Model | `sentryfl/models/plm_backbone.py` | Transformer receives projected time-series embeddings; pretrained weights are external and must be recorded |
| Federated client/server | `sentryfl/federated/client.py`, `server.py` | In-process client simulation, FedAvg, validation, checkpoints, and optional Byzantine aggregation |
| Parameter efficiency | `sentryfl/models/lora.py`, `federated/adms.py` | FFA-LoRA/LoRA are real trainable subsets; ADMS masks gradients but do not by themselves reduce dense wire bytes |
| Privacy | `sentryfl/privacy/dp_fedavg.py`, `differential_privacy.py` | DP-FedAvg is documented as default; record-level Opacus DP-SGD remains a selectable baseline; claims need end-to-end experiment manifests |
| MIA | `sentryfl/privacy/mia_evaluator.py` | Shadow/attack utilities and tests exist; not a complete automatic privacy-utility sweep in the normal trainer |
| Quantization | `sentryfl/optimization/quantization_engine.py` | Post-training static INT8 utilities exist; per-study accuracy/latency/payload report is not proven complete |
| Evaluation | `sentryfl/evaluation/` | Metrics, baselines, ablations, and scaling utilities exist; publication-grade result artifacts remain to be generated |
| Python API | `sentryfl/api/app.py` | Experiment control, status, metrics, report, model download, pause/resume endpoints; in-memory runner registry |
| Node API | `api-server/src/` | Auth, authorization, validation, PostgreSQL, audit, proxy, cache, REST, and Socket.IO are present and tested |
| Dashboard | `dashboard/src/` | Login/register, dashboard, experiments, comparison, settings, charts, live updates, and model download |
| Deployment | `Dockerfile`, `docker-compose.yml`, `api-server/Dockerfile`, nginx config | Container/deployment scaffolding exists; production readiness and GPU image compatibility are unverified |

## Research requirement gap matrix

| Requirement | Current evidence | Classification | Severity | Required verification/correction |
|---|---|---|---|---|
| ADMS anomaly-driven masking | `ADMSModule` computes gradient importance and masks gradients | Partially implemented | P1 | Prove anomaly sampling, mask lifecycle, and compare theoretical versus measured serialized bytes |
| Pretrained backbone | `PLMTimeSeriesBackbone` loads a Hugging Face model and projects time series | Implemented structurally, experimentally unverified | P1 | Record model revision/license, input representation, download state, and seed-controlled baseline |
| Parameter-efficient training | FFA-LoRA and LoRA injection are present | Implemented structurally | P1 | Test exact transmitted state, aggregation, DP compatibility, and checkpoint resume |
| PPDS synthetic data | Client-local bounded VAE generation and pooled synthetic windows in `sentryfl/data/ppds.py` | Implemented as optional post-training path | P1 | Measure utility/privacy impact and retain raw-record non-release evidence |
| Knowledge distillation | Standalone module plus optional trainer post-training teacher/student path | Implemented as optional post-training path | P1 | Evaluate student utility and artifact/latency reduction on a held-out split |
| FedAvg | Server code and tests support sample-weighted aggregation | Implemented in simulation | P0 | Add invariant tests for counts, keys, shapes, zero/invalid updates, and round boundaries |
| DP-FedAvg | Delta clipping, Gaussian noise, PRV/RDP budget utilities exist | Implemented structurally; study incomplete | P0 | Validate sampling assumptions, composition, release scope, and cumulative budget on resumed runs |
| Record-level DP-SGD | Opacus wrapper exists | Baseline implementation | P1 | Verify optimizer replacement, sampling, step count, accountant consistency, and reported unit |
| MIA | Shadow/attack evaluator exists | Partial | P0 | Add leakage-free target/attack splits, chance baseline, balanced accuracy, ROC-AUC, precision/recall, and DP sweep |
| Quantization | PTQ engine and metrics exist | Partial | P1 | Run same held-out evaluation for FP32/INT8, measure actual artifacts/payloads and CPU latency |
| Client scaling 5–500 | Scaling utility exists | Unverified | P1 | Produce fixed matrix with participation, rounds, payload assumptions, memory/time, and honest simulation label |
| Remote FL clients | No independent client transport/enrollment/update protocol | Missing | P1 for deployment, P2 for simulation paper | Decide whether the research deliverable needs remote clients |
| UI live lifecycle | Node WebSocket and dashboard live hooks exist | Partial | P1 | Ensure every event is sourced from backend state and errors are visible; no synthetic progress |
| Multi-user isolation | JWT, owner/admin filtering, audit service, tests | Present in control plane | P0 | Add artifact/update authorization tests and verify Python backend cannot bypass ownership |

## Runtime and hardware probe

- Python: **3.10.0**.
- Installed PyTorch: **2.1.0+cpu**.
- `torch.cuda.is_available()`: **False**; CUDA version reported by PyTorch: **None**; GPU count: **0**.
- `nvidia-smi`: NVIDIA Quadro T2000, 4096 MiB, driver 573.22.
- Conclusion: the machine has a visible NVIDIA driver/GPU, but the active Python environment is CPU-only. No GPU execution or model forward/backward benchmark is claimed. A CUDA-compatible environment must be deliberately provisioned and tested; CPU fallback is currently the only verified path.

## Existing artifacts and reproducibility

The repository contains a student checkpoint, a preprocessor pickle, TensorBoard event files, demo SMD data, and JSON test/system reports. These are useful leads, not automatically reproducible scientific evidence. Each accepted experiment must preserve configuration, dependency lock state, code revision, seed, dataset checksum/split, model revision, hardware, command, and result files.

## Audit conclusion

Do not begin a broad rewrite. First approve the requirements and resolve the decisions in [RISK_REGISTER.md](./RISK_REGISTER.md). The safe implementation order is the dependency-aware sequence in [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md), starting with reproducible baselines and correctness tests.
