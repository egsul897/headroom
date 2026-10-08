# ADR — Selective dependency-aware compilation

Status: decision recorded. Not implemented as a pipeline replacement. Not a certification change.

Starting point: `fadef7b964a92e933b0dd0bbf43bf758c31130dd` on `cursor/architecture-remediation-7cc2`.

DEVELOPMENT ≠ CERTIFIED. No paid call was made for this decision. Population counts below are not dollar savings.

## Decision

Adopt a hybrid.

Keep package-wide structural discovery as the inventory. Stop treating every discovered candidate as a deep semantic compilation. Compile the dependency closure of a question, reuse a verified interpretation when the reuse contract matches, and disclose every package restriction the closure did not examine.

Do not replace the pipeline with a query that ignores covenants until someone asks. Do not keep paying to compile the full discovered population by default.

## What the current implementation already does

The live path is not one model reading the whole document. It is three layers that already exist, and the expensive one is the last.

### Deterministic structure

`parseDocumentStructure` (`stage-structure.ts`, widened by the Phase 2A structural index) builds the article, section, subsection, clause, and subclause tree. It does not call a model. Phase 1A’s lasting constraint, still in `clause-hierarchy.ts` and `pass-c-neighborhood.ts`, is exact structural identity: an ambiguous label is not guessed.

On the Gibraltar credit agreement, `structure/structure-summary.json` records an offline parse with Pass B skipped because no provider key was set:

| fact | retained value |
| --- | ---: |
| nodes | 2,087 |
| articles / sections / subsections / clauses / subclauses | 20 / 282 / 346 / 488 / 951 |
| definitions | 564 |
| references | 1,459 |
| references resolved | 491 |
| references unresolved | 968 |
| Pass A candidates | 946 |
| sections with a Pass A signal | 86 |

`structure/health-summary.json` records 918 INFO findings, all duplicate-label or ambiguous-reference results from the table of contents repeating articles and section labels. `resolveUniqueNodeByRef` is AMBIGUOUS for those labels. That file says the messages are not dropped.

`detectStructuralDefinitions` and `detectStructuralReferences` are deterministic. `runPassADeterministicSignals` flags prohibitions, permissions, exceptions, dollars, ratios, and headline headings. It does not assign a covenant family and it does not emit a capacity.

Operative-source authentication, already on this branch, separates a contents listing from an operative body. Length is not the test.

### Discovery without a full semantic IR

Phase 2B (`discovery/pipeline.ts`) is Pass A, then one Pass B model call per section that contains a Pass A candidate, then Pass C and Pass D.

Pass B asks the model to list operative rules inside that section and assign a role and family. Pass C resolves those labels onto structural nodes and keeps the parent prohibition beside an exception. Pass D reconciles duplicates. None of that is an executable capacity IR.

The paid Gibraltar Pass B record is a different run from the offline structure summary. `execution.json` records `modelCalls` 140, `inputTokens` 433,957, `outputTokens` 172,238, `finalCandidateCount` 842, and `sectionFailures` 1. `priceUsage` has no Haiku card, so the dollar cost of those tokens is not known. The offline summary’s 86 signal-bearing sections and the paid run’s 140 calls are not the same population and are not subtracted from each other here.

Of the 842 persisted candidates, 515 have distinct source refs. Roles include 95 general prohibitions, 104 permissions, 104 exceptions, 139 conditions, 42 builders, 26 financial tests, and 45 representations. `isEligibleForSemanticCompilation` excludes only `REPRESENTATION`. The verification record then marks 788 rows dispatchable.

### What still requires a model

These jobs are not established by the parser or by Pass A:

- Splitting one section into roles and families when the heading does not already say so, which is what Pass B does.
- Turning a basket into a capacity expression, conditions, exceptions, and entity scope. That is `compileCovenantToIR`.
- Deciding that a compiled rule has no material gap. That is verification.
- Reading a qualitative proviso whose operative effect is not a dollar, a ratio, or a cross-reference the structural grammar already extracted.

Pass A inventory inside the semantic compiler is a further model pass over text the discovery stage has already read. The Gibraltar verification attempts record `TRUNCATED_EVIDENCE_USED`, `SEMANTIC_INVENTORY_UNAVAILABLE`, and `SHARD_INCOMPLETE` on the same calls that were supposed to produce rules. That is a second and third reading, not a new legal source.

### What can be reused across questions

A section’s structural node, definition text, resolved cross-reference, and Pass A signal do not depend on the question. A semantic IR or verification finding can be reused only under the evidence-engine contract: same source hash, operative version, dependency hashes, prompt, schema, model, and compiler version. A hit does not certify the answer. An unknown operative version is not reusable.

### What must stay broad, and what is deep only when asked

