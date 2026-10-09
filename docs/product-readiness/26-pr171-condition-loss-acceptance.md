# PR #171 — independent qualitative condition-loss acceptance

Reviewed SHA `6b0d36411c08dbea2e132d6b22363b18ee582ab7` (one commit, branch `cursor/qualitative-condition-loss-f19d`; starting
`main` = merge base `4feff69f05ef28996145bdc88e0ebfa4c6b3b240`). Pre-fix tree, PR tree and a `main` (`4fb1ab7e`) + PR dry-merge
(0 conflicts; `main` has not touched `lib/contract-model/compiler/semantic/` since the fork) were run in detached worktrees.
$0; no frozen fixture edited; nothing merged or promoted. The implementing agent's numbers were not used.

**Verdict: PR171_INDEPENDENT_SAFETY_ACCEPTANCE_PASSED.** Recommend marking #171 ready for review and merging through the
normal branch protections. Four non-blocking observations in §5.

## 1. Pre-fix failure reproduced

PR #171's test file copied onto pre-fix `main` `4feff69f`: **9 failed / 21 passed** (`unlimited-carveout-qualitative-gates.test.ts`):
version pin v12≠v13, `expression` dropped (`expected null to be 'payable solely in cash'`), `referencesDefinitionId` dropped,
`evaluationBasis` dropped (`expected undefined to be 'the transfer'`), `referencesRuleTargets` dropped, non-gate `rawModelExcerpt`
dropped (two cases), manner gate suppressed by a clause excerpt with an independent description (`[…(2)] to include 'in the
ordinary course of business'`), unbound selected pair left `COMPLETE` (`expected 'COMPLETE' to be 'PARTIAL'`). On `6b0d3641`:
30/30. Independent probe (session scratchpad `pr171/probe.ts`, run on both trees) confirms the same five carriers were silently
deleted on pre-fix `main` and are retained on the PR (§2).

## 2. Adversarial matrix (`applyUnlimitedCarveOutQualitativeGates` direct + `normalizeSubmission`)

| # | input | pre-fix `4feff69f` | **#171** | reading |
|---|---|---|---|---|
| P1 | exact gate pair as excerpt and description, no carriers | dropped, 2 bound gates | dropped, 2 bound gates | intended fold |
| P2–P6 | P1 + `expression` / `referencesDefinitionId` / `referencesRuleTargets` / `evaluationBasis` / richer `rawModelExcerpt` | **dropped** (silent loss) | kept + 2 gates (3 conditions) | fixed |
| P7 | P1 + `inventoryItemIds: ["inv-77"]` only | dropped | dropped; new gates carry no lineage | §5.1 |
| P8 | exact manner excerpt whose provenance is §7.03 (another section) | dropped, re-bound to own clause | same | §5.2 |
| P9/P10 | `targetCombination` only / `referencesRuleTargets: []` | dropped | dropped | not restrictions on their own |
| P11 | `evaluationBasis` with all-null fields | dropped | kept + 2 gates | over-retention, safe |
| P12 | clause excerpt + description stating `payable solely in cash` | manner gate **not** emitted | manner gate emitted; description kept | fixed |
| P13 | clause excerpt, `PURPOSE` type, independent description | kept + 2 gates | same | |
| P14 | manner-exact excerpt + independent description | kept, no duplicate | same | |
| P15 | unrelated condition (`no Default has occurred`) | kept | kept | no over-withholding |
| P16 | excerpt null, `rawModelExcerpt` exact, description exact | dropped | dropped | exact raw excerpt is not a carrier |
| P17 | description with defined-term capitalisation | dropped | dropped | normalised equality; same words |
| P18 | `expression` is itself the manner-gate leaf | dropped | kept + 2 gates | duplicate, safe |
| P19 | clause excerpt, description paraphrases the pair with other words | clause counted as manner gate | manner gate emitted (3 conditions) | §5.4 |
| P20 | selected pair, binder returns null, exact-pair condition present | unchanged, flag absent | `unboundPair: true`, conditions untouched | §3 |
| P21 | selected pair, binder null, no conditions | unchanged | `unboundPair: true` | |
| P22 | two pairs; anchor mentions object A inside a negation | pair A selected, A's gates added | same | §5.3 (pre-existing) |
| P23 | two pairs; anchor is the shorter object (`damaged equipment`), non-unique in source | silently unchanged | `unboundPair: true` | fixed |
| N1 | wire condition with `inventoryItemIds` through `normalizeSubmission` | PARTIAL, lineage gone | same | §5.1 |
| N4 | two UNLIMITED siblings, one pair | AMBIGUOUS | AMBIGUOUS | unchanged |
| PR test | selected pair, `citation: null` (unbindable), model `COMPLETE` | `COMPLETE` | `PARTIAL` + `QUALITATIVE_GATE_SOURCE_UNBOUND`, 0 conditions, `gatedBy` null | fixed |

No remaining silent-condition-loss counterexample was found on the PR for a restriction carried in `expression`,
`referencesDefinitionId`, `referencesRuleTargets`, `evaluationBasis`, `description`, authoritative `excerpt` or
`rawModelExcerpt`. The remaining drops (P7, P8, P9, P10, P16, P17) remove no restriction text.

