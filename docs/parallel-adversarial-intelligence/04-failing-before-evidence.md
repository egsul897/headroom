# Failing-before test evidence

Suite: `tests/adversarial-intelligence/`  
Mechanism: Vitest `it.fails` locks desired fail-closed invariants that **currently fail** against production at starting SHA. When a defect is remediated, flip `it.fails` → `it`.

## Locked defects

| Test file | Case | Finding |
|---|---|---|
| `cross-phase-semantic-consistency.test.ts` | Phase-4C empty ledger must not publish AVAILABLE remaining = gross | PAI-04 |
| `cross-phase-semantic-consistency.test.ts` | legacy grower with missing pct must not report modeled | PAI-09 |
| `cross-phase-semantic-consistency.test.ts` | whole-document operative tip must not resolve future restatement | PAI-01 |
| `cross-phase-semantic-consistency.test.ts` | REVIEW_REQUIRED restatement must not yield RESOLVED tip | PAI-02 |
| `cross-phase-semantic-consistency.test.ts` | UNKNOWN restatement scope must fail closed | PAI-03 |
| `cross-phase-semantic-consistency.test.ts` | omitted entities must not SATISFIED | PAI-07 |
| `document-lifecycle-stress.test.ts` | pre-effective restatement must not resolve operative | PAI-06 |
| `false-confidence-omissions.test.ts` | empty utilization must not AVAILABLE remaining | PAI-04 |
| `false-confidence-omissions.test.ts` | empty atlas must not RESOLVED_CONTROLLING | PAI-10 |
| `false-confidence-omissions.test.ts` | omitted entities must not SATISFIED | PAI-07 |

## Passing negative controls (invariants already hold)

- Empty ledger → utilization authority UNKNOWN / not authoritative
- Verified remaining → `remainingStatus: GROSS_ONLY` / `publicationLabel: GROSS_CONTRACTUAL` without cert
- UNSUPPORTED → not UNLIMITED / no Infinity
- IR adapter refuses missing pctEbitda
- Agent #7 as-of chain selects correct governing restatement
- Simulate isolation: commitPlan unexecuted; pre-state ledger unchanged
- Missing metric → NEEDS_INPUT
- APPROVED cert without authenticity → no remaining claim

## Observable fork documentation (passing, documents inconsistency)

- Phase-4C AVAILABLE remaining = gross **while** utilization-authority `authoritativeForRemaining === false` on the same empty-ledger fact
- `computeOperativeDocument` tip = future ca-ar2 **while** `resolveGoverningProvision` as-of 2025 selects ca-ar1
