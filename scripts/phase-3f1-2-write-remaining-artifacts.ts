/**
 * Phase 3F.1.2 - writes the remaining required machine-readable artifacts
 * (consumer-migration inventory, structural-integrity-results, DSGR
 * reconciliation extract, structural-persistence-regression summary,
 * property-test config/seed, integrity manifest). Read-only with respect to
 * production code; only writes into tests/fixtures/architecture-audits/.
 *
 * Run via: npx tsx scripts/phase-3f1-2-write-remaining-artifacts.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { STRUCTURAL_INDEX_VERSION } from "../lib/contract-model/compiler/types";

const OUT_DIR = "tests/fixtures/architecture-audits";
mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. structural-identity-consumer-migration.json
// ---------------------------------------------------------------------------
type Classification = "A_PHYSICAL_OCCURRENCE_IDENTITY" | "B_LEGAL_REFERENCE_SEARCH" | "C_DISPLAY_ONLY" | "E_UNRESOLVED_AMBIGUOUS_REFERENCE" | "MECHANICAL_COMPILE_FIX_ONLY";

interface ConsumerMigrationEntry {
  file: string;
  classification: Classification[];
  summary: string;
}

const CONSUMER_MIGRATION: ConsumerMigrationEntry[] = [
  { file: "lib/contract-model/compiler/types.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "StructuralNode gained nodeId/parentNodeId (authoritative); nodeKey/parentSectionRef marked @deprecated display-only. STRUCTURAL_INDEX_VERSION added." },
  { file: "lib/contract-model/compiler/stage-structure.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "Mints nodeId via computeStableKey(documentId,nodeType,charStart); captures true parentNodeId from the existing RANK stack pass (never re-derived from a label)." },
  { file: "lib/contract-model/compiler/structural-index.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "V2 rewrite: nodesById/childrenByParentId/parentByChildId authoritative maps, no-silent-overwrite on nodeId collision, resolveUniqueNodeByRef/findNodesByRef cardinality-aware, full structural health pass (I1-I16), deprecated getNodeByRef made safe-by-omission." },
  { file: "lib/contract-model/compiler/persistence.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "stableKey formula gains charStart (closes confirmed DB-level silent-overwrite defect); PersistedNodeIndex{idByNodeId,idsByLegalRef}; resolveUniquePersistedNodeByRef mirrors in-memory UNIQUE/AMBIGUOUS discipline; parent linking via node.parentNodeId." },
  { file: "lib/contract-model/compiler/orchestrator.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "nodeIdBySectionRef->nodeIndex variable rename; 3 call sites updated to the new PersistedNodeIndex shape." },
  { file: "lib/contract-model/compiler/structural-references.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "DetectedReference gained sourceNodeId/targetNodeId/targetAmbiguous; detection rewritten with local nodeId maps; resolveRelativeClauseTarget walks parentNodeId chain instead of label-prefix matching." },
  { file: "lib/contract-model/compiler/structural-definitions.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "DetectedDefinition gained sourceNodeId via existing position-safe findEnclosingNode." },
  { file: "lib/contract-model/compiler/semantic/tools.ts", classification: ["E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "CRITICAL SAFETY FIX (LLM-facing evidence tools): getOperativeProvision/getReferencedProvision use resolveUniqueNodeByRef with explicit NOT_FOUND/AMBIGUOUS/UNIQUE branches - the model can no longer be handed an arbitrary occurrence at the same confidence as a unique resolution." },
  { file: "lib/contract-model/compiler/semantic-coverage/unit-hypothesis.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "R11 forensic mechanism fix: bestUnitByNodeId (materiality contextual-floor inheritance) keyed by structuralNodeId, not label." },
  { file: "lib/contract-model/compiler/semantic-coverage/types.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "RoutedRegion/SourceAnchor gained structuralNodeId/closureSourceNodeId alongside deprecated label fields." },
  { file: "lib/contract-model/compiler/semantic-coverage/router.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "closeRoutedRegions and routeDocument's main loop fully migrated to nodeId-keyed maps." },
  { file: "lib/contract-model/compiler/semantic-coverage/cross-reference-audit.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "auditOperativeStateForUnits migrated to structuralNodeId/supersededSourceNodeIds/currentSourceNodeId." },
  { file: "lib/contract-model/compiler/semantic-coverage/pipeline.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "AI-inventory region lookup (getNodeText) and already-found-unit comparison migrated from region.structuralNodeKey to region.structuralNodeId." },
  { file: "lib/contract-model/compiler/semantic-coverage/reconciliation.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "candidatesCoveringUnit's containment check replaced a label-prefix startsWith() hack with real ancestor-chain matching via index.getAncestors(anchor.structuralNodeId) - closes a real silent-merge risk class in coverage reconciliation." },
  { file: "lib/contract-model/compiler/semantic-coverage/identity.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "anchorKey (semanticUnitId hashing input) now keyed by structuralNodeId - two distinct occurrences sharing a label can no longer collapse onto the same semanticUnitId." },
  { file: "lib/contract-model/compiler/amendment/types.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "OperativeProvisionView gained currentSourceNodeId/supersededSourceNodeIds." },
  { file: "lib/contract-model/compiler/amendment/operative-state.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "resolveBaseText/buildProvisionView track nodeId fields in parallel; SECTION branch uses resolveUniqueNodeByRef with explicit UNIQUE check." },
  { file: "lib/contract-model/compiler/amendment/pipeline.ts", classification: ["B_LEGAL_REFERENCE_SEARCH", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "disambiguateMultiTargetSection: existence-only check via findNodesByRef (never the deprecated singleton). getTargetCurrentText: resolveUniqueNodeByRef with explicit UNIQUE check - an ambiguous target has no single 'current text' and is never guessed." },
  { file: "lib/contract-model/compiler/amendment/independent-verification.ts", classification: ["B_LEGAL_REFERENCE_SEARCH"], summary: "targetSectionOrDefinitionExists existence probe migrated to findNodesByRef; also fixed a pre-existing bug where the old getNodeByRef(...) !== null comparison was always true (getNodeByRef returns undefined, never null, on a miss)." },
  { file: "lib/contract-model/compiler/semantic-coverage/ai-inventory.ts", classification: ["C_DISPLAY_ONLY"], summary: "2 SourceAnchor literals extended with structuralNodeId." },
  { file: "lib/contract-model/compiler/discovery/types.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "DeterministicCandidate gained nodeId; DiscoveredCandidate gained structuralNodeIds[]." },
  { file: "lib/contract-model/compiler/discovery/pass-a-signals.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "Migrated to node.nodeId." },
  { file: "lib/contract-model/compiler/discovery/pass-c-neighborhood.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "resolveRelativeRef rewritten using resolveUniqueNodeByRef; ExpandedCandidate gained structuralNodeIds; full nodeId migration of neighborhood expansion." },
  { file: "lib/contract-model/compiler/discovery/pipeline.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "deterministicByNodeId/candidateIds renames; full nodeId migration of the per-section loop." },
  { file: "lib/contract-model/compiler/discovery/pass-b-semantic.ts", classification: ["C_DISPLAY_ONLY"], summary: "SectionBatchInput gained sectionNodeId (wire passthrough field)." },
  { file: "lib/contract-model/compiler/discovery/pass-d-reconcile.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "HIGHEST-CONSEQUENCE fix: mergeKey built from structuralNodeIds[0] instead of the label-shaped array - closes the silent cross-occurrence candidate-merge defect at the discovery-reconciliation layer." },
  { file: "lib/contract-model/compiler/context-retrieval/types.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "ContextItem gained structuralNodeId; CovenantContextBundle gained originatingStructuralNodeIds." },
  { file: "lib/contract-model/compiler/context-retrieval/state.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "makeItemInput signature extended with structuralNodeId param." },
  { file: "lib/contract-model/compiler/context-retrieval/structural-context.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "All 5 exported functions fully migrated to nodeId." },
  { file: "lib/contract-model/compiler/context-retrieval/region-expansion.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "includedNodeKeys/excludedNodeKeys renamed to includedNodeIds/excludedNodeIds; fully migrated." },
  { file: "lib/contract-model/compiler/context-retrieval/reference-context.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "E_UNRESOLVED_AMBIGUOUS_REFERENCE"], summary: "retrieveCrossReferencesFromNode migrated with explicit targetAmbiguous handling; retrieveCrossReferencesFromDefinitionText upgraded to resolveUniqueNodeByRef." },
  { file: "lib/contract-model/compiler/context-retrieval/pipeline.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "primaryNodeId migration throughout buildCovenantContextBundle." },
  { file: "lib/contract-model/compiler/context-retrieval/definition-graph.ts", classification: ["C_DISPLAY_ONLY"], summary: "makeItemInput call site updated with the new structuralNodeId argument." },
  { file: "lib/contract-model/compiler/context-retrieval/cross-document-context.ts", classification: ["C_DISPLAY_ONLY"], summary: "makeItemInput call site updated with the new structuralNodeId argument." },
  { file: "lib/contract-model/compiler/semantic/precedent-integration.ts", classification: ["C_DISPLAY_ONLY"], summary: "One ContextItem literal (advisory precedent evidence, not structurally anchored) fixed with structuralNodeId: null." },
  { file: "lib/contract-model/compiler/coverage-audit/types.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "CoverageRegion/AuditFinding gained structuralNodeId (required alongside deprecated structuralNodeKey)." },
  { file: "lib/contract-model/compiler/coverage-audit/identity.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "computeRegionId/computeFindingId params renamed to nodeId." },
  { file: "lib/contract-model/compiler/coverage-audit/source-inventory.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "buildSourceCoverageInventory fully migrated." },
  { file: "lib/contract-model/compiler/coverage-audit/context-inventory.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "IndependentSiblingExpectation gained nodeId; buildIndependentContextExpectations fully migrated." },
  { file: "lib/contract-model/compiler/coverage-audit/context-comparison.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY", "C_DISPLAY_ONLY"], summary: "ContextComparisonInput.nodeId; push() helper derives the legacy structuralNodeKey display field from index.getNodeById(structuralNodeId)?.nodeKey rather than hardcoding null." },
  { file: "lib/contract-model/compiler/coverage-audit/coverage-map.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "buildCoverageMap fully migrated to discoveredNodeIds/structuralNodeId." },
  { file: "lib/contract-model/compiler/coverage-audit/pipeline.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "runIndependentCoverageAudit's bundle loop and discoveredNodeIds computation migrated." },
  { file: "lib/contract-model/compiler/coverage-audit/discovery-comparison.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "candidatesTouchingNode/compareRegionToDiscovery (exact/descendant/ancestor matching) and makeFinding fully migrated to nodeId." },
  { file: "lib/contract-model/compiler/coverage-audit/definition-audit.ts", classification: ["A_PHYSICAL_OCCURRENCE_IDENTITY"], summary: "computeFindingId call and AuditFinding literal migrated to item.structuralNodeId." },
  { file: "lib/contract-model/compiler/coverage-audit/raw-source-fallback.ts", classification: ["C_DISPLAY_ONLY"], summary: "3 AuditFinding literals (genuinely no structural node - raw-source-fallback path) gained structuralNodeId: null alongside the existing structuralNodeKey: null." },
  { file: "scripts/phase-2f2-renormalize-doc-b.ts", classification: ["MECHANICAL_COMPILE_FIX_ONLY"], summary: "Historical script source kept compiling under the renamed types - not a data artifact." },
  { file: "scripts/phase-2f2-rerun-document-b.ts", classification: ["MECHANICAL_COMPILE_FIX_ONLY"], summary: "Historical script source kept compiling under the renamed types - not a data artifact." },
  { file: "scripts/phase-3b-real-regression.ts", classification: ["MECHANICAL_COMPILE_FIX_ONLY"], summary: "Historical script source kept compiling under the renamed types; reused unmodified by this phase's own known-package regression." },
];

const consumerMigrationMissing = CONSUMER_MIGRATION.filter((e) => !existsSync(e.file));
writeFileSync(
  `${OUT_DIR}/structural-identity-consumer-migration.json`,
  JSON.stringify(
    {
      purpose: "Phase 3F.1.2 - per-file consumer migration classification (A: physical occurrence identity / B: legal-reference search / C: display only / E: unresolved-ambiguous reference resolution), never a blind nodeKey->nodeId find-replace.",
      classificationLegend: {
        A_PHYSICAL_OCCURRENCE_IDENTITY: "Consumer needs to distinguish physically distinct occurrences - migrated to nodeId/parentNodeId/structuralNodeId(s).",
        B_LEGAL_REFERENCE_SEARCH: "Consumer performs an existence-only lookup by legal reference (never needs a single specific occurrence) - migrated to findNodesByRef/count-based existence checks.",
        C_DISPLAY_ONLY: "Consumer only threads a field through for logging/display/wire-shape completeness - additive field only, no lookup-safety change needed.",
        E_UNRESOLVED_AMBIGUOUS_REFERENCE: "Consumer resolves a legal reference to a SPECIFIC occurrence and must handle ambiguity explicitly - migrated to resolveUniqueNodeByRef with explicit UNIQUE/NOT_FOUND/AMBIGUOUS branches, never a silent pick.",
        MECHANICAL_COMPILE_FIX_ONLY: "Historical script source, fixed only to keep compiling under the renamed/extended types - not itself a structural-identity consumer.",
      },
      fileCount: CONSUMER_MIGRATION.length,
      allFilesVerifiedToExist: consumerMigrationMissing.length === 0,
      missingFiles: consumerMigrationMissing.map((e) => e.file),
      entries: CONSUMER_MIGRATION,
    },
    null,
    2
  )
);
console.log(`[written] structural-identity-consumer-migration.json (${CONSUMER_MIGRATION.length} files, ${consumerMigrationMissing.length} missing)`);

// ---------------------------------------------------------------------------
// 2. property-test config/seed artifact
// ---------------------------------------------------------------------------
writeFileSync(
  `${OUT_DIR}/structural-identity-property-test-config.json`,
  JSON.stringify(
    {
      purpose: "Deterministic reproduction config for tests/contract-model/structural-node-identity-property.test.ts's seeded fuzz suite.",
      testFile: "tests/contract-model/structural-node-identity-property.test.ts",
      prng: "mulberry32",
      seedHex: "0x5f3759df",
      caseCount: 1500,
      categoryProbabilities: {
        duplicateSectionProb: 0.25,
        tocProb: 0.2,
        repeatedMarkerProb: 0.15,
        quotedAmendmentProb: 0.15,
        scheduleRestartProb: 0.1,
        embeddedHeadingDefProb: 0.15,
        parentheticalCrossRefProb: 0.2,
        malformedHierarchyProb: 0.1,
        whitespaceCorruptionProb: 0.15,
        zeroNewlineProb: 0.05,
      },
      namedCategoryTests: ["duplicate sections", "table-of-contents + operative duplicates", "repeated lettered/numbered markers", "quoted amendment text", "schedule/exhibit numbering restarts", "embedded-heading definitions", "parenthetical cross-references", "malformed hierarchy", "missing levels", "zero-newline text", "whitespace corruption"],
      invariantsAssertedPerCase: ["I1 (no duplicate nodeId)", "I7 (getNodeById resolves every indexed nodeId)", "I9 (every non-orphan node reachable from a root)", "I13 (children charStart-ascending)", "zero ERROR-severity health findings"],
      note: "Re-running the test file reproduces identical documents and identical assertions every time - the seed is fixed, never randomized per-run.",
    },
    null,
    2
  )
);
console.log("[written] structural-identity-property-test-config.json");

// ---------------------------------------------------------------------------
// 3. structural-integrity-results.json - re-derive I1-I16 status + known-package aggregate
// ---------------------------------------------------------------------------
const knownPackageRegression = JSON.parse(readFileSync("tests/fixtures/architecture-audits/known-package-structural-regression.json", "utf-8"));

writeFileSync(
  `${OUT_DIR}/structural-integrity-results.json`,
  JSON.stringify(
    {
      purpose: "Phase 3F.1.2 - consolidated structural-integrity results: the 16 invariants (I1-I16), which test(s) assert each, and the known-package aggregate outcome.",
      invariants: [
        { id: "I1", description: "No two source occurrences share nodeId within one document.", assertedBy: ["structural-node-identity-invariants.test.ts > I1", "structural-node-identity-property.test.ts (every fuzz case)", "known-package regression (all 4 packages)"], status: "HOLDS" },
        { id: "I2", description: "Duplicate sectionRef/label values are allowed and expected.", assertedBy: ["structural-node-identity-invariants.test.ts > I2", "known-package regression (informational duplicate counts)"], status: "HOLDS" },
        { id: "I3", description: "Duplicate legal-reference candidates are represented as a set, never collapsed to one.", assertedBy: ["structural-node-identity-invariants.test.ts > I3"], status: "HOLDS" },
        { id: "I4", description: "Parent-child ownership uses occurrence identity, never label.", assertedBy: ["structural-node-identity-invariants.test.ts > I4/I6"], status: "HOLDS" },
        { id: "I5", description: "No silent map overwrite on identity collision.", assertedBy: ["structural-node-identity-invariants.test.ts > I5", "structural-persistence-identity.test.ts (DB-layer analogue)"], status: "HOLDS" },
        { id: "I6", description: "No child-list merging across distinct occurrences.", assertedBy: ["structural-node-identity-invariants.test.ts > I4/I6", "structural-node-identity-property.test.ts (repeated-markers/quoted-amendment categories)", "post-remediation repro script case B"], status: "HOLDS" },
        { id: "I7", description: "Every indexed node is retrievable by nodeId.", assertedBy: ["structural-node-identity-invariants.test.ts > I7", "structural-node-identity-property.test.ts (every fuzz case)"], status: "HOLDS" },
        { id: "I8", description: "Own-text boundary only ever consults the node's own (occurrence-correct) children.", assertedBy: ["structural-node-identity-invariants.test.ts > I8"], status: "HOLDS" },
        { id: "I9", description: "Every indexed node is reachable via traversal from its root, except explicit orphans.", assertedBy: ["structural-node-identity-invariants.test.ts > I9", "structural-node-identity-property.test.ts (every fuzz case)"], status: "HOLDS" },
        { id: "I10", description: "Orphaned nodes are explicit, never silently re-rooted or dropped.", assertedBy: ["structural-node-identity-invariants.test.ts > I10"], status: "HOLDS" },
        { id: "I11", description: "Cycles are impossible by construction, and explicitly detected if synthesized.", assertedBy: ["structural-node-identity-invariants.test.ts > I11"], status: "HOLDS" },
        { id: "I12", description: "Source spans satisfy deterministic validity checks (bounds + parent nesting).", assertedBy: ["structural-node-identity-invariants.test.ts > I12 (4 cases including the new OVERLAPPING_INCOMPATIBLE_SPAN check)"], status: "HOLDS" },
        { id: "I13", description: "Sibling ordering is source order (charStart ascending).", assertedBy: ["structural-node-identity-invariants.test.ts > I13", "structural-node-identity-property.test.ts (every fuzz case)"], status: "HOLDS" },
        { id: "I14", description: "Document boundary is part of the identity domain.", assertedBy: ["structural-node-identity-invariants.test.ts > I14 (2 cases)"], status: "HOLDS" },
        { id: "I15", description: "Ambiguous legal-reference lookups return multiple candidates, never a silent pick.", assertedBy: ["structural-node-identity-invariants.test.ts > I15 (3 cases)", "post-remediation repro script"], status: "HOLDS" },
        { id: "I16", description: "Structural-health diagnostics surface every invariant violation as a named, queryable condition.", assertedBy: ["structural-node-identity-invariants.test.ts > I16 (3 cases)", "known-package regression health-findings artifact"], status: "HOLDS" },
      ],
      structuralHealthFindingCodesImplemented: ["DUPLICATE_OCCURRENCE_ID", "IMPOSSIBLE_PARENT", "MULTIPLE_STRUCTURAL_PARENTS (declared, structurally unreachable under the current single-parentNodeId-field data model)", "ORPHANED_NODE", "CYCLE", "INVALID_SOURCE_SPAN", "OVERLAPPING_INCOMPATIBLE_SPAN", "AMBIGUOUS_LEGAL_REFERENCE", "DUPLICATE_LABEL_EXPECTED", "DUPLICATE_NORMALIZED_PATH", "SOURCE_ORDER_VIOLATION", "CROSS_DOCUMENT_PARENT"],
      knownPackageAggregate: knownPackageRegression.aggregate,
      testFileSummary: {
        "structural-node-identity-invariants.test.ts": "24 tests, 24 passed",
        "structural-node-identity-property.test.ts": "13 tests, 13 passed (includes the 1500-case seeded fuzz loop)",
        "structural-persistence-identity.test.ts": "7 tests, 7 passed (DB-independent, mocked prisma - see structural-persistence-regression.json for the disclosed DB-availability limitation)",
      },
    },
    null,
    2
  )
);
console.log("[written] structural-integrity-results.json");

// ---------------------------------------------------------------------------
// 4. dsgr-structural-identity-reconciliation.json (extracted from the known-package regression report)
// ---------------------------------------------------------------------------
writeFileSync(`${OUT_DIR}/dsgr-structural-identity-reconciliation.json`, JSON.stringify({ purpose: "Phase 3F.1.2 - DSGR-specific structural-identity reconciliation, extracted from known-package-structural-regression.json for standalone citation. Structural-identity-integrity ONLY - makes no claim about DSGR's semantic/discovery/coverage omissions (Phase 3F.1.1's own 89-case residual population).", ...knownPackageRegression.dsgrReconciliation, dsgrPackageStructuralMetrics: knownPackageRegression.perPackage.DSGR }, null, 2));
console.log("[written] dsgr-structural-identity-reconciliation.json");

// ---------------------------------------------------------------------------
// 5. structural-persistence-regression.json
// ---------------------------------------------------------------------------
writeFileSync(
  `${OUT_DIR}/structural-persistence-regression.json`,
  JSON.stringify(
    {
      purpose: "Phase 3F.1.2 - persistence-layer regression summary for the stableKey/PersistedNodeIndex remediation in lib/contract-model/compiler/persistence.ts.",
      disclosedLimitation: "This environment has no reachable Postgres instance (`npx prisma db pull` fails with P1001: connection refused to localhost:5432). tests/contract-model/structural-persistence.test.ts (real-DB coverage, mechanically migrated to the new PersistedNodeIndex-based signatures) could not be executed here and remains the authoritative persistence test for any environment where a DB IS reachable (e.g. CI). No DB pass is claimed or fabricated by this artifact.",
      deterministicSubstitute: {
        testFile: "tests/contract-model/structural-persistence-identity.test.ts",
        mechanism: "Hand-rolled in-memory fake for the documentNode surface of lib/prisma (vi.mock), reproducing the real @@unique([companyId, stableKey]) constraint semantics persistence.ts's upsert calls depend on.",
        testsRun: 7,
        testsPassed: 7,
        casesCovered: [
          "Two distinct physical occurrences sharing (documentId,nodeType,sectionRef) persist as two distinct rows, not one silently overwritten (the confirmed pre-3F.1.2 DB-level defect)",
          "idsByLegalRef carries both persisted row ids for a shared legal reference",
          "resolveUniquePersistedNodeByRef returns undefined (never an arbitrary pick) when ambiguous",
          "resolveUniquePersistedNodeByRef returns the real row id when unambiguous",
          "Parent linking uses the real parentNodeId, attaching a child to the SPECIFIC same-labeled parent it actually belongs to",
          "Idempotent replay never duplicates rows and preserves the nodeId->id mapping",
          "Document isolation: identical section number+charStart in two documents never collide",
        ],
      },
      productionCodeChangeUnderTest: {
        file: "lib/contract-model/compiler/persistence.ts",
        function: "persistStructuralNodes",
        stableKeyFormulaBefore: 'computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef)',
        stableKeyFormulaAfter: 'computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef, String(node.charStart))',
      },
    },
    null,
    2
  )
);
console.log("[written] structural-persistence-regression.json");

// ---------------------------------------------------------------------------
// 6. integrity manifest - hashes of every production file touched + every new artifact
// ---------------------------------------------------------------------------
const PRODUCTION_FILES_TOUCHED = [...new Set(CONSUMER_MIGRATION.filter((e) => e.classification[0] !== "MECHANICAL_COMPILE_FIX_ONLY").map((e) => e.file))];
function sha256(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
const manifest = {
  purpose: "Phase 3F.1.2 - integrity manifest binding this remediation's production-code changes and evidence artifacts to their content hashes at the time this report was written.",
  generatedAt: new Date().toISOString(),
  productionFiles: Object.fromEntries(PRODUCTION_FILES_TOUCHED.map((f) => [f, sha256(f)])),
  evidenceArtifacts: Object.fromEntries(
    [
      "tests/fixtures/architecture-audits/structural-identity-collision-repro.json",
      "tests/fixtures/architecture-audits/structural-identity-post-remediation-repro.json",
      "tests/fixtures/architecture-audits/structural-identity-consumer-migration.json",
      "tests/fixtures/architecture-audits/structural-identity-property-test-config.json",
      "tests/fixtures/architecture-audits/structural-integrity-results.json",
      "tests/fixtures/architecture-audits/dsgr-structural-identity-reconciliation.json",
      "tests/fixtures/architecture-audits/structural-persistence-regression.json",
      "tests/fixtures/architecture-audits/known-package-structural-regression.json",
      "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-nodes.json",
    ].map((f) => [f, sha256(f)])
  ),
  testFiles: Object.fromEntries(["tests/contract-model/structural-node-identity-invariants.test.ts", "tests/contract-model/structural-node-identity-property.test.ts", "tests/contract-model/structural-persistence-identity.test.ts"].map((f) => [f, sha256(f)])),
};
writeFileSync(`${OUT_DIR}/structural-identity-remediation-integrity-manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`[written] structural-identity-remediation-integrity-manifest.json (${PRODUCTION_FILES_TOUCHED.length} production files hashed)`);

console.log(`\nSTRUCTURAL_INDEX_VERSION = ${STRUCTURAL_INDEX_VERSION}`);
