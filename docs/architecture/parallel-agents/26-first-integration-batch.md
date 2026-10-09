# First integration-ready batch (V3 acceptance corrections)

**Published:** 2026-10-09T22:52:00Z  
**Main SHA (refresh):** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Auto-merge:** no · **Paid inference:** $0 · **Neon writes:** none  

This document is the **required next return** under V3 acceptance. It does **not** authorize merges.

---

## Moving heads (delta since V3 snapshot)

| PR | V3 / prior head | Current head | CI now | Note |
|---|---|---|---|---|
| **#229** | `d56386470bc4` → was PENDING | **`b33f86554e39`** | **ALL SUCCESS** · MERGEABLE/**CLEAN** | Advanced; **ready for human merge** |
| #217 | `7404bacfeebd` | **`76ca2516ae9a`** | **FAIL** (certified + soft gates) | Extraction gate holds — not Batch 0/1 |
| #221 | `1e45309580d7` | **`97fd17dc6723`** | PASS / CLEAN | UCP tip moved |
| #232 | `5a58cd63a34b` | **`f9b77f2098a7`** | **UNSTABLE** (checks pending) | Adopted #229 `NOT_SATISFIED` contract; still hold until after #229 + green CI |
| #216 | `c3d7c46e` | **`6cfa61d5`** (+ this tip) | PASS / CLEAN | Coordinator pack |
| #208 | — | **`2b89c202956d`** | PASS / CLEAN | Docs-only |

Never merge against a stale test result or superseded commit. Re-fetch before any human merge.

---

## Supersession / overlap (verified before landing)

| Pair | Relationship | Action |
|---|---|---|
| **#229 vs #232** | Same `state.ts`/`types.ts` content on tips (`NOT_SATISFIED` floor). #232 docs defer to #229 ownership. File collision if both land independently. | **Land #229 first.** Rebase/hold #232; keep capacity files identical to #229 |
| #215 / #227 / #232 | #227 ⊃ #215 wire; #232 ancestry ⊃ #225+#227 | After #229: land **#225** then **#227**, *or* #232 alone once green (then close 225/227 as superseded). Close #215 as superseded either path |
| #214 / #230 | #230 preferred (51 authentic) | Both CI FAIL — hold |
| #213 / #218 / #221 | UI collision | Strip #218 UI; #221 façade; #213 honesty cherry-pick after CI |
| #222 / #228 | Stack OK | Land 222 then 228 |
| #223 / #228 | `verified-execution.ts` | Land 228; rebase 223 (CI FAIL) |

### Agent 1 legal extraction gate (#217)

Independent Cycle 4 audit: substantial candidate-level interpretation defects.  
**Hard rule:** do **not** auto-promote DISCOVERED → authoritative executable rules.  
Require: complete source evidence, operative document identity, resolved material conditions, entity scope, review.  
Preserve 61-case audit as regression cohort. **#217 CI FAIL — excluded from Batch 0/1.**

---

## BATCH 0 — docs (ready now; zero production risk)

| Field | Value |
|---|---|
| PR | **#208** |
| Head | `2b89c202956d` |
| Base | `bae24ced33fd` (= main) |
| Mergeability | MERGEABLE / **CLEAN** |
| CI on this SHA | Vercel **SUCCESS** · Preview Comments **SUCCESS** |
| Commits | `d5645a4dcd98` audit · `2b89c202956d` ending SHA |
| Files | `docs/product/primary-engine/00-capability-audit.md` |
| Dependencies | none |
| False favorables | none (docs) |
| Post-merge regressions | optional `npx tsc --noEmit` |

**Human merge recommendation:** APPROVE merge of **#208** @ `2b89c202956d`.

Optional same wave: **#216** coordinator docs (tip after this publish) — docs/tests under `docs/architecture/parallel-agents/**` only.

---

## BATCH 1 — first **production safety** batch (**READY NOW**)

### Recommendation: **APPROVE for human merge — #229 alone**

