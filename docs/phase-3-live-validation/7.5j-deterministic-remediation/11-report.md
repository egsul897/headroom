# §7.5(j) live-exposed deterministic defect closure — offline replay (zero provider calls)

Starting SHA `a2e7496517e7286bb0a3e098807d04e3f5c167d1`. The live run under `../7.5j-end-to-end-certification/` is immutable
(hash-pinned in `scripts/phase-3-live-validation/replay-7-5j-deterministic.ts`) and its recorded verdict
PHASE3_7_5_J_SEMANTIC_FAILURE stands. This directory holds BEFORE (read from the frozen artifacts) and AFTER (recomputed from
the same frozen inputs by the corrected deterministic layers). The Layer-2 reviewer is scripted to the live reviewer's recorded
zero findings; only deterministic layers are exercised.

## The four generic closures

| defect | root cause | generic fix | §7.5(j) BEFORE | §7.5(j) AFTER |
|---|---|---|---|---|
| A coverage | a line break is an independent-segment boundary; credit clipped to the enumerator-only line "(j)\n" | leading bare-enumerator handoff: credit advances through a formatting-only enumerator segment to the ONE substantive segment it introduces, then stops (semantic-accountability.v7) | UNACCOUNTED [4,43) "any Disposition of Property or business", [104,132) "which yields net proceeds to" | 0 unaccounted stretches, 0 uninventoried values over the same 12 frozen items |
| B quantitative | model kind outside the vocabulary → OTHER duplicate of a scanner-typed figure; Pass C matches OTHER only against TEXT | scanner authority: an OTHER-kind value whose located raw text scans to exactly one recognised figure is canonicalised to that kind/value/unit (`declaredKind` kept for audit); otherwise fail closed | 3 THRESHOLD items MISSING_FROM_COMPOSITION, "3 material values absent" although $25,000,000 and 1.5% are IR literals | the 3 THRESHOLD items REPRESENTED; materialQuantitativeValuesMissing 0 |
| C action | object-family regexes rebuilt without flags and without `i`; "Property" not an ASSET object; later cluster "issue or sell any shares" recorded | canonical-action-ontology.v2: case-insensitive object families; every reconstructed regex preserves the original's flags (`withFlags`) | inherited action INCOMPATIBLE ("issue or sell any shares", ONTOLOGY_GAP) → ACTION_INCONSISTENT_WITH_SOURCE_ACT → PARTIAL | "Dispose of any of its Property" → ASSET / SELL_ASSET, COMPATIBLE; sufficiency COMPLETE (the covenantFamily default remains a warning) |
| D timing | METRIC_REFERENCE normalization ignored the wire's `asOfDate` (accepted by the generic schema) with no diagnostic | compiler v10: a non-empty `asOfDate` on METRIC_REFERENCE is lifted into the existing AS_OF shape, typed from the metric, recorded as METRIC_REFERENCE_AS_OF_LIFTED (DIAGNOSTIC) | CTA metric reference with the selector only in provenance | AS_OF(METRIC_REFERENCE "Consolidated Total Assets", "date of such Disposition"), MONEY, inside the 1.5% alternative; present in the projection |

## What the replay does NOT claim

- compilation status stays REVIEW_REQUIRED: SEMANTIC_SUPPORT_REVIEW_REQUIRED (2 material single-run items;
  supportReviewRequired true; nothing corroborated offline). The three non-cash valuation FORMULA_COMPONENT items
  da2ae7a8…, cfa2c306…, 5e02c2d0… are no longer MISSING_FROM_COMPOSITION: Pass C maps the model's non-vocabulary
  `CONSUMED_IN_EXPRESSION` dispositions to UNSUPPORTED under the composition contract (still not structural IR —
  provenance only; see `docs/phase-3-reliability-composition-gaps/01-non-vocabulary-disposition-contract.md`)
- related-series aggregation: EXPLICIT_UNSUPPORTED_INTERIM_B (Pass C refuses false REPRESENTED via lineage;
  `docs/phase-3-reliability-composition-gaps/02-related-series-aggregation-decision.md` — additive IR A/C still deferred)
- the deterministic (j)/(x)/(y) enumeration signal still fires; it keeps its current disposition (NON_MATERIAL once the
  independent review does not confirm it) and still drives UNACCOUNTED_MATERIAL_SOURCE
- candidate certification stays REVIEW_REQUIRED: COMPILATION_NOT_COMPLETED + UNACCOUNTED_MATERIAL_SOURCE; only the false
  UNIT_SUFFICIENCY_INCOMPLETE blocker disappeared
- the replayed projection hash (07619a3e…) differs from the frozen one (88c138aa…) because the IR now carries AS_OF; it
  equals the hash recorded on the replayed verification
- gap re-inventory localRef schema reliability: CLOSED_OFFLINE (`localRefChars` 6→24, prompt v7 states bound, over-long handles coerced; see `docs/phase-3-reliability-composition-gaps/03-gap-call-localref-reliability.md`)

## Files

00 frozen inputs + hashes · 01 defect A · 02 defect B · 03 defect C · 04 defect D · 05 accountability before/after ·
06 verification before/after · 07 certification before/after · 08 residual genuine blockers · 09 replayed rule ·
10 replayed projection. Regression: `tests/contract-model/certified/live-7-5j-deterministic-replay.test.ts`.
