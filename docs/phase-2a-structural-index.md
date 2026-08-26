# Phase 2A — Generalized Debt-Document Structural Index

**Starting SHA:** `3c37987c5a49a91eb2f86e582611c04c40a1c296`
**Final SHA:** (see final commit below)

## Central question, answered with evidence

**Can Headroom now navigate an arbitrary debt document precisely enough that a later covenant-discovery system can reliably ask for, retrieve, and relate exact contractual provisions without rereading or guessing the entire document?**

**Yes, for the core hierarchy and identity questions, with disclosed limits on citation-list disambiguation in deeply irregular text.** Concretely demonstrated: `getNodeByRef("lsb", "6.08")` → `getChildren` → `getChildren("6.08(a)")` now deterministically reconstructs the exact `6.08 → 6.08(a) → 6.08(a)(vi)` hierarchy that Phase 1A/1B's evaluator had to work around with a bespoke matching heuristic — this substrate makes that navigable structurally, from real parsed text, with zero LLM calls. The known residual gap (deep, comma-list-heavy sections occasionally over-nest) is disclosed in §10 below, not hidden.

## 1. Architecture Audit (§3, before any code change)

Inspected `lib/contract-model/compiler/stage-structure.ts` and its consumers:

- **What it parsed:** Only `ARTICLE`/`SECTION` — a "deliberate v1 scope bound," per its own prior doc comment. No `SUBSECTION`/`CLAUSE`/`SUBCLAUSE` nodes were ever produced, despite `DocumentNodeType` already having all five (plus `PROVISO`/`EXCEPTION`/`SCHEDULE`/`EXHIBIT`) as real Prisma enum members.
- **Nested subsections:** Not supported at all.
- **Citations:** `sectionRef` string only, no document-scoped stable-identity field.
- **Text boundaries:** `charStart`/`charEnd` captured only the header MATCH itself, not any owned span.
- **Definitions indexed:** Only via a separate real LLM stage (`stage-definitions.ts`), with no structural location (`sourceNodeId` always null in `persistDefinedTerms`).
- **Cross-references indexed:** Only via `stage-dependency-resolution.ts`'s `detectCrossReferences`, gated behind five specific connector phrases ("subject to", "pursuant to", etc.) and **never recording the source node** — `persistReferences` never set `sourceNodeId`, so a reverse-reference lookup was structurally impossible from persisted data.
- **Page/source provenance:** `charStart`/`charEnd` survive; no `page` field was ever populated (schema has one; unused).
- **Multiple documents independently indexed:** Yes, `documentId`-scoped.
- **Queryable without reparsing:** No navigation API existed at all — only ad hoc `Array.filter` calls scattered across `orchestrator.ts`/`stage-rule-extraction.ts`/`stage-inventory.ts`.
- **Persistence:** `DocumentNode.parentId` (a real self-relation) has always existed in the schema but was **never populated** — `persistStructuralNodes` never set it, so no real tree ever existed in the database despite the schema supporting one.

**Two real, previously-undiagnosed defects found during this audit** (not present in any prior phase's own self-report, since this is the first time the STRUCTURE stage's actual regex behavior was checked against the real fixture bytes rather than against downstream evaluator output):

1. FWRG's own `article-6-negative-covenants.txt` contains **zero newline characters** in its entire ~104KB. The old `^Section...$`/`^ARTICLE...$` line-anchored patterns can only ever match at true line boundaries, so they silently found **zero `SECTION` nodes** for this file — the multi-basket completeness check's own `"[multi-basket check] 0/0 sections flagged"` log line (visible in this session's Phase C.1/1A/1B recompute runs) was this exact defect, not "nothing to flag."
2. LSB's own fixture has a real heading formatted `"\n SECTION  6.08 Payments of Indebtedness; Modifications..."` — leading whitespace before the line-start anchor, a doubled internal space, and a semicolon inside the title — none of which the old patterns tolerated, so `6.08` (the exact section Phase 1A/1B's evaluator fix was built around) was never a real structural node either.

## 2. Architecture Reused vs. Changed

**Reused, unmodified in shape:** `ContractCompilerRun`/`ContractCompilerStage` persistence/resume infrastructure (no new stage kind added — this remains Stage 1, STRUCTURE); `computeStableKey`; the `DocumentNode`/`DefinedTermNode`/`ContractReferenceEdge` Prisma models (already fully capable — `parentId`, `sourceNodeId`, `targetDocumentNodeId`, `resolved`/`unresolvedReason` all already existed); the existing `bestMatches` "try several patterns, keep whichever finds the most real matches" generalization strategy; Phase 1A's exact-structural-component-parsing discipline (reused conceptually for clause nesting, never fuzzy).

