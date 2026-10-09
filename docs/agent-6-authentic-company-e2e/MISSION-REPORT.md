# Agent 6 — Unseen-Package Execution Readiness

**Verdict:** A6-D4 fixed (REVIEW_REQUIRED amendments associate as `PROVISIONAL_FAMILY` without operative upgrade). Credential-independent baseline advances each authentic package through **Document → structure → package graph → deterministic Pass A candidates**, then stops honestly at **LEGAL_INTERPRETATION** (missing AI credentials). Product benchmark separates structural accuracy, Pass A recall, rules, financials, utilization, capacity, transactions, refusals, and false favorables. Authentic CONMED §7.2(c) VEP derives but capacity **REFUSES** (`CROSS_RULE_GATE_NOT_EXECUTABLE`) — not counted as executable capacity. **$0.00** cost; zero false favorables; blind expectations unchanged.

**Branch:** `cursor/agent6-authentic-company-e2e-aebc`  
**PR:** https://github.com/egsul897/headroom/pull/226  
**Branch tip:** see `git rev-parse origin/cursor/agent6-authentic-company-e2e-aebc`  
**Cost:** `$0.00` (no provider calls; credential gate `BLOCKED_BY_MISSING_CREDENTIAL`)

## Exact stopping stage per company

| Company | Last PASSED/PARTIAL | Hard stop | Reason |
|---|---|---|---|
| Knife River | COVENANT_CANDIDATE (Pass A) | LEGAL_INTERPRETATION | Missing AI credentials — no fabricated LLM compile |
| Insulet | COVENANT_CANDIDATE (Pass A) | LEGAL_INTERPRETATION | Same |
| Benchmark | COVENANT_CANDIDATE (Pass A) | LEGAL_INTERPRETATION | Same |

Pipeline legend: `DOCUMENT → STRUCTURAL_GRAPH → PACKAGE_GRAPH → COVENANT_CANDIDATE → LEGAL_INTERPRETATION → VERIFIED_RULE → FINANCIAL_INPUTS → CAPACITY → TRANSACTION`

Artifacts: `06-execution-baseline/`, `07-product-benchmark/`.

## Structural accuracy and defects

| Package | Role match | Nodes (all docs) | A6-D4 / cross-doc |
|---|---:|---:|---|
| Knife River | 3/3 | 3660 | PROVISIONAL_FAMILY `{doc-a,b,c}`; edges remain REVIEW_REQUIRED |
| Insulet | 3/3 | (see baseline) | Credit+9th CONFIRMED; indenture separate |
| Benchmark | 3/3 | (see baseline) | Second A&R alone; missing-base amends do not attach |

| ID | Status |
|---|---|
| A6-D1–D3 | FIXED (prior) |
| A6-D4 | **FIXED** — `instrument-grouping.ts` + `a6-d4-provisional-instrument-family.test.ts` |
| A6-D5 | HONEST_BLOCKER — credentials |

## Covenant discovery coverage

| Package | Mode | Must-discover expected | Pass A section hits | Recall | LLM Pass B–D |
|---|---|---:|---:|---:|---|
| Knife River | DETERMINISTIC_PASS_A_ONLY | 5 | 5 | 1.0 | NOT_RUN |
| Insulet | DETERMINISTIC_PASS_A_ONLY | (see benchmark) | = expected | 1.0 | NOT_RUN |
| Benchmark | DETERMINISTIC_PASS_A_ONLY | (see benchmark) | = expected | 1.0 | NOT_RUN |

Pass A hits are **candidates**, not sealed family discoveries. Coordination note: `06-execution-baseline/discovery-coordination.json`.

## Verified rules / capacity / refusals

| Measure | Unseen packages (KR/IN/BE) | Authentic capacity attempt (CONMED §7.2(c)) |
|---|---|---|
| Verified rules | 0 (NOT_REACHED) | 1 rule in DERIVED VEP |
| Gross capacity | null | null (REFUSED) |
| Remaining capacity | null | null (REFUSED / no utilization) |
| Correct refusals | 6 MISSING_EVIDENCE (+ 3 REVIEW_REQUIRED preserved) | CROSS_RULE_GATE_NOT_EXECUTABLE |
| False favorables | **0** | **0** |
| Counted refusal as capacity? | **No** | **No** |

## Independent expectation comparison

Blind pins in `00-expectation-pins.json` / `02-independent-expected-outcomes/` were **not** modified to match engine behavior. Role classification 3/3; operative bases match; transactions expecting MISSING_EVIDENCE or REVIEW_REQUIRED all match.

## Tests / CI / cost

```bash
npx vitest run tests/agent6/          # 21 passed
npx tsx scripts/agent6/run-execution-baseline.ts
npx tsx scripts/agent6/run-authentic-company-e2e.ts
```

Cost: **$0.00**. No Neon writes, no paid inference, no auto-merge, certification gates unchanged.

## Integration reuse (not a parallel E2E)

- Agent 1 path: `runPassADeterministicSignals` (deterministic); Pass B–D pending authorized credentials
- Agent 2: APPROVED snapshots still absent — DO_NOT_INVENT
- Agent 3: `attemptAuthenticatedVep` + `evaluateVerifiedCapacity` reused for authentic attempt
- Agent 5: package-graph provisional family + operative-state path
- Coordinator: PR #226 carries A6-D4 + baseline artifacts
