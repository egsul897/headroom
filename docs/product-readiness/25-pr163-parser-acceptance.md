# PR #163 — independent parser acceptance (glued `(i)(A)` chains)

Reviewed SHA `2a536040b7f814e13466ddbe677e982e152debcd` (one commit, "Nest real (x)/(y) under glued (i)(A) instead of dropping
them"; base `b2740f7d`, mergeable clean). Compared against `origin/main` at `ab87979fe6e768ac41f691341f38a3d098e1ebb2` and
against PR #161 at `f0dd07691773170744606327abe5b18223d8d5f4` (doc 23). `main` moved to `e5b8a212` during the review; the
43 new commits touch no parser, fixture, certification or stratified-cert path (`git diff --stat ab87979f e5b8a212 -- lib/contract-model
tests/contract-model tests/stratified-cert scripts/p3-development-pipeline tests/fixtures/unseen-packages` is empty), so every
measurement below holds on current `main`. All runs in detached read-only worktrees (`#163`, `main`, `#161`, `main+#163` and
`main+#161` dry-merges, both 0 conflicts); $0; no frozen fixture, evidence, pin or certification touched; nothing merged. The
implementing agent's reported numbers were not used.

**Verdict: PR163_PARSER_REMEDIATION_REQUIRED.** PR #163 must **not** supersede PR #161. PR #161 remains the selected Chewy P0
correction. PR #169 (`db9d7dc9`, which carries #163's parser and reports 2081 / 943) stays blocked until a parser correction is
merged and its structural measurements are reproduced on `main`.

## 1. What the diff does

`lib/contract-model/compiler/clause-hierarchy.ts` only (plus tests and a note). `MARKER_OCCURRENCE` loses the `(?!\()` lookahead
(a marker directly followed by `(` is no longer excluded), and a `GLUED_MARKER` / `ALPHA_MARKER` pass splits a glued chain such as
`(i)(A)` into two markers when the chain is alphabetic. The intent is right: it is the first branch that makes Chewy
`6.08(a)(3)(b)(i)`, `(b)(i)(A)`, `(b)(i)(B)` and the real `(A)(x)/(y)` addressable. The problem is that the two relaxations have no
line-start or prose guard, so every mid-sentence citation of the form `clause (c)(i)`, `paragraphs (b)(ii)`, `Section 6.01 (a)(i)`
or `this clause (iii)(A) and/or (B)` now mints structural nodes. No fixture offsets, ids or issuer strings in the code.

## 2. Chewy §6.08(a)(3)(b) — required checks 1–6

`parseDocumentStructure` over the committed Chewy fixture (`doc-a-2026-06-23-credit-agreement.txt`):

| node | `main` `ab87979f` | PR #161 | **PR #163** |
|---|---|---|---|
| `6.08(a)(3)(b)` | 664123–664780 (truncated) | 664123–666205, no children | 664123–**664561** (own text up to `(i)`) |
| `(b)(i)` | — | — | 664561–664564 (own text is literally `(i)`) |
| `(b)(i)(A)` | — | — | 664564–664780 |
| `(b)(i)(A)(x)` / `(A)(y)` | fabricated as `(b)(x)` 664780, `(b)(y)` 665096 | absent | 664780–665096 / 665096–665133 |
| `(b)(i)(B)` | — | — | 665133–665582 |
| `(b)(ii)` | — | — | 665582–666205 |
| `(b)(x)` / `(b)(y)` | present | absent | **absent** (check 2 ✓) |
| `(c)` boundary | 666205 | 666205 | **666205** (check 5 ✓) |
| Chewy total nodes | 1576 | 1572 | 1581 |

Ownership (check 4): the partition probe over every tree reports 0 overlapping sibling spans, 0 child characters outside the
parent, 0 gaps between `(b)`'s children and `(c)`; each character of 664123–666205 is owned by exactly one leaf. `(a)(3)(a)`–`(i)`
and `(b)(1)`–`(27)` intact; TOC `6.08` 4922 / body 659042 kept apart. On #163 the limb text is correct where the PR says it is.

But the same relaxation restructures two other Chewy sections the PR does not mention:

| section | source text (verbatim) | `main` / #161 | **#163** |
|---|---|---|---|
| `2.18(c)` | `… Initial Term Loans) ( provided that this clause (c)(i) shall not apply to any Maturity Exception Facility);\n(ii) [reserved];` | `(c)(i)…(c)(viii)` siblings | the mid-prose citation `(c)(i)` mints a marker; `(c)(i)` swallows `(ii)`–`(viii)` as its children |
| `9.04(b)` | `(b)\n(i) Subject\nto the conditions set forth in paragraphs (b)(ii), (f) and (h) below, …` | `(b)(i)`, `(b)(ii)` … siblings | the citation `(b)(ii)` mints a marker inside `(b)(i)`; `9.04(b)` restructured |

`2.18(c)(vii)` is a **sealed stratified-cert target** (`docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap`,
`nodeKey doc-a::2.18(c)(vii)`): on #163 `tests/stratified-cert` fails 3 tests with `structural node unresolved for discov…`
(Chewy WITH_SHARED_CAPS pin). A parser change that breaks a sealed pin is a remediation requirement regardless of CI.

## 3. Replay of the #161 disclosure structures (check 6)

| structure | #161 | **#163** |
|---|---|---|
| Chewy `6.08(b)(16)(g)(x)/(y)` | not minted; `(g)` 689219–690271 | still minted (689561 / 689793), `(g)` truncated at `(x)` as on `main` |
| DSGR `8.06(c)(ii)(x)/(y)` doc-a / doc-d | not minted; `(ii)` whole | as `main`; plus doc-a 1344 → 1353 and doc-d 1398 → 1429 nodes from new mid-prose citation markers |
| term-loan `2.05(2)(e)(x)/(y)/(z)` doc-a / doc-b | not minted; `(e)` whole | as `main`; plus doc-a 1637 → 1643, doc-b 1694 → 1698 (`10.07(b)` restructured) |

#163 does not carry #161's guard, so the `(x)/(y)` runs nested under an open letter item are handled as on `main` (`(g)` stays
truncated at `(x)`). The two PRs are not alternatives for the same defect class: #161 fixes the restarted-run truncation,
#163 only the glued-chain visibility, and each one's new tests fail on the other's parser (2 failures each way).

