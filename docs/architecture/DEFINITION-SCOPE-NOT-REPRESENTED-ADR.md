# ADR: Definition scope is not represented

**Status:** ACCEPTED (COO formal grant; docs-only architecture lock)
**Date:** 2026-10-07
**Track:** Track B DEFINITION (Phase 3). This file is that stamp. It does not amend the `OPERATIVE_SUBWINDOW` D1 or D2 locks already on this tip.
**Base:** main @ `62a40be22b9598d9732e9ce2574d86d2228d6270` (#122 MERGED).
**Campaign terminal:** `OUT_OF_PHASE3`. Rejects `MODEL_REQUIRED` for Phase 3.
**Gap name:** `DEFINITION_SCOPE_NOT_REPRESENTED` (stands).
**Runtime:** `AMBIGUOUS_TARGET` (fail closed; stands).
**Track5 Grant FROZEN:** `docs/architecture/PHASE-3-TRACK5-DEFINITION-SCOPE-TERMINAL.FROZEN.md`. sha256 of those bytes is `ec058193e9cae1c03494ef2ccc174a28b8a10a76cd003d316ea14977fdce7b10` (MATCH verifiable by recompute). CEO APPROVED. COO MATCH+GRANT.
**Track B Grant FROZEN:** `docs/architecture/PHASE-3-TRACK-B-DEFINITION.FROZEN.md`. sha256 of those bytes is `b42f6cf1605096a8819dd91777ca58cb63d781b4fa0f9752211f1115cc370f35` (MATCH verifiable by recompute). Unedited by this banner.
**Does not authorize:** a Phase-3 definition-scope model (`MODEL_REQUIRED`); an amendment hunt; `WITH_BUILDERS` for this track; a definition-scope IR field, enum, or edge; production code; seal emit; a pin or pin folder; coercing `eligible: true`; a Phase-3 percentage raise; a `CERTIFIED` claim
**Related:**
- `docs/architecture/PHASE-3-TRACK5-DEFINITION-SCOPE-TERMINAL.FROZEN.md` — campaign-terminal preimage. Do not edit. Digest is the sha256 of that file.
- `docs/architecture/PHASE-3-TRACK-B-DEFINITION.FROZEN.md` — gap-name preimage. Do not edit. Digest is the sha256 of that file.
- `docs/architecture/DUAL-DECLARATION-FAIL-CLOSED-AMBIGUOUS-ADR.md` — dual-declaration identity stays `AMBIGUOUS_TARGET`. This note does not amend that lock and does not turn it into a pin.
- `docs/phase-3-reliability-stratified-certification/p3-lane-a-definition-identity-1acdff3.md` — discovery census. Not reopened here.
- `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md` and `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md` — a different object (operative window / reclass representation). Not amended here.

Soft gate only. Invent-absence forever. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

Track5 grant-bound bytes are `docs/architecture/PHASE-3-TRACK5-DEFINITION-SCOPE-TERMINAL.FROZEN.md`. `sha256sum` of that file is `ec058193e9cae1c03494ef2ccc174a28b8a10a76cd003d316ea14977fdce7b10`. This ADR does not edit those bytes.

Track B grant-bound bytes are `docs/architecture/PHASE-3-TRACK-B-DEFINITION.FROZEN.md`. `sha256sum` of that file is `b42f6cf1605096a8819dd91777ca58cb63d781b4fa0f9752211f1115cc370f35`. This banner does not edit those bytes.

Recompute on the tip:

```text
sha256sum docs/architecture/PHASE-3-TRACK5-DEFINITION-SCOPE-TERMINAL.FROZEN.md
sha256sum docs/architecture/PHASE-3-TRACK-B-DEFINITION.FROZEN.md
```

---

## Campaign terminal (Track5)

**`OUT_OF_PHASE3`.** `MODEL_REQUIRED` is rejected for Phase 3, including any smallest generalized scope/authority IR model as a Phase-3 deliverable.

- Phase 3 does not include designing or implementing a definition-scope / authority-selector representation.
- The architecture gap name stays `DEFINITION_SCOPE_NOT_REPRESENTED`.
- Runtime stays `AMBIGUOUS_TARGET`, fail-closed, with no `eligible: true`. That is the Phase-3 product behavior, not a temporary HOLD awaiting a model.
- No amendment hunt. No Phase-3 model invent. Selector invent stays forbidden.
- A post-Phase-3 invent-safe FROZEN may later name a generalized scope/authority model. That is not a Phase-3 GRANT and is not implied by this terminal.
- Independent of the C1 seal and of C2 `PHASE3_CATEGORY_RECLASS_UNSUPPORTED`.

---

## 1. Context

A definition's scope — an architecture object that would say which physical declaration, qualifier, or applicability boundary is the operative definition — is not represented. The Arch terminal for that absence is `DEFINITION_SCOPE_NOT_REPRESENTED`.

The runtime answer when the target is ambiguous is already fail-closed. `DefinitionEvidenceStatus` names `AMBIGUOUS_TARGET` as two or more real, colliding physical definitions or candidates, with no way to pick one without guessing, and the guess is never made (`lib/contract-model/compiler/amendment/operative-state.ts`). `DefinitionEvidenceAmbiguous` carries `outcome: "AMBIGUOUS"` and `status: "AMBIGUOUS_TARGET"`. The dual-declaration ADR already locks that refusal for a shared normalized key. This note does not add a selector on top of it.

Two nearby objects stay what they already are:

- **Governing scope** (`governing-scope-context.v1` in `lib/contract-model/compiler/semantic/governing-scope.ts`) is structural-ancestor lead-in context for a candidate. It is not a definition-scope representation, and this note does not extend it into one.
- **`OPERATIVE_SUBWINDOW`** names an operative window and, in D2, refuses a category-to-`targetRuleId` invent. That lock is not a definition-scope representation.

---

## 2. Decision

**Campaign terminal `OUT_OF_PHASE3`.** The gap name stays `DEFINITION_SCOPE_NOT_REPRESENTED`. An ambiguous definition target fails closed as `AMBIGUOUS_TARGET`. `MODEL_REQUIRED` is not a Phase-3 path.

1. **No definition-scope object in this ADR.** Do not add a scope field, a scope enum, a scope edge, or a qualifier grammar that would choose a declaration. Absence is the represented answer. Invent-absence forever.

2. **Runtime stays `AMBIGUOUS_TARGET`.** When cardinality is ambiguous, evidence status stays `AMBIGUOUS_TARGET`, `isCurrentTruth` stays `false`, and no candidate body is served as current text. That is the existing fail-closed path. This ADR does not retune it.

3. **No amendment hunt.** Do not search amendment history, amendment effects, or supersession records in order to manufacture a scope or to break a tie. Tip dual-declaration cells have zero amendment effects that disambiguate. This is not a HOLD awaiting a Phase-3 model.

4. **No `WITH_BUILDERS` for this track.** This note does not introduce `WITH_BUILDERS`, does not mint a pin, does not edit `01-pin-matrix.json`, and does not coerce `eligible: true`. The pin HOLD recorded on the dual-declaration ADR stands. This file does not amend it.

5. **Docs only.** No production code. No Phase-3 model invent. No IR invent. No seal emit. No pin. No percentage. No `CERTIFIED` claim.

6. **Generalized.** The same absence applies to every instrument and every term. A Chewy-only definition-scope exception is forbidden.

### Honesty bindings

- Fail closed. Invent-absence forever.
- **LOCK ≠ implement.** `OUT_OF_PHASE3` is not a grant to implement a scope model in Phase 3, to change `resolveOperativeDefinitionEvidence`, or to emit a seal.
- **IMPLEMENTED ≠ CERTIFIED.** A green soft-gate run is not certification credit. This docs lock is not a Phase-3 percentage raise.
- **PINNED_OFFLINE ≠ CERTIFIED.**
- No live/paid cert. No related-series A/C. No NS-4 Slice 3.

---

## 3. Consequences

**Positive:** Definition scope cannot be treated as an already-chosen representation. An ambiguous target cannot be read as permission to guess, to hunt an amendment, or to open `WITH_BUILDERS` from this track.

**Negative:** Colliding definitions stay unresolved. No scope object is supplied here that would make one of them current.

**Forbidden:** Treating this ADR as a Phase-3 grant to invent a definition-scope model (`MODEL_REQUIRED`), to hunt amendments, to introduce `WITH_BUILDERS`, to mint a pin, or to claim `CERTIFIED`.

---

## 4. Out of scope

- Amendment-chain search, amendment-effect edits, and supersession changes
- `WITH_BUILDERS` derivation, pins, and `01-pin-matrix.json`
- Any edit under `lib/contract-model/`
- A Phase-3 definition-scope / authority-selector model (`MODEL_REQUIRED`)
- A new IR enum, edge, or definition-scope field
- Extending `governing-scope-context.v1` into a definition-scope selector
- Amending the dual-declaration ADR or either `OPERATIVE_SUBWINDOW` ADR
- Seal emit, Stage-1 markers, and `discoveryId` minting
- Phase-3 percentage, live/paid cert, NS-4, related-series A/C

---

## 5. Acceptance

- This file is the architecture lock at `docs/architecture/DEFINITION-SCOPE-NOT-REPRESENTED-ADR.md` with Status **ACCEPTED** under the COO formal grant.
- Base tip is `62a40be22b9598d9732e9ce2574d86d2228d6270`.
- Track5 Grant FROZEN path is `docs/architecture/PHASE-3-TRACK5-DEFINITION-SCOPE-TERMINAL.FROZEN.md`. sha256 of those bytes is `ec058193e9cae1c03494ef2ccc174a28b8a10a76cd003d316ea14977fdce7b10` (MATCH verifiable by recompute). CEO APPROVED. COO MATCH+GRANT.
- Track B Grant FROZEN path is `docs/architecture/PHASE-3-TRACK-B-DEFINITION.FROZEN.md`. sha256 of those bytes is `b42f6cf1605096a8819dd91777ca58cb63d781b4fa0f9752211f1115cc370f35` (MATCH verifiable by recompute). Those bytes are unedited.
- Campaign terminal is `OUT_OF_PHASE3`. `MODEL_REQUIRED` is rejected for Phase 3. Gap name `DEFINITION_SCOPE_NOT_REPRESENTED` stands. Runtime fail-closed status is `AMBIGUOUS_TARGET`.
- No amendment hunt. No Phase-3 model invent. No `WITH_BUILDERS` for this track. No IR invent. No pin. Soft gate. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.**
