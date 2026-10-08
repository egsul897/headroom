# PR #161 — independent Chewy §6.08(a)(3)(b) P0 replay

Reviewed SHA `f0dd07691773170744606327abe5b18223d8d5f4` (branch `cursor/chewy-a3b-span-remediation-aa25`; code commit
`6760e31f`). Merge base with `origin/main` at review time: `42eb32163095dcfe6ca0d7b90118bc145eec802c` (PR 4 ahead, main
19 ahead). Current main during the replay: `80c26e4d114ad6bf56a15d24c2fa3de9981bc734`. All runs in detached read-only
worktrees; $0; no frozen fixture, evidence or certification touched; PR not merged.

**Verdict: INDEPENDENT_PARSER_REMEDIATION_PASSED** (with the limitations in §7).

## 1. Diff inspection (mandatory check 1)

Production diff is confined to `lib/contract-model/compiler/clause-hierarchy.ts` (+58/−4): a new `openLetterResumesNearby`
guard consulted by `restartedLetterCandidate`, which now receives the open-level `stack`. The guard refuses a restarted
letter run (`(x)` then `(y)`) when an already-open letter list of the same alphabet resumes its next letter within the next
four line-start markers (the immediate `(y)` successor is skipped). It uses only the token stream, the open stack and line
starts: **no fixture-specific offsets, node ids, document ids or issuer strings** (verified by reading the diff; the only
literal is the window size 4, the same window `innerResumesBeforeOuter` already used). A Chewy-naming comment was removed.
Exact offsets appear in tests only. Other files: two test files and `docs/audits/2026-10-08-p0-chewy-a3b-parser-remediation.md`.
No fixture, evidence, pin or `execution.json` is touched, so no new provider-backed evidence or certification (check 5).

## 2. Chewy §6.08(a)(3)(b) reproduced (check 2)

`parseDocumentStructure` over the committed Chewy fixture, per tree:

| | merge base `42eb321` (defective) | current main `80c26e4` | PR `f0dd076` | main + PR dry-merge |
|---|---|---|---|---|
| `6.08(a)(3)(b)` span | 664123–664780 (owned 657) | same | **664123–666205 (owned 2082)**; `(c)` starts 666205 | same as PR |
| `6.08(a)(3)(b)(x)/(y)` | present (664780, 665096) | present | **absent**; (b) has no children | absent |
| owned text contains `(i)(A) Equity Interests of the Borrowers` / `(x) Equity Interests to any` / `(y) Designated Preferred Stock` / `(B) to the extent such net cash proceeds` / `(ii) Indebtedness of any Restricted Party` / `Excluded Contributions; plus` | only the first | only the first | **all six** | all six |
| Chewy total nodes | 1576 | 1576 | 1572 | 1572 |

