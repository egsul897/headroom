# 11 - Governing scope, action semantics and source-reference fidelity closure

Starting SHA `f10b61195dcdb595eb094e82a2951faf81343685`. Zero paid calls. The final live validation evidence under
`docs/phase-3-live-validation/7.2c-rerun-projection-v1/` is immutable (26 files, sha256-pinned by
`tests/fixtures/phase-3-live-replay/7.2c-rerun-projection-v1/evidence-manifest.json`); the two earlier live evidence
directories stay pinned by their own suites.

## The three live findings and their generic causes

| finding | live symptom | generic defect |
|---|---|---|
| F1 action ontology | reviewer: "Section 7.2 prohibits create / incur / assume / suffer to exist; the IR encodes only INCUR_DEBT" | the canonical action category was emitted with no source-backed evidence of the literal act it represents; nothing told the verifier that `action` is a category, not a quotation |
| F2 entity scope | model emitted "Parent Borrower" + "Restricted Subsidiary"; the v2 guard refused the second tag (by design) and reset the scope to `[]` | the compiler never saw the Article-level applicability preamble: the parser produced no Article VII node, so `retrieveParentScope` (non-ARTICLE ancestors only) stopped at §7.2; applicability was left to the model |
| F3 source-reference expansion | source: "the financial covenants contained in Section 7.1"; model emitted 7.1(a), (b), (c), (d) | the normalizer accepted any model-emitted target reference; nothing compared it with the reference the source drafts |

## The repair (general, agreement-agnostic)

### Governing scope is a structural chain (`governing-scope.ts`, `governing-scope-context.v1`)
`resolveGoverningScope` walks the candidate's real ancestor chain and admits, per ancestor, only its OWN lead-in (own
text through the first child enumerator; descendants and sibling economics never enter). A heading-only ancestor
("ARTICLE VII NEGATIVE COVENANTS") carries no governing material and is not a region. When no ARTICLE node contributes
governing material, the document text immediately preceding the first section of the article group is read and its
trailing paragraph block is admitted as an `UNPARSED_ARTICLE_PREAMBLE` region only when it is a lead-in (ends in a
colon), carries a governing posture phrase and is not a defined-term declaration. Every region carries document,
structural node (null for an unparsed preamble), section ref / article-group label, exact span, ancestor distance and a
sha256; the context carries a `contentHash` that enters the compile cache identity and the semantic source contract.
Roles: `PARENT_SCOPE` (distance 1) and `GOVERNING_SCOPE` (farther / article level); `OPERATIVE_SOURCE` is untouched and
the regions never enter `sourceContext`, Pass A inventory or unit ownership.

Evidence derivation is mechanical: posture phrases, entity binding signals (the guard's own vocabulary mapped onto the
fixed `EntityClassTag` enum; a phrase the enum cannot name exactly leaves `inheritedEntityScope` null - never guessed)
and the governing act (action ontology). On the live agreement the chain is §7.2 (own lead-in) + the unparsed Article
preamble; it establishes `BORROWER + ANY_SUBSIDIARY`, `INCUR_DEBT` and the governing prohibition.

### Entity-scope precedence (`entity-scope-consistency-guard.v3`)
own operative actor language > authenticated governing-scope actor language > model-emitted scope. A source-derived
scope outranks an unrecognized or contradictory model scope (`status SOURCE_SCOPE_DERIVED`, `precedence`,
`modelDiscrepancy` with the raw tags preserved); without an authenticated source the v2 fail-closed behaviour stands. A
new mention role `CONDITION_SUBJECT` ("the Borrower shall be in compliance") joins `MEASUREMENT_CONTEXT`: neither binds
applicability. No `RESTRICTED_SUBSIDIARY` enum was added; an unqualified source "Restricted Subsidiary" denotes exactly
`GUARANTOR_RS + NON_GUARANTOR_RS` under the existing lattice.

### Canonical action vs source act (`action-ontology.ts`, `canonical-action-ontology.v1`)
`ContractAction` stays compact. `classifySourceAction` reads the governing verb cluster + object and assigns the one
canonical category (or MIXED_CATEGORIES / ONTOLOGY_GAP); `assessActionCompatibility` judges the proposed action. The
literal source breadth is preserved on the unit as `inheritedAttributes[{attribute:"action", evidence, canonicalValue,
compatibility, sourceSpan}]`; an INCOMPATIBLE act (guarantee / prepay / lien grant proposed as INCUR_DEBT) limits the rule
and is never re-mapped by guess.

