# Live Corpus Quality Gate — Report

**Verdict:** `LIVE_CORPUS_QUALITY_GATE_RECORDED_WITH_DEFECTS`

**Head SHA (at generation):** `cebec8ab3aaecd894b1903ac0b758828655a88df`
**Branch:** `cursor/live-corpus-quality-gate-7f51`
**Paid calls:** `0`
**Certification impact:** `NONE`
**Claude-owned fixtures modified:** `false`
**Production legal rules modified:** `false`

## Scope

First real EDGAR batch: **gibraltar-2026-credit-agreement**
Stratified authentic sample: gib-doc-a, sup-doc-a, sup-doc-b, sup-doc-c
Authentic documents: 4 | Synthetic: 0

## Layer separation (do not collapse)

| Layer | PASS | FAIL | UNVERIFIED |
|---|---:|---:|---:|
| infrastructure | 7 | 0 | 0 |
| extraction | 4 | 6 | 2 |
| legally_verified | 11 | 2 | 14 |

## Dimension rollup

| Dimension | PASS | FAIL | UNVERIFIED |
|---|---:|---:|---:|
| source_integrity | 6 | 0 | 0 |
| structural_completeness | 1 | 1 | 2 |
| definition_completeness | 2 | 1 | 2 |
| negative_covenant_discovery | 2 | 0 | 1 |
| exception_and_condition_recall | 2 | 0 | 2 |
| cross_reference_completeness | 0 | 2 | 1 |
| amendment_authority | 3 | 2 | 0 |
| entity_scope_recognition | 1 | 0 | 2 |
| false_affirmative_capacity | 0 | 1 | 2 |
| provenance_correctness | 4 | 1 | 0 |
| unresolved_and_unsupported_semantics | 1 | 0 | 4 |

## Highest-risk omissions → production agent

### LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT [CRITICAL]

Available Amount Builder Basket citation marker conflict (7.05(a)(y) vs printed (vi))

- Sample: `gib-doc-a`
- Dimension: `cross_reference_completeness`
- Blocks legal verification: true
- Repro:
  1. Search extracted text for 'Available Amount Builder Basket'
  1. Observe definition: 'has the meaning specified in Section 7.05(a)(y)'
  1. Observe operative prong excerpt in natural-search.json builder_grower tightestRef 7.05(a)(4)(ii)(vi)(B)
  1. Confirm parenthetical still says 'clause (y)' beside printed (vi)
- Expected: Leave cross-reference UNRESOLVED or dual-cite with REVIEW_REQUIRED; never force a unique resolved target that prefers compiler path over source disagreement.
- Observed: Filed HTML disagrees with itself; compiler path matches neither clean legal citation.

### LCQG-GIB-FALSE-AFFIRM-SHARED-CAP [CRITICAL]

Pass A shared_cap over-fires on 'aggregate amount' (51 hits) without shared baskets

- Sample: `gib-doc-a`
- Dimension: `false_affirmative_capacity`
- Blocks legal verification: true
- Repro:
  1. Confirm extracted text has zero occurrences of the phrase 'shared capacity'
  1. Load structure/pass-a-shared-cap.json — length 51
  1. Spot-check excerpts: nearly all are EBITDA add-back 'aggregate amount' provisos
  1. Contrast with real 'Restricted Payment Reallocated Amount' reallocation term (not a shared pool)
- Expected: Do not emit affirmative shared-capacity / combined-headroom conclusions from aggregate-amount pattern matches alone.
- Observed: Deterministic shared_cap signal mass-fires; treating hits as shared baskets would create false affirmative capacity.

### LCQG-SUP-AMEND-RESTATES-MISSING [CRITICAL]

SUP doc-b RESTATES doc-a never surfaced (classifier whitespace / newline defect)

- Sample: `sup-doc-b`
- Dimension: `amendment_authority`
- Blocks legal verification: true
- Repro:
  1. Read docs/final-lightweight-unseen.md §4 (doc-b classified CREDIT_AGREEMENT; zero RESTATES)
  1. Confirm doc-b caption in extracted-text contains 'AMENDED AND RESTATED' with possible newline before 'CREDIT AGREEMENT'
  1. Confirm independent GT claims C2 + D1 in docs/final-lightweight-unseen/07-targeted-ground-truth.json
  1. Re-check document-classifier AMENDED_AND_RESTATED pattern for whitespace tolerance