**Changed:**
- `lib/contract-model/compiler/types.ts` — `StructuralNode` widened additively (`nodeType` now includes `SUBSECTION`/`CLAUSE`/`SUBCLAUSE`; new `nodeKey` field; `charEnd`/`ordinal`/`parentSectionRef` semantics generalized — verified via full-repo grep that no existing consumer read these fields in a way the widening could break, and the full/targeted suites confirm zero regressions).
- `lib/contract-model/compiler/stage-structure.ts` — rewritten header-detection patterns (no longer line-anchored only; content-based heading/citation disambiguation); new owned-span computation (single rank-based stack pass, O(n)); new nested-clause parsing per section via `clause-hierarchy.ts`.
- `lib/contract-model/compiler/persistence.ts` — `persistStructuralNodes` now populates real `parentId` edges; two new functions, `persistStructuralReferences`/`persistStructuralDefinitions`, fix the `sourceNodeId` gap for both references and definitions.

**New files:** `clause-hierarchy.ts` (nested-marker parser), `structural-references.ts` (general reference detector + reverse-lookup support), `structural-definitions.ts` (deterministic definition detector), `structural-index.ts` (navigation API).

## 3. Structural-Node Model (§4/§7)

`StructuralNode.nodeType`: `ARTICLE | SECTION | SUBSECTION | CLAUSE | SUBCLAUSE` — a flat list with parent pointers (`parentSectionRef`) rather than a nested-object tree, matching the task's own "the implementation may use a generalized tree if that is cleaner" allowance. `SCHEDULE`/`EXHIBIT`/`DEFINITION`/document-level `TITLE` nodes are **not** parsed as structural nodes this phase (see §10 — a disclosed scope limit, not an oversight); the Prisma enum already reserves room for them.

