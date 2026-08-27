# Phase 2C — Multi-Document Debt Package Graph V1: Final Report

**Central question this phase answers:** can Headroom take many related debt
documents and deterministically or safely determine what each document is,
which instrument it belongs to, and how the documents relate, so that a
later retrieval system knows where to look for the complete covenant
picture? **Answer: yes, at V1 scope, with real evidence below** — every
required synthetic scenario (including the deliberately ambiguous one)
resolves or correctly stays unresolved from deterministic signals alone,
zero paid model calls were needed, and a real, previously-unused SEC
exhibit from the LSB unseen package confirmed the same behavior against
real filed text (with one honest gap found and fixed, and one honest gap
disclosed as unvalidatable by the fixtures on hand).

**Starting SHA:** `fe2f9b8887ec6b58c1f2141a1ea625daf6ffd763` (Phase 2B complete)
**Final SHA:** (see final commit below)

## 3–6. Repository audit + architecture reused/changed

Read before writing any code: `prisma/schema.prisma` in full, `lib/contract-model/compiler/{stage-relationships,stage-amendments,orchestrator,types,structural-index,structural-references,persistence}.ts`, `lib/contract-model/service.ts`, `lib/contract-model/validators.ts`, `lib/covenant-engine.ts`'s own `DocumentType`, `lib/onboarding/documents.ts`, and the two existing hand-authored multi-document test fixtures (`tests/contract-model/cross-document-graph.test.ts`, `tests/contract-model/amendment-and-versioning.test.ts`).

