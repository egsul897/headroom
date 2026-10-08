# Cross-branch parser audit — PR #132, PR #128, PR #136 against the controlling North Star and `origin/main`

Independent, offline, $0. No production code modified; no branch merged; no evidence rewritten; no
certification status changed. Every number below was produced in this session from detached read-only
worktrees of the four trees; the dump scripts live only in the session scratchpad. Classifications:
**CONFIRMED** (reproduced here), **SUSPECTED** (consistent with the evidence, not isolated), **NOT REPRODUCED**.

Controlling document: `docs/headroom-north-star-v2.md` (STATUS: CONTROLLING). Its decision rule for this audit:
structural / mechanical work (hierarchy, offsets, amendment chronology, identity) is deterministic code; uncertainty
is represented explicitly; a shared structural defect defeats discovery and audit alike (the Phase 2F lesson).
`docs/HEADROOM-NORTH-STAR.md` is superseded for product direction and was not used as a criterion.

## 1. SHAs and ancestry (CONFIRMED)

| ref | SHA | base / merge-base with `origin/main` | ahead / behind main | files |
|---|---|---|---|---|
| `origin/main` | `9de4e5737166fcec84a35fdc9a3404870549211f` | — | — | — |
| PR #132 `cursor/clause-hierarchy-letter-roman-ff0e` | `348bfedb33725d9a00adbf331131c038aa7d5a22` | base `main`; merge-base `9de4e57` | 3 / 0 | 2 (`lib/contract-model/compiler/clause-hierarchy.ts` +161/−11, `tests/contract-model/clause-hierarchy.test.ts` +89) |
| PR #128 `cursor/p3-track-d-gibraltar-dev-pipeline-c935` | `fc530e18294c90c6a8f2b31acb93f5400e14ff5a` | base `554698a0e9403436c637f6789a663321fa03701a`; merge-base `554698a` | 7 / 7 | 13 (same two parser files as #132, byte-identical; `scripts/p3-development-pipeline/*`, `execution.json` 12,573 lines, grant/frozen docs, `pass-a-signals.ts` +7, `pass-b-semantic.ts` +13, `anthropic-analyzer.ts`) |
| PR #136 `cursor/architecture-remediation-7cc2` | `ec7d5df7f7e7c0a0f32221d682d957f5acd3d8d8` | PR base branch `cursor/gibraltar-haiku-verify-7cc2` @ `57c9eb498d929b833dfd78c2b2d29f1a3b1e1a80`; merge-base with main `554698a` | 45 / 7 | 113 (46 under `lib/`, 2,803 insertions) |

