/**
 * Phase 2F - Stage 5: frozen Phase 2E independent coverage/context auditor
 * (deterministic, zero LLM calls) run against the real Stage 2/3/4 output.
 * Zero code changes to the auditor itself - this script only assembles its
 * documented AuditPackageInput from already-produced first-run artifacts.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { runIndependentCoverageAudit } from "../lib/contract-model/compiler/coverage-audit/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import type { CovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze");

interface DocSpec {
  documentId: string;
  label: string;
  files: string[];
}

const DOCS: DocSpec[] = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
];

function main() {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  const packageDocs: PackageDocumentInput[] = [];

  for (const doc of DOCS) {
    const text = doc.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n\n");
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text });
    nodesByDocument.set(doc.documentId, { text, nodes });
    allReferences.push(...detectStructuralReferences(doc.documentId, text, nodes));
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, text, nodes));
    packageDocs.push({ documentId: doc.documentId, label: doc.label, text });
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const packageGraph = buildPackageGraph("phase-2f-unseen-conmed", "conmed-2025-credit-facility", packageDocs);
  const candidates: DiscoveredCandidate[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "phase-2f-stage2-discovery-candidates.json"), "utf-8"));
  const bundles: CovenantContextBundle[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "phase-2f-stage4-context-bundles.json"), "utf-8"));

  const result = runIndependentCoverageAudit({
    companyId: "phase-2f-unseen-conmed",
    packageKey: "conmed-2025-credit-facility",
    instrumentKey: null,
    documentIds: DOCS.map((d) => d.documentId),
    index,
    candidates,
    packageGraph,
    bundles,
  });

  const findingsByType: Record<string, number> = {};
  const findingsByMateriality: Record<string, number> = {};
  const findingsByDocument: Record<string, number> = {};
  for (const f of result.findings) {
    findingsByType[f.findingType] = (findingsByType[f.findingType] ?? 0) + 1;
    findingsByMateriality[f.materiality] = (findingsByMateriality[f.materiality] ?? 0) + 1;
    findingsByDocument[f.documentId] = (findingsByDocument[f.documentId] ?? 0) + 1;
  }

  const summary = {
    runId: "PHASE_2F_STAGE5_COVERAGE_AUDIT",
    generatedAt: new Date().toISOString(),
    auditAlgorithmVersion: result.auditAlgorithmVersion,
    regionsAudited: result.regions.length,
    totalFindings: result.findings.length,
    findingsByType,
    findingsByMateriality,
    findingsByDocument,
    performance: result.performance,
  };

  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage5-audit-findings.json"), JSON.stringify(result.findings, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage5-audit-coverage-map.json"), JSON.stringify(result.coverageMap, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage5-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
