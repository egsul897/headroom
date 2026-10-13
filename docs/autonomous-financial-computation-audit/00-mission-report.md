# Autonomous Financial Computation Audit — Mission Report

**Workstream:** WS-AFC  
**Branch:** `cursor/autonomous-financial-computation-audit-45d6`  
**Starting SHA (`origin/main`):** `67027b8f499921a12cee7b9b9f04d832898b6384`  
**Controlling North Star:** `docs/headroom-north-star-v2.md`  
**Phase gates:** `docs/headroom-north-star-reconciliation/06-revised-roadmap.md` (shortest path; Phase 3 reliability open; NS-4 soft gates in force)  
**Method:** read-only production audit + isolated held-out oracles (no company-specific formulas; no phase advance; no evidence rewrite)

---

## 1. Verdict (executive)

Headroom’s **deterministic calculation layer is arithmetically sound and fail-closed** for hand-authored IR (exact rationals, unit/currency refusal, missing≠zero, definition expansion, structural dependency manifests). It **cannot yet autonomously compile unfamiliar contractual financial mathematics into company-specific executable dashboards**: recursive addback caps lack a representation primitive, legacy evaluators cover 2/15 shapes, and there is **no joined information-request API** that turns each compiled calculation’s required-input graph into verified/missing/stale/ambiguous/unsupported asks.

---

## 2. Overlap with active agents (avoided)

| Active stream | Avoidance |
| --- | --- |
| Autonomous covenant compilation (`…-b53f`) | No compiler Pass / orchestration edits |
| Real covenant dashboard (`…-2ca3`) | No dashboard UI work |
| Verified remaining capacity (`…-9f27`) | No utilization product integration |
| Covenant capacity mathematics (`docs/covenant-capacity-mathematics/**`) | Complementary; did not re-run capacity matrix |
| WS-FDP / WS-BFL / WS-CDA / WS-DEF | Consume published corpora only |

Exclusive claim: `docs/autonomous-financial-computation-audit/**`, `tests/autonomous-financial-computation/**` (see `04-ownership.md`).

---

## 3. Track A — Autonomous Financial Definition Compiler

### Verified

- Compositional IR (`ADD`/`MIN`/`MAX`/`DIV`/`DEFINED_TERM`/`DURING_PERIOD`/…) can encode cash-netting floors, growers, and definition graphs **when IR is authored**.
- Phase 4A expands definitions, detects cycles, refuses AMBIGUOUS sufficiency.
- FDP / encyclopedia / basket corpora document addback taxonomies and missing inputs as **precedent**, not production-approved calculations.

### Missing primitives (bounded)

1. **FIXED_POINT / ADDBACK_POOL** for `E = B + min(A, c·E)` — self-ref → `CYCLE`; non-recursive templates **disagree** with the algebraic oracle (confirmed held-out).
2. **WITHOUT_DUPLICATION** keyed aggregation.
3. **Explicit FX conversion** operand (refusal today is correct but incomplete for multi-currency packages).
4. Optional **CASH_NETTED_DEBT** sugar (desugars to existing nodes).
5. Do **not** fake-expand legacy `evaluator-registry` (still only `FIXED_AMOUNT` + `RATIO_TEST`).

### Adversarial reproductions

See `02-adversarial-cases.json` and `tests/autonomous-financial-computation/held-out-oracles.test.ts` (`ADV-RECURSIVE-ADDBACK-CAP`, `ADV-TEMPLATE-ADDBACK-DRIFT`, cash-netting suite).

---

## 4. Track B — Calculation Dependency Discovery

### Verified

- `buildFinancialDependencyManifest` / `buildDependencyGraph` enumerate metric/term/ledger/tx/event leaves with period/asOf selectors, REQUIRED vs CONDITIONAL, cycles, unsupported nodes, ambiguous expansions — **before** evaluation.
- Held-out leverage composition lists Gross Debt, Unrestricted Cash, Consolidated EBITDA with verbatim Test Period key.

### Missing dependency-resolution capabilities

| Gap | Detail |
| --- | --- |
| Fulfillment join | No API → `verified \| missing \| stale \| ambiguous \| unsupported` per leaf |
| Input kinds | No `REVIEWER_DECISION`, `CORPORATE_STRUCTURE`, debt-schedule components on runtime `InputKind` |
| STALE | Not classified vs certificate/delivery cadence |
| Selector resolution | North Star step 6 still open (verbatim period keys only) |
| Atlas wiring | WS-CDA graph not the runtime required-input generator |

**Rule preserved:** missing values must never equal zero (confirmed for cash netting + growers).

---

## 5. Track C — Independent Mathematical Verification

### Verified (held-out oracles + prior peer matrix)

- Exact `1/3`; ratio boundary `3.75` equality; grower missing-input bounds; shared `MIN` of two growers; FX refuse; zero-denominator `ERROR`.
- Peer capacity mathematics: **no generalizable arithmetic defects** on supportable capacity mechanics (not re-certified here).

### Confirmed issues (legal/policy vs arithmetic separated)

| ID | Class | Finding |
| --- | --- | --- |
| `NUM-NEG-DENOM-POLICY` | Policy / legal boundary | `DIV(100,-10)` → `EXECUTABLE -10`; leverage oracle refuses non-positive denominators |
| `NUM-TEMPLATE-ADDBACK-DRIFT` | Representation / compilation hazard | Template IR amount ≠ true fixed-point law |
| Core `+−×÷` / growers | Arithmetic | **No incorrect results** on held-out cases |

Benchmarks were **not** modified to improve performance.

---

## 6. Severity-ranked blockers

1. **P0** — No autonomous text→executable financial-definition compile for unfamiliar packages  
2. **P0** — Missing fixed-point addback-cap primitive  
3. **P0** — Missing information-request fulfillment join  
4. **P0** — Selector→snapshot resolution (roadmap step 6)  
5. **P1** — Non-positive denominator policy for ratio tests  
6. **P1** — Explicit FX dependency modeling  

Full table: `03-blockers-and-pr-sequence.json`.

---

## 7. Proposed bounded PR sequence

1. **This PR** — audit docs + immutable held-out oracles (no production engine edits).  
2. **Information-request fulfillment join** (additive `runtime/input` sibling).  
3. **IR `FIXED_POINT_CAP` / `ADDBACK_POOL`** + runtime solver.  
4. **`RatioTestPolicy`** for non-positive denominators (raw `DIV` unchanged).  
5. **Autonomous definition-compiler slice** (coordinate with covenant-compilation agent; fail closed).  
6. **Selector→snapshot resolution** (after NS-4 APPROVED snapshots).

---

## 8. Exact-tip CI evidence

Populated in `05-ci-evidence.json` after push/PR checks. Local focused runs at authorship:

```
vitest tests/autonomous-financial-computation/held-out-oracles.test.ts  → 13/13 pass
vitest expression-runtime + dependency-graph + decimal + term-and-manifest → 90/90 pass
```

---

## 9. Recommended next task

**Implement `buildInformationRequest`** joining financial dependency manifests to strict snapshot/ledger resolution, emitting a dynamic company-specific request with fulfillment states — never missing→zero — and additive input kinds for reviewer decisions / corporate structure. This is the smallest compatible step toward the North Star dashboard without duplicating compiler or dashboard agents.

---

## 10. Non-goals honored

- No company-specific formulas  
- No historical evidence rewrite  
- No fail-closed weakening  
- No merge / self-certification  
- No premature phase advance  
- No Phase-3 IR / capacity engine rewrites in this PR  
