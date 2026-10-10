# Post-#237 integration mission — certified sequential + secured binding

**Branch:** `cursor/post-237-certified-sequential-10ff`  
**Base main:** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Auto-merge:** no · **Neon writes:** none · **Paid inference:** $0  

## What this PR contains

1. **#223 + #243 stack** rebased onto post-#229/#237 main:
   - Sequential execution routes only through `simulateVerifiedTransaction` / `evaluateVerifiedCapacity`
   - Architecture allowlist remains `["verified-execution.ts"]` only
   - `LedgerAppendSurface` typed as `LedgerWriteResult` (fixes #243 CI typecheck)
   - Shared-capacity pool identity under REQUIRE (from #243) **plus** preserved #229 `statusForAmount` / `NOT_SATISFIED` / A8-02 withholding
2. **Coherent secured false-favorable fix** in generalized `computeRemainingCapacityAfterDebtIncurrence`:
   - Floors package secured remaining to cross-document modeled binding (Indenture SSNL ≈ $4,041M)
   - Prevents CA TNL ≈ $5,129M from publishing as secured package remaining when solver coverage omits the tighter instrument

## Explicit non-goals

- Does not merge #213 UCP (tip `4ea51390` on main but CI FAIL — remaining gated on #237; dual façade with #221/#218 unresolved)
- Does not absorb #231 product workflow wholesale (`lib/solver` diverges from main)
- Does not fabricate Neon completeness certificates or declare PRODUCT_VERIFIED_E2E_READY

## Local evidence (this tip)

| Suite | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `test:phase3-certification` | 481/481 |
| Sequential + recipes + verified-execution + A8 + architecture | 98/98 |
| Covenant-engine Coherent secured floor | PASS |
| `probe-gate-status` | `NOT_SATISFIED` / never AVAILABLE |
