/**
 * Phase 2F - Stage 2: real, frozen Phase 2B discovery pipeline run across
 * all 4 documents of the selected unseen CONMED package, over the same
 * shared multi-document StructuralIndex Stage 1 already built. One real
 * Sonnet 5 call per SECTION-type node that Pass A flagged at least one
 * candidate inside - never per node, never re-run per document blindly.
 * Raw output written to disk before any diagnosis (Phase 2F §8).
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { runDiscoveryPipeline, DISCOVERY_RUN_VERSION } from "../lib/contract-model/compiler/discovery/pipeline";

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

async function main() {
  const caller = getStageCaller();
  console.error(`provider=${caller.providerName} model=${caller.model} isSynthetic=${caller.isSynthetic} discoveryRunVersion=${DISCOVERY_RUN_VERSION}`);
  if (caller.isSynthetic) {
    console.error("FATAL: no real credential detected - refusing to run a synthetic discovery pass that would silently produce zero candidates and misrepresent this as a real validation.");
    process.exit(1);
  }

  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];

  for (const doc of DOCS) {
    const text = doc.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n\n");
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text });
    nodesByDocument.set(doc.documentId, { text, nodes });
    allReferences.push(...detectStructuralReferences(doc.documentId, text, nodes));
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, text, nodes));
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const startedAt = new Date().toISOString();
  const wallStart = Date.now();
  const results: Record<string, unknown> = {};
  let totalModelCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const allCandidates: unknown[] = [];

  for (const doc of DOCS) {
    console.error(`\n=== running discovery for ${doc.documentId} ===`);
    const result = await runDiscoveryPipeline(caller, doc.documentId, index);
    results[doc.documentId] = result.summary;
    allCandidates.push(...result.candidates.map((c) => ({ ...c, documentId: doc.documentId })));
    totalModelCalls += result.summary.modelCalls;
    totalInputTokens += result.summary.inputTokens;
    totalOutputTokens += result.summary.outputTokens;
    console.error(`[${doc.documentId}] nodesInspected=${result.summary.nodesInspected} deterministic=${result.summary.deterministicCandidatesGenerated} semanticEvaluated=${result.summary.semanticCandidatesEvaluated} finalCandidates=${result.summary.finalCandidateCount} modelCalls=${result.summary.modelCalls} inputTokens=${result.summary.inputTokens} outputTokens=${result.summary.outputTokens} wallClockMs=${result.summary.wallClockMs.toFixed(0)}`);
  }

  const wallClockMs = Date.now() - wallStart;
  // Rough cost estimate at the smoke test's own observed effective rate ($3/MTok in, ~$15/MTok out - standard Sonnet 5 tier) for reporting; exact per-call cost is in each candidate's own telemetry where available.
  totalCostUsd = (totalInputTokens / 1_000_000) * 3 + (totalOutputTokens / 1_000_000) * 15;

  const summary = {
    runId: "PHASE_2F_STAGE2_DISCOVERY",
    startedAt,
    finishedAt: new Date().toISOString(),
    provider: caller.providerName,
    model: caller.model,
    discoveryRunVersion: DISCOVERY_RUN_VERSION,
    perDocument: results,
    totals: {
      documentCount: DOCS.length,
      totalModelCalls,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUsd: Number(totalCostUsd.toFixed(4)),
      wallClockMs,
      totalFinalCandidates: allCandidates.length,
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage2-discovery-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage2-discovery-candidates.json"), JSON.stringify(allCandidates, null, 2));

  console.error("\n=== SUMMARY ===");
  console.error(JSON.stringify(summary.totals, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
