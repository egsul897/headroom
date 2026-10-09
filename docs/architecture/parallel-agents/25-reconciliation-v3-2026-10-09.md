# Reconciliation V3 — integrate newly completed work

**UpdatedAt:** 2026-10-09T22:45:00Z  
**Main SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Supersedes:** emergency reconciliation merge sequencing in docs 18/21 (matrix retained as history; **this doc controls**)  
**Auto-merge:** no · **Paid inference:** $0 · **Neon writes:** owner-gated only

## 1. Current main SHA

`bae24ced33fdd6963d0615265a1e67cb181233e8` — still no specialist-wave merges.

## 2. Current PR heads and CI (refreshed)

| PR | Head | State | CI | Role |
|---|---|---|---|---|
| #190 | `dea9b7346eef` | DIRTY | PASS | NS-4 store |
| #200 | `80f5d7339d07` | DIRTY | FAIL | HOLD |
| #205 | `bd3de2527e86` | CLEAN | PASS | Authentic §7.2(d) |
| #206 | `3b7c9116a44f` | CLEAN | PASS | Txn-answer E2E (CI fixed) |
| #207 | `5fa7eb1f25a0` | CLEAN | PASS | Lien companion |
| #208 | `2b89c202956d` | CLEAN | PASS | Docs audit |
| #209 | `3652afa4724a` | CLEAN | PASS | Stage C ratio |
| #210 | `f7fc1e51a2e6` | CLEAN | PASS | Neon baseline |
| #211 | `470fcdddf47f` | CLEAN | PASS | Stage D lien-only honesty |
| #212 | `6ae382e953de` | CLEAN | PASS | Neon cycle 2 |
| #213 | `2c68e4fba846` | UNSTABLE | **FAIL** | UCP + verified sim + util honesty |
| #214 | `85e682effae5` | UNSTABLE | FAIL | Synthetic 53-case matrix |
| #215 | `2f55ccbb538a` | CLEAN | PASS | Usage wire — **superseded by #227 content** |
| #216 | `c3d7c46e40cf`+ | CLEAN | PASS | Coordinator |
| #217 | `7404bacfeebd` | UNSTABLE | **FAIL** | Agent1 Cycle 4 activation |
| #218 | `fc7a00290b5a` | CLEAN | PASS | Cross-doc **+ absorbed unified-position files** |
| #219 | `80f9052f35af` | CLEAN | PASS | Neon expansion |
| #220 | `5ef9c81b7b81` | CLEAN | PASS | FCE (head moved) |
| #221 | `1e45309580d7` | CLEAN | PASS | Canonical UCP façade |
| #222 | `271d4ef17d82` | CLEAN | PASS | Entity-scope COUNTERPARTY |
| #223 | `5855e5d5524f` | UNSTABLE | **PEND** | TE-D2/D3 sequential state |
| #224 | `ac33a57e32c3` | UNSTABLE | FAIL | Agent8 report (no prod code) |
| #225 | `d2d1dca0b542` | CLEAN | PASS | Extraction SEC$/grower fixes |
| #226 | `d3dd71776cc0` | UNSTABLE | FAIL | Authentic E2E 3 packages |
| #227 | `8b81dffb6ec0` | CLEAN | PASS | Neon→capacity activation + usage wire |
| #228 | `c517820bd36d` | CLEAN | PASS | Companion REQUIRES discharge |
| #229 | `d56386470bc4` | UNSTABLE | **PEND** | **A8-01/A8-02 gate status** |
| #230 | `bf10361daacd` | UNSTABLE | FAIL | Authentic 51-provision capacity matrix |

## 3. Updated dependency graph

```
Priority A — correctness/safety
  #229 (A8-01/A8-02 state.ts) ──CI──▶ BLOCKS status consumers
  #215b / residual unknown-usage ── after #227 (or #215) lands
  #224 (Agent8 evidence) ── informational; land docs/tests when CI green

Priority B — financial/ledger/authentic capacity
  #225 extraction ──▶ #227 activation (includes usage wire ≈#215)
  #220 FCE ──collides──▶ #227 covenant-engine; #190 schema
  #223 TE-D2/D3 ──collides──▶ #228 verified-execution.ts
  #230 authentic 51-matrix ──collides──▶ #214; preserve 51 results
  #190 NS-4 rebase

Priority C — cross-document verified execution
  #205 → #207 → #211
  #222 → #228 (companion REQUIRES; preserve §7.02(b) entity-scope refusal where unverified)
  #218 cross-doc core ── MUST rebase off #213/#221 (drop duplicated UI trees)

Priority D — canonical customer interface
  Prefer #221 as façade owner
  #213 honesty + verified-sim ── CI FAIL; cherry-pick util-null + attribution into #221 OR fix CI then land before #221
  Do not merge #218 UI duplicates

Priority E — corpus activation (parallel)
  #210 → #212 → #219
  #225 → #227 (activation proof; UNVERIFIED MODELED only)
  #217 Cycle 4 after Neon rebase + CI
  #230 evidence (after #229 so AVAILABLE semantics honest)
```

