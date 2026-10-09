# Neon Activation — Scorecard

**As of:** 2026-10-09  
**SHAs:** see PRs below  
**Paid inference:** $0  
**Neon corpus writes:** 0 (ephemeral E2E company cleaned up)

## Before → after (this activation mission)

| Metric | Before | After | Notes |
|---|---:|---:|---|
| Authentic agreements (distinct hashes) | 708 | 708 | No corpus growth this session |
| Structured provisions (summary items) | 30,051 | 30,051 | Unchanged |
| Verified rules (SemanticTruth VERIFIED) | 0 | 0 | Gate preserved |
| Executable Permissions (Neon) | 39 | 39 | + ephemeral proof only |
| Correct executable calculations (proven) | baseline golden only | **+1** CONMED §7.2 → $84M | E2E proof |
| Correct refusals | engine fail-closed | **+1** missing totalAssets | E2E proof |
| Incorrect permissions introduced | — | **0** | |
| Utilization-backed calculations | loader hardcoded 0 | **status-aware** named-member wire | `ZERO_NO_ATTRIBUTED_USAGE` ≠ proven empty |
| Cold-start extract threshold/formula/grant | 0/3 / 0/3 / 2/3 | **3/3 / 3/3 / 3/3** | PR #225 |
| Maintenance gap flagged | no | **yes** | KNOWN_NOT_MODELED |
| Source-integrity defects fixed | — | documented; no bulk reclassify | Owner gate for UNKNOWN |
| Independent holdout (Gibraltar/LSB formulas) | fail | **pass** | PR #225 |

## Populations (do not interchange)

| Population | Count | Maturity |
|---|---:|---|
| KnowledgeSource rows | 730 | Observed/Extracted |
| Distinct hashes | 708 | Authentic agreements |
| Covenant summary items | 30,051 | Extracted (DISCOVERED) |
| Candidate metadata sum | 40,518 | Observed counts |
| Relationship edges | 8,193 | DISCOVERED |
| Permissions | 39 | Executable (29 VERIFIED review) |
| GoldenTests | 48 | VERIFIED regression |
| SemanticTruthRecords | 0 | — |
| KF CERTIFIED | 0 | — |

## PRs

| PR | Focus |
|---|---|
| https://github.com/egsul897/headroom/pull/225 | Real-prose extraction (threshold/formula/grant/maintenance gap) |
| This branch | Lifecycle blockers + shared-usage + Neon→capacity E2E proof |

## Next

1. Product callers pass attributed `basketUsage` into loader
2. Bind more customer uploads to companyId/documentId for counsel compile
3. Owner-gated UNKNOWN reclassify (13/180 dry-run)
4. Gibraltar Pass A count rebaseline
5. Challenge matrix (Workstream C) over STRUCTURALLY_INDEXED holdouts
