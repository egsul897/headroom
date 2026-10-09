# #232 Integration Correction

**As of:** 2026-10-09  
**Merge candidate tip:** `0425caa471b94576a7df34dbab771c6585aa6ec0` (includes completeness alignment @ `2220dd4a`)  
**Base:** `origin/main` @ `b99f934b` (**includes merged #229**).

## 1. PR disposition correction

| PR | Disposition |
|---|---|
| **#229** | **MERGED** into main (`b99f934b`). Historical provenance preserved. **Do not close or supersede.** Capacity status contract lives on main. |
| **#225 / #227** | Eligible to close as **superseded by #232** only after confirmation below. |
| **#234** | Open — utilization completeness contract. **Do not land #232 or #234 alone** while authority semantics diverge; this tip aligns #232 solver flags with #234’s completeness rule. Prefer landing #234 (or its `lib/capacity/*` contract) in close succession. |
| **#230** | Hold if CI red; complementary authentic matrix. |

Prior acceptance docs that said “close #229 as incorporated” are **withdrawn**.

## 2. Rebase / reconcile vs main

- Rebased `cursor/neon-activation-repeatable-2229` onto `origin/main` (`b99f934b`).
- `lib/contract-model/runtime/capacity/{state,types}.ts` **byte-identical** to main (#229 behavior + tests preserved).
- Competing pre-#229 `REVIEW_REQUIRED` failed-gate floor is **not** present.

## 3. Utilization authority vs #234

| Concept | #234 | #232 (corrected) |
|---|---|---|
| Attributed records | Known attributed amount | `attributedKnown` / status `COMPUTED` |
| Completeness | Required certificate `VERIFIED_EMPTY` \| `VERIFIED_COMPLETE` | `completenessCertificate` on compute/loader |
| Remaining claim | `supportsRemainingClaim` | `currentUsageSupportsRemainingClaim` |
| Approved ≠ complete | Explicit | **Enforced** — attributed without cert → remaining claim false |
| Empty ledger | `UNKNOWN`, not verified zero | `ZERO_NO_ATTRIBUTED_USAGE`, supportsRemainingClaim false |

`currentUsageAuthoritative` is now **aliased to** `supportsRemainingClaim` (deprecated name). It is **never** true for attributed-only COMPUTED without a completeness certificate.

## 4. Solver remaining-capacity proof

Election `headroomAndConsume` requires `currentUsageSupportsRemainingClaim` (or legacy authoritative **and** `currentUsageCompletenessCertified`). Otherwise SHARED_CAP → `UNKNOWN`, allocation 0.

Covered cases (tests):
- Missing attribution
- Partial attribution
- Attributed without completeness certificate
- Stale certificate (asOf)
- Mismatched constraint id
- VERIFIED_EMPTY cert with non-zero attributed usage
- External / entity-class aggregation

## 5. Consumer audit (Position / Simulate / Ask / package)

| Surface | Finding |
|---|---|
| Solver election | Hardened — completeness required for shared remaining |
| Loader `loadCompanySolverStaticData` | Emits supportsRemainingClaim + completenessCertified |
| Legacy Position/Simulate (`computeCovenantPosition` / `simulateDebtIncurrence`) | Publish **gross** provision capacity; must not be labeled utilization-adjusted remaining without #234 verified-remaining path |
| Ask / debt-intelligence | #234 adds `buildSharedProductCapacityViews` — land with #234; do not invent parallel remaining on #232 alone |
| Package / Phase-4C | Ledger-attributed path; A8-01 NOT_SATISFIED on main |

## 6. #225 / #227 preservation

| Check | Result |
|---|---|
| Ancestor of tip | Yes (rebased commits include both) |
| Files present | extraction prose fix + e2e activation + regressions |
| Regressions | `synthetic-formula.test.ts`, `shared-usage.test.ts`, e2e script |

**OK to close #225 and #227 as superseded by #232** after tip CI green.

## 7. Integrated tests (exact merge tree)

Local after rebase + completeness alignment: **100** tests passed (solver, A8, Agent8 adversarial, intelligence-factory, extraction). Cost **$0**.

## 8. Merge recommendation (no automatic merges)

```
1. Confirm #232 tip CI green on rebased SHA.
2. Do NOT merge #232 alone if product remaining-capacity surfaces still assume
   attributed-only = complete — land #234 (completeness resolver + product views)
   in the same integration window, or gate those surfaces until #234 lands.
3. Do NOT close or supersede #229 (already merged; provenance on main).
4. After #232 tip CI green: close #225 and #227 as superseded by #232.
5. Hold #230 until green; keep #220 independent for financial ingest.
6. No certification bypass; no unauthorized Neon writes.
```

## Unresolved blockers

1. Authentic Neon attributed ledger still sparse (shared with #234).
2. Legacy Position/Simulate gross path not yet wired through #234 product views.
3. Durable pilot still requires human Neon-write authorization.
4. #232 + #234 must not diverge again on remaining authority.
