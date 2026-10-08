# Cursor remediation checkpoint

Branch: `cursor/architecture-remediation-7cc2`
Base: `cursor/gibraltar-haiku-verify-7cc2`
PR: https://github.com/egsul897/headroom/pull/136 (draft)
Owner: production compiler, Gibraltar runner, source authentication, budget and reservation controls, evidence persistence.
Claude Code owns `tests/product-acceptance/`, `tests/fixtures/product-acceptance/`, `scripts/product-acceptance/`, and `docs/product-readiness/`. This checkpoint does not modify those paths.

DEVELOPMENT ≠ CERTIFIED. No provider call was made. No certification gate was moved.

## Completed on this branch

1. Contents listings are not operative covenants. Length is not a vote. `compileCovenantToIR` refuses a contents line, a missing anchor, a hash mismatch, and a known-superseded base span. Unknown supersession stays unknown.
2. Extracted contents rows that use a non-breaking space and blank lines between the label, the title, and the page number are contents listings. A span that contains an operative predicate is not reclassified as a contents line.
3. Repeated discovery rows that share one physical node id are one body. Two different physical nodes for the same label are still a refusal.
4. A definitions span is operative when it contains a declaration the structural definition grammar already recognizes (`"Term" means`, quoted colon, or unquoted colon). That closed a false `OPERATIVE_AUTHORITY_REFUSED` on certified definition sections such as golden `1.01`.
5. An independent qualitative gate does not delete a third qualifier. An unattributed unlimited pair is not copied onto siblings.
6. The Article VII $12 figure is a development spending target. Missing token telemetry is UNKNOWN and blocks the next dispatch. `BudgetLedger` hard ceilings are unchanged.
7. The five-conversation reservation shape applies to every document. The Gibraltar-only warning filter is gone.
8. `article-vii-compile.json` remains count-only and is linked to a `SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE` sidecar. The 82 rules were not reconstructed.
9. The two `TS2322` errors in `verify-gibraltar.ts` on `57c9eb4` are fixed.

## Offline Article VII diagnostic selection

`npx tsx scripts/p3-development-pipeline/compile-gibraltar-article-vii.ts --dry` selects six operative bodies and no contents line:

| ref | operative chars | role |
| --- | ---: | --- |
| 7.02 | 415 | PERMISSION |
| 7.08 | 2694 | PROVISO |
| 7.03 | 4234 | GENERAL_PROHIBITION |
| 7.06 | 7962 | GENERAL_PROHIBITION |
| 7.01 | 21491 | PROVISO |
| 7.05 | 34605 | EXCEPTION |

Supersession on these rows remains unresolved. Selection for a diagnostic read is not `CURRENT_OPERATIVE`.

## Sealed evidence (unchanged)

- `article-vii-compile.json` `c866c1c1bb31095a73687257f68a23f4e232b1f92f9dfe278f8ac0b02b8f4651`
- `verification.json` `4da1126d854704962cf27a2a20c82d4c6f2a56b00420ff1ab8e1fe173445b621`
- `execution.json` `6dc500ebbe1866a93bcc26d9a696bbfa0b7b9871fcb520ef1290c6f19782c17f`

## Validation recorded with this checkpoint

- `npx tsc --noEmit -p .` exited 0.
- `tests/contract-model/compiler/operative-authority.test.ts` 11 passed.
- `tests/contract-model/certified/golden-map.test.ts` passed.
- `npm run test:phase3-certification`: 453 passed, 3 failed. The 3 failures are `tests/contract-model/semantic-verification-verify.test.ts` timeouts or `semanticReviewInvoked === false` under the local 5s default. The same assertion fails on `481b19fe91137f0be6a552d2ec06925a0bcaf27d` with these edits stashed, so it is not caused by the definition-declaration change. GitHub Actions run `37793529670` on `481b19f` failed the certified path with 13 `OPERATIVE_AUTHORITY_REFUSED` failures in certification, golden-map, edge-authority, and xref fixtures. Those four files pass locally after the definition-declaration fix. On `011e19c`, Actions runs `37796297553` and `37796289447` concluded success for `certified path (provider-free)`.

## Evidence engine

Module `lib/contract-model/compiler/evidence-engine/`. Report `docs/agent-operations/cost-evidence-engine.md`.

