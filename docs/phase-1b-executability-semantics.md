# Phase 1B — Executability Semantics + Compiler Contract Cleanup

**Starting SHA:** `52dfd98004e46cefab6473f1465726bc5e941221`
**Final SHA:** (see final commit below)

## Central question, answered with execution evidence

**When Headroom says a compiler-generated covenant rule is executable, is that statement now literally true?**

**Yes.** And the honest consequence of making it literally true is stark: under the corrected, capability-based invariant, **zero** promotion decisions in either FWRG or LSB are `EXECUTABLE` today (both packages previously reported 3 and 5 `EXECUTABLE` decisions respectively under the old, presence-based semantics). Every rule that used to claim `EXECUTABLE` merely because *some* threshold or formula field was non-empty now correctly reports `MISSING_EVALUATOR`, `MISSING_OPERANDS`, or `EXECUTABLE_WITH_FINANCIAL_INPUTS` instead — none of which a downstream consumer could mistake for "usable right now." This is proven by executing the real evaluator registry against the real persisted FWRG/LSB rules below, not asserted.

## 1. Audit of the Existing State Model (§3, completed before any code change)

- **`evaluationClass`** (Prisma enum: `EXECUTABLE | EVENT_DRIVEN | MONITORABLE | JUDGMENT_REQUIRED | UNSUPPORTED`) — set by extraction/verification; the compiler's own semantic self-assessment of the rule's *nature*. This is close to what the task calls "understanding," though historically entangled with executability.
- **`computeRuleExecutability`** (`lib/contract-model/compiler/stage-promotion.ts`, pre-Phase-1B) — the single site granting `ExecutabilityState`. Its old logic: `UNSUPPORTED` → `UNSUPPORTED`; any other non-`EXECUTABLE` `evaluationClass` → `NON_EXECUTABLE_QUALITATIVE`; unresolved defined-term refs → `BLOCKED_UNRESOLVED_DEPENDENCY`; **`rule.thresholdValue === undefined && rule.formulaRef === undefined` → `BLOCKED_MISSING_INPUT`, otherwise proceeds toward `EXECUTABLE`.** This last check is the exact flaw Phase 1A found: it verifies *presence*, never *capability*.
- **`CalculationRuleKind`** (`lib/contract-model/types.ts`) — its own doc comment: *"representability first" — no evaluator is implemented for any of these this phase.* Confirmed: zero code in the repository reads `formulaRef` to perform arithmetic, for any value of the enum.
- **Compiler output schema / database schema** (`ContractRule` Prisma model) — `executabilityState` is **never persisted**; it is a read-time computed value (confirmed via `git grep` — no column, no consumer reads it from a DB row). This means Phase 1B's redesign requires **zero migration**.
- **All consumers of `EXECUTABLE`** (repo-wide grep): exactly three — `orchestrator.ts` (checks only `!== "EXECUTABLE" && !== "NON_EXECUTABLE_QUALITATIVE"` to decide `REVIEW_REQUIRED`), `scripts/run-phase-c1-recompute.ts` (reporting only), and `tests/contract-model/promotion-invariant-multi-basket.test.ts` (checks `!== "EXECUTABLE"` and a reason substring). None hardcodes the old meaning of any specific blocked state in a way a widened state set would break.
- **Position/Simulate/Ledger surfaces** (`app/`) — grep-confirmed (Phase 1A, re-confirmed here): `ContractRule` is referenced nowhere in `app/`. These surfaces exclusively read the hand-curated `Permission`/`CovenantProvision` tables via `lib/covenant-engine.ts`.
- **Coherent/Matthews hand-curated `Permission` path** — a fully separate production system with its own `FormulaType` (`FLAT_AMOUNT`, `GREATER_OF_FLAT_OR_PCT_EBITDA`, `LEVERAGE_RATIO_ROOM`, etc.) and its own real solver (`computeCovenantPosition`). `lib/contract-model/compatibility.ts` only projects *from* `Permission` *into* the `ContractRule` shape for read-time display compatibility — never the reverse. This path does not import, call, or depend on anything in `lib/contract-model/compiler/` and is untouched by this phase.
- **Tests relying on `EXECUTABLE`** — only `promotion-invariant-multi-basket.test.ts`, both of whose FIXED_AMOUNT-formula synthetic rules happen to be the one shape this phase's registry does support, so both continued to pass unmodified.

