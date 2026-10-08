# Cursor continuous engineering ledger

Branch: `cursor/architecture-remediation-7cc2`
Base: `cursor/gibraltar-haiku-verify-7cc2`
PR: https://github.com/egsul897/headroom/pull/136 (draft)
Claude-owned paths are not edited. DEVELOPMENT is not CERTIFIED. Paid provider spend this session: $0.

## Repository reconciliation

- Starting SHA for this session: `bb9bfd4bd6f426a7f5f8e26019a872e04264a1c0` (in sync with `origin/cursor/architecture-remediation-7cc2`). CI on that SHA: 9 checks passed.
- `origin/main` was `9de4e5737166fcec84a35fdc9a3404870549211f`. Not merged. Merge-base with this branch remains `554698a`.
- Independent acceptance PR #137 head observed at `d780414` on `claude/independent-product-validation`. Read only.

## P0-A — Entity-scope widening

- Status: PUSHED (see commit on this branch after `bb9bfd4`).
- Severity: P0 false permission.
- Reproduction: frozen replay `tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json`, rule `ir-rule:01c9a005fd9c7649ddc26012`, section `6.01(a)`, posture PERMISSION. Submitted scope `[BORROWER]`, sufficiency COMPLETE. Own excerpt is a ratio basket with no obligor words. Cited-unit lead-in is the section prohibition (`the Borrowers shall not, and shall not permit any of their Restricted Subsidiaries`).
- Root cause: when that lead-in was verbatim operative text, `ownDerived` became `[BORROWER, GUARANTOR_RS, NON_GUARANTOR_RS]`. The unmet-signal branch adopted that wider set, left `SOURCE_SCOPE_DERIVED` (`safeToRely` true) and COMPLETE. A second pass over the cleared scope used the empty-submission fill and wrote the same set back.
- Fix: a submitted scope that is narrower than, or different from, the clause's own derived set is reset to empty, `UNDERINCLUSIVE_VS_SOURCE`, and PARTIAL. Tags the submission did not carry are not added. An empty submission is filled only from an authenticated governing chain when the clause itself binds no obligor. Replaying a cleared permission does not restore the prohibition's obligors.
- Preserved: a submitted scope that already equals the prohibition stays `SOURCE_MATCH_CONFIRMED`. A clause that names only the Borrower still narrows a wider submission (`MODEL_WIDER`). Governing-scope inheritance when the clause binds no obligor still outranks a narrower model scope (GS5).
- Tests: `tests/contract-model/entity-scope-guard.test.ts` (frozen replay, prohibition-must-not-widen, different-class refusal, replay does not refill). `npm run test:phase3-certification` 459 passed. `npx tsc --noEmit -p .` clean. `tests/contract-model/entity-scope.test.ts` skipped (no `DATABASE_URL`).
- False-permission implication: the ratio permission is no longer confirmed for guarantor and non-guarantor restricted subsidiaries. Empty scope on replay is `UNSPECIFIED`, which the transaction simulator reports as `SCOPE_UNSPECIFIED` (review), not `CONFIRMED_APPLICABLE`.

## P0-B — Definition amendments (IPV-19, IPV-20)

- Status: PUSHED in `ab158c3`.
- Reproduction: `The definition of "Consolidated EBITDA" in Section 1.01 ... is hereby amended and restated ... to read as follows`. The section-restatement pattern matched the locator `Section 1.01 ... is hereby amended and restated` and emitted `REPLACE_TEXT` for the whole section.
- Fix: a definition sentence that names its section is a definition candidate. The section pattern does not reclaim that span. `REPLACE_DEFINITION` captures the quoted replacement. The section's operative text is the base section with that one definition span replaced, when the old span occurs once. Retrieval uses that operative definition text instead of the static base definition.
- Preserved: a real `Section 6.01 is hereby amended and restated` remains a section replacement. `Section 1.01 is hereby amended by amending and restating the definition of ...` stays a section candidate for interpretation and is not captured as a deterministic definition replacement.
- Tests: `tests/contract-model/definition-level-amendment.test.ts` 6 passed. `phase-2g-amendment-precedence.test.ts` 48 passed. `context-retrieval-pipeline.test.ts` 36 passed. `npx tsc --noEmit -p .` clean.
- False-permission implication: an EBITDA amendment that removes an add-back no longer leaves the compiler with the larger base definition, and it no longer deletes the other definitions in the section.

## P0-C — Side letters, consents, and waivers (IPV-16)

