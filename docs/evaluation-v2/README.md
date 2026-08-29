# Evaluation Methodology V2 — artifact index (Phase 3F.1.5)

An independent, evidence-preserving, semantic-correspondence-based evaluation system for
Headroom's contract-covenant analysis, built to replace a family of scorers that were proven
circular: they could grant coverage credit for a ground-truth legal/economic claim on the
strength of **structural proximity** (same section, descendant node, ancestor node, nearby
dollar figure, shared citation) rather than **semantic correspondence**.

**Central principle.** Coverage credit requires semantic correspondence. Structural proximity is
navigation evidence, never proof. The evaluator judges the system; the system is never altered to
satisfy the evaluator.

Implementation: `lib/contract-model/evaluation-v2/`
Tests: `tests/evaluation-v2/`
Regenerate everything: `npx tsx lib/contract-model/evaluation-v2/runner/run-all.ts`

---

## Artifacts

| File | What it is |
| --- | --- |
| `01-methodology-spec.json` | The full design as structured data: the four layers, the eight correspondence dimensions, every taxonomy, the credit policy, the numeric and qualitative rules, and the AI-judge contract. |
| `02-independence-matrix.json` | The dependency graph. What the evaluator may consume as *evidence*, what it must never consume as a *conclusion*, what it must never import, and how that is mechanically enforced. |
| `03-adversarial-suite-results.json` | 33 synthetic cases (21 negative controls, 12 positive controls), each isolating one semantic distinction. All drafting invented; nothing tuned to any real package. |
| `04-dsgr-unit-level-reconciliation.json` | Every one of the 1,016 DSGR ground-truth units with its V2 disposition and the evidence behind it, plus representative evidence packets by category. |
| `05-dsgr-old-vs-v2.json` | Unit-by-unit comparison against both historical scorers' own recorded conclusions, including each scorer's credit mechanism stated explicitly. |
| `06-known-false-credit-reconciliation.json` | The mandatory 26-case table. Every scorer-artifact-corrected case re-judged independently, with the specific candidates that carried the old credit re-evaluated by forced pairing. Carries the phase gate. |
| `07-dsgr-v2-aggregate-metrics.json` | Aggregates, computed only after unit-level evidence was frozen. Every percentage carries its numerator and denominator unit ids. |
| `09-cross-dataset-generalization.json` | The same frozen engine run unchanged against FWRG, LSB and CONMED, with an explicit engine-freeze disclosure. |
| `10-ground-truth-quality-audit.json` | Ground-truth quality verdicts, the adjudication-provenance finding, and five recorded production defect observations that were **not fixed**. |
| `11-reproducibility-and-cost.json` | Fresh-run vs replay hashes, the difference report, and the honest cost record. |
| `12-diff-classification.json` | Every file this phase created, classified, derived from the actual working-tree status. |
| `_stratified-sample-for-second-pass.json` | **Blinded** evidence packets for the independent second-pass adjudicator. Contains no V2 disposition. |
| `_stratified-sample-v2-labels-SEALED.json` | **Sealed.** This evaluator's own labels for that sample. Not to be shown to the reviewer before their review is complete. |

`08-second-pass-adjudication.json`, `13-remaining-evaluation-risks.json` and
`14-phase-3f1-5-final-verdict.json` are deliberately absent: 08 belongs to the independent
second-pass adjudicator, 13 and 14 to the orchestrator afterwards.

---

## How credit is granted

A candidate must clear **two** independent gates.

1. **Semantic correspondence.** The four core dimensions — subject/action, legal posture,
   object/resource — must affirmatively correspond, and no material conflict may exist on
   breadth, entity scope, economics, conditions/exceptions or operative provenance. An
   *indeterminate* reading withholds credit; it never grants it.
2. **Accounting role.** The corresponding candidate must be a **substantive representation**.
   A discovery candidate that correctly describes a covenant but was never compiled is an
   inventory finding, not a representation. Correspondence without representation is not credit.

The dimension the historical scorers had no concept of is **provision breadth**: a universal
restriction ("no Loan Party will … any Indebtedness, except: …") and one enumerated carve-out
beneath it ("(b) Indebtedness of any Borrower owing to any Restricted Subsidiary …") are
different legal claims even when they share a section number, a covenant family, a governed
action and most of their vocabulary. Every historically-confirmed false credit in this
repository's forensic record is exactly that substitution.

## Reading the numbers

Two coverage dimensions are reported separately and never collapsed:
`representationStatus` (is the claim represented?) and `semanticCorrectness` (is the
representation right?). A compiler that honestly says `UNSUPPORTED` is poor executability and
good safety behaviour; it never scores the same as a silent omission.

`DANGEROUS_UNACCOUNTED_SEMANTIC_UNIT_V2` counts a CRITICAL/MATERIAL claim that is neither
represented nor honestly surfaced — where "honestly surfaced" requires the flag to sit on a
candidate that **actually represents the claim**. A flag on an unrelated neighbouring provision
counts for nothing. That qualifier is the whole difference from the historical metric.
