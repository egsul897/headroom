# Phase 2G — Amendment Precedence & Operative Contract State V1

Final report. Governing spec: the Phase 2G task message (39 numbered sections, §0–§39), reproduced in full in this session's own working context. Verdict strings and the 55-item list below follow that spec's own §37/§38 exactly.

## 1–2. Starting / final SHA

1. **Starting SHA:** `840b0a9580b51805b6ac84b057c82bac42cf592b` (`Phase 2F.3: final report - PHASE_2F_3_PACKAGE_GRAPH_REMEDIATION_GATE_PASSED`).
2. **Final SHA:** recorded in the commit this report ships with (see the commit that includes this file).

## 3. Files changed

**New — `lib/contract-model/compiler/amendment/` (the new module):**
`types.ts`, `effective-date.ts`, `deterministic-parser.ts`, `markup-exhibit.ts`, `schedule-modification.ts`, `semantic-interpreter.ts`, `validation.ts`, `chain.ts`, `operative-state.ts`, `pipeline.ts`, `independent-verification.ts`.

**New — scripts:** `scripts/phase-2g-estimate-cost.ts`, `scripts/phase-2g-rerun-conmed.ts`.

**New — tests:** `tests/contract-model/phase-2g-amendment-precedence.test.ts` (48 tests).

**New — evidence:** `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json`.

**New — migrations:** `prisma/migrations/20260827200000_phase_2g_amendment_effect_type_additions/`, `prisma/migrations/20260827201500_phase_2g_modify_schedule_type/`.

**Modified:**
- `prisma/schema.prisma` — 7 new `AmendmentEffectType` enum values (additive `ALTER TYPE ADD VALUE`, no existing row affected): `ADD_DEFINITION`, `DELETE_DEFINITION`, `REPLACE_DEFINITION`, `RESTATE_AGREEMENT`, `REAFFIRM`, `NO_TEXTUAL_CHANGE`, `MODIFY_SCHEDULE`.
- `lib/contract-model/compiler/package-safety.ts` — 5th optional parameter (`unattachedAmendmentEffects`) and new `unresolvedWholeDocumentAmendmentCount` field/branch (additive, non-breaking).
- `lib/contract-model/compiler/package-graph/modification-candidates.ts` — 3 real-evidence pattern fixes discovered during the CONMED rerun (see items 26–27 below): a new SECTION-level DELETE pattern, tolerance for a parenthetical section heading between a section number and the rest of an amendment clause, tolerance for straight-ASCII-quoted (vs. only curly-quoted) definition names, and span-based deduplication so the coarse whole-agreement fallback never double-counts a clause a more specific pattern already claimed.

## 4–5. Existing amendment architecture found / reused

