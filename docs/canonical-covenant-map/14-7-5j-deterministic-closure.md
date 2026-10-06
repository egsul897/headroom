# 14 - §7.5(j) live-exposed deterministic defect closure (A–D)

Starting SHA `a2e7496517e7286bb0a3e098807d04e3f5c167d1`. Zero paid calls. The §7.5(j) live run is RETIRED; its evidence
(`docs/phase-3-live-validation/7.5j-end-to-end-certification/`) and verdict are immutable. Offline before/after evidence:
`docs/phase-3-live-validation/7.5j-deterministic-remediation/`.

Objective: remove FALSE deterministic failures without removing REAL semantic failures. The frozen candidate is not expected
to certify and does not: the three non-cash valuation items, the related-series aggregation, the single-run support
asymmetry and the enumeration signal all remain visible.

## A. Source coverage - leading bare enumerator handoff (`semantic-accountability.v7`)
`clipCreditToStartSegment` keeps clipping an item's credit to the independent segment its span starts in (canary #3). One
positively-proven exception: when that first segment is nothing but a recognised enumerator (`(j)`, `(iv)`, `(12)`, `3.`)
plus whitespace/punctuation - no letter, no digit - and the span continues directly into the next segment, and that segment
is substantive by the detector's own verdict (`classifyUnaccountedFragment` → UNACCOUNTED_SOURCE, carries a letter), credit
advances to that ONE segment and stops at the next boundary. No hop onto a lone number, a caption, a second enumerator
line, or an enumerator carrying words; INFORMATIONAL items still account for nothing; provenance spans untouched.
Segmentation policy unchanged: a line break is an independent boundary (audit finding 7), so a wrapped continuation line
needs its own anchor. `isBareEnumeratorFormatting` is exported for tests.

## B. Quantitative source authority (`semantic-accountability.v7`)
`normalizeWireValue`: when the model's kind is outside QUANTITATIVE_KINDS or OTHER, the raw text is located in the source,
and `scanQuantitativeValues(rawText)` yields exactly one recognised figure, the value is canonicalised to the scanner's
kind/value/unit/span; the model's kind string is kept as `QuantitativeValue.declaredKind` (audit only, outside identity and
equivalence). Fail closed otherwise (raw absent/unlocatable, nothing recognised, several figures): existing OTHER behaviour.
The model never overrides the scanner; OTHER never matches numeric IR literals; "lineage without value correspondence does
not count" is unchanged. `canonicalizeFrozenQuantitativeValue` exposes the same judgement for replaying a frozen inventory.

## C. Canonical action ontology v2
Object-family regexes carry `i`; `withFlags(source, like, extra)` rebuilds every derived regex with the original's flags
(never `g`/`y`, so no `lastIndex` leaks). Audited: all five `new RegExp(...)` sites in the module now go through it;
`governing-scope.ts` rebuilds its posture regexes from `g`-only sources (no flag lost - left unchanged).

## D. METRIC_REFERENCE asOfDate lift (`semantic-accountability-compiler.v10`)
A non-empty `asOfDate` on a METRIC_REFERENCE wire node becomes `AS_OF(metric, asOfDate)` through `buildComposite` (typed
from the metric; deterministic exprId; lineage/provenance as for any composite), recorded as
`METRIC_REFERENCE_AS_OF_LIFTED` (DIAGNOSTIC class, no sufficiency cost). Whitespace-only selectors invent nothing; an explicit
wire AS_OF is never double-wrapped. The selector is visible in the projection and to Pass C as TEXT at `.asOfDate`.

## Versions
semantic-accountability v6→v7 (ensemble still accepts v6 and v5 passes); canonical-action-ontology v1→v2; semantic compiler
v9→v10. Unchanged on purpose: compiler prompt v8, verifier v5 and prompt v4, projection v4 (its logic is unchanged - it shows
whatever IR it is given; the §7.5(j) replay hash changes because the IR changed), provenance binding v2, qualitative
grounding v4, IR schema.

## Tests
`enumerator-handoff-coverage.test.ts` (A1–A7), `quantitative-source-authority.test.ts` (B1–B8), `action-ontology-case.test.ts`
(C1–C6), `metric-reference-as-of-lift.test.ts` (D1–D10), `live-7-5j-deterministic-replay.test.ts` (frozen before/after,
hash-pinned, residuals asserted to remain).
