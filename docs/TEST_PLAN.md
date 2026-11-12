# SentryFL Test Plan

## Test layers

1. **Unit:** pure preprocessing, aggregation, privacy math, metrics, serialization, authorization helpers.
2. **Integration:** trainer/client/server/checkpoint, FastAPI runner, Node-to-Python proxy, PostgreSQL test database, Socket.IO events.
3. **End-to-end:** authenticated dashboard flow from experiment creation through report/artifact download.
4. **Research validation:** fixed-seed experiment protocols and result-bundle schema.
5. **Manual/accessibility:** keyboard navigation, contrast, chart summaries, stale/reconnect/error states, and privacy labels.

## Required cases

| Area | Cases and acceptance |
|---|---|
| Data | shapes, labels, NaN/Inf, missing files, temporal ordering, boundary windows, deterministic splits, NSL-KDD sequence disclosure |
| Memory/training | bounded loader, minibatch/final batch, workers, CPU fallback, peak memory logging, early stop, checkpoint interruption/resume |
| Aggregation | weighted hand calculation, unequal sample counts, permutation invariance, key/shape/dtype mismatch, invalid/non-finite update rejection, round isolation |
| DP | clip norm, noise calibration, sampling assumptions, PRV/RDP selection, cumulative epsilon/delta, minimum clients, checkpoint restore, release inventory |
| MIA | disjoint target/attack splits, member construction, chance baseline, ROC-AUC/balanced accuracy/precision/recall, non-private versus DP |
| PEFT/comms | exact trainable keys, LoRA aggregation, ADMS dense payload reality, serialized byte counts, protocol overhead separation |
| Quantization | calibration, artifact load, output tolerance, same held-out metrics, size/error/latency/throughput, CPU-only path |
| API/security | authentication expiry, owner/admin boundaries, schema validation, limits, safe errors, audit records, artifact checksum and path isolation |
| Events/UI | event ordering/idempotency, stale data, reconnect, backend error, loading, cancellation, metric provenance, no synthetic progress |
| Demo | seeded anomaly types, pause/reset/speed, threshold display, ground truth separate from prediction, false positives/negatives |
| Reproducibility | same manifest/seed produces protocol-equivalent result; environment and dataset checksums recorded |

## Commands currently available

- Python: `python -m pytest`
- API server: `npm test`, `npm run lint`, `npm run format:check` in `api-server`
- Dashboard: `npm run test:run`, `npm run lint`, `npm run build` in `dashboard`

Run focused tests first, then the relevant full suite. A successful existing unit suite does not substitute for a completed research run or privacy review.

## Evidence retention

Store test output, runtime versions, command, commit, seed, and failure artifacts with the run. Never store secrets, raw private records, or unauthorized client updates.