- #132's `clause-hierarchy.ts` and its test file are **byte-identical** to #128's (`git diff` 0 lines). #128 = that parser + the Gibraltar DEVELOPMENT pipeline.
- #136 contains #128's history up to `f5d57ab595a48992d99346004834045b2e691494` ("Persist Gibraltar Haiku candidates…") but **not** `fc530e1` ("Apply the clause parser…"); it carries its own copy of the #132 logic plus six further parser commits (`8590be6`, `1b19520`, `ca7937a`, `554c42e`, `b7f2a2e`, `ec7d5df`).
- `origin/main` gained seven commits after `554698a` (#134, #131, #133, #129): `operative-subwindow-seal.ts` (new) and `unlimited-carveout-honesty.ts` (+55). **No parser file changed on main**, so #128 and #136 are behind main only on non-parser files.
- #128 and #136 both carry `tests/stratified-cert/gibraltar-development-pipeline.test.ts` with **conflicting pins**: #128 expects `passACandidates 938 / totalNodes 2064 / sectionsToCall 121 / $156.01`; #136 expects `901 / 1978 / 141 / $181.67`. Whichever lands second fails `stratified-cert` unless re-pinned.

## 2. What each parser changes (CONFIRMED by diff)

**#132 / #128** (`buildClauseTree`): `skipDeepestForOuterLetter` (an outer lettered list waiting for "(x)"/"(y)" is resumed instead of consuming the token as roman), `restartedLetterCandidate` (a line-start letter past "(a)" may open a new letter run when the next line-start marker is its successor), `innerResumesBeforeOuter` (a hanging paragraph pops the inner list only if it does not resume within four line-starts). No issuer-specific branch in code; one comment names Chewy §6.08.

**#136** on top of that: (i) `restartedLetterCandidate` refuses a letter an open list of the same alphabet already reached (`8590be6`); (ii) `innerResumesBeforeOuter` drops the four-line-start window and the "new index-1 sequence closes the inner list" stop; (iii) a second scanner `COMMA_CLAUSE_MARKER` admits `"), (next)"` items when both neighbours read as clause bodies and the item bridges a following proviso `(1)` (`ca7937a`, `554c42e`); (iv) `unparsedExceptionParentage` (consumed by `context-retrieval/structural-context.ts` to mark `AMBIGUOUS_TARGET`); (v) `structural-definitions.ts`: `definitionSourceNode` attributes a definition that opens its own line to the enclosing SECTION/ARTICLE, and `documentDisclaimsOperativeDefinitions` drops definitions from a self-disclaiming summary; (vi) `structural-index.ts`: a definition's span ends at the next SECTION/ARTICLE heading, not only at the next definition.

## 3. Node trees reconciled (CONFIRMED by re-parse in each tree)

`parseDocumentStructure` over the fixture texts, same input bytes, per tree:

| document | main | #132 = #128 | #136 |
|---|---:|---:|---:|
| Gibraltar credit agreement (1,029,323 chars) | **2087** | **2064** | **1978** |
| Chewy 2026 credit agreement doc-a | 1548 | 1576 | 1477 |
| CONMED Article VII (curated) | 169 | 169 | 171 |
| CONMED guarantee & collateral agreement | 252 | 252 | 254 |
| DSGR doc-a / doc-d | 1356 / 1406 | 1344 / 1398 | 1275 / 1301 |
| final-lightweight doc-a / doc-b | 1625 / 1612 | 1637 / 1694 | 1609 / 1605 |
| FWRG Article 6 | 396 | 396 | 398 |
| RIOT doc-a / doc-c | 426 / 458 | 428 / 460 | 412 / 450 |

So the three Gibraltar figures in circulation are three trees: **2087** = `origin/main` and the sealed `structure-summary.json` / `execution.json` (written at `f5d57ab`, pre-parser); **2064** = the #132/#128 parser; **1978** = the #136 parser. #128's PR body (2064 / 938) and #136's engineering log (1978 / 901) are both reproduced exactly.

**Gibraltar Pass A candidates** (`runPassADeterministicSignals` on each tree's own index): 946 / 938 / 901. Article VII contributes **157 in all three trees**; every change is inside §1.01 (274 → 265 → 219 candidates) plus §2.05 (+8), §2.14, §2.18, §4.01, §7.05 re-addressing. Cursor's "946 versus 901" table (`docs/agent-operations/gibraltar-pass-a-delta.md` in #136) is consistent with this.

**Where the Gibraltar deltas fall** (node sets keyed by `(sectionRef, charStart)`): main→#132 net −23 (§1.01 −32, §2.14 +4, §2.18 +3, §7.05 +2); #132→#136 net −86 (§1.01 −102, §2.05 +8, §4.01 +7, §2.14 +1). Outside §1.01 the parsers differ only in §2.05, §2.14, §2.18, §4.01, §7.05 (Gibraltar), §7.4 (CONMED), §6.07(g) (FWRG), §3(n) (CONMED guarantee).

### 3.1 Candidate identities and the sealed Haiku run

Node ids are positional (`computeStableKey("structural-node", documentId, nodeType, charStart)`). Re-parsing Gibraltar under the canonical document id and checking the 842 sealed Haiku rows in `execution.json`:

- **842 / 842** rows have an anchor node that exists **with the same `normalizedSourceRef` in all three trees**. The sealed rows are section-level or unchanged-clause anchors, so the parser change does not orphan or relabel any of them. (CONFIRMED)
- **30 of the 842** rows anchor on a **contents-listing node** (charStart < 10,700, the body begins at the second "ARTICLE I" @10,700): refs include `7.01` BASKET, `7.01` GENERAL_PROHIBITION, `7.04` BASKET / EXCEPTION / PERMISSION, `7.05` PERMISSION, `7.08`, `9.11`, `9.14`, `10.03` WAIVER. These rows carry semantic roles minted on a table-of-contents row. PR #128's body says only that the TOC `7.04` "stays in the candidate list, `selected` is false". (CONFIRMED — unsupported operative authority inside sealed DEVELOPMENT evidence; see §7.)
- Nodes that **keep their positional id but change `sectionRef`** (the identity hazard for anything keyed by node id below section level): Gibraltar main→#132 **423** of 2,029 shared ids; #132→#136 **388** of 1,747; main→#136 **422** of 1,763. Chewy 264 / 164 / 191. By section for #132→#136: §1.01 358, §2.14 16, §2.05 10, §4.01 4. Examples outside §1.01: `2.05(b)(B)(1)` → `2.05(b)(i)(B)(1)`, `2.14(a)(i)(i)` → `2.14(a)(w)(i)`, `4.01(a)(E)(A)` → `4.01(a)(vii)(A)` (#136); `7.05(a)(4)(ii)(i)` → `7.05(a)(y)(i)` (#132). The #136 labels match the source text in the cases read (2.14(a) lists (w)/(x)/(y)/(z); 4.01(a) is a roman list). The relabelling is a correction, but any persisted row keyed by node id *and* carrying the old ref will silently disagree with the live tree. The sealed Haiku rows are not affected (above); frozen Chewy replays are (§6).

## 4. Chewy §6.08 (CONFIRMED)

`6.08` and `6.08(a)`, `6.08(b)` parse identically in all three trees. `6.08(a)(3)(a)` … `6.08(a)(3)(i)` are children of `6.08(a)(3)` in all three (`6.08(a)(3)(a)@662595 … (i)@669729`). The two PR claims hold:

- `6.08(a)(3)(b)(x)@664780` and `(y)@665096` exist in **#132 and #136 only** (main swallows them into `(b)`); likewise `6.08(b)(16)(g)(x)/(y)`. The #132 and #136 §6.08 subtrees are identical (111 nodes).
- `6.05(a)(2)(c)@653595` under `6.05(a)(2)` in all three — the pinned Chewy identity is stable.
- **Open in all three**: inside `6.08(a)(3)(b)` the source reads `from the issue or sale of:\n\n(i)(A) Equity Interests … (x) … (y) …; and\n\n(B) to the extent …`. The adjacent `(i)(A)` pair is not a marker occurrence (`MARKER_OCCURRENCE` requires whitespace before and no `(` after), so `(b)(i)`, `(b)(i)(A)` and `(b)(i)(B)` are never nodes; `(x)/(y)` are therefore labelled children of `(b)` although they are exclusions inside `(i)(A)`, and the `(B)` limb lives in `(b)`'s own text. Structural omission CONFIRMED; legal materiality SUSPECTED (the `(A)`/`(B)` limbs define what counts toward the builder basket).

## 5. Gibraltar §1.01 residual nesting (CONFIRMED)

Neither parser has a definition node type; a definition's inline `(a)/(b)/(i)` enumerations are minted as SUBSECTION/CLAUSE nodes under §1.01 and chained under whatever node was open before.

| metric (nodes under §1.01, body occurrence) | main | #132 | #136 |
|---|---:|---:|---:|
| nodes | 719 | 687 | 585 |
| depth-1 children of 1.01 | 9 | 9 | **34** |
| nodes whose parent belongs to an *earlier* definition (cross-definition chain) | 684 | 650 | **476** |
| nodes minted from an inline enumeration after `… means` on the same line | 76 | 73 | 41 |
| Pass A candidates inside §1.01 | 274 | 265 | 219 |

- **#132/#128** nest the 34 numbered items of `"Permitted Investments" means … (1) … (34)` as `1.01(9)(c)(c)(10)` … `(34)` — under clause `(c)` of an unrelated earlier definition (`… Consolidated Interest Coverage Ratio … (c) for any such Indebtedness that is unsecured …` @238881). The restarted-letter logic keeps the chain open. Identity corruption CONFIRMED: a Permitted Investments item's parent path names a different definition.
- **#136** restores `1.01(1)`–`1.01(34)` at depth 1 (`8590be6` guard), but still chains `"Alternative Currency" means (a) Euros and (b) …` under the preceding `"Alternate Base Rate"` clause `(a)` as `1.01(3)(a)(a)` / `1.01(3)(a)(b)` (@20559/20573), and `"Applicable Rate" … (a) … (x)/(y)` likewise. 476 of 585 §1.01 nodes still have a cross-definition parent. #136's `definitionSourceNode` fixes the *attribution* of the definition declaration (the term is sourced to `1.01`, not to the minted node) — this is what closed my IPV-06 signatures on package H — but the nodes and their candidates remain.
- The `1b19520` attempt (suppressing markers after a declaration) is recorded in #136's own log as having deleted `1.01(1)`–`(34)` and reparented §8.01 (1978 → 1590 nodes) before being narrowed. The residual is therefore a known, partially mitigated defect in both lines, not a regression of either.

## 6. CONMED §7.4(a)(iii)/(iv), §7.8(d), §7.14 (CONFIRMED)

| clause | source text | main / #132 / #128 | #136 |
|---|---|---|---|
| 7.4(a)(iii) `any Subsidiary that is a limited liability company may consummate a Division …` | preceded by `Person), ` | **not a node**; text sits in `7.4(a)(ii)` (20196–24095) | node `7.4(a)(iii)` 20405–21752 |
| 7.4(a)(iv) `the Parent Borrower may be merged or consolidated with or into any Subsidiary; provided that … (any such … "Successor Borrower") … provided, further, that (1) no Event of Default … (2) … the Successor Borrower will succeed …` | preceded by `and ` | **not a node**; its proviso parsed as `7.4(a)(ii)(1)`, `7.4(a)(ii)(2)` | node `7.4(a)(iv)` 21752–24095 with `(iv)(1)`, `(iv)(2)` |
| 7.8(d) `loans and advances to employees … not to exceed $5,000,000 …` | own line | 34223–34612, 389 chars | identical |
| 7.14 `… any Subsidiary to (a) pay dividends …, (b) make loans …, or (c) transfer any of its assets …, except for … (i) … (ii) … (iii) …` | inline (a)/(b)/(c) | `7.14(a)` 46938–47846, `7.14(a)(i)` 47388–47846 | identical |

- The no-Event-of-Default / Successor-Borrower proviso belongs to the Parent Borrower merger permission `(iv)`. main/#132/#128 attach it to `(ii)` (a subsidiary-into-guarantor merger) and expose `(iii)` and `(iv)` only as prose inside `(ii)`. **Legally material misparenting CONFIRMED in main, #132 and #128; fixed in #136.** The frozen `7.8(d)` pin's `rehydrationUnresolved: 2` records exactly these two refs; #136 keeps the pin bytes untouched and asserts the live value 0 separately (`b7f2a2e`) — correct evidence discipline.
- §7.14 is wrong in **all three**: `(b)` and `(c)` are merged into `7.14(a)`, and the exceptions `(i)`–`(iii)`, which qualify the whole restriction, are parented under `7.14(a)(i)`. #136 does not fix the parse; `unparsedExceptionParentage(7.14(a))` returns true (false for `7.13(a)`), so retrieval marks the clause `AMBIGUOUS_TARGET` instead of treating `7.14(a)` as settled exception scope. Mitigation CONFIRMED; defect open.
- `7.8(d)` is byte-stable across the trees; the pinned 389-char operative text is unaffected by either parser.

## 7. Unsupported operative authority, dropped material provisions, corrupted identity

| finding | class | severity | trees | evidence |
|---|---|---|---|---|
| CONMED 7.4(a)(iv)'s no-EoD/Successor-Borrower proviso attached to 7.4(a)(ii); (iii)/(iv) permissions not addressable | CONFIRMED | material (wrong-clause condition; two merger permissions invisible to discovery) | main, #132, #128 | §6 |
| CONMED 7.14 (b)/(c) merged into (a); exceptions under (a)(i) | CONFIRMED | material omission (restriction scope) | all three (#136 flags AMBIGUOUS_TARGET) | §6 |
| Chewy 6.08(a)(3)(b)(i)(A)/(B) limbs never minted; (x)/(y) mis-labelled as children of (b) | CONFIRMED structural / SUSPECTED materiality | builder-basket limbs | all three | §4 |
| Gibraltar Permitted Investments (1)–(34) nested under an unrelated definition's clause chain | CONFIRMED | identity corruption of 34 definition items | #132, #128 | §5 |
| Gibraltar "Alternative Currency"/"Applicable Rate" enumerations chained under the preceding definition | CONFIRMED | identity (476 cross-definition parents) | #136 (and both others in different shape) | §5 |
| FWRG 6.07(g): `(ii) Permitted Liens` and `(iii) Restricted Payments …` minted as `6.07(g)(ii)/(iii)` while `(i) Investments …` is not — a partial inline citation list promoted to clauses; breaks the `396-node` FWRG regression test | CONFIRMED | nonmaterial omission / spurious nodes | #136 only | re-parse; `semantic-coverage-real-fwrg-regression.test.ts` fails (398 ≠ 396) |
| CONMED guarantee §3(n)(ii)(a): inline `(2) the pledge of which …`, `(3) would give rise to a "right of first refusal" …` minted; the deposit-account list `(f) … (1) … (2) …` and `(i) …` then parented under `(3)` as `3(n)(ii)(a)(3)(1)`, `(3)(1)(i)` | CONFIRMED | mis-nesting of collateral exclusions | #136 only | re-parse (new nodes @35829, 36144, 37067, 38331) |
| 30 of 842 sealed Haiku discovery rows anchored on contents-listing nodes (incl. `7.01` BASKET, `7.04` BASKET/EXCEPTION/PERMISSION) | CONFIRMED | unsupported operative authority in DEVELOPMENT evidence (not certified, not pinned) | #128 (and #136, which inherits the file) | §3.1 |
| Operative-authority gate: at `ec7d5df` 20/28 independent cases hold (doc 07 cases). S1/S2 now **refuse** an unanchored dispatch (`MISSING_OPERATIVE_AUTHORITY`) — an improvement my test had recorded as a bypass. Still open: S4c (contents row with a modal verb classified OPERATIVE — PR136-F1), S5 ×2 (passive/declarative covenants refused — F2), S6b (exhibit `Term:` summary admitted), S7 (pointer clause admitted — F3), S9 (stale descendants admitted as current — F4) | CONFIRMED | F1/F4 provenance; F2 false refusal | #136 | `tests/product-acceptance/source-authority.test.ts` run in the #136 worktree |
| Instrument isolation: an ambiguous-target effect supplied for instrument A now appears in instrument B's `unattachedEffects` (test 40 of `phase-3f1-operative-state-honesty.test.ts`, passes on main and #132) | CONFIRMED regression | fail-closed direction, but an isolation invariant broken (`70023f7` "Attach an amendment that names an ABL credit agreement") | #136 only | test log |
| Frozen Chewy replays: `chewy-6-08-f6-replay` REPRESENTED 273 → **210**; `phase-3-601-remediation-closure` trust counters 178 ≠ 0 and 105 ≠ 5 material items; `-red-baseline` likewise. These bind by tool calls (`getOperativeProvision("6.08(b)")`, `getReferencedProvision("Section 6.01(a)" / "Section 2.18")`) and pass on #132, whose §6.01/§6.08/§2.18 subtrees equal #136's — so the cause is #136's retrieval/authority layer (contents-listing refusals, bounded definition spans, evidence-store refusal), not the parser | CONFIRMED regression; cause SUSPECTED | frozen-evidence replays no longer reproduce | #136 only | test log |
| `f4-authenticated-retrieved-evidence` "the LAST definition … runs through later articles": fails on #136 because its *precondition* `expect(served).toContain("SECTION 6.08")` asserts the old over-extension that #136 fixed | NOT a regression (stale test precondition) | — | #136 | test file lines 675–687 |
| `entity-scope-guard` test 7 fails on **main and #132**, passes on #136 (`a07cf9d`) | CONFIRMED pre-existing failure on main | — | main, #132 | run in each worktree |
| `part-b-terminal-recert-open3` scaling ratio 2.63 vs < 2.40 | NOT REPRODUCED as a code regression (timing) | — | #136 run | — |

No parser in any tree contains an issuer-specific branch in production code (grep of `clause-hierarchy.ts`, `stage-structure.ts`, `structural-definitions.ts`, `structural-index.ts`, `candidate-span.ts` for chewy/gibraltar/conmed/chwy: comments only). #136 adds one `lib/` file that names a fixture (`evidence-engine/forensics.ts`), not in the parser.

## 8. PR #136's amendment and authority fixes with the preferred parser (CONFIRMED by experiment)

A scratch worktree ("hybrid") = #136's tree with `clause-hierarchy.ts` replaced by #132's file plus the one export #136's retrieval layer imports (`unparsedExceptionParentage`). It typechecks with the same 14 pre-existing errors as main and #136 (Prisma client fields `status` / `supersededAt` in `app/[companyId]/ledger/*` and `lib/coherent.ts` — environment, identical on all trees). Its parse of Gibraltar/Chewy/CONMED is exactly #132's (2064 / 1576 / 169).

My product-acceptance harness (14 synthetic packages, 756 checks, mocked model stages) against each library:

| library | checks | findings | CRITICAL_FALSE_PERMISSION | register signatures resolved | new findings |
|---|---|---|---|---|---|
| main `514f396` | 756: 666 / 71 / 19 | 71 | 6 | — | — |
| #132 | 756: 666 / 71 / 19 | 71 | 6 | **0** (identical to main) | 0 |
| #136 | 752: 678 / 55 / 19 | 55 | **0** | **22**: IPV-01 (A-P2, N-P3), IPV-02 (F-P3 ×2), IPV-03 (A-P1, H-P3 lineage-on-rule), IPV-04 ×3, IPV-05 ×2, IPV-06 ×2, IPV-08, IPV-11, IPV-19 ×5, IPV-20, IPV-22 (N-P1) | 6 (below) |
| hybrid (#136 + #132 parser) | 752: 678 / 55 / 19 | 55 | 0 | **identical to #136** (same 22, same 6) | identical |

Invariant checks (19): #136 fixes INV-05b ×4 (definition amendment targets the term, not Section 1.01), INV-19 diamond/false-cycle ×3, INV-19b corpus-wide, INV-25 L-P2, INV-25b H-T2, INV-09b A-T1 (comparator thresholds refused). Mutation suite (22): #136 kills MUT-08/12/13/14/16 (side letters and a consent now make the instrument `OPERATIVE_STATE_REVIEW_REQUIRED` instead of staying RESOLVED on the base text); #132 changes nothing. The hybrid reproduces every one of these verdicts. **Conclusion: the amendment / definition-span / figure-role / authority fixes in #136 do not depend on #136's parser on this corpus; they can be integrated with the #132 parser without changing their effect.** What *does* depend on the parser is #136's own test suite: on the hybrid, 6 of 139 stratified-cert + parser tests fail (`pinCandidate 7.8(d)` ×2 expecting the §7.4 refs resolved, `exception-parent-uncertainty` for 7.14, the Gibraltar 901/1978 pin, `comma-clause-marker` ×2).

The six new findings under #136 (none is a false permission): F 7.06/7.08 faithful submissions now REVIEW (`SHARED_CAP` item cited on the rule, not on a `sharedCapacities[]` node — the new role-compatibility rule in `reconciliation.ts`; SUSPECTED harness-plan artefact, the plan should cite every shared-cap item on the shared-capacity node); H 7.03 REVIEW and the 1.01 definitions candidate missing "Available Amount" (CORRECT fail-closed: H's unresolved amendment names that very definition, which #136 now withholds); M 7.01 `EMPTY_OPERATIVE_TEXT` and 7.01(b) `EVIDENCE_INCOMPLETE` (IPV-16 moved from a false RESOLVED to a withheld text — the "partial" the PR describes).

Two of my own invariants need correction, found by this audit:

- **INV-04 "held" on main for the wrong reason.** On main the 7.01 bundle of package I carried `CROSS_REFERENCE:VII, 7.02, 7.04, IX, 9.15` and `DEFINITION_DEPENDENCY:Guarantor, Lien` only because the last definition's span ran to the end of the document and dragged every later reference in (the IPV-21 over-extension). With #136's bounded spans the bundle is `7.01 + four children + Indebtedness/Loan Documents/Subsidiary`, and 9.15's own `Notwithstanding anything to the contrary in Article VII` is a **back-reference** that retrieval never follows. The real gap is "back-references into the covenant article are not retrieved"; main's pass was coincidental. Re-classify INV-04 as **open on every tree** (a cap outside Article VII does not reach a 7.01 bundle), severity MATERIAL_CONDITION_OMISSION.
- **INV-19's positive control is not a cycle.** `"Restricted Subsidiary" means any Subsidiary … that is not an Unrestricted Subsidiary` and `"Unrestricted Subsidiary" means any Subsidiary … designated as an Unrestricted Subsidiary` is one direction plus a self-mention; the "cycle" on main came from the same over-extended span reaching §4.09. #136 is right not to report it, and IPV-12's "genuinely self-referential" wording is wrong. INV-19/INV-19b's `true-cycle` verdicts are harness errors, not #136 regressions; IPV-12 must be re-rated.

## 9. Tests: overfitting and weakened assertions

| item | tree | finding | class |
|---|---|---|---|
| #132's nine new `buildClauseTree` cases are synthetic (`(a)…(w),(x),(y)`, `(x)/(xi)`, hanging paragraphs); the only fixture reference is a comment | #132 | no fixture overfitting in code or tests | CONFIRMED |
| #136 **deleted** #132's case "pops an inner list when the next line-start marker does not resume it" when it rewrote `innerResumesBeforeOuter`. Run against #136's parser the deleted input still yields `[(a),(a)(i),(a)(ii),(a)(1),(b)]`; coverage was removed, behaviour was not | #136 | removed assertion (restore it) | CONFIRMED |
| #136's `comma-clause-marker.test.ts` includes a CONMED-fixture case; `definition-inline-enumeration.test.ts` is synthetic. Cross-applied: #132's 17 cases pass on #136's parser; 6 of #136's parser cases fail on #132's (4 definition-enumeration, 2 comma-marker) | — | tests encode each parser's own behaviour; neither suite is a shared gate | CONFIRMED |
| `tests/stratified-cert/gibraltar-development-pipeline.test.ts` pins counts (938/2064 in #128 vs 901/1978 in #136) and an escalation price; a node count as a test oracle is the "node count alone" trap the audit brief warns about | #128, #136 | pinned counts, mutually exclusive | CONFIRMED |
| `resume-manifest.test.ts`: 133 → 135 attemptable, EMPTY band removed, bands 101/19/13/2 → 102/20/13; the sealed calibration file still says 133 and the test text now says so | #136 | assertion moved with the parser; disclosed, not hidden | CONFIRMED |
| `pin-candidate-conmed-investments.test.ts`: frozen bytes must still say `rehydrationUnresolved: 2`; live 0 asserted separately | #136 | strengthened, not weakened | CONFIRMED |
| FWRG "ENTIRE real 396-node document" regression and the Chewy F-6 / 601 replays fail on #136 (§7) | #136 | frozen-evidence tests not updated; the PR is red on them though they are not in a CI workflow | CONFIRMED |

CI gates that exist: `stratified-cert.yml` (`npx tsc --noEmit -p .` + `npx vitest run tests/stratified-cert`), `canonical-compiler.yml` (`npm run test:phase3-certification`), `p3-r0-soft-gate.yml` (Postgres-backed suites). Both PR trees pass `test:phase3-certification` (459/459) and `tests/stratified-cert` (#132 43/43, #136 60/60) locally. **None of the failing frozen replays is behind a workflow**, which is why CI is green on #136 while three real-evidence replays are red.

Full `tests/contract-model` run (DB-less environment): #132 16 failed / 3,491 passed; #136 22 failed / 3,600 passed. The shared failures are the 95 `DATABASE_URL` / `PrismaClientInitializationError` suites; the differences are exactly the rows in §7.

## 10. Recommended integration sequence and regression gates

Preference is **#136's parser logic for §7.4-class comma clauses and §1.01 restarts, taken in pieces — not #136 as a whole, and not #132 alone**. Reasons that are not node counts: #132 leaves a material misparenting (CONMED 7.4) and nests 34 definition items under an unrelated definition; #136 fixes both but its comma rule mints spurious and mis-nested clauses on two other real documents, and the PR couples the parser to 44 other library files whose frozen replays are red.

1. **Merge #132 first** (parser-only, based on current main, `mergeable_state: clean`). Gates: `npx tsc --noEmit -p .`; `npx vitest run tests/contract-model/clause-hierarchy.test.ts tests/contract-model/clause-hierarchy-f2-nesting.test.ts tests/stratified-cert`; re-parse Gibraltar/Chewy/CONMED and require the §6.08 subtree of §4 and `6.05(a)(2)(c)@653595`; product-acceptance unchanged (756: 666/71/19). Record 2064/938 as *observed*, not as truth.
2. **Rebase #128 onto main after step 1.** Its parser diff becomes empty; keep `execution.json` sealed; add a test (or a documented quarantine) for the 30 contents-anchored rows so no later stage reads them as operative; re-pin 938/2064 only as the observed post-#132 count. Do not start Pass B/C.
3. **Split #136 into four PRs, in this order, each rebased on main:**
   a. *Parser 2* — `8590be6` (restart guard), `definitionSourceNode` + `documentDisclaimsOperativeDefinitions` (`1b19520`/`554c42e`, attribution only), and the `structural-index.ts` span bound. **Hold back** the comma-marker scanner (`ca7937a`/`554c42e`) until it no longer mints `6.07(g)(ii)/(iii)` on FWRG or `3(n)(ii)(a)(2)/(3)` on the CONMED guarantee; a narrower admission (only when the preceding structural marker is itself a line-start label of the same list, so prose citation lists are never promoted) should be tried against those two negative fixtures plus CONMED 7.4 as the positive one. Restore the deleted hanging-paragraph test. Gates: §1.01 depth-1 children = 34 and cross-definition parents ≤ 476 on Gibraltar; FWRG stays 396; CONMED guarantee stays 252; the F-2 nesting suite; both PRs' clause tests (cross-applied).
   b. *Comma clauses* — the narrowed rule with CONMED 7.4(a)(iii)/(iv)(1)/(2) as the oracle; then and only then move the `7.8(d)` live-rehydration assertion to 0 and the resume denominator to 135.
   c. *Amendment / authority / definition fidelity* — `operative-state.ts`, `unclassified-override.ts`, `candidate-span.ts`, `operative-authority.ts`, `context-retrieval/*`, `reconciliation.ts`, `figure-role.ts`, `entity-scope-guard.ts`. Gates: product-acceptance must show the 22 resolved signatures and zero `CRITICAL_FALSE_PERMISSION` (the hybrid proves this holds with the #132 parser); `phase-3f1-operative-state-honesty` test 40 must pass; the Chewy F-6 and 601 replays must reproduce (273 / zero counters / 5) or the frozen expectations must be re-derived with a written reason; `source-authority` S4c/S5/S6b/S7/S9 remain open findings to close before any certified path uses the gate.
   d. *Evidence engine / question plan / Gibraltar Article VII scripts* — separately; no parser dependency.
4. **Never gate on a node count alone.** Replace the 2064/1978 pins with structural assertions: the clause lists in §4 and §6, the §1.01 metrics in §5, the 842 sealed anchors resolving with unchanged refs, and "no new node in a document whose text did not change" for FWRG and the CONMED guarantee.

## 11. Corrective actions for this harness (owned here, not done in this audit)

- INV-04: add the back-reference path and record main's pass as coincidental; ledger row 4 and doc 02 to say "open on every tree".
- INV-19 / INV-19b: replace the Restricted/Unrestricted control with a genuine two-way definition; re-rate IPV-12 (not self-referential; the cycle was the span over-extension, i.e. IPV-21).
- Faithful plan: cite every `SHARED_CAP`-role inventory item on the `sharedCapacities[]` node so the F 7.06/7.08 refusals under #136 can be classified cleanly.
- Register: add the §7 rows that are product defects on main (CONMED 7.4 misparenting, 7.14 exception parentage, Chewy `(i)(A)` adjacency) as IPV entries with real-fixture repros.

## 12. Repro

```
git fetch origin main refs/pull/132/head refs/pull/128/head refs/pull/136/head
git worktree add --detach /tmp/wt-<x> <sha>            # one per tree; symlink node_modules
# per tree: parseDocumentStructure over the fixture texts (script in the session scratchpad; documentId
# "gibraltar-doc-a-2026-02-02-credit-agreement" for the sealed-row check)
npx vitest run tests/stratified-cert                     # #132 43/43, #136 60/60, hybrid 133/139
npm run test:phase3-certification                        # 459/459 on #132 and #136
npx vitest run tests/contract-model --exclude "**/coverage-structural*"
# harness overlay: copy scripts/product-acceptance, tests/product-acceptance, tests/fixtures/product-acceptance
npx tsx scripts/product-acceptance/run-all.ts --out <scratch>; run-invariants.ts; run-mutations.ts
```
