# Certified vs Legacy Demo Report

**Label:** SYNTHETIC · **IR:** FIXTURE_IR

SYNTHETIC CONMED-form-inspired comparison harness. FIXTURE_IR is hand-built. Legacy multipath remains LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E. This report does NOT certify Phase 3 customer IR.

- Generated: 2026-10-09T14:25:13.950Z
- Company (synthetic): `synthetic-conmed-form-co`
- Instrument (synthetic): `synthetic-term-loan-a`
- Exercises: 7
- Discrepancies recorded: 18
- Verified-execution ran: 6
- Verified-execution blocked: 1
- Legacy authority: always `NOT_CERTIFIED_4E` / `LEGACY_ENGINE_MULTIPATH`

## Exercises

### $100M secured borrowing (`secured-borrowing-100m`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 3 path(s)
- Certified/FIXTURE: ran (EXECUTED)
- Discrepancies (3):
  - 7.01(b):GENERAL_DEBT / remainingCapacity: legacy=84 vs certified=50000000 — Legacy capacityMillions×1e6=84000000 vs FIXTURE_IR remainingUsd=50000000 (scale/formula/ledger divergence)
  - 7.02(a):GENERAL_LIEN / remainingCapacity: legacy=84 vs certified=50000000 — Legacy capacityMillions×1e6=84000000 vs FIXTURE_IR remainingUsd=50000000 (scale/formula/ledger divergence)
  - (authority) / authority: legacy="LEGACY_ENGINE_MULTIPATH/NOT_CERTIFIED_4E" vs certified="FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)" — Authority surfaces differ by design — legacy must not be presented as certified Phase 4E

### $75M restricted payment (`restricted-payment-75m`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 2 path(s)
- Certified/FIXTURE: ran (EXECUTED)
- Discrepancies (2):
  - 7.06(a):FIXED_RP / remainingCapacity: legacy=25 vs certified=null — Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)
  - (authority) / authority: legacy="LEGACY_ENGINE_MULTIPATH/NOT_CERTIFIED_4E" vs certified="FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)" — Authority surfaces differ by design — legacy must not be presented as certified Phase 4E

### $150M acquisition financing (`acquisition-financing-150m`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 4 path(s)
- Certified/FIXTURE: ran (EXECUTED)
- Discrepancies (2):
  - 7.02(a):GENERAL_LIEN / remainingCapacity: legacy=84 vs certified=null — Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)
  - (authority) / authority: legacy="LEGACY_ENGINE_MULTIPATH/NOT_CERTIFIED_4E" vs certified="FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)" — Authority surfaces differ by design — legacy must not be presented as certified Phase 4E

### EBITDA decline (`ebitda-decline`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 3 path(s)
- Certified/FIXTURE: ran (EXECUTED)
- Discrepancies (4):
  - 7.01(b):GENERAL_DEBT / remainingCapacity: legacy=84 vs certified=50000000 — Legacy capacityMillions×1e6=84000000 vs FIXTURE_IR remainingUsd=50000000 (scale/formula/ledger divergence)
  - 7.01(c):GENERAL_DEBT / remainingCapacity: legacy=20 vs certified=null — Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)
  - 7.02(a):GENERAL_LIEN / remainingCapacity: legacy=84 vs certified=null — Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)
  - (authority) / authority: legacy="LEGACY_ENGINE_MULTIPATH/NOT_CERTIFIED_4E" vs certified="FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)" — Authority surfaces differ by design — legacy must not be presented as certified Phase 4E

### Amendment changing basket capacity (`amendment-basket-capacity`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 2 path(s)
- Certified/FIXTURE: ran (EXECUTED)
- Discrepancies (2):
  - 7.02(a):GENERAL_LIEN / remainingCapacity: legacy=84 vs certified=null — Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)
  - (authority) / authority: legacy="LEGACY_ENGINE_MULTIPATH/NOT_CERTIFIED_4E" vs certified="FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)" — Authority surfaces differ by design — legacy must not be presented as certified Phase 4E

### Historical basket consumption (`historical-basket-consumption`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 2 path(s)
- Certified/FIXTURE: ran (EXECUTED)
- Discrepancies (4):
  - 7.01(b):GENERAL_DEBT / remainingCapacity: legacy=50 vs certified=32000000 — Legacy capacityMillions×1e6=50000000 vs FIXTURE_IR remainingUsd=32000000 (scale/formula/ledger divergence)
  - 7.02(a):GENERAL_LIEN / remainingCapacity: legacy=50 vs certified=null — Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)
  - rule:synth-hist-7.01(b) / ledgerAwareRemaining: legacy=50 vs certified=32000000 — Ledger usage $18000000 reflected on FIXTURE_IR but not on legacy Permission capacity
  - (authority) / authority: legacy="LEGACY_ENGINE_MULTIPATH/NOT_CERTIFIED_4E" vs certified="FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)" — Authority surfaces differ by design — legacy must not be presented as certified Phase 4E

### Reclassification (`reclassification`)

- Cutoff: FY2026-Q2 as-of 2026-06-30; eval 2026-08-01
- Legacy: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E · 2 path(s)
- Certified/FIXTURE: blocked — NO_VERIFIED_EXECUTION_PACKAGE: reclassification election semantics are not honestly packaged as a simple verified capacity unit in this SYNTHETIC demo — incomplete verification rather than a faked PASS
- Discrepancies (1):
  - (package) / verifiedExecution: legacy="LEGACY_ENGINE_MULTIPATH" vs certified="NO_VERIFIED_EXECUTION_PACKAGE: reclassification election semantics are not honestly packaged as a simple verified capacity unit in this SYNTHETIC demo — incomplete verification rather than a faked PASS" — Certified/FIXTURE path blocked (NO_VERIFIED_EXECUTION_PACKAGE: reclassification election semantics are not honestly packaged as a simple verified capacity unit in this SYNTHETIC demo — incomplete verification rather than a faked PASS). Legacy remains NOT_CERTIFIED_4E.

## Limitations

- Not authentic customer data
- Not a Phase 3 customer IR certification claim
- FIXTURE_IR verification artifacts are test-constructed STRONG identities, not live verifier output
