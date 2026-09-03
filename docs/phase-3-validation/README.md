# Phase 3 — Single Real-World Unseen Agreement Validation

Mission: run the full frozen contract-intelligence stack against exactly one genuinely
unseen real debt agreement, score against a human reference set, and decide the
Phase 3 generalization and Phase 4 gates.

Production frozen at `d5144d1` (tree hash `da7106fac07c3696…`, see `00-`).

## Agreement

Chewy, Inc. — **Credit Agreement dated as of June 23, 2026** (JPMorgan Chase Bank, N.A.,
Administrative and Collateral Agent), filed 2026-06-24 as EX-10.1 to Form 8-K,
accession 0001193125-26-281042. Selected content-blind by a pre-registered EDGAR full-text
query and a title-block rule (`01-`). 864,362 extracted chars (~288 pages), single base
document, no amendments, operative state resolved with zero effects.

## Outcome

| Item | Result |
|---|---|
| Deterministic stages (structure, definitions, references, 2A signals, package graph, operative state, context bundles, 3E Layers A/B) | COMPLETED, preserved under `tests/fixtures/unseen-packages/phase-3-validation-chwy-run/` |
| Paid stages (2B, Pass A x2, 3B, 3C, 3E Layer C) | **ENVIRONMENT_BLOCKED** — provider probe returned HTTP 402 `quota_for_entity_exceeded` (gateway key cap $150.00 exhausted) |
| Paid model calls / spend | 0 / $0.00 |
| Human reference set | 46 items across categories A–F (`04-`), authored independent of compiler output |
| Recall, substantive credit, Pass A stability, trust-safety classification | NOT_EVALUABLE / NOT_EVALUATED (`06-`) |
| TRUST SAFETY gate | NOT_EVALUATED (cannot claim PASS) |
| PHASE 3 GENERALIZATION | NOT_EVALUATED (no PASS / NEEDS_ITERATION / FAIL issued on zero evidence) |
| PHASE 4 gate | NOT_READY_FOR_PHASE_4_CONTRACT_COMPUTATION |

The single-agreement validation is **open, not failed**. `09-paid-run-manifest.json` is a
ready-to-execute plan ($20 hard budget) for the same SHA, fixture and reference set once a
working provider credential exists.

## Files

- `00-mission-production-freeze.json` — SHA, tree hash, frozen surfaces, allowed changes
- `01-source-identity-and-selection.json` — issuer, filing, hashes, why unseen, EDGAR query log, title-block reads, rejections
- `02-provider-precondition-and-cost.json` — 402 probe record, $0 spend, estimate, hard budget
- `03-deterministic-stage-results.json` — per-stage results and observations OBS-1..4 (no remediation)
- `04-human-reference-set.json` — 46 reference items with pinned offsets and blocked-stage columns
- `05-deterministic-reach-check.json` — structural reach of zero-cost stages over the reference set (not recall)
- `06-metrics-and-trust-safety.json` — all metrics NOT_EVALUABLE; audit-layer safe-failure note
- `07-root-causes-by-stage.json`
- `08-gates-and-verdict.json`
- `09-paid-run-manifest.json`

Harness: `scripts/phase-3-validation-chwy-deterministic-run.ts` (zero paid calls).
Fixture: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/` (+ `extraction-manifest.json`).

## Paid run (resumed 2026-09-03, credential restored)

Executed `09-paid-run-manifest.json` with `scripts/phase-3-validation-chwy-paid-run.ts` at production tree
`da7106fac07c3696…` (unchanged). Effective cap $14.00 (gateway balance $14.51 < manifest $20).

| Item | Result |
|---|---|
| Paid model calls / spend | 125 calls / $13.961228 (rate card = gateway-reported delta) / 1,373 budget refusals |
| 2B whole-document discovery | 839 candidates, 113 sections, 1 transient failure (1.09), DISCOVERY_PARTIAL, $4.66 |
| Units (top 12 by 2A signal count) | 3 attempted (1.01, 6.08, 9.04); 9 not attempted (budget) |
| 1.01 (353k chars) | Pass A 109 items (COVERAGE_GAP); compile FAILED (caller retrieval-nudge protocol defect F-1); run 2 gateway failure |
| 6.08 (38k chars) | Pass A 288 / 307 items; compile PARTIAL 38 rules + 6 defs; verifier MATERIAL_DISCREPANCY (25 material, 22 scale artefacts F-3) |
| 9.04 (30k chars) | Pass A 218 items; compile refused at cap |
| Pass A stability (6.08) | strict 0.19 / semantic 0.45 / critical-material 0.46 |
| Reference set (46) | discovered by Pass A 18/46 (0.39; 0.82 over attempted units); FULL 2 mechanical → 1 after adjudication; PARTIAL 6; MISSING 14; NOT_ATTEMPTED 24 |
| Trust safety | 0 dangerous silent failures / 44 safe failures → **TRUST_SAFETY_PASS** |
| Phase 3 generalization | **PHASE_3_GENERALIZATION_NEEDS_ITERATION** |
| Phase 4 gate | **NOT_READY_FOR_PHASE_4_CONTRACT_COMPUTATION** |

Paid-run artifacts: `11-paid-run-summary.json` (stages, spend, findings F-1..F-7, OBS carry-forward),
`12-pass-a-stability.json`, `13-reference-set-scoring.json` + `13b-substantive-adjudication.json`,
`14-metrics-paid.json`, `15-trust-safety.json`, `16-root-causes-paid.json`, `17-gates-and-verdict-paid.json`.
Run outputs: `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/` (incl. the zero-cost
`stage3e-coverage-linked.json` re-link produced by `scripts/phase-3-validation-chwy-3e-relink.ts`).
Scorer: `scripts/phase-3-validation-chwy-score.py` (gate rules pre-registered before results were read).
