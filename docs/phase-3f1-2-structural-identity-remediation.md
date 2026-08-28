# Phase 3F.1.2 — Structural Identity & Index Integrity Remediation

## Executive Summary

This phase implements the previously-approved Structural Node Identity Architecture Proposal (verdict `STRUCTURAL_NODE_IDENTITY_ARCHITECTURE_PROPOSAL_APPROVED`, `docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md`, Option D — hybrid span-primary occurrence identity). It replaces the pre-existing, confirmed-defective `nodeKey` (`documentId::sectionRef`, a human legal-reference LABEL) as the structural substrate's physical identity with `nodeId` (`documentId+nodeType+charStart`, hashed via the repo's existing `computeStableKey` convention) and `parentNodeId` (the true physical parent occurrence, captured directly during parsing). Every downstream consumer that needed physical-occurrence identity, legal-reference search, or ambiguous-reference resolution was migrated; every consumer that only needed a display label was left untouched beyond adding the new field additively. No scorer, semantic-compiler, package-selection, or UI logic was touched. No package-specific production logic was introduced.

Zero occurrence-ID collisions, zero silent overwrites, and zero cross-parent child merges were found across FWRG, LSB, CONMED, and DSGR (the four known real packages) when re-parsed through the remediated pipeline. DSGR's frozen pre-remediation evidence (4,149 total nodes, 546 duplicated legal-reference labels, 680 excess duplicate instances) reconciles exactly against the current run — same node count, same duplicate-label population, zero nodeId collisions.

## A. What was authorized, and was it honored?

Authorized: introduce source-occurrence identity; migrate the structural index to occurrence-safe identity; migrate structural persistence; migrate downstream consumers requiring physical occurrence identity; introduce explicit ambiguous legal-reference lookup behavior; update structural health/integrity diagnostics; preserve compatibility aliases; write migration/property/known-package-regression/integrity tests and documentation. All of this was done. Nothing outside this scope was touched: no scorer/reconciliation correction, no Phase 3E semantic tuning, no Phase 3B compiler tuning, no new package selection, no 3F.2/Phase 4 work, no financial integrations, no UI work, no package-specific production logic, and no prior safety gate was weakened (every existing ambiguity-handling discipline — resolveUniqueNodeByRef's UNIQUE/NOT_FOUND/AMBIGUOUS contract, the deprecated `getNodeByRef`'s now-safe-by-omission behavior — is strictly more conservative than before, never less).

## B. Does the implementation match the ADR's chosen design exactly?

Yes. `nodeId = computeStableKey("structural-node", documentId, nodeType, String(charStart))` (ADR §5, Option D) is minted once in `stage-structure.ts` at parse time, never re-derived downstream. `parentNodeId` is captured directly from the existing RANK-based stack pass in `stage-structure.ts` — the stack top at push time, after popping — never re-derived from a label match (ADR §4's own warning against re-deriving parentage from `parentSectionRef`). `nodeKey`/`parentSectionRef` remain on `StructuralNode`, marked `@deprecated`, for display/logging/legacy-consumer compatibility only (ADR §26's compatibility-adapter policy).

## C. Were the five distinct identity concepts kept separate?

