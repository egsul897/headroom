# ADR: Definition scope is not represented

**Status:** ACCEPTED (COO formal grant; docs-only architecture lock)
**Date:** 2026-10-07
**Track:** Track B DEFINITION (Phase 3). This file is that stamp. It does not amend the `OPERATIVE_SUBWINDOW` D1 or D2 locks already on this tip.
**Base:** main @ `62a40be22b9598d9732e9ce2574d86d2228d6270` (#122 MERGED).
**Terminal:** `DEFINITION_SCOPE_NOT_REPRESENTED`
**Runtime:** `AMBIGUOUS_TARGET` (fail closed)
**Arch invent-safe FROZEN sha256:** `b42f6cf1605096a8819dd91777ca58cb63d781b4fa0f9752211f1115cc370f35` (COO+Arch MATCH at this tip). CEO APPROVED. COO GRANTED.
**Does not authorize:** an amendment hunt; `WITH_BUILDERS` for this track; a definition-scope IR field, enum, or edge; production code; seal emit; a pin or pin folder; coercing `eligible: true`; a Phase-3 percentage raise; a `CERTIFIED` claim
**Related:**
- `docs/architecture/DUAL-DECLARATION-FAIL-CLOSED-AMBIGUOUS-ADR.md` — dual-declaration identity stays `AMBIGUOUS_TARGET`. This note does not amend that lock and does not turn it into a pin.
- `docs/phase-3-reliability-stratified-certification/p3-lane-a-definition-identity-1acdff3.md` — discovery census. Not reopened here.
- `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md` and `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md` — a different object (operative window / reclass representation). Not amended here.

Soft gate only. Invent-absence forever. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

This note cites the FROZEN sha256 above. It does not re-emit a reconstructed stamp body and does not recompute the hash.

---

## 1. Context

A definition's scope — an architecture object that would say which physical declaration, qualifier, or applicability boundary is the operative definition — is not represented. The Arch terminal for that absence is `DEFINITION_SCOPE_NOT_REPRESENTED`.

The runtime answer when the target is ambiguous is already fail-closed. `DefinitionEvidenceStatus` names `AMBIGUOUS_TARGET` as two or more real, colliding physical definitions or candidates, with no way to pick one without guessing, and the guess is never made (`lib/contract-model/compiler/amendment/operative-state.ts`). `DefinitionEvidenceAmbiguous` carries `outcome: "AMBIGUOUS"` and `status: "AMBIGUOUS_TARGET"`. The dual-declaration ADR already locks that refusal for a shared normalized key. This note does not add a selector on top of it.

Two nearby objects stay what they already are:

- **Governing scope** (`governing-scope-context.v1` in `lib/contract-model/compiler/semantic/governing-scope.ts`) is structural-ancestor lead-in context for a candidate. It is not a definition-scope representation, and this note does not extend it into one.
- **`OPERATIVE_SUBWINDOW`** names an operative window and, in D2, refuses a category-to-`targetRuleId` invent. That lock is not a definition-scope representation.

---

## 2. Decision

**`DEFINITION_SCOPE_NOT_REPRESENTED`.** Definition scope stays unrepresented. An ambiguous definition target fails closed as `AMBIGUOUS_TARGET`.

1. **No definition-scope object in this ADR.** Do not add a scope field, a scope enum, a scope edge, or a qualifier grammar that would choose a declaration. Absence is the represented answer. Invent-absence forever.

2. **Runtime stays `AMBIGUOUS_TARGET`.** When cardinality is ambiguous, evidence status stays `AMBIGUOUS_TARGET`, `isCurrentTruth` stays `false`, and no candidate body is served as current text. That is the existing fail-closed path. This ADR does not retune it.

3. **No amendment hunt.** Do not search amendment history, amendment effects, or supersession records in order to manufacture a scope or to break a tie this terminal has already refused. A later, separate invent-safe FROZEN would be required before any such search could be a granted method. This grant is not that FROZEN.

4. **No `WITH_BUILDERS` for this track.** This note does not introduce `WITH_BUILDERS`, does not mint a pin, does not edit `01-pin-matrix.json`, and does not coerce `eligible: true`. The pin HOLD recorded on the dual-declaration ADR stands. This file does not amend it.

5. **Docs only.** No production code. No IR invent. No seal emit. No pin. No percentage. No `CERTIFIED` claim.

6. **Generalized.** The same absence applies to every instrument and every term. A Chewy-only definition-scope exception is forbidden.

### Honesty bindings

- Fail closed. Invent-absence forever.
- **LOCK ≠ implement.** Stamping the terminal is not a grant to implement a scope model, to change `resolveOperativeDefinitionEvidence`, or to emit a seal.
- **IMPLEMENTED ≠ CERTIFIED.** A green soft-gate run is not certification credit. This docs lock is not a Phase-3 percentage raise.
- **PINNED_OFFLINE ≠ CERTIFIED.**
- No live/paid cert. No related-series A/C. No NS-4 Slice 3.

---

## 3. Consequences

**Positive:** Definition scope cannot be treated as an already-chosen representation. An ambiguous target cannot be read as permission to guess, to hunt an amendment, or to open `WITH_BUILDERS` from this track.

**Negative:** Colliding definitions stay unresolved. No scope object is supplied here that would make one of them current.

**Forbidden:** Treating this ADR as a grant to invent definition scope, to hunt amendments, to introduce `WITH_BUILDERS`, to mint a pin, or to claim `CERTIFIED`.

---

## 4. Out of scope

- Amendment-chain search, amendment-effect edits, and supersession changes
- `WITH_BUILDERS` derivation, pins, and `01-pin-matrix.json`
- Any edit under `lib/contract-model/`
- A new IR enum, edge, or definition-scope field
- Extending `governing-scope-context.v1` into a definition-scope selector
- Amending the dual-declaration ADR or either `OPERATIVE_SUBWINDOW` ADR
- Seal emit, Stage-1 markers, and `discoveryId` minting
- Phase-3 percentage, live/paid cert, NS-4, related-series A/C

---

## 5. Acceptance

- This file is the architecture lock at `docs/architecture/DEFINITION-SCOPE-NOT-REPRESENTED-ADR.md` with Status **ACCEPTED** under the COO formal grant.
- Base tip is `62a40be22b9598d9732e9ce2574d86d2228d6270`.
- Arch invent-safe FROZEN sha256 `b42f6cf1605096a8819dd91777ca58cb63d781b4fa0f9752211f1115cc370f35` is cited as the recorded COO+Arch MATCH. CEO APPROVED. COO GRANTED.
- Terminal is `DEFINITION_SCOPE_NOT_REPRESENTED`. Runtime fail-closed status is `AMBIGUOUS_TARGET`.
- No amendment hunt. No `WITH_BUILDERS` for this track. No IR invent. No pin. Soft gate. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.**
