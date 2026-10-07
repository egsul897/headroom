# Lane D — CONMED §7.5(a) exact discrepancy

Analysis only. Soft gate. invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

No pin. No pin folder. No new condition type. No section-specific branch. Missing pin is not the blocker.

| Field | Value |
|---|---|
| Tip | `1acdff345fff655f602fd61ff20c395028b6f140` |
| Candidate | `discovery-candidate:baca43714b8502cc9c596c23` |
| Instrument | CONMED Eighth A&R Credit Agreement, `conmed-doc-a-eighth-ar-credit-agreement` |
| Section | §7.5(a) |
| Role | EXCEPTION (sealed discovery, `definedTermDependencyLikely: false`) |
| Rule | `ir-rule:b752bbaf461e4c3b704300d2` |
| Compile | `REVIEW_REQUIRED` / `SEMANTIC_ACCOUNTABILITY_INCOMPLETE` (`semantic-accountability-compiler.v4`, prompt v5) |
| Verify | `MATERIAL_DISCREPANCY` (`phase-3c-semantic-verifier.v1`) |
| Open findings | MATERIAL `MISSING_CONDITION` `82ce660a…c14d784`; UNCERTAIN `MISSING_DEPENDENCY` `ca99bcbc…86030c5c` |
| Lane givens accepted, not re-scored | sealed UNIQUE; offline emitter `eligible:true`; no pin folder |

Evidence: `docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:baca43714b8502cc9c596c23.json`.

---

## SOURCE CLAUSE

Operative text (confirmed current; sha256 `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0`):

> (a) the Disposition of obsolete or worn out property in the ordinary course of business;

Parent chapeau (context, not this unit’s owned proposition), Section 7.5 Limitation on Sale of Assets:

> Dispose of any of its Property or business (including receivables and leasehold interests), whether now owned or hereafter acquired, or, in the case of any Subsidiary, issue or sell any shares of such Subsidiary’s Capital Stock to any Person, except:

The clause is one enumerated permission. It states two independent restrictions, conjoined:

1. **Object.** What may be disposed of is obsolete or worn out property. The word in the clause is lowercase `property`. It is not the defined term `Property`.
2. **Manner.** The disposition occurs in the ordinary course of business.

`Disposition` is capitalized, so it is the defined term. The clause names no dollar cap, ratio, cross-reference, or proviso of its own. It ends at the semicolon.

---

## CURRENT IR

One rule. Posture `PERMISSION`. Rule type `EXCEPTION`. Sufficiency `COMPLETE`. Capacity `UNLIMITED_CAPACITY` with `gatedBy: null`.

Wire values the closed enums rejected, and what the normalizer wrote:

| Wire | Normalized |
|---|---|
| `covenantFamily` `ASSET_DISPOSITIONS` | `QUALITATIVE_NEGATIVE_COVENANTS` |
| `action` `DISPOSE_OF_PROPERTY` | `OTHER` |
| `conditionType` `ORDINARY_COURSE_OF_BUSINESS` | `UNSUPPORTED` |
| `dependsOn[0].relationshipType` `EXCEPTION_TO` | `REQUIRES`, then parked as unresolved because `Section 7.5` is not a rule in this compilation unit |

The only condition:

- `conditionId`: `rule[r7-5a].condition[0]`
- `conditionType`: `UNSUPPORTED`
- `expression`: `null`
- `description`: “The exception for the Disposition of obsolete or worn out property applies only if the disposition occurs in the ordinary course of business”
- `provenance.excerpt`: `in the ordinary course of business`
- lineage: `inv-item:71d2743d5ead0525735ab015`

`dependsOn` is empty. `definitions` is empty. `irExtensionCandidates` is empty. `exceptions` is empty.

The description’s “only if” attaches to ordinary course. “Obsolete or worn out property” sits inside the noun phrase that names the exception. It is not its own condition, not an `UNSUPPORTED` expression, and not the condition’s excerpt. `gatedBy` does not carry it. `action: OTHER` does not carry it.

Compiler notes claim the ordinary-course qualifier plus unlimited capacity “faithfully captures its full operative economics,” and that both critical inventory items (the permission, and the ordinary-course condition) were consumed.

---

## EXPECTED FROM EXISTING CONTRACT

