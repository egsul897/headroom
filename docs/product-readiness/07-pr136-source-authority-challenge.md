# PR #136 — independent source-authority challenge

**Tested SHA.** PR #136 head `982c3bc3a58425543f8a74e40830e5f1903c1500` ("Refuse contents titles that name an amount or a month"), base branch `cursor/gibraltar-haiku-verify-7cc2` @ `57c9eb4`, merge-base with main `554698a0e940`. Integration checkout: `git worktree add --detach /home/user/headroom-pr136 refs/pull/136/head` (not committed), with this track's harness copied in untracked. **No production file was modified.** No provider calls.

**Module under challenge.** `lib/contract-model/compiler/operative-authority.ts` (`classifyStructuralOccurrence`, `authenticateStructuralOccurrence`, `operativeModelDispatchBlock`, `selectAuthenticatedSectionBodies`) and its wiring in `semantic/compile.ts` (`OPERATIVE_AUTHORITY_REFUSED` before any model call).

**Contract as read independently.** An anchor node is dispatched to a model only if it is (a) a leaf without a contents-row shape OR has operative evidence (clause children, a modal/limit predicate, a quantity, a definition declaration, or is a parsed clause that is not a pointer), (b) its DESCENDANTS-span hash matches when a hash is supplied, (c) it is not KNOWN_SUPERSEDED unless the caller says the amended text already replaced it. UNKNOWN supersession dispatches but is never "authoritative current". No index or no anchor id → no gate.

## Test cases, independent expectations, actual outcomes

Commands: `cp tests/product-acceptance/source-authority.test.ts <pr136-checkout>/tests/product-acceptance/ && (cd <pr136-checkout> && npx vitest run tests/product-acceptance/source-authority.test.ts)` → **22 passed, 6 failed** (the six failures are the independent expectations the implementation does not meet; they are kept as failing assertions, not weakened). On main the file skips itself (module absent): `npx vitest run tests/product-acceptance/source-authority.test.ts` → 28 skipped.

| case | input | independent expectation | actual on 982c3bc | verdict |
|---|---|---|---|---|
| S1 | no structural index, anchor id supplied | cannot authenticate → refuse or mark unauthenticated | gate returns `null` (no block, compile proceeds) | contract disagreement — risk R1 |
| S2 | index present, empty/blank anchor | unauthenticated dispatch should be visible | `null` (silent pass-through) | risk R1 |
| S3 | anchor id not in index | refuse | `MISSING_OPERATIVE_AUTHORITY`, refused | pass |
| S4 ×5 | TOC rows: dot leaders; spaces; two columns on one line; amount in title; lower-case "section" | CONTENTS_LISTING, refused, never authoritative | all CONTENTS_LISTING / refused | pass |
| S4b | heading-only contents row (no page number) | not operative | NO_OPERATIVE_EVIDENCE, refused | pass |
| **S4c** | TOC row `SECTION 7.09 Lenders Will Not Be Liable ..... 80` | contents row | **OPERATIVE_OCCURRENCE, authoritativeCurrent = true** | **defect PR136-F1** |
| S4d | package E real TOC + bodies for 7.01/7.02/7.06 | one contents, one operative per label; selection picks the body | as expected | pass |
| S5 | modal prohibition; enumerated basket; qualitative permission; heading-only section with children | OPERATIVE, authoritative when CURRENT | as expected | pass |
| **S5** | `No Lien … is permitted other than Permitted Liens, and no Indebtedness is permitted to be secured …` (passive, no modal) | operative covenant | **NO_OPERATIVE_EVIDENCE, refused** | **defect PR136-F2** |
| **S5** | `The Borrower engages only in the business conducted on the Closing Date …` (declarative, no modal) | operative covenant | **NO_OPERATIVE_EVIDENCE, refused** | **defect PR136-F2** |
| S6 | definitions section | operative, not refused | OPERATIVE | pass |
| S6b | exhibit `Indebtedness: the Borrower may incur … $100,000,000` under a self-declared non-operative summary | not operative | OPERATIVE (modal + colon-declaration grammar) | out of the gate's stated scope — risk R4 |
| **S7** | parsed clause `(b) the foregoing clause (a) as applied to Subsidiaries.` | pointer, not operative | **OPERATIVE_OCCURRENCE** | **defect PR136-F3** |
| S7b | `(b) as set forth on Schedule 7.02.` | operative with a missing dependency | NO_OPERATIVE_EVIDENCE | my expectation is debatable; recorded, not counted |
| S7c | `(b) Liens securing Indebtedness permitted under Section 7.01(b).` | operative | OPERATIVE | pass |
| S8 | package G: two operative `SECTION 7.01` bodies | selection refuses; per-anchor gate cannot see the sibling | selection `[]`; `operativeModelDispatchBlock` admits each occurrence | pass + risk R3 |
| **S9** | package C @ 2026-06-30 (real operative state): base 7.01(b) KNOWN_SUPERSEDED; deleted 7.01(e); parent 7.01 | base refused unless amended text; deleted refused; **parent with stale descendants must not be authoritative** | base refused ✓, amended text admitted (not "authoritative") ✓, deleted refused ✓, **parent 7.01 authoritativeCurrent = true while its DESCENDANTS span contains "$25,000,000" and the deleted "$15,000,000"** | **defect PR136-F4 (= IPV-04)** |
| S10 | package H synthetic node 1.01(ii)(B) (inline definition enumeration) | admitted (the harm is upstream, IPV-06) | OPERATIVE | recorded |
| S10b | package E 7.01(b)(ii)(A) | operative, unique | as expected | pass |
| S10c | hash mismatch | refused | `SOURCE_HASH_MISMATCH` | pass + risk R2 |
| S11 | integration: `certifyDiscoveredCovenantPackage` over package E with the mocked model on PR #136 lib | TOC occurrences refused pre-model; bodies not refused | `OPERATIVE_AUTHORITY_REFUSED` on 7.01#1/7.02#1/7.06#1 only | pass |