- Expected: Classify doc-b as AMENDED_AND_RESTATED_AGREEMENT and surface RESTATES→doc-a (or honest REVIEW_REQUIRED), never silent omission.
- Observed: Wrong high-confidence CREDIT_AGREEMENT classification; relationship candidate absent entirely (dangerous silence).

### LCQG-GIB-STRUCT-AMBIGUOUS-TOC [HIGH]

Gibraltar TOC duplication yields AMBIGUOUS bare section refs

- Sample: `gib-doc-a`
- Dimension: `structural_completeness`
- Blocks legal verification: true
- Repro:
  1. Load tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt
  1. Re-run parseDocumentStructure + buildStructuralIndex (or inspect structure/health-summary.json)
  1. Observe AMBIGUOUS_LEGAL_REFERENCE / DUPLICATE_LABEL_EXPECTED / DUPLICATE_NORMALIZED_PATH each = 306
  1. Call resolveUniqueNodeByRef('7.04') — expect AMBIGUOUS (TOC line + operative body)
- Expected: Prefer long-span operative body nodes for Article VII (as operative-article-vii.json already records) and never silently pick TOC stubs as operative text.
- Observed: Bare labels are AMBIGUOUS; consumers that ignore span length can bind to TOC stubs.

### LCQG-GIB-XREF-LOW-RESOLVE [HIGH]

Gibraltar cross-reference resolve rate ~33.7% (968 unresolved)

- Sample: `gib-doc-a`
- Dimension: `cross_reference_completeness`
- Blocks legal verification: true
- Repro:
  1. Read structure/structure-summary.json referencesDetected/Resolved/Unresolved
  1. Confirm 1459 detected, 491 resolved, 968 unresolved
  1. Note TOC duplication contributes AMBIGUOUS targets for many bare refs
- Expected: Unresolved material references must remain explicit UNRESOLVED / REVIEW_REQUIRED — never silently dropped or force-bound to TOC stubs.
- Observed: Majority of detected references remain unresolved after structural indexing.

### LCQG-GIB-DISC-706-NO-PASSA [MEDIUM]

§7.06 Burdensome Agreements operative chapeau carries zero Pass A signals

- Sample: `gib-doc-a`
- Dimension: `negative_covenant_discovery`
- Blocks legal verification: false
- Repro:
  1. Inspect structure/section-pass-a.json entries with sectionRef=7.06 and ownChars>~40
  1. Observe signals=[] on operative Burdensome Agreements chapeau
  1. Compare to §7.02 which carries exception_marker/permitted_construct/covenant_verb/headline_heading
- Expected: Negative covenant sections without headline-friendly verbs must still be discoverable (e.g. via article membership + heading taxonomy), not only Pass A signal fire.
- Observed: Pass A silent on §7.06 chapeau; section still present in operative-article-vii via structure.

### LCQG-GIB-PROV-PAGE-FURNITURE [MEDIUM]

Embedded PDF/HTML page furniture in operative §7.08 text window

- Sample: `gib-doc-a`
- Dimension: `provenance_correctness`
- Blocks legal verification: false
- Repro:
  1. Slice extracted text using operative-article-vii.json offsets for 7.08
  1. Observe standalone '249' line inside the financial covenants window
- Expected: Strip or flag page furniture so citations/excerpts do not treat page numbers as operative legal text.
- Observed: Page number survives into the operative span used for downstream discovery.

## Outstanding gaps

- Exhaustive Gibraltar Article I definition inventory lacks independent counsel GT (spot-checks only).
- Gibraltar Pass B/C/D semantic extraction never ran — condition/exception IR population UNVERIFIED.
- Superior definition/condition/entity dimensions marked UNVERIFIED for fresh legal verification in this unpaid gate.
- Knife River BLIND body remains unread and is excluded from the sample.
- False-affirmative capacity legally verified rate cannot be computed without certified capacity answers on DEVELOPMENT package.
- No production legal rules or certification status were changed by this gate.

## Reproducible commands

```bash
npm run live-corpus-quality-gate
npx tsx scripts/live-corpus-quality-gate/run.ts
npx vitest run tests/live-corpus-quality-gate/
```