### Source references are source identity (`source-reference-fidelity.ts`, `source-reference-fidelity.v1`)
The references the candidate's own text states (absolute, lists, relative clauses, structurally resolved ranges) plus
agreeing Pass A lineage form the stated set; every emitted target is classified EXACT / SOURCE_EQUIVALENT_NORMALIZATION /
MODEL_NARROWED (excluded, restored to the drafted whole reference) / MODEL_BROADENED (excluded, restored to the drafted
sub-clauses) / MODEL_INVENTED (excluded, rule limited) / UNVERIFIABLE (kept, rule limited). The raw references live only
in the unit's non-authoritative `sourceReferenceAudit`. Whole-section references stay whole on the candidate; the package
resolver (`p3-package-dependency-resolution.v2`) owns one-to-many expansion (`bindingMode ONE_TO_MANY_EXPANSION`), binds
exception conditions too, and reports `TARGET_SET_REVIEW_REQUIRED` when a target-set candidate anchored inside the
referenced provision produced no units.

### Diagnostics are not sufficiency
Normalization warnings now carry a class. Safely quarantined model output (restated target economics, excluded model
expansions, an outranked unrecognized tag) is DIAGNOSTIC: recorded on the compilation (`normalizationDiagnostics`) and in
certification warnings, never in `sufficiencyReasons`. Contamination that survives in an authoritative field still fails
closed through numeric reconciliation / grounding. Identity policy: diagnostics are deliberately outside the semantic
artifact - changing "80%" to "81%" in excluded prose changes the diagnostic, never the unit (tested).

### Layer 1 / Layer 2
`phase-3c-ir-inventory.v2` inventories SOURCE_DEPENDENCY, CROSS_RULE_TARGET, EVALUATION_BASIS and INHERITED_ATTRIBUTE
items; `phase-3c-source-inventory.v3` inventories the source's SECTION_REFERENCE items (self-references and references
inside separately-owned child spans excluded); reconciliation accounts a stated reference once, listing the edge and the
gate together, and raises one MISSING_DEPENDENCY / unsupported-reference signal otherwise. The reviewer
(`phase-3c-semantic-verifier.v4`, prompt v3, projection v2) is shown the governing chain as authenticated context, the
inherited attributes with canonical values, the governing-scope derivation in the audit and the reference audit labelled
non-authoritative; the prompt explains the generic contracts only.

## Live-equivalent replay (offline, frozen final live submission)

| axis | BEFORE (frozen f10b611) | AFTER (same submission, repaired machinery) |
|---|---|---|
| action | INCUR_DEBT, no evidence | INCUR_DEBT + inherited action evidence "Create, incur, assume or suffer to exist any Indebtedness" (PARENT_SCOPE 7.2, COMPATIBLE) |
| entityScope / audit | `[]`, UNRECOGNIZED_TAG | `[BORROWER, ANY_SUBSIDIARY]`, SOURCE_SCOPE_DERIVED (GOVERNING_SCOPE article-group:7), raw "Restricted Subsidiary" preserved as MODEL_UNRECOGNIZED discrepancy |
| referencesRuleTargets | 7.1(a), (b), (c), (d) | `Section 7.1` (resolved, two owners, unbound); 7.1(a)-(d) in the audit as MODEL_NARROWED_REFERENCE |
| sourceDependencies | REQUIRES 7.3(g), REQUIRES 7.1 | unchanged |
| sufficiency / reasons | PARTIAL (unrecognized tag ×2, target economics) | COMPLETE; the three events are diagnostics |
| Layer 1 | ACTION, POSTURE, CONDITION, UNLIMITED marker | + SOURCE_DEPENDENCY ×2, CROSS_RULE_TARGET (7.1), EVALUATION_BASIS, INHERITED_ATTRIBUTE ×3; both stated references ACCOUNTED_FOR |
| scripted Layer 2 | WRONG_ACTION, WRONG_ENTITY_SCOPE, WRONG_DEPENDENCY | no finding |
| candidate | REVIEW_REQUIRED | REVIEW_REQUIRED for the upstream Phase-2 reason only (COMPILATION_NOT_COMPLETED / OPERATIVE_STATE_UNACCEPTABLE / VERIFICATION_NOT_CLEAN with 0 findings) |

`testingPeriod` stays null: the source states no period beyond the one embedded in `deemedEffectiveAt`; the invariant is
documented on `IRConditionEvaluationBasis`.

## Versions
semantic-accountability-compiler.v6 / prompt.v7; entity-scope-consistency-guard.v3; governing-scope-context.v1;
canonical-action-ontology.v1; source-reference-fidelity.v1; phase-3c-ir-inventory.v2; phase-3c-source-inventory.v3;
phase-3c-semantic-verifier.v4 / prompt.v3; phase-3c-verification-projection.v2; p3-package-dependency-resolution.v2;
semantic source contract sscv1 -> sscv2 (governing regions bound). IR schema unchanged (additive optional fields:
`IRInheritedAttribute.canonicalValue/compatibility/sourceSpan/ancestorDistance`, `IRRule.sourceReferenceAudit`, audit
`precedence/modelDiscrepancy/diagnostics`, signal role CONDITION_SUBJECT). Phase 4 runtime untouched.

## Not changed
Certification logic (no blocker weakened); Phase 2 fixtures and the operative-state adapter; Phase 4 semantics; the
historical live evidence. No production module names the live agreement, its sections or its figures (scanned by test).
