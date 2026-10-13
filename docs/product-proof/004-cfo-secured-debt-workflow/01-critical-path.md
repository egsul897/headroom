# Phase B — Critical path (Matthews $50M secured)

## Selected path

| Item | Choice |
|---|---|
| Package | Matthews International Q1 FY2025 |
| Question | Dated $50M secured debt under Indenture + CA |
| Orchestrator | `lib/product/cfo-secured-debt-workflow/evaluate.ts` |
| Engines reused | vertical slice, VE bridge, path enum, verified simulate, recipe, cross-domain modeled scenario |

## Evidence bound (authentic)

- Indenture 8.625% Senior Secured Second Lien Notes due 2027 — accession `0001193125-24-228450`
- Third A&R Loan Agreement (as amended through Sixth Amendment) — accession `0000063296-20-000040`
- Form 10-Q quarter ended 2024-12-31 — accession `0000063296-25-000006`
- Fixture: `tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json` (`AUTHENTIC_SOURCE_BACKED`)
- Operative excerpts: `source-excerpts-matthews.ts` (EDGAR-reconstructed; not Phase-3 seal)

## Semantic / authority state (honest)

| Gate | Status |
|---|---|
| Modeled leaf citations + formulas | Present |
| VE fixed-dollar GROSS (Permitted Debt 1a) | Bridge compiles; feeds Position GROSS only |
| Matthews VEP | **ABSENT** — `verifiedPackage: null` intentional |
| Path enum authority | `NOT_CERTIFIED_4E` |
| Verified simulate executable | `false` |
| NS-4 APPROVED | Absent (fixture non-APPROVED) |
| Utilization completeness | Absent |
| Trusted issuer | `BLOCKED` |
| Verified remaining | `null` |
| Modeled SSNL refinancing ($50M) | `blocked` (ratio room $0) — labeled **modeled**, not CERTIFIED |

## Result policy

- No package → `UNSUPPORTED`
- Incomplete draft → `NEEDS_INPUT`
- Modeled SSNL blocked → `NOT_PERMITTED` (explicitly non-authoritative)
- Otherwise → `NEEDS_INPUT` with gate blockers
- **Never** `PERMITTED` without genuine CERTIFIED_4E + completeness + trusted issuer

## Required external evidence (not fabricated)

1. Phase-3 CERTIFIED IR → VerifiedExecutionPackage for Indenture debt + CA lien companion
2. NS-4 APPROVED financial snapshot at cutoff
3. Reviewer-confirmed utilization completeness + trusted issuer activation
4. Certified as-amended operative state for CA through Sixth Amendment