**No production behavior relies on the old presence-based semantics** — confirmed by the same evidence above: nothing customer-facing consumes it, and the only three internal consumers check for coarse-grained membership, not the specific string `BLOCKED_MISSING_INPUT`'s old meaning.

## 2. New Semantic Model (§4)

Two independent, separately-computed dimensions, both exposed on `RulePromotionDecision` (`lib/contract-model/compiler/stage-promotion.ts`):

- **`understandingStatus: "UNDERSTOOD" | "JUDGMENT_REQUIRED" | "UNSUPPORTED" | "UNRESOLVED_DEPENDENCY" | "NEEDS_REVIEW"`** — *"Did Headroom faithfully represent this provision's economics and dependencies?"* Computed from `evaluationClass`, adversarial/deterministic verification dispositions, deterministic validation issues, and dependency resolution — substantively unchanged from the pre-Phase-1B combined logic, just no longer entangled with calculation capability.
- **`calculationCapability: "EXECUTABLE" | "EXECUTABLE_WITH_FINANCIAL_INPUTS" | "MISSING_EVALUATOR" | "MISSING_OPERANDS" | "NOT_APPLICABLE"`** (new — `lib/contract-model/compiler/evaluator-registry.ts`) — *"Does a registered deterministic evaluator exist for this rule's specific shape, with every operand it needs present?"*

**No new persisted enum value.** Per the audit's own finding (executability was never a DB column), both dimensions are computed read-time functions over already-persisted fields (`thresholdValue`, `formulaRef`, `ruleType`, `evaluationClass`) — exactly the "computed capability model... preferred over manually persisted labels" the task asked for, with zero migration.

`executabilityState` (the pre-existing combined field, `ExecutabilityState`) is kept for its three existing consumers, widened additively with two new members (`MISSING_EVALUATOR`, `MISSING_OPERANDS`), and its `EXECUTABLE` value is now granted **only** when both `understandingStatus === "UNDERSTOOD"` and `calculationCapability === "EXECUTABLE"`.

## 3. Capability Invariant (§2, exact statement)

> A rule may be reported `EXECUTABLE` only if a deterministic evaluator is registered for its structured rule shape, and the rule's structured representation contains every operand that evaluator requires. Presence of *some* `thresholdValue` or `formulaRef` is never sufficient on its own. A rule that is fully understood but lacks a registered evaluator, or lacks a required operand, or requires a live financial/transaction input not supplied at compile time, must be reported as such — never silently rounded up to `EXECUTABLE`.

Enforced centrally and exclusively in `computeRuleExecutability` — no other code path grants executability (unchanged architectural invariant from Phase C).

## 4. Evaluator Registry (§5)

`lib/contract-model/compiler/evaluator-registry.ts` — a flat list of `EvaluatorDefinition`s: `{ key, description, appliesTo(rule), operandsComplete(rule), requiresLiveFinancialInput }`. `computeCalculationCapability(rule)` finds the (at most one) applicable evaluator and returns the honest state. Adding a future shape means adding one list entry — it never requires touching `stage-promotion.ts`.

**Deliberately minimal, matching "implement only enough infrastructure to make the invariant truthful for rule types actually supported today":** no expression trees, no generic operators, no new schema fields, no new Prisma enum values, no migration.

### Currently supported deterministic calculation types (§6/§8) — traced, not inferred

| Shape | Structured representation available? | Evaluator exists? | Required operands represented? | Required financial inputs represented? | Executable today? | Why |
|---|---|---|---|---|---|---|
| `formulaRef: "FIXED_AMOUNT"` | Yes (`thresholdValue`) | Yes (`evaluateFixedAmount`) | Yes, when `thresholdValue` is set | None needed (self-contained) | **Yes**, if `thresholdValue` present and `evaluationClass === "EXECUTABLE"` and understood | The only shape needing no external metric and no operator composition — the permitted amount *is* the threshold |
| `ruleType: "RATIO_TEST"` (maintenance covenant) | Partially (`thresholdValue` for the comparison bound) | Yes (`evaluateRatioTest`, a deterministic comparison) | Yes, when `thresholdValue` is set | **No** — the actual computed ratio is a live company metric this compiler-only context does not supply | **No** — `EXECUTABLE_WITH_FINANCIAL_INPUTS`, distinguishable from missing-evaluator | The comparison itself is fully deterministic once fed a real ratio value; that value isn't wired here (Phase 8/9 territory) |