The package inventory has to be broad. A restriction with no cross-reference to the asked section can still forbid the same action. Pass A, the definition index, and the reference index are the broad layer, and they are already cheap.

Deep interpretation is required for the asked section, for sections an explicit reference pulls in, for the parent prohibition of a cited child, and for a Pass A prohibition of the same action that no reference connects. The last group is not compiled by the proof of concept. It has to be disclosed, not ignored.

## Three approaches

### A — Current broad semantic compilation

Eligibility is every discovered candidate except representations. Gibraltar verification prepared 788 compilations. It executed 16, settled `$8.777854`, emitted 74 rules, and verified none. The stop reason is `GATEWAY_CREDIT_EXHAUSTED`. Thirty-five later rows are zero-token refusals, not priced sections. Five contents-sized `7.04` and `7.05` attempts account for `$1.72644` of the settled total. The six-section Article VII compile settled `$1.079528` list price, emitted 82 rules, verified none, and recorded `1,078,788` ms of wall clock.

False-permission counts are not in that record. The verification statuses that do exist are `MATERIAL_DISCREPANCY` and `VERIFICATION_FAILED`.

Chewy `6.08` in `docs/phase-3-remediation-f5-3/06-final-summary.json` records discovery recall `1.0` and condition/exception recall `1.0` on that subset, quantitative recall `0.9333` under `INTERSECTION_ONLY` and `1.0` under the union policies, and a paid-run total of `$13.9612`. Dependency recall on that subset is `N/A`. Those figures are not Gibraltar recall and are not a recall figure for skipping Pass B.

### B — Selective compilation on the existing index, without closure

The proof of concept compiles only the asked section. On the existing xref fixture, seed `7.02` selects that one section. It does not select `7.01`, `7.03(b)`, or `7.04`, which the operative text cites. That is the dangerous-omission shape: a permission compiled without the financial covenant, the lien basket, and the general debt basket it is subject to.

No dollar saving is claimed. The unit count is 1 of 7 sections on that fixture.

### C — Closure, reuse, and a disclosed omission list

`compareCompilationScopes` uses the structural index, `detectStructuralReferences` results, definition text from `getDefinitionFullText`, and Pass A only as evidence that the deterministic screen runs. It does not call a model.

On the same fixture, for seed `7.02`:

| scope | sections compiled | not compiled, and listed |
| --- | --- | --- |
| A | 1.01, 7.01, 7.02, 7.03, 7.04, 7.05, 7.06 | none |
| B | 7.02 | 1.01, 7.01, 7.03, 7.04, 7.05, 7.06 |
| C | 7.01, 7.02, 7.03, 7.04 | 1.01, 7.05, 7.06 |

Pass A produced 11 candidates. The index detected 8 definitions and 15 references. Closure followed resolved section references, including `7.03(b)`, `7.01`, and `7.04`, and added the parent section `7.03`. Unresolved edges on this fixture: 0. An ambiguous reference is not followed. An article reference is not expanded into every section of the article; it is recorded as `ARTICLE_NOT_EXPANDED`.

Definition text for Indebtedness, Lien, Payment Conditions, Leverage Ratio, Interest Coverage Ratio, and, through the definition body, Consolidated EBITDA is context. Section 1.01 is not a compilation unit. `Not A Defined Term` is reported missing. `advancesCertification` is false.

`7.05` and `7.06` restrict payments and investments. They stay in the package inventory and are disclosed as not examined for this debt question. That disclosure is the omission audit. It is not a claim that those sections are irrelevant to every question.

This fixture does not measure material-covenant recall, false permissions, or dollars. It measures whether the closure follows the cites the parser can already see, and whether the sections it does not follow remain visible.

Gibraltar’s 968 unresolved references mean the same closure on that agreement would be incomplete if it followed only resolved targets. Those unresolved edges have to be part of the answer. The 918 ambiguous duplicate labels, including contents lines, must not be chosen as the operative target. That part is already the operative-authority rule.

## Components

Reuse without a second index:

- `stage-structure.ts`, `clause-hierarchy.ts`, `structural-index.ts`
- `structural-definitions.ts`, `structural-references.ts`
- `discovery/pass-a-signals.ts`, Pass C parent inclusion, Pass D reconciliation
- amendment operative state and operative-source authentication
- `context-retrieval/region-expansion.ts` for bounded child text, with its existing disclosure of excluded children
- `semantic-coverage/` for package-level relationship and coverage gaps
- `evidence-engine/` for reuse, preflight, and hard spend authorization
- `compileCovenantToIR` and the verifier, called on the closure rather than on every eligible candidate

Change, when this decision is implemented later:

- The default compile set in `package-compile.ts` and `verify-gibraltar.ts`. Eligibility today is “every role except representation.” The default should become “closure of the question, plus disclosed Pass A prohibitions that mention the same action and were not reached.”
- Pass B output should be an inventory label used to choose candidates, not a reason to compile all 842 rows.

