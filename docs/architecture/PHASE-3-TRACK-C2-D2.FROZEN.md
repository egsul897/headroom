# PHASE-3-TRACK-C2 — D2 campaign terminal — invent-safe FROZEN

**Tip:** `62a40be22b9598d9732e9ce2574d86d2228d6270` (#122 ACCEPTED fail-closed on main)
**Checked:** 2026-10-07T16:28:00Z
**Verdict:** invent-safe ALL Y — docs/decision — terminal below

## Does #122 alone equal a terminal?
**No.** #122 forbade category→`targetRuleId` invent and refused a new IR enum in that ADR. Owner now requires one explicit campaign terminal.

## C2 terminal (ONE)
**PHASE3_CATEGORY_RECLASS_UNSUPPORTED**

### Locked meaning
- Phase 3 does **not** support automatic category-to-category reclassification as an implementable / certifiable edge while targets would be invented from labels (#122) and tip has zero evidence-bound rule ids for those categories.
- **GENERALIZED_CATEGORY_RECLASS_MODEL_REQUIRED** is **rejected** for this campaign (would reopen invent of a new representation / additive IR without tip-grounded model).
- Existing `IRRuleDependency` shape remains the only allowed shape **if** a later post-Phase-3 evidence-bound `targetRuleId` appears — that is not a Phase 3 implement GRANT.
- `RECLASSIFIABLE_TO` count may stay 0. Matrix `WITH_RECLASSIFICATION` stays BLOCKED under this terminal (architecture, not hunter theater).
- Independent of C1 seal primitive.

## Deliverable
Docs-only banner on `docs/architecture/OPERATIVE-SUBWINDOW-D2-REPRESENTATION-ADR.md` (or one-file decision note) stating this terminal. No production IR enum. No edge invent.

## Invent-safe 5-part
| Part | Y/N |
|---|---|
| Tip-bound residual named | Y |
| Generalized | Y |
| No invent | Y — unsupported terminal; rejects generalized invent |
| Docs-only | Y |
| No CERTIFIED / pin | Y |

**ALL Y? YES.** Soft gate; invent-absence forever; ≠CERTIFIED.