| Field | Value |
|---|---|
| PR | **#229** — A8-01 / A8-02 |
| Head (**do not use older**) | **`b33f86554e39`** |
| Branch | `cursor/a8-gate-status-remediation-4f52` |
| Base | `bae24ced33fd` (= main) |
| Mergeability | MERGEABLE / **CLEAN** |
| CI on this SHA | `certified path (provider-free)` **SUCCESS** · Vercel **SUCCESS** · Preview Comments **SUCCESS** |
| Production files | `lib/contract-model/runtime/capacity/state.ts`, `types.ts` |
| Also includes | Agent8 suite/docs · `a8-gate-status-regression.test.ts` · `scripts/agent8-independent-adversarial/*` · `scripts/phase-4c-gate.ts` · related capacity tests |
| Commits (tip chain) | `0bf8bc75979e` … `b33f86554e39` (9 commits; tip pins green CI) |
| Dependency verification | Exclusive owner of capacity `state.ts`/`types.ts`. #232 holds same files but defers contract to #229 — **hold #232**. #214 tests-only / FAIL. No other open PR owns these paths for merge. |
| Coordinator pre-merge regressions @ `b33f86554e39` | **197/197 pass** — `a8-gate-status-regression` (13) + `agent8-independent-adversarial` + full `tests/contract-model/runtime/capacity` |
| False favorables on tip | **0** observed in those suites (failed gates → `NOT_SATISFIED`, never `AVAILABLE`) |
| Must demonstrate on integrated main after merge | Failed gates never AVAILABLE · A8-02 shared deficit non-authoritative |

**Explicit human merge recommendation:** Merge **#229 only** at head **`b33f86554e39`** (re-fetch SHA immediately before merge). Do **not** merge #232 in the same batch. Immediately run post-merge regressions on main. If any false favorable appears, stop and remediate — do not continue the wave.

### Post-merge regressions (required on integrated main)

```bash
npx tsc --noEmit
npx vitest run tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts
npx vitest run tests/agent8-independent-adversarial
npx vitest run tests/contract-model/runtime/capacity
npx tsx scripts/agent8-independent-adversarial/probe-gate-status.ts
```

Report: successful executions **and** correct refusals. False favorables must be 0.

---

## BATCH 2 — next candidate (after Batch 1; not yet)

1. **#225** `d2d1dca0b542` (PASS/CLEAN) — extraction  
2. **#227** `8b81dffb6ec0` (PASS/CLEAN) — usage wire + activation proof (**still not #215b**)  
3. **or** wait for **#232** `f9b77f2098a7` green CI (⊃ 225+227 + matrix); rebase if #229 landed first  

**BLK-USAGE-ZERO remains OPEN** until #215b-equivalent (status fail-closed for omitted/external/entity usage) **and** `run-package-path.ts` ledger=0 fix are verified on integrated main.

---

## Safety checklist (hard gate — Batch 1 addresses A8 only)

| Requirement | Status after Batch 1 merge |
|---|---|
| Failed gates never AVAILABLE | **Closed by #229** on integrated tree (verify post-merge) |
| Unknown utilization never zero | Still open — #213 tip CI FAIL; solver #227/#232 partial; **#215b open** |
| Empty ledger ≠ proven unused | Phase-4C NOT_DETERMINED on main for empty usage; solver path still risky |
| Shared-capacity deficits non-authoritative | A8-02 in #229 |
| External/entity usage unknown or preserved | Still returns 0 without fail-closed status propagation |
| No unsupported favorable remaining in customer UI | Overview paint until #213 honesty lands |

---

## Remaining safety blockers (after Batches 0–1)

1. **#215b** + `run-package-path.ts` — do not close BLK-USAGE-ZERO  
2. **#232** hold until post-#229 rebase + full green CI  
3. **#213 CI FAIL** — Position honesty not on main  
4. **#217 FAIL** + legal extraction promotion gate  
5. **#230 / #214 / #223** CI FAIL — hold  

---

## Authentic E2E levels (unchanged discipline)

L1 synthetic financials · L2 approved financials · L3 attributed utilization · L4 cross-doc verified · L5 customer-ready certified  

Complete L5 trace still blocked at: utilization attribution (#215b), certification, unified UI. Batch 1 unblocks A8-01 on the capacity status path.

---

## Regressions executed this session (coordinator)

| Surface | Result |
|---|---|
| GitHub refresh (heads/CI/mergeability) | Done — #229 CLEAN; #232 tip moved |
| Diff #229 vs #232 `state.ts`/`types.ts` | **Identical** on current tips; #232 docs defer to #229 |
| Main baseline | `a8-gate-status-regression` **absent** (expected) |
| #229 tip `b33f86554e39` capacity + A8 suites | **197 passed / 0 failed** |

---

## Explicit asks for humans

1. **Merge Batch 0 (optional docs):** #208 @ `2b89c202956d`.  
2. **Merge Batch 1 (priority safety):** #229 @ **`b33f86554e39`** — re-fetch before merge.  
3. **Hold** #232 until after #229 + green CI on its then-current tip.  
4. Do **not** promote Agent1/#217 candidates to authoritative rules while CI red / audit open.  
5. No automatic merges · no unauthorized Neon writes.
