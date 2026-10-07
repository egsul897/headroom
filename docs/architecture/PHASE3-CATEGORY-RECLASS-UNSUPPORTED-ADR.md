# ADR: PHASE3_CATEGORY_RECLASS_UNSUPPORTED

**Status:** ACCEPTED (COO formal grant; docs-only architecture stamp)
**Date:** 2026-10-07
**Base:** tip `62a40be22b9598d9732e9ce2574d86d2228d6270` (#122 MERGED). D2 fail-closed is already locked in `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md`. This note stamps the terminal disposition of that residual. It does not reopen the fail-closed lock.
**Arch decision:** **PHASE3_CATEGORY_RECLASS_UNSUPPORTED**. Arch EXECUTE. CEO APPROVED. COO GRANTED.
**Grant FROZEN sha256:** `b9666774438368088899fb8a2cfe2846f958175c8ab61462ebad6ce5f4466bae` (COO+Arch MATCH at this tip).
**Supersedes:** voided FROZEN prefix `23da0fcc…` and the voided label `EXISTING_IR_SUFFICIENT`. That label is not the disposition.
**Rejected terminal path:** `GENERALIZED_CATEGORY_RECLASS_MODEL_REQUIRED`.
**Does not authorize:** an IR enum mint; a new edge type; a `RECLASSIFIABLE_TO` write; a category → `targetRuleId` invent; a seal emit; a pin or pin folder; a Phase-3 percentage raise; a `CERTIFIED` claim; a generalized category-reclass model
**Related:**
- `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md` — D2 fail-closed. Category → `targetRuleId` invent is FORBIDDEN.
- `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md` — D1 naming only. Seal implement stays HOLD.
- D2 grant FROZEN sha256 `5d57282b684816d26c82c60c345054121b01f0587e1a8c231b347cbf8116a41c` (prior MATCH). This note does not replace that body.

Soft gate. Invent-absence forever. **LOCK ≠ implement.** **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

---

## 1. Context

D2 refused to represent category-to-category automatic reclassification by mapping category labels onto `IRRuleDependency.targetRuleId`. The recorded sentence names categories, not rule ids. Filling `targetRuleId` from those labels invents targets. Edge count may stay 0.

A voided FROZEN (prefix `23da0fcc…`) carried the label `EXISTING_IR_SUFFICIENT` for this residual. That label is void. Existing `IRRuleDependency` shape is a rule-id edge. It is not a category-to-category representation, and this note does not declare it sufficient.

`GENERALIZED_CATEGORY_RECLASS_MODEL_REQUIRED` would make a new generalized category-reclass model the way the residual closes. Arch rejected that code as the terminal path.

---

## 2. Decision

**Terminal disposition: `PHASE3_CATEGORY_RECLASS_UNSUPPORTED`.**

1. **Category-to-category reclassification, absent evidence-bound rule ids, is unsupported.** The disposition code is `PHASE3_CATEGORY_RECLASS_UNSUPPORTED`. Cite grant FROZEN sha256 `b9666774438368088899fb8a2cfe2846f958175c8ab61462ebad6ce5f4466bae`.

2. **`GENERALIZED_CATEGORY_RECLASS_MODEL_REQUIRED` is rejected as the terminal path.** This residual does not close by commissioning a generalized category-reclass model. Invent-absence forever includes that model.

3. **`EXISTING_IR_SUFFICIENT` is void.** Do not stamp the voided FROZEN prefix `23da0fcc…` or the label `EXISTING_IR_SUFFICIENT` as the disposition. The superseding label is `PHASE3_CATEGORY_RECLASS_UNSUPPORTED`.

4. **D2 fail-closed stands.** Category → `targetRuleId` invent remains FORBIDDEN. No `RECLASSIFIABLE_TO` edge from category labels alone. No new IR enum or edge type. This note does not write an edge.

5. **Seal implement stays HOLD.** D1 named `OPERATIVE_SUBWINDOW`. This stamp does not emit the seal, does not lift FREEZE_NOT_READY, and does not treat unsupported category reclass as a seal grant. FREEZE_NOT_READY honesty sha256 `2e2b988eebb3e164cf909c0bbfed2834529cd3fb1a96686a40fc0fc2fa8dc13a`.

6. **Docs only.** No production code. No Stage-1 marker. No `discoveryId`. No `stage2b` edit. No pin. No percentage raise. No `CERTIFIED` claim.

7. **Generalized refusal.** The same unsupported disposition applies to every category-to-category invent that lacks evidence-bound rule identity. A Chewy-only exception is forbidden. Corroboration passages stay corroboration.

### Honesty bindings

- Fail closed. Invent-absence forever.
- **LOCK ≠ implement.** This docs stamp is not a grant to emit the seal, to write an edge, to mint an IR enum, or to build a category-reclass model.
- **IMPLEMENTED ≠ CERTIFIED.** A green soft-gate run is not certification credit. This docs stamp is not a Phase-3 percentage raise. Formal Phase-3 percentage stays where the board left it.
- **PINNED_OFFLINE ≠ CERTIFIED.**
- No live/paid cert. No related-series A/C. No NS-4 Slice 3.

---

## 3. Consequences

**Positive:** The residual has one terminal label. A later reader cannot treat `EXISTING_IR_SUFFICIENT` as current, and cannot treat `GENERALIZED_CATEGORY_RECLASS_MODEL_REQUIRED` as the path that closes it. D2's refusal to invent `targetRuleId` values from category labels stays in force.

**Negative:** The sentence still has no IR identity. `RECLASSIFIABLE_TO` may stay 0. The seal stays unimplemented. Unsupported is the disposition.

**Forbidden:** Treating this note as a grant to implement the seal, to mint a pin, to invent a marker, to write a `RECLASSIFIABLE_TO` edge, to add an IR enum or edge type, to map category labels onto basket rule ids, or to open a generalized category-reclass model as the terminal path.

---

## 4. Out of scope

- Production seal code and any edit outside `docs/architecture/**` for this stamp
- IR enum mint and new edge types
- `RECLASSIFIABLE_TO` writes and category → `targetRuleId` mapping
- A generalized category-reclass model
- Restoring voided FROZEN prefix `23da0fcc…` or the label `EXISTING_IR_SUFFICIENT`
- Pin folders and `01-pin-matrix.json`
- Phase-3 percentage, live/paid cert, NS-4, related-series A/C
- A `CERTIFIED` claim

---

## 5. Acceptance

- This file is the architecture stamp at `docs/architecture/PHASE3-CATEGORY-RECLASS-UNSUPPORTED-ADR.md` with Status **ACCEPTED** under the COO formal grant.
- Base tip is `62a40be22b9598d9732e9ce2574d86d2228d6270`.
- Decision is Arch EXECUTE **PHASE3_CATEGORY_RECLASS_UNSUPPORTED**.
- Grant FROZEN sha256 `b9666774438368088899fb8a2cfe2846f958175c8ab61462ebad6ce5f4466bae` (COO+Arch MATCH at this tip). CEO APPROVED. COO GRANTED.
- `GENERALIZED_CATEGORY_RECLASS_MODEL_REQUIRED` is rejected as the terminal path.
- Voided FROZEN prefix `23da0fcc…` and the label `EXISTING_IR_SUFFICIENT` are superseded.
- D2 fail-closed is unchanged: category → `targetRuleId` invent is FORBIDDEN.
- Docs only. No seal. No pin. No percentage. Soft gate. Invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** This stamp is not `CERTIFIED`.