- Status: PUSHED in `9c53820`.
- Reproduction: a document captioned `SIDE LETTER` or `CONSENT` says `Notwithstanding Section 7.01(b)` and states a different cap. The amendment pipeline produced no effect. Operative state stayed `OPERATIVE_STATE_RESOLVED` on the base cap.
- Fix: that caption plus a named section records `UNKNOWN_CHANGE` with `newText` null and reason `UNCLASSIFIED_OVERRIDE`. No interpreter call. The named provision is `REVIEW_REQUIRED` and does not keep the base amount as current text. If the section exists in more than one agreement, the effect stays unattached and the instrument is still not `RESOLVED`. A credit agreement's own notwithstanding clause is not an override document.
- Tests: `tests/contract-model/unclassified-override.test.ts` 4 passed. `phase-2g-amendment-precedence.test.ts` 48 passed. `npm run test:phase3-certification` 459 passed.
- Not done: the legal effect of the override is not interpreted. A side letter that names no section is not yet flagged.

## IPV-04 — Section operative text kept superseded clauses

- Status: PUSHED in `c2a913b`.
- Severity: P0 wrong operative source. A deleted basket compiled from the parent section is a live permission.
- Reproduction: Amendment 1 restates `7.01(b)` from `$25,000,000` to `$40,000,000`. Amendment 2 deletes `7.01(d)` (`$15,000,000`). Operative state resolves both clauses. `resolveOperativeSource` for section `7.01` returned the base descendants, including both stale amounts.
- Root cause: supersession is recorded on the clause node. The parent section has no provision view, so the candidate-span fallback read `getNodeText(section, DESCENDANTS)`. A definition amendment sourced on the enclosing section could also win that lookup and replace the section with the single new definition.
- Fix: a resolved clause replacement or deletion is spliced into the parent when the old span occurs once. Overlapping or repeated spans, and any descendant amendment that is not resolved, withhold the parent text. A definition provision no longer governs a section candidate. Context retrieval uses the same operative text for the operative-source item, child rules, and definition scan.
- Preserved: a review-required amendment of a node that has no amended descendants still falls back to that node's base text. An unresolved amendment of the section itself does not keep the base section when a child clause was replaced. A real section restatement still wins over its old children.
- Tests: `tests/contract-model/section-operative-splice.test.ts` 6 passed. Context retrieval 36, phase-2g 48, architecture 17, definition-level 6, unclassified-override 4 passed. `npm run test:phase3-certification` plus the new file: 465 passed. `npx tsc --noEmit -p .` clean.
- False-permission implication: the parent section no longer compiles the replaced `$25,000,000` cap or the deleted `$15,000,000` basket. When the splice is not unique, the section text is withheld rather than certified from the base document.

## IPV-05 — Qualified agreement target and unresolved amendment

- Status: PUSHED in `70023f7`. CI on that SHA: 9 checks passed.
- Reproduction: `FIRST AMENDMENT ... to the ABL Credit Agreement dated as of September 9, 2026` against an `ABL CREDIT AGREEMENT` of that date. The agreement-reference pattern required the label to follow the determiner immediately, so `ABL` hid the reference. The relationship was `DETERMINISTIC_NO_SIGNAL`. Calling `computeOperativeContractState` with the pipeline effects and without the optional unresolved list returned `OPERATIVE_STATE_RESOLVED` and zero unattached effects.
- Fix: a closed facility qualifier (`ABL`, `Term Loan`, `Revolving`, and the same class) may sit between the determiner and the agreement label. An effect whose target instrument key is null is unattached even when the caller does not repeat it.
- Tests: `tests/contract-model/qualified-agreement-target.test.ts` 2 passed. Package-graph adversarial 20, phase-2g 48, operative-state adversarial 23, post-3f2 restatement 15, node-supersession 14 passed. `npx tsc --noEmit -p .` clean.
- False-permission implication: the amended Available Amount is the `$15,000,000` definition. An amendment that names no agreement does not leave the instrument resolved on the base text.

## A1 / A2 — Failed definition splice and parent/child precedence

- Status: PUSHED in `f0bc31e`.
- A1: a resolved definition replacement whose old span is missing or repeated used to emit no section view. The section candidate then compiled the base section, including the pre-amendment definition. A definition amendment that cannot be spliced now produces a review-required section view, and operative source for that section is withheld.
- A2: a resolved parent restatement used to win even when a child amendment was later or on the same day. The parent text is operative only when every related amendment is strictly earlier. A later or same-day child amendment, and a child amendment after a parent deletion, withholds the section text.
- Tests: definition-level 7, section splice 10, phase-2g 48, architecture 17. `npm run test:phase3-certification` 459 passed. `npx tsc --noEmit -p .` clean.

