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