## 4. Synthetic battery (checks 7–8), run on each tree

| input (one marker per line unless noted) | `main` | #161 | **#163** |
|---|---|---|---|
| genuine nested alphabetic list `(a)` / `(i)` / `(ii)` / `(A)` / `(B)` / `(iii)` / `(b)` | ✓ 7 nodes | ✓ 7 nodes | ✓ 7 nodes (check 7 ✓) |
| glued chain at line start `(i)(A)` / `(x)` / `(y)` / `(B)` / `(ii)` | `(a)`,`(b)` | `(a)`,`(b)` | `(a)(i)`, `(a)(i)(A)`, `(A)(x)`, `(A)(y)`, `(a)(i)(B)`, `(a)(ii)` ✓ |
| whitespace variant `(i) (A)` | nested | nested | nested ✓ |
| numeric citation tail `Section 6.01(a)(1)` in prose | `(a)`,`(b)` | `(a)`,`(b)` | `(a)`,`(b)` ✓ |
| section citation, no space `Section 6.01(a)(i)` in prose | `(a)`,`(b)` | `(a)`,`(b)` | `(a)`,`(b)` ✓ |
| **section citation with space `Section 6.01 (a)(i)` in prose** | `(a)`,`(b)` | `(a)`,`(b)` | **`(a)`, `(a)(a)`, `(a)(b)`** ✗ false nesting: the citation re-opens letter `(a)` and the real `(b)` nests under it |
| parenthetical prose `(including (A) and (B))` | `(a)`,`(b)` | `(a)`,`(b)` | `(a)`,`(b)` ✓ |
| uppercase glued chain in prose `clause (A)(i)` | `(a)`,`(b)` | `(a)`,`(b)` | `(a)`,`(b)` ✓ |
| **malformed glued token `(i)(A item` (unclosed)** | `(a)`,`(b)` | `(a)`,`(b)` | **`(a)`, `(a)(i)`, `(b)`** ✗ mints `(a)(i)` from a token that is not a marker |
| near-resume restart `(a)` / `(x)` / `(y)` / `(b)` | `(a)(x)`,`(a)(y)` | `(a)`,`(b)` (doc 23 §7.1) | `(a)(x)`,`(a)(y)` |
| Gibraltar-shaped restart `(a)` / `(1)` / `(2)` / `(x)` / `(y)` / `(i)` / `(ii)` / `(b)` | `(a)(2)(i)`,`(a)(2)(ii)` | same | `(a)(x)`, `(a)(y)`, `(a)(y)(i)`, `(a)(y)(ii)` |

The two ✗ rows are the mechanism behind every undisclosed restructuring in §2, §3 and §5: a letter-roman pair in running prose
is indistinguishable from a line-start marker once the `(?!\()` exclusion is gone and no line-start / preceding-text test replaces it.

## 5. Gibraltar (check 9) and whole-corpus identities (check 10)

| | `main` / #161 / main+#161 | **#163 / main+#163** |
|---|---|---|
| structural nodes / Pass A candidates | 2064 / 938 | **2081 / 943** |
| tree identity sha256 (sectionRef, nodeType, charStart, charEnd) | `7b72826e57ef0352…` | `3cb993458aed7de5…` |
| node diff vs `main` | 0 | **352 lost / 369 gained / 272 same-id relabelled** |
| `7.05(a)(x)` | UNIQUE @776551 | UNIQUE @776551 ✓ |
| `7.05(a)(y)` | UNIQUE @776996 | UNIQUE @776996 ✓ |
| `7.05(a)(y)(vi)(B)` | UNIQUE @782847 | UNIQUE @782847 ✓ |
| `1.01(4)`–`1.01(9)` | top-level definitions children | demoted to `1.01(3)(31)(ii)(ii)(4)…` (source `(ii) (A) has …` glue) |

