# Phase 4 completion return — Basket Formula Library

## 1. Starting and ending SHAs

| Item | Value |
|---|---|
| Starting SHA (`origin/main` at branch cut) | `caa08f8b1c68d9656b30cabb6a866f8cf9b23b1d` |
| Ending SHA | *(filled after commit)* |
| Prior merged PR #148 head | `01a1972817091f6bd4c074d2d8b9c75dfb6fcd18` |

## 2. PR URL and integration status

| Item | Value |
|---|---|
| PR | *(filled after open)* |
| Base | `main` |
| Merge recommendation | Merge when CI green — non-promoting library completion; no executable-capacity claims |

## 3. Production files changed

Under `lib/basket-formula-corpus/` (isolated from `lib/contract-model/runtime/capacity`):

- `governing-binding.ts` — governing-source binding + span fidelity
- `semantic-role.ts` — permission authority vs ceiling / consumption / definition roles
- `dependency-graph.ts` — dependency graphs with epistemic levels
- `peer-integration.ts` — KF / Encyclopedia / Atlas / NCED / FDP / ACR adapters
- `promotion-status.ts` — RESEARCH_HYPOTHESIS → EXECUTABLE model (non-promoting)
- `index.ts` — exports

Scripts/tests/docs: `scripts/basket-formula-corpus/phase4_pipeline.ts`, `tests/basket-formula-corpus/phase4-*.test.ts`, `docs/.../phase-4/**`.

**Not modified:** Legal Core verifier, production capacity engine, Claude-owned fixtures.

## 4. Canonical Knowledge Factory integration evidence

| Peer | Availability | Legally verified | Sufficient for executable |
|---|---|---|---|
| Knowledge Factory corpus export | UNAVAILABLE | false | false |
| Definition Encyclopedia | UNAVAILABLE (sample only demoted) | false | false |
| Dependency Atlas | UNAVAILABLE (sample only demoted) | false | false |
| Negative Covenant Exception DB | AVAILABLE (`phase-4/knowledge-factory-export.json`) | false | false |
| Financial Definitions Precedent | AVAILABLE | false | false |
| Amendment Chain Research | AVAILABLE | false | false |
| Legal Core | INTERFACE_ONLY | false | false |

Competing source registry: **no**.  
Import contract: `knowledge-factory-import.basket-formula.v1`.  
Discoverable ≠ source-backed ≠ legally verified ≠ executable-sufficient.

## 5. Governing-section binding results

| Metric | Value |
|---|---|
| Candidates bound | **390 / 390** |
| Source bytes recovered / span replayable | **390 / 390** |
| OPERATIVE_PROVISION | **333** |
| NUMERICAL_FRAGMENT | **57** |
| Corpus operative-span fidelity | **333 / 390 = 85.4%** |
| Eval-set operative-span fidelity | **128 / 145 = 88.3%** |
| Sufficient for affirmative permission | binding-gated; numerics alone never suffice |

Phase-3 historical operative fidelity on eval set was **55 / 145 = 37.9%**. Drift explained by Phase-4 generalizable governing-window expansion against recovered source bytes (not issuer-specific offsets).

## 6. Legal-semantic classification results

Roles distinguished: PERMISSION_AUTHORITY, CAPACITY_CEILING, CAPACITY_CONSUMPTION, SHARED_CAPACITY_LIMITATION, FINANCIAL_FORMULA, DEFINITION, PROHIBITION_THRESHOLD, CONDITIONAL_EXCEPTION, INCOMPLETE_OR_AMBIGUOUS.

Mandatory §A/§B adversarial (aligned with PR #136 THRESHOLD pattern):

- Section A (shall-not-exceed greater-of): **ceiling / prohibition threshold**, not independently executable permission.
- Section B (may incur subject to A): **permission authority**.
- Link: `PERMISSION_SUBJECT_TO_CEILING`; `duplicateCapacityCreated=false`; fails closed when authority/inputs missing.

Corpus capacitySemantics after Phase-4 constraints: see `03-legal-semantic-classification.json`.

## 7. Dependency closure results by category

| Dependency status (node totals) | Count |
|---|---|
| See `04-dependency-closure.json` → `dependencyStatusTotals` / `dependencyKindTotals` | — |
| Fully closed candidates | **0 / 390** |
| Executable | **0** |

Kinds covered: governing authority, definitions, formula inputs, measurement period, entity restrictions, exceptions/provisos, cross-document limitations, amendment precedence, shared-capacity interactions, unresolved legal questions.

## 8. Full-corpus 390-candidate replay

| Metric | Value |
|---|---|
| Phase-3 baseline affirmative after | 27 |
| Reproduced on main | 27 |
| Drift | **None** — see `00-phase3-baseline-replay.json` |
| Historical 145 independent reviews | preserved |

## 9. Independent adversarial evaluation

- Preserved historical **145** independent reviews (GT not rewritten).
- Added **15** Phase-4 adversarial cases in `phase4-adversarial-validation.test.ts` (ceiling-as-permission, comparator-as-capacity, missing parent/proviso/remote/definition, wrong entity/date, superseded amendment, side letter, shared double-count, greater-of arithmetic, cross-doc omission, duplicate permission, unavailable source).

## 10. Precision, recall, false-permission, false-refusal, span-fidelity

Against preserved 145-case independent reviews:

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| Precision | **1.0** | 25 | 25 |
| Recall | **1.0** | 25 | 25 |
| False-permission rate | **0.0** | 0 | 145 |
| False-refusal rate | **0.0** | 0 | 25 |
| Eval operative-span fidelity | **0.883** | 128 | 145 |
| Corpus operative-span fidelity | **0.854** | 333 | 390 |
| Dependency fully closed | **0.0** | 0 | 390 |

Known false affirmative permissions: **0** (release blocker clear for *library* merge; not a claim of legal-capacity engine completion).

## 11. Tests, TypeScript, and current-head CI

| Item | Value |
|---|---|
| Tests | `npx vitest run tests/basket-formula-corpus/` → **34 passed** |
| CI | *(filled after push)* |

## 12. Remaining blockers and exact owners

| Blocker | Owner |
|---|---|
| Knowledge Factory corpus export unavailable / unverified | Covenant Knowledge Factory |
| Definition Encyclopedia published export missing | Definition Encyclopedia |
| Dependency Atlas published export missing | Dependency Atlas |
| Legal Core not bound for basket-formula promotion | Architecture Remediation / Legal Core |
| 0/390 demonstrably closed dependencies | Legal Core + peer workstreams |
| 57 numerical-fragment spans still incomplete | Basket Formula Library + extraction owners |
| NCED/FDP/ACR discoverable but not legally verified for candidates | Respective peer owners |

## 13. Explicit legal-promotion and executable-capacity status

| Status | Count / claim |
|---|---|
| VERIFIED | **0** |
| EXECUTABLE | **0** |
| Auto-promote | **disabled** |
| Library statuses used | RESEARCH_HYPOTHESIS / SOURCE_SUPPORTED / LEGALLY_REVIEW_REQUIRED only |

## 14. Exact merge recommendation

**Recommend merge into `main` after current-head CI is green.**

This delivers a non-promoting, source-backed formula intelligence component. It does **not** finish the entire legal-capacity engine; independent Legal Core / financial verification gates remain upstream blockers.
