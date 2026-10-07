# ADR: OPERATIVE_SUBWINDOW D2 fail-closed representation

**Status:** ACCEPTED (COO formal grant; docs-only architecture lock)
**Date:** 2026-10-07
**Base:** main @ `82a91cfa2bbb03a2722727125e909215ab96d2d4` (#120 MERGED). D1 naming landed in #119 (`7683a14697dceaa264ac97268e4909d45725bbb5`) as `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md`. This lock does not amend that file.
**Arch decision:** D2 fail-closed. Category → `targetRuleId` invent is FORBIDDEN. No `RECLASSIFIABLE_TO` edge from category labels alone. No new IR enum or edge type in this ADR.
**HOLD:** `OPERATIVE_SUBWINDOW` seal implement remains HOLD. FREEZE_NOT_READY honesty sha256 `2e2b988eebb3e164cf909c0bbfed2834529cd3fb1a96686a40fc0fc2fa8dc13a`. This ADR does not implement seal emit.
**Does not authorize:** production seal code; a Stage-1 marker; a `discoveryId`; a `stage2b` edit; a structural node; a pin or pin folder; a `RECLASSIFIABLE_TO` edge; a new IR enum or edge type; a Phase-3 percentage raise; a `CERTIFIED` claim
**Related:**
- `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md` — ADR #119, Arch D1 naming only. D2 was deferred there.
- `lib/contract-model/ir/types.ts` `IRRuleDependency`
- `docs/phase-4c/08-reclassification-model.json`
- Grant FROZEN sha256 `5d57282b684816d26c82c60c345054121b01f0587e1a8c231b347cbf8116a41c` (recorded MATCH). Invent-safe ALL Y. CEO APPROVE on record.

This ADR locks the D2 representation refusal. It does not emit a window, mint an identity, or choose an IR edge. Soft gate. Invent-absence forever. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

---

## 1. Context

ADR #119 named the generalized seal contract `OPERATIVE_SUBWINDOW` (requirements 1–6) and deferred D2. D2 is whether a category-to-category automatic reclassification is representable by anything other than `IRRuleDependency { relationshipType, targetRuleId, description }`.

The recorded sentence names categories, not rule ids. Mapping those categories onto `targetRuleId` invents targets. This ADR answers that mapping with a refusal. It does not name a replacement representation.

A Chewy-only span is not an answer. Corroboration passages stay corroboration.

---

## 2. Evidence at this tip

Line numbers re-read on `82a91cfa2bbb03a2722727125e909215ab96d2d4`. Sentence facts are the #119 ADR. This file does not re-copy the span table.

### 2.1 The dependency shape requires a rule id

`IRRuleDependency` on this tip is `relationshipType`, `targetRuleId`, `description`, and optional `inventoryItemIds` (`lib/contract-model/ir/types.ts` L693–699). `targetRuleId` is `string`. It is a rule identity, not a category label.

Phase 4C records that a `RECLASSIFIABLE_TO` edge is that shape, carries no amount, no effective date, and no direction constraint, and that execution never auto-elects (`docs/phase-4c/08-reclassification-model.json`). An edge is read from a recorded relationship. It is not inferred from a name or a section number.

### 2.2 The sentence does not name rule ids

The #119 ADR records the Chewy sentence at half-open `[392815, 393488)`. That sentence names the categories "Fixed Amounts" and "the applicable Incurrence-Based Amounts". It does not name basket rule ids. `RECLASSIFIABLE_TO` occurrences in `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json` on this tip: 0.

Filling SOURCE / DEST / TRIGGER / TIMING / CONDITIONS / CAPACITY / RESTORE / ANTI-DUP / AUTO_OR_ELECTIVE / PROSPECTIVE_OR_RETRO from those labels would invent IR fields. This ADR does not fill them.

### 2.3 Corroboration stays corroboration

The #119 ADR recorded the same owned-span pattern on CONMED §7.2, CONMED §7.3, Chewy §6.01, and Chewy §6.08, and refused to promote those passages to identities. This ADR does not reopen them. They are not granted edges here.

---

## 3. Decision

**Fail closed on D2.** Category labels are not rule ids. This ADR does not mint a representation that would make them so.

1. **Category → `targetRuleId` invent FORBIDDEN.** Do not map "Fixed Amounts" / "Incurrence-Based Amounts" (or any category label) onto basket rule ids without evidence-bound rule identity.

2. **No `RECLASSIFIABLE_TO` edge from category labels alone.** An edge requires a recorded relationship whose `targetRuleId` is an evidence-bound rule identity. Labels are not that identity. Edge count may stay 0.

3. **No new IR enum or edge type in this ADR.** `ContractRuleRelationshipType` is not extended here. A generalized representation that is not `targetRuleId` is not named here. It exists only if a later, separate invent-safe FROZEN names it.

4. **`OPERATIVE_SUBWINDOW` seal implement remains HOLD.** D1 named the contract. Naming is not an emit. Implementation stays HOLD until a future invent-safe GRANT after D2 is either (a) evidence-bound rule ids exist, or (b) Arch stamps a separate generalized representation FROZEN. FREEZE_NOT_READY honesty sha256 `2e2b988eebb3e164cf909c0bbfed2834529cd3fb1a96686a40fc0fc2fa8dc13a`. This ADR does not implement seal emit.

5. **Docs only.** No production seal code. No Stage-1 marker. No `discoveryId`. No pin. No percentage raise. No `CERTIFIED` claim.

6. **Generalized.** The same refusal applies to every category-to-rule invent. A Chewy-only exception is forbidden. Corroboration passages stay corroboration.

### Honesty bindings

- Fail closed. Invent-absence forever.
- **LOCK ≠ implement.** This docs lock is not a grant to emit the seal, to write an edge, or to add an IR enum.
- **IMPLEMENTED ≠ CERTIFIED.** A green soft-gate run is not certification credit. This docs lock is not a Phase-3 percentage raise. Formal Phase-3 percentage stays where the board left it.
- **PINNED_OFFLINE ≠ CERTIFIED.**
- No live/paid cert. No related-series A/C. No NS-4 Slice 3.

---

## 4. Consequences

**Positive:** Category labels cannot be treated as `targetRuleId` values. A later implementer cannot treat ADR #119's deferred D2 as permission to invent basket targets or a `RECLASSIFIABLE_TO` edge from "Fixed Amounts" and "Incurrence-Based Amounts".

**Negative:** The sentence still has no IR identity. `RECLASSIFIABLE_TO` may stay 0. The seal stays unimplemented.

**Forbidden:** Treating this ADR as a grant to implement the seal, to mint a pin, to invent a marker, to invent a reclassification edge, or to add an IR enum.

---

## 5. Out of scope

- Production seal code, including any edit to `candidate-span.ts`, `stage-structure.ts`, `clause-hierarchy.ts`, or Pass C
- Seal emit of any kind
- Stage-1 marker invention
- `discoveryId` mint, `stage2b` edits, and manufactured structural nodes
- Pin folders and `01-pin-matrix.json`
- A new `ContractRuleRelationshipType` value or any other new IR enum or edge type
- Mapping category labels onto basket rule ids
- Promoting CONMED §7.2, CONMED §7.3, Chewy §6.01, or Chewy §6.08 to identities
- Amending ADR #119's requirements 1–6
- Phase-3 percentage, live/paid cert, NS-4, related-series A/C

---

## 6. Acceptance

- This file is the architecture lock at `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md` with Status **ACCEPTED** under the COO formal grant.
- Base tip is `82a91cfa2bbb03a2722727125e909215ab96d2d4`.
- Decision is Arch D2 fail-closed: category → `targetRuleId` invent is FORBIDDEN; no `RECLASSIFIABLE_TO` edge from labels alone; no new IR enum in this ADR.
- ADR #119 remains D1 naming only. This chunk does not implement the seal.
- Seal implement remains HOLD. FREEZE_NOT_READY honesty sha256 `2e2b988eebb3e164cf909c0bbfed2834529cd3fb1a96686a40fc0fc2fa8dc13a`.
- Docs only. No pin. Soft gate. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.**

---

## 7. Architect FROZEN body

Grant FROZEN sha256 `5d57282b684816d26c82c60c345054121b01f0587e1a8c231b347cbf8116a41c` matches the body below (LF, one trailing newline). Invent-safe ALL Y. CEO APPROVE on record. The body is the grant text. The lock is §§1–6.

```text
# PHASE-3-OPERATIVE-SUBWINDOW-D2-FAIL-CLOSED — invent-safe FROZEN (docs ADR only)

**Tip:** `82a91cfa2bbb03a2722727125e909215ab96d2d4` (#120 MERGED)
**Checked:** 2026-10-07T16:08:00Z
**Verdict:** invent-safe ALL Y — docs ADR only — LOCK ≠ seal implement GRANT

## Residual
ADR #119 D1 named `OPERATIVE_SUBWINDOW` and deferred D2: whether category-to-category automatic reclassification is representable by anything other than `IRRuleDependency { relationshipType, targetRuleId, description }`. Sentence names categories, not rule ids. Mapping categories → `targetRuleId` invents targets.

## Proposed FROZEN chunk (CEO APPROVE → COO GRANT → Cursor docs)
Write `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md` (or extend with a D2 section file) that **locks fail-closed**:

1. **Category → `targetRuleId` invent FORBIDDEN.** Do not map "Fixed Amounts" / "Incurrence-Based Amounts" (or any category label) onto basket rule ids without evidence-bound rule identity.
2. **No `RECLASSIFIABLE_TO` edge** from category labels alone. Edge count may stay 0.
3. **No new IR enum / edge type in this ADR** unless a separate invent-safe FROZEN names a generalized non-`targetRuleId` representation later.
4. **OPERATIVE_SUBWINDOW seal implement remains HOLD** until a future invent-safe GRANT after D2 is either (a) evidence-bound rule ids exist, or (b) Arch stamps a separate generalized representation FROZEN.
5. Docs only. No production seal code. No Stage-1 marker. No `discoveryId`. No pin. No % raise. No CERTIFIED claim.
6. Generalized — not Chewy-only. Corroboration passages stay corroboration.

## Invent-safe 5-part (docs ADR)
| Part | Y/N |
|---|---|
| Tip-bound residual named | Y — D2 deferred on ACCEPTED #119 ADR at tip |
| Generalized | Y — fail-closed policy for all category→rule invent |
| No invent | Y — refusal ADR; does not mint IR/edge/pin |
| Docs-only path | Y — `docs/architecture/**` |
| No CERTIFIED / eligible / pin claim | Y |

**ALL Y? YES** for docs ADR only. Soft gate; invent-absence forever; IMPLEMENTED ≠ CERTIFIED; LOCK ≠ implement.
```
