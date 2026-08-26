# Phase 1A — Evaluator Hierarchy Fix + Executability Truth Audit + Ground-Truth Adjudication Packet

**Starting SHA:** `aef24669e991d9912f0c9655b7fe100b81842f34`
**Final SHA:** (see final commit below)

## Central question, answered up front

**Are the remaining benchmark failures merely scoring/ontology labels, or can any of them actually cause Headroom to calculate or communicate the wrong covenant capacity to a customer?**

**Today: none of them can, for one reason that applies to all five — no FWRG or LSB extracted rule (from the Phase C/C.1 compiler) is connected to any customer-facing calculation or UI/API code path.** The only production system that computes and displays real covenant capacity today is `lib/covenant-engine.ts`'s solver, operating exclusively on hand-curated `Permission`/`CovenantProvision` rows for Coherent and Matthews. Grep evidence: `fixture-fwrg`/`fixture-lsb` company IDs appear nowhere in `app/` or in any `Permission`/`CovenantProvision` table; `ContractRule` (the Phase C compiler's persisted output type) is referenced nowhere in `app/` at all. FWRG/LSB rules exist only as `ContractCompilerStage` JSON and as benchmark-evaluator input.

**But this audit found a second, more consequential fact: even if that wiring existed today, two of the five cases (3 and 4) could not be calculated correctly, and the reason is structural, not just a label.** See §3–4 below. This is a real defect, independent of whether it has caused harm yet, and independent of the FWRG label question in §6.

---

## 1. Baseline

- Starting SHA: `aef24669e991d9912f0c9655b7fe100b81842f34`, clean working tree.
- Targeted tests before editing: 19/19 pass (`evaluator-hierarchy-children`, `promotion-invariant-multi-basket`, `basket-completeness`, `analyzer-unseen-package`, `adversarial-verification`).
- Grading rows preserved before editing (`fwrg`/`lsb` recompute output captured to scratch files) — matched Phase C.1's final published numbers exactly: FWRG 2/18 unflagged, LSB 3/14 unflagged, aggregate 5/32 = 15.625%.
- No fixture text, no authored expected answers, no scoring definitions, no denominators, and no first-run evidence were altered.

## 2. LSB 6.08 Evaluator Hierarchy Fix

### Exact change

`lib/contract-model/analyzer/evaluator.ts` adds:
- `structuralComponents(ref)` — splits a normalized ref into its exact bracketed components (`"6.08(a)(vi)"` → `["6.08","(a)","(vi)"]`), used for precise structural depth reasoning instead of any fuzzy string-prefix test.
- `isDirectStructuralChild(parent, child)` — true only when `child` has exactly one more component than `parent` and shares every prior component exactly.
- `isStructuralDescendant(ancestor, descendant)` — true when `descendant` is structurally beneath `ancestor` at any depth, via exact shared components only.
- `findUnambiguousIntermediateAncestor(targetRef, rules)` — among rules that are an exact one-level-deeper structural child of `targetRef`, keeps only those that are themselves genuine **containers** (i.e., at least one further rule is structurally beneath them). A one-level-deeper **leaf** sibling (no children of its own) is never a candidate at all, so its mere existence does not create ambiguity. If more than one distinct container-ref qualifies, returns `undefined` (real structural ambiguity — refuses to guess).

