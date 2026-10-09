# Stage D probe — pkg-i-secured-debt-lien

**Verdict:** positive dual-path execution **BLOCKED** (debt primary not CERTIFIED). Enumeration honesty **PASS** — lien-only VEP does not claim SECURED_DEBT CERTIFIED_4E.

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` (synthetic; acceptance offline) |
| CERTIFIED candidates | 1 |
| Debt CERTIFIED | **no** |
| Lien CERTIFIED | yes (§7.02 family) |
| SECURED_DEBT authority | **INCOMPLETE_PACKAGE** |
| SECURED incomplete | NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT |
| SECURED path count | 0 |

## Candidate certification (offline acceptance)

- `7.01(b)` action=INCUR_DEBT → **REVIEW_REQUIRED** [COMPILATION_NOT_COMPLETED, UNIT_SUFFICIENCY_INCOMPLETE]
- `7.02` action=CREATE_LIEN → **CERTIFIED**
- `7.04` action=n/a → **REVIEW_REQUIRED** [COMPILATION_NOT_COMPLETED, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE]
- `9.15` action=INCUR_DEBT → **REVIEW_REQUIRED** [OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]
- `?` action=n/a → **REVIEW_REQUIRED** [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, SUPPORT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, VERIFICATION_NOT_CLEAN]

## Why not execute

Stage D requires debt ∩ lien. Offline, only the §7.02 lien section CERTIFIES. §7.01(b) stays REVIEW_REQUIRED (`COMPILATION_NOT_COMPLETED`, `UNIT_SUFFICIENCY_INCOMPLETE` with a PARTIAL sibling unit). §9.15 secured cap stays REVIEW_REQUIRED. Inventing debt CERTIFIED status or FIXTURE_IR would be a false permission.

## Enumeration honesty (this cycle)

Before: a lien-only DERIVED VEP enumerated SECURED_DEBT as `CERTIFIED_4E` with `path:restriction:*` CANDIDATE rows despite `NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT`.
After: companion liens surface only when a debt primary exists; missing primary forces `INCOMPLETE_PACKAGE` and zero secured grant paths.

## Safety

- No paid inference; no FIXTURE_IR; CFP target 0; gates not weakened.
