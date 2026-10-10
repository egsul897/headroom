# Reconciliation V4 acceptance report

**Published:** 2026-10-10T00:06:00Z  
**Controlling:** yes — **supersedes** V3 acceptance Batch-1 merge plan (`26-first-integration-batch.md`)  
**Main SHA (refresh):** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Auto-merge:** no · **Paid inference:** $0 · **Neon writes:** none · **Certification bypass:** none  

---

## 0. Stale plan withdrawal (mandatory)

| Obsolete ask | Status |
|---|---|
| Merge **#229** (V3 Batch 1) | **WITHDRAWN.** #229 is **MERGED** at `b99f934b` (2026-10-09T23:10:20Z). Preserve merge history and A8-01/A8-02. **Do not remerge, close as superseded, or reimplement.** |
| Hold #232 until after #229 | **OBSOLETE.** #229 landed; #232/#234 content reconciled onto main via **#237**. |
| Coordinator combined tip `cursor/v4-232-234-integration-10ff` @ `5a5a2169` | **Verification-only artifact** built before discovering #237 on main. **Do not merge.** Prefer #237 already on main. |

---

## 1. Current main (integrated truth)

| Field | Value |
|---|---|
| Tip | **`7f1dd3a202b026b9a862ef727480a1a9f284523a`** |
| Includes | **#229** A8-01/A8-02 · **#237** utilization authority (#232+#234 reconcile) · #225/#227 ancestry via activation path |
| A8 capacity files | `state.ts` / `types.ts` **byte-identical** to #229 tip `b33f86554e39` |
| Authority module | `lib/capacity/utilization-authority.ts` — single remaining-claim gate |
| CI on tip | certified path **SUCCESS** · soft gates **SUCCESS** (dashboard/feeds/home/P3-R0) |

### Utilization / remaining-capacity contract (on main)

| Rule | Enforcement |
|---|---|
| Attributed/approved usage alone ≠ remaining OK | `supportsRemainingClaim` requires completeness cert |
| Empty / unknown / partial / external / synthetic | **No** favorable remaining (`mayPublishAvailable=false`) |
| Solver + capacity + debt-intelligence | Share authority via `utilization-authority` / `verified-remaining` / `mayPublishAvailable` |
| Failed gates never AVAILABLE | A8 `NOT_SATISFIED` via `statusForAmount` |

---

## 2. #232 / #234 disposition

| PR | Tip (founder-verified) | Base | CI | Disposition |
|---|---|---|---|---|
| **#232** | `5b208705d3dc64e489dc092f36e1b03be62ff1c7` | post-#229 `b99f934b` | CLEAN / all SUCCESS | **Superseded by #237** — do **not** merge independently |
| **#234** | `91996d1b79a039f61c6494b78e874d59797f7d62` | older `bae24ced` | SUCCESS on tip; base stale | **Superseded by #237** — rebase-not-required if closing |
| **#237** | merged `7f1dd3a2` | — | landed | **Canonical combined integration** |

**Human action:** close #232 and #234 as superseded-by-#237 (preserve tips for history).  
**Do not** merge competing combines **#239** (DIRTY/FAIL) or **#241** (DIRTY) onto post-#237 main.

---

## 3. Active PR reconcile vs current main (priority slice)

| PR | Head | vs main | CI / merge | V4 action |
|---|---|---|---|---|
| #229 | merged | on main | — | preserve only |
| #237 | merged | on main | — | preserve; controlling util batch |
| #232 | `5b208705d3dc` | superseded content | CLEAN | **close superseded** |
| #234 | `91996d1b79a0` | superseded content | tip green / stale base | **close superseded** |
| #239 | `e186543f761f` | obsolete combine | CONFLICTING / FAIL | **close / do not merge** |
| #241 | `1975e6c48195` | obsolete combine | CONFLICTING | **close / do not merge** |
| #242 | `e326585b8fbe` | docs close-out on main base | — | optional docs merge |
| #236 / #235 | A8 close-out docs | docs | — | optional; do not reimplement A8 |
| #208 | `2b89c202956d` | docs-only vs older base | tip green | **optional docs**; must not delay critical work |
| #217 | `f7be99edbf1f` | Cycle 5 | CLEAN | **extraction gate** — DISCOVERED ≠ authoritative executable |
| #216 | coordinator | docs | — | this pack |
| #213 / #218 / #221 | UCP / cross-doc | pre-#229 bases | mixed | next product wave after util settle |
| #222 → #228 | Stage D | pre-#229 bases | CLEAN tips | rebase onto current main before land |
| #223 | TE recipes | — | CLEAN tip | after #228; rebase |
| #214 / #230 | capacity matrices | — | FAIL/UNSTABLE | hold; matrix largely absorbed via #237 path |

