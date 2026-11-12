# SentryFL Risk Register

| ID | Risk/unknown | Impact | Likelihood | Mitigation / decision needed | Owner gate |
|---|---|---:|---:|---|---|
| R-001 | Active PyTorch is CPU-only while a Quadro T2000 is visible | High | High | Provision/test a compatible CUDA environment; retain CPU mode and measure it honestly | M1 |
| R-002 | DP-FedAvg privacy unit is client/silo, while datasets lack natural users | Critical | High | Approve adjacency statement and never call it record/user privacy without evidence | M0/M4 |
| R-003 | PPDS/VAE is absent and KD flag is not wired | High | High | Implement end-to-end or remove from enabled claims | M0/M2 |
| R-004 | In-process federation may be mistaken for deployment privacy/isolation | Critical | High | Label simulation; add remote protocol only if approved | M0/M7 |
| R-005 | NSL-KDD sequence order can create artificial temporal claims | High | High | Predeclare construction and label results as constructed sequences | M0/M1 |
| R-006 | ADMS zeroed gradients do not imply sparse wire reduction | High | High | Measure serialized dense bytes; compare FFA-LoRA and true sparse transport separately | M3 |
| R-007 | MIA utility exists but complete automated sweep is not wired | High | High | Add leakage-free protocol and machine-readable privacy-utility report | M4 |
| R-008 | Quantization utilities may not cover the full research comparison | Medium | Medium | Same-split FP32/INT8 report with artifact and latency evidence | M5 |
| R-009 | External pretrained model download/license/revision may be non-reproducible | High | Medium | Pin revision, record license/checksum, support offline failure explicitly | M1 |
| R-010 | Process-local FastAPI runner state is not durable across restart | High | Medium | Persist experiment state or restrict service claim to single-process research use | M6 |
| R-011 | Model files and uploaded artifacts can be unsafe if deserialized broadly | Critical | Medium | Tensor-only safe loading, checksums, type/size limits, never execute uploaded code | M6/M7 |
| R-012 | Existing artifacts/checkpoints may not have complete provenance | Medium | High | Treat as exploratory; regenerate accepted baselines with manifests | M1 |
| R-013 | 500-client scaling may exceed CPU/RAM/time budget | Medium | High | Use bounded simulation, document resource limits, and do not extrapolate deployment capacity | M5 |
| R-014 | UI can display cached/stale metrics as live | High | Medium | Event envelope, timestamps, stale state, reconnect/error UI, backend source checks | M6 |
| R-015 | Privacy claims can be overstated from MIA failure | Critical | Medium | Reports must distinguish formal accounting from empirical attack outcomes | M4 |

## Unresolved approval questions

1. Is the required privacy claim client/silo-level DP-FedAvg, record-level DP-SGD, or both as separate studies?
2. Is PPDS plus knowledge distillation a mandatory research contribution?
3. Are independent remote clients required, or is a scientifically honest simulator sufficient?
4. Which datasets and sequence semantics are in the final benchmark?
5. Which pretrained backbone/revision and license are approved?
6. What CPU-only runtime budget is acceptable before CUDA setup is available?
