# Cursor Cloud compute — measured results

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**
No paid GPU or model calls were initiated.

**Run ID:** `2026-10-08T22-07-32-561Z-7f3ce634`
**Full JSON:** `docs/cursor-cloud-compute/results/compute-assessment-2026-10-08T22-07-32-561Z-7f3ce634.json`

## 1. VM inspection (measured)

| Resource | Value |
|----------|-------|
| CPU | 4 × Intel Xeon @ 2400 MHz |
| RAM | 15.64 GiB total |
| Disk | 254 GiB root, ~246 GiB available |
| GPU | **None** (`nvidia-smi` absent, no `/dev/nvidia*`) |
| Swap | 0 |
| Network | SEC.gov reachable; npm registry reachable; egress unrestricted |
| Persistence | workspace writable; `/opt/cursor/artifacts` writable; agent store mounted |
| Postgres / Vercel Blob | not configured in this run (optional backends skipped) |
| CPU time ulimit | unlimited (no hard CPU-time kill observed) |

## 2. 100-document deterministic job (measured)

Corpus: 20 in-repo EDGAR-derived seeds expanded to 100 docs (91 unique + 9 intentional byte-identical duplicates). Stages: parse → chunk → content-hash dedup → STRUCTURE → definitions → references → StructuralIndex → Pass A. **Zero LLM calls.**

| Metric | Measured |
|--------|----------|
| Documents processed | 100 |
| Unique / duplicates | 91 / 9 |
| Failures | **0** (failure rate 0%) |
| Wall clock | **3.016 s** |
| CPU time | **3.79 s** (user 3.63 + system 0.16) |
| Peak RSS | **362.9 MiB** |
| Throughput | **33.16 docs/s** · ~13.5M chars/s |
| p50 / p95 doc latency | 13.6 ms / 81.4 ms |
| Structural nodes | 77,806 |
| Pass A candidates | 35,089 |

### Stage totals (ms)

| Stage | ms |
|-------|-----|
| parse | 419 |
| chunk | 85 |
| hash/dedup | 35 |
| STRUCTURE | 735 |
| definitions | 224 |
| references | 390 |
| index build | 200 |
| Pass A | 914 |

## 3. Durable persistence (measured)

| Backend | Result |
|---------|--------|
| Git-tracked JSON | written (`docs/cursor-cloud-compute/results/…`) |
| Git-tracked JSONL index | appended |
| Cursor artifacts | written (`/opt/cursor/artifacts/cursor-cloud-compute/…`) |
| Vercel Blob | skipped (no `BLOB_READ_WRITE_TOKEN`) |
| Postgres | skipped (no `DATABASE_URL`) |

Agent VM disk alone is **not** treated as durable; git remote + artifact store are.

## 4. Cost (measured)

| Item | Value |
|------|-------|
| External paid USD | **$0** |
| Anthropic calls | **0** |
| GPU provisioned | **false** |
| GPU inferences | **0** |
| Cursor agent wall-minutes (job only) | **0.050** |

## 5. Small local models on CPU (measured probe)

No model weights downloaded. NumPy float32 GEMM (2048³ × 6) measured at **~778 GFLOP/s** peak on this host; tok/s estimates apply a **0.15×** decode-efficiency derate (memory-bound decode ≠ peak GEMM).

| Probe | tok/s (est.) | Practical on this VM? | Notes |
|-------|--------------|----------------------|-------|
| NumPy GEMM 2048³ | — | yes | sustained BLAS on 4 vCPU |
| ~120M decode | ~486 | yes (capacity) | light classification if weights fit |
| ~1B decode | ~58 | borderline | batch offline only |
| ~7B decode | ~8 | **no** | not for Pass B / extraction latency |
| JS hashed n-gram 50k chars | — | yes | ~4.6 ms feature pass |

## 6. Workloads requiring dedicated GPU

1. Pass B semantic covenant classification (LLM)
2. LLM extraction stages (provider STRUCTURE / DEFINITIONS / PERMISSIONS / RELATIONSHIPS / COVERAGE / FINANCIAL_INPUTS)
3. Semantic verification / ensemble certification (frontier models)
4. Large-context document Q&A beyond CPU small-model practicality
5. Dense embedding index builds at multi-million-chunk interactive scale

GPU-worker interface: implemented (`UnprovisionedGpuWorkerClient` / RunPod / Modal stubs), **available=false**, no provisioning.

## 7. Live EDGAR path

`scripts/verify-edgar-connector.ts` resolved Ford Motor Co CIK `0000037996` and completed `healthCheck` + `discover` against live SEC.gov from this VM (network path viable). Fixture-backed 100-doc job exercises the heavier CPU stages without depending on SEC rate limits for the throughput measurement.

## 8. Fitness verdict

**Deterministic SEC EDGAR ingest + structural compilation fits Cursor Cloud.**

Recommended next step: keep this pipeline on Cursor Cloud Agents; defer RunPod/Modal until authorized GPU inference is required for Pass B / LLM extraction volume.
