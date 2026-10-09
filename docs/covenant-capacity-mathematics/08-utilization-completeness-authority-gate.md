# PR #234 — Utilization completeness authority gate

## Pass/fail matrix

| # | Requirement | Result |
|---|---|---|
| 1 | Who may issue VERIFIED_COMPLETE / VERIFIED_EMPTY | **PASS** — `COUNSEL_REVIEWER` or `LEDGER_CUSTODIAN` only for production; `SYSTEM_FIXTURE` never production-authoritative |
| 2 | Evidence: company, agreement, provision, entity scope, currency, effective date, coverage period | **PASS** — required on `CompletenessEvidenceScope`; missing/mismatched → refuse |
| 3 | Completeness method proves completeness (not merely reviewed rows) | **PASS** — `REVIEWED_RECORDED_TRANSACTIONS_ONLY` refused; EMPTY requires `AFFIRMATIVE_EMPTY_PATH_ATTESTATION`; COMPLETE requires `EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION` |
| 4 | Amendments / reclass / supersession / shared-capacity / opening balances cannot silently invalidate | **PASS** — binding fingerprints + policies ≠ UNKNOWN; shared-capacity requires explicit attestation |
| 5 | Synthetic/demo certificates not authoritative in production | **PASS** — PRODUCTION refuses SYNTHETIC_LABELED / SYSTEM_FIXTURE; product surfaces strip non-production remaining |
| 6 | Stale when document / ledger / financial / as-of / amendments change | **PASS** — fingerprint mismatch → refuse |
| 7 | Adversarial tests (forged, stale, mismatched, partial, incomplete) | **PASS** — `tests/capacity/completeness-certificate-adversarial.test.ts` (12) |
| 8 | Position / Simulate / Ask / verified-execution refuse without production completeness | **PASS** — `refuseAuthoritativeRemaining` + shared product views |
| 9 | tsc / capacity / certified / CI | see return |

## Unresolved merge blocker

Authentic Neon completeness certificates (counsel/custodian attestations bound to live document/ledger/financial epochs) are **not populated**. The contract is enforced fail-closed; production remaining remains unpublished until real certificates exist.

No new legal authority created. No assertion weakening. No auto-merge.
