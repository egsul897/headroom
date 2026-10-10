# Stage D — secured-debt dual-path execution (Cycle 6)

**Verdict:** §7.02(b) entity scope **SOURCE_SCOPE_DERIVED** from parent chapeau (guard entity-scope-consistency-guard.v6). Debt §7.01(b) **AVAILABLE** $50M; lien §7.02(b) **AVAILABLE** $20M. Synthetic $15M dual-path sim **SATISFIED**. Debt-only path is not a secured answer.

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` VEP (re-derived Cycle 6) |
| Guard | `entity-scope-consistency-guard.v6` |
| §7.02(b) entity scope | `["BORROWER","ANY_SUBSIDIARY"]` status=`SOURCE_SCOPE_DERIVED` decidedBy=`PARENT_SCOPE` |
| Companion discharge | **true** |
| SECURED_DEBT 4E | **CERTIFIED_4E** |
| Debt pathway (§7.01(b)) | **AVAILABLE** $50M |
| Lien pathway (§7.02(b)) | **AVAILABLE** $20M |
| Combined secured sim $15M | **SATISFIED** |
| Debt-only sim (not secured answer) | **SATISFIED** |

## What changed

Lettered children under a section-level candidate re-resolve PARENT_SCOPE from the child's structural node / section chapeau. Applicability is source-witnessed; BORROWER/ALL_SUBSIDIARIES are never invented without parent words.

## Authentic coverage

This run is **SYNTHETIC_LABELED_TECHNICAL_DEMO** on the Stage D acceptance package. Authentic CONMED / PINNED_OFFLINE packages are reported separately and are **not** treated as CERTIFIED customer results.

## Safety

- Fail-closed entity-scope and companion-REQUIRES guards preserved.
- Did not modify PR #229 capacity `state.ts` / `types.ts`.
- CFP 0; no paid inference; not customer-grade from synthetic evidence.