## B1 — IPV-08 non-operative exhibit definitions

- Status: PUSHED in `12c858e`.
- Reproduction: an exhibit captioned `SUMMARY OF PRINCIPAL TERMS` says the summary is for convenience only and is not an operative provision, then lists `Indebtedness: ... $100,000,000`. Unquoted colon detection recorded that line as a definition.
- Fix: a summary or exhibit that disclaims operative effect in its own opening is not a definition source. A headings-convenience clause does not match. A definitions exhibit that gives terms meanings still does.
- Tests: `tests/contract-model/nonoperative-exhibit-definitions.test.ts` 3 passed. `npx tsc --noEmit -p .` clean.

## B2 — IPV-06 definition enumerations swallow later definitions

- Status: PUSHED in `1b19520`.
- Reproduction: `"Payment Conditions" means ... (i) ... (ii) ... (A) ... (B) ...` then `"Subsidiary" means`. The clause parser made `1.01(ii)(B)` run through Subsidiary and Term Loan Agreement. Both later definitions were attributed to that clause.
- Fix: a marker inside a definition's own list is not a covenant clause. The list runs from the declaration through lines that continue it, and stops before the next definition or before a line-start marker that does not continue that list. Quoted-colon and unquoted-colon declarations use the same grammar. A covenant list with no definition in front of it is unchanged. A lettered definition entry (`(a) "Term" means`) stays a clause because the marker precedes the declaration.
- Tests: `tests/contract-model/definition-inline-enumeration.test.ts` 8 passed. Clause hierarchy 17, F-2 nesting (including Chewy 6.08) 16, structural definitions 9, structural index 17, phase-2f1 robustness 31, node-identity invariants 24, structural references 8 passed. `npx tsc --noEmit -p .` clean. `coverage-structural.test.ts` still needs `DATABASE_URL` and was not run as a regression signal.

## B3 — CONMED Section 7.4(a)(iii) and (iv)