## 4. Exact file collisions (material)

| Collision | PRs | Resolution |
|---|---|---|
| `capacity/{state,types}.ts` | **#229 only** (claimed) | Land #229 first; others must not edit |
| `covenant-engine.ts` + `shared-usage.ts` | #215, **#227**, #220 | **#227 supersedes #215**; #220 rebase after |
| `verified-execution.ts` | #223, #228 (+#200) | Land #228 (CLEAN) before #223 rebase OR stack TE on #228 |
| `entity-scope-guard.ts` / `ir/types.ts` | #222, #228 | #228 stacks on #222 — OK if ordered |
| authentic-72d + capacity/graph | #205, #207 | 205 then 207 |
| verified-path-enumeration | #207, #211 | after 207 |
| capacity-mathematics docs/tests | #214, **#230** | Prefer **#230** (51 authentic + keeps 53 synthetic); close/absorb #214 |
| unified-position / AskShell / overview | **#213, #218, #221** | **Critical:** #218 absorbed UI files — strip to cross-doc only; #221 façade; #213 honesty cherry-pick |
| intelligence-factory progress-manifest | #210, #212, #217 | Neon owns; #217 rebase |
| prisma schema | #190, #220 | coordinate |

## 5. Correctness blocker ownership

| ID | Issue | Owner | PR | Closed? |
|---|---|---|---|---|
| **A8-01** | Failed gate publishes AVAILABLE | WS-ADV/#229 | #229 | **NO** until CI green + consumers audited |
| **A8-02** | Shared over-consumption status | #229 | #229 | Coupled with A8-01 |
| **U-usage Position** | NOT_TRACKED paints util%=0 | WS-UCP | #213 tip | Fixed in tip; **not on main**; CI FAIL on tip |
| **U-usage solver** | currentUsage 0 when unknown | WS-CAP/NEON | #227≈#215 | **PARTIAL** — status still discarded; **#215b required** |
| **U-usage package-path** | ledger=0 | WS-CAP | none | **OPEN** |
| **TE-D3** | Financial overlays don't chain | WS-TXN | #223 | Claimed MITIGATED; **await CI** |
| **TE-D2** | Restore authority | WS-TXN | #223 | Enforced at `simulateVerifiedTransaction` + sequential; **Phase 4D primitive still ungated** — document residual |
| **CFP overview** | False favorable remaining | — | #213 | Release blocker until landed |
| **Activation dual paths** | KF review-ready vs ephemeral counsel Permission | WS-MECH vs WS-NEON | #217 vs #227 | Complementary if labeled; **no second legal truth** |

## 6. Recommended safe integration batches

### Batch A0 — docs/safety evidence (independent)
1. #216 (this pack)  
2. #208  
3. #224 when CI green (Agent8 report only)

### Batch A1 — **P0 correctness** (gate before product exposure)
1. **#229** — wait CI PASS; owns `capacity/state.ts`  
2. Do **not** land #230/#213 verified-sim consumers until A1 done

### Batch A2 — utilization wire (choose one)
1. **#227** (preferred — includes #215 wire + activation proof)  
2. Close or mark superseded: **#215**  
3. Open/land **#215b**: propagate non-`COMPUTED` usage status → fail closed (still required after #227)

### Batch B — extraction → activation (parallel to A after A2 engine files settle)
1. #225 (CLEAN)  
2. #210 → #212  
3. #219 (expansion; write-gated)  
4. #220 after rebase vs #227 engine  
5. #190 rebase  

### Batch C — authentic legal path
1. #205 → #207 → #211  
2. #222 → #228 (preserve entity-scope refusals)  
3. #209  

### Batch D — capacity evidence
1. **#230** (preserve 51 authentic matrix; fix CI) — absorbs #214 intent  
2. Close #214 as superseded once #230 green  

### Batch E — sequential + cross-doc + UI
1. #223 after CI; rebase onto post-#228 if needed  
2. #218 **rebase**: keep cross-doc libs/tests; **remove** duplicated `unified-position/**`, overview, AskShell, SimulateClient  
3. #221 canonical UCP; cherry-pick #213 util-null + attribution + verified-sim pieces once #213 CI fixed **or** re-implement under unified-customer  
4. #206  

