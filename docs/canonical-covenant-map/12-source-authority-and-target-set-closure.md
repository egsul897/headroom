# 12 - Source authority, qualified target-set and shard parity closure

Starting SHA `c9bc7842e8f1696794d13319700e52565d5efe84`. Zero paid calls; §7.2(c) not rerun; the live evidence directories
stay immutable (sha256-pinned by their suites); Phase 2 fixtures, the operative-state adapter and Phase 4 runtime untouched.

## The four defects and their generic causes

| defect | before | generic cause |
|---|---|---|
| SA-1 model reference authority | Pass A `referencedSections` were the model's words; the candidate fidelity guard admitted a reference as "stated" when the frozen inventory lineage listed it | a model field could create source authority with no independent proof the reference exists in the source |
| SA-2 qualified whole-section references | "the financial covenants contained in Section 9.1" bound one-to-many to EVERY unit under §9.1 | the qualifier the source drafts around the reference was never read; package binding expanded the whole subtree |
| SA-3 shard parity | normalization diagnostics, dependency prose, context-only emissions and invalid wire kinds were dropped by the sharded path; the bounded monolithic path normalized against the pipeline's original input (no governing scope, no witness regions, no inventory lineage) and let DIAGNOSTIC-class warnings make a COMPLETE unit REVIEW_REQUIRED | the two execution paths carried different safety signals into the same canonical assembly |
| SA-4 false certification wording | dependency prose said the target's semantics "are owned by its own certified unit" | deterministic Phase-3 prose asserted a status that is unknown at candidate compile time |

## The repair (general, agreement-agnostic)

