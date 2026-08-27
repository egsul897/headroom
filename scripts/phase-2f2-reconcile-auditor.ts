/**
 * Phase 2F.2 §17 - reconciles the real post-fix Document B discovery
 * candidates against Phase 2E's real, independent auditor. Reuses Phase
 * 2E's own production code UNCHANGED (buildSourceCoverageInventory +
 * auditDiscoveryCoverage from lib/contract-model/compiler/coverage-audit/*)
 * - never a bespoke comparison heuristic - so the "challenger" role stays
 * exactly what it was in Phase 2F/2F.1 (task §19: do not modify Phase 2E
 * to accommodate new Phase 2B outputs). Deterministic-only, zero new LLM
 * calls: Pass A/coverage-audit are both zero-LLM by design.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildSourceCoverageInventory } from "../lib/contract-model/compiler/coverage-audit/source-inventory";
import { auditDiscoveryCoverage } from "../lib/contract-model/compiler/coverage-audit/discovery-comparison";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f2");
const PHASE_2F1_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f1");

function main() {
  const text = fs.readFileSync(path.join(PKG_DIR, "guarantee-and-collateral-agreement-full.txt"), "utf-8");
  const documentId = "conmed-doc-b-guarantee-collateral-agreement";
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);

  const newCandidates: DiscoveredCandidate[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "document-b-rerun-final-candidates.json"), "utf-8"));

  const options = { companyId: "phase-2f2-doc-b-regression", packageKey: "conmed-2025-credit-facility", instrumentKey: null };
  const regions = buildSourceCoverageInventory(documentId, index, options);
  const newFindings = auditDiscoveryCoverage(regions, newCandidates, index);

  const originalAllFindings = JSON.parse(fs.readFileSync(path.join(PHASE_2F1_DIR, "audit-findings.json"), "utf-8"));
  const originalDocBFindings = originalAllFindings.filter((f: { documentId: string; findingType: string }) => f.documentId === documentId && f.findingType === "MATERIAL_DISCOVERY_MISS");

  const newMissNodeKeys = new Set(newFindings.filter((f) => f.findingType === "MATERIAL_DISCOVERY_MISS").map((f) => f.structuralNodeKey));

  const reconciliation = originalDocBFindings.map((orig: { structuralNodeKey: string; sourceCitation: string; materiality: string; sourceEvidence: string }) => {
    const stillMissing = newMissNodeKeys.has(orig.structuralNodeKey);
    return {
      structuralNodeKey: orig.structuralNodeKey,
      sourceCitation: orig.sourceCitation,
      materiality: orig.materiality,
      originalSourceEvidence: orig.sourceEvidence,
      status: stillMissing ? "STILL_MISSING" : "NOW_DISCOVERED",
    };
  });

  const nowDiscovered = reconciliation.filter((r: { status: string }) => r.status === "NOW_DISCOVERED").length;
  const stillMissing = reconciliation.filter((r: { status: string }) => r.status === "STILL_MISSING").length;
  const stillMissingMaterial = reconciliation.filter((r: { status: string; materiality: string }) => r.status === "STILL_MISSING" && r.materiality === "MATERIAL");

  const newFindingTypeCounts: Record<string, number> = {};
  for (const f of newFindings) newFindingTypeCounts[f.findingType] = (newFindingTypeCounts[f.findingType] ?? 0) + 1;

  const summary = {
    generatedAt: new Date().toISOString(),
    documentId,
    originalMaterialDiscoveryMissCount: originalDocBFindings.length,
    newTotalFindingsCount: newFindings.length,
    newFindingTypeCounts,
    reconciledAgainstOriginal107: { nowDiscovered, stillMissing, stillMissingMaterialFindings: stillMissingMaterial },
    reconciliation,
  };

  fs.writeFileSync(path.join(OUT_DIR, "document-b-auditor-reconciliation.json"), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      { originalMaterialDiscoveryMissCount: originalDocBFindings.length, newTotalFindingsCount: newFindings.length, newFindingTypeCounts, nowDiscovered, stillMissing, stillMissingMaterialCount: stillMissingMaterial.length },
      null,
      2
    )
  );
}

main();
