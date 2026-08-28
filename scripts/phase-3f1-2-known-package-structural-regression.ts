/**
 * Phase 3F.1.2 - known-package structural-identity regression over
 * FWRG/LSB/CONMED/DSGR (task's own "known regression assets, never tune
 * production logic to them"). This is a STRUCTURAL-IDENTITY-ONLY check: it
 * re-runs the real, unmodified (post-remediation) production functions
 * (runStructureStage, buildStructuralIndex) over each package's real,
 * already-preserved source text and reports occurrence-ID collisions,
 * silent-overwrite evidence, cross-parent merges, and structural health
 * findings. It does NOT re-score semantic/discovery/coverage output against
 * ground truth (that is Phase 3E/3B/3C/2E territory, out of this bounded
 * remediation's scope) and makes NO claim about DSGR's semantic omissions
 * being fixed - only about structural occurrence-identity integrity.
 *
 * Sources (all already-preserved, real, previously-committed evidence -
 * nothing newly fetched):
 *  - FWRG/LSB: tests/fixtures/unseen-packages/{fwrg,lsb}-.../article-6-negative-covenants.txt
 *    + definitions-excerpt.txt, via the same loadFwrgLsbStructuralIndex()
 *    helper Phase 3B/3E's own real regressions use.
 *  - CONMED: 4 real .htm source documents, extracted via the real
 *    production lib/extraction/parse.ts HTML parser (same extraction path
 *    production ingestion uses), then run through the real structure stage.
 *  - DSGR: 4 real, already-extracted .txt documents (doc-a..doc-d) from
 *    tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text,
 *    PLUS reconciliation against the frozen pre-remediation baseline
 *    tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-nodes.json
 *    (4149 total nodes, 546 duplicated nodeKeys, 680 excess duplicate
 *    instances - the exact "known structural-identity failure population"
 *    docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md's own collision
 *    census cites, preserved unchanged from the ARCH-PROP phase).
 *
 * Run via: npx tsx scripts/phase-3f1-2-known-package-structural-regression.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralHealthFinding } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode, CompilerDocumentInput } from "../lib/contract-model/compiler/types";
import { parseDocument } from "../lib/extraction/parse";

const OUT_DIR = "tests/fixtures/architecture-audits";

interface PackageStructuralMetrics {
  packageKey: string;
  documents: { documentId: string; charLength: number }[];
  totalNodes: number;
  distinctNodeIds: number;
  distinctNodeKeys: number;
  nodeIdCollisions: number; // totalNodes - distinctNodeIds; must be 0 (I1).
  duplicateLegalReferenceOccurrenceCount: number; // totalNodes - distinctNodeKeys (informational baseline of real duplicate-label volume).
  healthFindingsBySeverity: Record<string, number>;
  healthFindingsByCode: Record<string, number>;
  errorSeverityFindingCount: number; // must be 0.
  orphanCount: number;
  cycleCount: number;
  crossParentMergeViolations: number; // empirically-verified count of any child appearing under >1 parent's getChildren(); must be 0.
  ambiguousLegalReferencesDetected: number; // count of distinct legal refs where resolveUniqueNodeByRef returns AMBIGUOUS.
}

function computeMetrics(packageKey: string, documents: CompilerDocumentInput[]): { metrics: PackageStructuralMetrics; nodes: StructuralNode[]; health: StructuralHealthFinding[] } {
  const structureResult = runStructureStage(documents);
  const nodes = structureResult.output;
  const nodesByDocument = new Map(documents.map((d) => [d.documentId, { text: d.text, nodes: nodes.filter((n) => n.documentId === d.documentId) }]));
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const health = index.healthDiagnostics();

  const nodeIdSet = new Set(nodes.map((n) => n.nodeId));
  const nodeKeySet = new Set(nodes.map((n) => n.nodeKey));

  const healthFindingsBySeverity: Record<string, number> = {};
  const healthFindingsByCode: Record<string, number> = {};
  for (const f of health) {
    healthFindingsBySeverity[f.severity] = (healthFindingsBySeverity[f.severity] ?? 0) + 1;
    healthFindingsByCode[f.code] = (healthFindingsByCode[f.code] ?? 0) + 1;
  }

  // Empirical cross-parent-merge check: for every parent occurrence, its children must be exclusively its own -
  // no nodeId may ever appear in more than one distinct parent's getChildren() result.
  let crossParentMergeViolations = 0;
  const ownerByChildNodeId = new Map<string, string>();
  for (const n of index.allNodes()) {
    for (const child of index.getChildren(n.nodeId)) {
      const prevOwner = ownerByChildNodeId.get(child.nodeId);
      if (prevOwner && prevOwner !== n.nodeId) crossParentMergeViolations++;
      ownerByChildNodeId.set(child.nodeId, n.nodeId);
    }
  }

  const distinctLegalRefKeys = new Set(nodes.map((n) => `${n.documentId}::${n.sectionRef.replace(/\s+/g, "")}`));
  let ambiguousLegalReferencesDetected = 0;
  for (const key of distinctLegalRefKeys) {
    const [documentId, ...rest] = key.split("::");
    const sectionRef = rest.join("::");
    if (index.resolveUniqueNodeByRef(documentId!, sectionRef).status === "AMBIGUOUS") ambiguousLegalReferencesDetected++;
  }

  const metrics: PackageStructuralMetrics = {
    packageKey,
    documents: documents.map((d) => ({ documentId: d.documentId, charLength: d.text.length })),
    totalNodes: nodes.length,
    distinctNodeIds: nodeIdSet.size,
    distinctNodeKeys: nodeKeySet.size,
    nodeIdCollisions: nodes.length - nodeIdSet.size,
    duplicateLegalReferenceOccurrenceCount: nodes.length - nodeKeySet.size,
    healthFindingsBySeverity,
    healthFindingsByCode,
    errorSeverityFindingCount: healthFindingsBySeverity["ERROR"] ?? 0,
    orphanCount: index.orphans().length,
    cycleCount: healthFindingsByCode["CYCLE"] ?? 0,
    crossParentMergeViolations,
    ambiguousLegalReferencesDetected,
  };
  return { metrics, nodes, health };
}

async function loadFwrgLsb(): Promise<CompilerDocumentInput[]> {
  const fwrgArticle6 = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
  const fwrgDefs = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", "utf-8");
  const lsbArticle6 = readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "utf-8");
  const lsbDefs = readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", "utf-8");
  return [
    { documentId: "fwrg-article-6", label: "FWRG Article 6", text: fwrgArticle6 },
    { documentId: "fwrg-definitions", label: "FWRG Definitions", text: fwrgDefs },
    { documentId: "lsb-article-6", label: "LSB Article 6", text: lsbArticle6 },
    { documentId: "lsb-definitions", label: "LSB Definitions", text: lsbDefs },
  ];
}

async function loadConmed(): Promise<CompilerDocumentInput[]> {
  const files: { documentId: string; label: string; file: string }[] = [
    { documentId: "conmed-doc-a", label: "CONMED Eighth A&R Credit Agreement", file: "ex10-1-eighth-ar-credit-agreement-2025-06-16.htm" },
    { documentId: "conmed-doc-b", label: "CONMED A&R Guarantee and Collateral Agreement", file: "ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm" },
    { documentId: "conmed-doc-c", label: "CONMED Second Amendment 2022", file: "ex10-2-second-amendment-2022-08-02.htm" },
    { documentId: "conmed-doc-d", label: "CONMED First Omnibus Amendment 2026", file: "ex10-1-first-omnibus-amendment-2026-06-01.htm" },
  ];
  const documents: CompilerDocumentInput[] = [];
  for (const f of files) {
    const raw = readFileSync(`tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/${f.file}`);
    const parsed = await parseDocument(raw, "text/html");
    documents.push({ documentId: f.documentId, label: f.label, text: parsed.fullText });
  }
  return documents;
}

async function loadDsgr(): Promise<CompilerDocumentInput[]> {
  const files: { documentId: string; label: string; file: string }[] = [
    { documentId: "doc-a", label: "DSGR 2022 A&R Credit Agreement", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
    { documentId: "doc-b", label: "DSGR 2024 Third Amendment", file: "doc-b-2024-third-amendment.txt" },
    { documentId: "doc-c", label: "DSGR 2025 Fourth Amendment", file: "doc-c-2025-fourth-amendment.txt" },
    { documentId: "doc-d", label: "DSGR 2025 Second A&R Credit Agreement", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
  ];
  return files.map((f) => ({ documentId: f.documentId, label: f.label, text: readFileSync(`tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/${f.file}`, "utf-8") }));
}

interface FrozenBaselineNode {
  documentId: string;
  nodeType: string;
  sectionRef: string;
  nodeKey: string;
  charStart: number;
}

function reconcileDsgrBaseline(currentNodes: StructuralNode[]) {
  const frozen: FrozenBaselineNode[] = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-nodes.json", "utf-8"));
  const frozenNodeKeyCounts = new Map<string, number>();
  for (const n of frozen) frozenNodeKeyCounts.set(n.nodeKey, (frozenNodeKeyCounts.get(n.nodeKey) ?? 0) + 1);
  const frozenDuplicatedNodeKeys = [...frozenNodeKeyCounts.entries()].filter(([, c]) => c > 1);
  const frozenExcessDuplicateInstances = frozenDuplicatedNodeKeys.reduce((sum, [, c]) => sum + (c - 1), 0);

  const currentNodeIdCounts = new Map<string, number>();
  for (const n of currentNodes) currentNodeIdCounts.set(n.nodeId, (currentNodeIdCounts.get(n.nodeId) ?? 0) + 1);
  const currentNodeIdCollisions = [...currentNodeIdCounts.entries()].filter(([, c]) => c > 1);

  const currentNodeKeyCounts = new Map<string, number>();
  for (const n of currentNodes) currentNodeKeyCounts.set(n.nodeKey, (currentNodeKeyCounts.get(n.nodeKey) ?? 0) + 1);
  const currentDuplicatedNodeKeys = [...currentNodeKeyCounts.entries()].filter(([, c]) => c > 1);

  return {
    frozenBaseline: {
      source: "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-nodes.json",
      totalNodes: frozen.length,
      distinctNodeKeys: frozenNodeKeyCounts.size,
      duplicatedNodeKeyCount: frozenDuplicatedNodeKeys.length,
      excessDuplicateInstances: frozenExcessDuplicateInstances,
      note: "Pre-remediation frozen evidence, unmodified - cited verbatim in docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md's own collision census and the ARCH-PROP phase's structural-identity-current-state.json artifact.",
    },
    currentRun: {
      totalNodes: currentNodes.length,
      distinctNodeIds: currentNodeIdCounts.size,
      nodeIdCollisionCount: currentNodeIdCollisions.length, // must be 0 - the headline claim this reconciliation exists to prove.
      distinctNodeKeys: currentNodeKeyCounts.size,
      duplicatedNodeKeyCount: currentDuplicatedNodeKeys.length, // expected to remain nonzero and comparable in magnitude to the frozen baseline - duplicate LABELS are a real drafting/extraction reality (I2), not something this remediation eliminates; what changes is that they no longer corrupt identity.
    },
    interpretation:
      currentNodeIdCollisions.length === 0
        ? `The frozen pre-remediation run showed ${frozenDuplicatedNodeKeys.length} distinct nodeKeys shared by more than one physical occurrence (${frozenExcessDuplicateInstances} excess duplicate instances that, under the old byKey.set() scheme, would each have silently overwritten an earlier same-labeled occurrence). The current post-remediation run over the same real DSGR source produces ${currentNodeIdCollisions.length} nodeId collisions (I1 holds) and ${currentDuplicatedNodeKeys.length} duplicated legal-reference labels - the same real duplicate-label population as before (labels legitimately repeat - I2), but every one of those occurrences now has its own distinct, independently-reachable nodeId rather than silently overwriting another. This is NOT a claim that DSGR's semantic/discovery/coverage omissions (Phase 3F.1.1's own 89-case residual population) are fixed - only that the structural-identity substrate underneath them no longer corrupts occurrence identity.`
        : `UNEXPECTED: ${currentNodeIdCollisions.length} nodeId collision(s) detected in the post-remediation run - this would indicate I1 is violated and requires investigation before this phase can claim the structural-identity defect is closed.`,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const results: Record<string, PackageStructuralMetrics> = {};
  const allHealthByPackage: Record<string, StructuralHealthFinding[]> = {};
  let dsgrNodes: StructuralNode[] = [];

  console.log("Loading and structurally parsing FWRG...");
  const fwrgDocs = (await loadFwrgLsb()).filter((d) => d.documentId.startsWith("fwrg"));
  const fwrg = computeMetrics("FWRG", fwrgDocs);
  results.FWRG = fwrg.metrics;
  allHealthByPackage.FWRG = fwrg.health;

  console.log("Loading and structurally parsing LSB...");
  const lsbDocs = (await loadFwrgLsb()).filter((d) => d.documentId.startsWith("lsb"));
  const lsb = computeMetrics("LSB", lsbDocs);
  results.LSB = lsb.metrics;
  allHealthByPackage.LSB = lsb.health;

  console.log("Loading and structurally parsing CONMED (real HTML extraction)...");
  const conmedDocs = await loadConmed();
  const conmed = computeMetrics("CONMED", conmedDocs);
  results.CONMED = conmed.metrics;
  allHealthByPackage.CONMED = conmed.health;

  console.log("Loading and structurally parsing DSGR...");
  const dsgrDocs = await loadDsgr();
  const dsgr = computeMetrics("DSGR", dsgrDocs);
  results.DSGR = dsgr.metrics;
  allHealthByPackage.DSGR = dsgr.health;
  dsgrNodes = dsgr.nodes;

  console.log("Reconciling DSGR against the frozen pre-remediation baseline...");
  const dsgrReconciliation = reconcileDsgrBaseline(dsgrNodes);

  const totalNodeIdCollisions = Object.values(results).reduce((s, r) => s + r.nodeIdCollisions, 0);
  const totalErrorFindings = Object.values(results).reduce((s, r) => s + r.errorSeverityFindingCount, 0);
  const totalCrossParentMergeViolations = Object.values(results).reduce((s, r) => s + r.crossParentMergeViolations, 0);

  const report = {
    purpose: "Phase 3F.1.2 known-package structural-identity regression (FWRG/LSB/CONMED/DSGR) - structural-identity integrity only, never a re-score of semantic/discovery/coverage output, never production logic tuned to these known assets.",
    scopeDisclaimer: "This report makes NO claim about DSGR's (or any package's) semantic/discovery/coverage completeness - it verifies ONLY that buildStructuralIndex/parseDocumentStructure produce zero occurrence-ID collisions, zero silent overwrites, and zero cross-parent child merges over real, previously-committed source text.",
    perPackage: results,
    aggregate: {
      totalNodeIdCollisions,
      totalErrorSeverityHealthFindings: totalErrorFindings,
      totalCrossParentMergeViolations,
      allPackagesPassStructuralIdentityGate: totalNodeIdCollisions === 0 && totalErrorFindings === 0 && totalCrossParentMergeViolations === 0,
    },
    dsgrReconciliation,
  };

  // Phase 3F.1.2: written into architecture-audits/, NOT tests/fixtures/unseen-packages/ -
  // that directory is watched by earlier phases' own "no new package contamination" integrity
  // guards (tests/contract-model/architecture-proposal-node-identity.test.ts,
  // phase-3f1-1-forensic-machinery.test.ts), which correctly treat any new top-level entry there
  // as a suspicious sign of new package selection. This is re-derived evidence over the four
  // ALREADY-approved known packages, not a new package, so it belongs alongside this phase's
  // other evidence artifacts instead.
  writeFileSync(`${OUT_DIR}/known-package-structural-regression.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${OUT_DIR}/known-package-structural-health-findings.json`, JSON.stringify(allHealthByPackage, null, 2));

  console.log("\n=== SUMMARY ===");
  for (const [pkg, m] of Object.entries(results)) {
    console.log(`${pkg}: ${m.totalNodes} nodes, ${m.nodeIdCollisions} nodeId collisions, ${m.errorSeverityFindingCount} ERROR findings, ${m.crossParentMergeViolations} cross-parent merges, ${m.duplicateLegalReferenceOccurrenceCount} occurrences sharing a duplicated legal reference (I2, informational).`);
  }
  console.log(`\nDSGR reconciliation: frozen baseline had ${dsgrReconciliation.frozenBaseline.duplicatedNodeKeyCount} duplicated nodeKeys / ${dsgrReconciliation.frozenBaseline.excessDuplicateInstances} excess duplicate instances (${dsgrReconciliation.frozenBaseline.totalNodes} total nodes). Current run: ${dsgrReconciliation.currentRun.nodeIdCollisionCount} nodeId collisions, ${dsgrReconciliation.currentRun.duplicatedNodeKeyCount} duplicated legal-reference labels (${dsgrReconciliation.currentRun.totalNodes} total nodes).`);
  console.log(`\nGate: allPackagesPassStructuralIdentityGate = ${report.aggregate.allPackagesPassStructuralIdentityGate}`);
  console.log(`\n[preserved] tests/fixtures/architecture-audits/known-package-structural-regression.json`);
  console.log(`[preserved] ${OUT_DIR}/known-package-structural-health-findings.json`);
}

main();
