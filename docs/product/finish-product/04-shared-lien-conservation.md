# Shared-lien conservation — HIGH merge-hold evidence

**Separate from:** authentic affirmative acceptance (`03-authentic-affirmative-acceptance.md` / SHAs `887b41ab` / `380054b7`)  
**Verdict:** `SHARED_LIEN_CONSERVATION_REMEDIATED`  
**Tip:** `8fda7b53b808d960a3f253dd239b3d119b7e37e8`  
**CI at tip:** 6/6 SUCCESS (canonical-compiler, home-overview, p3-r0-soft-gate, dashboard-invent-absence, Vercel, Vercel Preview Comments)  
**Auto-merge:** **no** · certification **not** advanced · no fabricated evidence · no Neon writes · no paid inference

## Defect reproduced (pre-fix on auto-lien path)

At tip before this remediation pass, `AUTOMATIC_LINKED_PERMISSION` liens:

1. Ignored shared-constraint caps entirely (`$150` CLEAR against `$100` shared).
2. When also election LIEN members, inflated the independent coverage pool so a sibling debt leg could re-credit the same shared headroom.

Independent expectation: aggregate draws on a shared constraint cannot exceed remaining headroom.

## Fix (production)

`lib/solver/election.ts` secured block:

1. Exclude auto-linked lien IDs from the independent coverage pool.
2. Phase A: consume shared-constraint headroom for auto-lien allocations **before** independent pool build (same `lienSharedRemaining` map).
3. Preserve prior conservation: all matched constraints bound; election-wide remaining; non-authoritative util → UNKNOWN; EXACT max ≤ shared remaining.

## Reproduction / disproof matrix

| # | Scenario | Independent expectation | Result |
|---|---|---|---|
| R1 | Two $100 independent liens + one $100 shared; request $150 | Must **not** CLEAR; max ≤ 100 | **PASS** — BLOCKED, maxCapacity 100 |
| R2 | $40 historical util; request $90 | Remaining ≤ 60; not CLEAR | **PASS** |
| R3 | Non-authoritative util (`ZERO_NO_ATTRIBUTED_USAGE`) | Not CLEAR; UNKNOWN/BLOCKED/REVIEW | **PASS** |
| R4 | `runSolver` EXACT maxCapacity | EXACT ≤ 100 | **PASS** — EXACT 100 |
| R5 | Overlapping Y(50) before X(100); request 120 | Pool = 100 not 130; BLOCKED both orders | **PASS** |
| R6 | No shared constraint; additive $80+$80 | CLEAR; max 160 | **PASS** (control) |
| R7 | Input-order independence on identical shared | Same BLOCKED / max 100 | **PASS** |
| R8 | Auto-lien alone on $100 shared; request $150 | Must **not** CLEAR; max ≤ 100 | **PASS** (new) |
| R9 | Auto-lien + sibling debt cannot re-credit shared via independent pool | Must **not** CLEAR at $150 | **PASS** (new) |
| R10 | Multi-leg two $80 debts vs $100 shared independent liens | Must **not** CLEAR at $160; max ≤ 100 | **PASS** (new) |
| R11 | Wrong collateral on both shared liens | Must **not** CLEAR | **PASS** (new) |

Suite: `tests/solver/shared-lien-double-count-repro.test.ts`

## Commands

```bash
npx vitest run tests/solver/shared-lien-double-count-repro.test.ts \
  tests/solver/secured-capacity-adversarial-matrix.test.ts \
  tests/solver/secured-debt-lien-adversarial.test.ts
```

## Environment blockers

Neon-backed solver/FCE live-DB suites fail with `P1001` / Prisma init — **not** treated as shared-lien disproof. Documented operational blocker only.

## Authentic affirmative (untouched)

Unit CERTIFIED §7.2(c) + `CROSS_RULE_GATE_NOT_EXECUTABLE` refusal preserved. This record does not reopen that milestone.