The licensed contract already says how a qualitative permission with no dollar ceiling is written. None of the following is a new kind, and none of it is a §7.5(a) rule.

From `lib/contract-model/compiler/semantic/prompt.ts`:

- A basket with no dollar ceiling is `UNLIMITED_CAPACITY`. When a boolean test gates it, that test is `gatedBy`, not a fabricated amount.
- Conditions and exceptions are first-class. A material condition is not folded into free-text notes. Conjunction is `AND`, not one description string.
- A component the node types cannot compute is `kind: "UNSUPPORTED"` (`semanticDescription`, `reason`, `sourceEvidence`). That node may sit anywhere an expression is expected. Using it is the safe answer. Inventing a `kind` is not.
- Sufficiency is `PARTIAL` when a real component is `UNSUPPORTED`. `COMPLETE` over that component is a wrong claim.
- A defined term the clause uses, whose defining text is outside the operative window, stays a `DEFINED_TERM_REFERENCE`. A `WireDefinition` is emitted only when the defining text is inside the operative window.
- A cross-unit relationship uses a real `ContractRuleRelationshipType`. An enumerated exception to a general prohibition is `EXCLUDED_FROM` (`lib/contract-model/compiler/stage-relationships.ts`). `EXCEPTION_TO` is not in the enum (`prisma/schema.prisma`); the normalizer rewrites an unrecognized relationship to `REQUIRES`.

From `lib/contract-model/ir/types.ts`:

- `IRCondition.expression` may be `null` when the condition is real and material and not yet reducible to a boolean expression.
- `IRUnsupportedExpression` is mechanically never executable (`requiredReview: true`). It preserves the claim so a consumer cannot treat the component as absent.

From `CONTRACT_CONDITION_TYPES` (`lib/contract-model/types.ts`, mirrored in `ContractConditionType`):

`NO_DEFAULT`, `RATIO_SATISFIED`, `MINIMUM_LIQUIDITY`, `MATERIAL_ACQUISITION`, `RATING_STATUS`, `ENTITY_TYPE`, `SECURITY_SCOPE`, `PURPOSE`, `ACQUISITION_CONTEXT`, `REFINANCING_CONTEXT`, `REINVESTMENT_PERIOD`, `TIME_PERIOD`, `AMOUNT_THRESHOLD`, `OTHER_RULE_SATISFIED`, `UNSUPPORTED`.

No member names a property-character test. `PURPOSE`, `ENTITY_TYPE`, and `SECURITY_SCOPE` are different predicates. Mapping “obsolete or worn out” onto one of them would invent a meaning. `normalize.ts` already fail-closes an unrecognized `conditionType` to `UNSUPPORTED`.

The shape the existing contract requires for this clause:

- `UNLIMITED_CAPACITY`.
- `gatedBy` is an `AND` of two non-executable boolean nodes, one per independent restriction:
  - object: the property disposed of is obsolete or worn out (`sourceEvidence` / excerpt `obsolete or worn out property`);
  - manner: the disposition is in the ordinary course of business (`sourceEvidence` / excerpt `in the ordinary course of business`).
- Each node is `kind: "UNSUPPORTED"` with `requiredReview: true`, and/or a sibling `IRCondition` with `conditionType: "UNSUPPORTED"`, `expression: null`, its own description, and its own excerpt. The object restriction is its own node.
- Sufficiency is `PARTIAL`.
- `Disposition`, the capitalized term in the operative text, is a `DEFINED_TERM_REFERENCE`. The definition body stays on the definition’s own unit.
- The parent-prohibition link, if emitted, is `EXCLUDED_FROM` targeting the source reference `Section 7.5`, unresolved across units, not a copied chapeau rule.

`docs/architecture/MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md` splits the two failures already visible here. Invented labels (`ORDINARY_COURSE_OF_BUSINESS`, `EXCEPTION_TO`, `ASSET_DISPOSITIONS`, `DISPOSE_OF_PROPERTY`) are emitter contract violations. An honest `UNSUPPORTED` node is the licensed residual when a qualitative test has no computable primitive. This unit did the first and skipped the second for the object restriction.

---

## MISSING CONDITION

The property disposed of under §7.5(a) must be obsolete or worn out.

