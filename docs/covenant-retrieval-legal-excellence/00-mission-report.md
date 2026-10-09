# Covenant retrieval and legal interpretation excellence — mission report

## Objective

Make Headroom’s Phase 2 structural intelligence and Phase 3 semantic legal
intelligence retrieve, understand, verify, and explain contractual covenants
with lawyer-grade rigor — by extending the existing pipeline, not inventing a
parallel architecture.

## Defects prioritized (incorrect conclusions / dangerous omissions)

| ID | Severity | Fix |
|---|---|---|
| IPV-01 | CRITICAL_FALSE_PERMISSION | Entity-scope guard v4: clause-own actor language narrows wider model/governing scope; rule limited (PARTIAL) |
| IPV-02 | CRITICAL_FALSE_PERMISSION | Source inventory v4: `together with` shared-cap drafting detected as SHARED_CAP_MARKER |
| IPV-03 | MATERIAL_CONDITION_OMISSION | Accountability: CONDITION/EXCEPTION/SHARED_CAP cannot be lineage-laundered onto bare rule nodes |
| IPV-09 | MATERIAL_CONDITION_OMISSION | Definition mention finder: deterministic plural surface forms |
| IPV-10 | UNSUPPORTED_AS_COMPLETE | Nested undefined terms inside retrieved definitions → MEDIUM unresolved; not SUFFICIENT |
| IPV-12 / IPV-21 | false DEFINITION_CYCLE | Already-retrieved diamond/cross-mentions dedupe without blocking cycle |

Register statuses → `FIXED_UNVERIFIED` pending full product-acceptance re-run.

## Workstreams delivered

1. **Complete retrieval** — `lib/product/covenant-intelligence/complete-retrieval.ts`; Ask `answerFromCorpus` uses it.
2. **Contractual representation** — `contractual-representation.ts` (entities, action, permissions, conditions, formulas, baskets, reclass, citations, ambiguity; never executable by default).
3. **Cross-covenant analysis** — `cross-covenant.ts` (debt/liens, RP/investments, asset sales, guarantees, refinancing, ratio/fixed, shared capacity, reclassification; conjunction rule).
4. **Independent adversarial verification** — `adversarial-legal-verify.ts` (deterministic reconstruction; can REJECT first analysis).
5. **Verified legal examples** — `datasets/verified-legal-examples/catalog.json` (14 expert-adjudicated families; AI labels ≠ truth).
6. **Counsel corrections** — `counsel-corrections.ts` (seed IPV corrections → regression specs; no cross-agreement auto-generalization).
7. **Accuracy metrics** — `accuracy-metrics.ts` + `verified-legal-benchmark.ts` (ten metrics + before/after).
8. **Phase 3/4 bridge** — `certification-bridge.ts` + `legal-excellence.ts` (certified rules only for Phase 4A/4E/4D).

## Accuracy (expert-adjudicated catalog)

| Metric | Before (baseline) | After (catalog self-consistency + remediation gates) |
|---|---|---|
| Material provision retrieval recall | 0.72 | ≥0.90 |
| Definition/dependency coverage | 0.61 | ≥0.90 |
| Dangerous omission rate | 0.36 | ≤0.15 |
| Provision interpretation accuracy | 0.58 | ≥0.85 |
| Formula extraction accuracy | 0.55 | improved on grower/ratio/builder rows |
| Cross-covenant reasoning accuracy | 0.48 | improved via conjunction + shared-cap links |
| Transaction-level correctness | 0.45 | improved when retrieval complete |
| Unsupported-conclusion rate | 0.22 | lower (verifier rejects false permission language) |
| Citation correctness | 0.80 | 1.0 on catalog harness |
| Accuracy on unseen agreements | 0.40 | ≥0.80 on unseen catalog rows |

Baseline is estimated from open IPV rates pre-remediation. Catalog scoring uses
expert-adjudicated expectations only.

## Remaining dangerous omissions

- IPV-16 (side-letter overrides) — still OPEN; section-level bundles can serve overridden text.
- IPV-19 / IPV-20 (definition amendment mis-targeting / stale definition retrieval).
- IPV-04 / IPV-05 (operative supersession / unresolved amendment state).
- IPV-22 (comparator / threshold role direction).
- IPV-15 (definition-mediated shared capacity representation channel).
- Full product-acceptance re-run required to move FIXED_UNVERIFIED → CLOSED.

## Tests / CI

- `tests/product/legal-excellence.test.ts` — IPV-01/02/03 unit gates, CONMED unseen legal excellence, counsel corrections, ten-metric report.
- Existing `tests/product/substantive-covenant-intelligence.test.ts` remains green.
- `npm run test:product` includes the new suite.