In `evaluateProvision`, when the primary match is **not** an exact hit on ground truth's own target (`matchIsExact` false) and lacks the ground-truth number, the evaluator now calls `findUnambiguousIntermediateAncestor` on ground truth's own target ref (never on the primary match's own — possibly looser — ref), and if found, checks the ancestor itself and then its children for the number, exactly mirroring the existing one-level exact-match logic one level deeper. This never searches past ground truth's own asserted target, and never traverses a loose/fuzzy textual match — only exact structural containment.

No package, section number, subsection letter, or dollar amount is hardcoded anywhere in this change.

### Tests added (`tests/contract-model/evaluator-intermediate-ancestor.test.ts`, 5 tests, all pass)

1. **Positive** two-level exact-ancestry case: ground truth targets bare "9.08"; no exact rule exists; a unique container "9.08(a)" has a real child "9.08(a)(vi)" carrying the number; an unrelated one-level-deeper **leaf** "9.08(b)" (no children) coexists without creating ambiguity. Result: `MATCHED_CORRECT`, matched rule is `"9.08(a)(vi)"`.
2. **Negative — ambiguous container**: two different one-level-deeper rules ("9.08(a)" and "9.08(c)") each have their own children. Refuses to guess; stays `MATCHED_INCORRECT_UNFLAGGED`/`no real figure matched`.
3. **Negative — loose/fuzzy match**: a rule with ref "9.080(a)" (a genuinely different section, "9.080", not "9.08") shares only a textual prefix with the target. `findMatch`'s own pre-existing bare fallback can still pick it as `match`, but structural-component parsing correctly refuses to treat it as an ancestor of "9.08". Stays incorrect.
4. **Unchanged one-level behavior**: ground truth's own target IS an exact rule with no number; its real child one level down is found exactly as before this change.
5. **Sibling-theft guard**: an unrelated leaf sibling of the resolved container, coincidentally carrying the right number, is never used, because it is not a descendant of the resolved container and never qualifies as a container itself.

### Case 5 before/after

**Before:** ground truth targets bare "6.08"; no exact rule; primary match resolves via the pre-existing loose fallback to "Section 6.08(a)" (the general prohibition, no threshold, family `RESTRICTED_PAYMENTS`); child search never triggers (`matchIsExact` false). Outcome: `MATCHED_INCORRECT_UNFLAGGED` — family mismatch, formula mismatch, no real figure matched.

**After:** `findUnambiguousIntermediateAncestor("6.08", rules)` finds exactly one qualifying container — `"Section 6.08(a)"` — because it is the only one-level-deeper rule with further rules genuinely beneath it (`"Section 6.08(a)(i)"`–`"(vi)"`); the sibling `"Section 6.08(b)"` is a leaf (no children) and never competes. Searching that container's own children finds `"Section 6.08(a)(vi)"`, `thresholdValue: 500000`, `formulaRef: FIXED_AMOUNT` — an exact match to ground truth's real figure and formula. **The grading match becomes `"Section 6.08(a)(vi)"`.** Remaining mismatch: family (`RESTRICTED_PAYMENTS` extracted vs. `INDEBTEDNESS` expected) — a defensible, independently-documented family-categorization question (mirrors FWRG's own acknowledged `fwrg-def-restricted-debt` family-fit ambiguity), not a numeric/economic error. Because `"Section 6.08(a)(vi)"` itself carries `evaluationClass: JUDGMENT_REQUIRED` (a pre-existing, unrelated citation-verification downgrade — `VERIFICATION_FAILED: cited section "Section 6.08(a)(vi)" not found verbatim in source text`), the outcome is now `MATCHED_INCORRECT_FLAGGED`, not `MATCHED_INCORRECT_UNFLAGGED`. **This case has moved out of the dangerous-unflagged bucket entirely** — both because the real number is now correctly credited, and because the evaluator now correctly recognizes the rule was already self-flagged.

## 3. Cases 3–4 Structured Representation Audit

Loaded the real persisted `lsb-6.01(i)` rule from the VERIFICATION stage output:

```json
{
  "notes": "Cap is greater of $70,000,000 and 5.5% of total consolidated assets (asset-based, not EBITDA-based); formulaRef corrected to OTHER and evaluationClass corrected to EXECUTABLE.",
  "action": "INCUR_DEBT",
  "ruleType": "QUANTITATIVE_PERMISSION",
  "formulaRef": "OTHER",
  "thresholdUnit": "USD",
  "covenantFamily": "INDEBTEDNESS",
  "thresholdValue": 70000000,
  "evaluationClass": "EXECUTABLE",
  "sourceSectionRef": "Section 6.01(i)"
}
```

Answering the 9 required structural questions directly from `lib/contract-model/types.ts`'s `ContractRule`/`CandidateContractRule` schema and this real row:

1. **Fixed-dollar limb:** `thresholdValue: 70000000` — a single scalar number field, not distinguished from any other kind of threshold.
2. **Percentage limb:** **not represented in any structured field.** `ContractRule` has no `percentage`/`pctValue` field anywhere in the schema.
3. **Percentage value (5.5% / 1.0%):** exists only as text inside the free-form `notes` string.
4. **Percentage base / metric:** not represented structurally at all.
5. **Total Consolidated Assets:** `INPUT_REQUIREMENT_KEYS` (`lib/contract-model/types.ts:96-112`) has no `TOTAL_ASSETS` member — only `COVENANT_EBITDA`, `NET_DEBT`, `SECURED_DEBT`, etc. There is no way to declare this rule's dependency on that metric at all.
6. **Greater-of operator:** not represented structurally. `formulaRef: OTHER` carries zero operator semantics — it is an opaque label, not a pointer to an operation.
7. **Required financial input:** no `InputRequirement` entry ties this rule to any metric.
8. **Formula dependency:** none wired.
9. **Deterministic calculation semantics:** none exist for this rule, or for **any** `CalculationRuleKind` value in this codebase — see §4.

## 4. Cases 3–4 Deterministic Execution Trace

Traced (and executed, with concrete inputs) the actual code path:

- `lib/contract-model/types.ts:60-69`'s own doc comment on `CALCULATION_RULE_KINDS` states plainly: *"representability first" — no evaluator is implemented for any of these this phase.*
- A full-repository search for any function that reads `ContractRule.formulaRef`/`CandidateContractRule.formulaRef` and performs arithmetic found exactly one consumer beyond the benchmark evaluator: `stage-promotion.ts`'s `computeRuleExecutability`, which only checks **presence** (`rule.thresholdValue === undefined && rule.formulaRef === undefined`) — never which formula shape, never whether any calculator is registered for it.
- `lib/contract-model/compatibility.ts` (the only file bridging `FormulaType`/`ContractRule` shapes) runs in the **opposite direction**: it projects the *old*, hand-curated, solver-native `Permission` rows (Coherent/Matthews) into the *new* `ContractRule` shape for read-time display compatibility. It never takes a Phase-C-compiler-extracted rule and feeds it into `lib/covenant-engine.ts`'s real solver.
- `lib/contract-model/compiler/` contains no `stage-calculation.ts` / `stage-execution.ts` or any function computing a dollar amount from a rule's formula fields.

**Executed proof** (script run against the real persisted `lsb-6.01(i)` row, with a concrete `Total Consolidated Assets = $2,000,000,000` input, per the task's own worked example):

```
Fixed limb the rule DOES carry: thresholdValue = 70000000
Percentage limb (5.5% per ground truth/notes text): NOT STORED ANYWHERE STRUCTURED —
  only inside the free-text `notes` string, which no calculation code parses.
=> No function in this codebase can compute 0.055 * totalConsolidatedAssets from this
   structured rule, because 0.055 does not exist as a number in any typed field.
=> max(thresholdValue, percentageLimb) can never be computed deterministically from
   this rule as currently structured, regardless of what formulaRef says.

computeRuleExecutability(rule, ...) => {
  "executabilityState": "EXECUTABLE",
  "reviewStatus": "PENDING",
  "reasons": ["all gates passed: verification confirmed, deterministic validation
               passed, dependencies resolved, formula/threshold present"]
}
```

### Answer: are Cases 3–4 truly executable?

**No.** Not because `formulaRef` says `OTHER` instead of `GREATER_OF_FLAT_OR_PCT_EBITDA` — relabeling it to the ground truth's preferred enum value would not fix anything, since **no `CalculationRuleKind` value has a registered deterministic evaluator anywhere in this codebase.** The deeper defect is structural: the schema has no field for the percentage value or its metric base at all, so even a perfectly-labeled rule could not be calculated. This is a real ontology/executability defect, not a harmless label disagreement, and these two cases are **not** correctly "automatically usable" in any meaningful sense — the compiler currently has no way to tell a downstream consumer "the true permitted amount requires 5.5% of a metric this schema cannot even name."

## 5. Executability Invariant Audit

**Is `EXECUTABLE`, as currently computed, capability-based (backed by a registered deterministic calculator for the rule's specific formula shape) or label-based (backed only by the presence of *some* threshold/formula field)?**

**It is label-based, not capability-based**, confirmed directly from `stage-promotion.ts:60-61`:

```ts
if (rule.thresholdValue === undefined && rule.formulaRef === undefined) {
  return { ...executabilityState: "BLOCKED_MISSING_INPUT" ... };
}
```

This checks only that *something* is present — it accepts `formulaRef: "OTHER"` exactly as readily as `formulaRef: "FIXED_AMOUNT"`, and it never asks whether any code anywhere actually knows how to compute that shape. Since, per §4, **zero** `CalculationRuleKind` values have a registered evaluator today, a fully capability-based version of this check would currently classify **every** `EXECUTABLE` rule the Phase C compiler has ever produced (in both FWRG and LSB, not just Cases 3–4) as not-genuinely-computable.

### Decision: no code fix made to the invariant in this task, and why

This task's own explicit authorization (§9) scopes deterministic code changes to "the evaluator hierarchy fix"; its stop condition names exactly four permitted actions (hierarchy fix, executability *audit*, adjudication packet, recompute) and separately, explicitly forbids implementing the new formula ontology. A genuinely capability-based fix to `computeRuleExecutability` — the only fix that would actually close this gap — would immediately flip **every currently-EXECUTABLE Phase-C-compiler rule in both packages** (not a bounded 2-case change) to a non-executable state, since the true registered-evaluator set is empty. That is a systemic, benchmark-wide behavioral change with a blast radius far beyond "the smallest generalized fix for Cases 3–4," and it is exactly the kind of consequential architectural decision (does the product want to represent this as a hard, sudden gate, or build the calculation registry incrementally first?) that should be surfaced for an explicit decision rather than made unilaterally inside a narrowly-scoped task. **This is reported as a real, generalized, currently-un-remediated safety gap (item 12 in the requested report has "no code fix" as its answer, with the reason above) rather than silently fixed or silently ignored.**

Practically, the gap causes no live harm today only because of the separate fact established in the opening section: no `ContractRule` from this compiler is wired into any calculation or customer-facing surface yet. The moment that wiring is built (Phase 9 of the roadmap), this invariant must be fixed first, or `EXECUTABLE` will keep meaning "the compiler understood the prose," not "the engine can compute this."

## 6. Recommended Future Ontology Shape (analysis only — not implemented)

| Option | Description | Fit vs. long-term goal | Verdict |
|---|---|---|---|
| **A** — per-metric enums (`GREATER_OF_FLAT_OR_PCT_EBITDA`, `GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS`, ...) | One enum value per metric combination | Directly conflicts with "model arbitrary covenant formulas across unfamiliar debt documents rather than continually adding document-specific formula enums" — unbounded combinatorial growth as new metrics appear | Reject as long-term direction; cheapest short-term patch only |
| **B** — generic operator + structured fields: `GREATER_OF_FLAT_OR_PCT_METRIC` + `fixedAmount` + `percentage` + `metricRef` (pointing into an extended `INPUT_REQUIREMENT_KEYS`) | One enum value covers the whole "greater of flat $ or %-of-any-metric" family; `metricRef` reuses the existing extensible input-requirement registry (adding `TOTAL_ASSETS` as one more key, not a new formula kind) | Matches the task's own worked example directly (`max(fixedAmount, percentage * resolvedMetric)`); small, registrable, single generic evaluator function | **Recommended smallest next step** once ontology work is authorized |
| **C** — compositional expression tree (`MAX(FIXED_AMOUNT(...), MULTIPLY(PERCENTAGE(...), METRIC(...)))`) | Fully general; never needs a new top-level enum again; a single tree-walking evaluator handles any future shape (nested greater-of/lesser-of, multi-tier growers, builder-basket sums) | Best matches the long-term goal exactly | Correct **eventual** target, but real schema/evaluator/extraction-prompt complexity — premature before more formula shapes are catalogued (Phase 3's Rule Fidelity Benchmark is the right place to gather that evidence) |

**Recommendation:** Option B is the smallest architecture sufficiently general for the two concretely observed cases (and the independently-confirmed Matthews-onboarding precedent) without overengineering; Option C is the right target once broader evidence (from Phase 3) justifies the added complexity. Neither is implemented here — this is analysis only, per the task's explicit stop condition, since Option B still requires an extraction-prompt/schema change to populate `percentage`/`metricRef` reliably for new documents (a paid-call-requiring change), and Option C requires substantially more.

## 7. FWRG Ground-Truth Adjudication Packet

Ground truth is **not** modified. This is a documented disagreement for future adjudication.

### fwrg-6.10-a

1. **Source language:** *"On the last day of any Test Period..., the Borrower shall not permit the Total Rent Adjusted Net Leverage Ratio to be greater than (A) ... 5.50:1.00, (B) ... 5.25:1.00, and (C) ... 5.00:1.00; provided that, upon the consummation of a Material Acquisition, ... the ratios ... shall be increased by 0.50:1.00..."* (Section 6.10(a), `article-6-negative-covenants.txt`).
2. **Authored expected rule:** `ruleType: RATIO_TEST`, `formulaRef: RATIO_DERIVED_AMOUNT`, correct thresholds and step schedule.
3. **Compiler output:** `evaluationClass: EXECUTABLE`, correct family/ruleType/action/thresholds/step schedule, **no `formulaRef`**.
4. **Exact mismatch:** `formula mismatch: expected RATIO_DERIVED_AMOUNT, got (none)` — the only mismatch reason.
5. **`CalculationRuleKind` definition (code):** `lib/contract-model/types.ts:66-69` — *"Calculation representability... no evaluator is implemented for any of these this phase."* The enum itself (line 75) documents `RATIO_DERIVED_AMOUNT` alongside `FIXED_AMOUNT`, `GREATER_OF_FLAT_OR_PCT_EBITDA`, `BUILDER_BASKET`, etc. — all are ways of **deriving a permitted capacity amount**.
6. **What `RATIO_DERIVED_AMOUNT` means operationally in the engine:** nothing yet — no evaluator exists for any `CalculationRuleKind` (§4 above). Conceptually, per its sibling values and the schema's own framing, it denotes a basket whose *dollar capacity* is computed from a ratio test (e.g., "incur debt so long as pro forma leverage ≤ X" — a debt basket *sized by* a ratio).
7. **Does 6.10(a)/(b) derive a permitted monetary amount, or merely test compliance with a maintenance ratio?** They are **pure maintenance covenants** — pass/fail tests ("the ratio must not exceed X" / "must not be less than Y"). There is no dollar amount being derived or permitted; nothing is "incurred" against a computed capacity.
8. **Analogous LSB 6.15 treatment:** `lsb-6.15-springing-financial-covenant` — a directly analogous maintenance/springing ratio covenant (min FCCR 1.00:1.00) — is ground-truthed as `ruleType: RATIO_TEST` with **no `formulaRef` at all** in the same ground-truth file.
9. **Other repository examples of maintenance ratios:** none beyond FWRG 6.10(a)/(b) and LSB 6.15 exist in the current ground-truth corpus; LSB 6.15 is the only directly comparable precedent, and it omits `formulaRef`.
10. **Would removing `formulaRef` lose any actual economic information?** No. The complete economics of a maintenance covenant are: which ratio, the threshold(s), the comparison direction (≤/≥), and any step schedule/conditions — all of which are already captured in `thresholdValue`, `ruleType: RATIO_TEST`, `action: SATISFY_RATIO`, and `conditionTypes`. No dollar figure is being derived, so there is nothing for a "derivation formula" field to add.
11. **Would adding `RATIO_DERIVED_AMOUNT` improve executable behavior in any way?** No — per §4/§5, no evaluator reads `formulaRef` to compute anything today; adding the label would not enable any new calculation, and would misleadingly imply this rule derives a capacity amount when it derives nothing (it is a threshold comparison, not a basket).
12. **Recommended disposition:** **`GROUND_TRUTH_INCORRECT`** (as applied to a pure maintenance ratio test) — with the caveat that this is a **schema-fit** judgment, not a factual error about the covenant's economics (which both sides agree on): the ground truth applies a "derived-amount" formula label to a rule type (pure ratio maintenance test) that structurally never derives an amount, inconsistent with the ground truth's own treatment of the analogous LSB 6.15 entry.

### fwrg-6.10-b

Same source provision family (Section 6.10(b), min Fixed Charge Coverage Ratio 1.25:1.00), same compiler output shape (EXECUTABLE, correct threshold, no `formulaRef`), same single mismatch reason, same `CalculationRuleKind`/engine/LSB-6.15/economic-information/executability analysis as fwrg-6.10-a in every particular. **Recommended disposition: `GROUND_TRUTH_INCORRECT`**, same rationale and same caveat.

### Pro forma (clearly separated from the official benchmark — NOT substituted for it)

If both dispositions above were independently adopted by a human ground-truth adjudicator (not done in this task):

- FWRG dangerous-unflagged would drop from 2/18 to **0/18 (0.0%)**.
- Aggregate dangerous-unflagged would become **(0 + 2)/32 = 2/32 = 6.25%** — still above the ≤5% gate, but the closest reachable point without any ontology or paid-call work.

## 8. Official Recompute (unchanged ground truth) — zero new LLM calls

Re-derived exactly as Phase C.1's own zero-cost recompute (`scripts/run-phase-c1-recompute.ts`, reusing already-persisted VERIFICATION output, no new API calls):

| | FWRG (18) | LSB (14) | Aggregate (32) |
|---|---|---|---|
| Dangerous-unflagged | 2 (11.1%) — **unchanged** | 2 (14.3%) — down from 3 (21.4%) | **4/32 = 12.5%** — down from 5/32 = 15.625% |
| Dangerous-flagged | 3 (16.7%) — unchanged | 1 (7.1%) — up from 0 (0.0%) | 4/32 = 12.5% |
| Review-required / automatically-usable | Promotion mix unchanged (`EXECUTABLE: 3`) | `EXECUTABLE: 5` unchanged; `6.08(a)(vi)` was already `JUDGMENT_REQUIRED` before and after this fix (the fix changed which rule is *credited*, not its own promotion state) | — |

Dangerous-unflagged and dangerous-flagged rates are reported separately, never combined, per the constitution's own rule. **This is the official benchmark. The pro forma FWRG-adjudication numbers in §7 are explicitly not substituted for it.**

Case 5 (`lsb-6.08-subordinated-debt-payments`) moved from dangerous-unflagged to dangerous-flagged — a genuine reclassification, not a gaming artifact: the underlying extraction was always correct (§ established in the prior Phase C.1 task), and this fix corrected which rule the evaluator compares against, which then correctly surfaces that rule's own pre-existing, independently-earned `JUDGMENT_REQUIRED` status. No fixture, ground truth, or scoring rule was changed to produce this result — only which already-extracted rule gets compared.

Cases 3–4 are **not** counted as resolved. `OTHER` being linguistically honest does not make them executable (§3–5); their benchmark status (`MATCHED_INCORRECT_UNFLAGGED`) is unchanged and correctly reported as such.

## 9. Product-Safety Question — answered per case with execution-path evidence

| Case | Could production rely on wrong economics without review? | Execution-path evidence |
|---|---|---|
| fwrg-6.10-a | **NO** | No FWRG `ContractRule` is wired to any calculation/UI path today. Even hypothetically, the actual ratio thresholds are correct and complete; only a formula-derivation *label* (not needed for a pure ratio-threshold comparison) is absent — low residual risk even if wired up later. |
| fwrg-6.10-b | **NO** | Same reasoning as fwrg-6.10-a. |
| lsb-6.01-i-flat-or-pct-assets | **NO today; CONDITIONALLY yes in the future** | No LSB `ContractRule` is wired to any calculation/UI path today (confirmed by the same grep evidence). But per §3–4, if this rule were ever connected to a real capacity engine (Phase 9), a naive reader of `thresholdValue=70000000` alone would silently compute $70M and completely miss the (larger, in the task's own example) percentage-of-assets limb — a genuine future understatement of real capacity, not merely a label question. |
| lsb-6.04-a-abl-collateral-disposal | **NO today; CONDITIONALLY yes in the future** | Same reasoning as lsb-6.01-i. |
| lsb-6.08-subordinated-debt-payments | **NO** | No wiring today. Even hypothetically: the rule now correctly identified as carrying the real $500,000 (`Section 6.08(a)(vi)`) already carries `evaluationClass: JUDGMENT_REQUIRED` from a pre-existing, independent citation-verification failure — it would already be surfaced for human review, never silently trusted. The general-prohibition rule a naive reader might mistake for "the" basket (`Section 6.08(a)`) has no `thresholdValue` at all, so it would correctly become `BLOCKED_MISSING_INPUT`, never a silently-wrong number. |

## 10. Regression Results

- Targeted: 5/5 new tests pass; all 5 pre-existing hierarchy/verification/completeness test files continue to pass (19/19 total, unchanged from baseline).
- Full suite: **590/590 tests, 78 files** (585/77 baseline + 5 new tests in 1 new file), zero failures.
- `tsc --noEmit`: clean.
- `eslint .`: clean.
- `npm run build`: succeeds.
- Golden harnesses: Coherent 26 passed/3 failed/1 flagged/0 errored (30 total) — **unchanged**; Matthews 2 passed/4 failed/10 flagged/2 errored (18 total) — **unchanged**. Both harnesses run entirely on the old `Permission`/`covenant-engine.ts` system, untouched by this change.
- Protected-data fingerprint: `goldenTests=48, permissions=29, permissionRelationships=27, sharedConstraints=3, legalReview=111, totalContractRule=130` — **all unchanged**.
- No new Prisma migrations (`git status` on `prisma/migrations/` empty).
- Tenant isolation: `tests/contract-model/tenant-isolation.test.ts` (4 tests) passes unmodified within the full suite.
- No unrelated compiler behavior changed: the only diff outside the new test file is the additive hierarchy-resolution logic in `evaluator.ts`; `stage-verification.ts`, `orchestrator.ts`, `stage-promotion.ts`, `basket-completeness.ts` are untouched in this task.

## 11. Cost

Model calls: **0**. Tokens: **0**. Cost: **$0**. All evidence came from repository inspection and re-derivation against already-persisted VERIFICATION-stage output.

## 12. Remaining true compiler defects

1. **The `EXECUTABLE` invariant is label-based, not capability-based, for every `CalculationRuleKind` value** — not fixed in this task (§5), flagged as a real, currently-latent (because nothing is wired to it yet) safety gap that must be closed before any Phase-C-compiler output is ever connected to a real calculation/customer-facing path.
2. **No schema field exists for a percentage value or its metric base** on any rule — blocks true executability for any "greater of flat $ or % of [non-EBITDA metric]" basket (Cases 3–4, and the independently-confirmed Matthews-onboarding precedent).
3. **`INPUT_REQUIREMENT_KEYS` has no `TOTAL_ASSETS` member.**

## 13. Remaining benchmark/ground-truth disagreements

1. FWRG 6.10(a)/(b) `formulaRef` (§7) — recommended `GROUND_TRUTH_INCORRECT`, not yet adjudicated/changed.
2. LSB 6.01(i)/6.04(a) `formulaRef` (`GREATER_OF_FLAT_OR_PCT_EBITDA` vs. `OTHER`) — an independently-documented ontology-fit gap (also found in Matthews onboarding); resolving it requires Option B/C ontology work (§6), not a ground-truth change, since the compiler's `OTHER` choice is arguably more honest than the ground truth's own acknowledged best-fit compromise.
3. LSB 6.08 family (`RESTRICTED_PAYMENTS` extracted vs. `INDEBTEDNESS` expected) — a defensible categorization disagreement, mirroring FWRG's own acknowledged `fwrg-def-restricted-debt` note; not adjudicated in this task.

## 14. Gate status and exact recommended next task

Official aggregate dangerous-unflagged: **4/32 = 12.5%**, still above the ≤5% gate. Gate remains **not passed**.

**Recommended next task (smallest remaining intervention, in order):**
1. Put the FWRG 6.10(a)/(b) adjudication packet (§7) to a human ground-truth reviewer for an actual decision (zero cost, no code). If accepted as `GROUND_TRUTH_INCORRECT`, aggregate becomes 2/32 = 6.25% (pro forma, §7) — still short of gate but the cheapest remaining lever.
2. Decide, as an explicit product/architecture decision (not something to default into silently): whether to make `computeRuleExecutability` capability-based now — understanding that doing so honestly will flip every currently-EXECUTABLE Phase-C-compiler rule in both packages to non-executable until a real calculation registry exists — or to defer that fix until Phase 9 (Capacity Engine) actually wires compiler output into a live calculation path, at which point it becomes a hard prerequisite rather than an optional hardening.
3. Do not begin ontology implementation (Option B/C, §6), a third package, or any other Phase C/Phase-1 expansion without explicit authorization, per this task's own stop condition.