That restriction is absent as a modeled gate. The ordinary-course restriction is present as `conditions[0]`, typed `UNSUPPORTED` because the wire label was not in the enum, with excerpt `in the ordinary course of business`.

Finding `82ce660a63258d57f778551fb7ec2ded12514afb0e310b704a5b9ea70c14d784`:

- `findingType`: `MISSING_CONDITION`
- `severity`: `MATERIAL`
- `resolutionStatus`: `OPEN`
- `irPath`: `rules[0].conditions`
- `verificationMethod`: `SEMANTIC_ONLY` (no deterministic signals)

The verifier’s counterexample holds for the structured fields: a sale of new, non-obsolete equipment in the ordinary course satisfies the only modeled condition and is outside the source exception.

---

## MISSING DEPENDENCY

Finding `ca99bcbc49fce9df8ab2548f5a7dbdc7c66a7621122d35070f745d2f86030c5c`:

- `findingType`: `MISSING_DEPENDENCY`
- `severity`: `UNCERTAIN`
- `resolutionStatus`: `OPEN`
- `irPath`: `rules[0].dependsOn; definitions`

The verifier reads the absence of the `Disposition` and `Property` definition bodies from `dependsOn` and `definitions[]` as a possible gap, and marks it uncertain because the IR may assume the reader still has the source definitions.

What the operative clause and the existing contract support:

- `Disposition` is used as a defined term. The expected carrier is `DEFINED_TERM_REFERENCE`. The current rule has none. The definition text was retrieved as context; it is not inside the operative window, so a `WireDefinition` on this unit is not what source-ownership requires.
- Lowercase `property` in clause (a) is not the defined term `Property`. The defined term appears in the chapeau (`any of its Property`). Importing that definition as a dependency of (a) is the uncertain step. Discovery recorded `definedTermDependencyLikely: false`.
- The unresolved edge that does exist is the parent link: wire `EXCEPTION_TO` / `Section 7.5`, stored as `REQUIRES` / “not a rule in this compilation unit.” That is the prohibition/exception relationship. The licensed type for it is `EXCLUDED_FROM`. It is not the `Disposition` or `Property` definition body.

This finding stays open and uncertain. It is not the material discrepancy. Copying either definition into this unit would not state the obsolete-or-worn-out restriction, and it would put defining text this operative window does not contain onto the rule.

---

## WHY MATERIAL

The structured permission is an unlimited capacity with no gate, one condition whose excerpt and “only if” are ordinary course, and sufficiency `COMPLETE`.

The source permission is the conjunction of an object class and a manner. Dropping the object class widens an uncapped carve-out from obsolete or worn out property to whatever property a consumer will accept once ordinary course is met. The verifier’s example is the widening: new equipment, sold in the ordinary course, is not §7.5(a).

`COMPLETE` asserts that the widening is not a gap. The verifier prompt treats a confident wrong representation as more serious than an honest `PARTIAL`.

The ordinary-course node being `UNSUPPORTED` does not cure this. That node models the manner. It does not model the object class. The pin folder’s absence does not create or remove the widening.

---

## EXISTING IR VOCAB

The closed condition-type list and the closed expression-kind list cannot name “obsolete or worn out property” as a computable predicate. Evaluation-v2’s condition tags likewise have `ORDINARY_COURSE_REQUIRED` and no property-character tag. That absence is not a license to add one.

The licensed vocabulary can carry the restriction as a non-executable first-class gate:

- `IRCondition` with `conditionType: "UNSUPPORTED"`, `expression: null`, its own description, and excerpt `obsolete or worn out property`; and
- `UNLIMITED_CAPACITY.gatedBy` holding that test in an `AND` with the ordinary-course test, each operand `kind: "UNSUPPORTED"`.

A consumer of that shape cannot execute the gate and cannot treat it as missing. Sufficiency stays `PARTIAL`. No new enum value is required to stop the over-permission. Inventing `OBSOLETE_OR_WORN_OUT`, stretching `PURPOSE`, or special-casing this section is outside the contract (`invent-absence`).

The current unit does not use that carry. It folds the object class into the ordinary-course condition’s description, leaves `gatedBy` null, and marks `COMPLETE`.

---

## Terminal

`GENERALIZED_REPRESENTATION_DEFECT`
