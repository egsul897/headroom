# Phase E — Next-stage recommendation

**Propose Phase-3 compile now?** **No** — operative package not independently verified.

## When source is unblocked — minimum work

1. Commit hashed full EDGAR fixtures: Indenture Ex 4.1 + Am6 Ex 10.2 (+ governing CA body).
2. Replace package CA §6.01(j) excerpt with **verbatim** Am6 after-text including (y)/(z) (separate mission; permission-semantics freeze on this PR).
3. Correct debt/lien companions to EDGAR (Permitted Liens (2) ↔ Permitted Debt (1)(a) only).
4. Carry Am6 effectiveness as evidenced or `CONDITIONAL_UNRESOLVED` into IR.
5. Fix utilization attribution (Notes ≠ (1)(a)); include or explicitly refuse Refinancing Debt (17).
6. Only then: Phase-3 compile authentic debt + lien units → VEP.

## Reuse (do not build another engine)

- `lib/contract-model/compiler` (semantic compile / discovery)
- `lib/contract-model/phase3-certification` (`certifyCandidate`, `certifiedMapToVerifiedExecutionPackage`)
- `verified-executable-compile-bridge` (fixed-dollar GROSS only)
- `enumerateCertifiedPaths` / `attemptVerifiedSimulate`
- Amendment-chain SOURCE_BACKED before/after research
