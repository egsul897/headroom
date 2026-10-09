# Neon Activation — Acceptance & Integration Directive

**As of:** 2026-10-09  
**Objective:** Land one canonical, legally honest activation pathway.

## 1. Exact PR SHAs and CI

| PR | Tip SHA | CI (tip) | Role |
|---|---|---|---|
| **#229** | `b33f86554e398af4eb3204120b5f5046e21ffe7d` | **Green** (certified path, Vercel) | Canonical A8-01/A8-02 capacity status |
| **#232** | `18482ec735738483ced46780131e3a4ef9be174f` | **Was green** at `f9b77f20`; re-check after push | Activation + supersession vehicle |
| **#225** | `d2d1dca0b542a6d6cc6ea15b11a9dfbc87c7055e` | N/A (superseded) | Extraction prose fix |
| **#227** | `8b81dffb6ec0bd29945aeda76d3f2bfffff9fe89` | N/A (superseded) | E2E activation proof |
| **#230** | `bf10361daacdda653e536e1e2211b8b1e536fcf7` | **Red** (certified path + Vercel fail) | Authentic capacity matrix (Agent 3) — do not block #232 |
| **#220** | `2ceb5e48b595b1bd498dd9915dc3f8a5da15a6fa` | **Green** | Financial certificate engine (Agent 2) |

## 2. Capacity status — #229 is canonical

| File | #229 vs #232 (pre-integration) |
|---|---|
| `lib/contract-model/runtime/capacity/state.ts` | **Byte-identical** |
| `lib/contract-model/runtime/capacity/types.ts` | **Byte-identical** |
| `tests/.../a8-gate-status-regression.test.ts` | **Byte-identical** |
| `scripts/phase-4c-gate.ts` | **Byte-identical** |
| `tests/.../phase3-fixture-proof.test.ts` | **Byte-identical** |

Contract: `GATE_NOT_SATISFIED` → `CapacityStatus.NOT_SATISFIED` (never `AVAILABLE`, never conflated with `REVIEW_REQUIRED`).

This integration merges #229’s Agent8 adversarial suite into #232 without changing those capacity files.

## 3. Supersession — #225 / #227

| Check | Result |
|---|---|
| `git merge-base --is-ancestor` #225 → #232 | **Yes** |
| `git merge-base --is-ancestor` #227 → #232 | **Yes** |
| #225 files missing from #232 | **None** |
| #227 files missing from #232 | **None** |
| Regressions present | `synthetic-formula.test.ts`, `shared-usage.test.ts`, `rock-2.01-incremental-refusal.test.ts`, A8 gate regression |

**Disposition (corrected):** Close #225 and #227 as **superseded by #232** after tip CI green. **#229 is MERGED on main (`b99f934b`) — do not close or supersede; preserve historical provenance.**

## 4. Utilization-consumer audit

| Consumer | Uses `currentUsage`? | Honors authority flags? | Disposition |
|---|---|---|---|
| `loadCompanySolverStaticData` | Sets usage + status + authoritative | **Yes** (producer) | OK |
| `lib/solver/election.ts` `headroomAndConsume` | **Was vulnerable** — `cap − currentUsage` with silent zero | **Fixed** — requires `currentUsageAuthoritative === true`; else SHARED_CAP `UNKNOWN` / `EXTERNAL_INPUT`, alloc 0 | **Hardened** |
| Position / Simulate (legacy `computeCovenantPosition` / `simulateDebtIncurrence`) | Gross provision capacity; no shared-usage subtract | N/A for shared util | Do not claim remaining after usage without attribution |
| Ask / package / Phase-4C | Ledger-attributed usage, not solver `currentUsage` | Separate path | Keep distinct |
| Synthetic fixtures | Hardcoded `currentUsage: 0` | Updated to `VERIFIED_ZERO` + authoritative where headroom math is intentional | OK |

**Rule:** Non-authoritative usage (`ZERO_NO_ATTRIBUTED_USAGE`, partial, external) **cannot** produce favorable remaining-capacity / CLEAR via shared-constraint headroom.

## 5. Integrated regression results (local merge tree)

Ran on #232 + #229 Agent8 suite + utilization fail-closed:

- `tests/solver/election.test.ts` — pass (incl. non-authoritative SHARED_CAP UNKNOWN)
- `tests/solver/service.test.ts` — pass
- `tests/solver/fixtures/synthetic-solver-native.test.ts` — pass
- `tests/solver/shared-usage.test.ts` — pass
- `tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts` — pass
- `tests/intelligence-factory/*` — pass

Paid inference: **$0**. No production Neon writes.

## 6. Reconciliation with #230 / #220

| PR | Relationship |
|---|---|
| **#230** | Same leaf `evaluateProvision`; authentic Coherent/Matthews gross capacity. CI **red** — do not merge ahead of #232. Agree: remaining after utilization blocked without attribution. Reuse results; do not fork math. |
| **#220** | Authentic financial fixtures / certificate ingest. CI green. #232 authentic Matthews test uses same provenance figures (labeled `AUTHENTIC_SOURCE_BACKED`). Prefer #220 for approved financial pipeline in durable pilot. |

## 7. Maturity ladder (preserved)

`DISCOVERED` → `MODELED` → `UNVERIFIED` → (`VERIFIED` review) → `CERTIFIED` (Phase-3 seal)  

Discovery ≠ certification. Legacy favorable ≠ certified permission. Numerical basket ≠ overall legal permission.

## 8. Remaining production blockers

1. Public Neon rows lack `companyId`/`documentId` binding for counsel compile.
2. Counsel ACCEPT not run at corpus scale.
3. Attributed basketUsage not wired from product Position/Simulate callers.
4. No APPROVED financial snapshots on Neon public sources.
5. SemanticTruth / KF CERTIFIED empty — intentional epistemic wall.
6. #230 CI red — authentic matrix not land-ready.
7. Durable pilot requires **explicit human authorization** for Neon writes.

## 9. Merge recommendation (do not auto-merge)

```
Order (dependency-aware):

1. LAND #232 (this tip) as the single activation + A8 capacity + Agent8 suite vehicle
   - Includes #225, #227 (ancestors)
   - Capacity files ≡ #229 tip
   - Includes #229 Agent8 docs/scripts/tests (merged)
   - Includes utilization fail-closed in solver election

2. CLOSE as superseded / incorporated (manual):
   - #225 → superseded by #232
   - #227 → superseded by #232
   - #229 → incorporated by #232 (same capacity contract + suite now on #232)

3. DO NOT land #230 until its CI is green; then integrate at call sites only.

4. KEEP #220 open / land independently when ready for financial certificate ingest;
   wire approved snapshots into durable pilot — do not duplicate engines.

5. NO automatic merge. NO certification bypass. NO unauthorized Neon writes.
```

## 10. Durable activation pilot readiness

See `DURABLE-ACTIVATION-PILOT.md` — review-gated, ≤5 provisions, EVALUATION tenant, explicit human auth for every Neon write and legal ACCEPT. Stops at MODELED+VERIFIED; never auto-CERTIFIED.
