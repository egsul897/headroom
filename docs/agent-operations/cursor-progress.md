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
- `npm run test:phase3-certification`: 453 passed, 3 failed. The 3 failures are `tests/contract-model/semantic-verification-verify.test.ts` timeouts or `semanticReviewInvoked === false` under the local 5s default. The same assertion fails on `481b19fe91137f0be6a552d2ec06925a0bcaf27d` with these edits stashed, so it is not caused by the definition-declaration change. GitHub Actions run `37793529670` on `481b19f` failed the certified path with 13 `OPERATIVE_AUTHORITY_REFUSED` failures in certification, golden-map, edge-authority, and xref fixtures. Those four files pass locally after the definition-declaration fix. That Actions run has not been re-executed on the new commit.

## Open, still in this owner's scope

- Re-observe the certified-path Actions job on the commit that contains the definition-declaration fix.
- Do not recompile Article VII. The dry selection is a diagnostic. The historical count-only record stays sealed.
- Do not treat this dry selection as certification, coverage, or a product-acceptance result.
