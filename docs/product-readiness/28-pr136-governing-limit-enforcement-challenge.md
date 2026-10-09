# PR #136 @ `ab917087` — independent governing-limit enforcement challenge

Reviewed SHA `ab9170875949bde3c1ffb8e49fdeb83980daa78f` ("Represent a governing aggregate ceiling separately from capacity";
branch `cursor/architecture-remediation-7cc2`, draft). Read-only detached worktree; $0; no fixture, pin or frozen harness
edited; nothing merged. Probes are session-scratchpad scripts over the PR's own test helpers and the frozen xref harness.

**Verdict: GOVERNING_LIMIT_ENFORCEMENT_GAP.** Representation gap: closed in the IR, not yet produced by any compile path in the
repo. End-to-end enforcement: **not closed** — the certified Phase-4 path is safe only by blanket refusal of every cross-rule
dependency it can see, the evaluator is consumed by nothing, and the runtime primitives publish an UNLIMITED permission as
AVAILABLE with no ceiling applied.

## 1. Source → IR → capacity → transaction trace (§7.02(c) LIMITED_BY §7.04)

| stage | what happens to the dependency | preserved / evaluated / ignored / dropped |
|---|---|---|
| wire → `normalizeDependency` | a `dependsOn` entry whose target resolves **inside the unit** becomes `dependsOn[{LIMITED_BY, targetRuleId}]`; one that does not becomes `sourceDependencies[{LIMITED_BY, exactSourceTargetRef, SOURCE_REFERENCE_RESOLVED}]`. Never both (`normalize.ts:712-736`) | preserved, in one of two fields |
| `IRRule.governingLimit` (new) | `{ceilingExpression, measuredAggregate: PROVISION_AGGREGATE{governingSectionRef, measurementBasis}}`; `validate.ts:118` type-checks the ceiling; `figure-role` classifies the stated MAX as PROHIBITION_THRESHOLD; a MAX stored as `capacityExpression` is still THRESHOLD_AS_CAPACITY | preserved |
| frozen xref compile | §7.02(c): `UNLIMITED_CAPACITY`, `dependsOn: []`, `sourceDependencies: [LIMITED_BY Section 7.04, bound 0]`, CERTIFIED. §7.04: still the scripted PERMISSION + MAX (`governingLimit` **absent**) → WRONG_AMOUNT → REVIEW_REQUIRED | the new slot is produced by no compile in the repo; only hand-built rules in `aggregate-ceiling-limit.test.ts` carry it |
| `buildCapacityGraph` (`graph.ts:202`) | "governingLimit is unread"; no RULE_CAPACITY for the ceiling; a LEGAL_RELATIONSHIP edge is added only `if (targetExists)` — the ceiling has no capacity node, so **no edge at all** | ignored |
| `evaluateCapacityState` | permission node: `AVAILABLE`, gross `UNLIMITED`, effective `UNLIMITED`, limitations `[]` (probe A–E below) | ignored |
| `simulateTransaction` (unverified primitive, default policy ALLOW_MISSING) | a 500,000,000 draw on the certified xref §7.02(c): `simulationStatus SIMULATED`, effect `SATISFIED` against `UNLIMITED` | ignored |
| `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` (Phase-4, REQUIRE) | `verified-execution.ts:205-213` refuses the **whole package** with `CROSS_RULE_GATE_NOT_EXECUTABLE` when any rule carries `referencesRuleTargets`, or a REQUIRES/LIMITED_BY entry in `sourceDependencies` / `unresolvedDependencies`. It does **not** read `dependsOn` | fail-closed by refusal, not by evaluation |
| `evaluateGoverningLimit` (`runtime/governing-limit.ts`) | correct standalone arithmetic and withholding (§3) | **consumed by nothing**: the only non-test reference to the module is the id helper in `ir/identity.ts:99` |

## 2. Adversarial results

Runtime primitives (`buildCapacityGraph` + `evaluateCapacityState`, PR helpers, safe scope, resolved amendment state):

| # | package | permission `7.02(c)` entry |
|---|---|---|
| A | UNLIMITED LIMITED_BY 7.04 (`dependsOn`), ceiling with `governingLimit`, no Total Assets, no usage | AVAILABLE / UNLIMITED, 0 edges |
| B | A + Total Assets 1,000,000,000 | AVAILABLE / UNLIMITED |
| C | two permissions (c),(d) LIMITED_BY the same ceiling | both AVAILABLE / UNLIMITED (no shared consumption) |
| D | ceiling rule absent (dangling LIMITED_BY) | AVAILABLE / UNLIMITED |
| E | A + `sourceDependencies` LIMITED_BY as well | AVAILABLE / UNLIMITED (primitive layer; the verified gate would refuse this one) |
| U | certified xref §7.02(c) through `simulateTransaction` | SIMULATED, effect SATISFIED / UNLIMITED |
| N | same-unit permission + ceiling through `normalizeSubmission` | `dependsOn [LIMITED_BY]`, `sourceDependencies []`, sufficiency COMPLETE; graph 1 node / 0 edges |