Whole-corpus integration (`npx tsx scripts/product-acceptance/run-all.ts` inside the PR #136 checkout): 360 checks, **identical** pass/fail/finding counts to main (318/30/12, 30 findings). The only per-candidate change is the failure reason on the three package-E TOC occurrences (`SEMANTIC_INVENTORY_COVERAGE_GAP` → `OPERATIVE_AUTHORITY_REFUSED`). No IPV-01…IPV-14 finding is resolved by PR #136 on this corpus; none is made worse.

## Confirmed defects (handoff to Cursor)

| id | severity | component | minimal reproduction | expected | actual | recommended action |
|---|---|---|---|---|---|---|
| PR136-F1 | SOURCE_PROVENANCE_FAILURE (TOC text becomes *authoritative current*) | `operative-authority.ts` `isContentsListing` — `OPERATIVE_PREDICATE` is tested before the contents-row shape | index `TABLE OF CONTENTS\n\nSECTION 7.09 Lenders Will Not Be Liable ..... 80\n`; `authenticateStructuralOccurrence(node 7.09, CURRENT_OPERATIVE)` | CONTENTS_LISTING, refused | OPERATIVE_OCCURRENCE, `authoritativeCurrent: true` | test the contents-row shape (dot leaders / trailing page number / no sentence punctuation) before the predicate; a predicate inside a title line that ends in a page number is not drafting |
| PR136-F2 | MISSING_REQUIRED_COVENANT (legitimate evidence refused on the certified path) | `hasOperativeEvidence` requires a modal/limit predicate, a quantity, a definition declaration, or a parsed clause | `SECTION 7.09 Negative Pledge . No Lien on any property of the Borrower is permitted other than Permitted Liens …`; `SECTION 7.10 Lines of Business . The Borrower engages only in …` | OPERATIVE_OCCURRENCE | NO_OPERATIVE_EVIDENCE, `refuseModelDispatch: true` | treat a SECTION whose own text is a sentence (terminal punctuation, subject + finite verb, not a contents shape) as operative; keep refusal for contents rows and pointers; add `is/are (not) permitted`, `may not`, `engages`, `maintains` or, better, a sentence test |
| PR136-F3 | NONMATERIAL_OMISSION (pointer guard inert on parsed clauses) | `POINTER_LINE` is anchored at `^` but a parsed SUBSECTION's own text starts with its enumerator `(b) ` | `(b) the foregoing clause (a) as applied to Subsidiaries.` under a 7.02 lead-in | NO_OPERATIVE_EVIDENCE | OPERATIVE_OCCURRENCE | strip the leading enumerator before applying `POINTER_LINE` (the unit test in the PR passes only because its fixture omits the enumerator) |
| PR136-F4 | WRONG_OPERATIVE_SOURCE (= IPV-04) | `authenticateStructuralOccurrence` hashes the DESCENDANTS span but consults only the anchor's own supersession status | package C @ 2026-06-30: `getNodeSupersessionStatus(7.01)` = CURRENT_OPERATIVE while 7.01(b) and 7.01(e) are KNOWN_SUPERSEDED; `authenticateStructuralOccurrence(7.01)` | not authoritative (or refuse) when any descendant in the dispatched span is superseded/deleted | `authoritativeCurrent: true`; the dispatched text contains the superseded $25,000,000 and deleted $15,000,000 | fold descendant supersession into the decision (any KNOWN_SUPERSEDED/UNKNOWN descendant → not authoritative; refuse unless the caller supplies operative-state current text for the whole span) |

## Risks (not defects in the module's own terms; decisions for the Cursor track / architecture)

- **R1 — bypass when no index or no anchor.** `operativeModelDispatchBlock` returns `null` for `index: null` or an empty anchor list; `compileCovenantToIR` then dispatches unauthenticated. The certified path always supplies both (candidate-input.ts), so the bypass is reachable only from raw-text callers — but it is silent. Recommend a visible `UNAUTHENTICATED_DISPATCH` flag on the result rather than `null`.
- **R2 — the hash check is dead in production.** `expectedOperativeSourceSha256` is read by `compile.ts` but no production caller sets it (grep: only `types.ts` / `operative-authority.ts` / the unit test). The "source hash does not match" refusal in the PR description is therefore not exercised on the certified path.
- **R3 — duplicate-body refusal lives in a development script.** `selectAuthenticatedSectionBodies` is called only from `scripts/p3-development-pipeline/compile-gibraltar-article-vii.ts`; the certified path gates one anchor at a time and admits each of two conflicting `SECTION 7.01` bodies (package G). The context bundle's AMBIGUOUS_RELATIVE_REFERENCE is what blocks certification today, not the authority gate.
- **R4 — a non-operative exhibit is admitted.** The gate is structural; an exhibit that disclaims operative effect but contains `may incur … $100,000,000` is OPERATIVE to it. Document-role gating upstream (user-confirmed roles, see the MVP spec) is the only protection; no production code does this today.
- **R5 — predicate word-list fragility.** The predicate list (`shall|must|may|will|agree|provided that|not less than|not exceed|at least`) is both too wide (titles, F1) and too narrow (passive/declarative drafting, F2). A sentence/shape test would be more robust than a verb list.

## False-positive findings (my expectations the implementation reasonably rejects)

- S7b (`as set forth on Schedule 7.02`): refusing a clause whose only content is an incorporation by reference to an absent schedule is a defensible fail-closed choice; my "operative with missing dependency" reading is not clearly better. Not counted.
- S6b: refusing a self-declared non-operative exhibit is outside the structural gate's contract; counted as risk R4, not as a defect.

## Unresolved risks for the PR as a whole

- The PR's clause-hierarchy guard (restarted letter runs) did not change any structural finding on this corpus: IPV-06 (inline definition enumerations minted as nodes) and IPV-07 (dropped letter merges clauses) persist on `982c3bc`.
- `compilation-scope.ts` / `question-plan.ts` (the PR's offline scope comparison and dry-run planner) are not exercised here; they are evaluated in the extraction-architecture benchmark (`08-extraction-architecture-benchmark.md`).

## Recommended corrective actions (ordered)

1. F4: descendant-aware authority (closes IPV-04 at the gate; otherwise section-level candidates keep verifying against stale text).
2. F1 + F2 together: replace the predicate-first ordering with shape-first classification (contents row → pointer → sentence → operative evidence), and treat any sentence-shaped SECTION text as operative.
3. F3: enumerator-stripped pointer test.
4. R1/R2: make unauthenticated dispatch visible; either populate `expectedOperativeSourceSha256` from the candidate's `sourceContentVersion` on the certified path or remove the dead parameter.
5. R3: move duplicate-body refusal into the certified gate (needs the sibling occurrences, i.e. `findNodesByRef` on the anchor's document + label).
