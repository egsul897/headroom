# Intelligence Factory — Cycle 1 Report

## Starting and ending SHA

- **Starting SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8` (origin/main at branch cut)
- **Ending SHA:** `466924fe3bbeee9e128fb979fb29deff86faefc7`

## New agreements and provisions processed

- None (read-only discovery). No Neon mutations.

## Corpus size and deduplication changes

- No corpus writes.
- Baseline measured: **730** KnowledgeSource rows, **708** distinct byte hashes, **10** duplicate-hash groups (32 rows).

## Newly understood contractual mechanics

- Documented maturity separation across Observed → Customer-ready for 17 mechanic classes.
- Product precedent clause retrieval now includes mechanic queries: shared capacity, anti-stacking, grower, MFN, mandatory prepayment, financial maintenance, investments, asset sales, EOD, guarantor restrictions.

## Genuine interpretation defects discovered

1. **Relationship edge identity mismatch:** `targetSourceId` is logical `sourceId`, not cuid — naive FK join reports 8193/8193 orphans; all resolve via `sourceId`.
2. **`loadAmendmentGraphCoverage` mixed namespaces** in one Set (cuid + sourceId) → incorrect `linkedSources`.
3. **SemanticTruthRecord = 0** despite 6 AnalysisRuns COMPLETED_WITH_REVIEW.
4. **Contract-model graph tables empty** (rules/defs/xrefs/amendments) while KF summaries hold 30k+ items.
5. **SharedConstraint.currentUsage hardcoded 0** at loader (capacity math gap; deferred to Cycle 2).

## Generalizable corrections

- Fixed coverage loader to normalize to logical sourceId.
- Baseline inventory script reports both cuid-join and sourceId-join orphan metrics.
- Expanded mechanic-based retrieval queries (precedent ≠ operative authority preserved).

## Capacity calculations independently validated

- Not in Cycle 1 scope (queued for Cycle 2 offline matrix).

## Regression and blind-holdout results

- `tests/product/legal-reasoning.test.ts`: **17/17 passed**.

## Customer cold-start performance

- Not measured this cycle (queued Workstream E).

## False permissions

- None introduced; no promotion path changes.

## Paid inference cost

- **$0**

## PR links and CI

- See PR for this branch (`cursor/neon-intelligence-baseline-2229`).

## Next highest-value tasks

1. Offline capacity math eval matrix (Golden/Coherent seed + solver shared-cap fixtures).
2. Customer cold-start readiness report (synthetic onboarding + enum mapping).
3. Owner-gated UNKNOWN reclassify (13/180 dry-run ready).
4. Shared-constraint `currentUsage` wiring behind unit tests.
5. Re-run Neon baseline after any corpus write.
