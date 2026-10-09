# Chewy parser remediation — comparative acceptance of #161 / #163 / #164

Reviewed heads: **#161** `1669a27b9854ac031bf4ffc8fe638b393c34468c` — **merged into `main`** (closed, merged; `main` head at review
`2338e9e09fc9a6435bcfa4a330c424dd240ffb4d` carries its `openLetterResumesNearby` guard, code commit `6760e31f`, and the refreshed
Gibraltar provider-free record `ad0c15d5`); **#163** `2a536040b7f814e13466ddbe677e982e152debcd` (open, `mergeable_state: dirty`);
**#164** `2017ccabf806bf2525ebbf30b44803a566c2c24d` (draft, base `80c26e4d`, textually clean dry-merge onto `main`). Defective
baseline: `main` before #161 (`ab87979f`, the merged #132 behaviour). Identical probes on every tree (detached worktrees;
`main+#164` dry-merge; a scratch prototype described in §5): Chewy ownership/partition probe, Gibraltar identity probe
(`parseDocumentStructure` + Pass A + `resolveUniqueNodeByRef`), nine-document node diff, two synthetic batteries (SYN 11 cases,
B1–B14), parser/stratified-cert/phase3/tsc gates. $0; no pin, fixture or legal conclusion altered. Docs 23 and 25 are the
per-PR records; this document is the comparison.

