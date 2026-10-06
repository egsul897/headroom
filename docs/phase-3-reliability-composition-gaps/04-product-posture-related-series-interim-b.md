# Product posture note: related-series interim B

**Date:** 2026-10-06  
**Status:** Product PASS on interim option B (docs/evidence note only)  
**Packet:** `docs/phase-3-reliability-composition-gaps/`  
**Does not amend:** `02-related-series-aggregation-decision.md` (remains the decision record for A vs C)

## Locked product posture

Headroom Product **PASS** on **interim B** for related-series aggregation:

- Pass C must disposition series-aggregation claims `UNSUPPORTED` (never `REPRESENTED` via lineage); Pass B may also emit `inventoryDisposition: UNSUPPORTED` but is not required for this interim lock.
- Never claim `REPRESENTED` for related-series aggregation.
- IR has **no** structural series-aggregate element today.
- Fail-closed in Ask Headroom until an Architect ADR lands.

## Explicitly not chosen / not authorized

- Option **A** (additive IR primitive) vs option **C** (defer to definition/metric) is **not** chosen.
- No IR invention; no ERP/TMS-shaped workaround.
- No implementation of A or C is authorized by this note.
- Deferred until stratified certification needs an executable series test **and** an Architect ADR.

## Scope

- Headroom Answer only: paths / capacity / conditions / provenance.
- NS-4 remains out of scope until Phase-3 reliability gates clear (orthogonal; do not blur in this packet).
- Zero provider calls; docs-only.

## Citations

- Decision record (still open for A/C): `docs/phase-3-reliability-composition-gaps/02-related-series-aggregation-decision.md`
- Product PASS: Headroom Product (2026-10-06)
- COO authorize sibling note: Headroom COO (2026-10-06)
- Architect pre-PASS: **PASS** (2026-10-06)

## Process note

This file is the evidence/notes trail locking product posture for the next ADR packet. Merge after the usual COO + Trust/audit gate.

Prefer landing this sibling after or with the related-series PR that marks `02` DECIDED interim B, so this note does not claim Product PASS on B while main still has `02` as BLOCKED. Hygiene PR #62 is already on main (`d9021e9`).
