# BLK-USAGE-ZERO — assignment brief (WS-CAP)

**Severity:** CRITICAL  
**Owner:** `WS-CAP` (Covenant capacity validation) · `bc-01a122bc-f497-7ff4-b280-f5d60318b580`  
**Coordinator:** `WS-AEC` · published 2026-10-09  
**Paid inference:** not authorized  
**Auto-merge:** forbidden

## Why this unlocks multiple workflows

Shared-capacity remaining headroom feeds **Position**, **Simulate**, and **Ask**. Treating unknown historical usage as `0` overstates remaining capacity and can produce **critical false permissions** across every agreement that uses shared baskets / aggregate ceilings.

Per North Star / Neon rule: **unknown utilization must never silently become zero.**

## Evidence on main (`bae24ced`)

### 1. Solver-native shared constraint loader

`lib/covenant-engine.ts` (~1899):

```ts
currentUsage: 0, // computed from ledger/historicalState by the caller when that's wired up; …
```

Nearby comment (~1885) already states usage should be “flagged rather than silently guessed at zero” — the loader still hardcodes zero today.

### 2. Product legal-intelligence path

`lib/product/legal-intelligence/run-package-path.ts` (~66):

```ts
const ledger = 0; // no utilization ledger model populated for CONMED demo
```

### 3. Neon baseline (PR #210)

`docs/intelligence-factory/NEON-INTELLIGENCE-BASELINE.md` — shared-constraint usage still loader-hardcoded to 0; SharedCapacityConstraint rows exist (3) but usage wiring incomplete.

## Required outcome (acceptance)

1. **Fail closed** when usage is unknown: remaining shared capacity must be `NOT_DETERMINABLE` / `REFUSED` / equivalent — never a numeric permission that assumes zero usage.
2. When usage **is** known (attributed ledger / EXTERNAL_INSTRUMENT_BALANCE / ContractLedgerUsage), compute `currentUsage` from that source through existing interfaces — **no second ledger**.
3. Regression tests under `tests/product/capacity-validation/**` (WS-CAP exclusive):
   - unknown usage ⇒ no favorable numeric clearance
   - known usage ⇒ remaining = cap − usage (within existing solver semantics)
4. Do **not** weaken Phase-3 certification boards or invent CONMED utilization history.
5. Prefer minimal change: if `lib/covenant-engine.ts` must change, keep the patch scoped to usage loading + explicit unknown marker (see `lib/solver/types.ts` unknown markers); document in PR that this is a demonstrated defect fix, not architecture rewrite.
6. Coordinate with `#136` (do not merge that tip); do not reopen governing-limit work beyond this usage honesty fix.

## Exclusive trees

- Own: `docs/product/capacity-validation/**`, `lib/product/capacity-validation/**`, `scripts/product/capacity-validation/**`, `tests/product/capacity-validation/**`
- Extend via sibling / minimal defect fix only: `lib/contract-model/runtime/capacity/**`, `lib/covenant-engine.ts` (usage load path only, with coordinator ack in PR body)
- Must not touch: `lib/contract-model/ir/**`, Claude `tests/product-acceptance/**`, `docs/architecture/parallel-agents/**`

## Reporting back

Update peer note or open draft PR; coordinator will refresh `17-progress-manifest.json` when evidence lands. Include: base/tip SHA, focused tests, whether numeric Position/Simulate paths now refuse on unknown usage.