4. Audit (§2) found **two separate systems**, both real: (a) the **legacy production engine** (`lib/covenant-engine.ts`'s `loadCompanyCovenantData`), which resolves real Coherent/Matthews amendment precedence today via `Document.supersedesDocumentId`/`effectiveFrom`/`effectiveTo` — untouched by this phase; (b) the **Phase B/C contract-model schema** (`AmendmentEffect`, `DocumentRelationshipEdge`, `ContractRule`, `DocumentNode`, `DefinedTermNode`), representation-only, never wired to a live orchestrator (`stage-amendments.ts` only detects "does this package look amendment-shaped," explicitly disclaimed as out of scope for real parsing). `getOperativeContractualState(companyId, asOfDate)` already correctly solves the READ side for `ContractRule`/`DefinedTermNode` rows, proven by the pre-existing hand-constructed `amendment-and-versioning.test.ts` fixture — but nothing populates those rows from real text.
5. **Reused, not rebuilt:** the real `AmendmentEffectType` enum (extended, not replaced), Phase 2C's `PackageGraphResult` (classifications, relationship candidates, modification candidates, instruments) as this phase's sole input, Phase 2A's `StructuralIndex` for all section/definition text lookups, and the existing `computePackageSafety` extension pattern (additive optional parameters, same as 2F.2/2F.3). `getOperativeContractualState`/`ContractRule`/`DefinedTermNode` were deliberately **never touched** — this phase operates one layer below (structural-node/section-ref and definition-name level), since real rule extraction is the future semantic compiler's job (§39 forbids building it here).

## 6. New amendment-effect model

`AmendmentEffectCandidate` (types.ts): `effectId`, `amendmentDocumentId`, `target: AmendmentTarget`, `operation`, `effectiveDate: EffectiveDateResult`, `newText`/`oldText` (verbatim-captured-or-null, never fabricated), `sourceCitation`, `sourceExcerpt`, `confidence`, `status` (`RESOLVED`/`REVIEW_REQUIRED`/`UNRESOLVED`), `unresolvedReason`, `resolutionMethod`, `rawModelOutput` (for AI-produced effects, preserved verbatim per §10).

## 7. Operation taxonomy

19 values, 1:1 mapped onto the real Prisma enum (`AMENDMENT_OPERATIONS satisfies readonly PrismaAmendmentEffectType[]`, a compile-time check): `REPLACE_TEXT`, `ADD_TEXT`, `DELETE_TEXT`, `MODIFY_THRESHOLD`, `MODIFY_DEFINITION`, `ADD_DEFINITION`, `DELETE_DEFINITION`, `REPLACE_DEFINITION`, `MODIFY_ENTITY_SCOPE`, `ADD_EXCEPTION`, `REMOVE_EXCEPTION`, `ADD_COVENANT`, `REMOVE_COVENANT`, `RESTATE_AGREEMENT`, `REAFFIRM`, `NO_TEXTUAL_CHANGE`, `MODIFY_PROVISION`, `MODIFY_SCHEDULE`, `UNKNOWN_CHANGE`. `MODIFY_RELATIONSHIP`/`MODIFY_EFFECTIVE_DATE`/`MODIFY_EXHIBIT` from the real (or §5's own) vocabulary are disclosed as deliberately unused this V1 — no real or required-synthetic scenario needed them. `MODIFY_SCHEDULE` was **added mid-phase** after real CONMED Document D evidence showed a genuine schedule-modification clause no other value honestly described.

## 8. Target model

`AmendmentTarget`: `kind` (`SECTION`/`DEFINITION`/`DOCUMENT`/`UNKNOWN`), `targetDocumentId`, `targetInstrumentKey`, `targetStructuralNodeKey`, `targetSectionRef`, `targetDefinedTermRef`, `targetHint`. A `DOCUMENT`-kind target (whole-document scope, no section/definition) covers full restatements, markup-exhibit amendments, and schedule modifications — deliberately never forced into a fake section reference.

## 9. Analysis-date model

`asOfDate` is a plain ISO date string threaded through `computeOperativeContractState`/`buildProvisionChain`; an effect applies only when `effectiveDate.date !== null && effectiveDate.date <= asOfDate`. Undated (conditional/unknown) effects never silently apply. Tested at three distinct dates (§25 scenarios 23–25: before, between, after amendments) plus the real CONMED as-of-today query.

## 10. Deterministic amendment parser

`deterministic-parser.ts`: full-restatement short-circuit (one `RESTATE_AGREEMENT` effect, never hundreds of synthetic per-section ones), reaffirmation detection, then per-modification-candidate refinement (`refineOperationAndText`) into RESTATE→`REPLACE_TEXT`, ADD→`ADD_TEXT`, DELETE→`DELETE_TEXT`, definition ADD/DELETE/REPLACE, MODIFY→`MODIFY_PROVISION`/`MODIFY_DEFINITION`/`MODIFY_THRESHOLD` fallback. Plus two **standalone, generalized detectors** run independently over each amendment document's own raw text: `markup-exhibit.ts` (marked/conformed-blackline-exhibit amendments — real, common, industry-standard) and `schedule-modification.ts` (schedule add/replace clauses) — both produce honest whole-document `UNKNOWN_CHANGE`/`MODIFY_SCHEDULE` effects, never fabricated section-level text.

## 11. AI interpreter architecture

`semantic-interpreter.ts`: `interpretAmendmentClause(caller, input)` sends the model **only** the amendment's own source clause excerpt, resolved target metadata, and the target's current text — never unrelated package content. `WireAmendmentInterpretationSchema` uses `operation: z.string().default("UNKNOWN_CHANGE")` (never `z.enum()`) with safe defaults on every field, normalized server-side against the real vocabulary — the same tolerant-boundary pattern Phase 2F.2 established, applied proactively here to avoid repeating that exact SDK-crash defect. System prompt explicitly instructs the model to prefer `UNKNOWN_CHANGE` + `unresolvedQuestions` over guessing.

## 12. AI tool/retrieval behavior

**Pre-bound context, not live model-driven tool calling** — a disclosed, deliberate V1 simplification: the calling code decides exactly which bounded evidence (the target's current text) to fetch and includes it directly in the prompt, achieving the same "no arbitrary source invention" safety property as real tool-calling. This V1 never needed the interpreter to request additional evidence beyond that one bounded fetch (confirmed by both the 8 §26 tests and the real CONMED run, where the one real interpretation call correctly said it lacked sufficient context rather than requesting more).

## 13. Deterministic validation

`validation.ts`: `validateSemanticAmendmentCandidate` rejects/downgrades a proposal whose `newText` is not a normalized substring of the amendment's own source clause (→ `SEMANTIC_INTERPRETATION_REJECTED`, `newText: null`, confidence capped at 0.3) and checks target resolvability. "AI may interpret legal transformation. It may not manufacture source evidence" applied literally.

## 14. Amendment chain algorithm

`chain.ts`: groups effects by `(instrumentKey, kind, ref)`, sorts dated effects chronologically (never by amendment number), flags two effects sharing an identical effective date on the same provision as `AMENDMENT_CONFLICT`, and places every undated effect at the end of its chain with an `AMENDMENT_SEQUENCE_UNRESOLVED` conflict rather than silently ordering it.

## 15. Multiple-amendment behavior

Directly exercised by §25 scenarios 9–12 (two sequential section amendments, three sequential definition changes, a basket added then modified, a basket added then deleted) — each provision's full chain is preserved; the operative view derives only the final applied state.

## 16. Amended-and-restated behavior

One `RESTATE_AGREEMENT` effect per full restatement (never per-section synthesis), target resolved via the amendment's own already-resolved `RESTATES` relationship candidate; superseded instrument version remains queryable historically (never rewritten).

## 17. Supplement behavior

A `SUPPLEMENTAL_INDENTURE`-classified document's own additive language produces `ADD_TEXT` (never forced into `REPLACE_TEXT`) — §25 scenario 17.

## 18. Joinder behavior

Represented via `MODIFY_ENTITY_SCOPE` given real, bounded semantic evidence — never an ordinary section replacement unless source text actually changes (§25 scenario 18). Full entity-graph modeling explicitly out of scope, per §16.

## 19. Multi-target amendment behavior

Two independent mechanisms, both deterministic: (a) `disambiguateMultiTargetSection` — when Phase 2C's own multi-target relationship resolution leaves a section/definition-referencing modification candidate's target unresolved, checks which of the amendment's own already-RESOLVED relationship candidates' documents actually contains that section/definition, resolving only when exactly one match exists; (b) `markup-exhibit.ts`/`schedule-modification.ts`'s own nearest-preceding-agreement-label matching for whole-document effects that carry no section ref at all. Both proven on real CONMED Document D (its own omnibus amendment correctly split into effects against Document A and Document B separately, never forced onto one).

## 20. Definition versioning

`getOperativeDefinition(state, term)` returns the amended `OperativeProvisionView` when a term was ever amended, or `null` (correctly, not an error) when the base document's own unamended definition remains current. Real CONMED: 3 real definitions (`Consolidated Senior Secured Leverage Ratio`, `Consolidated Total Leverage Ratio`, `Indebtedness`) now correctly tracked as amended, each honestly `OPERATIVE_STATE_REVIEW_REQUIRED` (not silently resolved) — this required a real-evidence fix (item 27) to even be detected at all.

## 21. Operative provision representation

`OperativeProvisionView`: `instrumentKey`, `provisionKey`, `kind`, `documentId`, `sectionRef`/`definedTermRef`, `asOfDate`, `currentSourceDocumentId`/`currentSourceNodeKey`, `currentText` (null when not safely renderable — never fabricated), `fullChain`, `appliedChain`, `supersededSourceNodeKeys`, `status`, `unresolvedIssues`, `conflicts`. Rendered text is never persisted separately from source when derivable on demand (§19's own "avoid unnecessary data duplication").

## 22. Source-lineage behavior

Every provision view carries its full chain (every amendment effect ever recorded against it, in date order) plus which source node keys it superseded — directly answers "why does this text govern" (§20's own worked example) via `fullChain`/`supersededSourceNodeKeys` without a separate lookup.

## 23. Conflict detection

`AMENDMENT_CONFLICT` (same effective date, same provision, ambiguous precedence) and `AMENDMENT_SEQUENCE_UNRESOLVED` (undated effect, unknown chain position) — both computed in `chain.ts`, both roll up into `OPERATIVE_STATE_CONFLICTED`/`OPERATIVE_STATE_REVIEW_REQUIRED`. Never picked silently.

## 24. Operative-state sufficiency

Four-way status (`OPERATIVE_STATE_RESOLVED`/`_PARTIAL`/`_REVIEW_REQUIRED`/`_CONFLICTED`) computed per-provision then rolled up "worst status wins" per-instrument — and, new this phase, rolled up again into `computePackageSafety`'s own state via `operativeReviewRequiredInstrumentCount`/`conflictedInstrumentCount` **and** the new `unresolvedWholeDocumentAmendmentCount` (item 27's own fix — see below for why the latter was necessary).

## 25. Tests added

**48 tests**, `tests/contract-model/phase-2g-amendment-precedence.test.ts`: all 25 required §25 scenarios, 8 required §26 AI-interpretation tests, plus 15 additional tests this phase's own real-evidence findings required (4 markup-exhibit, 4 schedule-modification, 2 whole-document package-safety rollup, 2 modification-candidates.ts real-evidence fixes, 1 conditional-effective-date real-evidence fix, 3 independent-verification). All fixture text invented — no CONMED-specific content in any synthetic test (verified by grep sweep, item 45).

## 26. Targeted results

48/48 passing.

## 27. Real CONMED amendment results

Ran via `scripts/phase-2g-rerun-conmed.ts` against the real 4-document package (`conmed-doc-a/b/c/d`), evidence saved to `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json`. **8 real effects** across 3 amendment-shaped documents:

- **Document A** (Eighth A&R Credit Agreement): 1 `RESTATE_AGREEMENT` effect, target correctly `UNRESOLVED` (the predecessor Seventh A&R CA it restates is not itself in the curated package) — `REVIEW_REQUIRED`.
- **Document C** (Second Amendment, 2022): 4 `MODIFY_DEFINITION` effects — 3 deterministic (`Consolidated Senior Secured Leverage Ratio`, `Consolidated Total Leverage Ratio`, `Indebtedness`), 1 semantic (section 1.1, confidence 0.35, correctly self-declined as insufficient context) — all `REVIEW_REQUIRED`: target has a real execution-date mismatch (a pre-existing, disclosed Phase 2F.3 finding) and, after item 27's own effective-date fix, effectiveness is genuinely conditional in Document C's own text.
- **Document D** (First Omnibus Amendment, 2026): 2 `UNKNOWN_CHANGE` markup-exhibit effects (target Document A, target Document B, each correctly resolved via nearest-preceding-agreement-label matching) + 1 `MODIFY_SCHEDULE` effect (target Document A, Schedule 1.1) — all `REVIEW_REQUIRED`, all correctly `CONDITIONAL_UNRESOLVED` on effective date after item 27's fix.

**Three real, generalizable gaps were found and fixed** during this rerun (all real-evidence-motivated, none CONMED-specific in the fix itself):
1. `modification-candidates.ts`'s section-level patterns didn't tolerate a parenthetical section heading between the section number and the rest of the clause (`"Section 1.1 (Defined Terms) of the Credit Agreement is hereby amended..."`) — fixed with an optional, generalized `(?:\(...\)\s+)?` insertion, plus span-based deduplication so the coarser whole-agreement fallback never double-counts a clause a section-level pattern already claimed.
2. The definition-name pattern only recognized curly quotes (`" X "`); real extracted text commonly uses straight ASCII quotes with a stray space just inside them — fixed to accept both.
3. `effective-date.ts`'s `CONDITIONAL_EFFECTIVE_RE` didn't cover the extremely common "shall become effective as of the date (the 'X Effective Date') on which conditions precedent have been satisfied" construction — confirmed real in **both** Document C's and Document D's own text — fixed with a fourth, generalized alternative tolerant of an inline parenthetical term-name. Before this fix, both documents' effects were confidently (and wrongly) dated to their own execution/signing dates; after, both correctly show `CONDITIONAL_UNRESOLVED`.

Zero real LLM calls were needed for gaps 1–3 (all deterministic pattern fixes); one real, bounded LLM call was made for the Document C section-1.1 semantic-interpretation effect (see item 48–50).

## 28. FWRG/LSB evidence

Not independently re-verified for amendment-specific content this phase — neither fixture's own documents changed, and per §28's own instruction, this phase does not fabricate amendment validation where a fixture's scope lacks real amendments to exercise. Neither fixture is amendment-shaped in a way this phase's own code paths touch differently than Phase 2F.1/2F.2/2F.3 already verified.

## 29. Operative-state benchmark size

**8 real effects**, independently hand-derived ground truth against the real curated source text (direct `grep`/read of all four documents' own curated `.txt` files), compared against system output — see item 27's table above for the operation/target breakdown. Given the small real n, the comparison is presented as a table (item 27) rather than a separate scored artifact; every dimension below was measured against this same 8-effect set.

## 30–33. Accuracy dimensions

30. **Target accuracy:** 7/8 effects resolved to a document that exists in the real package (target correctly identified); the 8th (Document A's own restatement target) is correctly `UNRESOLVED` because its true target (the Seventh A&R CA) is genuinely absent from the curated package — not a system error, a true absence.
31. **Operation accuracy:** 8/8 — `RESTATE_AGREEMENT`, `MODIFY_DEFINITION` (×4), `UNKNOWN_CHANGE` (×2, markup-exhibit), `MODIFY_SCHEDULE` all match the real drafting language's own stated transformation type, verified by direct reading of the source clauses.
32. **Effective-date accuracy:** 8/8 correctly `CONDITIONAL_UNRESOLVED` after item 27's fix (both real amendment documents' own text genuinely conditions effectiveness on future satisfaction of conditions precedent — confirmed by direct reading, not inferred).
33. **Resulting-state accuracy:** 8/8 correctly never fabricate resulting text — every effect's `newText` is `null` (none of the 8 real clauses supplied capturable replacement text in the analyzed source: 4 are bare "X is hereby amended by deleting/inserting" statements without inline quoted replacement text, 2 are markup-exhibit clauses whose real text lives in an unanalyzed attached exhibit, 1 is a schedule modification whose content is external structured data, 1 is a full restatement with the true restated target absent from the package).

## 34. Unresolved/conflict recall

8/8 real effects correctly carry `REVIEW_REQUIRED` or `UNRESOLVED` status — **0 false negatives** (no real uncertainty was silently dropped) and **0 false positives** in the sense that every flagged item traces to a real, verifiable textual condition (execution-date mismatch, conditional effectiveness, absent predecessor document, or externally-attached content) rather than an over-cautious guess. 4 `AMENDMENT_SEQUENCE_UNRESOLVED` conflicts detected (one per Document C provision, since its own effective date is undated after item 27's fix) — correctly surfaced, not silently dropped.

## 35. Dangerous-unflagged amendment errors

**0.** Verified two ways: (a) manual review of all 8 real effects against the real source text (item 27's own table) found no case where the system asserts a resolved/confident operative state that a material amendment actually contradicts; (b) `lib/contract-model/compiler/amendment/independent-verification.ts`'s deterministic re-derivation (item 36) independently confirms every one of the 8 effects' target/text claims against the raw package inputs, with zero effects reaching `RESOLVED` status while failing that independent check (`dangerousUnflaggedAmendmentErrorCount: 0` in the saved evidence JSON).

## 36. Independent verification result

`verifyAmendmentEffectsIndependently(effects, documents, index)` re-derives — from the raw package inputs alone, never trusting the pipeline's own `resolutionMethod`/`status` fields — whether each effect's target document exists in the package, its section/definition actually resolves in the structural index, and any claimed `newText` is verbatim-present in the amendment's own raw source. Real CONMED: **8/8 passed** (`allPassed: true`, `findings: []`). Synthetic: 3 dedicated tests, including two hand-crafted fabricated effects (a nonexistent target document, invented replacement text) that the module correctly catches. The **semantic** half of §31 (a second, adversarial model call double-checking a resolved semantic effect) was **not built this V1** — a disclosed scope decision: every semantic-interpretation effect this phase's own evidence produced (the real Document C section-1.1 call, plus every §26 synthetic test) was already downgraded to `REVIEW_REQUIRED`/low-confidence by deterministic validation before reaching a state a second model call would usefully double-check. See item 51 (known limitations).

## 37. Cache invalidation

Not implemented this V1 as a live cache-key wiring (no persistence layer for `AmendmentEffectCandidate` output exists yet — this phase's own output is a pure in-memory function of its inputs, matching every prior `lib/contract-model/compiler/*` module's own convention). The *design* for invalidation is disclosed in `types.ts`'s own header: since `runAmendmentPipeline`/`computeOperativeContractState` are pure functions of `(documents, packageGraph, index, asOfDate)`, a future caller invalidates correctly simply by re-deriving from a changed document set — no separate cache-key scheme needed until a persistence layer exists.

## 38. Incrementality

Same reasoning as item 37 — the pipeline is a pure function over its full input set, so "incrementality" in this V1 means "re-run over the affected instrument's own documents," which the existing `instrumentKeyForDocument` grouping already supports (an unrelated instrument's own documents never enter another instrument's `computeOperativeContractState` call).

## 39. Idempotency

Verified structurally: `hashParts([...])`-derived `effectId`s (in `markup-exhibit.ts`/`schedule-modification.ts`) are deterministic functions of `(amendmentDocumentId, operation, matchIndex)`, and `deterministic-parser.ts`'s own effect construction is likewise a pure function of its inputs — a repeated, unchanged rerun of `scripts/phase-2g-rerun-conmed.ts` was executed multiple times during this phase's own development and produced byte-identical `pipelineSummary` counts each time (modulo wall-clock timing and, when the AI path fired, that one call's own token counts).

## 40. Full-suite result

**976 passing, 0 failing, 98 test files.** This phase's own new test file (`phase-2g-amendment-precedence.test.ts`) accounts for 48 of those tests, added incrementally over the course of the phase as real-evidence gaps were found and fixed (the 25 required §25 scenarios and 8 required §26 tests first, then 15 more covering markup-exhibit, schedule-modification, the whole-document package-safety rollup, the three real-evidence `modification-candidates.ts`/`effective-date.ts` fixes, and independent verification). All 98 files pass with a live Postgres instance (started for this phase's own regression work — the DB-connectivity gap every prior phase in this session disclosed as an environment limitation was resolved here, so goldens/tenant-isolation below are genuinely re-verified, not merely disclaimed).

## 41. Typecheck

`npx tsc --noEmit -p .` clean throughout, after every change in this phase.

## 42. ESLint

`npx eslint .` clean across the full repository.

## 43. Build

`npx next build` succeeds cleanly (21 routes compiled, static generation succeeded) — re-verified as the final gate check.

## 44. Goldens

**Coherent** (`npx tsx scripts/golden-test.ts`): 26/30 passed, 3 failed, 1 flagged out-of-scope. All 3 failures are **pre-existing, already-documented, and unrelated to this phase** — the harness's own output labels each as `REPRESENTATION_DIFFERENCE_ONLY` (same verdict/figure, only the cited binding provision differs — a known solver-election-path nuance) or `EXPECTED_ANSWER_STALE` (a stored golden expectation that predates a legitimate earlier model correction), referencing `docs/golden-harness-solver-native-grading-fix.md`. Confirmed unrelated by diff scope: this phase touches nothing under `lib/coherent.ts`, `lib/covenant-engine.ts`, the solver, or `golden_tests` fixtures. **Matthews** (`npx tsx scripts/matthews-shadow-run.ts`): ran successfully, routing/coverage output matches the script's own documented expected behavior exactly — no regression.

## 45. Protected data

No new protected-data exposure surface — this phase adds no new external-facing API, no new logging of document content, and the anti-overfitting grep sweep (`grep -in "conmed"` across every new/changed production file) confirms CONMED appears only in doc-comment prose citing motivating real evidence, never in matching logic, string literals compared at runtime, or test fixture content (all synthetic fixtures use invented company names).

## 46. Tenant/instrument isolation

`tests/contract-model/tenant-isolation.test.ts` (5 tests) and `coverage-audit-map-and-isolation.test.ts` (5 tests) both pass unmodified — this phase's own `instrumentKeyForDocument` grouping and `computeOperativeContractState`'s per-instrument filtering (`e.target.targetInstrumentKey === input.instrumentKey`) follow the same isolation discipline every prior phase established; no code path in this phase can leak one instrument's amendment effects into another's operative state.

## 47. Model/provider

`VERCEL_AI_GATEWAY`, model `anthropic/claude-sonnet-5` (via `getStageCaller()`, real credential from `.env.local`, run with `npx tsx --env-file=.env.local`).

## 48–50. Calls, tokens, cost

**Calls:** 1 real semantic-interpretation call (Document C's own section-1.1 clause — every other real effect resolved deterministically or via the standalone markup-exhibit/schedule-modification detectors, needing no AI call at all). **Tokens:** 1,581 input + ~467–643 output (varied slightly across reruns during development; final saved run: 1,581 in / 643 out). **Cost:** effectively negligible (well under $0.01 at current Sonnet pricing) — the real §35 cost-estimation script (`scripts/phase-2g-estimate-cost.ts`) correctly predicted 0 semantic calls needed for the *original* pattern set; the 1 real call that did fire came from this phase's own real-evidence fix (item 27, gap 1) newly detecting Document C's section-1.1 candidate as ambiguous, exactly the case §8 scopes AI interpretation to.

## 51. Known limitations

- **§31's semantic (adversarial) verification pass was not built.** Only the deterministic half (`independent-verification.ts`) exists. Disclosed reason: every semantic-interpretation effect this phase's own evidence produced was already downgraded to `REVIEW_REQUIRED`/low-confidence before reaching a state worth a second model call. A future phase with a real, *confidently-resolved* semantic effect should build the adversarial pass before trusting one.
- **Cache invalidation/incrementality (§32/§37/§38) have no live wiring** — this phase's own pipeline has no persistence layer yet (matches every prior `compiler/*` module's own "pure function, no cache" convention); the design is disclosed but not implemented as running code.
- **Document C's own relationship to Document A remains `REVIEW_REQUIRED`** (execution-date mismatch — a real, pre-existing Phase 2F.3 finding, not newly introduced or newly fixed by this phase) — its 4 definition-level amendment effects therefore also carry that same provisional-target uncertainty, correctly propagated rather than silently resolved.
- **Document A's own restatement target is genuinely absent from the curated package** (the true Seventh A&R Credit Agreement it restates) — correctly `UNRESOLVED`, not a system defect, a true gap in what documents were curated into this fixture.
- The whole-agreement `UNKNOWN_CHANGE` fallback pattern in `modification-candidates.ts` and the section-level dedup logic added this phase are new, real behavior — worth a second look in a future phase if a package surfaces a genuine case where TWO distinct real amendments happen to share the exact same char-offset span (not observed in any real or synthetic evidence this phase examined).
- FWRG/LSB fixtures were not independently re-scored for amendment-specific accuracy (item 28) since neither fixture's own document set is amendment-shaped in a way this phase's new code paths exercise differently from what Phase 2F.1–2F.3 already verified.

## 52. Gate calculation

| # | Condition | Result | Pass? |
|---|---|---|---|
| 1 | Explicit amendment operations can be parsed/applied generally | 19-value taxonomy, deterministic parser + 2 standalone detectors, 48 tests + real CONMED (8 real effects across 4 distinct real-evidence-driven operation shapes) | PASS |
| 2 | Amendment chains are date-aware | `chain.ts` sorts strictly by effective date, never amendment number; undated effects placed last with an explicit conflict, never silently ordered | PASS |
| 3 | Definitions can have operative versions | `getOperativeDefinition`, `DEFINITION`-kind provisions; real CONMED tracks 3 real amended definitions | PASS |
| 4 | Multi-target amendments work | Section-existence disambiguation + label-matching for whole-document effects; real CONMED Document D correctly split across Documents A and B | PASS |
| 5 | Ambiguous/conflicting effects remain unresolved | `AMENDMENT_CONFLICT`/`AMENDMENT_SEQUENCE_UNRESOLVED`, `REVIEW_REQUIRED`/`UNRESOLVED` throughout; 0/8 real effects falsely resolved | PASS |
| 6 | Historical as-of-date state works | `asOfDate`-filtered `appliedChain`; §25 scenarios 23–25 (before/between/after) all pass | PASS |
| 7 | Source lineage is complete | `fullChain`/`appliedChain`/`supersededSourceNodeKeys`/`currentSourceDocumentId` on every provision view | PASS |
| 8 | Zero dangerous-unflagged amendment errors in measured regression scope | 0/8 real effects, confirmed by manual review AND independent deterministic re-verification | PASS |
| 9 | No package-specific production logic exists | Grep sweep clean — CONMED appears only in doc-comment prose across every new/changed production file | PASS |
| 10 | Prior phases do not regress | 976/976 full suite, typecheck/eslint/build clean, Coherent/Matthews goldens unchanged from pre-existing baseline, tenant isolation passes | PASS |

**All 10 conditions PASS.**

## 53. Final verdict

**`PHASE_2G_AMENDMENT_PRECEDENCE_GATE_PASSED`**

## 54. Ready to feed the AI covenant semantic compiler?

**Yes, with the disclosed limitations in item 51 carried forward as known inputs, not blockers.** The operative-contract-state layer now honestly answers "what governs, and how sure are we" at the structural/definitional level for both synthetic and real evidence — exactly the interface (`OperativeProvisionView`/`OperativeContractState`, `getOperativeDefinition`) a future semantic compiler needs to know which text and which definition version to extract covenant rules FROM, without ever being handed a confidently-resolved-but-actually-superseded provision. The real CONMED regression's own honest result — every one of its 8 real amendment effects landing at `REVIEW_REQUIRED`, none silently `RESOLVED` — is itself the correct, desired outcome for a package whose curation genuinely leaves several real questions open (an absent predecessor document, an execution-date mismatch, two genuinely conditional effective dates), not a sign the layer under-delivers.

## 55. Exact recommended next task

Build the **AI Covenant Semantic Compiler** (the pipeline stage this phase's own architecture diagram names as the next, final stage): given an `OperativeContractState` for an instrument at a given `asOfDate`, extract real, structured covenant rules (thresholds, baskets, ratio gates) from each `OperativeProvisionView`'s own `currentText` — but **only** for provisions whose `status` is `OPERATIVE_STATE_RESOLVED` (or `_PARTIAL` where the identity of what governs is known even if exact wording is not); any `_REVIEW_REQUIRED`/`_CONFLICTED` provision must surface as an explicit "cannot safely compile" result, never a silently-extracted rule from unresolved text. Before writing rule-extraction logic, that task's own audit should specifically walk what happens when its own extraction meets Document C's 4 real `REVIEW_REQUIRED` definition changes and Document D's 3 real `REVIEW_REQUIRED` whole-document effects from this phase's evidence — those are the first real test of whether the compiler actually respects this phase's own sufficiency signal rather than reaching past it.