Default spend authorization is no paid calls. The $5 figure is a proposed experiment cap, not an authorization. Haiku stays off the rate card. Cache hits do not certify. Contents listings are rejected before a reservation.

Offline: `tests/contract-model/compiler/evidence-engine.test.ts` 11 passed. `npx tsc --noEmit -p .` exited 0.

Measured Gibraltar verification spend remains `8.777854` on 16 attempts, 74 emitted rules, 0 verified rules. Pass B dollars are not on the rate card. No paid call was made to build the engine.

## Compilation-scope decision

ADR: `docs/architecture/SELECTIVE-COMPILATION-ADR.md`. Decision: hybrid. Package inventory stays broad and deterministic. Deep compilation becomes the dependency closure of a question, with every unexamined restriction disclosed. Full-population semantic compilation is not the default to keep, and a question-only read that drops uncited covenants is rejected.

Proof of concept: `lib/contract-model/compiler/compilation-scope.ts`. Offline test on the xref fixture: seed `7.02` compiles `7.01`, `7.02`, `7.03`, and `7.04` under closure, leaves `7.05` and `7.06` listed and not compiled, and does not compile `1.01` when its definition text is retrieved. No dollar saving is claimed from those counts.

`question-plan.ts` is a dry-run in front of that closure. It does not call a model and it does not replace `package-compile.ts`. A contents line is refused. A discovery-labeled same-action section outside the closure is disclosed. Unexamined operative sections, missing definitions, unresolved references, ambiguous duplicate bodies, unknown operative version, and an unpriceable model stay `REVIEW_REQUIRED` or `BLOCKED`. `$75 million` in the question is a parameter. Capacity is not computed. `measuredBillingUsd` is null.

Offline: `tests/contract-model/compiler/question-plan.test.ts` 10 passed. Economics write-up: `docs/agent-operations/offline-economics.md`. Defect register: `docs/agent-operations/defect-register.md`. Acceptance handoff: `docs/agent-operations/claude-integration-requirements.md`.

No Phase 3 gate was moved. Pass B is not retired.

## Qualitative description narrowing

An exact qualitative gate whose description only restates the other gate is rewritten to that one gate. A description that also states an independent qualifier is left unchanged. Substring folding from `origin/main` was not adopted. The third-qualifier and ambiguous-sibling tests still pass.

The open parser change in PR #132 is on this branch with one guard. A restarted letter run does not open when an open list of the same alphabet has already reached that letter. Without the guard, the cross-reference `Section 6.1(a) or (b)` inside CONMED 7.1(a) swallowed the real `(b)`, and `7.1(c)` / `7.1(d)` were no longer resolvable. With the guard, those two keys rehydrate and `offline-maps.test.ts` stays at 104 represented records.

## Checkpoint

- Agent: Cursor. Ownership: production compiler, source authentication, budget, evidence, structural parser. Not Claude's acceptance directories.
- Mission: source-backed compilation without false operative text, silent condition loss, or unanchored authority.
- Branch: `cursor/architecture-remediation-7cc2`. Base: `cursor/gibraltar-haiku-verify-7cc2`. PR #136 draft.
- Last verified SHA before the unanchored decision: `044d1b32052d5d75c1bfb57d26fdbd183a0804b5`. Certified path on `4a7a477` succeeded (Actions `37798576897`). Actions on `8590be6` and `044d1b3` were not observed.
- Current task: a definition mention withheld the operative section because a contents row shared the label.
- Status: definition-text retrieval and `retrieveCrossReferencesFromNode` both skip a contents listing and retrieve the operative body when one shares the label. Two operative bodies stay unresolved. `context-retrieval-definition-contents.test.ts` 4 passed. `context-retrieval-pipeline.test.ts` 36 passed.
- Known defects still open: `package-compile.ts` still compiles every eligible non-representation candidate. Local semantic-review timeouts under the 5s default are not a certification result. Actions on `8590be6` and `044d1b3` are unobserved.
- Unanchored compile: every production caller that reaches `compileCovenantToIR` with a real package index also passes a non-empty anchor. Discovery Pass C sets `structuralNodeIds` to a node id from that index. `compileCandidateToVerifiedIR` returns `NO_STRUCTURAL_ANCHOR` before compile when the list is empty or the id is missing. Gibraltar `candidateFor` and `rehydrate` skip a row with no resolvable node id. `operativeModelDispatchBlock` still returns null when the index is absent or the anchor id is absent, because `testCompilerInput` and certified bounded-execution fixtures compile raw operative text with an index attached and `originatingStructuralNodeIds` empty. An anchor id that is present and missing from the index is still refused.
- `7.4(a)(iii)` and `7.4(a)(iv)` are not nodes. The marker scanner rejects a parenthesis that is immediately preceded by a comma and a space (`MARKER_OCCURRENCE` in `clause-hierarchy.ts`). The Section 7.4 text is "), (iii)" and "), (iv)". That exclusion is the documented citation-list rule. Those two discovery ids have no run-original evidence file. The same two keys were already unresolved on the parser before the letter-run guard. Do not accept every comma-separated marker; that was the FWRG citation false-positive the rule exists to stop.
- Decision: do not merge `origin/main` (`9de4e57`) into this branch. The qualitative-honesty files diverge. Do not wire question closure into `package-compile.ts`.