The three required Gibraltar refs stay unique, but 272 nodes keep their positional id while their `sectionRef` changes, and
the `1.01` definition chain is re-rooted. That invalidates every sectionRef-anchored artefact: on main+#163 `tests/stratified-cert`
fails **6** tests (the 3 Chewy pin tests above plus `gibraltar-evidence-integrity` ×2 and `gibraltar-development-pipeline`, which pin
2064 / 938 and the structural tree hash of the current provider-free record). On #163 alone (which predates those tests) 3 fail.

Nine-document identity summary (#163 vs `main`): Chewy 1576 → 1581; Gibraltar 2064 → 2081; DSGR doc-a 1344 → 1353, doc-d
1398 → 1429; term-loan doc-a 1637 → 1643, doc-b 1694 → 1698; FWRG 396 → 404 (`6.04(a)(iii)(A)(A)` / `(A)(B)` from the citation
`this clause (iii)(A) and/or (B)`); RIOT +4 each (`2.05(a)(i)` from the line-start `(a)(i) If …` — the one plausibly genuine
gain); CONMED unchanged. Versus #161 the only intended overlap is Chewy `6.08(a)(3)(b)`; everything else #163 changes is
undisclosed in the PR body and note.

## 6. Tests, TypeScript, CI, merge compatibility (checks 11–12)

| gate | #163 `2a53604` | main+#163 | main+#161 (doc 23 / mission A) |
|---|---|---|---|
| parser + structural + adversarial suites | 88/88 | 88/88 | 43/43 + disclosure pins |
| `tests/stratified-cert` | **3 failed** (Chewy `2.18(c)(vii)` pin) | **6 failed** (+ Gibraltar record / pipeline) | 48/49 (parserCodeSha256 pin only, tree identical; refresh procedure in PR #161 body) |
| `npm run test:phase3-certification` | 481/481 | 481/481 | 481/481 |
| `npx tsc --noEmit -p .` | 14 (= main) | 14 | 14 |
| #161's new tests on #163's parser / #163's on #161's | 2 fail / 2 fail | | |
| GitHub Actions on head | `canonical-compiler` SUCCESS (push + PR); `stratified-cert.yml` not triggered (path filter) | | `4736ea4a`: pull_request run (merge with main) SUCCESS; push run (branch alone) fails `tsc` on 3 pre-existing `dataset-integrity.test.ts` errors fixed on main by #159 |
| merge | mergeable clean, 0 conflicts (base `b2740f7d`, 48 behind) | | clean |

Green CI is therefore not evidence: the only workflow that runs for a parser change never executes the sealed pins that #163 breaks.

## 7. Decision

- **PR163_PARSER_REMEDIATION_REQUIRED.** Required before any re-review: (a) a line-start (or preceding-text) guard on the glued
  chain and on markers followed by `(`, so that mid-prose citations (`clause (c)(i)`, `paragraphs (b)(ii)`, `Section 6.01 (a)(i)`,
  `this clause (iii)(A) and/or (B)`) never mint markers; (b) reject unclosed tokens (`(A item`); (c) reproduce `main`'s tree on
  Gibraltar (2064 / 938, identity `7b72826e…`), Chewy `2.18(c)` / `9.04(b)`, DSGR, term-loan and FWRG, or disclose and justify every
  identity change with the sealed pins updated by their owners; (d) `tests/stratified-cert` green on the integration candidate.
- **Supersession: no.** #163 does not contain #161's guard and reintroduces nothing #161 fixed, but it breaks sealed Chewy and
  Gibraltar evidence. #161 stays the selected correction; a corrected #163 should be rebased on top of #161 and reviewed as the
  separate glued-`(i)(A)` addressability change doc 23 §7.2 anticipated.
- **PR #169 remains blocked**: its 2081 / 943 measurements are #163's unaccepted tree.

## 8. Repro

```
git fetch origin main refs/pull/163/head refs/pull/161/head
git worktree add --detach <wt> 2a536040b7f814e13466ddbe677e982e152debcd   # and ab87979f / f0dd0769; dry-merges with --no-ff --no-commit
npx vitest run tests/contract-model/clause-hierarchy*.test.ts; npx vitest run tests/stratified-cert; npm run test:phase3-certification; npx tsc --noEmit -p .
# session-scratchpad probes: parseDocumentStructure ownership/partition over Chewy; synthetic battery; Gibraltar identity diff + resolveUniqueNodeByRef; nine-document node diff
```
