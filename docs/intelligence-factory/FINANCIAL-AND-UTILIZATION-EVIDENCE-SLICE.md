# HEADROOM-9 — Financial statements & historical utilization evidence slice

**Verdict target:** `FINANCIAL_AND_UTILIZATION_EVIDENCE_SLICE_VERIFIED`  
**Contract used:** Agent #2 `verified-input-contract.v1` on main (`lib/capacity/financial-evidence.ts`, `verified-input-contract.ts` via #279)  
**Ownership:** financial ingestion normalization + utilization evidence reconstruction  
**Non-ownership:** trusted identity minting, solver arithmetic, UI, Agent #2 authority modules

## Integration note (#281 → main)

PR #281 ported Agent #2 modules that later landed via #279. This integration keeps **canonical main** implementations of:

- `financial-evidence.ts`
- `verified-input-contract.ts`
- `trusted-issuer-host.ts`

and adds only HEADROOM-9 ingestion / reconstruction / fixture / tests.

## Pathway

```
Authentic statement / transaction evidence
  → normalizeFinancialStatementEvidence / reconstructUtilizationEvidence
  → Agent #2 AuthenticatedFinancialSnapshotEvidence + UtilizationEvidenceRecord
  → validateAuthenticatedFinancialSnapshot / resolveUtilization
  → buildVerifiedCapacityInputHandoff
```

## Bounded vertical slice

| Leg | Authentic source | Notes |
|---|---|---|
| Financial statement | Matthews International Q1 FY2025 10-Q / Indenture Consolidated EBITDA build-up (EDGAR `0000063296-25-000006`; in-repo provenance in `docs/matthews-international-onboarding.md`) | GAAP Total Assets vs Indenture Consolidated EBITDA (CONTRACT_ADJUSTED) distinguished |
| Utilization | Revolver outstanding attributed to Indenture §4.09 Debt Facilities basket (`ind_permitted_debt_1a_flat`) from same 10-Q Note 7 debt schedule | Explicit `applicableProvisionId` required — statement balances alone do not attribute; **completeness NOT reviewer-confirmed** → correct refusal |

## Completeness limitations (explicit)

1. **Evidence observed ≠ completeness.** Seeing a debt balance does not prove the historical usage set is complete.
2. **Unobserved usage ≠ zero.** Empty or partial event sets remain `UNKNOWN_HISTORICAL_ACTIVITY`.
3. **Only trusted authorized approval** (Agent #2 authenticity + trusted issuer on a completeness certificate) may establish `REVIEWER_CONFIRMED_COMPLETENESS`.
4. **Production activation remains BLOCKED** (`TRUSTED_ISSUER_ACTIVATION`) — this slice does not mint production identity or write Neon.
5. **GAAP Total Assets ≠ covenant Total Consolidated Assets** — silent substitution refused at ingestion (ingestion-local role; Agent #2 emits consolidated term as `OTHER` with marker).
6. **Statement balances ≠ basket attribution** — utilization requires explicit provision / shared-capacity / legacy attribution.
7. This verdict does **not** imply production completeness or production-authoritative remaining capacity.

## Adversarial coverage

Double-counting, restatements, stale periods, missing transactions, entity mismatches, currency mismatches, shared-capacity usage, and unknown historical activity — see `tests/capacity/financial-utilization-evidence-slice.test.ts`.

## Success marker

`FINANCIAL_AND_UTILIZATION_EVIDENCE_SLICE_VERIFIED` — bounded source→handoff pathway verified under fail-closed completeness. Not production-complete.
