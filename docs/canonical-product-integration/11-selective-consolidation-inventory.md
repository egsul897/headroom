# Selective consolidation inventory (post-#298 gate)

**As of:** recorded against #293 tip `038fa626` and rebased #298 tip (see PR #298).  
**Policy:** Do not merge obsolete branches wholesale. Absorb unique safe deltas only.  
**Isolate:** PR #294 (Neon-first persistence) until financial approval, trusted issuer, and SSR authorization defects are resolved.

## Merge status of P0 absorption

| PR | Role | Status |
|----|------|--------|
| #298 | Selective undated/UNSUPPORTED fail-closed into #293 | **OPEN — required before #293→main** |
| #296 | Alternate wrong-doc fix + binder restore | **SUPERSEDED by #293+#298** — do not merge wholesale (duplicate binder / alternate governing-provision) |
| #297 | Adversarial remaining fixture + authority closure | **ABSORBED** into #293 via `60dbdeee` — close as superseded after tip confirm |

## Already on #293 tip (do not re-merge)

| PR | Topic | Evidence on tip |
|----|-------|-----------------|
| #283 | Operative restatement authority | binder + OA suite; wrong-doc guard `59c3c4b3` |
| #287 | Recursive legal context | context-retrieval tests in #293 vs main |
| #282 | Trusted identity boundary | `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION=BLOCKED` |
| #285 | Unified transaction execution | `unified-transaction-execution.test.ts` |
| #290 | Financial evidence pathway | capacity evidence integration |
| #291 | Disposable eval DB persistence docs | docs-only identity verification |
| #297 | Adversarial fixture closure | `60dbdeee` |

## Agent #11 documentation PRs (no production merge required)

| PR | Notes |
|----|-------|
| #295 / #299 / #292 / #286 | Acceptance artifacts / Round 2–2B docs. Archive or squash-docs only; do not treat as production blockers once #298 lands and tip retested. |

## Keep isolated

| PR | Reason |
|----|--------|
| #294 | Neon-first persistence + Agent #9 durability — financial approval, trusted issuer, and SSR authorization defects unresolved. No merge into #293/main under this gate. |

## Stale stack PRs (pre-canonical; review before any selective port)

Many open PRs target older bases (`#250`, `#253`, flywheel forks, Stage D). Default: **no wholesale merge**. Candidates for *future* selective review only if a unique fix is absent from #293 tip:

- Solver/secured-capacity: #254, #256 (verify not already via #269/#250 lineage)
- FCE / unified Stage 5: #252, #257
- Flywheel structure: #259–#262
- Customer product unify: #221, #258

## Recommended human sequence

1. Approve + merge **#298 → #293**.
2. Reconfirm CI on resulting #293 HEAD.
3. Close #296 / #297 as superseded (after tip contains their unique safe deltas).
4. Human approve **#293 → main** only after step 2.
5. Leave #294 isolated.
