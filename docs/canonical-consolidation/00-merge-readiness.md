# Canonical consolidation — merge readiness

**Generated:** 2026-10-11 (final merge-readiness agent)  
**Does not authorize self-merge.** Human merge only.  
**Production activation remains BLOCKED.** No production Neon writes.

## SHAs (refreshed)

| Ref | SHA |
|---|---|
| `origin/main` | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` |
| Mission start #293 | `038fa626ab5f32b4e0c7481c69fa98f52841e822` |
| Mission start #294 | `117af07aa20c370d443159e3c60096eb23122f45` |
| **CURRENT #293 tip** | `2ab1ac78c2df257963f583144ff904f1e5918c90` |
| **CURRENT #294 tip** | `a3f2a6fb20ea1b77cf2d7ade99dfc7144e20190a` |
| #298 tip (open, ABSORBED) | `425a177a698819cc582c1dcf6346a89f22874c4c` |

## Exact-tip CI

| PR | Tip | Certified path | Vercel | Soft gates |
|---|---|---|---|---|
| #293 | `2ab1ac78` | SUCCESS `38174531670` | PASS (deployment completed) | n/a |
| #294 | `a3f2a6fb` | SUCCESS `38174476175` / push `38174472728` | PASS | all SUCCESS |

Mission-cited older runs: #293 `38174166506` was SUCCESS on prior tip `038fa626` (superseded). #294 `38174174942` was FAILURE on prior tip `117af07a` (superseded by IdP-approval + tsc fix tip).

## #298 status

- **Merged via GitHub merge button:** NO.
- **Production absorbed onto #293 tip:** YES (`e291848d` / `df23bc71` undated + `UNSUPPORTED` competitor fail-closed in `governing-provision.ts`).
- Tip commit `2ab1ac78` adds regression coverage for UNSUPPORTED competing successors.
- Positive-confirmation operative-identity gate preserved (`identityConfirmed` requires confirmed chain + `mayConsolidate` + zero provisional).
- Close #298 as absorbed; do **not** re-merge wholesale (CONFLICTING vs advanced tip; production hunks already match).

## Exact-tip Phase 3 / authority

Evidence: `docs/canonical-product-integration/evidence/2026-10-11-exact-tip-final-gate.txt`

- Authority + adversarial suite: **56/56 PASS**
- Phase 3 certification: **481/481 PASS**

## #293 status

- OPEN → `main`, `MERGEABLE` / `CLEAN`, not draft.
- Required checks green on exact tip (including Vercel).
- Missing Fourth A&R / AutoNation financial package are **capability** blockers (CB-1/CB-4), **not** safety merge blockers.
- Reviews: none yet — human approval still required by branch protection.

## #294 status

- OPEN draft → `main`, `MERGEABLE` / `CLEAN`.
- Financial approval trust boundary closed: `approvedAt` minted only via `approveFinancialEvidenceBundle` + IdP `authorizeDecision(APPROVE_FINANCIAL_METRIC)`; caller `approvalEvent` / forged `TRUSTED_ISSUER` ActorProvenance ignored on persist.
- Disposable-Postgres adversarial: authorization + financial-evidence suites **30/30 PASS**.
- Lags #293 by one test-only commit (`2ab1ac78`); production undated/UNSUPPORTED already present via earlier absorb.
- Keep separate until after #293 human-merge; mark ready for review (undraft) only when human chooses persistence track.

## Human actions required

1. Human-approve and merge **#293 → main** (do not self-merge).
2. Close/supersede **#298** as ABSORBED.
3. Keep production IdP / `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION` **BLOCKED**.
4. After #293 lands: rebase/absorb tip into #294, undraft when ready, then human-merge #294 separately.
5. Do not write to production Neon; do not advance North Star phase gates on refusal-only evidence.
