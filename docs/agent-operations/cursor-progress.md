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

## Open, still in this owner's scope

- Re-observe the certified-path Actions job on the commit that contains the definition-declaration fix, the evidence engine, and the question planner. Do not describe a pending or absent job as green.
- Do not recompile Article VII and do not rerun the 788-row verification. The smallest future spend test is the single-section experiment in the cost report, and it is not authorized by this change.
- Do not treat a cache hit or a dry selection as certification.
- Wiring `package-compile.ts` to the closure remains deferred. It needs an explicit architecture change and must not move Phase 3 gates.
