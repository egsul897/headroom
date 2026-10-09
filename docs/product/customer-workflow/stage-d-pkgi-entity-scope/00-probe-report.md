# Stage D probe — pkg-i entity-scope COUNTERPARTY (Cycle 4)

**Verdict:** debt ∩ lien **enumeration unblocked** (`SECURED_DEBT` `CERTIFIED_4E`). REQUIRE capacity **EXECUTED** (Cycle 5+ companion discharge may EXECUTE; Cycle 4 historically REFUSED cross-rule).

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` (synthetic acceptance; offline) |
| Guard | `entity-scope-consistency-guard.v6` |
| CERTIFIED candidates | 3 |
| §7.01(b) debt CERTIFIED | **yes** |
| §7.01(d) scope | `["ANY_SUBSIDIARY"]` status=`SOURCE_SCOPE_DERIVED` relation=`MODEL_DIFFERENT` counterparty=true |
| SECURED_DEBT authority | **CERTIFIED_4E** |
| Debt CANDIDATE paths | 5 |
| Lien companion paths | 4 |
| REQUIRE capacity | **EXECUTED**  |

## Defect closed

§7.01(d) "Indebtedness owed to the Borrower by any Subsidiary" previously treated Borrower as OBLIGOR → model BORROWER vs Subsidiary-only source → `ENTITY_SCOPE_UNDERINCLUSIVE` PARTIAL sibling → §7.01 candidate `UNIT_SUFFICIENCY_INCOMPLETE` / `COMPILATION_NOT_COMPLETED`.

v5/v6: Borrower is COUNTERPARTY (payee); obligor scope derives to `ANY_SUBSIDIARY`; MODEL_DIFFERENT → `SOURCE_SCOPE_DERIVED` (COMPLETE, safeToRely). Classic Borrower+RS under-inclusion still PARTIAL. Lettered children inherit parent chapeau scope (v6).

## What executed vs refused

| Step | Result |
|---|---|
| Offline CERTIFY §7.01 + §7.02 | **Pass** |
| Phase 4E SECURED_DEBT dual-path | **CERTIFIED_4E** |
| evaluateVerifiedCapacity(REQUIRE) | **EXECUTED** |
| Customer-grade secured execution | **Not claimed** |

## Safety

- No paid inference; no FIXTURE_IR; CFP 0; certification gates not weakened.
- Cross-rule gate remains fail-closed except finite companion-REQUIRES discharge (Cycle 5).
