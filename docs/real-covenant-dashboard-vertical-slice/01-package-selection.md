# Package selection — authentic demonstration

## Recommendation: Matthews International (MATW)

Only candidate that simultaneously provides:

1. Legally coherent EDGAR-backed documentation (Indenture + CA + 10-Q).
2. Verifiable financial inputs already in-repo (`tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json`).
3. Attributed utilization events (revolver + 2027 Notes) without inventing completeness.
4. ≥5 distinct covenant calculations via existing solver-native permission formulas.
5. Position company wiring (`companyId = "matthews"`).

## Rejected / deferred alternatives

| Package | Why not for this slice |
|---|---|
| Coherent | Illustrative ledger / assumed-zero usage / seed-aligned modeled — fails authenticity purity |
| CONMED | Authentic docs; **0** numeric capacity without inventing financials |
| MTN/MHK | Authentic IR hypo only; no authenticated financials; no Position company |
| AutoNation | IR 0/10; financial completeness 0/1; operative BLOCKED |
| WOR | Sealed holdout — not for demo population; no financials |

## Five proven covenants (no invention)

| # | Code | Section | Modeled result |
|---|---|---|---|
| 1 | `ind_permitted_debt_1a_flat` | Permitted Debt cl. (1)(a) | ≈ $521.12M (FLAT_NET_OF_DEBT) |
| 2 | `ind_ratio_debt_fccr` | §4.09(a) | ≈ $110.34M FCCR room |
| 3 | `ind_permitted_debt_1b_ratio_secured` | cl. (1)(b)(x) | $0 (SNLR above 3.50x) |
| 4 | `ind_permitted_debt_2_notes` | cl. (2) | $0 NEW (grandfather) |
| 5 | `ca_lien_601j_2024notes` | CA §6.01(j) restated | $0 structural |

Composition: Indenture secured max ≈ $631.45M (= 1+2).

## Honest refusals retained

- Production remaining REFUSED (no completeness cert; trusted-issuer BLOCKED).
- UNKNOWN historical activity never zero.
- First Lien 2.50x sub-test unmodeled (named gap).
- CA debt-incurrence NOT_TESTED (no Indebtedness negative covenant).
