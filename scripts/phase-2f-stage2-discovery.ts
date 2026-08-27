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

  const CACHE_DIR = path.join(OUT_DIR, "stage2-per-document-cache");
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (const doc of DOCS) {
    const cachePath = path.join(CACHE_DIR, `${doc.documentId}.json`);
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      results[doc.documentId] = cached.summary ?? cached;
      if (Array.isArray(cached.candidates)) allCandidates.push(...cached.candidates);
      if (cached.summary && typeof cached.summary.modelCalls === "number") {
        totalModelCalls += cached.summary.modelCalls;
        totalInputTokens += cached.summary.inputTokens;
        totalOutputTokens += cached.summary.outputTokens;
      }
      console.error(`\n=== ${doc.documentId}: reusing cached result from prior run (real spend not repeated) ===`);
      continue;
    }
    console.error(`\n=== running discovery for ${doc.documentId} ===`);
    // NOTE (Phase 2F harness, not frozen Phase 2B code): runDiscoveryPipeline
    // itself is called completely unmodified. This try/catch exists only in
    // this orchestration script - it is the same "caller must handle
    // failures" responsibility runDiscoveryPipeline's own header comment
    // already disclaims ("this module does not itself touch persistence...
    // a caller wires the returned candidates" - the module was never
    // documented as guaranteeing it cannot throw). Without this, one
    // document's crash would silently prevent every later document from
    // being attempted at all, which would misrepresent documents C/D as
    // "not tested" rather than "tested and produced zero candidates because
    // this real, unmodified crash occurred." The crash itself, and exactly
    // which document/call it occurred on, is preserved as first-run
    // evidence below, not hidden or retried.
    try {
      const result = await runDiscoveryPipeline(caller, doc.documentId, index);
      results[doc.documentId] = result.summary;
      const candidatesWithDoc = result.candidates.map((c) => ({ ...c, documentId: doc.documentId }));
      allCandidates.push(...candidatesWithDoc);
      totalModelCalls += result.summary.modelCalls;
      totalInputTokens += result.summary.inputTokens;
      totalOutputTokens += result.summary.outputTokens;
      console.error(`[${doc.documentId}] nodesInspected=${result.summary.nodesInspected} deterministic=${result.summary.deterministicCandidatesGenerated} semanticEvaluated=${result.summary.semanticCandidatesEvaluated} finalCandidates=${result.summary.finalCandidateCount} modelCalls=${result.summary.modelCalls} inputTokens=${result.summary.inputTokens} outputTokens=${result.summary.outputTokens} wallClockMs=${result.summary.wallClockMs.toFixed(0)}`);
      fs.writeFileSync(cachePath, JSON.stringify({ summary: result.summary, candidates: candidatesWithDoc }, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${doc.documentId}] CRASHED: ${message}`);
      const crashResult = { status: "CRASHED", errorMessage: message, note: "runDiscoveryPipeline threw an uncaught error for this document - zero candidates were produced for it. This is the real, unmodified behavior of the frozen Phase 2B pipeline against this document's real content, not a harness bug being papered over." };
      results[doc.documentId] = crashResult;
      fs.writeFileSync(cachePath, JSON.stringify({ summary: crashResult, candidates: [] }, null, 2));
    }
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