**Found, and reused unchanged:**
- `Document.type: DocumentType`, `Document.supersedesDocumentId`/`effectiveFrom`/`effectiveTo` (the legacy engine's own amendment-precedence mechanism), `Document.typeConfirmedByUser`/`amendmentRelationshipConfirmedByUser` (exactly the gate this phase's classifier needed for "never overwrite a human-confirmed type").
- `DocumentRelationshipEdge` (already had `relationshipType: DocumentRelationshipType` with AMENDS/RESTATES/SUPPLEMENTS/SUPERSEDES/GOVERNS/SECURES/GUARANTEES/INTERCREDITOR_WITH/etc, `sourceCitation`/`confidence`/`reviewStatus`) and `AmendmentEffect` (already had `effectType: AmendmentEffectType` with REPLACE_TEXT/ADD_TEXT/DELETE_TEXT/MODIFY_THRESHOLD/MODIFY_DEFINITION/etc, `targetRuleId`/`targetTermId`/`targetDocumentNodeId`, `oldValueSnapshot`/`newValueSnapshot`) — both built in an earlier "Phase B" effort, both real and well-designed, **both never populated by any autonomous detection logic** — the only rows that ever existed were hand-authored in the two test fixtures above. `stage-amendments.ts`'s own docstring says exactly this: "representable once identified, no autonomous amendment parsing yet (that is Phase C)."
- `ContractReferenceEdge`'s `resolved: Boolean` + `unresolvedReason: String?` pattern (used as the direct template for this phase's own new resolution-status fields).
- `StructuralIndex` (Phase 2A) — already fully multi-document-capable (`Map<documentId, {...}>`, `nodeKey = documentId::sectionRef`) — no changes needed to use it across a whole package.
- `ContractCompilerRun`/`ContractCompilerRunDocument` (`{companyId, packageKey, documents}`) — this **is** the existing "Debt Package" concept (task §7's own "Company → Debt Package → ..."); no second persisted package concept was created.
- `lib/contract-model/service.ts` — the project's one established read-API surface; the 10 new DB-backed package-graph queries were added here, not a new file.
- `computeStableKey`, the `findFirst`-then-`create`/`update` idempotent-write pattern from `lib/contract-model/compiler/persistence.ts`.

**Found, and genuinely missing (this phase's real work):**
- No document-classification logic anywhere (`Document.type` is set once at upload/seed time, never inferred).
- `stage-relationships.ts` only relates already-extracted **rules** to each other within one package — it never builds a `DocumentRelationshipEdge`.
- `stage-amendments.ts` only flags "does this package contain an amendment-shaped document" by a bare regex on the title/first 2000 chars — it never identifies a target, a modification kind, or resolves anything.
- No `DebtInstrument`/instrument-grouping concept existed at all (`Facility` is a *financial-facts* model in a different layer, linked to a document only by a free, non-FK `governingDocumentId` string — not the document-graph grouping task §7 asks for).
- `DocumentRelationshipEdge.targetDocumentId` was a **required** (non-nullable) FK — meaning an unresolved-target relationship could not have been persisted at all before this phase (task §14's "a missing edge is safer than a wrong one" was structurally unsupported).
- `AmendmentEffect` had no `targetDocumentId` field at all (only same-company `targetRuleId`/`targetTermId`/`targetDocumentNodeId`), so a cross-document amendment target could never be represented, and no raw-text fallback existed for a target section/term that could not be resolved to a real row.
- Phase 2A's own cross-reference detection (`structural-references.ts`) is deliberately same-document-only; nothing anywhere recognized a *named-agreement* mention ("the Indenture", "as defined in the First Lien Credit Agreement").

**Conclusion:** the schema foundation was strong and was reused as-is wherever it fit; this phase's job was building the missing **autonomous detection/resolution layer** that populates it, plus closing three small, genuine, additive schema gaps that made honest unresolved-target representation impossible before now.

## 7. Files changed

New:
- `lib/contract-model/compiler/package-graph/types.ts`
- `lib/contract-model/compiler/package-graph/document-classifier.ts`
- `lib/contract-model/compiler/package-graph/document-identity.ts`
- `lib/contract-model/compiler/package-graph/modification-candidates.ts`
- `lib/contract-model/compiler/package-graph/cross-document-references.ts`
- `lib/contract-model/compiler/package-graph/relationship-resolution.ts`
- `lib/contract-model/compiler/package-graph/instrument-grouping.ts`
- `lib/contract-model/compiler/package-graph/covenant-association.ts`
- `lib/contract-model/compiler/package-graph/pipeline.ts`
- `lib/contract-model/compiler/package-graph/persistence.ts`
- `tests/contract-model/package-graph-pipeline.test.ts` (22 tests)
- `tests/contract-model/package-graph-persistence.test.ts` (8 tests)
- `tests/contract-model/package-graph-real-evidence.test.ts` (4 tests)
- `prisma/migrations/20260827035656_phase_2c_debt_package_graph/`
- `prisma/migrations/20260827040658_phase_2c_relationship_type_additions/`
- `docs/phase-2c-debt-package-graph.md` (this report)

Modified:
- `prisma/schema.prisma` — see §7/§8 below for the exact schema additions.
- `lib/contract-model/service.ts` — 10 new package-graph query functions appended.
- `lib/contract-model/validators.ts` — `validateTenantIsolation` extended to check `DocumentRelationshipEdge`/`AmendmentEffect` for cross-company leaks (the two new tenant-scoped surfaces this phase adds).
- `lib/covenant-engine.ts` — `DocumentType` type-only widened with the 9 new enum members (identical pattern to the widening this same file already needed in Phase 2B for the discovery-related enum additions).
- `lib/onboarding/documents.ts` — `UploadDocumentParams.declaredType` changed from a hand-duplicated 6-value union to importing the real Prisma `DocumentType`, so it doesn't need a fourth manual update the next time this enum grows.
- `tests/contract-model/tenant-isolation.test.ts` — one new test proving the extended tenant-isolation check.

No production runtime files (API routes, UI, the legacy `covenant-engine.ts`'s own calculation logic, the solver) were touched beyond the type-only widening above.

## Schema additions (exact)

- `DocumentType` += `AMENDED_AND_RESTATED_AGREEMENT`, `SUPPLEMENTAL_INDENTURE`, `JOINDER`, `SECURITY_AGREEMENT`, `GUARANTEE`, `SIDE_LETTER`, `FEE_LETTER`, `OTHER_DEBT_DOCUMENT`, `UNKNOWN` (task §4's exact required list).
- `DocumentRelationshipType` += `JOINS`, `CERTIFIES_COMPLIANCE_WITH` — the only two of task §6's conceptual list with no adequate existing member; every other requested concept reuses a real existing value (`AMENDS_AND_RESTATES`→`RESTATES`, `INTERCREDITOR_RELATIONSHIP`→`INTERCREDITOR_WITH`, `REFERENCES`/`RELATED_TO`→`INCORPORATES_BY_REFERENCE`, `SUPERSEDES_CANDIDATE`→`SUPERSEDES` with the "_CANDIDATE" distinction expressed by this phase's own new `resolved`/`reviewStatus` fields instead of a second enum value).
- `AmendmentEffectType` += `MODIFY_PROVISION` (a detected-but-not-yet-fine-classified modification), `UNKNOWN_CHANGE` (task §9's exact vocabulary, mapped onto the existing enum: REPLACE/RESTATE→`REPLACE_TEXT`, ADD→`ADD_TEXT`, DELETE→`DELETE_TEXT`, MODIFY→`MODIFY_PROVISION`, UNKNOWN_CHANGE→`UNKNOWN_CHANGE`).
- New model **`DebtInstrument`** (`id, companyId, name, instrumentType: FacilityType?, baseDocumentId, confidence, reviewStatus, notes`) + `Document.instrumentId: String?` (nullable — a cross-cutting document like an Intercreditor Agreement or Guarantee is deliberately never forced into one instrument's membership; it relates to instrument(s) via its own `DocumentRelationshipEdge` rows instead, which can point at more than one instrument's member documents where a single FK could not).
- `DocumentRelationshipEdge.targetDocumentId` changed from required to **nullable**, plus new `targetHint: String?`, `resolved: Boolean @default(true)`, `unresolvedReason: String?`, `resolutionMethod: String?` — mirrors `ContractReferenceEdge`'s own established resolved/unresolved pattern.
- `AmendmentEffect` += `targetDocumentId: String?` (previously entirely absent — a cross-document amendment target could not be represented at all), `targetSectionRef: String?`, `targetDefinedTermRef: String?` (raw-text fallbacks preserved even when the corresponding FK can't be resolved), `resolved`, `unresolvedReason`, `resolutionMethod` (same pattern).

All changes are additive (`ALTER TYPE ... ADD VALUE`, new nullable columns, one relaxed `NOT NULL` constraint, one new table) — verified via the generated `migration.sql` for both migrations: no `DROP`, no data-loss, no non-additive `ALTER`. Applied cleanly to the real dev database; the full 668-test baseline (pre-existing suite) still passed immediately after, before any new code was written.

## 8. Document classification model

`document-classifier.ts` — cheap-signal-first (task §8): regex over the document's own title/first 3000 chars only (a real financing document always states what it is in its preamble), most-specific-first ordering (e.g. `AMENDED_AND_RESTATED_AGREEMENT` checked before plain `CREDIT_AGREEMENT` so "Amended and Restated Credit Agreement" is never misclassified). Returns `UNKNOWN` with zero evidence, never a forced guess, when no pattern matches — verified directly by both a synthetic test ("a short letter about scheduling a call") and a **real** one (the LSB Credit Agreement excerpt, which has no title page in its curated scope, correctly returns `UNKNOWN`). A declared type that agrees with the deterministic evidence raises `resolutionMethod` to `DETERMINISTIC_DECLARED_TYPE_CONFIRMED` (confidence 0.98) rather than the base `DETERMINISTIC_TITLE_PATTERN` (confidence 0.9).

## 9. Instrument-grouping model

`Company → Debt Package → Debt Instrument → Documents`, exactly task §7's own hierarchy: "Debt Package" = the existing `ContractCompilerRun.packageKey` + member-document set (not reinvented); "Debt Instrument" = the new `DebtInstrument` model. `instrument-grouping.ts` unions documents via a plain union-find over **RESOLVED** `AMENDS`/`RESTATES`/`SUPPLEMENTS`/`JOINS` edges only (never `REVIEW_REQUIRED`/`UNRESOLVED` ones — an uncertain edge never merges two instruments). Cross-cutting document types (`INTERCREDITOR_AGREEMENT`/`GUARANTEE`/`SECURITY_AGREEMENT`/`COMPLIANCE_CERTIFICATE`/`SIDE_LETTER`/`FEE_LETTER`) are excluded from instrument membership entirely and relate to instrument(s) only via their own edges — deliberately supporting the real case (confirmed by the real LSB Joinder evidence) where one such document can concern more than one instrument. The base document within a resolved cluster is the one no in-cluster edge points away from as a source.

## 10. Relationship model

`relationship-resolution.ts` (task §6/§9/§12/§14). Deterministic-only V1 (see §15/cost section below): a source document's own classification determines its relationship-type "verb" (`AMENDMENT`→`AMENDS`, `AMENDED_AND_RESTATED_AGREEMENT`→`RESTATES`, `SUPPLEMENTAL_INDENTURE`→`SUPPLEMENTS`, `JOINDER`→`JOINS`, `COMPLIANCE_CERTIFICATE`→`CERTIFIES_COMPLIANCE_WITH`, `INTERCREDITOR_AGREEMENT`→`INTERCREDITOR_WITH`, `GUARANTEE`→`GUARANTEES`, `SECURITY_AGREEMENT`→`SECURES`); the *target* is resolved by scanning the source document's own text for an explicit "the/that certain `<Agreement type>` dated as of `<date>`" self-reference and matching it against the other package documents' own type + execution date. A **type match is required**; an additional **date match** promotes the edge from `REVIEW_REQUIRED` (0.55 confidence) to `RESOLVED` (0.95 confidence); zero or more-than-one candidate after both signals is always `UNRESOLVED`, never guessed (confirmed directly by the deliberately-ambiguous Package D test: two Credit Agreements sharing an identical execution date).

## 11. Modification-candidate model

`modification-candidates.ts` implements task §9's own example patterns as real regexes ("Section X is hereby amended and restated", "Section X is amended by adding", "clause (x) is deleted", "the definition of X is amended", "the Credit Agreement is hereby amended" as a whole-document fallback), producing `ModificationCandidate { operation: REPLACE|ADD|DELETE|MODIFY|RESTATE|UNKNOWN_CHANGE, targetSectionRef|targetDefinedTermRef, ... }` — never applying the change, only representing it. Target-document resolution reuses the exact same agreement-reference-matching logic as §10 (a modification candidate targets whatever agreement its own containing document amends). Persisted as `AmendmentEffect` rows with `reviewStatus: REVIEW_REQUIRED` (a pre-application candidate, never conflated with a confirmed applied effect) and `resolutionMethod: "DETERMINISTIC_AMENDMENT_STATEMENT"`.

## 12. Cross-document reference behavior

`cross-document-references.ts` (task §12) is a genuinely new detector, distinct from Phase 2A's `structural-references.ts` (same-document section refs only): recognizes bare named-agreement mentions ("the Credit Agreement", "the Indenture", "as defined in the X Agreement", "pursuant to the X Agreement", "subject to the X Agreement"). Resolution (in `relationship-resolution.ts`) requires a **unique type match** among the package's other documents; a bare mention with no attached date can only ever reach `REVIEW_REQUIRED` (never `RESOLVED`, since there is no date signal to promote it) or `UNRESOLVED` — task §12's own "do not guess based solely on similar titles" is honored by never using title-string similarity anywhere in this resolution path, only the closed `DocumentType` classification.

## 13. Ambiguity handling

`RESOLVED` / `REVIEW_REQUIRED` / `UNRESOLVED` (task §14's exact three states), applied uniformly across relationship candidates, modification candidates, and cross-document reference leads. Directly proven by Package D (two Credit Agreements with an identical execution date and identical type — the referencing amendment's edge, its modification candidate's target, and any would-be instrument grouping all correctly stay unresolved/absent, never arbitrarily attached to either candidate) and by the real LSB Joinder evidence (a real reference to a real 2013 Intercreditor Agreement not present in the two-document package correctly resolves to `UNRESOLVED` with an honest, specific `unresolvedReason`, never silently dropped or guessed).

## 14. Package query API

Ten of the task's twelve named functions are real, DB-backed additions to `lib/contract-model/service.ts`: `getPackageDocuments`, `getInstruments`, `getDocumentsForInstrument`, `getBaseDocuments`, `getAmendmentsForDocument`, `getSupplementsForDocument`, `getRelatedDocuments`, `getDocumentRelationships`, `getModificationCandidates`, `findDocumentsReferencing`. The remaining two — `getCovenantsForInstrument`/`getCovenantsForDocument` — are pure in-memory functions in `package-graph/covenant-association.ts` operating on a `CovenantInstrumentAssociation[]` built from Phase 2B's `DiscoveredCandidate[]`, **not** DB-backed, because Phase 2B's own discovery output is not yet persisted to any table (a disclosed Phase 2B limitation) — there is nothing in the database yet for a DB query to read. All ten DB-backed functions are exercised by real assertions in `package-graph-persistence.test.ts` against a real, persisted 4-document package.

## 15. Persistence/invalidation behavior + incremental document-add behavior

`persistence.ts` upserts `DebtInstrument`/`Document.type`/`Document.instrumentId`/`DocumentRelationshipEdge`/`AmendmentEffect` idempotently:
- Classification only ever writes `Document.type` when `typeConfirmedByUser === false` (never overwrites a human-confirmed value) and confidence clears 0.7.
- `DocumentRelationshipEdge`/`AmendmentEffect` are keyed by **what is targeted** (document + relationship/effect type + target ref), not by the raw matched excerpt text — an earlier draft of this exact code keyed `AmendmentEffect` by its matched excerpt and a real test caught it silently orphaning the old row instead of updating in place the moment the underlying wording changed; fixed before this report, and the fix is what the incrementality test now specifically guards against regressing.
- Every upsert path explicitly diffs against the existing row and **skips the write** when nothing actually changed (no `updatedAt` drift on an unrelated re-persist) — this is what makes "changing one document does not invalidate unrelated ones" a real, tested property rather than an aspiration: `package-graph-persistence.test.ts`'s own incrementality test changes ONE document's unrelated body wording and asserts, against the real database, that every OTHER document's own relationship edges, modification candidates, and instrument row are **byte-identical** before and after, while the changed document's own row is updated. A second test proves replaying the identical package graph twice creates zero duplicate rows.

## 16. Synthetic package results (task §16)

All 5 required packages (A–E) plus 2 additional cross-document-reference-lead scenarios plus 2 isolation/performance scenarios — **22/22 tests pass**:
- **Package A** (base CA + Amendment 1/covenant + Amendment 2/definition + Joinder): all 4 classify correctly; both amendments' and the joinder's targets resolve to the base CA; the covenant-modification (RESTATE, Section 6.01) and definition-modification (MODIFY, "Consolidated EBITDA") candidates are both detected with correct targets; all 4 documents group into one instrument.
- **Package B** (base indenture + supplemental indenture + guarantee + intercreditor agreement): all 4 classify distinctly; SUPPLEMENTS/GUARANTEES/INTERCREDITOR_WITH edges all resolve to the base indenture; only the indenture + its supplemental group into an instrument (guarantee/intercreditor stay cross-cutting, as designed); the supplemental's own modification candidate (ADD, Section 4.09) resolves correctly.
- **Package C** (two unrelated instruments sharing identical Section 6.01 numbering): Gamma's amendment resolves ONLY to Gamma's own CA, never Delta's, despite byte-identical section numbering and agreement type — the two instruments (one 2-document grouped cluster, one 1-document singleton) never merge.
- **Package D** (deliberately ambiguous — two CAs with an identical execution date): the referencing amendment's relationship edge, its own modification candidate's target, and any instrument grouping across the ambiguity all correctly stay `null`/`UNRESOLVED` — proven directly, not inferred.
- **Package E** (amendment-and-restatement): correctly classified `AMENDED_AND_RESTATED_AGREEMENT` (not a fresh `CREDIT_AGREEMENT`); a `RESTATES` edge resolves to the original agreement; both group into one instrument based at the original.

## 17–18. Real-package evidence available / unavailable (task §17)

**Available and validated:** the LSB 2023 ABL Credit Agreement unseen package's own `intercreditor-joinder.txt` — a real, complete, previously-committed SEC exhibit (Exhibit 10.3, filed 2023-12-26) never previously run through discovery, the compiler, or anything else in this repo (only the negative-covenants/definitions excerpts had been used). This is the SAME already-ingested second unseen package, not a third one. Run through `buildPackageGraph` alongside the already-used LSB CA excerpt text, **4 real assertions pass**:
1. The real Joinder classifies correctly as `JOINDER` from its own real title text — despite a genuine PDF-extraction artifact splitting "JOINDER" and "AGREEMENT" across a line break, which the classifier's fallback bare-`joinder` pattern absorbs correctly.
2. The LSB CA excerpt honestly classifies `UNKNOWN` — its curated fixture scope has no title page, so no deterministic signal exists, and none is fabricated.
3. The Joinder's real reference — "that certain INTERCREDITOR AGREEMENT dated as of August 7, 2013" — is detected and correctly resolved to `UNRESOLVED`, since the referenced 2013 Intercreditor Agreement is not itself part of this two-document package (confirmed by that fixture's own README: "the underlying 2013 Intercreditor Agreement itself was not filed as an exhibit here").
4. No instrument grouping is fabricated between the two documents.

This real test **found and fixed one real gap**: the agreement-reference regex initially only recognized "Credit Agreement/Indenture/Loan Agreement" as nameable target types (and only the determiner "the", not "that certain") — real filed text used "that certain INTERCREDITOR AGREEMENT," which is a materially different, and equally common, real drafting convention. Generalized (not package-specific) to also recognize Intercreditor Agreement/Security Agreement/Guaranty labels and both determiners, then re-verified against the full synthetic suite (no regressions) before being counted as fixed.

**Not available / not validated by real fixtures:** neither FWRG nor LSB's committed fixtures contain two or more documents that BOTH (a) carry real title-page text AND (b) genuinely relate to each other — the only real multi-document material on hand (this Joinder) references an agreement that is, itself, absent from the fixture set. A real scenario exercising a **RESOLVED** cross-document edge between two real, both-titled, in-package documents — the core case Packages A/B/E test synthetically — has **not** been validated against real filed text in this phase. This is reported plainly rather than inferred from the synthetic results; closing this gap requires either a real package containing two-plus fully-titled related documents, or ingesting real Coherent/Matthews package documents through this layer (out of scope here — those are protected production companies, not evaluation fixtures, and this phase's own instructions did not ask for that).

## 19. Phase 2B regression metrics (task §18, re-verified against the already-committed real discovery-run outputs — zero new LLM calls)

| | FWRG | LSB (raw, canonical) |
|---|---|---|
| Section recall | 9/9 = 100.0% | 10/10 = 100.0% |
| Operative-rule recall | 148/149 = 99.3% | 50/53 = 94.3% |
| Basket/exception recall | 138/138 = 100.0% | 40/43 = 93.0% |
| Dangerous discovery misses | 0 | 0 |

Identical to Phase 2B's own final numbers. Per task §18's explicit instruction, **raw LSB metrics are reported as canonical** here (the "addressable scope" framing from the Phase 2B report is not substituted for it).

## 20. Parser limitation status (task §19)

The LSB `6.14(b)/(c)/(d)` comma-list gap remains real and is **not fixed** in this phase. Root-cause analysis performed (not previously documented at this depth): `clause-hierarchy.ts`'s `MARKER_OCCURRENCE` regex excludes any marker immediately preceded by `", "` to avoid misreading a citation list like `"clauses (a) , (i) , (j) , (m)"` as new clause items. In LSB's real text, `"...Schedule 6.14 , (b) transactions..."` has `(b)` directly preceded by `", "`, so `(b)` alone is excluded by this rule; `(c)` and `(d)` are not independently excluded by the comma rule but are then rejected by `buildClauseTree`'s own strict sequence-continuity check, since the sequence has a hole at `(b)`. A generalized fix direction was identified: validate a comma-preceded candidate by sequence-continuity (does it correctly continue an already-started monotonic letter sequence?) and substantial-following-content (a bare citation like `"(i) ,"` has almost no text before the next marker) **instead of** blanket pre-filtering every comma-preceded marker before sequence validation runs. This was **deliberately not implemented**: it requires modifying the shared, heavily-tested `buildClauseTree` sequence engine underpinning all structural parsing for every document (not a Phase-2C-local change), and task §19's own bar — "only implement if generalized tests demonstrate correctness," applied against this phase's schedule — was not met. Preserved as an explicit, disclosed remaining limitation for later structural work, exactly as task §19 allows as a valid outcome.

## 21. Tests added

- `tests/contract-model/package-graph-pipeline.test.ts` — 22 tests (Packages A–E + cross-document-reference-lead + isolation/performance scenarios).
- `tests/contract-model/package-graph-persistence.test.ts` — 8 tests (10-function query-API coverage against a real persisted package, idempotent-replay proof, incrementality proof).
- `tests/contract-model/package-graph-real-evidence.test.ts` — 4 tests (real LSB Joinder exhibit).
- `tests/contract-model/tenant-isolation.test.ts` — 1 new test (Phase 2C tables' cross-tenant leak detection).
- **35 new tests total**, all passing.

## 22–24. Targeted / full-suite / build results

- Targeted: 35/35 new tests pass (see above); Phase 2A (`structural-index.test.ts`, 17/17) and Phase 2B (`discovery-pipeline.test.ts`, 19/19) targeted suites re-run and unaffected.
- Full suite: **703/703 tests pass** (88 test files) — 668 pre-existing + 35 new.
- `npx tsc --noEmit`: clean.
- `npx eslint .`: clean.
- `npm run build` (production Next.js build): succeeds, all routes compile.

## 25. Package-graph performance (real, measured)

| Package | Documents | Chars scanned | Wall-clock | Semantic calls |
|---|---|---|---|---|
| Synthetic Package A | 4 | 994 | 8ms | 0 |
| Real LSB CA excerpt + real Joinder | 2 | 35,694 | 6ms | 0 |

Every classification/identity/reference-lead computation reads only its own document's text once; relationship-target resolution reads only the OTHER documents' cheap identity fields (type + execution date), never their full text. No document's raw text is scanned more than a fixed, small number of times regardless of package size (each detector module makes one linear pass), so wall-clock scales linearly with total characters, not quadratically with document count — directly demonstrated by the two data points above (18× the character volume, comparable wall-clock).

## 26–29. Model/provider, calls, tokens, cost

**None used.** This V1's entire deterministic pipeline made **zero real or synthetic LLM calls** — every required relationship/target/ambiguity scenario in both the synthetic packages and the real LSB evidence resolved (or correctly stayed unresolved) from cheap signals alone (task §15's own bar: "only use semantic/model resolution where deterministic evidence is insufficient" — it was never insufficient in this phase's required scope). `PACKAGE_GRAPH_SEMANTIC_PROMPT_VERSION` is reserved in `pipeline.ts` for a future semantic-resolution fallback, with the version-identity convention already established, but no such fallback was built or called. **Total cost: $0.00.**

## 30. Protected-data / tenant-isolation result

- No schema/migration change is destructive (verified via the generated SQL for both migrations — additive only).
- Neither `persistPackageGraph` nor any test in this phase was ever invoked against the real Coherent/Matthews company rows; a direct DB check post-suite-run confirms zero leftover fixture companies and an unchanged Coherent document count.
- `validateTenantIsolation` extended (not replaced) to check the two new Phase 2C tenant-scoped tables (`DocumentRelationshipEdge`, `AmendmentEffect`) for cross-company leaks, with a real test proving both the clean-pass case and that a deliberately introduced cross-tenant edge is actually caught.
- Both golden harnesses (Coherent: 26 passed/3 failed/1 flagged; Matthews: 2 passed/4 failed/10 flagged/2 errored) are **byte-identical** to their pre-existing, already-diagnosed baselines — no customer-facing calculation changed.

## 31. Known limitations

- Semantic/model-based relationship resolution is architected for (version identity reserved) but not implemented — no real package requiring it was encountered in this phase's scope.
- The package-graph pipeline is standalone, like Phase 2B's discovery pipeline — not yet wired into `ContractCompilerRun`'s own resumable per-stage cache/orchestration machinery. A natural, not-yet-built integration step.
- `getCovenantsForInstrument`/`getCovenantsForDocument` are in-memory-only pending Phase 2B's own eventual discovery-output persistence.
- Cross-document reference LEADS (task §12) are computed and tested but not yet persisted to any table (only relationship candidates and modification candidates are persisted) — a disclosed scope boundary, not a silent gap; `getCrossDocumentReferenceLeads` was not one of the task's twelve required query functions.
- The LSB `6.14(b)/(c)/(d)` structural-parser limitation remains, with a diagnosed but unimplemented fix direction (§20).
- No real fixture on hand validates a RESOLVED cross-document edge between two real, fully-titled, genuinely-related documents (§18) — only synthetic evidence covers that core case today.
- Instrument naming currently falls back to the base document's own extracted title/type when no cleaner "facility name" signal exists — acceptable for V1, not yet a polished customer-facing label (this phase explicitly excludes customer-facing summaries regardless).

## 32. Is the package graph ready for recursive cross-document covenant retrieval?

**Yes, for the topology this phase was scoped to build.** A future retrieval system can call `getAmendmentsForDocument`/`getSupplementsForDocument`/`getModificationCandidates`/`getDocumentRelationships`/`findDocumentsReferencing` to know exactly where else to look for a covenant's complete picture, without re-scanning raw text — proven by real, persisted-database assertions, not just in-memory claims. It is **not** yet ready to construct operative amended covenant TEXT (deliberately out of scope, per the task's own critical distinction in §2) and its relationship-resolution confidence has only been exercised deterministically — a package genuinely requiring semantic disambiguation has not yet been tested end-to-end.

## 33. Recommended next task (exact)

**Phase 2D — Recursive Cross-Document Covenant Context Retrieval V1.** Given a Phase 2B-discovered covenant candidate flagged `definedTermDependencyLikely` or whose description delegates to a cross-referenced provision, and given this phase's own persisted `DocumentRelationshipEdge`/`AmendmentEffect`(-as-modification-candidate) graph, build the retrieval layer that follows exactly those already-flagged, already-persisted leads to assemble the full semantic context (base provision + every AMENDS/RESTATES/SUPPLEMENTS layer that touches it + every resolved definition dependency) a later threshold/formula extractor will need — still without computing any threshold, formula, financial result, remaining capacity, or amendment-adjusted amount, and still without ingesting a third unseen package until that retrieval layer's own recall is independently measured against FWRG/LSB the same way Phase 2B measured discovery. As part of that phase, wiring Phase 2B's own discovery-output persistence (this phase's own disclosed limitation, §31) is a natural prerequisite, since retrieval needs a real, queryable discovery-candidate table to walk from.

## Stop condition compliance

No recursive covenant context retrieval was built. No amendment was applied to construct operative covenant text (the existing `getOperativeContractualState` — a prior phase's own work — remains the only place that happens, and it was not modified). No formula/expression ontology, no capacity calculation, no customer-facing summary, and no third unseen package were touched. This report stops here.
