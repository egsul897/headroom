# Phase 2E.1 — Cross-Reference Boundary Remediation + Frozen-Auditor Revalidation: Final Report

**Central question this phase answers:** did we fix the actual retrieval
defect that caused Phase 2E to find five material omissions, while
leaving the independent auditor unchanged and preserving bounded,
precise retrieval behavior? **Answer: yes.** All five original Phase 2E
finding IDs were extracted from real execution (not prose), traced to one
generalized root cause, repaired with a small set of coordinated changes,
and revalidated against the byte-for-byte unchanged, frozen Phase 2E
auditor: **zero material context findings remain** across all 12
real FWRG/LSB benchmark cases, zero new material findings were
introduced, precision stayed at 100%, average bundle size moved from
12.6→12.8 items, and the fault-injection gate remains 12/12 = 100%.

**Starting SHA:** `ec985d0` (Phase 2E's own final commit)
**Final SHA:** see the commit this report ships in.

## 1. Frozen Phase 2E version identity

Recorded before any code change (§1 of this task):

- Auditor algorithm version: `phase-2e-coverage-audit.v1` (unchanged).
- Finding taxonomy, fault-injection definitions/scoring, comparison
  logic, benchmark denominators: as committed in Phase 2E's own final
  commit `ec985d0` — no field, type, or scoring rule was added, removed,
  or reinterpreted.
- Auditor semantic prompt: none (Phase 2E is deterministic-only, `null`
  throughout — nothing to freeze beyond the algorithm version).
- SHA-256 of every file in `lib/contract-model/compiler/coverage-audit/`
  was recorded before this task began and re-verified identical after:

  **Zero bytes changed in any Phase 2E auditor file.** (Verified via
  `sha256sum` diff — see the commit history; not reproduced here since it
  is exactly zero diff.)

## 2. Five-case machine-readable baseline (extracted from real execution)

Extracted via `scripts/phase-2e1-baseline-extract.ts` (new, read-only —
imports only the frozen `coverage-audit/*` modules and the real committed
FWRG fixture; never modifies Phase 2E). All five findings originated
auditing the **same** discovered candidate:
`discovery-candidate:8cf87439002864159b47cd6c`
(`fwrg-6.07-fundamental-changes-dispositions`, family `FUNDAMENTAL_CHANGES`,
originating structural node `fwrg::6.07`).

| # | Finding ID (sha256, truncated) | Source citation | Missing item | Type | Retrieval path that should have reached it | Where traversal stopped |
|---|---|---|---|---|---|---|
| 1 | `8c733c9698...` | `fwrg::6.07(c)(j)` | `clause (j) thereof` referring back to the just-named "Section 6.06" → real target `6.06(j)` | `SILENT_UNRESOLVED_DEPENDENCY` | 6.07 → 6.07(c)(ii) → relative-clause resolution → `6.06(j)` | Relative-clause composer used only the direct enclosing parent (`6.07(c)`), producing a nonexistent target `6.07(c)(j)`, never checking the antecedent "Section 6.06" named immediately before it |
| 2 | `a4faa291fd...` | `fwrg::6.07(c)(ii)(a)` | `clause (a)` under "this Section 6.07 (other than clause (a), clause (b) or this clause (c))" → real target `6.07(a)` | `SILENT_UNRESOLVED_DEPENDENCY` | 6.07 → 6.07(c)(ii)(A) → relative-clause resolution → `6.07(a)` | Same defect: composed `6.07(c)(ii)(a)` from the immediate enclosing clause instead of the antecedent "this Section 6.07" |
| 3 | `b9bb630c52...` | `fwrg::6.07(i)(D)` | `this clause (D)` — genuinely self-referential to an internal, un-separated sub-item inside `6.07(i)(A)`'s own text (a real Phase 2A structural-parser limitation, same class as the known LSB comma-list gap) | `SILENT_UNRESOLVED_DEPENDENCY` | 6.07 → 6.07(i)(A) → self-reference to un-parsed internal content | No real structural node exists for "(D)" at any ancestor level (verified: none of `6.07(i)`'s or `6.07`'s own real children is named `(D)`) — genuinely unresolvable, but the unresolved citation was the bare, ambiguous string `"clause (D)"`, untraceable to any specific attempted scope |
| 4 | `b7e0ba3b23...` | `fwrg::6.07(i)(h)` | `this clause (h)` inside `6.07(i)(A)` → real target `6.07(h)` (a sibling of `6.07(i)`, reachable only by walking the ancestor chain past the immediate enclosing container) | `SILENT_UNRESOLVED_DEPENDENCY` | 6.07 → 6.07(i)(A) → ancestor-chain search → `6.07(h)` | Composer only tried the immediate parent `6.07(i)` (`6.07(i)(h)` does not exist), never walked further up to `6.07` |
| 5 | `bc06281cd9...` | `fwrg::6.07(kk)(A)(kk)` | `this clause (kk)` deep inside `6.07(kk)(A)(2)` — self-referential to the ancestor `6.07(kk)` itself | `SILENT_UNRESOLVED_DEPENDENCY` | 6.07 → 6.07(kk)(A)(2) → ancestor self-match → `6.07(kk)` | Composer never checked whether an ANCESTOR was already, itself, the referenced clause — always tried to compose a new child ref instead |

Phase 2D bundle before remediation (all five, same candidate): 54 items,
`sufficiencyState: BUDGET_EXCEEDED` (`maxCrossReferenceDepth (3) reached`).
Exact upstream component responsible for all five:
`lib/contract-model/compiler/structural-references.ts`'s relative-CLAUSE
resolution inside `detectStructuralReferences` (Phase 2A) — reused
as-is, never re-resolved, by Phase 2D's `reference-context.ts`.

## 3. Root-cause analysis (from actual execution paths, before any code change)

Audited per task §3's own list: structural reference boundaries,
`structural-references.ts`'s relative/absolute resolution, source-node
text boundaries, Phase 2D's cross-reference traversal/relevance
gating/recursion budgets/deduplication/stop reasons/sufficiency logic,
unresolved-dependency creation. Traced via direct `tsx` inspection of the
real `DetectedReference[]` output and real node structure for all five
references (not inferred from prose).

**Finding: all five share exactly one root cause —
`STRUCTURAL_REFERENCE_RESOLUTION`.**

> Phase 2D fails when a relative clause reference ("clause (X)",
> "subsection (X)") must resolve to a scope beyond the reference's own
> immediate physical parent — self-referentially to an ancestor already
> enclosing it, to a same-document sibling reachable only by walking the
> full ancestor chain, or to an explicitly-named antecedent Section
> stated earlier in the same sentence — because
> `structural-references.ts`'s relative-clause composer always computed
> `directParent.sectionRef + marker` and never checked any of these three
> real, deterministic, structural alternatives before declaring the
> reference resolved-or-not.

This is unitary, not multiple independent defects: every one of the five
findings is the same composer producing a wrong or falsely-unresolved
target because it only ever tried one (the weakest) of four possible
scopes. Per task §3's own instruction ("prefer the smallest change that
resolves all five findings through one generalized mechanism"), the
remediation targets this one composer.

**One coordinated, same-class second change was also required** for
genuine (not merely nominal) completeness: even after a reference resolves
to the *correct* target node, that node's own `OWN` text is not always
self-contained (§4 real example: target `6.07(a)` has 2 real children
holding the actual operative content, `OWN` text alone is a 352-char
lead-in vs. 2,195 chars of real substance). This is
`CONTEXT_RETRIEVAL_BOUNDARY`, not a second unrelated defect — it is the
other half of the task's own named "Cross-Reference Boundary" principle
(§4-§7 present both as one remediation), and was necessary to avoid
declaring victory on a resolved-but-still-truncated reference.

## 4-9. Exact production-code change

**Files changed:**
- `lib/contract-model/compiler/structural-references.ts` — new
  `resolveRelativeClauseTarget` (ancestor self-match → antecedent-Section
  override → ancestor-chain child search → unresolved-with-disambiguated-
  best-attempt), wired into `detectStructuralReferences`'s CLAUSE branch.
- `lib/contract-model/compiler/context-retrieval/region-expansion.ts`
  (new) — the referenced-region expansion policy.
- `lib/contract-model/compiler/context-retrieval/reference-context.ts` —
  cross-reference TARGET retrieval uses `expandReferencedRegion` instead
  of bare `OWN` text; unresolved-dependency `citation` now includes the
  disambiguated best-attempt target; `CALCULATION_SIGNAL` gate widened
  (task §8 audit — see below); recursive descendant-reference-following
  stays `includeDescendants: false` (a deliberate, tested decision — see
  §15).
- `lib/contract-model/compiler/context-retrieval/structural-context.ts` —
  **audited, deliberately NOT changed** (see the file's own new comment
  and §15 below: `retrieveChildRules`'s direct children are already
  redundant with `retrieveOperativeSource`'s own full `DESCENDANTS` text,
  so expanding them there duplicated content and burned budget for zero
  new information — a real regression this task's own construction found
  and reverted before acceptance).
- `lib/contract-model/compiler/context-retrieval/types.ts` —
  `RETRIEVAL_ALGORITHM_VERSION` bumped `v1` → `v2`.

### Referenced-region expansion model (task §5/§9)

For a resolved target node: zero children → `OWN` text (nothing to
expand); exactly one child → always expand recursively (bounded depth 4)
— a single child is definitionally continuation, never fan-out; **more
than 3 children → `OWN` text only, no auto-expansion at all** — measured
directly during construction that a bare economic/legal-signal filter
does not meaningfully bound a real 20-40-basket negative-covenant
section (almost every basket legitimately carries some signal), so
"signal-filtered fan-out" at that scale degrades into "retrieve nearly
the whole section" — exactly the forbidden behavior (task §9). At ≤3
children, each child's own text is included only if it independently
carries a real operative/economic/legal signal (dollar/percentage/ratio/
prohibitory/mechanic keyword) — excluded children are disclosed via a new
`OTHER`-typed, `LOW`-severity unresolved-dependency entry naming exactly
which clause was excluded and why (never silently dropped without a
trace — task §7/§10).

### Calculation-context audit (task §8)

`CALCULATION_SIGNAL` audited against the task's own concept list and
found genuinely narrow in one respect unrelated to the five findings: it
never matched "giving effect to", "deemed incurred", "consolidated
basis", or "ratio calculation date" — added (a small, generalized,
non-package-specific expansion; not the dominant fix for these five
findings, which were resolution/boundary issues, not gating issues).