Numbering styles handled without assuming one exact convention: `ARTICLE VI` / `ARTICLE 6`; `Section 6.01` / `SECTION 6.01` / `§6.01`; lettered `(a)`, roman `(i)`, upper-letter `(A)`, numeric `(1)`, and double-letter continuation past z (`(aa)`, `(bb)` — a real convention found verbatim in FWRG's own text).

## 4. Identity Model (§5)

`nodeKey = "${documentId}::${sectionRef with whitespace stripped}"` — exact, document-scoped, never derived from fuzzy string matching. Nested-clause refs are built by exact structural composition (`6.08` + `(a)` + `(vi)` → `6.08(a)(vi)`), directly reusing the Phase 1A lesson: two distinct lettered clauses are never confused, and a coarser ref is never treated as equivalent to a more specific one. Proven by test: `6.10(a)` correctly never matches when only `6.01` exists; two documents sharing an identical `6.01` never collide (`docA::6.01` ≠ `docB::6.01`).

## 5. Hierarchy Behavior (§4/§17)

`clause-hierarchy.ts`'s `buildClauseTree` infers real nesting from marker STYLE + strict in-sequence position (never fuzzy): a marker is accepted only as the exact continuation of an open level, the exact start of a new nested level, or the exact continuation of an already-open outer level. The genuine "(i)" letter/roman ambiguity is resolved by a documented, tested convention (continue an open lettered sequence over starting a new nested level) — disclosed as a real limitation, not hidden.

`getChildren`/`getParent`/`getAncestors`/`getSiblings`/`getDescendants` are all backed by prebuilt maps from a single O(n) index-build pass — no per-call document rescanning.

## 6. Text-Boundary Behavior (§6)

`charEnd` is computed once per document via a single rank-based stack pass (ARTICLE=0 … SUBCLAUSE=4; a node is closed by the next node of equal-or-shallower rank) and represents the node's **full owned span** (own text + every descendant). `getNodeText(node, "OWN")` excludes children's text (stops at the first child's `charStart`); `getNodeText(node, "DESCENDANTS")` returns the full span. Proven by test: a section's text never bleeds into the next section's; a specific deep clause returns exactly its own text, not its parent's.

## 7. Definition Index (§7)

`structural-definitions.ts` detects `"Term" means/shall mean/shall have the meaning` declarations, generalized across the **three real quote encodings this repository's own fixtures actually use**: literal Unicode curly quotes (LSB), HTML numeric-entity curly quotes `&#147;`/`&#148;` (FWRG), and plain straight quotes (synthetic tests) — plus tolerance for a line break between the closing quote and "means" (observed verbatim in LSB's own text). Each definition records exact term, normalized term, structural location (`sourceNodeKey`), document, and a bounded excerpt with offsets. `getDefinition("Consolidated EBITDA")` is exact/case/whitespace-insensitive; a missing term returns `undefined`, never a guess.

## 8. Cross-Reference Index (§8) and Reverse-Reference Behavior (§9)

`structural-references.ts` detects **any** explicit `Section X` / `Article X` / `Schedule X` / `Exhibit X` / `clause (x)` / `subsection (x)` occurrence — not gated behind a connector phrase, unlike the pre-existing `detectCrossReferences` (which is untouched and still serves its own five-relationship-type purpose). Every reference is attributed to its enclosing structural node (fixing the pre-existing `sourceNodeId`-always-null gap), and resolution is exact-structural-identity, same-document-only — an unresolved reference is always reported with a reason, never guessed. `SCHEDULE`/`EXHIBIT` references are always reported unresolved this phase (§10), specifically guarded against colliding with a same-numbered `SECTION` node. `findReferencesTo(nodeKey)` (task §9's core ask) is a direct reverse-map lookup, proven by test against real synthetic cross-references.

## 9. Navigation API (§10)

`structural-index.ts`'s `buildStructuralIndex` returns: `getNode`, `getNodeByRef`, `getChildren`, `getParent`, `getAncestors`, `getSiblings`, `getDescendants`, `getDefinition`, `findReferencesFrom` (with an `includeDescendants` option), `findReferencesTo`, `getNodeText`, `searchStructuralNodes`, `allNodes`. Entirely internal (not exported from any `app/` route); retrieval is 100% deterministic — no LLM call anywhere in this module or its dependencies (§11/§20, confirmed by construction, not merely absence of observed calls).

## 10. Persistence and Invalidation Behavior (§15/§16)

No second persistence architecture. `persistStructuralNodes` now populates real `parentId` FK edges (two-pass upsert: create/update all nodes, then set `parentId` once every row's real id is known). Two new functions, `persistStructuralReferences`/`persistStructuralDefinitions`, populate `sourceNodeId` correctly, reusing the identical `documentId::sectionRef` key format `persistStructuralNodes` already returns (one identity scheme, not two). `persistStructuralDefinitions` uses the SAME `stableKey` convention (`companyId` + lowercased term) as the pre-existing LLM-based `persistDefinedTerms`, so a term found by both paths converges on one row rather than duplicating.

Invalidation: `structureOutputHash` (pre-existing, reused unchanged) is a pure content hash of `(documentId, nodeType, sectionRef, charStart)` tuples — proven by test to be identical for unchanged content and to differ the moment a section ref changes, which is exactly the signal `orchestrator.ts`'s existing `getOrRunStage` cache gate already keys on for the STRUCTURE stage. No orchestrator wiring changed in this phase — the enrichment is transparent to the existing cache-gate mechanism.

## 11. FWRG Structural Results (§17, regression fixture — not unseen)

- 418 total nodes: 1 ARTICLE, 10 SECTION, 162 SUBSECTION, 121 CLAUSE, 124 SUBCLAUSE.
- 22 definitions detected (`Code`, `Collateral`, `Collateral and Guarantee Requirement`, `Restricted Subsidiary`, …).
- 214 explicit references detected; 158 resolved, 56 unresolved.
- 0 duplicate/ambiguous `nodeKey`s.
- Parse failures: none (all 10 real sections — `6.01` through `6.10`, matching the ground truth's full range — found; previously **zero** were found before this phase's fix).
- Parse time: 4.5ms for 120,729 chars.

## 12. LSB Structural Results (§17, regression fixture — not unseen)

- 76 total nodes: 1 ARTICLE, 12 SECTION, 51 SUBSECTION, 11 CLAUSE, 1 SUBCLAUSE.
- 11 definitions detected (`Availability`, `Borrowing Base`, `Fixed Charge Coverage Ratio`, …).
- 23 explicit references detected; 5 resolved, 18 unresolved (mostly bare `clause (x)` references appearing in preamble text before any section boundary — see §14).
- 0 duplicate/ambiguous `nodeKey`s.
- Parse failures: none — critically, **`6.08` (the exact section Phase 1A/1B's evaluator hierarchy fix was built around) is now a real parsed node**, with its real `6.08(a) → 6.08(a)(i)…(vi)` / `6.08(b)` structure exactly matching what that evaluator work had to reconstruct heuristically. Manually verified:
  ```
  SECTION 6.08 parent=VI
  SUBSECTION 6.08(a) parent=6.08
  CLAUSE 6.08(a)(i)…(vi) parent=6.08(a)
  SUBSECTION 6.08(b) parent=6.08
  ```
- Parse time: 1.0ms for 24,893 chars.

Manually inspected a representative sample of each required category (simple section `6.02 "Liens"`; deep nested clause chains under `6.01`/`6.08`; definitions `Availability`/`Borrowing Base`; resolved reference `ARTICLE VI`; unresolved reference `clause (a)`) for both packages — all matched the real source text on inspection.

## 13. Unresolved-Reference Examples (§19)

- `"clause (ii)"` (FWRG) — a bare relative reference appearing before any enclosing SECTION was identified (or referring to a clause letter this document's own structure doesn't carry under that exact composed ref) — correctly reported unresolved with a reason, never guessed.
- `"Schedule 6.01"` (both packages) — always unresolved this phase by design: schedules are not parsed as structural nodes yet (§10), and are explicitly guarded from ever colliding with a same-numbered SECTION node.

## 14. Formatting Failures Discovered and Fixed (§20/§12)

1. **Zero-newline document** (FWRG) — line-anchored patterns found nothing; fixed with content-based (title-then-period / all-caps-run) heading detection that does not require any line boundary.
2. **Leading whitespace + doubled internal space before a heading** (LSB) — fixed by the same non-anchored detection.
3. **Semicolon/bracket characters inside a section title** (`"Payments of Indebtedness; Modifications of Subordinated Indebtedness"`, `"[Reserved]"` — both real, both packages) — fixed by widening the title character class.
4. **A comma-separated CITATION list referencing several already-existing clauses by letter** (`"...permitted under clauses (a) , (i) , (j) , (m) ... of this Section 6.01"`, FWRG) — textually indistinguishable from genuine new list items without a heuristic; fixed by excluding a marker immediately preceded by `", "` (real list items in this corpus are consistently semicolon-separated). **Disclosed limitation:** a document that uses commas to separate genuine list items would not be handled correctly by this rule.
5. **Double-letter continuation past "z"** (`(x)`, `(y)`, `(z)`, `(aa)`, `(bb)` — FWRG) — a real, common drafting convention; added as a first-class continuation of the lettered sequence.
6. **Residual, disclosed limitation:** a small number of deeply-nested, citation-list-heavy sections not central to any prior ground-truth work (e.g. FWRG `6.07(kk)`, LSB `6.03(c)`) still occasionally over-nest when comma-lists and genuine sub-items interleave in ways the semicolon-vs-comma heuristic cannot fully disambiguate without real semantic understanding. This does not affect any section this session's prior evaluator work depended on (`6.01`, `6.08`, `6.10` all verified correct by direct inspection), and is reported honestly rather than claimed solved.

## 15. Tests Added (§17, 49 new tests across 5 new files)

- `clause-hierarchy.test.ts` (8) — flat lists, roman/uppercase/numeric nesting, the i/roman ambiguity convention, direct-nesting-by-space, incidental parentheticals, compound-citation exclusion, leaf-vs-container siblings.
- `structural-index.test.ts` (17) — hierarchy (discovery, ancestry, siblings, descendants, children), identity (exact refs, prefix-vs-specific, cross-document duplicates), text boundaries (own vs. descendants, no bleed, exact deep-clause retrieval), formatting (zero newlines, doubled whitespace, wrapped headings, all-caps ARTICLE titles, semicolon titles).
- `structural-definitions.test.ts` (9) — all three quote encodings, line-break tolerance, "shall mean"/"shall have the meaning" phrasing, exact/similarly-named/missing definition retrieval, structural attribution.
- `structural-references.test.ts` (8) — same-section relative reference, cross-section reference, unresolved reference, Exhibit detection, source attribution, reverse-reference lookup, `findReferencesFrom` with/without descendants, document-scoped non-cross-resolution.
- `structural-persistence.test.ts` (7) — real `parentId` edges, real `sourceNodeId` on references and definitions, idempotent re-persist, hash-based invalidation signal, document isolation (same company, duplicate section numbers), tenant isolation (two companies, identical content).

## 16. Regression Results

- **Targeted:** 49/49 new tests pass.
- **Full suite:** 649/649 tests, 84 files (600/79 baseline + 49 new), zero failures, zero modifications to any pre-existing test.
- `tsc --noEmit`: clean. `eslint .`: clean.
- `npm run build`: succeeds.
- **Coherent golden harness:** 26 passed/3 failed/1 flagged/0 errored (30 total) — unchanged.
- **Matthews golden harness:** 2 passed/4 failed/10 flagged/2 errored (18 total) — unchanged.

## 17. Performance Measurements (§16)

| | FWRG | LSB |
|---|---|---|
| Parse time | 4.5ms / 120,729 chars | 1.0ms / 24,893 chars |
| Node count | 418 | 76 |
| Definition count | 22 | 11 |
| Reference count | 214 (158 resolved / 56 unresolved) | 23 (5 resolved / 18 unresolved) |
| 1000 combined `getNode`+`getAncestors`+`getChildren` calls | 1.4ms (0.0014ms/call) | 1.1ms (0.0011ms/call) |

No O(N²) full-document rescanning: the owned-span computation is a single O(n) stack pass; every navigation method is backed by a prebuilt map, not a scan. No obvious scaling problem observed at real fixture size; not micro-optimized further per the task's own instruction.

## 18. Protected-Data Result

`goldenTests=48, permissions=29, permissionRelationships=27, sharedConstraints=3, legalReview=111, totalContractRule=130` — all unchanged from the Phase 1B baseline. No new Prisma migrations. All test fixtures (`fixture-phase-2a-*`) cleaned up via `afterAll` teardown, verified zero leftover rows.

## 19. Model Calls / Tokens / Cost

**0 / 0 / $0.** Every capability in this phase — parsing, definition detection, reference detection, navigation, persistence — is pure deterministic code operating on already-available fixture text.

## 20. Known Limitations

1. Schedules, exhibits, and document-level title nodes are not parsed as structural nodes this phase (the enum reserves room; the parser does not populate them yet) — any `Schedule`/`Exhibit` reference is always reported unresolved.
2. The comma-vs-semicolon list-item heuristic (§14 item 4) will misparse a document that genuinely uses commas to separate list items rather than citations.
3. A small number of deeply-nested, citation-list-heavy sections outside prior ground-truth scope (FWRG `6.07(kk)`, LSB `6.03(c)`) still occasionally over-nest — disclosed, not fixed, since the sections this session's actual prior work depends on (`6.01`, `6.08`, `6.10`) were directly verified correct.
4. The genuine "(i)" letter/roman-numeral ambiguity is resolved by a documented convention (continue an open alpha sequence), not a semantic determination — a document that deliberately intends a nested roman list starting exactly where an alpha list would expect "i" next would be misparsed.
5. The general reference detector (`structural-references.ts`) is a new, separate capability from the pre-existing connector-phrase-gated `detectCrossReferences` (`stage-dependency-resolution.ts`) — the two are not yet merged or reconciled; both currently coexist, serving different purposes (relationship-typed edges vs. a general navigable reference index).
6. Not wired into `orchestrator.ts`'s live pipeline sequencing or persisted as part of a real compiler run in this phase, per the task's explicit "do not wire compiler output into customer UI" instruction — the enrichment is available as a library, proven against real fixture text and the real persistence layer directly, but not yet exercised end-to-end through a live `runContractCompiler` call.

## 21. Is Phase 2A Ready for Autonomous Covenant Discovery? (§29)

**The structural-navigation foundation is ready for Phase 2B to build on, with the limitations in §20 carried forward as explicit inputs to that phase's own design** — in particular, Phase 2B's discovery classifier should be aware that (a) schedule/exhibit content is not yet structurally addressable, and (b) a small class of deeply-nested sections may have imprecise sub-clause boundaries. The core deliverable this phase promised — exact, queryable, provenance-preserving structural identity across multiple documents with no cross-document/cross-tenant collision, all without LLM calls — is proven by the test suite and the real-fixture results above, including the specific case (`LSB 6.08`) this session's own prior work most needed it for.

## 22. Exact Recommended Phase 2B Task

Build the covenant-discovery classifier (task's own §19 boundary: this phase explicitly does not measure "covenant recall") **on top of this structural index**, scoped narrowly to: for each structural node (starting with SECTION/SUBSECTION granularity), classify whether it is a candidate covenant provision, a definition, or immaterial boilerplate — reusing `getNodeText`/`getChildren`/`getDescendants` for context assembly rather than re-scanning raw document text. Do not build semantic context retrieval, formula ontology, or customer-facing functionality in that phase; and do not attempt to close the disclosed comma-list/deep-nesting gap unless a real discovery-accuracy measurement shows it actually matters, per this session's own repeated discipline against premature optimization.
