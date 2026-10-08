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
| A contents title that states a dollar amount, a ratio, or a month was operative text. | Quantity evidence no longer blocks a contents classification. `may` followed by a day number is a month. A body that states a basket amount without being a contents row stays operative. |
| An unanchored compile with an index looked like a missing fail-closed. | Production discovery, covenant-map, and Gibraltar rehydration pass an anchor. Raw-text fixtures keep compiling when the anchor id is absent. A supplied id missing from the index is still refused. |
| A long contents title outranked a shorter operative body in reference resolution. | `resolveReferenceTarget` treats a contents listing as degenerate at any length. Two operative bodies stay `AMBIGUOUS`. |
| `getOperativeProvision` served a contents listing when it was the only node for the label. | The raw fallback refuses a contents listing. A unique operative body is still returned. |
| `getReferencedProvision` followed a stored target id into a contents listing. | A contents-listing target is skipped. The operative body is returned when one exists. A label whose only node is a contents listing is refused. |
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

## Audit against origin/main `9de4e57` (2026-10-08)

This branch's merge-base with `origin/main` is `554698a`. Commits on main that are not in this branch: `#129` operative-subwindow seal (`1c0a4fc`), `#131` CONMED blocker classification (docs), `#133` mention-is-not-reliance (comment plus `defined-term-mention-not-reliance.test.ts`), `#134` qualitative-description narrowing (`9de4e57`).

`#134`'s narrowing is now on this branch, on top of the stricter independent-qualifier rule. Main's `isFoldedQualitative` substring deletion was not copied. `#133`'s behavior is already locked here by `unlimited-carveout-qualitative-gates.test.ts` ("does not synthesize defined-term reliance from a capitalized mention"). The separate main test file is not on this branch. `#129`'s `operative-subwindow-seal.ts` is absent here. It was not reimplemented, because it is already merged on main and a merge of main into this branch conflicts in `unlimited-carveout-honesty.ts`.

`#132` (open, `db53bc1`) parses a restarted letter run without taking `(x)` as roman ten. The unmodified patch nested a second `(b)` under the cross-reference in `Section 6.1(a) or (b)`, so CONMED `7.1(c)` and `7.1(d)` became `7.1(b)(c)` and `7.1(b)(d)` and the offline map fell from 104 represented records to 102. The kept change refuses a restarted run when an open list of the same alphabet has already reached that letter. `7.1(c)` and `7.1(d)` rehydrate again. `offline-maps.test.ts` passes. Two pre-existing misses remain, both without run-original evidence files: `7.4(a)(iii)` and `7.4(a)(iv)`.
