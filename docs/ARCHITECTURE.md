# SentryFL Architecture Decision Record

## Current architecture

```text
React/Vite dashboard
  REST + Socket.IO
Node/Express API (JWT, validation, PostgreSQL, cache, audit)
  HTTP proxy + internal callback
Python FastAPI ML API
  ExperimentRunner -> MainTrainer
  Dataset/preprocessing -> in-process FederatedClient shards
  AggregationServer -> checkpoints/reports
  DP / MIA / LoRA-ADMS / quantization / evaluation
```

The current design is suitable for a controlled research simulator. The Python FastAPI runner registry is process-local, while the Node layer owns user-facing authorization and persistence. The dashboard receives status/metrics through REST and Socket.IO.

## Target architecture (incremental)

Keep the three tiers and replace only the weak seams:

1. **Experiment control:** Node remains the authenticated public API; Python remains a private compute service. Add correlation IDs, signed internal callbacks, durable experiment state, and an explicit manifest.
2. **Research engine:** keep existing trainer/client/server modules. Extract pure aggregation, privacy-accounting, serialization, and communication-measurement contracts so they can be tested independently.
3. **Client boundary:** default research mode remains local simulation. If remote FL is approved, add enrollment, capability-scoped round tokens, update schema/version validation, authenticated transport, replay protection, and server-side quarantine; do not expose raw data.
4. **Artifacts:** store versioned metadata and checksums separately from model bytes. Use safe tensor-only loading where possible; never unpickle untrusted uploads.
5. **Events:** define a versioned event envelope `{event_id, experiment_id, round_id, type, occurred_at, producer, payload, schema_version}`. UI treats missing/stale events as uncertainty, not progress.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| FL algorithm | Plain sample-weighted FedAvg plus DP-FedAvg as a separate mechanism | Prevents conflating weighted model averaging with clipped mean-delta privacy |
| Recommended PEFT | FFA-LoRA | Trainable B is linear in the effective adapter update, enabling exact averaging and unbiased additive noise |
| ADMS | Retained as a measured baseline | Gradient masking alone is not sparse transport |
| Privacy scope | Client/silo/entity for DP-FedAvg; record for Opacus baseline | SMD/NSL-KDD lack natural users; reports must state the unit |
| Dataset flow | Raw data stays in client-local shard/process | This is true for simulation; remote deployment requires protocol enforcement |
| UI truth model | Backend events and persisted measurements only | Avoids fabricated live animations and invented metrics |
| Deployment | CPU is verified fallback; CUDA is an explicit environment variant | Current torch build is CPU-only despite a visible Quadro driver |

## Boundaries and invariants

- Aggregation accepts only compatible parameter keys/shapes/dtypes and positive sample counts.
- Plain FedAvg uses sample weights; DP-FedAvg uses the explicitly documented clipped mean-delta mechanism.
- DP accountant state is checkpointed and restored before further rounds.
- Every metric carries dataset, split, model version, experiment, seed, and configuration provenance.
- Model download authorization is checked in the Node API and artifact metadata is checksum-verified.
- Synthetic, simulated, and unverified results are visually and machine-readably labelled.
