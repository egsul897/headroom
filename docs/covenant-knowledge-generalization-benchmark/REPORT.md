# HEADROOM — Covenant Knowledge Generalization Benchmark

**Verdict:** `CKG_BENCHMARK_STANDUP_COMPLETE_OFFLINE_BASELINE_RECORDED`

**Certification impact:** none (diagnostic only; no certification status changed)

**Paid calls:** `0`

## 1. What this is

An independent evaluation dataset and offline scorer for Headroom’s covenant-knowledge coverage and generalization on **held-out public agreements**. It is deliberately separate from Claude-owned acceptance tests, golden harnesses, and Phase 3 certification gates.

Canonical fixtures: `tests/fixtures/covenant-knowledge-generalization/`  
Scorer: `lib/evaluation/ckg-benchmark/`  
Runner: `scripts/ckg-benchmark/run.ts`

## 2. Hard constraints honored

| Constraint | Status |
|---|---|
| Do not modify Claude-owned acceptance tests | Pass — separate tree; isolation test lists protected paths |
| Held-out docs not used for prompt / extraction-rule development | Pass — registry flags `usedForPromptTuning=false`, excludes FWRG/LSB/CONMED/DSGR/Chewy/Riot |
| No model-generated interpretations as verified GT | Pass — authorities are `SOURCE_VERIFIED` / `REVIEWER_APPROVED` / `UNLABELED` only |
| Distinguish unlabeled from success/failure | Pass — first-class `UNLABELED` + `NOT_EVALUATED` outcomes |
| No paid calls / merges / certification changes | Pass — offline deterministic scoring only |
| Knife River BLIND body unread | Pass — reserved slot only |

## 3. Dataset

| Package | Role | Cases |
|---|---|---|
| Gibraltar Industries (ROCK) 2026 Credit Agreement | Held-out DEVELOPMENT public EDGAR; Pass B never ran; independent source labels | 18 |
| Superior Industries (SUP) 2022–2025 facility | Formerly unseen; now invariant-28 regression; independent GT remapped | 10 |
| Synthetic micro-controls | REVIEWER_APPROVED false-permission / unsupported / comparator / entity / exception | 8 |

**Totals:** 36 cases · 34 labeled · 2 unlabeled

Stratification dimensions: agreement type, issuer, covenant family, drafting complexity (`strata.json` + per-case fields).

## 4. Offline baseline results

Reproducible via:

```bash
npx tsx scripts/ckg-benchmark/run.ts
npx vitest run tests/covenant-knowledge-generalization/
```

| # | Metric | Success | Failure | Unlabeled | Not eval | Rate |
|---|---|---:|---:|---:|---:|---|
| 1 | Covenant-family discovery recall | 6 | 0 | 1 | 0 | 100.0% |
| 2 | Definition extraction accuracy | 1 | 2 | 0 | 0 | 33.3% |
| 3 | Cross-reference accuracy | 1 | 1 | 0 | 0 | 50.0% |
| 4 | Condition recall | 0 | 1 | 0 | 1 | 0.0% |
| 5 | Exception recall | 2 | 0 | 1 | 0 | 100.0% |
| 6 | Entity-scope accuracy | 2 | 0 | 0 | 0 | 100.0% |
| 7 | Amendment reconstruction | 2 | 1 | 0 | 0 | 66.7% |
| 8 | Shared-capacity recognition | 1 | 2 | 0 | 0 | 33.3% |
| 9 | Comparator correctness | 3 | 0 | 0 | 0 | 100.0% |
| 10 | False-permission rate | 1 | 1 | 0 | 0 | **50.0% incidence (lower better)** |
| 11 | Unsupported-semantic refusal | 1 | 1 | 0 | 0 | 50.0% |
| 12 | Provenance accuracy | 2 | 0 | 0 | 0 | 100.0% |
| 13 | Unseen-document performance | 0 | 1 | 0 | 0 | 0.0% |
| 14 | Cost per source-verified representation | 1 | 0 | 0 | 0 | **$0.0000** |

Machine-readable twin: `02-evaluation-results.json`.

### Reading the baseline honestly

- **Strong offline Pass A coverage** on Gibraltar family discovery, entity scope, exception chapeau, comparators, and provenance.
- **SUP definition / condition / shared-capacity failures** reproduce the historical sampling/trust-boundary gaps (COMPILE_CAP missed Article I; RESTATES edge missing) without re-billing.
- **Shared-capacity Pass A false-positive control fails on purpose** — `shared_cap` over-fires on “aggregate amount”; this is recorded as FAILURE, not excused.
- **False-permission incidence 50%** on the two synthetic controls (one injected false permission, one correct carve-out).
- **Unseen-document rollup 0%** because the required RESTATES edge remains missing in the frozen SUP artifact.
- **`$0.00` cost/SVR** is by construction for this unpaid run — not a claim about live compilation economics.

## 5. Outstanding evaluation gaps

See `04-outstanding-gaps.json`. Summary:

1. Deep Gibraltar §7.01(b) basket inventory still `UNLABELED`.
2. Gibraltar §7.08 QMA conditions `NOT_EVALUATED` (no Pass B / no paid semantic pass).
3. Knife River BLIND body still unread.
4. SUP cannot again support a *blind* generalization claim (invariant 28).
5. False-permission / unsupported rates need scale-up onto adjudicated public clauses.
6. Cost metric needs a future authorized paid held-out compilation to be economically meaningful.
7. No external legal-counsel sign-off on Gibraltar labels yet (same disclosed posture as prior independent GT).

## 6. What was not done (by design)

- No production prompt or extraction-rule changes.
- No Claude-owned acceptance fixture edits.
- No certification merges or status flips.
- No paid model calls.
- No Knife River body retrieval.
