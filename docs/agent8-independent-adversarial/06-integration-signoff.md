# A8 remediation — integration sign-off (PR #229)

**Integration candidate:** PR #229 → `main`  
**Head SHA under review:** PR tip at CI time (verify `gh pr view 229 --json headRefOid` matches CI `headSha`)  
**Independent correctness owner:** Agent 8  
**Production ownership:** exclusive on `lib/contract-model/runtime/capacity/{state,types}.ts` (see `03-remediation-ownership.md`)

## 1. CI on exact head SHA

| Field | Value |
|---|---|
| Tip SHA | `e606942fbb3b2ea07f00a99d132711198dc60be3` |
| Run | https://github.com/egsul897/headroom/actions/runs/38000824414 |
| certified path (provider-free) | **SUCCESS** |
| Vercel | **pass** |
| Vercel Preview Comments | **SUCCESS** |
| Aggregate | **all required checks green on tip** |

No automatic merge.

## 2. `CapacityStatus.NOT_SATISFIED` compatibility

| Surface | Result |
|---|---|
| `CapacityStatus` union + `CAPACITY_STATUS_PRECEDENCE` (`Record<CapacityStatus, number>`) | Exhaustive; `NOT_SATISFIED` precedence 1 (worse than AVAILABLE, better than NEEDS_INPUT) |
| `statusFromEvaluation` | Unchanged mapping EXECUTABLE→AVAILABLE; **must not** be the sole publisher |
| `statusForAmount` | Floors any `GATE_NOT_SATISFIED` amount to `NOT_SATISFIED` via `worst` |
| Shared-constraint publisher | Calls `statusForAmount(remaining, …)` |
| Rule-capacity publisher | Calls `statusForAmount` on localEffective/remaining/gross GATE_NOT_SATISFIED |
| Transaction `simulate` | Amount-kind path returns `NOT_SATISFIED` for `GATE_NOT_SATISFIED`; carries `capacityStatus` |
| Zod / Prisma persisted capacity status | No separate persisted enum of Phase-4C capacity status; JSON serialization carries string status |
| Hardcoded allowlists | Updated: `phase3-fixture-proof.test.ts`, `scripts/phase-4c-gate.ts` artifact statuses, `docs/product-readiness/00-repository-map.md` |
| UI `CovenantOverview` / `status-labels` | Separate product enums; do not switch on Phase-4C `CapacityStatus` |
| `AuthoritativeCapacityStatus` (north-star) | Separate product enum; not a Phase-4C mirror |

No incompatible invented enums. Distinctions preserved: AVAILABLE / NOT_SATISFIED / NEEDS_INPUT / REVIEW_REQUIRED / AMBIGUOUS / UNSUPPORTED / ERROR (PROHIBITED remains out of scope — not a Phase-4C capacity status).

## 3. Amount-kind status floor (rule + shared)

Both publishers apply `statusForAmount` before publish. A failed gate cannot remain `AVAILABLE`.

## 4. A8-02 over-consumption

On shared `OVER_CONSUMPTION`: status `REVIEW_REQUIRED`, published `remaining`/`gross` withheld as `NOT_DETERMINED`, deficit retained under `overConsumption.deficit` and `provisional.remaining`. Healthy pools still publish positive remaining as `AVAILABLE`.

## 5. Integrated regression (this candidate tree)

```
npx vitest run tests/contract-model/runtime/capacity \
  tests/contract-model/runtime/transaction \
  tests/contract-model/cross-document-graph.test.ts \
  tests/contract-model/definition-mediated-shared-capacity.test.ts \
  tests/contract-model/certified/shared-capacity.test.ts \
  tests/agent8-independent-adversarial \
  tests/product/authoritative-capacity.test.ts \
  tests/product/transaction-analysis.test.ts \
  tests/product/certified-transaction-gate.test.ts \
  tests/covenant-engine-capacity-semantics.test.ts
```

**Result:** 24 files, **413 passed**, 0 failed.

Agent 8 matrix: **32/32**, incorrect favorable **0**, incorrect refusal **0**, release-blocking **0**.

Probe: `status=NOT_SATISFIED`, amount `GATE_NOT_SATISFIED`, simulate `NOT_SATISFIED`.

## 6. Overlapping PRs

| PR | Touches `capacity/state.ts` or `types.ts`? | Note |
|---|---|---|
| **#229** | **YES — exclusive owner** | This remediation |
| #230 | No | Authentic execution scripts/tests/docs only |
| #214 | No | Mathematics matrix tests/helpers |
| #215 | No | SharedConstraint usage wire (not state publisher) |
| #136 | `graph.ts` only | No statusFromEvaluation |
| #213/#221/#218 | Product surfaces | Must consume corrected status after merge; no competing floor |

No open PR reintroduces bare `statusFromEvaluation` → AVAILABLE without `statusForAmount`.

## 7. Independent Agent 8 sign-off

Against **`main` after authorized merge of PR #229** (`b99f934b`):

- **A8-01:** **CLOSED** — verified on `main` (see `07-post-merge-close.md`).
- **A8-02:** **CLOSED** — verified on `main`.
- **False-permission count:** **0**.
- **Post-merge evidence:** probe `NOT_SATISFIED`; Agent 8 **32/32**; integrated suite **413 passed**.
- **Merged:** 2026-10-09T23:10:20Z (human-authorized; not auto-merge). Tip `b33f8655` is ancestor of `main`.

## 8. Remaining blockers

- **None for A8-01 / A8-02.**
- Next: silent-zero utilization + rebase/reconcile #232 onto post-#229 `main` (see `docs/architecture/parallel-agents/27-post-229-integration-batch.md`). Do not auto-merge unrelated PRs.