The defect is reproduced on the merge base and on current main (main carries the defective #132 tip), and the PR restores the
span exactly as claimed.

## 3. Synthetic controls (check 3)

PR tests: 39/39 (`clause-hierarchy.test.ts` 19, `clause-hierarchy-f2-nesting.test.ts` 20), including the new negative
control (interior `(x)/(y)` with `(c)` resuming nearby → no `(b)(x)/(y)`) and the positive control (numbered children, then
`(x)/(y)` with a six-limb roman run under `(y)`, outer `(b)` only afterwards → `(a)(x)`, `(a)(y)`, `(a)(y)(i)…(vi)`, `(b)`).
Two extra independent probes, run on both trees:

| input | merge base | PR |
|---|---|---|
| `(a) first:` / `(x) …` / `(y) …` / `(b) second.` | `(a)`, `(a)(x)`, `(a)(y)`, `(b)` | `(a)`, `(b)` |
| `(a)` / `(1)` / `(2)` / `(x)` / `(y)` / `(b)` | `(a)`, `(a)(1)`, `(a)(2)`, `(a)(2)(x)`, `(a)(2)(y)`, `(b)` | `(a)`, `(a)(1)`, `(a)(2)`, `(b)` |

So a restarted run opens only when the outer letter does **not** resume within four line-starts. A short genuine `(x)/(y)`
sub-list directly followed by the next outer letter is no longer minted; its text stays inside the parent (no truncation,
no fabrication). See §7.

## 4. Surrounding §6.08 (check 4)

On the PR tree: `6.08(a)(3)(a)`–`(i)` all children of `6.08(a)(3)`; `6.08(b)` body at 670039–697571 with `(1)`–`(27)` all
its children; TOC `6.08` at 4922–4976 and body `6.08` at 659042–697571 kept apart; the inline proviso `… this clause\n(b)
shall not include …` at 665769 mints no node on either tree. One further change the PR body does not mention:
`6.08(b)(16)(g)(x)/(y)` (689561, 689793) are no longer minted and `(g)`'s span becomes 689219–690271. Source:
`provided that the amount … shall\n(x) reduce Consolidated Net Income … and\n(y) increase … Consolidated EBITDA …; and\n\n(h)` —
proviso limbs interior to `(g)`, so the same guard applies; `(g)` is no longer truncated at `(x)`. Net Chewy delta −4 = these
two pairs.

## 5. Gibraltar before / after (check 5)

| | merge base | PR | current main | main + PR |
|---|---|---|---|---|
| structural nodes | 2064 | **2064** | 2064 | 2064 |
| Pass A candidates | 938 | **938** | 938 | 938 |
| `resolveUniqueNodeByRef("7.05(a)(y)")` | UNIQUE @776996 | **UNIQUE @776996** | UNIQUE | UNIQUE |
| sha256 of `(sectionRef, nodeType, charStart, charEnd)` list | `7b72826e57ef0352…` | **identical** | identical | identical |

The guard changes nothing on Gibraltar. No provider call, no new evidence; the sealed #128 `execution.json` (2087 / 946 tree)
is untouched and remains wrong-tree relative to this parser, as the PR says.

## 6. Tests, TypeScript, CI, merge compatibility (checks 6–8)

| gate | PR `f0dd076` | merge base `42eb321` | current main `80c26e4` | main + PR |
|---|---|---|---|---|
| parser + F-2 nesting | 39/39 | — | — | 39/39 (inside 82/82 below) |
| `tests/stratified-cert` | 43/43 | — | — | 82/82 (main has more files) |
| `npm run test:phase3-certification` | 481/481 | — | — | 481/481 |
| `npx tsc --noEmit -p .` errors | 17 | 17 (**identical set**) | 14 | 14 (identical to main) |

TypeScript (check 7): the 17 errors on the PR are exactly the 17 on its merge base: 3 in
`tests/financial-definitions-precedent/dataset-integrity.test.ts` (`noUncheckedIndexedAccess`, fixed on main by #159 at
`164f2dcd`) plus 14 pre-existing Prisma-client field errors in `app/[companyId]/ledger/*`, `lib/coherent.ts` and
`tests/ledger/supersede-ledger-entry.test.ts`, present on main too. **PR #161 introduces zero new TypeScript errors**, and the
financial-definitions errors disappear once it is on current main (dry-merge: 14 = main).

GitHub Actions (check 8): on `f0dd076` the API shows one workflow run — `canonical-compiler` / "certified path
(provider-free)" SUCCESS (`actions/runs/37858269500`) — plus the Vercel check and status. `stratified-cert.yml` did **not** run
for this PR: its path filter covers only `tests/stratified-cert/**`, `docs/phase-3-reliability-stratified-certification/**`,
`scripts/stratified-cert/**`, so a parser change never triggers it; the PR body's "all 3 checks" counts Vercel twice. Run
locally instead (43/43 on the PR, 82/82 on main + PR). `80c26e4` (main head) has no workflow runs at all. Merge
compatibility: `git merge --no-ff --no-commit f0dd076` onto `80c26e4` is clean (0 conflicts, 4 files), and the merged tree
reproduces the PR's Chewy and Gibraltar results.

## 7. Remaining limitations

1. **Addressability trade-off.** The guard suppresses every line-start `(x)/(y)[/(z)]` run under an open letter item whose next
   letter resumes within four line-starts. Across the nine other real fixture documents this removes 10 nodes and changes no
   other spans: DSGR doc-a/doc-d `8.06(c)(ii)(x)/(y)` (an interior enumeration — a genuine truncation of `(ii)` is fixed,
   like Chewy), and final-lightweight doc-a/doc-b `2.05(2)(e)(x)/(y)/(z)` (proviso limbs `provided that (x) … and (y) … and
   (z) …`, previously addressable as children of `(e)`, now interior text). CONMED, FWRG and RIOT are unchanged. Proviso
   limbs lose their own node but nothing is truncated or fabricated — the fail-safe direction, and the PR should disclose it.
2. Glued `(i)(A)` still mints no node (pre-existing; the PR says so). `(b)(i)`, `(b)(i)(A)`, `(b)(i)(B)` remain unaddressable.
3. Window size 4 is a heuristic constant shared with `innerResumesBeforeOuter`; a `(x)/(y)` sub-list with exactly five or more
   line-starts before the outer letter resumes still opens as a nested run.
4. `stratified-cert` is not CI-gated for parser changes; the local run is the evidence.

## 8. Merge recommendation

Merge PR #161 onto current main as a non-draft after rebasing or merging main in (clean), with the PR body corrected on two
points: the CI line (one workflow + Vercel; stratified-cert ran only locally) and the undisclosed `6.08(b)(16)(g)(x)/(y)`,
DSGR `8.06(c)(ii)(x)/(y)` and term-loan `2.05(2)(e)(x)/(y)/(z)` removals, ideally pinned as regression expectations. No
certification advancement; `execution.json` on #128 stays wrong-tree.

## 9. Repro

```
git fetch origin main refs/pull/161/head
git worktree add --detach <wt> f0dd07691773170744606327abe5b18223d8d5f4   # and 42eb3216 / 80c26e4d
npx vitest run tests/contract-model/clause-hierarchy.test.ts tests/contract-model/clause-hierarchy-f2-nesting.test.ts --reporter=verbose
npx vitest run tests/stratified-cert; npm run test:phase3-certification; npx tsc --noEmit -p .
# parseDocumentStructure over the Chewy and Gibraltar fixtures (scripts in the session scratchpad); runPassADeterministicSignals; resolveUniqueNodeByRef("7.05(a)(y)")
gh api repos/egsul897/headroom/actions/runs?head_sha=f0dd07691773170744606327abe5b18223d8d5f4
```
