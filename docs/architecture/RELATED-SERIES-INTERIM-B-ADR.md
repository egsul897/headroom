# ADR: Related-series aggregation — interim posture B

**Status:** ACCEPTED (COO PASS_WITH_NOTES 2026-10-06; docs-only architecture lock)  
**Date:** 2026-10-06  
**Authors:** Headroom Architect  
**Does not authorize:** IR schema changes, option A implementation, option C implementation, NS-4 start, paid §7.5(j) rerun  
**Impl tip (code+02):** `8f57e786b8b9cd242ff43d6de748a0001637065b` on `phase3-reliability-related-series-b` (rebased onto `d9021e9`; supersedes stale `416acc2`)  
**Related:**  
- Decision memo: `docs/phase-3-reliability-composition-gaps/02-related-series-aggregation-decision.md`  
- Product posture note: `docs/phase-3-reliability-composition-gaps/04-product-posture-related-series-interim-b.md`  
- Residual evidence: `docs/phase-3-live-validation/7.5j-deterministic-remediation/08-residual-genuine-blockers.json`  
- Invariants: **9** (unsupported must be surfaced), **14** (understanding ≠ executability), **37** (NO_SILENT_MATERIAL_FAILURE)  
- A/B seal: `semantic-accountability.v8` (untouched)

---

## 1. Context

CONMED §7.5(j)-shaped drafting applies a threshold to a Disposition **or a series of related Dispositions**, with aggregation across the series. The General Covenant IR (`headroom-covenant-ir.v1`) has **no** licensed structural element that (1) distinguishes related-series aggregation from a single event, or (2) binds threshold operands to an aggregated quantity over that series.

Pass C previously credited series ALTERNATIVE/TRIGGER inventory items as `REPRESENTED` solely via lineage onto a rule/condition (inventory IDs / bound excerpts). That is a **false structural signal**: lineage is not an evaluable series aggregation.

On main after hygiene #62 (`d9021e9`), residual status was still `NOT_STRUCTURALLY_REPRESENTED`. Product has **PASS** on interim option B. Implementation draft (local tip `8f57e78`, branch `phase3-reliability-related-series-b`, rebased onto `d9021e9`) adopts Pass C override → explicit `UNSUPPORTED` with residual `EXPLICIT_UNSUPPORTED_INTERIM_B`. This ADR is the architecture lock for that interim posture; it does **not** choose A vs C.

## 2. Decision

**Adopt interim option B** until a later ADR chooses A or C for an *executable* series threshold test (stratified certification / Phase 4A need).

| Option | Status under this ADR |
|---|---|
| **A. Additive IR primitive** (e.g. series-aggregate expression/condition carrier) | **DEFERRED** — requires schema + identity + normalize + projection + verifier + seal discipline + stratified fixtures |
| **B. Explicit UNSUPPORTED** | **ADOPTED (interim)** |
| **C. Defer to definition/metric measurement basis** | **DEFERRED** — only if existing AS_OF / DURING_PERIOD / EVENT_ACTIVE (or equivalent) honestly carries the aggregation |

### Interim B rules (normative)

1. A source claim matching related-series aggregation (CONMED-shaped: `\bseries\s+of\s+related\b` on proposition ∪ excerpt is the current detector; near-miss phrasing is accepted risk, not full NL coverage) **must not** earn `REPRESENTED` from lineage or inferred correspondence alone.
2. **Pass C** `reconcileInventoryWithComposition` is the interim enforcement point: such claims become `UNSUPPORTED` with an explicit reason naming interim posture B.
3. Pass B *may* emit `inventoryDisposition: UNSUPPORTED` naming the series-aggregation requirement; it is **not** required for this lock.
4. Residual tracker status for related-series is `EXPLICIT_UNSUPPORTED_INTERIM_B` (not silent `MISSING`, not false `REPRESENTED`, and no longer bare `NOT_STRUCTURALLY_REPRESENTED` once the implementing PR merges).
5. **No IR invention** under this ADR. `irStructurallyRepresentsRelatedSeriesAggregation` remains false until a successor ADR lands A or C.
6. Ask Headroom / Headroom Answer stays **fail-closed** for series-aggregation executability until that successor ADR and certification need.

## 3. Consequences

**Positive**
- Honors invariants 9 and 37: unsupported series aggregation is explicit and claim-specific, not coerced into single-event IR.
- Preserves invariant 14: understanding that a series alternative exists in source ≠ calculation capability.
- Keeps A/B seal `semantic-accountability.v8` closed; zero provider calls; no paid §7.5(j) rerun required to lock the posture.

**Negative / accepted**
- Series threshold mechanics remain non-executable until A or C.
- Detector is deliberately narrow (CONMED shape); other phrasings may not trip until vocabulary work is authorized.

**Forbidden without user override / successor ADR**
- Implementing option A or C
- ERP/TMS-shaped workarounds pretending to aggregate series
- Starting NS-4 as a substitute for this decision
- Reopening the A/B seal to “make series look represented”

## 4. When to reopen A vs C

Open a short successor ADR choosing **A vs C** only when stratified real-provision certification needs an **executable** series threshold test. Until then, interim B is the reliability posture.

`02-related-series-aggregation-decision.md` remains the working decision memo for A vs C; this ADR does not pick between them.

## 5. Acceptance

- Offline synthetic: series claim + lineage-only consumption → `UNSUPPORTED`, never `REPRESENTED`, never silent `MISSING`.
- Control: non-series item with lineage stays `REPRESENTED`.
- Residual `relatedSeries.status = EXPLICIT_UNSUPPORTED_INTERIM_B` with item IDs + pointer to `02`.
- Docs-only for *this* ADR file; code enforcement ships in the related-series interim B PR (Architect **PASS** to open PR on tip `8f57e78`; prior PASS_WITH_NOTES notes addressed or non-blocking).
- Product posture sibling `04` (Architect **PASS**) may land with/after that PR.

## 6. COO decision

**COO: PASS_WITH_NOTES (2026-10-06).** Architecture lock for interim B accepted (A/C deferred, no schema).  
ADR acceptance is **not** merge authorization for the implementation PR — that still requires separate COO + Trust + CI PASS.  
Grok Bot may include this file in the related-series interim-B PR (or a tiny docs follow-on).