### Batch F — KF Cycle 4
1. #217 after rebase + CI (activation candidates; no auto-CERTIFY)

**HOLD:** #200, #136, #163, #135, #226 until CI/strategy clear.

## 7. Superseded work

| Item | Status |
|---|---|
| Emergency V2 merge order as executable plan | **SUPERSEDED by V3 batches** |
| #215 as sole usage PR | **SUPERSEDED by #227** (same wire + more); residual #215b remains |
| #214 as capacity landing vehicle | **SUPERSEDED by #230** if CI fixed (keeps 53 + adds 51 authentic) |
| Prior claim “Phase-4C fully safe” as product-wide | **NARROWED** — A8-01 shows AVAILABLE on failed gate (fixed only in #229) |
| #218 as pure cross-doc PR | **DIRTY SCOPE** — UI absorption must be stripped |

## 8. Independent validation status

| Suite | Result | Reachability |
|---|---|---|
| Agent8 adversarial (#229 tip) | **32/32**, 0 incorrect favorable (claimed) | Runtime capacity — **customer-reachable** once wired |
| Agent8 report PR #224 | CI FAIL (suite packaging) | Evidence only |
| #230 authentic capacity | **51/51** represented; 45 executable gross; 6 correct refuse; **45 blocked on missing utilization for remaining** | Honest — remaining unknown |
| #218 cross-doc scenarios | FP=0 / 8 (earlier tip); tip grew — re-verify after UI strip | Library + product if wired |
| #223 sequential | 59/59 claimed; CI PEND | Recipe + simulateVerifiedTransaction |
| Claude acceptance pin | 706/736 CFP 0 at `6f0e372daf48` | Offline |
| Agent1 CKG 50% FP | Synthetic micro-controls | **Not** Position path |

## 9. Current authentic end-to-end benchmark (levels)

| Level | What it means | Current status |
|---|---|---|
| L1 Authentic source + synthetic financials | Neon/CONMED text + labeled synthetic CTA | #205 §7.2(d); #227 $84M remaining demo — **NOT customer-certified** |
| L2 Authentic + approved real financials | NS-4 APPROVED snapshots | **Partial** — #220/#190 not integrated |
| L3 Authentic + attributed historical utilization | Basket usage attributed | **Missing** for 45/51 in #230; #227 optional basketUsage |
| L4 Verified cross-document txn | Debt∩lien, amendments, companions | #218+#228+#222 path forming; §7.02(b) entity scope may still refuse |
| L5 Fully customer-ready certified | CERTIFIED VEP + Ask/Position/Simulate same engine | **NOT reached** — package CERTIFIED PARTIAL; A8-01/#229 not on main |

**Track separately:** correct executables · correct refusals · false favorables · missing utilization · missing certification · missing documents · unsupported mechanics.

**Closest integrated answer today:** Coherent engine-complete path + honest CONMED refusals. Authentic CONMED numeric customer answer remains blocked on utilization attribution + certification + A8-01 landing.

## 10. Merge recommendations (human approval required)

**Merge next (when CI green), in order:**

1. **#229** — A8-01/A8-02 (hard gate)  
2. **#225** then **#227** — extraction + activation/usage (supersedes #215)  
3. **#205 → #207 → #211**  
4. **#222 → #228**  
5. **#208 / #216** anytime (docs)

**Do not merge yet:** #213 (CI FAIL), #217 (CI FAIL), #218 (scope collision), #223 (CI PEND), #230 (CI FAIL), #214 (superseded), #215 (superseded by #227), #220 until rebase on #227, #190 DIRTY.

**Immediate specialist orders:**
- WS-ADV: get #229 CI green  
- WS-XDOC: strip #218 to cross-doc-only; rebase  
- WS-UCP: make #221 absorb #213 honesty; stop dual façades  
- WS-CAP: #215b fail-closed; fix #230 CI; preserve 51-matrix  
- WS-TXN: finish #223 CI; document TE-D2 primitive residual  
- WS-NEON: prefer #227 over #215; continue #219 gated  
- WS-MECH: rebase #217  

## How close to authentic customer transaction answer?

| Capability | Status |
|---|---|
| Source-backed provision ID | Yes (Neon/fixtures) |
| Executable capacity math | Yes (engine); A8-01 must land |
| Approved financials | Partial |
| Attributed utilization | Mostly missing → correct **refusals** on remaining |
| Cross-doc debt∩lien | Forming (#218/#228) |
| Position/Simulate/Ask one engine | Split across #213/#218/#221 — **not integrated** |
| Certified customer clearance | **No** |

**Optimize for:** Batch A1 (#229) + A2 (#227) + C (205→228) + D UI reconcile — not for isolated green suites.
