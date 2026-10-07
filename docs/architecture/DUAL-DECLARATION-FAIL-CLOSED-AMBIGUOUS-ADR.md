# ADR: Dual-declaration fail-closed AMBIGUOUS_TARGET

**Status:** ACCEPTED (COO formal grant; docs-only architecture lock)
**Date:** 2026-10-07
**Base:** main @ `b44c3dc699d59a803e6fedcdd2c412b72dbef75a` (#114). Census evidence was taken at `1acdff345fff655f602fd61ff20c395028b6f140` and landed in that merge. This lock was rebound from that starting tip through #113 (`99a5a5fbd14e648a58d26434fd3d3c74815c4424`) onto #114. Those two merges are docs-only; the cited code lines are unchanged.
**Product lock:** `FAIL_CLOSED_AMBIGUOUS` (already stamped). Keep `AMBIGUOUS_TARGET`. No silent Subsidiary / Uniform Commercial Code pick. Chewy-only is forbidden.
**Does not authorize:** a resolver change; coercing `eligible: true`; minting a pin or a pin folder; a Phase-3 percentage raise; a `CERTIFIED` claim; live/paid cert; NS-4; related-series A/C
**Related:**
- `docs/phase-3-reliability-stratified-certification/p3-lane-a-definition-identity-1acdff3.md` (discovery; verdict `DEFINITION_IDENTITY_REQUIRES_ARCHITECTURE_DECISION`)
- `lib/contract-model/compiler/amendment/operative-state.ts` `resolveUniqueDefinitionByRef` / `resolveOperativeDefinitionEvidence`
- `lib/contract-model/compiler/semantic/tools.ts` `getDefinition`
- `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` `WITH_BUILDERS` pin HOLD
- Grant FROZEN sha256 `7a19614eee57bfe9f4a6e060b20cb22230fc5147728ede7743643dc43cf08e9d` (recorded MATCH). Invent-safe ALL Y. CEO APPROVE on record.

This ADR locks the dual-declaration contract. It does not choose which physical text is operative. Soft gate. Invent-absence forever. **LOCK ≠ GRANT** for implement. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

---

## 1. Context

Lane A enumerated two blocked Chewy cells at tip `1acdff3` and stopped at `DEFINITION_IDENTITY_REQUIRES_ARCHITECTURE_DECISION`. Both cells are `eligible: false` with blocker `UNRESOLVED_OPERATIVE_EVIDENCE`. Their only non-current definition dependencies are the same two terms, each matching two physical declarations in `doc-a`, with no recorded amendment history.

| Cell | discoveryId | sectionRef | eligible | pin |
| --- | --- | --- | --- | --- |
| BUILDER | `discovery-candidate:f62db8ebcda9d35c4fc03b2a` | `6.01(b)(4)(a)(i)` | `false` | none |
| ASSET_SALES | `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` | `6.05(a)(2)(c)` | `false` | existing folder stays `eligible: false` |

The discovery listed selectors the architecture does not contain: case as identity, dropping a nested proviso from cardinality, counting an `"A" or "B" shall mean` alias once, later-declaration-wins, both bodies jointly operative, equal-text collapse. Product lock `FAIL_CLOSED_AMBIGUOUS` is the decision those absences require: stay `AMBIGUOUS_TARGET`. Do not invent a selector.

Chewy `doc-a` is the recorded evidence. The contract is the cardinality rule. A Chewy-only patch is forbidden.

---

## 2. Evidence at this tip

Line numbers re-read on `b44c3dc699d59a803e6fedcdd2c412b72dbef75a`. Occurrence facts are the #114 census; this ADR does not re-copy definition bodies.

### 2.1 Cardinality path already refuses a pick

| Site | What it does on 2+ matches |
| --- | --- |
| `normalizeDefinedTermRef` (`lib/contract-model/compiler/amendment/chain.ts` L19–21) | Whitespace-collapse, trim, lowercase. Case is not a second key. |
| `resolveUniqueDefinitionByRef` (`operative-state.ts` L134–139) | Same `documentId` + same `normalizedTerm`, length ≥ 2 → `AMBIGUOUS` with every candidate. `nested` is not a filter. |
| `resolveOperativeDefinitionEvidence` Branch 2 (`operative-state.ts` L944–957) | `AMBIGUOUS` → outcome `AMBIGUOUS`, status `AMBIGUOUS_TARGET`, `candidateCount` disclosed, no text. Supersession is not consulted on this branch. |
| Branch 1 (`operative-state.ts` L915–925) | A real amendment view whose `targetResolutionStatus` is `AMBIGUOUS` → `FOUND` / `AMBIGUOUS_TARGET` / `text: null` / `isCurrentTruth: false`. |
| `evidenceStateFromResolution` (`context-retrieval/state.ts` L77) | Outcome `AMBIGUOUS` → `AMBIGUOUS_TARGET`, `isCurrentTruth: false`. Same vocabulary. |
| `getDefinition` tool (`semantic/tools.ts` L750–752) | Outcome `AMBIGUOUS` is refused. No candidate text is served. |
| `StructuralIndex.getDefinition` (`structural-index.ts` L482–485) | Document-scoped `.find()` returns the earliest `charStart`. Unscoped lookup is map last-write. Comments on the uniqueness primitive name this first-match as the collision the operative path must not use once cardinality is 2+. |

### 2.2 Recorded dual `means` pairs (Chewy `doc-a`, evidence only)

Shared reason shape: `term "<term>" matches 2 distinct physical definitions in document "doc-a", and it has no recorded amendment history to disambiguate it`.

| Term | Occurrences | Why neither is a winner |
| --- | --- | --- |
| `Subsidiary` (`subsidiary`) | S1 `charStart` 339816, declaration `“ subsidiary ” means`, full-text sha256 `f3b8e353bea7693e59265657131cf245c711a6afcd4900f0efcc5a2a3e13cb68`. S2 `charStart` 341757, declaration `“ Subsidiary ” means`, full-text sha256 `bb7c4e9a0308e0bbcd0865f7c1fdd8cd8ea9bb8c02c28ced79714fba97ff3bfc`. | Bodies differ. Case folds to one key. No supersession record. Neither is current. |
| `Uniform Commercial Code` | U1 `charStart` 354391, `nested: true`, full-text sha256 `f086bd238b67884d6df8ee9cda5bc42d5c474d15e378ec09f5f137f41e1bda34`. U2 `charStart` 354880, `nested: true`, full-text sha256 `c9c5494a61a2c745f98b8d87bc25c09ebc2d8ab07d67d4258ee678043d6251d3`. U2’s bytes are a suffix of U1’s slice, not the same declaration. | Both counted. `nested` does not drop either. The alias grammar’s second quoted alternative is not collapsed to one row. |

Query `UCC` is a different normalized key and is `NOT_FOUND` on this index. It is not a silent alias for `Uniform Commercial Code`.

Substring neighbors (`Restricted Subsidiary`, `Subsidiary Loan Party`, and the rest of discovery §A1.3) are different keys. They are not candidates for these two `AMBIGUOUS_TARGET` items.

Package inputs that do not break the tie: one credit agreement, zero relationship candidates, operative state with zero provisions and zero amendment effects, zero exhibit / schedule / annex nodes. `CONTEXT_BUDGET_EXCEEDED` is present on both bundles and is not an `eligibilityBlockers` entry. Eligibility remains `eligible === (eligibilityBlockers.length === 0)` (`scripts/stratified-cert/lib/emit-pin-packet.ts` L270–272).

---

## 3. Decision

**`FAIL_CLOSED_AMBIGUOUS`.** A dual declaration stays `AMBIGUOUS_TARGET`.

When two or more physical declarations in one document share one `normalizeDefinedTermRef` key — dual `means` / `shall mean` / `shall have the meaning` / `has the meaning`, including a case pair and a nested alias `shall mean` — and no amendment view disambiguates that key:

1. Evidence status stays `AMBIGUOUS_TARGET`.
2. `isCurrentTruth` stays `false`.
3. No candidate body is served as current text.
4. No silent pick of either physical declaration.

Applied to the recorded pair, with no new rule:

- Do not pick S1 or S2 for `Subsidiary`.
- Do not pick U1 or U2 for `Uniform Commercial Code`.
- Do not let either term stand in for the other.
- Do not resolve the collision by querying `UCC`.

The same rule applies to every instrument and every term. **Chewy-only is forbidden.** Citing `doc-a` does not authorize a special case for Chewy, for these two terms, or for this filing, and it does not authorize leaving `getDefinition`’s first-match in force anywhere else.

### Forbidden selectors

These remain absent. This ADR does not add them, and a later chunk must not treat them as already chosen:

| Absent selector | Why it is not invent-safe |
| --- | --- |
| Case-sensitive identity (`subsidiary` ≠ `Subsidiary`) | `normalizeDefinedTermRef` lowercases. The census shows one key and two bodies. |
| Drop `nested: true` from cardinality | U1 and U2 are both nested and are the two UCC candidates. `nested` is a span boundary, not precedence. |
| Count `"A" or "B" shall mean` once, from the first quote | The means-grammar keeps two `Uniform Commercial Code` rows. Collapsing them would be a new rule. |
| Later declaration wins, or earlier `.find()` wins | `getDefinition` earliest-`charStart` is the silent pick this lock forbids using as the operative answer. |
| Both bodies jointly operative | `DefinitionEvidenceStatus` has no dual-operative value. |
| Equal-text collapse | Not a rule in the resolver. These bodies are unequal anyway. |
| Alias `UCC` onto `Uniform Commercial Code` | Different normalized key. `UCC` is `NOT_FOUND` here. |

### Eligibility and pins

- Do not coerce `eligible: true` while either dependency is `AMBIGUOUS_TARGET`.
- BUILDER `discovery-candidate:f62db8ebcda9d35c4fc03b2a` stays unpinned, `eligible: false`, blocker `UNRESOLVED_OPERATIVE_EVIDENCE`.
- ASSET_SALES `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` keeps its existing pin folder and stays `eligible: false` with the same blocker. This ADR does not mint a pin, does not add a pin folder, and does not edit `01-pin-matrix.json`.
- Sibling `discovery-candidate:6ffcfd3794d39597caa7b83b` (§6.08) stays `AMBIGUOUS` and unpinned.
- No invented `discoveryId` or `sectionRef`.

### Honesty bindings

- Fail closed. Invent-absence forever.
- **LOCK ≠ GRANT** for a resolver implement. The refusal already in Branch 2 is the contract. Changing the resolver, the means-grammar, `nested` cardinality, or `getDefinition` is a different grant.
- **IMPLEMENTED ≠ CERTIFIED.** A green soft-gate run is not certification credit. This docs lock is not a Phase-3 percentage raise.
- **PINNED_OFFLINE ≠ CERTIFIED.**
- No live/paid. No related-series A/C. No NS-4 Slice 3. No SFG-1. No Rem H.

---

## 4. Consequences

**Positive:** Dual `means` collisions stay disclosed as `AMBIGUOUS_TARGET`. Subsidiary and Uniform Commercial Code cannot be silently chosen. A later pin or eligibility change cannot treat this ADR as permission to coerce `eligible: true`.

**Negative:** The two cells stay `eligible: false` until some future, separately granted rule exists in the amendment chain, the document graph, or source authority. This ADR does not supply that rule.

**Forbidden:** Treating this ADR as a grant to implement a resolver, to pick S1/S2/U1/U2, to coerce eligibility, or to mint a pin.

---

## 5. Out of scope

- Resolver implementation, including any edit under `lib/contract-model/`
- Means-grammar, alias, `nested`, or `normalizeDefinedTermRef` changes
- Coercing `eligible: true`
- Pin folders, `01-pin-matrix.json`, and stratified-cert scripts
- Context-budget changes
- Production code of any kind
- Phase-3 percentage, live/paid cert, NS-4, related-series A/C

---

## 6. Acceptance

- This file is the architecture lock at `docs/architecture/DUAL-DECLARATION-FAIL-CLOSED-AMBIGUOUS-ADR.md` with Status **ACCEPTED** under the COO formal grant.
- Base tip is `b44c3dc699d59a803e6fedcdd2c412b72dbef75a`.
- Decision is `FAIL_CLOSED_AMBIGUOUS`: stay `AMBIGUOUS_TARGET`; no silent Subsidiary or Uniform Commercial Code pick; Chewy-only forbidden.
- No resolver diff. No pin diff. No `eligible: true`. **IMPLEMENTED ≠ CERTIFIED.**
