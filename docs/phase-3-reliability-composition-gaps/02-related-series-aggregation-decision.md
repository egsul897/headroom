# Related-series aggregation IR — interim decision B

**Status:** DECIDED (interim) — option **B**. Additive IR (A) and metric-basis (C) remain deferred.
**Evidence:** `docs/phase-3-live-validation/7.5j-deterministic-remediation/08-residual-genuine-blockers.json`
(related-series items `inv-item:0e5329437d345c7c5674b0b7` / `inv-item:c262463526204a96714cd8f6` / `inv-item:2bb0c84da8ad713ef2667e0f` — parent TRIGGER matches via excerpt).
**Code:** Pass C `reconciliation.ts` — `isRelatedSeriesAggregationClaim` + interim override of false `REPRESENTED`.
**Branch base:** `main` @ localRef merge (A/B seal `semantic-accountability.v8` untouched). Zero provider calls. No NS-4.

## What the source requires (CONMED §7.5(j) shape)

A threshold test that applies to a Disposition **or a series of related Dispositions**, with net
proceeds aggregated across the series. Historically the compiler folded that into a single trigger via
provenance/lineage; the IR has **no** structural element that:

1. distinguishes a related-series aggregation from a single event, or
2. binds the threshold operands to an aggregated quantity over that series.

Pass C previously credited the series ALTERNATIVE/TRIGGER inventory items as `REPRESENTED` solely
because they were listed on `rules[0].inventoryItemIds` / bound condition excerpts — a false structural signal.

## Decision (interim)

| option | status |
|---|---|
| **A. Additive IR primitive** | DEFERRED — needs schema + identity + normalize + projection + verifier; stratified certification |
| **B. Explicit UNSUPPORTED** | **ADOPTED (interim)** — Pass C refuses `REPRESENTED` for a "series of related …" source claim when the IR lacks structural series aggregation; disposition becomes `UNSUPPORTED` with an explicit reason naming interim posture B |
| **C. Defer to definition/metric** | DEFERRED — only if a defined-term / measurement-basis encoding actually carries the aggregation |

## Remediation (offline, deterministic)

**Interim lock is Pass-C-only:** Pass C `reconcileInventoryWithComposition` is the enforcement point.
Pass B *may* emit `inventoryDisposition: UNSUPPORTED` naming the series-aggregation requirement; it is **not** required for this lock.

In `reconcileInventoryWithComposition`:

- Detect related-series aggregation claims via `/\bseries\s+of\s+related\b/i` on proposition ∪ excerpt.
- **Detector note:** `/\bseries\s+of\s+related\b/i` is **CONMED-shaped**, not full NL coverage — near-miss phrasing is accepted residual risk for this interim.
- `irStructurallyRepresentsRelatedSeriesAggregation` is **false** until option A or C lands (no licensed IR primitive today).
- If disposition would be `REPRESENTED` and the claim matches and IR lacks structure → **`UNSUPPORTED`**, reason cites interim B and the lineage paths that were insufficient.

Effect on frozen §7.5(j) offline replay: all three detector-matched series items become `UNSUPPORTED` (honest), not silent `MISSING` and not false `REPRESENTED` — including the parent TRIGGER whose excerpt alone carries the series claim. Valuation non-vocab UNSUPPORTED and localRef closure unchanged.

**Ask Headroom** fail-closes on series-aggregation claims under interim B (never answers as if structurally represented) until a later ADR chooses executable option A or C.

## Acceptance

- Offline synthetic fixture: series claim + lineage-only consumption → `UNSUPPORTED`, never `REPRESENTED` / never silent `MISSING`.
- Control: non-series item with lineage stays `REPRESENTED`.
- Residual `relatedSeries.status` → `EXPLICIT_UNSUPPORTED_INTERIM_B`.
- Zero provider calls; no paid §7.5(j) re-run; A/B seal untouched.

## When to reopen A or C

Open a short ADR choosing **A vs C** only when stratified certification needs an **executable** series
threshold test for Phase 4A. Until then, interim B is the reliability posture.