Do not retire yet:

- Pass B. Headline headings and Pass A signals do not assign families. The Chewy recall figures were produced with discovery, not instead of it. Removing Pass B needs an offline recall comparison this record does not contain.
- The semantic compiler and the verifier.
- The coverage router. Its own comment records that a missed region is not recoverable downstream.

Retire as the default path, not by deleting the code in this change:

- Broad compilation of every eligible discovered candidate, including contents listings and repeated discovery rows.
- Treating emitted rule count as coverage. The Article VII run’s 82 rules and the verification run’s 74 rules were unverified.

## Migration risks

- A covenant can restrict the asked action and cite nothing. Closure will not find it. The omission list has to include Pass A prohibitive signals outside the closure, or the hybrid repeats the failure mode of approach B.
- Gibraltar has 968 unresolved references. Following only resolved edges will under-close. The unresolved list is part of the result, not a log line.
- Duplicate labels are ambiguous. Picking one by length was the contents-line failure. Closure must refuse an ambiguous target.
- Definition bodies nest. The proof of concept walks known definition text. It does not interpret a definition that itself needs a model.
- Phase 3 certification gates compare full-population maps. Pointing the certified path at a question closure would change what “package certified” means. This decision does not change those gates.
- Cache reuse of an IR compiled for one question is valid for another question only when the source contract matches. The question id is not part of legal truth. The source hash is.

## Phase 3 compatibility

No algorithm version, certified config, or certification predicate changes in this record. `SAMPLE_DIAGNOSTIC` remains not certification. A closure result that lists not-examined sections is `REVIEW_REQUIRED` or an equivalent disclosed gap, not `CERTIFIED`.

## Proof of concept

`lib/contract-model/compiler/compilation-scope.ts`

`tests/contract-model/compiler/compilation-scope.test.ts`

The test is offline. It uses the existing xref fixture, the structural parser, Pass A, and the reference and definition indexes. It asserts the three populations above and re-reads the sealed Gibraltar counts without multiplying them into a cost.

`lib/contract-model/compiler/question-plan.ts` is a second offline proof of concept. It turns one compliance question into a dry-run plan: family cues, operative entries, the same closure, evidence-store reuse, and a refusal when the model has no rate card. A contents listing is not a planned dispatch. A discovery-labeled same-action section the closure does not reach is listed and not compiled. Any operative section left out keeps the plan at `REVIEW_REQUIRED`. A dollar amount in the question is stored as a parameter. `capacityComputed`, `permitsCapacity`, and `advancesCertification` stay false. `measuredBillingUsd` stays null.

That planner does not replace `package-compile.ts`. The production default is still every eligible discovered candidate except representations.

## Acceptance criteria for a later implementation

- The package inventory still lists every Pass A section and every unresolved reference.
- A question compilation includes explicit resolved targets and their parent prohibitions.
- Ambiguous and unresolved targets are disclosed and not guessed.
- Sections and Pass A prohibitions outside the closure are returned as not examined.
- A contents listing is not compiled.
- A required term with no definition is `missing`, not silently dropped.
- Previously verified IR is reused only on a matching evidence contract, and reuse does not certify.
- No paid call is added to the certified path by the wiring change.
- Recall against a labeled set is measured before Pass B is removed. That measurement does not exist yet.

## Cost implications

Measured:

- Gibraltar verification: 16 compilations, `$8.777854` settled, 0 verified rules, 788 prepared.
- Pass B: 140 calls, token counts retained, dollars unknown.
- Article VII: 6 compilations, `$1.079528` list price, 0 verified rules, `1,078,788` ms recorded wall clock.
- Offline Gibraltar structure: 2,087 nodes, 564 definitions, 1,459 references, 946 Pass A candidates, 0 model calls in that summary.

Not measured, and not claimed as savings:

- The difference between compiling 788 rows and compiling a closure.
- Any reduction from retiring Pass B.
- Gateway prompt-cache or batch discounts.

The only demonstrated cost fact is that broad compilation spent money on contents lines, repeated shards, and unverified rules, while the structural inventory of the same agreement was produced with no model call.

## Dangerous omissions

Approach B omits cited controlling sections. That is rejected as a design.

Approach C on the fixture keeps cited debt sections and discloses payment and investment sections. It does not prove those disclosed sections are immaterial. It proves they were not silently discarded.

Approach A’s omission mode is different: it fails open into truncated shards and then runs out of credit, so most of the inventory is never interpreted and the part that is interpreted is not verified. An exhaustive attempt that stops at 16 of 788 is not package coverage.

The hybrid’s omission rule is: broad inventory always, deep compilation on the closure, and an explicit list of everything the inventory knows and the closure did not compile.
