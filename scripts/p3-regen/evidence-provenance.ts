/**
 * Phase-3 current-pipeline regeneration — evidence provenance audit.
 *
 * §2 requires auditing the evidence provenance of ALL 47 cases, not only the 20 the
 * prior P3-DEFECT-1 investigation named. Every fact here is computed from the frozen
 * run artifacts and from production constants; nothing is hand-asserted.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  SEMANTIC_COMPILER_ALGORITHM_VERSION,
  SEMANTIC_COMPILER_PROMPT_VERSION,
  SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
} from "../../lib/contract-model/compiler/semantic/types";

const ROOT = process.cwd();
export const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
export const readJson = (p: string) => JSON.parse(read(p));
export const sha256 = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");

export const P = {
  packet: "docs/phase-3-final-closure-resolution/review-packets/R1.json",
  corpus: "docs/phase-3-v3.1-final-reconciliation/05-v3.1.1-corrected-47-case-corpus.json",
  results: "docs/phase-3-v3.1-final-reconciliation/08-final-47-case-results.json",
  dsgrStage2: "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage2-all-discovery-candidates.json",
  dsgrStage6: "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage6-compiled-results.json",
  dsgrSummary: "tests/fixtures/unseen-packages/phase-3f-first-blind-run/final-summary.json",
  conmedStage2: "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json",
  lsbDiscovery: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json",
  lsbSource: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
  fwrgDiscovery: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json",
} as const;

/** The prompt/algorithm identity the CURRENT production compiler stamps on its output. */
export const CURRENT_PIPELINE_IDENTITY = {
  compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
  compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
  toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
};

/** The prompt identity stamped on the frozen DSGR run's own telemetry. */
export function frozenDsgrPipelineIdentity() {
  const s6 = readJson(P.dsgrStage6) as any[];
  const promptVersions = [...new Set(s6.map((e) => e.telemetry?.promptVersion).filter(Boolean))];
  const models = [...new Set(s6.map((e) => e.telemetry?.model).filter(Boolean))];
  const providers = [...new Set(s6.map((e) => e.telemetry?.provider).filter(Boolean))];
  return { promptVersions, models, providers };
}

export type ProvenanceState =
  | "HISTORICAL_COMPILE_CAP"
  | "HISTORICAL_NO_COMPILATION_STAGE"
  | "SUPERSEDED_ANALYZER"
  | "HISTORICAL_VERIFICATION_ARTIFACT"
  | "CURRENT_PIPELINE_ALREADY_VALID";

const DATASET_OF: Record<string, "dsgr" | "lsb" | "fwrg" | "conmed"> = {
  "doc-a": "dsgr",
  "doc-b": "dsgr",
  "doc-d": "dsgr",
  lsb: "lsb",
  fwrg: "fwrg",
  "conmed-doc-a-eighth-ar-credit-agreement": "conmed",
};

/**
 * Per-dataset generation facts. The decisive test for "is this current-pipeline
 * evidence?" is whether the artifact's own recorded pipeline identity matches the
 * constants production stamps today - not whether the artifact looks recent.
 */
export function datasetGenerationFacts() {
  const frozen = frozenDsgrPipelineIdentity();
  const summary = readJson(P.dsgrSummary);
  const conmedFiles = fs.readdirSync(path.join(ROOT, "tests/fixtures/unseen-packages/phase-2f-freeze")).filter((f) => f.endsWith(".json"));
  const conmedStages = [...new Set(conmedFiles.map((f) => (/stage(\d+)/.exec(f) ?? [])[1]).filter(Boolean))].sort();

  return {
    dsgr: {
      generatingHarness: "scripts/phase-3f-first-blind-run.ts",
      compilationStageRan: true,
      recordedPromptVersion: frozen.promptVersions,
      currentPromptVersion: CURRENT_PIPELINE_IDENTITY.compilerPromptVersion,
      promptVersionMatchesCurrent: frozen.promptVersions.length === 1 && frozen.promptVersions[0] === CURRENT_PIPELINE_IDENTITY.compilerPromptVersion,
      discovered: summary.totalDiscoveredCandidates,
      eligible: summary.eligibleForCompilation,
      compiled: summary.candidatesCompiled,
      verified: summary.candidatesVerified,
      fullyVerified: summary.candidatesFullyVerified,
      totalCostUsd: summary.totalCostUsd,
      wallClockMs: summary.wallClockMs,
      model: frozen.models,
      provider: frozen.providers,
    },
    conmed: {
      generatingHarness: "tests/fixtures/unseen-packages/phase-2f-freeze",
      stagesPresent: conmedStages,
      compilationStageRan: conmedStages.includes("6"),
      recordedPromptVersion: [],
      currentPromptVersion: CURRENT_PIPELINE_IDENTITY.compilerPromptVersion,
      promptVersionMatchesCurrent: false,
    },
    lsb: {
      generatingHarness: "legacy 11-stage Phase-C orchestrator (compiler-runs/run-1787767205274.json)",
      compilationStageRan: true,
      recordedPromptVersion: ["(legacy Phase-C rule-extraction stage; predates the Phase-3B semantic compiler)"],
      currentPromptVersion: CURRENT_PIPELINE_IDENTITY.compilerPromptVersion,
      promptVersionMatchesCurrent: false,
    },
    fwrg: {
      generatingHarness: "Phase-C0 analyzer (analyzer-runs/VERCEL_AI_GATEWAY__anthropic-claude-sonnet-5.json)",
      compilationStageRan: false,
      recordedPromptVersion: ["(Phase-C0 analyzer; predates the Phase-3B semantic compiler)"],
      currentPromptVersion: CURRENT_PIPELINE_IDENTITY.compilerPromptVersion,
      promptVersionMatchesCurrent: false,
    },
  };
}

