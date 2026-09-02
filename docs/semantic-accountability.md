# Semantic Accountability (Phase 3 Final)

Narrative summary of the Semantic Accountability workstream: source-inventory -> IR-composition -> deterministic-reconciliation architecture built to answer, for a whole agreement, "did the compiler account for every material thing in the source, and can it prove it, without ever crediting itself for something it didn't actually verify."

Machine-readable evidence for every claim below lives in `docs/semantic-accountability/*.json` (00 through 26). This document is the narrative; the JSON artifacts are the record.

## Architecture

Three passes, each independently inspectable:

- **Pass A - source-only inventory.** A frozen, content-hashed enumeration of every material item in the source text, produced without looking at any compiled output. Each item gets a stable, content-derived `inventoryItemId` (`inv-item:<24-hex-digest>`), so the same real content produces the same id across independent runs regardless of surrounding drift.
- **Pass B - IR composition with lineage.** The semantic compiler (frozen production code) composes rules/definitions/shared capacities from source, and every composed element declares which Pass A inventory item(s) it traces back to (`lineage.inventoryItemIds`).
- **Pass C - deterministic reconciliation.** `reconcileInventoryWithComposition()` (`lib/contract-model/compiler/semantic-accountability/reconciliation.ts`) matches Pass A items against Pass B lineage/dispositions with no LLM call and no self-attestation: a composition claiming "REPRESENTED" is never taken at its word (control C1); every lineage reference that cannot be matched to a known inventory item is counted as dangling and blocks completeness (control C2).

An independent, architecturally separate Phase 3C verifier runs on top of this and can independently flag a MATERIAL discrepancy that downgrades a unit's status even when the accountability layer alone would have called it complete - two trust layers, confirmed independent both statically and at runtime (`20-verifier-independence.json`).

## RVD-1: the real-validation defect only real content could surface

The synthetic corpus (I1-I45, 139/139 passing) could not have caught this. On the very first real-content run after switching back to Sonnet 5, dispositions collapsed: 0/6 regions semantically complete, up to 69 dangling lineage references in a single region. Direct inspection of the raw output showed the cause precisely: the composition model reliably reproduced an inventory item's 24-hex-character content digest, but frequently dropped the `inv-item:` prefix when citing it in lineage. Every dropped-prefix reference was, correctly, being treated as a reference to nothing.

Fixed by adding digest-based canonicalization to Pass C only (`digestOf()` / `buildDigestIndex()` / `canonicalizeId()`): before matching, a lineage or disposition id is checked against the known items' own digests, and only a genuine digest match is resolved - a same-shape but non-matching id is deliberately left dangling (verified by a dedicated regression test). The fix is centralized in the reconciliation layer, never backported into Pass A or Pass B, keeping the correction auditable at a single point. Production was re-frozen after the fix (`10-production-freeze.json`, SHA `976a5650cbdf3bd4ce16fd86b7370bee30b341e4`).

## Real validation

Two validations were designed; one completed.

**Validation A - holdout (completed).** Two independent real runs (Sonnet 5, post-RVD-1-fix) against real, previously-unseen holdout content: `run-1` ($7.31, 7/8 regions) and `run-2` ($7.59, 7/8 regions). The hard safety gate - zero CRITICAL-materiality items captured in one run and missing in the other - passed cleanly. The pre-registered disposition-stability gate (>=95% of shared items dispositioned identically across runs) measured **90.11%**, a genuine shortfall. Instability is concentrated in what Pass A inventories per run (inventory variance 372) rather than in how a shared item is dispositioned once inventoried (composition variance 0) - the reconciliation logic itself is stable; the upstream inventory step is not yet deterministic enough on repeated real-model runs.

**Validation B - whole-agreement (blocked, partial).** Run-1 completed only 3/12 regions ($5.29) before the Vercel AI Gateway credential hit its own account-level budget cap (HTTP 402: "Current spend: $150.34, limit: $150.00... contact your administrator"). This is an external provider limit, unrelated to any per-run ceiling set for this workstream. Presented with the block, the user chose to stop and finalize with partial real evidence rather than seek a new credential. Run-2 and the stability comparison were never started. The shared-cap/cross-reference real-content validation, which depended on whole-agreement coverage, is correspondingly `NOT_MEASURED_ON_REAL_CONTENT` - only synthetic coverage (I28/I29) exists, which does not substitute for real-content evidence.

An earlier attempt substituted Haiku 4.5 for cost (per the user's "use cheaper AI" request) and showed severe degradation (0/7 semantically complete, one outright compile failure). The user chose to discard that run and switch back to Sonnet 5 rather than let it confound the real evidence base - it is preserved on disk with a `DISCARDED.md` explaining why, never deleted, but excluded from every gate computation above.

## Quality gates

- **False-credit controls:** 14/14 pass (`21-false-credit-controls.json`), including a dedicated control (C3) proving the RVD-1 fix resolves only genuine digest matches, never a guessed same-shape id.
- **Agreement-level rollup:** correctly conservative on real data - 0 of the 16 real units evaluated (across both holdout runs and the partial whole-agreement run) reached agreement-level `SEMANTICALLY_COMPLETE`; every downgrade traces to a specific, disclosed reason (`19-agreement-level-coverage.json`).
- **Regression:** zero regressions attributable to this workstream's two changed files (`reconciliation.ts`, `types.ts`). tsc shows its known 6 pre-existing errors and nothing new; `next lint` is clean; vitest's elevated failure count (103 files, up from a same-session DB-available baseline of 2) is fully attributable to Postgres becoming unreachable in this container mid-session, not to any code change - confirmed by reconciling all 103 failing files into 2 known pre-existing failures + 101 DB-unavailability failures + 0 semantic-accountability failures (`22-known-package-regression.json`, `23-full-regression.json`).
- **Independent audit:** 17 findings, 14 pass, 2 pass-with-caveat, 1 fail (the shared-cap real-coverage gap, the same underlying finding as Validation B's block) (`24-independent-audit.json`).

## Verdict

**`SEMANTIC_ACCOUNTABILITY_NEEDS_ITERATION`**, with **`ENVIRONMENT_BLOCKED`** disclosed separately for the incomplete whole-agreement and shared-cap validations (`26-final-verdict.json`). The primary verdict rests on the one validation that ran to full design completion and fell short of its own pre-registered bar: 90.11% disposition stability against a required 95%, localized to Pass A inventory non-determinism rather than the reconciliation/disposition logic. Closing this out requires: (1) root-causing and fixing the inventory-variance source, (2) re-measuring holdout stability at >=95%, (3) completing Validation B and the shared-cap real-content check once Gateway budget headroom is available, and (4) re-running the independent audit with a genuinely separate agent.

Full gate-by-gate accounting: `docs/semantic-accountability/25-phase3-release-gate.json`.
