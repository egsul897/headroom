# Stage D — companion-REQUIRES discharge + debt-side execution (Cycle 5)

**Verdict:** REQUIRE capacity **EXECUTED** after companion-REQUIRES discharge. §7.01(b) **AVAILABLE $50M**; synthetic $15M debt sim **SATISFIED**. §7.02(b) lien **AVAILABLE** (Cycle 6 parent-scope inheritance; dual-path secured sim is Cycle 6).

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` VEP (Cycle 4/6 re-derive) |
| Companion discharge (§7.02(b)) | **true** |
| SECURED_DEBT 4E | **CERTIFIED_4E** |
| §7.01(b) capacity | **AVAILABLE** $50M |
| §7.02(b) capacity | **AVAILABLE** [] |
| Debt sim $15M | **SATISFIED** |

## What changed

Finite MONEY permissions whose only cross-rule gates are `SOURCE_REFERENCE_RESOLVED` `REQUIRES` dependencies with a COMPLETE target permission in-package no longer refuse the whole VEP. UNLIMITED capacity and `referencesRuleTargets` compliance gates stay fail-closed (xref §40/§54).

## Cycle 6 follow-on

Parent-scope inheritance for lettered children (entity-scope guard v6) makes §7.02(b) safe to rely on. Secured dual-path capacity/sim is demonstrated in `stage-d-pkgi-secured-dual-path/`.

## Safety

- SYNTHETIC_LABELED_TECHNICAL_DEMO; not customer-certified; CFP 0; no paid inference.