Verified path (frozen xref package, REQUIRE): `evaluateVerifiedCapacity` and `simulateVerifiedTransaction` → `CROSS_RULE_GATE_NOT_EXECUTABLE`,
no entries, no simulation — because §7.02(a)/(b)/(c) all carry source dependencies. Isolating §7.02(c) alone could not be
completed (single-unit packages fail `VERIFICATION_IDENTITY_UNBOUND` on the envelope), so the following is by code reading:
a permission whose LIMITED_BY resolved **in-unit** (case N: the ceiling in the same compiled section, e.g. a "provided that the
aggregate under this Section…" ceiling) carries the edge only in `dependsOn`, which the Phase-4 gate never inspects. **SUSPECTED
false-available on the certified path for a same-unit ceiling; CONFIRMED on every unverified primitive.**

`evaluateGoverningLimit` matrix (G1–G12): withholds correctly for a permission that does not record LIMITED_BY (G5), an
improperly promoted limit on a PERMISSION (G6), a MAX also stored as capacity (G7), missing Total Assets (G8), currency
mismatch (G9), unresolved amendment (G10), a member with its own MONEY capacity (G11), entity scope outside the limit (G12).
Three silent cases: **G1** `measuredAggregate.governingSectionRef` naming an unrelated section (`Section 9.99`) on the 7.04
limit → DETERMINED (the reference is free text, never checked against the limit's own `sourceSectionRef`, so an unrelated
§7.04 mention can be attached to the wrong limit); **G2** arbitrary `measurementBasis` → DETERMINED; **G3** usage 200,000,000
against ceiling 170,000,000 → DETERMINED with `remaining -30000000` and no exhausted/exceeded flag; **G4** `ProvisionAggregateUsage`
has no as-of date, so a stale usage figure cannot be detected. Shared consumption across (c)/(d) is one shared `remaining`
only inside this evaluator (C above shows the graph gives each member UNLIMITED); sequential draws are not modelled anywhere.

Check 6 (classification not reversed): standalone §7.04 prohibition with `governingLimit` → no RULE_CAPACITY (PR test + probe A);
promoted limit on a PERMISSION → NON_EXECUTABLE (G6); genuine same-clause "may incur … greater of" → capacity kept, AVAILABLE
170,000,000 (PR test). Check 9: no certified path bypasses an unresolved condition, but only because every LIMITED_BY source
dependency is refused outright.

## 3. Frozen xref failures (unchanged harness)

Three failures on `ab917087`, identical to the parent `ad7955ca` (doc 24): (1) §46/§53 expects ten CERTIFIED — §7.04 is
`MAPPED_WITH_REVIEW / REVIEW_REQUIRED` (`WRONG_AMOUNT`, `VERIFICATION_NOT_CLEAN`); (2) SA-2 §26 expects the untouched package
CERTIFIED — it is REVIEW_REQUIRED (`CANDIDATE_REVIEW_REQUIRED`, `REVIEW_ONLY_EXECUTABLE_DEPENDENCY`×3, `UNBOUND_EXECUTABLE_BINDING`×2);
(3) §13–§15 expects every IR-derived edge `CERTIFIED_SEMANTIC` — the §7.04 edges are not. All three cascade from one fact: the
scripted §7.04 submission still models the ceiling ("shall not at any time exceed the greater of…", inventoried as THRESHOLD by
the harness itself) as a PERMISSION with MAX capacity, which the corrected figure-role semantics now refuse. **Obsolete
positive-certification expectations, not an implementation regression**; the frozen harness and its scripted §7.04 must be
re-frozen by their owner (not altered here), after which the PR's own claim "§7.04 stays REVIEW_REQUIRED" is the correct state.

## 4. Gates on `ab917087`

`aggregate-ceiling-limit` + `shared-capacity-aggregate-alone-e2e` 20/20 · `npm run test:phase3-certification` 462/465 (the three
above) · `npx tsc --noEmit -p .` 14 (= main, pre-existing Prisma-client fields). CI on the head: `canonical-compiler` runs red on
the same three (as the PR body states). Merge base is `cursor/gibraltar-haiku-verify-7cc2`, not `main`; `mergeable_state: unstable`.

## 5. What would close the gap (not implemented here)

1. `buildCapacityGraph`: emit a `GOVERNING_LIMIT` node for a rule with `governingLimit` and a LEGAL_RELATIONSHIP edge from each
   LIMITED_BY member — from **both** `dependsOn` and `sourceDependencies` — and have `evaluateCapacityState` call
   `evaluateGoverningLimit`, replacing the member's `UNLIMITED` effective remaining with `MIN(UNLIMITED, remaining)` and
   `NEEDS_INPUT` / `REVIEW_REQUIRED` when the limit is not DETERMINED.
2. `verified-execution.ts:205-213`: include `dependsOn` LIMITED_BY/REQUIRES in the cross-rule gate until (1) exists.
3. `evaluateGoverningLimit`: refuse when `governingSectionRef` does not name the limit's own section; flag `remaining < 0`;
   require an as-of on `ProvisionAggregateUsage` and compare it with `asOf`.
4. A compile fixture (or re-frozen xref §7.04) that actually produces `governingLimit`, so the slot is exercised end to end.

## 6. Repro

```
git fetch origin refs/pull/136/head; git worktree add --detach <wt> ab9170875949bde3c1ffb8e49fdeb83980daa78f
npx vitest run tests/contract-model/aggregate-ceiling-limit.test.ts tests/contract-model/certified/xref-fixtures.test.ts; npm run test:phase3-certification; npx tsc --noEmit -p .
# probes (session scratchpad): capacity graph/state/simulate over PR helpers (A–E, U, N); evaluateGoverningLimit G1–G12; xref package → certifiedMapToVerifiedExecutionPackage → evaluateVerifiedCapacity / simulateVerifiedTransaction
```
