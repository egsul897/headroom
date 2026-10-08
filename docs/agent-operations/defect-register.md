# Correctness defect register

Branch: `cursor/architecture-remediation-7cc2`
Recorded against production code on this branch. Classifications are from the live modules and retained artifacts, not from a fresh paid run.

DEVELOPMENT ≠ CERTIFIED. This register does not change certification status.

## ALREADY_FIXED

| defect | where it is closed |
| --- | --- |
| A contents listing was eligible to be read as the operative covenant. | `operative-authority.ts` classifies `CONTENTS_LISTING`. `compileCovenantToIR` returns `OPERATIVE_AUTHORITY_REFUSED` before a model call. |
| Extracted Gibraltar contents rows use a non-breaking space and blank lines, so a per-line contents test missed them. | `collapseExtractedWhitespace`. An operative predicate still blocks the contents classification. |
| Longest text was treated as authority when two spans shared a label. | Length is not an authority vote. Two physical nodes for one label stay a refusal. |
| Repeated discovery rows for one physical node were selected as two bodies and dropped real sections. | `selectAuthenticatedSectionBodies` dedupes by occurrence id. A missing id does not collapse distinct rows. |
| A definitions section with `means` and no `shall` was refused as non-operative. | `spanContainsDefinitionDeclaration` reuses the structural definition grammar. |
| An independent qualitative condition was deleted, and an unattributed unlimited pair was copied onto siblings. | `semantic-accountability-compiler.v12` qualitative redundancy and ambiguous attribution. |
| Missing token telemetry was treated as zero spend. | `mayDispatchUnderSpendingTarget` blocks the next dispatch when tokens are unknown. |
| The five-conversation reservation shape was filtered only for Gibraltar. | The Gibraltar-only stop was removed. The shape applies generally. |
| Article VII evidence was a rule count that could be mistaken for 82 IR objects. | Sidecar `SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE`. The historical JSON bytes stay sealed. |
| `verify-gibraltar.ts` did not typecheck (`TS2322`). | Meter options and readonly signals fixed on this branch. |

## PARTIALLY_FIXED

| defect | what is true now | what is still open |
| --- | --- | --- |
| Defined-term mention versus reliance. | Closure retrieves definition text and walks term-to-term mentions. A required term absent from the known list or from the closed text is `missingDefinitions`. | Mention in text is not proof the operative clause relies on the term. No reliance judgment is claimed. |
| Selective compilation. | `compilation-scope.ts` compares populations. `question-plan.ts` emits a dry-run plan, reuses a matching evidence record, and refuses an unpriceable model. | `package-compile.ts` still compiles every eligible non-representation candidate. The planner is not on that path. |
| Certified-path CI after the definition-declaration fix. | Actions runs `37796297553` and `37796289447` on `011e19c` concluded success for `certified path (provider-free)`. The earlier failure is run `37793529670` on `481b19f` (13 `OPERATIVE_AUTHORITY_REFUSED`). | Those green runs do not include the question planner. A later head needs its own conclusion. |

## CONFIRMED_OPEN

| defect | evidence |
| --- | --- |
| Broad semantic compilation is still the production default. | `isEligibleForSemanticCompilation` excludes representations only. The ADR records that and does not switch the path. |
| Pass B dollars for the Gibraltar discovery run are not on the rate card. | `execution.json` has 140 calls, 433,957 input tokens, 172,238 output tokens. `priceUsage` for Haiku is `UNKNOWN_MODEL`. |
| A resolved-only closure of Gibraltar is incomplete. | `structure-summary.json`: 968 unresolved references, 918 ambiguous duplicate-label findings. The offline summary is a different run from the paid Pass B file. |
| The paid verification run verified nothing. | `verification.json`: `exactSpendUsd` 8.777854, 16 exact attempts, 74 emitted rules, 0 verified. Stop reason gateway credit. 35 later rows are zero-token refusals. |
| Question planning does not compile, and a cue-matching same-action section is an entry rather than an omission. | `question-plan.ts`. Discovery-only same-action sections outside the closure are disclosed. A section that repeats the family word with a normative verb is compiled. That can over-compile. It does not silently drop that section. |
| Evidence reuse is not consulted by `compileCovenantToIR`. | The store is used by preflight and by the dry-run planner. The compiler still calls the model when a caller invokes it. |
| Local semantic-verification timeouts. | Previously observed: 3 failures in `tests/contract-model/semantic-verification-verify.test.ts` on `481b19f` with the definition edit stashed. Not re-run in the question-plan change. Not attributed to that change. |

## INSUFFICIENT_EVIDENCE

| claim | why it is not booked |
| --- | --- |
| False-permission count on Gibraltar. | Not a field in the sealed verification record. Statuses that exist are `MATERIAL_DISCREPANCY` and `VERIFICATION_FAILED`. |
| Material covenant recall on Gibraltar. | Not measured. Chewy `6.08` recall is a different package and was produced with discovery. |
| Dollar savings from prompt cache, batch APIs, or compiling a closure instead of 788 rows. | No hit-rate record. No closure was priced against the sealed run. Population counts are not dollars. |

## NOT_REPRODUCIBLE / SUPERSEDED

No prior defect on this list was reclassified as not reproducible. The Gibraltar-only conversation filter and the summary-only Article VII file are superseded by the fixes above; the historical failure records remain.