- Status: PUSHED in `ca7937a`.
- Reproduction: Section 7.4(a) reads `(ii) ... Person), (iii) any Subsidiary ... and (iv) the Parent Borrower may be merged`. The citation exclusion dropped `(iii)` because a comma and a space precede it. `(iv)` then failed the sequence check, and the successor proviso `(1)`/`(2)` was parented under `(ii)`.
- Fix: a comma-space marker is a clause only when the text before it and the text after it are both clause bodies. A bare citation (`clauses (a), (b) and (c)`, or `(a), (i), (j), (m)`) has no body and stays excluded. A parenthetical gloss between citations stays excluded. `findRawMarkerOccurrences` itself still rejects comma-space markers.
- Also recovered other comma-joined clause bodies in the same Article VII excerpt (for example 7.13(b)/(c) and 7.9's roman items). Section 7.14's exceptions moved from `7.14(a)(i)` to `7.14(c)(i)` because `(b)` and `(c)` are now siblings of `(a)`.
- Live population denominator: empty operative text 0, attemptable 135. Bands SHORT 105, MID 17, LONG 13. `7.4(a)(iii)` is MID (1,347 chars). `7.4(a)(iv)` is LONG (2,343 chars). The sealed calibration file still records attemptable 133. The recommended spend ceiling assertion still matches the existing constant. Sealed run plans still list the historical empty skips.
- Tests: `tests/contract-model/comma-clause-marker.test.ts` 4 passed. Clause hierarchy, F-2 (including Chewy 6.08), definition enumerations, phase-2f1 robustness 31, offline maps 2 passed. Resume denominator assertion updated for the live counts. Dry-run plan still requires `/tmp/claude-0/pilot/models.json`, which is absent here. `npx tsc --noEmit -p .` clean.

## CI regression on `9fa6018` — stratified-cert

- Status: parser narrowed locally. `stratified-cert` on `9fa6018` failed four assertions (run 37832679453). `12c858e` is the last green baseline: Gibraltar 901 candidates / 1978 nodes.
- IPV-06 (`1b19520`) suppressed markers from a definition declaration through later lines. That deleted Gibraltar `1.01(1)`–`1.01(34)` and reparented Section 8.01 under `8.01(ii)` because the chapeau says `constitute an "Event of Default":`. Node count 1978 → 1590. The swallow fix that remains is attribution: a dictionary entry that opens its own line is sourced to the enclosing section, not to an earlier inline list. Line-start definition lists stay structural.
- The comma rule (`ca7937a`) admitted every comma-space marker with clause bodies on both sides. Chewy `6.05(a)(2)(c)` became `6.05(a)(2)(ii)(c)` because `Swap, (i)` started a roman list. Gibraltar identities shifted the same way (`10.05(i)` → `10.05(iii)`, `7.05(b)(21)(a)(1)` → `7.05(b)(21)(b)(1)`).
- Narrow comma rule: admit `), (next)` only when it continues the preceding structural marker, a depth-0 raw label continues it, and proviso `(1)` follows that label before the next non-continuing line-start item. CONMED `7.4(a)(iii)` / `7.4(a)(iv)` / `7.4(a)(iv)(1)` / `7.4(a)(iv)(2)` return. `7.4(a)(ii)(1)` is gone. Gibraltar's extracted-text node multiset matches `12c858e` (1978). Chewy `6.05(a)(2)(c)` matches the baseline path.
- Section 7.14 exceptions stay `7.14(a)(i)`, the baseline parent. Promoting them onto the section requires admitting `(b)` and `(c)`, and that admission is the same comma pattern that reparented Gibraltar. No separate safe rule.
- Live CONMED denominator stays attemptable 135, empty 0. Bands are SHORT 102 / MID 20 / LONG 13. The sealed calibration file still records attemptable 133. `7.13`, `7.14`, and `7.16` are MID again because `(b)`/`(c)` are not split out.
- Local `npx vitest run tests/stratified-cert` on `554c42e`: Gibraltar 901/1978 passed. Chewy `6.05(a)(2)(c)` pin passed. CONMED `7.8(d)` operative sha `4e5b6f9b…` and 389 chars passed. `00-preflight.json` differed in one field: `inputs.rehydrationUnresolved` is 0 live, canonical pin is 2. At `12c858e` those two unresolved rows are `7.4(a)(iii)` and `7.4(a)(iv)` `NOT_FOUND`. The pin file was not rewritten.
- `npx tsc --noEmit -p .` clean. Paid spend $0.

## Evidence contract — historical pin vs current rehydration

- The §7.8(d) pin test was doing both jobs at once: it hashed nothing, and it required a fresh emission to be byte-identical to the frozen pin. That emission now records `rehydrationUnresolved: 0` because the parser resolves the two refs. The frozen file still records `2`.
- The canonical directory is hash-locked (`FOLLOWON_CANONICAL_SHA256`). The test reads those bytes and requires `rehydrationUnresolved === 2`. It does not rewrite the pin and does not treat 0 as the historical result.
- A separate test resolves `discovery-candidate:90d9d73e1fda41693532da4a` to clause `7.4(a)(iii)` under `7.4(a)`, opening `any Subsidiary that is a limited liability company may consummate a Division`, and `discovery-candidate:179a1f3046d17abc490af6b9` to clause `7.4(a)(iv)` under `7.4(a)`, opening `the Parent Borrower may be merged`. Proviso `(1)` stays under `(iv)`. The sealed population rehydrates with an empty unresolved list, so no other formerly unresolved ref was attached.
- Live preflight may differ from the frozen preflight only in `inputs.rehydrationUnresolved` (0 vs 2). Manifest, identity, operative state, and eligibility stay byte-identical to the pin. `PINNED_OFFLINE` is not `CERTIFIED`.

## Section 7.14 exception parentage

- Source order is the section prohibition, then abilities `(a)` / `(b)` / `(c)`, then `except ... (i)` / `(ii)` / `(iii)`. The exceptions modify the encumbrance prohibition, not the dividend limb.
- `(b)` and `(c)` are comma-joined. Admitting that pattern is the rule that moved Gibraltar and Chewy. They stay unparsed. `7.14(a)(i)` still owns `(ii)` and `(iii)`. `7.14(b)`, `7.14(c)`, and `7.14(i)` are `NOT_FOUND`.
- `unparsedExceptionParentage` does not move nodes. When a clause's own text still contains the next marker of its list and an `except` introduces that list, context retrieval marks the operative item `AMBIGUOUS_TARGET` and `isCurrentTruth: false`. The text stays. `hasUnresolvedOperativeEvidence` blocks a completed compile. `7.4(a)(iii)` is not flagged. A line-start `except:` list whose siblings parsed is not flagged.

## B4 — duplicate structural identities

- The live index already addresses occurrences by `nodeId` and returns `AMBIGUOUS` for a repeated section ref. The seeded property suite (1500 documents) still passes.
- Added assertion: the two synthetic `6.04` occurrences keep different descendant text. Neither span is overwritten by the other.

## A6 — operative-state order

- Reversing a dated replacement chain does not change status or current text. Two same-day replacements stay `OPERATIVE_STATE_CONFLICTED` with `currentText` null in either order. An effect with a null instrument key is unattached and is not an applied amendment.
- Pre-existing `phase-3f1-operative-state-honesty` test 40 still expects a null-instrument effect passed only in `allEffects` to stay off a different instrument. IPV-05 attaches every null-instrument effect to the computed instrument. This pass did not change that rule.

## IPV-22 — capacity requires the figure's own permission or exception

- Capacity is true on exactly two paths in `decideMoney`. Both require the figure's own clause to be an affirmative permission (`may` / `permitted` / `except` later than any prohibition in that clause) or an exception-list item (the section introduction ends in `except` / `except:`), with no condition word before the figure and no governing prohibition.
- `statedCap`: the closest phrase is an `alone` cap (`not to exceed`, `not exceeding`, `not greater than`, `not more than`, `no more than`, `up to`, `equal to or less than`) and that cap phrase occurs in the clause.
- `formulaCap`: the closest phrase is `greater of` or `lesser of`, and a cap phrase introduces it with no dollar between them, or the clause says `an amount equal to the greater/lesser of` or `equal to the greater/lesser of`.
- Clause start is the latest of the section heading, a line/colon/semicolon list marker, a sentence boundary, and a blank line. The 220-character authority window and the 1,600-character prohibition lookback are gone. `AMOUNT_CEILING` is gone.
- These do not set capacity: aggregate principal amount, a shall-not-exceed ceiling, a comparator, a formula by itself, or a may/except that belongs to another clause or section. An `alone` phrase without a governing permission is `UNCLASSIFIED`, capacity false. A condition word before the dollar is capacity false.
- Ambiguous `(i)` after both `(h)` and `(a)` in the same section is `UNCLASSIFIED`, capacity false. A compiled basket on that figure is `WRONG_AMOUNT` / `REVIEW_REQUIRED`.
- A parent `shall not:` list still inverts a bare ratio comparator inside its items. A parent `except:` list still leaves a cap inside an item as `EXCEPTION_AMOUNT`.
- Adversarial file `tests/contract-model/figure-role.test.ts` covers an intervening proviso, a nested condition under an exception item, a remote permission in another section, conflicting governing verbs, a shared `together shall not exceed` ceiling, and ambiguous `(i)`.
- LCQG ADV-FP-01/02 (`83cde5b`) keep bare aggregate language out of `shared_cap`. Their positive control `may incur … not to exceed $25,000,000` stays capacity true. The pool sentence is a relationship signal, not an independent basket.
- Independent replay on `46ebf2e`, expectations unchanged, with this `lib/` overlaid: `INV-25:L-P2` refuses `WRONG_AMOUNT`. `INV-25b:H-T2` refuses `WRONG_AMOUNT` with compilation `COMPLETED`. `INV-09b:A-T1` and `INV-09b:B-T1` refuse `WRONG_LOGIC`. H-T1, H-T3, L-P1, L-P3, and A-T2 still refuse. `INV-19:true-cycle-still-reported` and `INV-19b:genuine-cycles-reported` still fail with detail `none`. MUT-08, MUT-12, MUT-13, MUT-14, and MUT-15 product assertions pass and their GAP kill predictions are `KILLED`. MUT-16 stays `SURVIVED`.

## IPV-21 — indenture spans are not a directed cycle

- `getDefinitionFullText` stops at the next non-nested definition and at the next article or section. The on-stack cycle check is unchanged. Term Alpha ↔ Term Beta still reports a cycle (`definition-cycle-graph.test.ts`).
- Package B indenture, read through the challenger's loader and this `lib/` at `46ebf2e`:
  - Restricted Subsidiary full span, 100 characters: `"Restricted Subsidiary" means any Subsidiary of the Issuer that is not an Unrestricted Subsidiary.` It names Unrestricted Subsidiary. It does not contain `SECTION 4.09`.
  - Unrestricted Subsidiary full span, 144 characters: `"Unrestricted Subsidiary" means any Subsidiary of the Issuer designated as an Unrestricted Subsidiary by the board of directors of the Issuer.` A word-boundary match for `Restricted Subsidiary` is absent. The span does not contain `SECTION 4.09`. The self-mention is excluded from the edge walk.
  - `buildCandidateCompilerInput` for indenture `4.09` returns no `DEFINITION_CYCLE`.
- The stored `definitionExcerpt` is 200 characters and runs into the article heading. Their genuine-cycle check uses that excerpt with a substring test. `unrestricted subsidiary` contains the letters `restricted subsidiary`. That check was not edited.
- `INV-19:true-cycle-still-reported` and `INV-19b:genuine-cycles-reported` fail with detail `none`. The expectation asks for a cycle the definition bodies do not contain. It was left unchanged. No cycle was manufactured.
- Diamond, mention-alone, I `7.01`, L `7.07`, and `INV-19b:no-false-cycles-corpus-wide` pass.

## Independent replay — IPV-16, IPV-19, IPV-20

- Replay used `origin/claude/independent-product-validation` at `46ebf2ee0b0da20358755cbc70f851420ade20ee`, with this branch's `lib/` copied over. Their fixtures and expectations were not edited. No paid provider.
- IPV-19: passing. `INV-05` F1 and F3 are `REPLACE_DEFINITION` / `RESOLVED`. F2 stays `UNKNOWN_CHANGE` / `REVIEW_REQUIRED`. `INV-05b` keeps Section 1.01 from being replaced as a whole and keeps prior section amendments.
- IPV-20: passing. `INV-05b:A:bundle-definition-current` retrieves the amended Consolidated EBITDA text.
- IPV-16: the unclassified override stays on the provision as `REVIEW_REQUIRED` and is excluded from the textual chain. Authoritative text is kept. A real deletion still clears `currentText`. An `UNKNOWN_CHANGE` that is not an unclassified override still withholds text.
  - MUT-08, MUT-12, MUT-13: `CURRENT`, applied 0, source `credit-agreement`, instrument `OPERATIVE_STATE_REVIEW_REQUIRED`. Product assertions pass.
  - MUT-14: `SUPERSEDED`, applied 1, source `amendment-1`, instrument `OPERATIVE_STATE_REVIEW_REQUIRED`. Product assertions pass. The prior amendment's text remains.
  - MUT-15: `CURRENT`, applied 0, source `abl-credit-agreement`, instrument `OPERATIVE_STATE_REVIEW_REQUIRED`. Product assertions pass.
  - MUT-16: `CURRENT`, applied 0, source `credit-agreement`, instrument `OPERATIVE_STATE_REVIEW_REQUIRED`, two consent effects. Product assertions pass. Kill verdict `SURVIVED`, predicted `GAP`, prediction held.
  - MUT-08, MUT-12, MUT-13, MUT-14, MUT-15 product assertions pass. Their harness kill prediction is `GAP` and the verdict is now `KILLED` (`CONTEXT_RETRIEVAL`). Those five `kill prediction (GAP) holds` rows fail. The expectations were not edited.

## Remaining false-permission risks after the clause-boundary rule

- A ceiling-only basket has no affirmative permission or exception in its own clause. Section 7.04 of the xref fixture (`The aggregate principal amount … shall not at any time exceed the greater of $123,000,000`) is `PROHIBITION_THRESHOLD`, capacity false, and the candidate is `MAPPED_WITH_REVIEW` / `REVIEW_REQUIRED`. The certification suite still expects that candidate `CERTIFIED`. That expectation was not edited. The representation gap and the exact migration are in the §7.04 section below. Non-frozen coverage is `tests/contract-model/aggregate-ceiling-limit.test.ts`.
- A condition word before the dollar refuses capacity even when the same clause also says `may` and `not to exceed`. `The Borrower may incur Indebtedness, if no Default has occurred, not to exceed $X` stays capacity false. That is a false refusal, and it is the conservative side of the rule.
- An exception basket whose operative window is only the clause, and whose `except:` lives only in a parent the figure-role pass does not read, stays capacity false. Golden 7.01 passes because the operative text includes the chapeau.
- CONMED `7.2(h)` is disclosed again as `UNVERIFIED_SIBLING_SIGNAL`. An ordinary aggregate ceiling is not typed `SHARED_CAP`. Gibraltar Pass A stays 901: `aggregate principal` / `aggregate outstanding` alone does not create a candidate.
- Exotic shared-pool phrasing outside the LCQG relationship regex under-recalls to `aggregate_amount`. A real pool that is only a ceiling is not an independent basket.
- An unclassified override does not invent the side-letter amount. The last authoritative text stays, with `REVIEW_REQUIRED`. A genuine deletion still clears the text.

## §7.04 — the IR cannot verify an aggregate limit that is not capacity

Adjudication at `ad7955c`: `CURRENT_REVIEW_REQUIRED_BEHAVIOR_CORRECT`. §7.02(c) is the INCUR_DEBT permission. §7.04 is the aggregate MAX ceiling. The scripted `QUANTITATIVE_PERMISSION` / `PERMISSION` / `COMPLETE` rule is unsupported. Figure-role and the certification gate were not changed. No certification was advanced. This is separate from IPV-16.

Existing pieces, none of which is a verified non-permission limit:

- `QUANTITATIVE_RESTRICTION` plus posture `PROHIBITION` already exists. Ground truth uses it for a greater-of restriction. It is not a new rule type.
- `MAX(MONEY, MULTIPLY(PERCENT, DEFINED_TERM_REFERENCE))` is the ceiling arithmetic.
- `LIMITED_BY` is the relationship §7.02(c) already emits. The capacity graph records it as `LEGAL_RELATIONSHIP` and only when both rules have capacity nodes (`runtime/capacity/graph.ts`). The evaluator does not follow that edge. Verified execution refuses `LIMITED_BY` as `CROSS_RULE_GATE_NOT_EXECUTABLE`.
- `IRSharedCapacity` is a pool shared by member permissions. This ceiling is one section limiting one permission, not a shared pool.

Gap:

- `capacityExpression` is available capacity. `buildCapacityGraph` emits `RULE_CAPACITY` for every non-null `capacityExpression`, with no posture or rule-type filter. Figure-role walks that slot as capacity and emits `THRESHOLD_AS_CAPACITY` / `WRONG_AMOUNT` when the figure's own clause is not a permission or exception. Putting the MAX on a `QUANTITATIVE_RESTRICTION` still creates a second executable capacity and stays `MATERIAL_DISCREPANCY`.
- There is no operand for "the aggregate principal amount incurred under this section" that is not itself a capacity reference (`RULE_REFERENCE`, `LEDGER_USAGE_REFERENCE`). A condition may hold the MAX with `capacityExpression` null. That creates no capacity node, draws no `LIMITED_BY` edge, and emits no `WRONG_AMOUNT`. Empty findings are not a verification that the number is the ceiling. Sufficiency on that shape is not `COMPLETE`.
- No schema field was added. A new rule type was not added.

Frozen-expectation migration, not applied. File `tests/contract-model/certified/xref-fixtures.test.ts`. Do not edit the scripted submission in `xref-harness.ts` to a different COMPLETE shape.

Observed on this SHA, scripted submission unchanged:

- Lines 32–34: §7.04 is `MAPPED_WITH_REVIEW` / `REVIEW_REQUIRED`. The other nine candidates stay `MAPPED` / `CERTIFIED`. §7.04 verification is `MATERIAL_DISCREPANCY`. Its only material finding is `WRONG_AMOUNT` with signals `THRESHOLD_AS_CAPACITY` and `PROHIBITION_THRESHOLD`. Candidate blockers are `VERIFICATION_NOT_CLEAN` and `OPEN_MATERIAL_OR_UNCERTAIN_FINDING`. Line 34's empty-material-findings loop holds for the other nine only.
- Line 35: package status is `REVIEW_REQUIRED`. Blocker codes: `CANDIDATE_REVIEW_REQUIRED`, `REVIEW_ONLY_EXECUTABLE_DEPENDENCY` three times, `REVIEW_UNRESOLVED_ITEM` (`CANDIDATE_VERIFICATION_NOT_PASSED` at 7.04), `UNBOUND_EXECUTABLE_BINDING` twice.
- Line 36: counts become `{ total: 12, bound: 12, executable: 10, notInTargetSet: 0, notCompiled: 0, unitNotFound: 0, unknown: 0, reviewRequired: 0, oneToMany: 0, selectorReview: 0, qualifiedOneToMany: 2 }`. The two non-executable bindings are both `BOUND` to Section 7.04: `conditions[0].referencesRuleTargets[0]` and `sourceDependencies[0]` `LIMITED_BY`.
- Line 58: the untouched package is `REVIEW_REQUIRED`.
- Lines 117–120: the §7.02(c) `LIMITED_BY` binding still names the §7.04 rule, status `BOUND`, `executable` false.
- Lines 127–130: of six `IR_SOURCE_DEPENDENCY` edges, five stay `CERTIFIED_SEMANTIC` and the §7.02(c) → §7.04 `RULE_DEPENDS_ON_RULE` edge is `REVIEW_ONLY`. Two further edges are `REVIEW_ONLY` under other derivations: `RULE_SUBJECT_TO_CONDITION` from 7.02(c) to 7.04, and `RULE_USES_DEFINITION` from 7.04 to 1.01 (Total Assets).
- Lines 84–89 stay: §7.02(c) must not carry `$123,000,000` or `17%`.

Until a separately authorized non-capacity limit slot exists, §7.04 remains `REVIEW_REQUIRED` and the package remains uncertified.

## Queue

| Id | Severity | Status | Next action |
| --- | --- | --- | --- |
| P0-A entity-scope widening | P0 | VERIFIED locally | Watch CI on the push SHA |
| P0-B IPV-19 definition amendment replaces all of Section 1.01 | P0 | VERIFIED locally | Definition target plus section splice; see definition-level-amendment tests |
| P0-B IPV-20 retrieval ignores operative definition | P0 | VERIFIED locally | Bundle excerpt uses the operative definition when one exists |
| P0-C IPV-16 notwithstanding side letter | P0 | PRODUCT assertions pass on replay | Override stays REVIEW_REQUIRED and does not erase authoritative text. Five GAP kill predictions are now KILLED. Expectations were not edited. Next owner: challenger harness |
| IPV-21 false definition cycle | P0 | FIXED, indenture control disagreed | Spans prove one direction only. `true-cycle-still-reported` and `genuine-cycles-reported` still fail. Expectations were not edited. Next owner: challenger expectation author |
| IPV-22 comparator as capacity | P0 | CLAUSE BOUNDARY | Capacity requires the figure's own permission or exception. xref 7.04 ceiling stays REVIEW_REQUIRED. L-P2, H-T2, A-T1, and B-T1 refuse |
| §7.04 aggregate limit slot | P0 | GAP, expectation not edited | No non-capacity limit slot. Scripted PERMISSION stays REVIEW_REQUIRED. Frozen CERTIFIED migration is recorded and not applied |
| IPV-04 section candidate compiles superseded clauses | P0 | PUSHED `c2a913b` | Parent operative text splices resolved clause replacements and deletions |
| IPV-05 ABL amendment target unresolved | P0 | PUSHED `70023f7` | CI 9 checks passed on that SHA |
| A1 failed definition splice returns base section | P0 | VERIFIED locally | Unspliceable definition amendment withholds the section |
| A1 failed definition splice returns base section | P0 | PUSHED `f0bc31e` | Unspliceable definition amendment withholds the section |
| A2 parent/child amendment precedence | P0 | PUSHED `f0bc31e` | Later or same-day child amendment withholds the parent text |
| IPV-08 exhibit term sheet as a definition | P0 | PUSHED `12c858e` | Non-operative summary does not supply definitions |
| IPV-06 inline definition enumeration | P0 | NARROWED | Later line-start terms stay on the section. Definition lists stay in the certified tree |
| B3 comma-separated clause vs citation | P0 | NARROWED | 7.4(a)(iii)/(iv) only when they bridge proviso (1). Chewy 6.05(a)(2)(c) restored |
| stratified-cert 7.8(d) preflight | P0 | SPLIT | Canonical bytes still say rehydrationUnresolved 2. Live parser test expects 0 and checks the two refs |
| P0-D IPV-02 / IPV-03 | P0 | VERIFIED on `bb9bfd4` | Re-check only if those files change |
| P0-E source authentication | P0 | VERIFIED on `bb9bfd4` | Do not reopen |
| 7.14 exception parent | P1 | LIMITED | Tree unchanged. Unparsed except-list is AMBIGUOUS_TARGET, not current truth |
| B4 duplicate identities | P1 | LOCKED | nodeId index plus distinct text for repeated 6.04 |
| A6 operative-state order | P1 | TESTED | Date order, same-day conflict, null instrument key stays unattached |

## Blockers

The frozen §7.8(d) pin still records `rehydrationUnresolved: 2`. The live parser resolves `7.4(a)(iii)` and `7.4(a)(iv)` and emits 0. Those are different claims. Section 7.14 exceptions remain under `7.14(a)` and are marked not current truth. Do not merge. Do not spend. Do not edit Claude-owned fixtures. Do not rewrite the canonical pin.
