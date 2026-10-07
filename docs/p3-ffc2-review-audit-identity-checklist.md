# P3-FFC2 reviewer checklist

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. **PINNED_OFFLINE ≠ CERTIFIED.** A green `p3-r0-soft-gate` run is not certification credit. Coding authorization is not merge authorization.

FROZEN sha256 `c5e18e1e34749b43223e7041d4d96b95540829d885d93956a32cda6f814119f9`. Implemented on main tip `322fb45256baac4b5dceb6c8a0020827e77e67f3` (#98 P3-FFC1b merged). Plan base was `2087d4e9bfdc0955fb76e6ba5550fa98e549963d`; that tip went stale when #98 merged. Scope is unchanged.

Parallel to #98: this PR does not edit `lib/onboarding/financial.ts`.

## Permanent reviewer questions

1. **WHEN PROMOTION FORCES REVIEW_REQUIRED ON CONFLICT, IS THE TRANSITION APPEND-ONLY AUDITED WITHOUT DESTROYING ORIGINAL RATIONALE OR FAKING `reviewedBy`?**

   Yes, for `CONFLICTING_FINANCIAL_FACTS`. `recordSystemReviewRequired` appends a `CandidateReviewEvent` with `action: REVIEW_REQUIRED`, `previousStatus` → `newStatus: REVIEW_REQUIRED`, `note` = the conflict skip reason, and `reviewedBy: null`. The candidate's `reviewStatus` becomes `REVIEW_REQUIRED`. `rationale`, `reviewedAt`, and `reviewedBy` are not rewritten. `reviewCandidate()` is not called.

2. **WHEN TWO STORED ROWS CLAIM THE SAME FINANCIAL IDENTITY, DOES THE READER FAIL CLOSED AS AMBIGUOUS?**

   Yes. `lib/financial-identity.ts` counts rows for the reader's existing filter. 0 → `FINANCIAL_IDENTITY_UNKNOWN`. 1 → that row. More than one row in the exact set, or in the latest `asOfDate` cohort, → `FINANCIAL_IDENTITY_AMBIGUOUS`. No silent `findFirst` pick. Readers: `loadCompanyCovenantData`, `loadFinancialState`, `dashboard-service` default as-of, `getFinancialSnapshot`, `getDebtTranches`, and `covenant-overview-service` default as-of. `loadCovenantDataOrEmpty` still maps snapshot UNKNOWN to the pre-existing empty legacy dataset. It rethrows AMBIGUOUS.

## Folded promotion collisions

- **DEFINED_TERM:** same `(documentId, termName)` with different `sectionRef` or `fullText` → `CONFLICTING_DEFINED_TERMS`. Identical text corroborates. The stored row is not overwritten. A loser does not get `promotedAt`.
- **DOCUMENT_RELATIONSHIP:** divergent type or supersession (including effective dates and unresolved supersession refs) for the same document → `CONFLICTING_DOCUMENT_RELATIONSHIPS`. No iteration-order winner. Already-confirmed state is not overwritten by a divergent candidate.

FFC1 `CONFLICTING_FINANCIAL_FACTS`, applied honesty, R0 C6, and the PERMISSION duplicate-ref skip stay in place.

## HOLD follow-ons (not this PR)

- Write-side `lib/onboarding/financial.ts` `findFirst` on same-date Snapshot/State. FFC1b owns that file. Named residual, not abandoned.
- Schema `@@unique([companyId, asOfDate])` and its migration, after this AMBIGUOUS path.
- Reconciliation amplifier. EXTERNAL_INPUT always-create. Covenant activation create-per-candidate. permissionRelationship always-create.
- Matrix / pins / stratified certification. SFG-1. Snapshot per-field provenance. Invented discoveryIds.

Merge stays HOLD until Architect COMMENT, Trust (+IR), Notes/Cert, tip CI SUCCESS on this soft gate, and COO MERGE AUTHORIZED.
