/**
 * Phase 2G §27 - real CONMED amendment-precedence regression. CONMED is
 * now a regression package, not unseen (same status Phase 2F.1/2F.2/2F.3
 * already established). Runs the real amendment pipeline (deterministic
 * parsing -> bounded semantic interpretation only where genuinely
 * ambiguous -> validation) against the real 4-document package, computes
 * OperativeContractState per real instrument, computes package safety
 * (including the new §17/§30 whole-document-amendment rollup), and writes
 * every artifact under a NEW `phase-2g/` directory - never overwriting
 * `phase-2f1/`, `phase-2f2/`, or `phase-2f3/`'s own sealed evidence.
 *
 * Uses the real getStageCaller() (falls back to the synthetic caller only
 * when no credential is configured) - run via
 * `npx tsx --env-file=.env.local scripts/phase-2g-rerun-conmed.ts` so a
 * real credential is available if the deterministic pass DOES find an
 * ambiguous effect needing interpretation. scripts/phase-2g-estimate-cost.ts
 * already showed 0 such effects exist in the real package, so this run is
 * expected to make 0 real LLM calls - a genuinely free, honestly-reportable
 * outcome (same "semantic assistance: not used" precedent as Phase 2C's
 * own real-package run).
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { computeStructuralCoverage } from "../lib/contract-model/compiler/structural-coverage";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { runAmendmentPipeline } from "../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { verifyAmendmentEffectsIndependently } from "../lib/contract-model/compiler/amendment/independent-verification";
import { computePackageSafety } from "../lib/contract-model/compiler/package-safety";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze", "phase-2g");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Identical DocSpec list to scripts/phase-2f1-rerun-pipeline.ts and
// scripts/phase-2f3-rerun-package-graph.ts's own DOCS constant - same
// documentIds/labels/file assembly, so this run's output is directly
// comparable to the frozen Phase 2F1/2F3 evidence for the same package.
const DOCS: Array<{ documentId: string; label: string; files: string[] }> = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
];

async function main() {
  const documents: PackageDocumentInput[] = DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: d.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n") }));

  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs: ReturnType<typeof detectStructuralDefinitions> = [];
  for (const d of documents) {
    const nodes = parseDocumentStructure(d);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefs, []);
  const packageGraph = buildPackageGraph("phase-2g-conmed-regression", "conmed-2025-credit-facility", documents);

  const caller = getStageCaller();
  const pipelineResult = await runAmendmentPipeline(caller, { documents, packageGraph, index });

  const asOfDate = new Date().toISOString().slice(0, 10);
  const operativeStates = packageGraph.instruments.filter((inst) => inst.baseDocumentId !== null).map((inst) => computeOperativeContractState({ instrumentKey: inst.instrumentKey, baseDocumentId: inst.baseDocumentId!, asOfDate, index, allEffects: pipelineResult.effects }));

  const safetyInputs = documents.map((d) => ({
    documentId: d.documentId,
    documentText: d.text,
    coverage: computeStructuralCoverage(d.documentId, d.text, nodesByDocument.get(d.documentId)!.nodes),
    discoveryCandidateCount: 0,
    declaredDocumentType: packageGraph.classifications.find((c) => c.documentId === d.documentId)?.type ?? null,
  }));
  const packageSafety = computePackageSafety("phase-2g-conmed-regression", safetyInputs, packageGraph.relationshipCandidates, operativeStates, pipelineResult.unattachedEffects);

  const perAmendmentDocument = documents
    .filter((d) => packageGraph.classifications.find((c) => c.documentId === d.documentId && ["AMENDMENT", "AMENDED_AND_RESTATED_AGREEMENT", "SUPPLEMENTAL_INDENTURE", "JOINDER"].includes(c.type)))
    .map((d) => {
      // pipelineResult.effects already contains every effect this pipeline
      // produced, including whole-document ones that never attach to a
      // provision (pipelineResult.unattachedEffects is a SUBSET of it, not
      // a separate list) - filtering effects alone here is correct and
      // avoids double-counting.
      const own = pipelineResult.effects.filter((e) => e.amendmentDocumentId === d.documentId);
      return {
        documentId: d.documentId,
        label: d.label,
        targetDocuments: [...new Set(own.map((e) => e.target.targetDocumentId).filter((x): x is string => x !== null))],
        effects: own.map((e) => ({
          operation: e.operation,
          target: { kind: e.target.kind, documentId: e.target.targetDocumentId, sectionRef: e.target.targetSectionRef, definedTermRef: e.target.targetDefinedTermRef, hint: e.target.targetHint },
          effectiveDate: e.effectiveDate,
          resolutionMethod: e.resolutionMethod,
          status: e.status,
          unresolvedReason: e.unresolvedReason,
          hasCapturedText: e.newText !== null,
        })),
      };
    });

  const verification = verifyAmendmentEffectsIndependently(pipelineResult.effects, documents, index);
  const dangerousUnflaggedCount = pipelineResult.effects.filter((e) => e.status === "RESOLVED" && !verification.find((v) => v.effectId === e.effectId)?.passed).length;

  const output = {
    runId: "PHASE_2G_CONMED_AMENDMENT_REGRESSION",
    generatedAt: new Date().toISOString(),
    asOfDate,
    pipelineSummary: pipelineResult.summary,
    perAmendmentDocument,
    operativeStates: operativeStates.map((s) => ({ instrumentKey: s.instrumentKey, status: s.status, summary: s.summary, provisions: s.provisions.map((p) => ({ provisionKey: p.provisionKey, kind: p.kind, sectionRef: p.sectionRef, definedTermRef: p.definedTermRef, status: p.status, currentSourceDocumentId: p.currentSourceDocumentId, chainLength: p.fullChain.length, unresolvedIssues: p.unresolvedIssues })) })),
    packageSafety: { state: packageSafety.state, reasons: packageSafety.reasons, unresolvedWholeDocumentAmendmentCount: packageSafety.unresolvedWholeDocumentAmendmentCount, conflictedInstrumentCount: packageSafety.conflictedInstrumentCount, operativeReviewRequiredInstrumentCount: packageSafety.operativeReviewRequiredInstrumentCount },
    unattachedEffectsCount: pipelineResult.unattachedEffects.length,
    independentVerification: { totalEffectsChecked: verification.length, allPassed: verification.every((v) => v.passed), findings: verification.filter((v) => !v.passed) },
    dangerousUnflaggedAmendmentErrorCount: dangerousUnflaggedCount,
    modelProvider: caller.providerName,
    model: caller.model,
    isSyntheticCaller: caller.isSynthetic,
  };

  fs.writeFileSync(path.join(OUT_DIR, "conmed-amendment-regression.json"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main();