### Currently unsupported calculation types (§9, traced)

| Shape | Why unsupported |
|---|---|
| `GREATER_OF_FLAT_OR_PCT_EBITDA` | No evaluator registered. Even where extraction is well-formed, the schema has no field for a percentage value or its metric base (Phase 1A finding, reconfirmed here) |
| `OTHER` | No evaluator registered, by construction — an opaque label carries no operands |
| `RATIO_DERIVED_AMOUNT` | No evaluator registered; also, per §7 below, this label does not belong on the two rules that carried it in the FWRG ground truth |
| Any other `CalculationRuleKind` value (`LESSER_OF`, `BUILDER_BASKET`, `CUMULATIVE_AMOUNT`, `ASSET_SALE_PROCEEDS`, etc.) | No evaluator registered — none has ever been implemented for the compiler's rule shape, per the Phase 1A audit |

**Cases 3–4 status after this correction (§9 of the task, explicit):** `lsb-6.01-i-flat-or-pct-assets` and `lsb-6.04-a-abl-collateral-disposal` remain `MISSING_EVALUATOR`. No `TOTAL_ASSETS` hack, no new formula enum, no schema change was introduced to close them. They are correctly reported as understood-but-not-executable, preserved as evidence for the future generalized formula architecture (Option B/C from Phase 1A), exactly as instructed.

## 5. FWRG Ground-Truth Adjudication (§8)

Formally processed the Phase 1A recommendation for `fwrg-6.10-a` and `fwrg-6.10-b`.

