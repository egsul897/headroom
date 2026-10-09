# Stage D probe — pkg-i entity-scope COUNTERPARTY (Cycle 4)

**Verdict:** debt ∩ lien **enumeration unblocked** (`SECURED_DEBT` `CERTIFIED_4E`). Capacity/sim **correctly refused** (`CROSS_RULE_GATE_NOT_EXECUTABLE`).

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` (synthetic acceptance; offline) |
| Guard | `entity-scope-consistency-guard.v5` |
| CERTIFIED candidates | 3 |
| §7.01(b) debt CERTIFIED | **yes** |
| §7.01(d) scope | `["ANY_SUBSIDIARY"]` status=`SOURCE_SCOPE_DERIVED` relation=`MODEL_DIFFERENT` counterparty=true |
| SECURED_DEBT authority | **CERTIFIED_4E** |
| Debt CANDIDATE paths | 5 |
| Lien companion paths | 4 |
| REQUIRE capacity | **REFUSED** CROSS_RULE_GATE_NOT_EXECUTABLE |

## Defect closed

§7.01(d) "Indebtedness owed to the Borrower by any Subsidiary" previously treated Borrower as OBLIGOR → model BORROWER vs Subsidiary-only source → `ENTITY_SCOPE_UNDERINCLUSIVE` PARTIAL sibling → §7.01 candidate `UNIT_SUFFICIENCY_INCOMPLETE` / `COMPILATION_NOT_COMPLETED`.

v5: Borrower is COUNTERPARTY (payee); obligor scope derives to `ANY_SUBSIDIARY`; MODEL_DIFFERENT → `SOURCE_SCOPE_DERIVED` (COMPLETE, safeToRely). Classic Borrower+RS under-inclusion still PARTIAL.

## What executed vs refused

| Step | Result |
|---|---|
| Offline CERTIFY §7.01 + §7.02 | **Pass** |
| Phase 4E SECURED_DEBT dual-path | **CERTIFIED_4E** |
| evaluateVerifiedCapacity(REQUIRE) | **REFUSED** cross-rule gate on §7.02(b)→§7.01(b) |
| Customer-grade secured execution | **Not claimed** |

## Safety

- No paid inference; no FIXTURE_IR; CFP 0; certification gates not weakened.
- Cross-rule gate remains fail-closed (no invented satisfaction).
