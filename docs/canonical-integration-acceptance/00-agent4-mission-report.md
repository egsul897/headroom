# Agent 4 — Canonical Integration & Independent Product Acceptance

**Role:** Independent integration / acceptance authority  
**Does not authorize self-merge.** Human merge only.  
**Production activation remains BLOCKED.** No production Neon writes performed by this agent.  
**Agent completion reports are not evidence.** All verdicts below cite code, diffs, tests, or GitHub CI.

**Inspected at (UTC):** 2026-10-11T23:42:42Z  
**Agent run:** https://cursor.com/agents/bc-01a12d52-bbcc-767d-99e3-0518a77ee3ce

---

## 1. Actual main SHA

| Ref | SHA |
| --- | --- |
| **`origin/main`** | **`67027b8f499921a12cee7b9b9f04d832898b6384`** |
| Merge commit | `Merge pull request #306 from egsul897/cursor/p0-competing-restatement-authority-509f` |
| #306 fix commit | `b33710cff1b81c821ae3ec65cfbfae9c67fbcfcf` |
| Prior tip (#293) | `440dd65d42c2e9f6b92978fa4f04a92658de190c` |

**PR #306 confirmed MERGED** at 2026-10-11T23:29:52Z.  
Main CI: `canonical-compiler` SUCCESS on `67027b8f` — https://github.com/egsul897/headroom/actions/runs/38184494968

Local VM checkout was stale at `440dd65d` until `git fetch origin main`.

---

## 2. Open PR inventory (active / material)

| PR | Tip | Base | Mergeable | #306 ancestry | Role | CI (exact tip) |
| --- | --- | --- | --- | --- | --- | --- |
| **#294** | `9a46595d668d` | main | MERGEABLE | YES | Neon-first persistence foundation | certified SUCCESS `38184616188`; soft gates SUCCESS |
| **#304** | `9505ea66f205` | main | MERGEABLE | YES | Matthews restricted slice + fixed-dollar VE Position | certified SUCCESS `38185091567`; home-overview SUCCESS |
| **#307** | `55668a95d0b8` | **#304 branch** | MERGEABLE | YES (via #304) | Autonomous fixed-dollar candidate discovery | stacks on #304 — merge only after #304 |
| **#308** | `58af9a2ff7dd` | main | MERGEABLE | YES | Agent 2 verified remaining capacity integration | Vercel pending at inspect; local tests 33/33 |
| **#305** | `6bdf3e78aac8` | pre-#306 main | **CONFLICTING** | **NO** | Title already `SUPERSEDED by #306` | Do not merge |
| **#303** | `011ee05fc287` | main | MERGEABLE | n/a (older offline slice) | Superseded by #304 product path | certified FAILURE historically; close as superseded |
| **#301** | docs | #293 tip | MERGEABLE | n/a | Docs-only consolidation inventory | Non-blocking; do not treat as product merge |

Stale / stacked / conflicting open PRs (`#246`, `#251`–`#264`, `#220`/`#221`/`#230`/`#231`, etc.) remain **non-candidates** relative to post-#293/#306 main. Do not revive without full rebase onto `67027b8f` and re-acceptance.

### Parallel agents (this mission wave)

| Agent | Cloud id | PR / branch | Status |
| --- | --- | --- | --- |
| Agent 1 — Autonomous covenant compilation | `bc-01a12d52-3442-7efc-95be-1487d3dcb53f` | **No PR / no branch tip published at inspect** | RUNNING — not mergeable |
| Agent 2 — Verified remaining capacity | `bc-01a12d52-6435-709a-9d04-3c82c8359f27` | **#308** `cursor/verified-remaining-capacity-integration-9f27` | OPEN, MERGEABLE, based on main+#306 |
| Agent 3 — E2E CFO product workflow | `bc-01a12d52-8ffe-7042-84b0-77339008d829` | **No PR / no branch tip published at inspect** | RUNNING — not mergeable |
| Persistence consolidation | `bc-01a12cbc-cde9-70a0-bd69-4074292fb2b0` | **#294** | OPEN |
| Dashboard slice | `bc-01a12cc4-222d-79f6-ba85-4b2bbc302ca3` | **#304** (+ #307 child) | OPEN / still pushing |

---

## 3. Merged functionality (on `67027b8f`)

Already on main (via #293 merge tree + #306):

- Canonical unified verified transaction execution (`executeUnifiedVerifiedTransaction`) and product handoffs.
- Operative restatement authority including **#306 later/undated unresolved competing successor fail-closed** (`governing-provision.ts`, `production-authority-gate.ts`).
- Wrong-document / undated / UNSUPPORTED competitor guards (absorbed from #296/#298).
- Financial evidence + utilization reconstruction pathway (#273/#279/#290).
- Trusted-identity / trusted-issuer boundaries with **`TRUSTED_IDENTITY_PRODUCTION_ACTIVATION = BLOCKED`**.
- Customer-workflow truthful status contract (#275/#280).
- Package-graph identity handoff (#274) and disposable EVAL persistence proof docs (#291).
- Phase 3 certification suites (provider-free).

---

## 4. Branch-only functionality

| Surface | Branch-only | Notes |
| --- | --- | --- |
| Institutional memory Prisma models + `lib/persistence/*` + VTE persist bridge | **#294** | Disposable Postgres acceptance; production writes refused |
| Matthews Position vertical slice + VE fixed-dollar bridge + MHK §7.03(f) | **#304** | Fixture-modeled leaf capacity + bounded source-backed gross VE |
| Autonomous FD candidate discovery | **#307** | Child of #304; not independently main-based for merge |
| `evaluateVerifiedRemainingCapacity` orchestrator + completeness ladder | **#308** | Reuses `evaluateCapacityState` / `computeVerifiedRemaining`; demo remaining only |
| Agent 1 autonomous compilation productization | **none published** | In flight |
| Agent 3 CFO E2E workflow productization | **none published** | In flight |

---

## 5. Integration conflicts

| Conflict | Severity | Action |
| --- | --- | --- |
| **#305 vs #306** | P0 process | #305 CONFLICTING and lacks `b33710cf`. Already titled SUPERSEDED. **Close; do not merge.** |
| **#303 vs #304** | P1 redundancy | Older offline Matthews slice superseded by #304 post-#306 tip. **Close #303.** |
| **#307 base = #304 branch** | P1 sequencing | Must land after #304 (or fold into #304). Rebase onto main after #304 merges. |
| **#304 leaf capacity vs certified VTE** | P1 abstraction | Leaf `evaluateProvision` path remains Matthews-hardcoded; VE bridge is separate and honest about GROSS. Do not promote leaf path as autonomous IR. |
| **#308 new orchestrator vs VTE `evaluateVerifiedCapacity`** | P2 watch | #308 reuses Phase 4C + `computeVerifiedRemaining` (not a second solver). Require Agent 3 / product surfaces to call this **or** VTE — not both with divergent remaining semantics. |
| **#294 vs #304 / #308 file overlap** | None | Zero shared paths — safe parallel human merges after #306. |
| **Stale stacked PRs (#220/#221/#230/#253/#258…)** | P2 noise | Do not merge; conflict with consolidated main. |
| **Agents 1 & 3 unpublished** | P1 process | Block any claim of compiler/workflow completion until tip SHA + PR exist on post-#306 main. |

### #306 retention (mandatory)

Verified with `git merge-base --is-ancestor b33710cf <tip>`:

- #294 YES  
- #304 YES  
- #307 YES (via #304)  
- #308 YES  
- #305 NO → reject

Local retest of `tests/operative-restatement-authority/later-unresolved-successor-guard.test.ts`: **6/6 PASS** on main, #304 tip, #294 tip, #308 tip.

---

## 6. Canonical interface map (enforce one implementation)

| # | Responsibility | Canonical on main | Acceptable branch extension | Reject |
| --- | --- | --- | --- | --- |
| 1 | Document/package identity | `package-graph` / #274 handoff | — | Unsafe #246 expansion |
| 2 | Operative legal authority | `lib/contract-model/compiler/operative-authority/*` (+ #306) | — | Any CONFIRMED_OPERATIVE bypass |
| 3 | Source-backed executable IR | Phase-3 certified compile + fixed-dollar/greater-of compilers | #304 VE core / #307 discovery **feeding those compilers** | Hardcoded leaf `CovenantProvisionInput` as “compiled IR” |
| 4 | Financial evidence | `lib/capacity/financial-evidence*` + #290 normalize | #294 persist; #308 `selectFinancialState` | Silent zero for missing metrics |
| 5 | Utilization & completeness | `utilization-evidence-reconstruction`, `utilization-authority`, completeness issuer | #294 persist; #308 completeness ladder | Empty ledger ⇒ unused basket |
| 6 | Capacity evaluation | `evaluateVerifiedCapacity` / Phase 4C `evaluateCapacityState` | #308 orchestrator wrapping same engines | New solver / dashboard-only arithmetic as authority |
| 7 | Transaction simulation | VTE `simulateVerifiedTransaction` | #294 simulation persistence | Legacy simulate commits as production authority |
| 8 | Product presentation | `status-contract` / Position-Ask-Simulate handoffs | #304 Position bridge with GROSS labels | AVAILABLE / production remaining without gates |
| 9 | Persistence & audit | (main: ledger/snapshots) → **#294 institutional memory** | — | Production Neon writes; SSR gate as auth grant |

Minimal contracts already present (do not invent new architecture layers):

- `ExecutableRuleHandoff` (#308 ↔ Agent 1)  
- SSR diagnostics-only gate (`ssr-persisted-execution-gate.v2-diagnostics-only`)  
- `presentCapacityClaim` / truthful status contract  

---

## 7. Independent acceptance results

### 7.1 Later unresolved restatement (adversarial)

**PROVEN fail-closed on main.**  
Suite: `tests/operative-restatement-authority/later-unresolved-successor-guard.test.ts` — 6/6.  
Evidence: `evidence/2026-10-11-later-unresolved-main.txt`.  
Covers REVIEW_REQUIRED / UNSUPPORTED / undated competitors; preserves future-effective and historical non-blocking priors.

### 7.2 Matthews authentic package (#304 tip `9505ea66`)

Independent probe (not using `independentExpectedRemaining`):

| Check | Result |
| --- | --- |
| Fixture EDGAR accession `0000063296-25-000006` | Present (11 hits) |
| Covenant calculations | 5 leaf metrics |
| Financial metrics present | 6 |
| `supportsRemainingClaim` | **false** |
| `unknownHistoricalActivity` | **true** |
| Trusted issuer | **BLOCKED** |
| Cross-doc CA §6.01(j) | modeled **0**, remaining **null**, `STRUCTURAL_ZERO` |
| Position claimKind | **GROSS_CONTRACTUAL** only |
| Any AVAILABLE claim | **false** |
| `productionRemainingPublished` | **false** |
| VE unit feeding Position | `SOURCE_BACKED_COMPILED_GROSS` for (1)(a) |

Evidence: `evidence/2026-10-11-pr304-independent-probe.txt`, tip product suites 40/40.

**Verdict:** Fixture-modeled dashboard + bounded VE gross — **not** full autonomous compilation, **not** production remaining.

### 7.3 Mohawk authentic package (#304 tip)

| Check | Result |
| --- | --- |
| Authentic CA text present | YES (`docs/product-proof/002/sources/mhk-2026-credit-agreement/...`) |
| Source contains `$700,000,000` + Permitted Receivables Financings | YES |
| Same VE core compile | `sourceBackedGrossCapacityMm = 700`, `PRODUCTION_CAPACITY_REFUSED` |
| Full leaf dashboard / financial fixture for MHK | **NOT claimed / not present** |

### 7.4 Adversarial unsupported package / formulation

#304 tip: non-fixed-dollar Notes candidate → `REFUSED_NOT_FIXED_DOLLAR` / UNSUPPORTED provenance locks (Priority A commit `9505ea66`).  
Main: wrong-document + UNSUPPORTED competitor guards pass.

### 7.5 Missing-utilization case

Matthews tip: utilization incomplete ⇒ remaining null / not AVAILABLE; #308 tests empty/partial ledger withhold remaining (11/11 local).  
Main VTE/product adversarial suites pass with completeness refuse semantics.

### 7.6 Cross-document capacity restriction

Matthews CA lien `ca_lien_601j_2024notes` structural zero observed independently. Indenture secured composition must remain hypothetical / non-AVAILABLE (acceptance docs + tip code).

### 7.7 Hypothetical transaction

Main: `unified-transaction-execution` + `certified-simulate-executable-safety` + canonical adversarial — **85 passed / 3 skipped** with `DATABASE_URL` cleared (DB-backed north-star workflow skipped).  
Production authority classification remains blocked while identity BLOCKED.

### 7.8 UI ↔ backend authority match (#304)

Position bridge sets readiness `DISCOVERY_ONLY`, claimKind `GROSS_CONTRACTUAL`, `mayPublishAvailable: false`, throws on AVAILABLE publication. Matches backend refusal.  
**Residual defect (documented in #304 acceptance):** leaf provisions still manually encoded — do not re-label as AUTONOMOUS_COVENANT_COMPILATION_PROVEN.

---

## 8. Exact test & CI evidence

| Suite / check | Where | Result |
| --- | --- | --- |
| Phase 3 certification | main `67027b8f` | **481/481 PASS** (`evidence/2026-10-11-main-phase3-certification.txt`) |
| Later-unresolved OA guard | main / #294 / #304 / #308 | **6/6 PASS** each |
| Trusted-identity adversarial | main + #308 | **16/16 PASS**; activation BLOCKED |
| Canonical product adversarial | main | **13/13 PASS** |
| Product VTE / simulate / unified adversarial | main (no DATABASE_URL) | **85 PASS / 3 skip** |
| #304 tip product + adversarial | `9505ea66` | **40/40 PASS** |
| #308 tip capacity integration | `58af9a2f` | **11/11 + OA/identity = 33/33 PASS** |
| #294 tip SSR gate + OA + canonical | `9a46595d` | **30 PASS**; authorization-adversarial skipped (`createdb` missing in this VM) |
| Main GitHub certified path | `67027b8f` | SUCCESS `38184494968` |
| #294 GitHub certified path | `9a46595d` | SUCCESS `38184616188` |
| #304 GitHub certified path | `9505ea66` | SUCCESS `38185091567` |

**Not equated to legal correctness or customer usability.** Passing tests ≠ counsel-reviewed operative IR or production capacity.

### Production Neon

- Ambient `DATABASE_URL` in the VM pointed at `*.aws.neon.tech`. Cleared before continued testing.  
- One north-star E2E attempt failed with **Can't reach database server** during teardown — **no successful write**.  
- **PRODUCTION_DB_TOUCHED: NO** (this agent).  
- #294 / #308 docs likewise claim disposable/in-memory only.

---

## 9. Security audit (evidence-supported)

| Control | Status | Evidence |
| --- | --- | --- |
| Tenant isolation | Present in #294 persistence (`assertSameTenant`) + identity `companyScope` | Code on #294 tip / main identity |
| IdP-backed approval | Required for financial `approvedAt` mint on #294; forged provenance ignored | `docs/persistence/11-authorization-remediation.md` + gate tests |
| Production execution authorization | Refused | `mayCallExecuteAndPersist: false`, `mayPublishProductionAuthority: false` |
| Persistence boundaries | Diagnostics-only SSR gate; PRODUCTION_AUTHORITATIVE persist refused while BLOCKED | `ssr-persisted-execution-gate.ts`, `capacity-calculation.ts` |
| Financial evidence provenance | Pathway on main; approval ≠ VERIFIED alone | #273/#279/#290 + #294 |
| Reviewer identity | Free-text login inventory; not IdP | `TRUSTED_IDENTITY_INVENTORY` |
| Replay / audit determinism | Claimed in #308 tests (inputHash/stateHash); #294 audit events | Local #308 pass |
| No production Neon writes | Enforced by this agent after URL clear; tips refuse production authority | See §8 |
| **Trusted-identity activation** | **BLOCKED — maintain** | `lib/capacity/identity/activation.ts` |

---

## 10. North Star / release gates (independent)

| Gate | Verdict | Basis |
| --- | --- | --- |
| **STRUCTURAL_DISCOVERY_PROVEN** | **PARTIAL** | Certified discovery/structure suites pass on main; not a general multi-issuer product proof |
| **OPERATIVE_AUTHORITY_PROVEN** | **PARTIAL → strengthened** | #306 fail-closed proven on main with dedicated suite; CP satisfaction / full package OA still incomplete for many issuers |
| **COVENANT_COVERAGE_PROVEN** | **NOT_PROVEN** | No evidence of generalized coverage across authentic packages as a product gate |
| **VERIFIED_EXECUTABLE_IR_PROVEN** | **BOUNDED_ONLY (branch)** | Fixed-dollar VE gross proven on #304 for Matthews (1)(a) + MHK §7.03(f); ratio/structural leaves remain non-IR; not on main until #304 merges |
| **GENERALIZED_CAPACITY_PIPELINE_PROVEN** | **NOT_PROVEN** | #304 explicitly NOT_PROVEN; #308 is integration glue under synthetic completeness |
| **FINANCIAL_UTILIZATION_INTEGRATION_PROVEN** | **PARTIAL (pathway)** | Main has #290 pathway; #308 demonstrates remaining withheld without completeness; production remaining NOT proven |
| **END_TO_END_CUSTOMER_WORKFLOW_PROVEN** | **NOT_PROVEN** | DB-backed north-star E2E not independently re-proven here; #304 is restricted fixture slice; Agent 3 unpublished |
| **PRODUCTION_AUTHORITY_PROVEN** | **NOT_PROVEN / BLOCKED** | Identity + issuer activation BLOCKED by design |

---

## 11. Remaining blockers

1. **P0** — No production IdP; keep `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION=BLOCKED`.  
2. **P0 process** — Close/supersede #305 and #303; stop any merge that lacks `b33710cf`.  
3. **P1** — Authentic utilization completeness certificates + attributed historical ledgers for live packages.  
4. **P1** — Replace Matthews leaf hardcoded provisions with source-backed IR before claiming autonomous compilation.  
5. **P1** — Agents 1 & 3 must publish post-#306 tips before integration acceptance.  
6. **P1** — Single remaining-capacity publication contract across VTE, #308 orchestrator, and #304 Position (gross vs remaining).  
7. **P2** — #294 disposable-Postgres CI for authorization-adversarial (needs `createdb` in agent/CI images).  
8. **P2** — Stale open PR debt (do not merge without rebase).  

---

## 12. Recommended merge sequence (human only; no self-merge)

1. **Close #305** (superseded by #306).  
2. **Close #303** (superseded by #304).  
3. **Human-merge #294** → main (persistence foundation; CI green; retains #306; no overlap with product slices).  
4. **Human-merge #308** → main (Agent 2 capacity orchestration; no file overlap with #294/#304; re-check CI on exact tip after Vercel).  
5. **Human-merge #304** → main (honest restricted product slice; retains #306).  
6. **Rebase & human-merge #307** onto post-#304 main (or squash into #304 before step 5).  
7. **Hold** Agents 1 & 3 until PRs exist on the then-current main; require #306 ancestry + no parallel solvers.  
8. **Never** merge #246 / pre-consolidation stacked product PRs without full rewrite onto current main.

---

## 13. Next highest-value product milestone

**Wire one customer-visible Position path that:**

1. Uses source-backed fixed-dollar VE (from #304/#307) for gross contractual figures,  
2. Uses `#308 evaluateVerifiedRemainingCapacity` (or VTE) for remaining — only when completeness authority allows,  
3. Persists via `#294` disposable/eval pathways (still non-production),  
4. Keeps AVAILABLE / production remaining **impossible** while identity BLOCKED,  
5. Extends the same path from Matthews → Mohawk without issuer `if (companyId === …)` branches in compile/evaluate cores.

That is the integration milestone that turns four agent streams into one system. Everything else is sequencing and honesty enforcement.

---

## 14. Actionable corrections to parallel agents

| Agent | Correction |
| --- | --- |
| Agent 1 | Publish PR on `67027b8f`+. Emit `ExecutableRuleHandoff` only; do not fork VE core already in #304. Do not claim AUTONOMOUS for leaf-hardcoded provisions. |
| Agent 2 (#308) | Acceptable direction. After merge, document that product surfaces must not dual-publish remaining via leaf `evaluateProvision` and `evaluateVerifiedRemainingCapacity`. |
| Agent 3 | Wait for #304+#308 (+ ideally #294) tips; consume status-contract + VTE/orchestrator; UI labels must match backend authority enums exactly. |
| #304 owners | Keep GROSS_CONTRACTUAL / DISCOVERY_ONLY; do not restore AVAILABLE. Absorb #307 before or immediately after merge. |
| #294 owners | Keep SSR gate diagnostics-only; do not treat `tenantAuthenticated` boolean as IdP proof. |

---

## Evidence index

- `evidence/2026-10-11-sha-pins.txt`  
- `evidence/2026-10-11-open-prs-main.json`  
- `evidence/2026-10-11-later-unresolved-main.txt`  
- `evidence/2026-10-11-main-phase3-certification.txt`  
- `evidence/2026-10-11-main-authority-identity.txt`  
- `evidence/2026-10-11-main-product-suites.txt`  
- `evidence/2026-10-11-pr294-tip-persistence.txt`  
- `evidence/2026-10-11-pr304-tip-product.txt`  
- `evidence/2026-10-11-pr304-independent-probe.txt`  
- `evidence/2026-10-11-pr308-tip-capacity.txt`  