1. **Preserved original values:** the exact prior ground-truth lines (`formulaRef: "RATIO_DERIVED_AMOUNT"`) remain in git history at commit `52dfd98` and earlier; each corrected entry now carries an inline comment stating the original value and pointing to this document.
2. **Confirmed source language** (unchanged from Phase 1A): Section 6.10(a)/(b) are maintenance covenants — "the Borrower shall not permit the [ratio] to be greater than / less than [threshold]" — pure pass/fail comparisons, deriving no dollar amount.
3. **Confirmed `CalculationRuleKind` semantics** (unchanged from Phase 1A, reconfirmed via the evaluator registry build): the enum's own doc comment scopes it to rules that *derive a permitted capacity amount*; no evaluator exists for `RATIO_DERIVED_AMOUNT` regardless.
4. **Confirmed analogous LSB 6.15 treatment** (unchanged): `lsb-6.15-springing-financial-covenant`, a directly analogous maintenance/springing ratio covenant in the ground truth, has **no `formulaRef`** at all.
5. **New evidence gathered in this phase, and whether it contradicts the Phase 1A recommendation:** inspecting the real persisted rules directly (not just evaluator grading output) found that `Section 6.10(a)`/`Section 6.10(b)` carry **no structured `thresholdValue` field at all** — the numeric thresholds live only in free-text `notes`, discovered by the evaluator via `extractNumbers()` text-scanning, not a real structured field. This is a *separate, orthogonal* representational gap (a single scalar `thresholdValue` cannot hold a three-period stepped schedule plus a conditional step-up in the first place — the ground truth's own `stretchNotes` on `fwrg-6.10-a` already anticipated this, recommending three separate `ContractRule` rows with `effectiveFrom`/`effectiveTo` windows). **This does not contradict the formulaRef recommendation** — it is orthogonal evidence about a different field — and is reported honestly here rather than glossed over. Consequently, `fwrg-6.10-a`/`(b)` are correctly `MISSING_OPERANDS` under the capability dimension (not `EXECUTABLE`), independent of the ground-truth question.

**Rationale recorded, disposition: `GROUND_TRUTH_INCORRECT` — confirmed and applied.** `tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth.ts` was edited to remove `formulaRef: "RATIO_DERIVED_AMOUNT"` from both `fwrg-6.10-a` and `fwrg-6.10-b`, each with an inline comment recording the original value, the rationale, and this document as the audit trail. This is ground-truth adjudication as explicitly authorized by the task, not benchmark tuning: it corrects a demonstrated authoring inconsistency (confirmed against the ground truth's own internal precedent), not a disagreement with compiler output for its own sake.

## 6. Benchmark Reporting (§11)

### Original historical benchmark (Phase C.1, preserved, unchanged)
Aggregate dangerous-unflagged: 25.0% (8/32).

### Prior regression benchmark (Phase 1A, preserved, unchanged)
Aggregate dangerous-unflagged: 15.625% (5/32) → 12.5% (4/32) after the evaluator hierarchy fix.

### Current adjudicated benchmark (this phase, unchanged ground truth except the one authorized FWRG correction)

| | FWRG (18) | LSB (14) | Aggregate (32) |
|---|---|---|---|
| Correct | 14 (up from 12) | 10 (unchanged) | 24 |
| Dangerous-flagged | 3 (16.7%, unchanged) | 1 (7.1%, unchanged) | 4/32 = 12.5% |
| **Dangerous-unflagged** | **0 (0.0%, down from 2/18 = 11.1%)** | 2 (14.3%, unchanged) | **2/32 = 6.25%** (down from 4/32 = 12.5%) |
| Missing | 1 (unchanged) | 1 (unchanged) | — |

Dangerous-unflagged and dangerous-flagged rates reported separately, never combined, per the constitution's own rule. `fwrg-6.10-a`/`fwrg-6.10-b` are now `MATCHED_CORRECT`.

### Compiler understanding (independent of executability)

| | FWRG (54 rules) | LSB (79 rules) |
|---|---|---|
| UNDERSTOOD | 7 | 15 |
| JUDGMENT_REQUIRED | 45 | 63 |
| NEEDS_REVIEW | 2 | 0 |
| UNRESOLVED_DEPENDENCY | 0 | 0 |
| UNSUPPORTED | 0 | 1 |

### Actual deterministic executability (capability dimension — the corrected, truthful count)

| | FWRG (54 rules) | LSB (79 rules) |
|---|---|---|
| **EXECUTABLE (registered evaluator + complete operands, no live input needed)** | **0** | **0** |
| EXECUTABLE_WITH_FINANCIAL_INPUTS (registered evaluator + complete operands, live input required) | 0 | 2 (the two RATIO_TEST rules) |
| MISSING_EVALUATOR | 4 | 11 |
| MISSING_OPERANDS | 3 (includes `fwrg-6.10-a`/`(b)` — see §5) | 0 |
| NOT_APPLICABLE (not an EXECUTABLE-class rule, or blocked earlier by understanding) | 47 | 66 |

**Do not present a rule as automatically usable merely because it was previously labeled EXECUTABLE:** confirmed nothing in either package qualifies for unconditional automatic use today. The prior Phase C.1/1A reports of "3 EXECUTABLE" (FWRG) and "5 EXECUTABLE" (LSB) promotion decisions are now understood to have been presence-based artifacts, not genuine calculation capability.

## 7. Tests Added (§10 — all 10 required scenarios, `tests/contract-model/executability-capability.test.ts`)

1. Presence of a threshold alone does not imply executable.
2. Presence of a formula enum alone (`GREATER_OF_FLAT_OR_PCT_EBITDA`, with a threshold) does not imply executable.
3. Unsupported `OTHER` formula is not executable.
4. Missing operands (registered `FIXED_AMOUNT` evaluator, no `thresholdValue`) prevents executability — `MISSING_OPERANDS`.
5. Missing evaluator (wholly unregistered rule shape) prevents executability — `MISSING_EVALUATOR`.
6. A supported deterministic rule (`FIXED_AMOUNT` + `thresholdValue`) becomes `EXECUTABLE`.
7. Missing financial input (`RATIO_TEST` + threshold present) is distinguishable from missing evaluator — `EXECUTABLE_WITH_FINANCIAL_INPUTS`, never `MISSING_EVALUATOR`, never `EXECUTABLE`.
8. A `JUDGMENT_REQUIRED` rule cannot become trusted executable merely because a registered evaluator exists and operands are complete — capability is still computed and inspectable (`NOT_APPLICABLE`, since the understanding gate short-circuits first) but never promotes the rule.
9. The existing Coherent hand-curated calculation path (`computeCovenantPosition` over `COHERENT_DATA`) still computes a real position end-to-end, untouched by this phase's changes.
10. Capability computation is deterministic and idempotent (two calls on the same input produce identical results).

All 10 validate observable states/behavior, never implementation strings.

## 8. Regression Results (§13)

- **Targeted:** 10/10 new tests pass; all pre-existing hierarchy/verification/completeness/promotion tests continue to pass.
- **Full suite:** 600/600 tests, 79 files, zero failures (two pre-existing tests — `analyzer-unseen-package.test.ts`, `adversarial-verification.test.ts` — had their hardcoded baseline counts updated to reflect the real, traced effect of the authorized ground-truth correction: `matchedCorrect` 1→2, `matchedIncorrectUnflagged` 2→1, `dangerousIds` no longer including `fwrg-6.10-a`; every other assertion in both files was unchanged and still passes).
- `tsc --noEmit`: clean. `eslint .`: clean.
- `npm run build`: succeeds.
- **Coherent golden harness:** 26 passed / 3 failed / 1 flagged / 0 errored (30 total) — unchanged.
- **Matthews golden harness:** 2 passed / 4 failed / 10 flagged / 2 errored (18 total) — unchanged.
- **Protected-data fingerprint:** `goldenTests=48, permissions=29, permissionRelationships=27, sharedConstraints=3, legalReview=111, totalContractRule=130` — all unchanged.
- **No new Prisma migrations.**
- **Tenant isolation:** `tests/contract-model/tenant-isolation.test.ts` (4 tests) passes unmodified within the full suite.
- **No changes to existing customer-facing calculations:** `lib/covenant-engine.ts`, `app/`, and every `Permission`/`CovenantProvision` code path are untouched by this phase's diff.

## 9. Cost (§12)

Model calls: **0**. Tokens: **0**. Cost: **$0**. All work is repository inspection, deterministic code, and re-derivation against already-persisted VERIFICATION-stage output (`scripts/run-phase-c1-recompute.ts`, extended with understanding/capability breakdowns, still zero new LLM calls).

## 10. Known Limitations

1. Only two calculation shapes have registered evaluators today (`FIXED_AMOUNT`, `RATIO_TEST`); every other extracted shape is honestly `MISSING_EVALUATOR`. This is expected and correct for this phase, not a defect to fix here.
2. `RATIO_TEST`'s `EXECUTABLE_WITH_FINANCIAL_INPUTS` state is not yet wired to any real live financial-data source — no company/transaction input resolution exists in this compiler-only context. Building that connection is explicitly Phase 8/9 territory, not this phase's.
3. `fwrg-6.10-a`/`(b)` remain `MISSING_OPERANDS` even after the ground-truth correction, because the extraction itself never populated a structured `thresholdValue` for a stepped multi-period schedule — a genuine representational gap distinct from the formula-label question, newly surfaced by this phase's audit and not remediated here (out of scope: no extraction re-run was authorized).
4. LSB's `lsb-6.01-i`/`lsb-6.04-a` (Cases 3–4) remain unresolved by design, per the task's explicit instruction not to build the non-EBITDA ontology yet.
5. The `understandingStatus`/`calculationCapability` split is new API surface with exactly one internal consumer path (`stage-promotion.ts` itself, and the recompute script for reporting); no UI or external consumer has been built against it yet, consistent with "do not wire compiler output into customer UI."

## 11. Gate status

This phase does not carry its own pass/fail gate (Phase 1's own ≤5% dangerous-unflagged gate was the subject of Phase 1A, not re-adjudicated here as the primary objective). For completeness: the adjudicated aggregate dangerous-unflagged rate is now **6.25% (2/32)**, still marginally above the ≤5% threshold, entirely accounted for by the two independently-preserved LSB ontology cases (3–4), which this task explicitly forbade solving.

## 12. Exact Recommended Next Task

Per the task's own stop condition, no further phase begins automatically. The smallest next steps, in order, for a human to authorize:

1. **Decide on Cases 3–4's ontology path** (Option B — generic `GREATER_OF_FLAT_OR_PCT_METRIC` + `fixedAmount`/`percentage`/`metricRef` — was Phase 1A's recommendation): this requires an extraction-schema/prompt change and therefore a paid re-run authorization before implementation, and is explicitly out of scope until authorized.
2. **Decide whether to repair `fwrg-6.10-a`/`(b)`'s missing structured `thresholdValue`** for a stepped-schedule ratio covenant — likely requires either a schema extension (multiple `ContractRule` rows with `effectiveFrom`/`effectiveTo`, as the ground truth's own `stretchNotes` already recommends) or a re-extraction pass; also requires authorization.
3. Only once both are resolved (or explicitly deferred) would the aggregate dangerous-unflagged rate have a realistic path to ≤5% without further ground-truth changes.
4. Per this task's explicit stop condition: do not begin Covenant Discovery, do not build the formula expression-tree system, do not wire compiler output into customer UI, and do not ingest another package without separate authorization.
