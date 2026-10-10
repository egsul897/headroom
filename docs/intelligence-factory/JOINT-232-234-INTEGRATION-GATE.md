# Joint #232 / #234 integration gate

**Combined branch:** `cursor/joint-232-234-integration-2229`  
**Base:** `main` @ `b99f934b` (merged #229 — capacity state/types unchanged)  
**#232 tip accepted provisionally:** `5b208705` (CI green on that tip)  
**#234 tip reconciled:** `91996d1b` (completeness authority gate)

## Contract

One fail-closed remaining-capacity rule across engine and customer-facing consumers:

1. Approved / attributed usage ⇒ known attributed amount only.
2. Remaining = gross − usage requires a validated completeness certificate
   (`VERIFIED_EMPTY` | `VERIFIED_COMPLETE`).
3. PRODUCTION refuses synthetic / fixture certificates; DEMO_SYNTHETIC may
   demonstrate mechanics but never publishes production-authoritative AVAILABLE.
4. Position / Simulate / Ask share `buildSharedProductCapacityViews` →
   `refuseAuthoritativeRemaining`.
5. Solver `supportsRemainingClaim` / election SHARED_CAP use the same gate via
   the compact certificate adapter (`constraintId` binding).

Canonical marker: `lib/capacity/remaining-authority.ts`
(`REMAINING_AUTHORITY_CONTRACT_VERSION = joint-232-234.v1`).

## #229 capacity identity

`lib/contract-model/runtime/capacity/state.ts` and `types.ts` are byte-identical
to `origin/main` (`CAPACITY_EQ_MAIN=yes`). Do not close or supersede #229.

## Disposition (no auto-merge)

- Do **not** merge #232 or #234 independently while this joint candidate is the
  integration vehicle.
- Land the joint tip (or land both PRs only after they match this contract).
- No automatic merge from this gate.

## Evidence matrix covered

| Evidence | Expected |
|---|---|
| Approved-but-incomplete | `supportsRemainingClaim=false` |
| Missing ledger | UNKNOWN / no remaining |
| Partial attribution | refuse |
| Stale certificate | refuse |
| Mismatched rule/constraint | refuse |
| Synthetic in PRODUCTION | refuse |
| Contradictory EMPTY+usage | refuse |

## Consumers traced

| Path | Gate |
|---|---|
| Position / Simulate / Ask | `refuseAuthoritativeRemaining` |
| Solver election SHARED_CAP | `currentUsageSupportsRemainingClaim` |
| Package / legacy engine figures | labeled non-authoritative remaining |
| Covenant-engine shared load | completeness + authenticity |

## SHA / CI

| Item | Value |
|---|---|
| Combined tip (CI-green) | `09140bdc563712dc59287c53ad7901eb52991794` |
| Joint PR | #239 |
| #232 tip CI | green on `5b208705` |
| Local TypeScript | green after `prisma generate` |
| Local capacity / solver / adversarial / certified-path | green (see gate report) |
| Joint GitHub CI on combined tip | **green** — certified-path, invent-absence soft gates, P3-R0, Vercel |

**No auto-merge. Do not land #232 or #234 independently.**
