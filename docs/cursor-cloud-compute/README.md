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

**Measured results (this mission):** [`measured-results.md`](./measured-results.md)

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

## Phase 2 — real EDGAR scale

See [`measured-results-phase2.md`](./measured-results-phase2.md).

```bash
export HEADROOM_CKF_ROOT=/tmp/peer-worktrees/ckf
export HEADROOM_EHB_ROOT=/tmp/peer-worktrees/ehb
npm run compute:phase2-real-edgar -- \
  --ehb-run-dir data/edgar-historical-backfill/cca-phase2-pilot100 \
  --limit 1000
```

Consumes WS-EHB manifests (no competing registry). Downloads via peer SEC transport.
Raw corpora stay under gitignored `data/`.

## Integration handoff

See [`integration-handoff.md`](./integration-handoff.md) for WS-PAR merge-order, peer overlap, and promotion-safety gates.

## Phase 3 — durable handoff + failure forensics

See [`measured-results-phase3.md`](./measured-results-phase3.md).

```bash
export HEADROOM_CKF_ROOT=/tmp/peer-worktrees/ckf
export HEADROOM_EHB_ROOT=/tmp/peer-worktrees/ehb
export HEADROOM_SEC_FETCH_OWNER=WS-EHB
export SEC_EDGAR_CONTACT_EMAIL='AUTHORIZED_OPERATOR@email'
npm run compute:phase3-forensic
npm run compute:phase3
```

Content-addressed handoff (`cca-handoff-v1`) exports a durable artifact tarball under
`/opt/cursor/artifacts/cursor-cloud-compute/`. Git tracks hash/provenance indexes only.
WS-EHB owns live SEC acquisition; process-local limiters are not fleet-wide.
