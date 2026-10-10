# Agent 8 — Adversarial continuation report (post-#229 / #237)

**Independent correctness agent.** Does not merge implementation fixes.  
**SHA tested (main):** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Generated via:** `scripts/agent8-independent-adversarial/run-continuation.ts`

## Integration context

| Item | Status |
|---|---|
| #229 A8-01/A8-02 | Merged — CLOSED on main |
| #237 utilization authority | Merged — on main |
| #243 certified sequential execution | **OPEN / DRAFT** — ~25 behind main; **reintroduces A8-01** on tip `8bc6112e` |
| #213 Position / Simulate / Ask | **OPEN / DRAFT** — ~25 behind main; must consume main capacity + utilization contracts after rebase |

## Metrics (continuation matrix)

| Metric | Value |
|---:|
| SHA tested | `7f1dd3a2` |
| Independent grounded scenarios (unique) | 6 |
| Total continuation cases | 7 |
| Passed on main-integrated expectations | 6 |
| False favorables (incl. pending tip) | **1** (pending #243 only) |
| False favorables on main tip | **0** |
| False refusals | 0 |
| Material omissions | 0 |
| Mutation detection rate | **1.0** |
| Certified-path / A8 regressions (companion) | a8-gate 13/13; Agent8 32/32; util 13/13; shared-usage 6/6 |

## Newly discovered defects

### DEFECT-A8-03 — Pending PR #243 reintroduces AVAILABLE + GATE_NOT_SATISFIED (P0)

| Field | Value |
|---|---|
| Exact affected SHA | `8bc6112efdf499cd36ead440d37cf37de7145b9e` (PR #243 tip) |
| Minimal repro | `git worktree add /tmp/a8-wt-243 origin/cursor/sequential-verified-boundary-8970` then copy `probe-gate-status.ts` and run it; or `A8_TIP_ROOT=/tmp/a8-wt-243 npx tsx scripts/agent8-independent-adversarial/probe-pending-integration-risk.ts` |
| Expected legally correct outcome | Failed FLNL gate → `status=NOT_SATISFIED`, amount `GATE_NOT_SATISFIED`; never AVAILABLE |
| Actual engine outcome | `status=AVAILABLE`, amount `GATE_NOT_SATISFIED`; simulate path NOT_SATISFIED but `capacityStatus=AVAILABLE` |
| Severity | **CRITICAL_FALSE_PERMISSION** (P0) |
| Production reachability | Not on `main` yet; **would reach production if #243 merges without rebase** |
| Responsible area | `lib/contract-model/runtime/capacity/{state,types}.ts` on #243 tip (pre-#229 ancestry) |
| Regression | `tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts`; `probe-gate-status.ts`; CONT-06 |
| Fix recommendation | Rebase #243 onto `main` ≥ `7f1dd3a2`; preserve `statusForAmount` + `NOT_SATISFIED`; re-apply only sequential/pool verification edits atop that floor |
| Retest after remediation | Pending — tip not yet rebased |

## Previously discovered defects

| ID | Status on main `7f1dd3a2` |
|---|---|
| DEFECT-A8-01 | **CLOSED** (reconfirmed CONT-05) |
| DEFECT-A8-02 | **CLOSED** (utilization + shared withhold still present) |

## Mutation challenge

Isolated temp-tree mutation collapsing `statusForAmount` to identity → probe returns `AVAILABLE`. Detection rate **1.0**. Production tree untouched.

## Position / Simulate / Ask

On main, `buildSharedProductCapacityViews` keeps identical authority across surfaces; empty util → GROSS_ONLY; failed gate → GATE_FAILED / not AVAILABLE (CONT-01, CONT-02).  
PR #213 product UI bridges not yet on main — track rebase for consumer compliance with utilization authority.

## Remaining untested legal mechanics (priority backlog)

1. Operative-document selection under amendment chains (blind holdouts preserved)
2. Entity-scope COUNTERPARTY / non-guarantor sub-caps in sequential verified path (#243 after rebase)
3. Cross-document shared-cap + utilization completeness together
4. #213 UI path publishing remaining without completeness cert
5. Multi-step sequential transaction state after certified adapter (#243)
6. Authentic Neon attributed utilization (still blocked — no invented certificates)

## Coordination note

Deliver DEFECT-A8-03 to integration owner of #243. **Do not merge #243** until rebase restores A8 floor. Agent 8 will not independently merge fixes.
