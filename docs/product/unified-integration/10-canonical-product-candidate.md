# Canonical integrated product candidate

**Branch:** `cursor/canonical-integrated-product-10ff`  
**Tip:** `db5f1ef22f9f4def02253639167d62b7d28c6464`  
**Base:** #250 tip `ac0ff925` (Stages 2–5 stacked on main `7f1dd3a2`)  
**Auto-merge:** no · **Neon writes:** none · **Paid inference:** $0  

## Composition

| Input | Tip | Role in candidate |
|---|---|---|
| main | `7f1dd3a2` | #229 A8 + #237 utilization authority |
| #247 | `0838455d` | Verified sequential (via #250 ancestry) |
| #248 | `dd727d2b` | Financial certificate engine (via #250) |
| #249 | `f6322ed7` | Entity-scope + cross-document (via #250) |
| #250 | `ac0ff925` | Unified Position/Simulate/Ask stack base |
| #251 | `887d7011` | Sequential overlap → **superseded**; LedgerWriteResult typing retained |
| #231 | `ee460cc3` / commit `b73f0828` | Solver debt+lien gate + counted/disregarded max + packageAuthoritative MODELED_CROSS_DOCUMENT (util-authority fail-closed **preserved** from #237/#250) |

## Semantics enforced

- Verified sequential → only `simulateVerifiedTransaction` / `evaluateVerifiedCapacity` (REQUIRE)
- Architecture allowlist: `verified-execution.ts` only
- #229 NOT_SATISFIED / A8-02 withholding preserved
- #237 `supportsRemainingClaim` / non-authoritative shared usage → UNKNOWN (not favorable remaining)
- Solver vs modeled cross-document disagreement → `packageAuthoritative` with `NON_AUTHORITATIVE_DIAGNOSTIC`; customer remaining = MODELED_CROSS_DOCUMENT
- Secured debt legs require own lien path (no free-ride on another leg’s auto-lien)
- `run-package-path.ts`: empty/missing ledger ≠ proven unused capacity

## Local evidence (pre-CI)

- `tsc --noEmit` PASS
- `test:phase3-certification` 481/481
- Core product/solver/sequential/FCE/A8/util/cross-doc/Stage-D: **283/283** (provider-free)
- Neon-dependent suites deferred to GitHub CI (no unauthorized Neon writes from this environment)

## Authentic-production limitations

- Completeness certificates for live Neon epochs not populated
- MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not NS-4 APPROVED production remaining
- LEGACY Simulate/Ask paths remain labeled when VEP absent; must not be read as certified permission
