# Stage D — companion-REQUIRES discharge + debt-side execution (Cycle 5)

**Verdict:** REQUIRE capacity **EXECUTED** after companion-REQUIRES discharge. §7.01(b) **AVAILABLE $50M**; synthetic $15M debt sim **SATISFIED**. §7.02(b) lien **REVIEW_REQUIRED** (`ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON`) — dual-path secured sim not claimed.

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` VEP from Cycle 4 |
| Companion discharge (§7.02(b)) | **true** |
| SECURED_DEBT 4E | **CERTIFIED_4E** |
| §7.01(b) capacity | **AVAILABLE** $50M |
| §7.02(b) capacity | **REVIEW_REQUIRED** [ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON] |
| Debt sim $15M | **SATISFIED** |

## What changed

Finite MONEY permissions whose only cross-rule gates are `SOURCE_REFERENCE_RESOLVED` `REQUIRES` dependencies with a COMPLETE target permission in-package no longer refuse the whole VEP. UNLIMITED capacity and `referencesRuleTargets` compliance gates stay fail-closed (xref §40/§54).

## Remaining Stage D blocker

§7.02(b) clause fragment has no obligor words; governing/parent scope is not attached in this offline package → `ENTITY_SCOPE_UNWITNESSED` → not safe to rely. Wire PARENT_SCOPE / governing entity scope for lettered children before claiming secured dual-path capacity/sim.

## Safety

- SYNTHETIC_LABELED_TECHNICAL_DEMO; not customer-certified; CFP 0; no paid inference.