Yes, throughout: **source occurrence identity** (`nodeId`/`parentNodeId`) is never conflated with **legal/human reference** (`sectionRef`, looked up via `findNodesByRef`/`resolveUniqueNodeByRef`, always cardinality-aware); **display label** (`nodeKey`, deprecated, display-only); **structural position** (parent/child/ancestor/sibling/descendant, all occurrence-safe); **semantic identity** (IR rule/definition identity, untouched — Phase 3A/3B territory, out of scope); and **operative/version lineage** (`OperativeProvisionView.currentSourceNodeId`/`supersededSourceNodeIds`, Phase 2G's amendment-precedence model, migrated to nodeId without touching its policy logic).

## D. StructuralIndex V2 — what does it actually guarantee now?

`getNodeById(nodeId)` never returns a wrong occurrence. `resolveUniqueNodeByRef`/`findNodesByRef` are cardinality-aware (UNIQUE/NOT_FOUND/AMBIGUOUS), never a silent singleton pick — the deprecated `getNodeByRef` is now a safe-by-omission wrapper around this (returns `undefined`, not an arbitrary occurrence, when ambiguous). `getChildren`/`getParent`/`getAncestors`/`getSiblings`/`getDescendants`/`getNodeText` are all occurrence-scoped: a child list keyed by `parentNodeId` can never merge children from two same-labeled parent occurrences (verified empirically over all four known packages — see `known-package-structural-regression.json`'s `crossParentMergeViolations: 0`). Construction never silently overwrites: a genuine `nodeId` collision is rejected (first-seen wins) and surfaced as an ERROR-severity `DUPLICATE_OCCURRENCE_ID` finding, never silently absorbed.

## E. Persistence — was the independently-confirmed DB-level defect actually fixed?

Yes. `persistStructuralNodes`' `stableKey` formula gained `String(node.charStart)` — the pre-3F.1.2 formula (`companyId, documentId, nodeType, sectionRef`) let two distinct physical occurrences sharing a label collide onto the same `@@unique([companyId, stableKey])`-constrained row, so the second upsert's `update` branch silently overwrote the first occurrence's persisted heading/ordinal/span. `PersistedNodeIndex{idByNodeId, idsByLegalRef}` mirrors the in-memory split; `resolveUniquePersistedNodeByRef` mirrors `resolveUniqueNodeByRef`'s UNIQUE/AMBIGUOUS discipline at the DB layer. Parent linking uses `node.parentNodeId` directly, never a re-matched label. See Q. below for the disclosed DB-availability limitation on how this was verified.

## F. Consumer migration — was it a blind find-replace, or a real classification?

A real per-file classification (never a blind `nodeKey`→`nodeId` substitution), recorded in `structural-identity-consumer-migration.json` (48 files). Category A (physical occurrence identity — the majority) got full nodeId/parentNodeId migration. Category B (legal-reference existence-only search — `amendment/pipeline.ts`'s multi-target disambiguation, `amendment/independent-verification.ts`'s existence probe) migrated to `findNodesByRef(...).length > 0`, never the deprecated singleton. Category C (display-only passthrough fields) got the new field added additively with no lookup-safety change needed. Category E (unresolved/ambiguous reference resolution — `semantic/tools.ts`, `amendment/operative-state.ts`, `amendment/pipeline.ts`'s `getTargetCurrentText`, `context-retrieval/reference-context.ts`, `discovery/pass-c-neighborhood.ts`) migrated to `resolveUniqueNodeByRef` with explicit UNIQUE/NOT_FOUND/AMBIGUOUS branches, refusing rather than guessing.

Two incidental, pre-existing bugs were found and fixed during this classification, not introduced by it: `amendment/independent-verification.ts` compared the deprecated `getNodeByRef(...)` (which returns `undefined` on a miss) against `!== null`, which was always `true` — a dead existence check masquerading as a real one; and `semantic-coverage/reconciliation.ts`'s `candidatesCoveringUnit` used a label-`startsWith()` prefix hack for nesting containment (a real silent-cross-occurrence-merge risk class), now replaced with a genuine ancestor-chain check via `index.getAncestors(anchor.structuralNodeId)`.

## G. The two highest-severity/highest-consequence consumer fixes — what exactly changed?

`semantic/tools.ts` (LLM-facing evidence tools, the CRITICAL SAFETY FIX): `getOperativeProvision`/`getReferencedProvision` previously handed the model whatever `getNodeByRef` returned with no signal about whether that resolution was unique. They now call `resolveUniqueNodeByRef` and branch explicitly: UNIQUE returns real evidence, NOT_FOUND and AMBIGUOUS are reported to the model as such (with `AMBIGUOUS` candidate counts surfaced), never silently substituting an arbitrary occurrence at the same confidence as a unique one. `discovery/pass-d-reconcile.ts` (the discovery-reconciliation layer): `mergeKey` was built from the full label-shaped `structuralNodeKeys` array, meaning two candidates anchored to *different* physical occurrences that happened to share a label could be silently merged into one. `mergeKey` now uses `structuralNodeIds[0]` (a real physical occurrence id) — this closes a silent cross-occurrence candidate-merge defect at the exact stage Phase 2B's own discovery reconciliation runs.

## H. Structural health v2 and the 16 invariants (I1–I16) — implemented, and how verified?

All 16 hold. Health finding codes implemented and actually emitted (not merely declared): `DUPLICATE_OCCURRENCE_ID`, `IMPOSSIBLE_PARENT`, `ORPHANED_NODE`, `CYCLE`, `INVALID_SOURCE_SPAN`, `OVERLAPPING_INCOMPATIBLE_SPAN` (new this phase — I12's parent-span-nesting check), `AMBIGUOUS_LEGAL_REFERENCE` (new this phase, distinct from but companion to `DUPLICATE_LABEL_EXPECTED`), `DUPLICATE_LABEL_EXPECTED`, `DUPLICATE_NORMALIZED_PATH` (new this phase — whole-subtree duplication, distinct from a single duplicated leaf label), `SOURCE_ORDER_VIOLATION`, `CROSS_DOCUMENT_PARENT`. `MULTIPLE_STRUCTURAL_PARENTS` is declared per the ADR's own health-code table but documented as structurally unreachable under the current single-scalar-`parentNodeId`-field data model — never fabricated as "detected" when it cannot occur. `DUPLICATE_LABEL_EXPECTED`/`AMBIGUOUS_LEGAL_REFERENCE`/`DUPLICATE_NORMALIZED_PATH` are strictly INFO-severity and never gate anything; only identity-level violations (I1/I5/I6/I7/I9/I10/I11/I12/I14) are ERROR-severity. Verification: `structural-integrity-results.json` maps each invariant to the specific test(s) asserting it. See I. for the test suites themselves.

## I. What test coverage was actually written, and does it pass?

Three new test files, 44 tests, all passing:

- `structural-node-identity-invariants.test.ts` (24 tests) — one or more targeted tests per invariant I1–I16, using hand-constructed `StructuralNode[]` so violations the real parser would never produce (I5 collisions, I10 orphans, I11 cycles, I12 malformed spans) can be deliberately synthesized and checked.
- `structural-node-identity-property.test.ts` (13 tests) — 11 named adversarial categories run through the *real* parser (duplicate sections, table-of-contents + operative duplicates, repeated markers, quoted amendment text, schedule/exhibit numbering restarts, embedded-heading definitions, parenthetical cross-references, malformed hierarchy, missing levels, zero-newline text, whitespace corruption), plus a seeded (`mulberry32`, seed `0x5f3759df`) property-based fuzz suite generating 1,500 synthetic documents combining all categories at random, each checked against I1/I7/I9/I13/zero-ERROR-findings. Config/seed preserved in `structural-identity-property-test-config.json` for exact reproduction.
- `structural-persistence-identity.test.ts` (7 tests) — see Q.

`scripts/phase-3f1-2-post-remediation-repro.ts` re-runs the exact synthetic documents from the original architecture-proposal's minimal reproduction (`scripts/architecture-proposal-node-identity-repro.ts`, preserved unchanged as frozen "before" evidence) and demonstrates, side by side: both previously-unreachable occurrences now independently reachable via `getNodeById`; `resolveUniqueNodeByRef` correctly reports AMBIGUOUS; the deprecated `getNodeByRef` now safely returns `undefined` instead of an arbitrary pick; and the previously-demonstrable child-list cross-merge no longer occurs.

## J. Known-package structural regression (FWRG/LSB/CONMED/DSGR) — results?

All four packages, re-parsed through the real, unmodified (post-remediation) `runStructureStage`/`buildStructuralIndex` over their real, already-preserved source text (FWRG/LSB via the existing `article-6-negative-covenants.txt`/`definitions-excerpt.txt` fixtures; CONMED via the real production HTML extractor over its 4 real `.htm` filings; DSGR via its 4 real already-extracted `.txt` documents):

| Package | Nodes | nodeId collisions | ERROR findings | Cross-parent merges | Duplicate-legal-ref occurrences (informational, I2) |
|---|---|---|---|---|---|
| FWRG | 418 | 0 | 0 | 0 | 0 |
| LSB | 76 | 0 | 0 | 0 | 0 |
| CONMED | 2,736 | 0 | 0 | 0 | 413 |
| DSGR | 4,149 | 0 | 0 | 0 | 680 |

`allPackagesPassStructuralIdentityGate: true`. Full per-package health-finding detail preserved in `known-package-structural-health-findings.json`. This is a structural-identity-only check — it makes no claim about, and does not re-score, any package's semantic/discovery/coverage completeness.

## K. DSGR reconciliation — does the fix actually close the previously-measured population?

Yes, exactly. The frozen pre-remediation evidence (`tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-nodes.json`, cited verbatim in the ADR's own collision census) shows 4,149 total nodes, 546 nodeKeys shared by more than one physical occurrence, 680 excess duplicate instances that would each have silently overwritten an earlier occurrence under the old scheme. Re-parsing the same real DSGR source through the current pipeline produces the *same* 4,149 total nodes and the *same* 546 duplicated legal-reference labels (confirming the parser's own pattern-matching logic is unchanged — only the identity substrate changed) but **zero** nodeId collisions: every one of those occurrences now has its own distinct, independently-reachable `nodeId`. This is explicitly **not** a claim that DSGR's semantic/discovery/coverage omissions (Phase 3F.1.1's own 89-case residual population) are fixed — only that the structural-identity substrate underneath them no longer corrupts occurrence identity. Full detail in `dsgr-structural-identity-reconciliation.json`.

## L. Contamination check — any package-specific production logic introduced?

None. `git diff lib/` contains zero occurrences of FWRG/LSB/CONMED/DSGR/Coherent/Matthews (or any other known-company identifier) in the actual code changes. Two pre-existing header comments (`amendment/pipeline.ts`, `amendment/independent-verification.ts`, both from Phase 2G, untouched by this phase) cite CONMED as evidence provenance in prose — comments citing evidence is explicitly permitted; no decision logic anywhere branches on a package identifier.

## M. Performance — before/after on the largest known package?

Measured over DSGR (4,149 real nodes, the largest known package), 20 runs each, construction-only timing: pre-3F.1.2 `buildStructuralIndex` (git commit `d1d48da`, last committed version) mean 2.4ms; post-3F.1.2 (working tree) mean 15.6ms — roughly a 5.5x relative increase, entirely attributable to the new I1–I16 structural-health diagnostic pass (per-node ancestor-chain cycle detection, span validation, duplicate-path computation) that did not exist before. In absolute terms both remain single-digit-to-low-double-digit milliseconds for the largest known real package — negligible next to the seconds-scale LLM calls elsewhere in the same pipeline (Phase 2B/3B/3C/3D/3E). Full detail in `structural-identity-performance-comparison.json`.

## N. Compatibility — were dangerous old APIs kept alive merely because callers exist?

No. `nodeKey`/`parentSectionRef` are marked `@deprecated` and kept only as display/logging fields — no production code path treats them as identity any more. The one API that keeps its pre-3F.1.2 signature, `getNodeByRef(documentId, sectionRef): StructuralNode | undefined`, was not kept merely for caller convenience: its *contract* was changed to be safe (undefined on ambiguity, never an arbitrary occurrence) rather than removed, because every remaining caller of that exact shape was verified to only need "give me a node or nothing" existence-style behavior, not a specific occurrence — a caller needing a specific occurrence was migrated to `resolveUniqueNodeByRef` instead (category E in F. above). No dangerous compatibility function was preserved.

## O. Full regression suite, gate verdict, and disclosed limitations?

See the full regression suite section immediately below, and the disclosed DB-availability limitation in the persistence section — no DB pass is fabricated; `structural-persistence-identity.test.ts`'s 7 mocked tests are explicitly labeled as a deterministic substitute, not a replacement, for the real-DB coverage in `structural-persistence.test.ts`.

## Full Regression Suite

- **TypeScript** (`npx tsc --noEmit`): 0 errors across `lib/`, `app/`, `scripts/`, and `tests/`.
- **ESLint** (`npx eslint lib/contract-model/compiler/`): 0 issues.
- **Production build** (`npx next build`): compiles successfully, all routes generate.
- **Vitest** (`npx vitest run`): **1,226 passed**, 104 failed, 167 skipped (1,497 total; 106 of 154 test files fully passing). A structured (JSON-reporter) pass over every individual failing assertion confirms **all 104 failures are `PrismaClientInitializationError: Can't reach database server at localhost:5432`** — this environment has no reachable Postgres instance (pre-existing, unrelated to this phase's changes; confirmed via `npx prisma db pull` failing with the identical P1001 error before any test ran). Zero non-DB failures remain.
- **`golden-test`** (`npx tsx scripts/golden-test.ts`): not run — it is Prisma-backed (loads `GoldenTest` rows) and would fail for the identical pre-existing DB-unavailability reason, not a code defect.

### Two real regressions found and fixed during this pass (both now resolved, both re-verified passing)

1. **`semantic-coverage/reconciliation.ts` crash** (`Cannot read properties of undefined (reading 'some')`, `tests/contract-model/semantic-coverage-real-fwrg-regression.test.ts` and `semantic-coverage-real-lsb-regression.test.ts`, 6 tests): the frozen, real, pre-migration Phase 2B discovery-run JSON these regression tests load only ever carried `structuralNodeKeys` (never `structuralNodeIds`, which did not exist when it was captured). Fixed in `scripts/phase-3e-real-package-regression.ts`'s `loadRealDiscoveredCandidates` by resolving each frozen candidate's legacy keys against the real current structural index at load time (`index.findNodesByRef`) — the frozen JSON itself is untouched, per this session's historical-artifact-integrity discipline; only the loader now derives real occurrence identity from real current evidence rather than leaving the new required field `undefined`.
2. **Directory-guard collision, not a code regression**: two independence/contamination-guard tests from the prior 3F.1.1/ARCH-PROP phases (`architecture-proposal-node-identity.test.ts`, `phase-3f1-1-forensic-machinery.test.ts`) assert that `tests/fixtures/unseen-packages/` contains no unexpected new top-level entry (a guard against silent new-package selection). This phase's own `known-package-structural-regression.json` evidence artifact was initially written there and tripped that guard. Fixed by relocating it to `tests/fixtures/architecture-audits/` (where every other artifact from this and the prior ARCH-PROP phase already lives) — the guard itself was not touched or weakened.
3. **One test intentionally updated, not "fixed"**: `architecture-proposal-node-identity.test.ts`'s first test originally asserted the pre-remediation DEFECT itself (`getNodeByRef` silently picking the later of two colliding occurrences). Since fixing that exact defect is this phase's mandate, the assertion was updated to check the new, correct, safe-by-omission behavior (`getNodeByRef` returns `undefined`; `resolveUniqueNodeByRef` reports `AMBIGUOUS`; both occurrences remain independently reachable via `getNodeById`) — this is not weakening a safety gate, it is retiring a test that could only pass by requiring the bug to remain present forever.

## Required Artifacts (8)

1. `docs/phase-3f1-2-structural-identity-remediation.md` (this document)
2. `tests/fixtures/architecture-audits/structural-identity-consumer-migration.json`
3. `tests/fixtures/architecture-audits/structural-integrity-results.json`
4. `tests/fixtures/architecture-audits/known-package-structural-regression.json`
5. `tests/fixtures/architecture-audits/dsgr-structural-identity-reconciliation.json`
6. `tests/fixtures/architecture-audits/structural-persistence-regression.json`
7. `tests/fixtures/architecture-audits/structural-identity-property-test-config.json`
8. `tests/fixtures/architecture-audits/structural-identity-remediation-integrity-manifest.json`

(Additionally preserved, not double-counted against the 8: `structural-identity-post-remediation-repro.json`, `known-package-structural-health-findings.json`, `structural-identity-performance-comparison.json`.)

## Verdict

**PHASE_3F_1_2_STRUCTURAL_IDENTITY_REMEDIATION_GATE_PASSED**
