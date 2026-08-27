/**
 * Phase 2F.3 §19/§24 - reruns the (now remediated) package-graph pipeline
 * against the same real CONMED package, writing every artifact under a
 * NEW `phase-2f3/` directory - never into `phase-2f-freeze/`'s sealed
 * Phase 2F evidence, and never overwriting `phase-2f1/`'s own evidence
 * either (task §1/§23). CONMED is now a regression package, not unseen/
 * blind. Zero LLM calls - the package-graph pipeline is 100% deterministic
 * (task §17's own cost-justification precedent), so this rerun is free.
 */
import fs from "node:fs";
import path from "node:path";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f3");
fs.mkdirSync(OUT_DIR, { recursive: true });

interface DocSpec {
  documentId: string;
  label: string;
  files: string[];
}

// Identical DocSpec list to scripts/phase-2f1-rerun-pipeline.ts's own DOCS
// constant - same documentIds/labels/file assembly, so this rerun's output
// is directly comparable to the frozen Phase 2F.1 package-graph.json.
const DOCS: DocSpec[] = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
];

function main() {
  const documents: PackageDocumentInput[] = DOCS.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: d.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n"),
  }));

  const result = buildPackageGraph("phase-2f3-conmed-regression", "conmed-2025-credit-facility", documents);

  fs.writeFileSync(path.join(OUT_DIR, "package-graph.json"), JSON.stringify(result, null, 2));

  const summary = {
    runId: "PHASE_2F3_PACKAGE_GRAPH_RERUN",
    generatedAt: new Date().toISOString(),
    classifications: result.classifications.map((c) => ({ documentId: c.documentId, type: c.type, confidence: c.confidence, resolutionMethod: c.resolutionMethod, evidence: c.evidence })),
    relationshipCandidates: result.relationshipCandidates.map((r) => ({ source: r.sourceDocumentId, target: r.targetDocumentId, type: r.relationshipType, status: r.status, reason: r.unresolvedReason })),
    instruments: result.instruments.map((i) => ({ key: i.instrumentKey, base: i.baseDocumentId, documentIds: i.documentIds, reviewStatus: i.reviewStatus })),
    modificationCandidates: result.modificationCandidates.map((m) => ({ source: m.sourceDocumentId, operation: m.operation, target: m.targetDocumentId, status: m.status })),
    crossDocumentReferenceLeadsSummary: (() => {
      const counts: Record<string, number> = {};
      for (const l of result.crossDocumentReferenceLeads) counts[l.status] = (counts[l.status] ?? 0) + 1;
      return { total: result.crossDocumentReferenceLeads.length, byStatus: counts };
    })(),
    performance: result.performance,
  };
  fs.writeFileSync(path.join(OUT_DIR, "rerun-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