---

## 4. Regressions executed on integrated main `7f1dd3a2`

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:phase3-certification` (certified path) | **481/481 PASS** |
| Capacity + A8 + authentic execution + solver shared-usage + extraction + intelligence-factory | **284/284 PASS** (18 files) |
| `probe-gate-status.ts` | status **`NOT_SATISFIED`**; `statusIsNotAvailable=true` |
| Product: authoritative-capacity, debt-intelligence-dashboard, north-star-customer-workflow | **3/3 PASS** |
| False favorables in above | **0 observed** |
| Pre-existing product-acceptance drift (also on prior main) | known; **not** introduced by #237 |

Coordinator also built obsolete combine `5a5a2169` (#232∪#234) earlier this session (**296** capacity-adjacent PASS, phase3 **481** PASS) — superseded by discovering #237 already on main; retained only as evidence that the pair merges cleanly.

---

## 5. BLK-USAGE-ZERO (remains OPEN)

| Path | Status on `7f1dd3a2` |
|---|---|
| Capacity status A8-01/A8-02 | **Closed** on main |
| Solver / shared-usage / utilization-authority | Fail-closed remaining claims on main |
| Debt-intelligence remaining publication | Guarded via `mayPublishAvailable` / `supportsRemainingClaim` |
| `lib/product/legal-intelligence/run-package-path.ts` | **Still `ledger = 0`** (demo path) — blocker not closed |
| Neon production completeness certificates bound to live epochs | **Not populated** — contract fail-closed; no certification bypass |
| All customer-facing consumers identical authority | Core engine/product paths aligned; residual demo/legacy paths require continued audit |

**Do not close BLK-USAGE-ZERO** until every relevant production path demonstrably fail-closes or has defensible evidence.

---

## 6. Agent 1 / #217 gate

#217 Cycle 5 tip `f7be99edbf1f` may be CI-clean.  
**Hard rule unchanged:** do **not** auto-promote DISCOVERED candidates into authoritative executable rules.  
Require complete source evidence, operative document identity, resolved material conditions, entity scope, review.  
Preserve the 61-case audit as regression cohort.

---

## 7. Dependency order (forward)

1. **Hygiene (human):** close #232, #234, #239, #241 as superseded; optionally merge docs #242 / #236 / #208 (non-blocking).  
2. **Do not** land further #232/#234 fork combines.  
3. Rebase product stacks onto **`7f1dd3a2`** before any production merge: #222→#228; UCP (#213 honesty / #221 façade; strip #218 UI collision).  
4. Residual BLK-USAGE-ZERO: `run-package-path` + consumer audit + Neon completeness evidence.  
5. Keep #217 discoveries non-authoritative.

---

## 8. Explicit human merge recommendation (V4)

| Priority | Action | SHA / note |
|---|---|---|
| **DONE** | #229 | merged — preserve |
| **DONE** | #237 (#232+#234 authority) | `7f1dd3a2` — preserve |
| **NOW** | Close superseded opens | #232 @ `5b208705…`, #234 @ `91996d1b…`, #239, #241 |
| **Optional docs** | #208 @ `2b89c202956d`, #242, #236 | must not delay product rebase wave |
| **Do not merge** | `cursor/v4-232-234-integration-10ff` | obsolete vs #237 |
| **Hold** | #217 authoritative promotion | extraction gate |

No automatic merges. No unauthorized Neon writes. No paid inference. No certification bypasses.

---

## 9. Authentic E2E levels

L1–L2 improved on main (activation + gross authentic matrix path).  
L3 attributed utilization: authority fail-closed; **production completeness evidence still missing**.  
L4–L5: still blocked on certification completeness + unified customer product on current main.
