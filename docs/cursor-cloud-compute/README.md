# Cursor Cloud compute assessment (Headroom)

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

This package measures whether SEC EDGAR ingestion, document extraction, structural
parsing, deduplication, and deterministic covenant indexing can run efficiently
**inside Cursor Cloud Agents** before introducing RunPod, Modal, or another paid
GPU/cloud provider.

## Policy

- No paid GPU provisioning.
- No Anthropic / gateway model calls from this assessment path.
- North Star, legal safety gates, independent acceptance fixtures, and
  certification boundaries are preserved and untouched.
- Results are labeled `COMPUTE_ASSESSMENT_NOT_CERTIFIED`.

## What was inspected

- VM CPU / RAM / disk / GPU presence / ulimits
- Network reachability to SEC.gov and npm
- Persistence surfaces (workspace, `/opt/cursor/artifacts`, optional Blob/Postgres)

## How to run

```bash
npm run test:cursor-cloud-compute
npm run compute:bench-100
```

Outputs land in:

- `docs/cursor-cloud-compute/results/compute-assessment-<runId>.json` (git-tracked, durable via remote)
- `docs/cursor-cloud-compute/results/durable-index.jsonl` (append-only index)
- `/opt/cursor/artifacts/cursor-cloud-compute/` (agent artifact store)

## Pipeline under test (deterministic)

`parse → chunk → content-hash dedup → STRUCTURE → definitions → references → StructuralIndex → Pass A`

LLM extraction / Pass B / certification paths are **out of scope** and listed as
GPU-required workloads via the optional GPU-worker interface
(`lib/cursor-cloud-compute/gpu-worker.ts`), which remains **unprovisioned**.

## Code

| Path | Role |
|------|------|
| `lib/cursor-cloud-compute/` | Assessment library |
| `scripts/cursor-cloud-compute/run-100-doc-benchmark.ts` | CLI |
| `tests/cursor-cloud-compute/` | Soft-gate acceptance tests |
