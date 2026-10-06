# Composition contract: non-vocabulary inventory dispositions → UNSUPPORTED

**Gate:** Phase 3 reliability step 1 (composition-contract remediation for representable gaps).
**Branch base:** `phase3-7-5j-trust-boundary-seal` @ `b101812` (A/B seal not reopened; algorithm stays `semantic-accountability.v8`).
**Scope:** Pass C deterministic reconciliation only. Zero provider calls. No IR shape change. No NS-4.

## Defect (documented live residual)

On CONMED §7.5(j), Pass B dispositioned the three non-cash valuation `FORMULA_COMPONENT` items
(`inv-item:da2ae7a8…`, `cfa2c306…`, `5e02c2d0…`) as `CONSUMED_IN_EXPRESSION` — a string **outside** the
stated vocabulary (`INTENTIONALLY_NON_COMPUTATIONAL | UNSUPPORTED | AMBIGUOUS`), with no lineage.

Pass C's `normalizeDisposition` returned `null` for unknown labels, so the items fell through to
`MISSING_FROM_COMPOSITION` even though the composition **named** them. Semantic assessment
(`16-semantic-assessment.json`) already recorded this as a false silence: the model should have marked
`UNSUPPORTED`; the IR carries valuation only in bound provenance, not as structure.

## Remediation

In `lib/contract-model/compiler/semantic-accountability/reconciliation.ts`:

- Vocabulary dispositions pass through unchanged.
- Self-declared `REPRESENTED` still rejected (lineage/value correspondence only).
- Any other non-empty disposition string → **`UNSUPPORTED`**, with the raw label preserved on
  `modelDisposition` and an explicit reason naming the non-vocabulary contract.

Effect on the frozen §7.5(j) offline replay: those three items become
`UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION`; `INVENTORY_ITEM_MISSING_FROM_COMPOSITION` drops;
`SEMANTIC_SUPPORT_REVIEW_REQUIRED` and related-series residual remain (gap-localRef closed in 03).

## Out of scope (this chunk)

- Inventing IR for related-series aggregation (needs a design decision — see
  `02-related-series-aggregation-decision.md`).
- Pass-A gap-call `localRef` reliability → closed in `03-gap-call-localref-reliability.md`.
- Prompt / wire-schema vocabulary tightening (optional follow-up; Pass C now fail-soft honestly).
- Paid / live §7.5(j) re-run.
