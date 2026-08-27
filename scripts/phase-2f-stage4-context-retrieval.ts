/**
 * Phase 2F - Stage 4: frozen Phase 2D context-retrieval pipeline
 * (deterministic, zero LLM calls) building a Covenant Context Bundle for
 * every real Phase 2B-discovered candidate, with real Phase 2C package-
 * graph access wired in (so cross-document/amendment-lead retrieval is
 * genuinely exercised, not stubbed to null as the FWRG/LSB single-document
 * benchmark script does).
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle, type PackageAccess } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

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
  const exactTermsByDocument = new Map<string, Map<string, string>>();
  const packageDocs: PackageDocumentInput[] = [];

  for (const doc of DOCS) {
    const text = doc.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n\n");
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text });
    nodesByDocument.set(doc.documentId, { text, nodes });
    const refs = detectStructuralReferences(doc.documentId, text, nodes);
    const defs = detectStructuralDefinitions(doc.documentId, text, nodes);
    allReferences.push(...refs);
    allDefinitions.push(...defs);
    exactTermsByDocument.set(doc.documentId, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm] as const)));
    packageDocs.push({ documentId: doc.documentId, label: doc.label, text });
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const packageGraph = buildPackageGraph("phase-2f-unseen-conmed", "conmed-2025-credit-facility", packageDocs);
  const access: PackageAccess = { index, packageGraph, exactTermsByDocument };

  const candidates: DiscoveredCandidate[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "phase-2f-stage2-discovery-candidates.json"), "utf-8"));

  const bundles = candidates.map((candidate) =>
    buildCovenantContextBundle({ candidate, packageKey: "conmed-2025-credit-facility", companyId: "phase-2f-unseen-conmed", instrumentKey: null }, access)
  );

  const sufficiencyCounts: Record<string, number> = {};
  for (const b of bundles) sufficiencyCounts[b.sufficiencyState] = (sufficiencyCounts[b.sufficiencyState] ?? 0) + 1;

  const itemCounts = bundles.map((b) => b.items.length);
  const avgItems = itemCounts.length > 0 ? itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length : 0;
  const maxItems = itemCounts.length > 0 ? Math.max(...itemCounts) : 0;

  const summary = {
    runId: "PHASE_2F_STAGE4_CONTEXT_RETRIEVAL",
    generatedAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    totalBundles: bundles.length,
    sufficiencyCounts,
    avgItemsPerBundle: Number(avgItems.toFixed(2)),
    maxItemsPerBundle: maxItems,
    totalUnresolvedDependencies: bundles.reduce((n, b) => n + b.unresolvedDependencies.length, 0),
  };

  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage4-context-bundles.json"), JSON.stringify(bundles, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage4-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