## Open, still in this owner's scope

- Do not recompile Article VII and do not rerun the 788-row verification. Paid spend remains $0.
- Do not treat a cache hit or a dry selection as certification.
- Wiring `package-compile.ts` to the closure remains deferred.

## NEXT_TASK

- Objective: decide whether `resolveSourceContext` still expands a contents listing when structural reference detection resolved `targetNodeId` to that listing alone.
- Relevant files: `lib/contract-model/compiler/semantic-accountability/source-context.ts` (the branch `if (ref.resolved && ref.targetNodeId && !ref.targetAmbiguous)` around the cross-reference expansion). `retrieveCrossReferencesFromNode` already skips a contents listing and retrieves the operative body when the other occurrence is a contents row.
- First step: read that branch. If a resolved contents-listing target is pushed as status `UNIQUE` and its text is added as a cross-reference region, skip it the same way retrieval does, and keep an operative body.
- Expected output: a regression if the region was the contents text. If the branch already refuses that node, record the line and do not change it.
- Acceptance: existing reference and context-retrieval tests pass. No provider call. No sealed-evidence edit.
- Dependency: do not guess between two operative bodies. Do not raise the semantic-review timeout.

## Milestone

- Starting SHA this continuation: `044d1b32052d5d75c1bfb57d26fdbd183a0804b5`.
- Commits: `982c3bc` contents titles and the unanchored-fixture decision; `be9b01c` long contents titles are not reference targets; `825aacf` `getOperativeProvision` refuses a contents listing; `b5a0f77` `getReferencedProvision` skips a contents-listing edge. The commit that contains this note is the definition-text retrieval change.
- `npm run test:phase3-certification` after the retrieval change: 455 passed, 3 failed, all in `tests/contract-model/semantic-verification-verify.test.ts`. Two are `Test timed out in 5000ms`. One finished and asserted `conditionSuspicion.status` `UNCERTAIN` but received `MATERIAL_CONDITION_POSSIBLE` on the no-key synthetic path. An earlier run of the same suite on this tree timed that test out before the assertion. The timeout was not raised and the assertion was not changed. Certified files in that run, including golden-map and offline-maps, passed. Actions on this head are unobserved.
- Other tests this milestone: operative-authority 13 passed; reference-resolver contents 2 passed; semantic-tool discipline 19 passed; definition-contents 3 passed; context-retrieval pipeline 36 passed.
- Blockers: `package-compile.ts` is still the broad set. Local semantic-review timeouts under the 5s default are not a certification result. Paid calls: none. Certification: not advanced. Sealed evidence: not rewritten.

## Milestone

- Starting SHA this continuation: `044d1b32052d5d75c1bfb57d26fdbd183a0804b5`.
- Commits since then: `982c3bc` contents titles and the unanchored-fixture decision; `be9b01c` long contents titles are not reference targets; `825aacf` `getOperativeProvision` refuses a contents listing; the commit that contains this note is the `getReferencedProvision` refusal.
- Tests this milestone: operative-authority 13 passed; reference-resolver contents 2 passed; heading-only, generic, and two-substantive resolver tests passed; semantic-tool discipline 19 passed.
- Blockers: Actions on `8590be6` and later SHAs are unobserved. `npm run test:phase3-certification` has not been re-run on this head. Local semantic-review timeouts under the 5s default are not a certification result. `package-compile.ts` is still the broad set.
- Paid calls: none. Certification: not advanced. Sealed evidence: not rewritten.
