# Decision required: related-series aggregation IR (do not implement yet)

**Status:** BLOCKED on design — not part of the non-vocabulary disposition chunk.
**Evidence:** `docs/phase-3-live-validation/7.5j-deterministic-remediation/08-residual-genuine-blockers.json`
(`relatedSeries.status = NOT_STRUCTURALLY_REPRESENTED`); assessment detail that the single-vs-series
alternative lives only in bound condition/gate excerpts and inventory lineage
(`c262463526204a96714cd8f6` / `2bb0c84da8ad713ef2667e0f` consumed on the rule).

## What the source requires (CONMED §7.5(j) shape)

A threshold test that applies to a Disposition **or a series of related Dispositions**, with net
proceeds aggregated across the series. Today the compiler folds that into a single trigger via
provenance/lineage; the IR has **no** structural element that:

1. distinguishes a related-series aggregation from a single event, or
2. binds the threshold operands to an aggregated quantity over that series.

## Why code must wait

Any speculative node (e.g. ad-hoc `RELATED_SERIES`, silent `SUM` over unnamed events, or a free-text
condition) would either:

- invent semantics not licensed by the frozen General Covenant IR vocabulary, or
- look "represented" under Pass C without an evaluable aggregation contract for Phase 4A.

That violates the reliability gate rule: **no invented IR for related-series without an explicit
decision**.

## Decision options (pick one before coding)

| option | sketch | implications |
|---|---|---|
| **A. Additive IR primitive** | e.g. `SERIES_AGGREGATE { of, relatedBy, quantity }` (or equivalent) as a first-class expression/condition carrier, with lineage to the ALTERNATIVE/CONDITION inventory items | schema + identity + normalize + projection + verifier; version bump; stratified certification fixtures |
| **B. Explicit UNSUPPORTED with structure note** | require Pass B to emit an `UNSUPPORTED` node (or inventoryDisposition `UNSUPPORTED`) naming the series-aggregation requirement; never claim REPRESENTED | no IR invention; evaluation stays non-executable for that mechanic; honest REVIEW/PARTIAL |
| **C. Defer to definition/metric** | treat "series of related Dispositions" as part of a defined net-proceeds metric's measurement basis (asOf / during / event set) already expressible with existing AS_OF / DURING_PERIOD / EVENT_ACTIVE | only if the source's defined-term / metric machinery actually carries the aggregation; CONMED (j) may not |

## Recommendation for the next turn after this PR

Prefer **B** as the interim reliability posture (already aligned with the composition contract), and
open a short ADR choosing **A vs C** only when stratified certification needs an executable series
test. Do **not** land option A in the same PR as disposition remediation.

## Acceptance when a decision lands

- Offline synthetic fixture covering single vs related-series threshold.
- Pass C: inventory items for the series alternative are REPRESENTED or explicitly UNSUPPORTED — never silent MISSING.
- Zero provider calls for the deterministic proof; no live §7.5(j) paid re-run required to close the decision itself.