## 3. Sufficiency on unbound pairs

`normalize.ts`: `unboundPair` → SUFFICIENCY warning + `COMPLETE` → `PARTIAL`; `AMBIGUOUS` / `MISSING_CONTEXT` / `CONFLICTED`
left as arrived. The only other early return before binding (`!redundant && hasObjectCondition && hasMannerCondition && composed`)
requires the model to have already bound both gates and composed `gatedBy`, so an unbound pair cannot reach it. Module has a
single production caller (`normalize.ts:815`).

## 4. Regression, CI, cache, scope

| gate | pre-fix | #171 | main `4fb1ab7e` + #171 |
|---|---|---|---|
| `npm run test:phase3-certification` | 489 (per PR body) | 489/489 (28 files) | 489/489 |
| `tests/contract-model/semantic-compiler` + `certified` | 507/507 | 515/515 | — |
| failure-set diff | — | identical (none) | — |
| `npx tsc --noEmit -p .` | — | 14 (pre-existing Prisma-client errors, = main) | 14 |
| qualitative suite | 9 failed | 30/30 | 30/30 |

CI on `6b0d3641`: `p3-r0-soft-gate` ran on both push and pull_request events and executed the new dedicated step
(`npx vitest run tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts` → 30 passed) before the
Postgres suites; `canonical-compiler` certified path SUCCESS ×2. The path filters now name the honesty module, `normalize.ts`,
`types.ts` and the test, so a change to any of them triggers the step (item 7 ✓).

Cache identity: `computeCacheKey` (`cache.ts:68`) hashes `compilerAlgorithmVersion`, so every v12 entry misses under v13; the only
cache implementation is `InMemorySemanticCompilationCache`. Persisted rules stamp `compilerVersion` from the input and the
covenant-map identity carries `compilerAlgorithmVersion`, so a v12 record is distinguishable but is not rewritten: the PR touches
no `datasets/` or `docs/` record; `datasets/source-to-covenant/provenance/version-pins.json` and the nine `eval-heldout` records
still say v12, and `tests/source-to-covenant-dataset/dataset.test.ts` only pattern-matches the pin (item 6 ✓).

Scope and provenance (item 9): `docs/architecture/PHASE-3-TRACK-A.FROZEN.md` sha256 `25d37063…` at pre-fix `main`, at the #130
merge `85780486` and at `6b0d3641` — byte-identical. The audit note's history claims verified in git: `aec5010e` changed
`unlimited-carveout-honesty.ts`, `normalize.ts`, `types.ts` (v12) and appended the suite to `test:phase3-certification` in
`package.json` (0 occurrences before, 1 after); no workflow changed between `aec5010e^` and `85780486`; the grant's scope row reads
"workflow + test paths only" and its CI item names exactly the path-filter + vitest invocation #171 now adds. The disclosure is
accurate. The PR itself again edits compiler files outside that grant (necessarily, to close the loss); that is disclosed in the
note and is for the Integration Lead to accept.

## 5. Non-blocking observations

1. **Inventory lineage is dropped with a redundant condition** (P7/N1). `inventoryItemIds` are not a retention carrier and the
   replacement gates carry none. The grounding audit (`qualitative-grounding.ts`) rates the new gates GROUNDED because their
   excerpts are source-bound, and no reconciliation pass computes "inventory items no longer consumed by any condition", so the
   loss is not material today. Smallest improvement: copy the dropped condition's `inventoryItemIds` onto the emitted gates.
2. **Provenance identity is replaced** (P8): an exact manner condition whose provenance points at another section is treated as
   redundant and re-bound to this clause. The restriction text survives; the original citation does not. Treating a different
   `sourceCitation` / `sourceNodeKey` as a carrier would keep it.
3. **Substring anchor matching can mis-attribute** (P22, pre-existing, unchanged): `selectPair` picks a pair when any anchor
   *contains* its object phrase, including inside a negation (`other than surplus or damaged equipment`). The effect is an extra
   restriction on the wrong sibling, never a false permission. Requiring the clause excerpt (object through manner) in the anchor
   would remove it.
4. **Duplicate conditions when a carrier is present** (P2–P6, P11, P18, P19): the kept condition restates the pair beside the two
   emitted gates. Conservative; no capacity effect; worth de-duplicating only if downstream review counts conditions.

## 6. Repro

```
git fetch origin main refs/pull/171/head; git worktree add --detach <wt> 6b0d36411c08dbea2e132d6b22363b18ee582ab7  # and 4feff69f
cp <pr>/tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts <pre-fix>/tests/contract-model/semantic-compiler/
npx vitest run tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts   # 9 failed on 4feff69f, 30 passed on 6b0d3641
npm run test:phase3-certification; npx vitest run tests/contract-model/semantic-compiler tests/contract-model/certified; npx tsc --noEmit -p .
sha256sum docs/architecture/PHASE-3-TRACK-A.FROZEN.md; git show --stat aec5010e; git diff --stat aec5010e^ 85780486 -- .github/
```