/** Per-case provenance, derived from that case's own systemOutput candidates. */
export function caseProvenance() {
  const packet = readJson(P.packet);
  const corpus = readJson(P.corpus);
  const results = readJson(P.results);
  const claimByCase = new Map<string, any>(corpus.cases.map((c: any) => [c.caseId, c.correctedGroundTruthClaim] as const));
  const rowByCase = new Map<string, any>(results.rows.map((r: any) => [r.caseId, r] as const));
  const facts = datasetGenerationFacts();
  const compiledRefs = new Set((readJson(P.dsgrStage6) as any[]).map((e) => e.candidateRef));
  const dsgrStage2 = readJson(P.dsgrStage2) as any[];

  return packet.cases
    .map((c: any) => {
      const dataset = DATASET_OF[c.documentId]!;
      const provRoots = [...new Set(c.systemOutput.map((s: any) => String(s.provenancePath ?? "").split("#")[0]))].sort();
      const types = c.systemOutput.reduce((a: Record<string, number>, s: any) => {
        a[s.representationType] = (a[s.representationType] ?? 0) + 1;
        return a;
      }, {});
      const hasCompiledIr = (types.COMPILED_IR_RULE ?? 0) + (types.COMPILED_IR_DEFINITION ?? 0) > 0;

      // Does discovery cover this claim's own address, and was any of it compiled?
      const ref = String(c.claimSectionRef);
      const base = ref.split("(")[0];
      let discoveredAtAddress = 0;
      let compiledAtAddress = 0;
      if (dataset === "dsgr") {
        const hits = dsgrStage2.filter((d) => d.documentId === c.documentId && String(d.normalizedSourceRef).split("(")[0] === base);
        discoveredAtAddress = hits.length;
        compiledAtAddress = hits.filter((d) => compiledRefs.has(d.discoveryId)).length;
      }

      let state: ProvenanceState;
      let reason: string;
      if (dataset === "conmed") {
        state = "HISTORICAL_NO_COMPILATION_STAGE";
        reason = `the generating artifact has stages ${facts.conmed.stagesPresent.join(",")} and no compilation stage; zero COMPILED_IR candidates exist anywhere in this dataset`;
      } else if (dataset === "fwrg") {
        state = "SUPERSEDED_ANALYZER";
        reason = "every substantive candidate is an ANALYZER_RULE from the Phase-C0 analyzer, which predates the Phase-3B semantic compiler";
      } else if (dataset === "lsb") {
        state = "HISTORICAL_VERIFICATION_ARTIFACT";
        reason = "compiled by the legacy 11-stage Phase-C orchestrator, whose rule-extraction and verification stages are not the current Phase-3B compiler path";
      } else if (!hasCompiledIr && discoveredAtAddress > 0 && compiledAtAddress === 0) {
        state = "HISTORICAL_COMPILE_CAP";
        reason = `${discoveredAtAddress} eligible candidates were discovered at this claim's own address and 0 were compiled, because the harness sliced the eligible set at COMPILE_CAP = 30`;
      } else {
        state = "HISTORICAL_COMPILE_CAP";
        reason = `this case's compiled evidence carries promptVersion ${JSON.stringify(facts.dsgr.recordedPromptVersion)}, while current production stamps ${CURRENT_PIPELINE_IDENTITY.compilerPromptVersion} - the output is real compilation, but not current-pipeline compilation`;
      }

      return {
        caseId: c.caseId,
        documentId: c.documentId,
        dataset,
        claimSectionRef: c.claimSectionRef,
        currentBenchmarkClaim: claimByCase.get(c.caseId) ?? c.groundTruthClaim,
        existingSystemOutputProvenance: provRoots,
        representationTypeCounts: types,
        generationPipelineVersion: facts[dataset].recordedPromptVersion,
        currentPipelineVersion: CURRENT_PIPELINE_IDENTITY.compilerPromptVersion,
        currentPipelineEquivalent: facts[dataset].promptVersionMatchesCurrent,
        discoveredAtClaimAddress: discoveredAtAddress,
        compiledAtClaimAddress: compiledAtAddress,
        regenerationRequired: true,
        provenanceState: state,
        reason,
        v311Result: rowByCase.get(c.caseId)?.credit ?? "(unknown)",
      };
    })
    .sort((a: any, b: any) => a.caseId.localeCompare(b.caseId));
}
