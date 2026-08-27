/**
 * Phase 2F.1 - reruns the (now partially remediated) pipeline against the
 * same real CONMED package, writing every artifact under a NEW
 * `phase-2f1/` directory - NEVER into `phase-2f-freeze/`, which holds the
 * sealed Phase 2F first-blind evidence and must never be overwritten
 * (task §1). This is remediation evidence, not a replacement first-blind
 * run - Phase 2F's own official result stays NEEDS_ITERATION regardless
 * of what this script finds.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { runDiscoveryPipeline, DISCOVERY_RUN_VERSION } from "../lib/contract-model/compiler/discovery/pipeline";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle, type PackageAccess } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { runIndependentCoverageAudit } from "../lib/contract-model/compiler/coverage-audit/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2f1");
fs.mkdirSync(OUT_DIR, { recursive: true });

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

const CACHE_DIR = path.join(OUT_DIR, "discovery-cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

async function main() {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  const exactTermsByDocument = new Map<string, Map<string, string>>();
  const packageDocs: PackageDocumentInput[] = [];
  const perDocStructural: Record<string, unknown> = {};

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

    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;
    perDocStructural[doc.documentId] = { textChars: text.length, totalNodes: nodes.length, nodesByType: byType, definitionsDetected: defs.length, referencesDetected: refs.length, referencesResolved: refs.filter((r) => r.resolved).length };
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  fs.writeFileSync(path.join(OUT_DIR, "structural-summary.json"), JSON.stringify(perDocStructural, null, 2));

  // Discovery (real LLM calls, small - Documents C/D now have real SECTION nodes to attempt).
  const caller = getStageCaller();
  console.error(`provider=${caller.providerName} model=${caller.model} isSynthetic=${caller.isSynthetic}`);
  const allCandidates: (DiscoveredCandidate & { documentId: string })[] = [];
  const discoverySummary: Record<string, unknown> = {};
  let totalCalls = 0, totalIn = 0, totalOut = 0;
  for (const doc of DOCS) {
    const cachePath = path.join(CACHE_DIR, `${doc.documentId}.json`);
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      discoverySummary[doc.documentId] = cached.summary;
      allCandidates.push(...cached.candidates);
      totalCalls += cached.summary.modelCalls ?? 0;
      totalIn += cached.summary.inputTokens ?? 0;
      totalOut += cached.summary.outputTokens ?? 0;
      console.error(`[${doc.documentId}] reusing cached discovery result`);
      continue;
    }
    try {
      const result = await runDiscoveryPipeline(caller, doc.documentId, index);
      discoverySummary[doc.documentId] = result.summary;
      const withDoc = result.candidates.map((c) => ({ ...c, documentId: doc.documentId }));
      allCandidates.push(...withDoc);
      totalCalls += result.summary.modelCalls;
      totalIn += result.summary.inputTokens;
      totalOut += result.summary.outputTokens;
      fs.writeFileSync(cachePath, JSON.stringify({ summary: result.summary, candidates: withDoc }, null, 2));
      console.error(`[${doc.documentId}] finalCandidates=${result.summary.finalCandidateCount} modelCalls=${result.summary.modelCalls}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const crashResult = { status: "CRASHED", errorMessage: message };
      discoverySummary[doc.documentId] = crashResult;
      fs.writeFileSync(cachePath, JSON.stringify({ summary: crashResult, candidates: [] }, null, 2));
      console.error(`[${doc.documentId}] CRASHED (expected/known for Document B - out of scope this phase): ${message.slice(0, 200)}`);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "discovery-summary.json"), JSON.stringify({ discoverySummary, totals: { totalCalls, totalIn, totalOut } }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "discovery-candidates.json"), JSON.stringify(allCandidates, null, 2));

  // Package graph (deterministic).
  const packageGraph = buildPackageGraph("phase-2f1-unseen-conmed", "conmed-2025-credit-facility", packageDocs);
  fs.writeFileSync(path.join(OUT_DIR, "package-graph.json"), JSON.stringify(packageGraph, null, 2));

  // Context retrieval (deterministic).
  const access: PackageAccess = { index, packageGraph, exactTermsByDocument };
  const bundles = allCandidates.map((candidate) => buildCovenantContextBundle({ candidate, packageKey: "conmed-2025-credit-facility", companyId: "phase-2f1-unseen-conmed", instrumentKey: null }, access));
  fs.writeFileSync(path.join(OUT_DIR, "context-bundles.json"), JSON.stringify(bundles, null, 2));

  // Coverage audit (deterministic, frozen).
  const auditResult = runIndependentCoverageAudit({
    companyId: "phase-2f1-unseen-conmed",
    packageKey: "conmed-2025-credit-facility",
    instrumentKey: null,
    documentIds: DOCS.map((d) => d.documentId),
    index,
    candidates: allCandidates,
    packageGraph,
    bundles,
  });
  fs.writeFileSync(path.join(OUT_DIR, "audit-findings.json"), JSON.stringify(auditResult.findings, null, 2));

  const findingsByDoc: Record<string, number> = {};
  for (const f of auditResult.findings) findingsByDoc[f.documentId] = (findingsByDoc[f.documentId] ?? 0) + 1;
  const candidatesByDoc: Record<string, number> = {};
  for (const c of allCandidates) candidatesByDoc[c.documentId] = (candidatesByDoc[c.documentId] ?? 0) + 1;
  const bundlesByDoc: Record<string, number> = {};
  for (const b of bundles) bundlesByDoc[b.originatingDocumentId] = (bundlesByDoc[b.originatingDocumentId] ?? 0) + 1;

  const summary = {
    runId: "PHASE_2F1_RERUN",
    generatedAt: new Date().toISOString(),
    perDocStructural,
    candidatesByDoc,
    bundlesByDoc,
    findingsByDoc,
    totals: { totalCalls, totalIn, totalOut },
  };
  fs.writeFileSync(path.join(OUT_DIR, "rerun-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
