# A8-01 / A8-02 production remediation — exclusive ownership

**Owner branch:** `cursor/a8-gate-status-remediation-4f52`  
**Base:** `origin/main` @ `bae24ced` + cherry-picked Agent 8 suite (`0bf8bc75`)  
**Shared files claimed:**  
- `lib/contract-model/runtime/capacity/state.ts`  
- `lib/contract-model/runtime/capacity/types.ts`  

**Reconciled open PRs (2026-10-09):**  
- PR #214 — tests only (`capacity-mathematics-matrix.test.ts`); no `state.ts`/`types.ts` conflict.  
- PR #136 — `graph.ts` only; no `state.ts` conflict.  
- PR #224 — Agent 8 report (docs/scripts/tests); suite cherry-picked into this branch.  
- No other open PR edits `capacity/state.ts` or `CapacityStatus`.

**Rule:** Competing agents must not land alternate A8-01/A8-02 fixes on these files while this branch is open. No automatic merge.
