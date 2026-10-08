# Cursor Cloud compute — Phase 2 measured results (real EDGAR)

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**
No paid GPU or model calls. Raw EDGAR bodies are **not** in git (`data/` gitignored).

**PR:** https://github.com/egsul897/headroom/pull/141  
**Starting SHA:** `7180ae820a87d56765e90bd25be695290f85792e`  
**Tip SHA (this report):** see git tip at commit time  
**Job ID:** `phase2-2026-10-08T22-26-35-340Z-7a6d213d`  
**Portable JSON:** `docs/cursor-cloud-compute/results/phase2-real-edgar-phase2-2026-10-08T22-26-35-340Z-7a6d213d.json`

## Coordination

| Workstream | Role |
|---|---|
| WS-PAR | Ownership map + SEC scheduler / shared corpus contracts (consumed RO) |
| WS-EHB | Source manifests + `acquisition-queue.json` (consumed RO) |
| WS-CKF | Canonical acquisition transport (tried; exhibit GETs preferred via EHB `SecAccessCoordinator` after measured CKF 403 anomaly) |
| WS-CCA (this) | Exclusive: `docs\|lib\|scripts\|tests/cursor-cloud-compute/**` |

## Required returns (measured)

| # | Metric | Value |
|---|--------|-------|
| 1 | Unique documents processed (OK) | **154** (+1 content-hash duplicate skipped) |
| 2 | Unique issuers / instruments / agreement keys / accessions | **48 / 85 / 155 / 103** |
| 3 | Cold processing-only throughput | **79.01 docs/s** (excludes download) |
| 3 | Warm processing-only throughput | **84.85 docs/s** (cache hits: 154) |
| 3 | Cold end-to-end docs/s (incl. download) | **4.62 docs/s** — *not* labeled processing-only |
| 4 | Cold end-to-end wall | **33.57 s** |
| 4 | Warm end-to-end wall | **2.04 s** |
| 4 | EHB discovery wall (100 issuers, metadata-first) | **`177.8 s`** (`checkpoint.createdAt→updatedAt`) |
| 5 | Peak RSS (cold / warm) | **186 MiB / 251 MiB** |
| 5 | CPU user+system (cold) | **4.24 s** (~0.13× wall; download-bound) |
| 6 | Storage volume (VM-local working corpus) | **~92.8 MiB** (not claimed as durable infra) |
| 7 | Hard failure rate | **0%** (0 FAILED downloads/parses) |
| 7 | Quality signals (not hard fails) | STRUCTURE_EMPTY **42**, MISSING_DEFINITIONS **23**, DUPLICATE_IDENTITY **1** |
| 8 | Cursor usage (observable) | **~0.59 agent wall-minutes** cold+warm; subscription billing not exposed |
| 9 | External paid cost | **$0** (0 Anthropic, 0 GPU) |
| 10 | Repro | see below |

### Document mix (cold OK+dup path)

CREDIT_AGREEMENT 39 · RESTATEMENT 38 · AMENDMENT 26 · OTHER_DEBT_AGREEMENT 20 · INDENTURE 17 · SUPPLEMENTAL_INDENTURE 8 · SECURITY_AGREEMENT 6 · INTERCREDITOR 1  

Filing dates: **2004-11-02 → 2026-08-12**

### Stage times (cold, ms totals)

| Stage | ms |
|-------|-----|
| download | 31,302 |
| parse | 713 |
| structure | 471 |
| Pass A | 523 |
| references | 154 |
| definitions | 86 |
| storage | 15 |
| dedupe | 0.3 |
| **processing-only sum** | **1,962** |

## Persistence / resume (proved)

- Restartable queue: `data/cursor-cloud-compute/phase2-corpus-*/processing-queue.json` (VM-local; **not** durable infra)
- Portable export: git-tracked JSON + `/opt/cursor/artifacts/cursor-cloud-compute/`
- Resume proof: **proved=true** — 0 duplicate records on restart; 154 completed preserved; content-hash change invalidates downstream stages only

## 1,000-doc target — blocker

**Achieved 155 fetchable financing docs** from WS-EHB `pilot-100` (100 issuers → 579 exhibits → 155 financing-eligible with direct archive URIs).

Concrete blocker: **upstream EHB discovery coverage / ranking**, not Cursor CPU. Expanding to 1,000 requires a larger EHB issuer universe (`scale-1000`) and/or EHB ranking changes. WS-CCA does **not** invent a competing source registry. A `scale-1000` discovery was started then paused to respect SEC fair-access while downloading.

## Quality notes (structural ≠ legal-semantic)

- `STRUCTURE_EMPTY` / `MISSING_DEFINITIONS` are recorded quality outcomes on real HTML exhibits (many short amendments / 8-K wrappers), **not** silent compiler patches.
- No certified compiler behavior was modified.
- Escalation examples are in the portable JSON `quality.exampleFailures`.

## Reproducibility

```bash
# Peer trees (RO)
git worktree add /tmp/peer-worktrees/ehb origin/cursor/edgar-historical-backfill-c45c
git worktree add /tmp/peer-worktrees/ckf origin/cursor/covenant-knowledge-factory-7327

# EHB discovery (metadata-first; produces acquisition-queue + manifests)
cd /tmp/peer-worktrees/ehb && npx tsx scripts/edgar-historical-backfill/run-discovery.ts \
  --scale pilot-100 --run-dir /path/to/data/edgar-historical-backfill/cca-phase2-pilot100

# Phase 2 cold+warm deterministic pipeline
cd /workspace
export HEADROOM_CKF_ROOT=/tmp/peer-worktrees/ckf HEADROOM_EHB_ROOT=/tmp/peer-worktrees/ehb
npm run test:cursor-cloud-compute
npm run compute:phase2-real-edgar -- \
  --ehb-run-dir data/edgar-historical-backfill/cca-phase2-pilot100 \
  --corpus-root data/cursor-cloud-compute/phase2-corpus-pilot100 \
  --limit 1000
```