### Unresolved-reference sufficiency behavior (task §10)

Unchanged sufficiency-priority logic (`BUDGET_EXCEEDED` > `INCOMPLETE` >
`REVIEW_REQUIRED` > `SUFFICIENT`) already downgrades correctly whenever
any unresolved dependency exists; a new synthetic test (#8, see below)
proves a bundle with an unresolved referenced parent is never
`SUFFICIENT`.

### Negative-selection controls (task §9)

- No entire document/article/section is ever retrieved by default.
- The >3-children threshold is the explicit fan-out guard.
- Administrative references are unaffected (still retrieved once, never
  recursed into — synthetic test #9).
- No FWRG, company name, section-specific exception, known threshold, or
  benchmark ID appears anywhere in `structural-references.ts`,
  `reference-context.ts`, `structural-context.ts`, or
  `region-expansion.ts` (grep-verified) — only the two new regression test
  files (`cross-reference-boundary-remediation.test.ts`,
  `phase-2e1-baseline-extract.ts`) name the real FWRG sections, exactly
  as task §12 permits.

## Real bug found and reverted during construction (disclosed, not hidden)

An earlier draft flipped `retrieveCrossReferencesFromNode`'s recursive
call to `includeDescendants: true` whenever a target had been expanded,
and applied the same expansion inside `retrieveChildRules`. Measured
effect: the FWRG `6.07` candidate's bundle hit `maxTextBudgetChars`
mid-build, **silently truncating unrelated later content and
reintroducing all five original findings plus new ones** (20 material
findings observed). Root-caused to two compounding effects: (1)
`retrieveChildRules` duplicating text already present in
`retrieveOperativeSource`'s own full `DESCENDANTS` span (zero new
information, pure budget waste), and (2) `includeDescendants: true`
letting an expanded region's own newly-exposed references recurse into
further expansions, compounding across the cross-reference depth budget.
Both were reverted before this fix was accepted; the final design (§4-§9
above) was measured clean of both effects (see §15).

## 11-12. Tests added

**12 synthetic regression tests** (`cross-reference-boundary-remediation.test.ts`,
first `describe` block) reproducing the generalized shape of every
finding class without any package-specific language: parent-section
children (#1), calculation section with nested clause (#2), mixed
relevant/irrelevant descendants (#3), ancestor self-match (#4), trailing
proviso (#5), calculation context without an obvious keyword (#6),
many-children bounded-selection (#7), unresolved-parent sufficiency
downgrade (#8), administrative-reference exclusion (#9), bounded
reference cycle (#10), no cross-sibling leakage (#11), high-density
numeric section not auto-included (#12). All 12 pass; #7 and #12 fail
under the old (unbounded-fan-out) behavior, #1/#2/#4 fail under the
pre-remediation resolver.

**6 FWRG-specific regression tests** (second `describe` block, real
committed fixture, real discoveryId) — one per original finding (#1-#5)
plus a combined "all five resolve simultaneously" test. Tests may (and
do) name the real FWRG sections/findings per task §12; no production file
does.

## 16. Targeted test results

`cross-reference-boundary-remediation.test.ts`: **18/18 pass.**
`structural-references.test.ts` (Phase 2A's own, pre-existing): **8/8
pass, unchanged.** `context-retrieval-pipeline.test.ts` (Phase 2D's own
36 required scenarios): **36/36 pass, unchanged, zero test edits needed.**

## 17-21. The five original findings, before/after

| # | Before | After |
|---|---|---|
| 1 | `SILENT_UNRESOLVED_DEPENDENCY` at `fwrg::6.07(c)(j)` (nonexistent target) | Item `6.06(j)` retrieved (real content, >50 chars) via antecedent-Section resolution |
| 2 | `SILENT_UNRESOLVED_DEPENDENCY` at `fwrg::6.07(c)(ii)(a)` | Item `6.07(a)` retrieved via antecedent-Section resolution |
| 3 | `SILENT_UNRESOLVED_DEPENDENCY` at `fwrg::6.07(i)(D)`, bare ambiguous citation `"clause (D)"` | Stays unresolved (correctly — no real node exists), citation now `"clause (D) [6.07(i)(D)]"` — disambiguated and traceable; the actual cap language is already present via the candidate's own `OPERATIVE_SOURCE` item (full `DESCENDANTS` span) |
| 4 | `SILENT_UNRESOLVED_DEPENDENCY` at `fwrg::6.07(i)(h)` | Item `6.07(h)` retrieved via ancestor-chain search |
| 5 | `SILENT_UNRESOLVED_DEPENDENCY` at `fwrg::6.07(kk)(A)(kk)` | Item `6.07(kk)` (the real, already-existing `CHILD_RULE`) resolved via ancestor self-match |

**Count resolved: 4** (#1, #2, #4, #5). **Count partially resolved: 1**
(#3 — the economically material portion is retrieved via the already-
present `OPERATIVE_SOURCE` span; the remaining self-referential label has
no separate citable node and is explicitly, disambiguously marked
unresolved, satisfying task §13's own bar for `PARTIALLY_RESOLVED`).
**Count still present: 0. Count `AUDITOR_FINDING_REVISED_FOR_VALID_REASON`: 0.**

## 22-25. New Phase 2E findings; benchmark recompute

**No new material findings anywhere.** Re-running the frozen auditor over
both real packages:

| | FWRG discovery | LSB discovery | FWRG context (12-case) | LSB context (12-case) |
|---|---|---|---|---|
| Before | 108 findings (15 material / 93 uncertain) | 10 (4/6) | 51 (51/0)* | 17 (17/0)* |
| After | 108 findings (15 material / 93 uncertain) — **byte-identical** | 10 (4/6) — **unchanged** | 12 (0 material / 12 uncertain) | 2 (0 material / 2 uncertain) |

\* The FWRG/LSB context "before" row reflects the numbers already reported
in Phase 2E's own final commit (`ec985d0`) — that count includes both the
5 original findings AND additional entity-scope/sibling-signal findings
Phase 2E's own construction had already progressively refined down to 15
FWRG / 6 LSB material by the time it froze; the 5 material findings that
survived to the frozen commit are exactly the five in §2 above. Discovery
counts (108/10) are **completely unchanged**, confirming this remediation
never touched discovery-comparison logic or its inputs.

**Historical Phase 2D benchmark (preserved, not overwritten):**
`docs/phase-2d-covenant-context-retrieval.md`'s own numbers stand exactly
as committed — FWRG raw 7/19=36.8% (addressable 100%), LSB raw 8/10=80%
(addressable 100%). Phase 2D's own ground-truth files
(`fwrg-context-ground-truth.ts`/`lsb-context-ground-truth.ts`) were **not
modified** — those numbers are measured against Phase 2D's own,
independently-authored-but-less-adversarial expected list, which never
enumerated the five items Phase 2E's own independent audit found.
Re-running `phase-2d-evaluate-context-retrieval.ts` after remediation:
FWRG raw recall unchanged at 36.8% (expected — the ground truth denominator
didn't ask for these 5 items), **precision improved from 103/103 to
105/105** (still 100%, 2 more real items credited relevant), LSB
unchanged at 80%/100%/100%.

**Corrected benchmark (Phase 2E's own expanded independent expectations,
the actual measure of whether the 5 findings are fixed):** FWRG 12-case
context material findings **5 → 0**; LSB unaffected (0 → 0, no LSB
findings were ever in the original five). This is the benchmark that
actually matters for this remediation's own gate (task §14: "Reconciling
the independent Phase 2E findings is the goal," not inflating Phase 2D's
own historical percentage).

## 15/28-29. Context precision, bundle size before/after

| | Before | After |
|---|---|---|
| Avg bundle items (12-case benchmark) | 12.6 | 12.8 |
| Max bundle items | 54 | 56 |
| Context precision (FWRG, `phase-2d-evaluate-context-retrieval.ts`) | 103/103 = 100% | 105/105 = 100% |
| Context precision (LSB) | 48/48 = 100% | 48/48 = 100% (unchanged) |
| FWRG `6.07` candidate: items / total chars | 54 / ~37,700 | 56 / 34,617 |
| Total deterministic wall-clock, 12 bundles | 16ms | 36ms |

Bundle size moved by **+2 items / +0.2 avg** — not a context dump. The
`6.07` candidate's own total character count actually went *down*
slightly (two genuinely resolved small items replaced what used to be
larger amounts of unresolved-dependency bookkeeping for the same
references). No unrelated subsection was retrieved; the >3-children
fan-out guard (§4-§9) is the direct, measured reason large sections like
`6.06`/`6.07` themselves are never auto-expanded past their own `OWN`
text when reached as a cross-reference target.

## 30. Retrieval-path evidence for each resolved finding

```
#1: fwrg::6.07 (OPERATIVE_SOURCE)
    → 6.07(c)(ii)'s own text: "comply with Section 6.06 (other than in reliance on clause (j) thereof)"
    → antecedent-Section override: "Section 6.06" + "(j)" = 6.06(j) (real node)
    → item [CROSS_REFERENCE/CALCULATION_PROVISION] 6.06(j), reason: "Explicitly cross-referenced by \"clause (j)\"."

#2: fwrg::6.07 (OPERATIVE_SOURCE)
    → 6.07(c)(ii)(A)'s own text: "this Section 6.07 (other than clause (a), clause (b) or this clause (c))"
    → antecedent-Section override: "Section 6.07" + "(a)" = 6.07(a) (real node)
    → item [CROSS_REFERENCE/CALCULATION_PROVISION] 6.07(a), region-expanded to include both real children (a)(i)/(a)(ii)

#4: fwrg::6.07 (OPERATIVE_SOURCE)
    → 6.07(i)(A)'s own text: "the amount of Dispositions made pursuant to this clause (h)"
    → ancestor-chain search: 6.07(i)+"(h)" does not exist → 6.07+"(h)" = 6.07(h) (real node)
    → item [CROSS_REFERENCE] 6.07(h)

#5: fwrg::6.07 (OPERATIVE_SOURCE)
    → 6.07(kk)(A)(2)'s own text: "the aggregate amount of Dispositions made pursuant to this clause (kk)"
    → ancestor self-match: ancestor "6.07(kk)" itself ends with "(kk)" → resolves directly to 6.07(kk)
    → the already-existing item [CHILD_RULE] 6.07(kk) (from ordinary child-rule traversal), no fabricated new node
```

## 31-32. Frozen-auditor revalidation

**Fault-injection gate: 15/15 tests pass, 12/12 injected defects caught
(100%)** — `coverage-audit-fault-injection.test.ts` re-run byte-for-byte
unchanged, unaffected by this remediation (it exercises synthetic
fixtures, not the real FWRG package).
**Independence regression: 7/7 pass, unchanged** —
`coverage-audit-independence.test.ts` confirms Phase 2D still imports
nothing from `coverage-audit/*`, and the auditor's own import boundaries
are untouched (this remediation touched zero files under
`coverage-audit/`).

## 33-34. Phase 2B/2C regression

Phase 2B canonical metrics (re-verified via unchanged
`discovery-pipeline.test.ts`, 19/19): FWRG section 9/9=100%,
operative-rule 148/149=99.3%, basket/exception 138/138=100%, dangerous
misses 0; LSB section 10/10=100%, operative-rule 50/53=94.3% raw,
basket/exception 40/43=93.0% raw, dangerous misses 0 — **all byte-identical
to the canonical numbers**, no discovery-layer file was touched. Phase 2C:
`package-graph-pipeline`/`-persistence`/`-real-evidence` = 22+8+4 =
**34/34, unchanged** — no package-graph file was touched.

## 35. LSB structural limitation status

**Not fixed, not touched, per task §20's own explicit instruction.** The
LSB `6.14(b)/(c)/(d)` comma-list gap does not share this remediation's
root cause (`STRUCTURAL_REFERENCE_RESOLUTION`/relative-clause
composition) — it is a `STRUCTURAL_COVERAGE_GAP` (the structural parser
never separates the sub-items into their own nodes at all, an entirely
different failure mode from "a reference resolves to the wrong scope").
Phase 2E's own `STRUCTURAL_COVERAGE_GAP` finding for LSB `6.14(a)` is
re-verified present and unchanged (6 structural-gap findings, identical
before/after). Raw Phase 2B LSB metrics remain canonical, unadjusted.

## 36-43. Full regression

Full suite: **821/821 tests pass** (94 test files) — 803 pre-existing
(Phase 2E's own final count) + 18 new. `npx tsc --noEmit`: clean. `npx
eslint .`: clean. `npm run build`: succeeds, all routes compile. Coherent
golden: 26 passed/3 failed/1 flagged/0 errored — **byte-identical to
baseline** (this pipeline never touches Coherent's own legacy
covenant-engine path; `structural-references.ts`'s only other real
caller, `persistStructuralReferences`, is not wired into any live
orchestrator or golden-test path — verified by grep, zero other callers
exist). Matthews golden: 2 passed/4 failed/10 flagged/2 errored — **byte-
identical to baseline**. Protected-data result: no schema/migration
change; no test or script in this phase touched the real Coherent/Matthews
company rows. Tenant/instrument isolation: unaffected (this remediation
touches only single-document, document-scoped structural resolution —
task §19's own "a reference is scoped to its OWN document only" test,
`structural-references.test.ts`'s existing cross-document isolation test,
re-verified passing unchanged).

## 44-45. Cache invalidation, idempotency

`RETRIEVAL_ALGORITHM_VERSION` bumped `phase-2d-context-retrieval.v1` →
`.v2` — `contentIdentity`/`bundleId` are pure hash functions that include
this version string, so **every bundle built under v1 is guaranteed a
different identity under v2** (never silently resumed as current).
Idempotency proven directly: building the same real FWRG `6.07` candidate
twice under the new code produces byte-identical `bundleId`,
`contentIdentity`, item count, and the identical sorted set of `itemId`s.

## 19. Independence preservation (re-confirmed after remediation)

- Phase 2D imports nothing from `coverage-audit/*` (grep-verified; the
  only new file, `phase-2e1-baseline-extract.ts`, is a diagnostic script,
  not part of the retrieval pipeline).
- Phase 2D does not consume Phase 2E's source inventory anywhere.
- `coverage-audit-independence.test.ts`: 7/7 pass, unchanged.
- The fix would operate identically with the entire `coverage-audit/`
  directory deleted — every change lives in `structural-references.ts`
  and `context-retrieval/*`, reachable and correct with zero knowledge
  that an auditor exists.

## 46-50. Model/provider, cost, performance

**None used.** Zero real or synthetic LLM calls anywhere in this
remediation — deterministic resolution and bounded structural expansion
solved all five findings; no semantic call was ever attempted or needed
(task §17's own "attempt deterministic remediation first" — it
succeeded). `providerIdentity`/`semanticPromptVersion` remain `null`
throughout. **Total cost: $0.00.** Performance impact: negligible —
total deterministic wall-clock for all 12 real benchmark bundles rose
from 16ms to 36ms (still far below any practical threshold), driven
entirely by the two newly-resolved cross-reference targets' own bounded
region expansion.

## 51. Known limitations

- Finding #3 remains a genuine, disclosed `PARTIALLY_RESOLVED` case — no
  separate citable node exists for a self-referential internal label
  inside an unstructured (parser-swallowed) clause; the content is
  present via the candidate's own full `OPERATIVE_SOURCE` span, but a
  downstream consumer reading only the `unresolvedDependencies` list in
  isolation would still see it flagged unresolved (correctly, since no
  node was fabricated).
- The `>3 children → no auto-expansion` threshold is a real, disclosed
  bound: a genuinely material sub-clause inside a 4+-child multi-basket
  reference target would not be auto-expanded either (it remains
  reachable via `OWN` text and ordinary structural navigation, just not
  auto-included in that one bundle). No evidence from the 12-case
  benchmark or the fault-injection suite shows this bound excluding a
  real material item — disclosed as a boundary condition, not
  eliminated.
- The antecedent-Section-override window (120 chars, no intervening
  sentence-ending period) is a deterministic heuristic, not a full
  grammatical parse — it is safe by construction (a candidate is only
  ever accepted if it resolves to a real node), but a real antecedent
  pattern outside that window would not be found (falls through to
  ancestor-chain search or stays unresolved, never silently wrong).
- `CALCULATION_SIGNAL`'s expansion (task §8) was audited but not
  exhaustively validated against every concept in the task's own list
  (currency conversion, cash netting, EBITDA adjustments specifically
  were judged already covered by existing "calculat"/"EBITDA"-adjacent
  matches or too specific to add safely without more real evidence).

## 52-53. Gate calculation and final verdict

1. All five original FWRG material findings: **4 genuinely resolved, 1
   individually justified as `PARTIALLY_RESOLVED`** — ✓.
2. Frozen Phase 2E auditor reports **zero unresolved material context
   gaps** attributable to the targeted cross-reference defect (0/0 material
   findings, FWRG and LSB, 12-case benchmark) — ✓.
3. **No new material context gaps introduced** (discovery counts
   byte-identical; context findings only ever decreased) — ✓.
4. **Context precision remains 100%** (both packages); average bundle
   size moved +0.2 items, max +2 items — no context-dump behavior
   (measured, disclosed, and a real over-broad draft was caught and
   reverted during construction) — ✓.
5. **Fault-injection gate remains 12/12 = 100%** — ✓.
6. **Independence intact** (7/7 independence tests pass; zero
   `coverage-audit/*` files touched) — ✓.
7. **No regressions to Phases 2A-2C** (structural-index 17/17, discovery
   19/19, package-graph 34/34, all byte-identical) — ✓.
8. **Idempotency/invalidation work correctly** (proven directly; version
   bump guarantees stale-bundle non-reuse) — ✓.

**`PHASE_2E_1_CROSS_REFERENCE_REMEDIATION_GATE_PASSED`**

This does not begin Phase 2F automatically.

## 54. Is the primary + frozen auditor architecture ready for Phase 2F?

**Yes, for the specific defect this task targeted.** The five real
material omissions Phase 2E's own independent audit found in Phase 2D's
"zero material misses" 12-case benchmark are now resolved or individually
justified, with real evidence (not asserted). Two disclosed, narrower
boundary conditions remain (§51): the `>3`-children non-expansion bound,
and finding #3's own genuine partial-resolution status. Neither was
found to hide a real, currently-known material gap in the 12-case
benchmark or the fault-injection suite. Combined with Phase 2E's own
`REGRESSION_GATE_PASSED` verdict, the stack is materially stronger than
before this task, but readiness for Phase 2F ultimately rests on a human
or a future phase's own judgment about the two disclosed boundary
conditions above, not a further automatic claim from this report.

## 55. Recommended next task (exact)

Per the stop condition, no further work proceeds automatically. If asked
to continue, two candidate next tasks are visible, in order of value: (1)
**Phase 2F — genuinely unseen third-package validation** of the now-
remediated Phase 2A-2E stack, since this task's own gate passed and no
further known material gap remains in the regression evidence on hand; or
(2), if a more conservative posture is preferred first, **a targeted
audit of the `>3`-children non-expansion boundary** against a broader
real sample (beyond the 12-case benchmark) to gather direct evidence for
or against raising that threshold before Phase 2F begins. Neither should
begin automatically from this report.

## Stop condition compliance

The Phase 2D cross-reference/context-boundary defect was remediated and
the frozen Phase 2E auditor revalidated the result, using only the
already-committed FWRG/LSB fixtures. The reserved Phase 2F package was
not acquired, inspected, ingested, benchmarked, or tuned against. No
amendment precedence was applied. No generalized formula ontology was
implemented. No covenant capacity was calculated. No customer-facing
product surface was built. This report stops here.