### One deterministic citation scanner (`compiler/source-reference-scan.ts`, `source-reference-scan.v1`)
`scanSourceReferences(text, {baseSectionRef, index, documentId})` is the only citation grammar: relative clause references
("clause (b) of this Section 9.1", resolved against the base section; "clauses (a) through (d)" expanded only through the
structural index's children, else UNRESOLVED_SELECTOR), absolute `Section(s)` / `§` heads with token lists, explicit lists
and ranges. Every scanned reference carries its literal span (the first list member's span starts at the head keyword, so an
inventory item ending on "Section" still claims the reference by overlap) and a source-derived `selector`. The candidate
fidelity guard, the Pass A inventory and the Layer 1 source inventory all call it.

### Source authority hierarchy (SA-1)
Authoritative references come from exactly three paths: a literal authenticated span, a deterministically resolved relative
reference, or a deterministically expanded explicit range. There is no fourth path:
- `semantic-accountability.v6`: an inventory item's `referencedSections` are the scanner's references inside the item's own
  span (a reference straddling two spans belongs to both). The model's values are kept beside them as
  `declaredReferencedSections` with a per-claim `referenceAudit` (CORROBORATED / MODEL_INVENTED_REFERENCE /
  MODEL_NARROWED_REFERENCE / MODEL_BROADENED_REFERENCE, plus `omittedBySource`); the REFERENCE semantic function is derived
  from the source-grounded set only. Item identity follows the version; the ensemble still replays frozen v5 passes.
- `source-reference-fidelity.v2`: the stated set is the text scan only - the inventory-lineage fallback is removed (lineage
  can corroborate, never create). A section-shaped reference the non-empty source never states is MODEL_INVENTED (excluded,
  rule limited) even when the source states no reference at all; only an absent operative text leaves a reference
  SOURCE_REFERENCE_UNVERIFIABLE.

### Source-derived target selector (SA-2)
`IRSourceTargetRef.selector` ({sourceText, kind, qualifierText}) is read from the text immediately preceding the reference
head: the LAST determiner-headed noun phrase before "contained in / set forth in / described in / referred to in / required
under / ..." (the phrase admits no determiner, auxiliary or clause-joining word, so "shall be in compliance with the
covenants contained in" yields "covenants contained in"). "subject to Section 9.1" is WHOLE_PROVISION; "Sections 9.1(a),
9.1(c) and 9.1(d)" is an EXPLICIT_SUBCLAUSE_SET; an unexpandable range is UNRESOLVED_SELECTOR. Model prose never reaches
the selector; the candidate never pre-selects target rules.

`p3-package-dependency-resolution.v3`: a one-to-many expansion must satisfy the selector. A QUALIFIED_RULE_SET maps the
qualifier onto a small generic classification table (financial covenants -> FINANCIAL_COVENANTS / RATIO_TEST, asset sales,
restricted payments, investments, liens, indebtedness, reporting, notices, baskets) and binds only the units whose
independently compiled family / rule type satisfies it (`bindingMode QUALIFIED_ONE_TO_MANY`, `selectorResolution` with the
selected and excluded units). An unsupported or ambiguous qualifier, an UNRESOLVED_SELECTOR, or a qualifier no unit satisfies
fails closed: `TARGET_SELECTOR_REVIEW_REQUIRED`, nothing bound, not executable. The subtree-coverage safeguard
(TARGET_SET_REVIEW_REQUIRED) still precedes selection. Package certification v3 blocks with
`DEPENDENCY_TARGET_SELECTOR_REVIEW_REQUIRED` (severity REVIEW); no existing dependency gate was weakened. The verified
candidate unit is never mutated during binding (tested by serialization before / after).

### Shard parity (SA-3)
`NormalizationDiagnosticRecord` {diagnosticId, shardId, sourceUnit, scope, code, message}: identity is sha256 over
candidate | shard | source unit | scope | code | message (no timestamp, no counter); `sourceUnit` is the rule's
sourceSectionRef / definition's term resolved from the normalization's own scope->unit map, independent of any
composition-relative index. Each shard result carries `normalization` {diagnostics, dependencyProseDiagnostics,
contextOnlyEmissions, invalidWireKinds} stamped with its shard; the stitcher aggregates them in plan order, deduplicating
only by diagnostic identity; `compile.ts` assembles them onto the sharded result exactly where the monolithic path puts them;
a completed shard's SEMANTIC_WIRE_KIND_INVALID reason reaches the whole unit.

Two monolithic-side defects surfaced by the parity fixture were fixed in the same closure:
- `compileBoundedComposition` now normalizes against the caller input (the resolved compilation unit's text, its source
  context, the frozen inventory and the governing scope) - exactly what a shard already received. Before, the production
  MONOLITHIC path normalized against the pipeline's original input and silently dropped the governing-scope precedence,
  the witness regions and the source-grounded inventory lineage (the live replay suite had supplied them explicitly on its
  input, which is why mission 11 did not see it; the §7.2(c) candidate runs MONOLITHIC under the certified policy).
- DIAGNOSTIC-class warnings no longer enter the monolithic unit's `unresolvedIssues` (the sharded path never counted them),
  so quarantined model output is a diagnostic on both paths and never by itself makes a COMPLETE unit REVIEW_REQUIRED.
- The entity-scope witness now finds a cited unit's lead-in at the very start of a text (a sharded primary slice).

### Status-neutral dependency prose (SA-4)
`describeSourceDependency`: "requires that the terms of Section X are satisfied; the semantics of Section X are separately
owned and resolved at package level" / "is limited by Section X; the limit's semantics are separately owned and resolved at
package level". The target-economics diagnostic, the compiler prompt (v8) and the verifier prompt (v4) use the same
status-neutral wording; the projection (v3) carries the selector on every target. The reviewer-bias regression asserts the
projection and the verifier user content never state that a target is certified / verified / valid / correct.

## Live-equivalent replays (offline, frozen final live evidence)
- §7.2(c) candidate: action INCUR_DEBT, entityScope BORROWER + ANY_SUBSIDIARY, source dependencies 7.3(g) (WHOLE_PROVISION)
  and 7.1, cross-rule target "Section 7.1" with selector QUALIFIED_RULE_SET "financial covenants contained in", pro forma
  evaluation basis intact, unit sufficiency COMPLETE, status-neutral descriptions; scripted Layer 2 finds nothing.
- Pass A replay over the frozen five items: the authoritative references 7.3(g) and 7.1 are recovered from the source text
  with the model's `referencedSections` present, removed, or with "Section 99.99" injected into every item (every injection
  is a MODEL_INVENTED_REFERENCE claim; the authoritative set is unchanged).

## Versions
semantic-accountability.v6 (inventory; ensemble replays v5); source-reference-scan.v1 (new); source-reference-fidelity.v2;
semantic-accountability-compiler.v7 / prompt.v8; phase-3c-semantic-verifier prompt.v4 (algorithm v4 unchanged);
phase-3c-verification-projection.v3; p3-package-dependency-resolution.v3; phase3-package-certification.v3; entity-scope
guard v3, governing-scope-context.v1, canonical-action-ontology.v1, ir-inventory.v2, source-inventory.v3, sscv2 and the IR
schema unchanged (additive optional `IRSourceTargetRef.selector`, `NormalizationDiagnosticRecord.sourceUnit`,
`SemanticInventoryItem.declaredReferencedSections / referenceAudit`).

## Not changed
Certification logic (no blocker weakened; one blocker added); Phase 2 fixtures and the operative-state adapter; Phase 4
runtime semantics; Phase 4E; the historical live evidence. No production module names the live agreement, its sections or its
figures (scanned by test over every module this closure touched).