**Verdict: PARSER_REMEDIATION_INCOMPLETE.** The merged state (`main` = #161) still lacks the genuine nested nodes (check 1) and
removes genuine `(g)(x)/(y)`-class markers (check 4). #163 and #164 both recover the nested nodes and both regress real
documents through mid-prose citation chains; neither is mergeable as is. **Preferred PR: #164**, narrowed as in §5, with #161's
guard and its guard-specific tests removed in the same change and #163 closed. No duplicate parser implementation.

## 1. Mandatory checks on real sources

| # | check | defective `ab87979f` | `main` (= #161) | #163 | #164 alone | `main`+#164 |
|---|---|---|---|---|---|---|
| 1 | `6.08(a)(3)(b)` nested `(i)`, `(i)(A)`, `(i)(A)(x)`, `(i)(A)(y)`, `(i)(B)`, `(ii)` with parent ids and spans | ✗ none | ✗ none (`(b)` 664123–666205, no children) | ✓ all six (parents by `parentNodeId` ✓) | ✓ all six, `(b)(i)` 664561–665582, `(i)(A)` 664564–665133, `(A)(x)` 664780–665096, `(A)(y)` 665096–665133, `(i)(B)` 665133–665582, `(ii)` 665582–666205 | ✗ `(A)(x)`, `(A)(y)` **absent** — the merged guard refuses them because `(c)` resumes within four line-starts |
| 2 | no fabricated `(b)(x)`/`(b)(y)` | ✗ present (664780, 665096) | ✓ | ✓ | ✓ | ✓ |
| 3 | whole `(b)` span, no sibling stolen | ✗ truncated at 664780 | ✓ 664123–666205 | ✓ subtree 664123–666205; `(c)` at 666205; partition 0/0/0 | ✓ same; partition 0/0/0 | ✓ (limbs inside `(A)` text) |
| 4 | Gibraltar `7.05(a)(x)/(y)/(y)(vi)(B)` and Chewy `6.08(b)(16)(g)(x)/(y)` adjacent markers | Gib ✓ UNIQUE; `(g)(x)` 689561, `(g)(y)` 689793 ✓ | Gib ✓; **`(g)(x)/(y)` removed** (also DSGR `8.06(c)(ii)(x)/(y)`, term-loan `2.05(2)(e)(x)/(y)/(z)`) | Gib ✓ unique but tree 2064→2081; `(g)(x)/(y)` ✓ | Gib ✓ unique but tree **2064→2034 / 938→926**; `(g)(x)/(y)` ✓ | Gib 2034/926; `(g)(x)/(y)` **removed** |
| 5 | inline citations not headings | ✓ (`(?!\()` blocks them) | ✓ | ✗ Chewy `2.18(c)` and `9.04(b)` restructured; FWRG `6.04(a)(iii)(A)(A)`; `Section 6.01 (a)(i)` → `(a)(a)/(a)(b)` | ✗ Chewy **`6.01(b)` and its (1)–(17) relabelled under `6.01(a)(ii)(ii)…`** from the prose `"…this Section 6.01(a)(ii)(1), (a)(ii)(2), or (a)(ii)(3)"`; Gibraltar `§1.01` rerooted from `"Section 2.01 (a)(i)"` (165 lost-only / 183 gained-only refs); term-loan `2.15(2)(i)`, `2.16(1)(i)(i)` from `"…(b) and (d)(i))"`; `Section 6.01 (a)(i)` → `(a)(a)/(a)(b)` | same as #164 |
| 6 | prose `clause (i)(A)` makes no node | ✓ | ✓ | ✗ (`this clause (c)(i)`, `(iii)(A) and/or (B)`) | ✓ (reference-chain propagation along adjacency: B5–B7 ✓) | ✓ |
| 7 | whitespace / line breaks / indentation / mixed nesting | glued chains invisible (B1, B3, B8 lose structure) | same | ✓ B1–B3, B8, B14; ✗ B4/B9 | ✓ B1–B3, B8, B11, B13, B14; ✗ B4 (citation broken across a line), B9 | B1 loses `(A)(x)/(y)` (guard) |
| 8 | certified path + TypeScript | — | stratified-cert 49/49, phase3 481/481, tsc 14 | parser 88/88; **stratified-cert 3 failed** (sealed Chewy `2.18(c)(vii)` pin); phase3 481/481; tsc 14 | parser 38/38; **stratified-cert 1 failed** (sealed Chewy WITH_BUILDERS pin: `structural node unresolved for discovery-candidate:f62db8eb…`, inside the relabelled `6.01(b)` subtree); phase3 481/481; tsc 14 | **stratified-cert 4 failed** (Gibraltar 926≠938, `1.01(9)(c)(c)(46)` section-ref drift, record hash, Chewy pin); merged parser tests **2 failed** (#164's Chewy tests vs the guard) |

Nine-document identities vs `main`: #164 alone changes every document (Chewy 1572→1543 with 79 lost-only refs; Gibraltar 2064→2034;
DSGR, term-loan, RIOT, FWRG all respanned or relabelled); #163 changes seven of nine (doc 25). CI on both heads shows only
`canonical-compiler` SUCCESS; `stratified-cert.yml` is not path-triggered by parser changes, so green CI proves nothing here.

## 2. Root cause and why the three fixes diverge

The defect has one root: `MARKER_OCCURRENCE`'s `(?!\()` lookahead hid every glued chain (`(i)(A)`), so Chewy's `(x)/(y)` under
`(A)` attached to the open `(b)` list. #161 left the root in place and added a heuristic (`openLetterResumesNearby`) that refuses
any restarted `(x)/(y)` run whose outer letter resumes within four line-starts — it fixes the symptom and deletes genuine
proviso/exclusion runs (`(g)(x)/(y)`, DSGR, term-loan; disclosed in the #161 note). #163 removed the lookahead everywhere and
split alphabetic chains, so mid-prose citations mint markers. #164 removed the lookahead, consumes `)(`-adjacent labels after
a whitespace-anchored head, propagates reference status along adjacency, and adds `nestingRank` so depths beyond SUBCLAUSE
nest by physical ancestry (which is what makes `parentNodeId` correct for `(i)(A)(x)`). Its gap: the head only needs
*whitespace* before it, so `", (a)(ii)(2), or (a)(ii)(3)"`, `"Section 2.01 (a)(i)"` and `"(b) and (d)(i)"` are accepted as
structure whenever no lead-in word sits immediately before the head.

#163 and #164 are not alternatives with a necessary piece missing from each: #164 contains everything #163 does (the chain
recovery) plus the reference-chain and `nestingRank` corrections #163 lacks; #163 contains nothing #164 needs. The merged #161
guard is **incompatible** with either: on `main`+#164 it suppresses the very `(A)(x)/(y)` nodes check 1 requires.

## 3. Synthetic battery summary (SYN + B1–B14)

Identical on all trees: B2, B6, B10, B11, B13, B14. #163/#164 fix B1, B3, B8 (glued/indented/CRLF/line-start chains) that
`main` cannot parse. #164 fixes B5 and B7 that #163 fails. All of #163/#164/`main`+#164 fail B4 (`"Section 7.01\n(a)(i)"`) and
B9 (`"Section 6.01 (a)(i)"`). `main` passes B4/B9 only because the lookahead hides every glued token.

## 4. Scratch prototype of the consolidated path (measurement only, not a competing implementation)

In the `main`+#164 scratch worktree, three uncommitted edits: (1) adjacency chains are consumed only when the head starts a
line (optional indentation); (2) off a line start, a head immediately followed by `(` is skipped (the old lookahead, kept for
prose); (3) `openLetterResumesNearby` returns false. Measured with and without #164's `nestingRank`:

| | `main` | prototype without `nestingRank` | **prototype with `nestingRank`** |
|---|---|---|---|
| Chewy `(b)` six nested nodes | ✗ | ✓ spans, but `parentNodeId` of deep nodes wrong (`(b)` reports no children) | ✓ spans **and** parent links; `(b)` → `(i)`,`(ii)`; `(i)` → `(A)`,`(B)`; `(A)` → `(x)`,`(y)` |
| `(g)(x)/(y)`, DSGR, term-loan limbs | removed | restored | restored |
| Chewy total | 1572 | 1580 | 1580 (= 1572 + 6 nested + 2 limbs) |
| Gibraltar nodes / Pass A / identity | 2064 / 938 / `7b72826e…` | **2064 / 938 / `7b72826e…` identical** | 2064 / 938, 0 lost / 0 gained, **110 nodes respanned** (deep `charEnd` corrections, e.g. `1.01(3)(31)(2)(14)` 122460–122470 → 122460–123393), identity `eb71d21e…` |
| nine docs vs `main` | — | 0 lost-only; gained only the restored limbs, RIOT `2.05(a)(i)/(ii)` (genuine line-start `"(a)(i) If"`), and one false node term-loan `2.16(1)(i)(i)` (citation broken across a line) | same gains, plus respans in every document |
| B1–B14 / SYN | — | all ✓ except B4 (inherent: a line-start `(a)(i)` after a broken citation) | same |
| merged parser tests (46) | — | 6 fail | **4 fail — exactly #161's guard tests**: the negative control and the three `clause-hierarchy-nearby-resume-disclosure` pins (they encode the symptom behaviour) |
| stratified-cert | 49/49 | 48/49 (`parserCodeSha256` only; structural hash identical) | 48/49 (`parserCodeSha256` and `structuralTreeSha256`, counts unchanged) |

## 5. Required remediation and the single merge path

1. **Base: #164**, rebased onto current `main` (it merges textually clean).
2. Narrow `findRawMarkerOccurrences`: consume `)(`-adjacent labels only when the head is at a line start; off a line start keep
   the former `(?!\()` exclusion (prototype edits 1–2). This restores Chewy `6.01(b)`, Gibraltar `§1.01`, `2.15(2)`, and
   `Section 6.01 (a)(i)`, and reproduces `main`'s Gibraltar 2064/938 node set.
3. Remove `openLetterResumesNearby` and its call in `restartedLetterCandidate`; delete the negative control
   `"does not nest interior (x)/(y) … resumes nearby"` and `tests/contract-model/clause-hierarchy-nearby-resume-disclosure.test.ts`
   (replace with positive pins that `(g)(x)/(y)`, DSGR `8.06(c)(ii)(x)/(y)` and term-loan `2.05(2)(e)(x)/(y)/(z)` are children with
   the owning clause's span intact); keep #161's `(b)` span test (it still holds) and #164's Chewy structure test.
4. Keep `nestingRank` (check 1 needs it for `parentNodeId`), and disclose the deep-node `charEnd` corrections it causes
   (110 Gibraltar, 116 Chewy respans; 0 identity loss). The Gibraltar owner then refreshes the provider-free record with
   `npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts` (no key) — both hashes change, 2064/938 stays.
5. Residual to disclose, not block: a citation broken across a line (`"…and\n(d)(i))"`, B4) still mints one node in the nine
   fixtures (`2.16(1)(i)(i)`); extending `REFERENCE_LEAD_IN` to a `Section X.XX(…),` window would close it.
6. Close #163. Do not add a second parser; the guard in `main` is removed, not kept beside the chain recovery.

Acceptance replay for the consolidated PR: this document's §1 table must read ✓ in every row on `main`+PR, Gibraltar
2064/938 with 7.05(a)(x)/(y)/(y)(vi)(B) UNIQUE, nine-document diff limited to the gains listed in §4, parser tests green with the
guard tests retired, `tests/stratified-cert` green after the record refresh, phase3 481/481, tsc 14.

## 6. Repro

```
git fetch origin main refs/pull/163/head refs/pull/164/head
git worktree add --detach <wt> 2017ccabf806bf2525ebbf30b44803a566c2c24d   # 2a536040, 2338e9e0; dry-merge 2017ccab onto 2338e9e0
npx vitest run tests/contract-model/clause-hierarchy*.test.ts; npx vitest run tests/stratified-cert; npm run test:phase3-certification; npx tsc --noEmit -p .
# session scratchpad: chewy2-*.ts (ownership + SYN), gib-*.ts (identity), alldocs-*.ts + python diff (nine docs), battery2-*.ts (B1–B14); prototype = three uncommitted edits in the main+#164 worktree
```
