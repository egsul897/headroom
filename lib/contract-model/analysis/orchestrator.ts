/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - runContractAnalysis:
 * the ONE authoritative live contract-analysis orchestration boundary.
 *
 * BLOCKER-10 (docs/phase-3f1-6-final-foundation-certification/
 * 17-safe-failure-wiring-certification.json) found that the live application
 * had ZERO import relationship, direct or transitive, with
 * lib/contract-model/compiler/**. This module closes that gap by COMPOSING
 * the already-fixed production modules (Workstreams A-E) into one real,
 * callable, persisted, idempotent sequence - see
 * docs/phase-3f1-6-r-blocker-remediation/14-live-contract-analysis-architecture.json
 * for the full design rationale and
 * 15-live-contract-analysis-orchestrator.json for this file's own
 * implementation summary.
 *
 * This file deliberately contains ONLY composition/sequencing logic. Every
 * real analytical decision (what is a covenant, what is ambiguous, what
 * needs review) is made by the already-fixed modules it calls, never
 * re-implemented here. It DOES NOT reuse or resurrect
 * lib/contract-model/compiler/orchestrator.ts (a different, quarantined
 * compiler generation - ContractCompilerRun/ContractCompilerStage - see that
 * file's own QUARANTINE NOTICE); this is a new orchestration boundary over
 * the CURRENT, real, deterministic-substrate pipeline generation
 * (discovery/package-graph/context-retrieval/amendment/semantic/
 * semantic-verification/semantic-coverage/safe-failure), mirroring the
 * dependency order the frozen certification run
 * (scripts/phase-3f-first-blind-run.ts) already proved works end-to-end.
 *
 * Composed sequence (task's own expected shape, confirmed against every
 * real callee's own signature - see the architecture artifact for the
 * per-edge dependency check):
 *
 *   document ingestion (caller-supplied Document rows)
 *   -> structural analysis (stage-structure/-definitions/-references/-index)
 *   -> structural persistence (persistStructuralNodes)
 *   -> package relationships (package-graph/pipeline -> persistPackageGraph)
 *   -> amendment/operative state (amendment/pipeline -> operative-state)
 *   -> material covenant discovery (discovery/pipeline, per document)
 *   -> recursive context retrieval (context-retrieval/pipeline, per candidate)
 *   -> semantic compilation (semantic/package-compile -> semantic/compile)
 *   -> independent semantic verification (semantic-verification/verify)
 *   -> whole-document semantic coverage (semantic-coverage/pipeline)
 *   -> explicit ClaimReviewItem persistence (safe-failure/integrate - the
 *      SAME single wired emission point Workstream A-E already built, never
 *      a second/parallel one)
 *   -> completed analysis state (AnalysisRun COMPLETED/COMPLETED_WITH_REVIEW)
 *
 * Fault isolation (task step 7 - "no single generic fatal error"): a
 * document-ingestion failure (cannot retrieve/parse a document's own bytes)
 * is genuinely fatal to the whole run (there is no meaningful partial
 * analysis without source text) and fails the AnalysisRun. Everything below
 * structural analysis is scoped PER INSTRUMENT (a company's documents that
 * package-graph did not confidently group together are analyzed
 * independently) and, within an instrument, per-section discovery failures
 * and per-candidate compilation failures are already isolated by the
 * underlying modules themselves (runDiscoveryPipeline's own per-section
 * try/catch; compilePackageToIR's own per-candidate try/catch) - this file
 * adds one more layer, isolating one INSTRUMENT's unexpected failure from
 * its siblings, so one malformed instrument's pipeline never discards
 * already-computed, unrelated valid claims for the rest of the package.
 */
import { prisma } from "../../prisma";
import { getDocumentStorageProvider } from "../../document-storage";
import { parseDocument } from "../../extraction/parse";
import { inferContentType } from "../../onboarding/documents";
import { runStructureStage } from "../compiler/stage-structure";
import { STRUCTURAL_INDEX_VERSION } from "../compiler/types";
import { detectStructuralDefinitions } from "../compiler/structural-definitions";
import { detectStructuralReferences } from "../compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../compiler/structural-index";
import { persistStructuralNodes } from "../compiler/persistence";
import { buildPackageGraph } from "../compiler/package-graph/pipeline";
import { persistPackageGraph } from "../compiler/package-graph/persistence";
import type { InstrumentGroupingResult, PackageDocumentInput, PackageGraphResult } from "../compiler/package-graph/types";
import { runAmendmentPipeline } from "../compiler/amendment/pipeline";
import { computeOperativeContractState } from "../compiler/amendment/operative-state";
import type { OperativeContractState } from "../compiler/amendment/types";
import { runDiscoveryPipeline } from "../compiler/discovery/pipeline";
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import { buildCovenantContextBundle, type PackageAccess } from "../compiler/context-retrieval/pipeline";
import { isEligibleForSemanticCompilation, compilePackageToIR, type PackageCompilationCandidate } from "../compiler/semantic/package-compile";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../compiler/semantic/types";
import { getSemanticCaller, type SemanticCaller } from "../compiler/semantic/caller";
import { getStageCaller, type StageCaller } from "../compiler/llm-caller";
import { verifyCompiledCandidate } from "../compiler/semantic-verification/verify";
import { SEMANTIC_VERIFIER_PROMPT_VERSION } from "../compiler/semantic-verification/types";
import type { SemanticVerificationResult } from "../compiler/semantic-verification/types";
import { runSemanticCoverageAudit } from "../compiler/semantic-coverage/pipeline";
import { recordClaimReviewsFromPackageCoverage } from "../compiler/safe-failure/integrate";
import { IR_SCHEMA_VERSION } from "../ir/types";
import { canonicalDocumentIdOrder, computeAnalysisPackageKey, standaloneInstrumentKey, CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION } from "./identity";
import { startOrResumeAnalysisRun, setAnalysisRunStage, completeAnalysisRun, failAnalysisRun, recordAnalysisRunIssue, recordAnalysisFailureLog } from "./service";
import { persistSemanticTruthForInstrument } from "./semantic-truth/service";
import type { SemanticTruthObjectInput } from "./semantic-truth/types";
import { CONTRACT_DOCUMENT_TYPE_SET } from "./types";
import type { InstrumentAnalysisOutcome, RunContractAnalysisInput, RunContractAnalysisResult } from "./types";

export interface ContractAnalysisCallers {
  /** Injectable for testing (a ScriptedStageCaller, mirroring this codebase's own established test convention - e.g. tests/contract-model/phase-2f2-discovery-schema-robustness.test.ts) - defaults to the real, env-var-driven getStageCaller() (which itself safely falls back to a zero-cost synthetic caller off Vercel with no credential configured). */
  discoveryCaller?: StageCaller;
  amendmentCaller?: StageCaller;
  verificationCaller?: StageCaller;
  semanticCaller?: SemanticCaller;
  /** Layer C (bounded AI inventory) for semantic-coverage - omit for the legitimate, cheaper Layers-A/B-only deterministic configuration (this orchestrator's default; see runSemanticCoverageAudit's own doc comment on this being "a legitimate, cheaper, deterministic-only configuration"). */
  aiInventoryCaller?: StageCaller;
}

export interface RunContractAnalysisOptions {
  callers?: ContractAnalysisCallers;
}

function classifyError(err: unknown): { message: string; errorClass: string } {
  return { message: err instanceof Error ? err.message : String(err), errorClass: err instanceof Error ? err.constructor.name : "UnknownError" };
}

/** One instrument-shaped unit of work: either a real package-graph InstrumentGroupingResult, or a single un-grouped document standing in for itself (see identity.ts's standaloneInstrumentKey doc comment). */
interface InstrumentUnit {
  instrumentKey: string;
  baseDocumentId: string | null;
  documentIds: string[];
}

function resolveInstrumentUnits(packageGraph: PackageGraphResult, allDocumentIds: string[]): InstrumentUnit[] {
  const grouped = new Set<string>();
  const units: InstrumentUnit[] = packageGraph.instruments.map((inst: InstrumentGroupingResult) => {
    for (const id of inst.documentIds) grouped.add(id);
    return { instrumentKey: inst.instrumentKey, baseDocumentId: inst.baseDocumentId, documentIds: inst.documentIds };
  });
  for (const documentId of allDocumentIds) {
    if (grouped.has(documentId)) continue;
    units.push({ instrumentKey: standaloneInstrumentKey(documentId), baseDocumentId: documentId, documentIds: [documentId] });
  }
  return units;
}

/**
 * Runs the full composed pipeline for ONE instrument unit's own document
 * subset, returning its own coverage/claim-review outcome. Never throws for
 * an ordinary per-candidate/per-section failure (those are already isolated
 * by the callees themselves); a genuinely unexpected exception propagates to
 * the caller, which isolates it at the INSTRUMENT granularity (see this
 * file's own header comment).
 */
async function analyzeInstrument(params: {
  companyId: string;
  analysisPackageKey: string;
  runId: string;
  unit: InstrumentUnit;
  index: StructuralIndex;
  packageGraph: PackageGraphResult;
  packageDocsById: Map<string, PackageDocumentInput>;
  exactTermsByDocument: Map<string, Map<string, string>>;
  callers: Required<Pick<ContractAnalysisCallers, "discoveryCaller" | "amendmentCaller" | "verificationCaller" | "semanticCaller">> & Pick<ContractAnalysisCallers, "aiInventoryCaller">;
}): Promise<InstrumentAnalysisOutcome> {
  const { companyId, analysisPackageKey, runId, unit, index, packageGraph, packageDocsById, exactTermsByDocument, callers } = params;
  const instrumentDocs = unit.documentIds.map((id) => packageDocsById.get(id)!).filter(Boolean);

  // --- amendment/operative state ---
  const amendmentResult = await runAmendmentPipeline(callers.amendmentCaller, { documents: instrumentDocs, packageGraph, index });
  const operativeState: OperativeContractState | null = unit.baseDocumentId
    ? computeOperativeContractState({ instrumentKey: unit.instrumentKey, baseDocumentId: unit.baseDocumentId, asOfDate: new Date().toISOString().slice(0, 10), index, allEffects: amendmentResult.effects })
    : null;

  // --- material covenant discovery (per document) ---
  const allCandidates: DiscoveredCandidate[] = [];
  for (const doc of instrumentDocs) {
    const result = await runDiscoveryPipeline(callers.discoveryCaller, doc.documentId, index);
    allCandidates.push(...result.candidates);
  }

  // --- recursive context retrieval (per candidate) ---
  const access: PackageAccess = { index, packageGraph, exactTermsByDocument };
  const bundlesByDiscoveryId = new Map<string, ReturnType<typeof buildCovenantContextBundle>>();
  for (const candidate of allCandidates) {
    bundlesByDiscoveryId.set(candidate.discoveryId, buildCovenantContextBundle({ candidate, packageKey: analysisPackageKey, companyId, instrumentKey: unit.instrumentKey }, access));
  }

  // --- semantic compilation (eligible candidates, package-compile's own bounded-concurrency + per-candidate fault isolation - reused, never re-implemented) ---
  const eligibleCandidates = allCandidates.filter((c) => isEligibleForSemanticCompilation(c).eligible);
  const compilationCandidates: PackageCompilationCandidate[] = eligibleCandidates.map((candidate) => {
    const bundle = bundlesByDiscoveryId.get(candidate.discoveryId)!;
    // NOTE (disclosed minimal integration fix - see this file's own header
    // comment on "genuine integration-blocking bug found while wiring"):
    // the frozen reference run (scripts/phase-3f-first-blind-run.ts) builds
    // this exact same operativeSourceText from `candidate.structuralNodeKeys`
    // (the label-shaped, NOT occurrence-safe, `${documentId}::${sectionRef}`
    // key - see DiscoveredCandidate's own @deprecated comment on that
    // field). StructuralIndex.getNodeText looks its argument up via a real
    // node-id map (structural-index.ts's own `nodesById.get(nodeId)`), which
    // a label-shaped key never matches, so that line silently returns ""
    // for every candidate - the compiler would receive empty operative
    // source text. This orchestrator uses `structuralNodeIds` instead - the
    // real, occurrence-safe counterpart DiscoveredCandidate's own comment
    // names as the field to use for identity/lookup - which is what
    // getNodeText actually requires.
    const operativeSourceText = candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\n\n");
    const compilerInput: SemanticCompilerInput = {
      companyId,
      instrumentKey: unit.instrumentKey,
      sourceDocumentId: candidate.documentId,
      candidateRef: candidate.discoveryId,
      sourceSectionRef: candidate.normalizedSourceRef,
      operativeSourceText,
      contextBundle: bundle,
      operativeLineage: null,
      toolAccess: { structuralIndex: index, operativeState, packageGraph, amendmentEffects: amendmentResult.effects, contextBundle: bundle },
      irSchemaVersion: IR_SCHEMA_VERSION,
      compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
      compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
      toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    };
    return { candidate, compilerInput };
  });
  const compilationSummary = await compilePackageToIR(companyId, unit.instrumentKey, compilationCandidates, { caller: callers.semanticCaller });
  const compiledByDiscoveryId = new Map(compilationSummary.results.map((r) => [r.discoveryId, r] as const));

  // --- independent semantic verification (per compiled candidate; per-candidate fault isolation, matching compilePackageToIR's own discipline) ---
  const verificationResults: SemanticVerificationResult[] = [];
  for (const entry of compilationSummary.results) {
    if (entry.result.status === "FAILED") continue;
    const compilerInput = compilationCandidates.find((c) => c.candidate.discoveryId === entry.discoveryId)!.compilerInput;
    try {
      verificationResults.push(await verifyCompiledCandidate({ compilerInput, compilationResult: entry.result }, { reviewCaller: callers.verificationCaller }));
    } catch {
      // An uncaught verification exception for ONE candidate is deliberately
      // NOT fabricated into a synthetic SemanticVerificationResult (that
      // would be reimplementing this module's own status taxonomy, which
      // this file's header comment forbids). Simply omitting it from
      // verificationResults/verifiedCandidateRefs already produces the
      // correct, honest downstream effect: this candidate is absent from
      // verifiedCandidateRefs, so reconciliation.ts's own real logic treats
      // it exactly like "verification never ran for this candidate" -
      // trust is withheld, and semantic-coverage still surfaces a real
      // review item for it if it is material. No claim is silently
      // dropped; it is simply never credited as verified.
    }
  }
  const verifiedCandidateRefs = new Set(verificationResults.filter((v) => v.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || v.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS").map((v) => v.candidateRef));

  // --- AUDIT-F1: durable semantic-truth persistence (this workstream's own
  // primary fix). Every real rule/definition the compiler produced for THIS
  // instrument is durably persisted (upserted, idempotent - see
  // semantic-truth/service.ts's own header comment), paired with the
  // verification result for the candidate it came from (null when
  // verification never ran/threw for that candidate - see this file's own
  // note above on why an uncaught verification exception is never
  // fabricated into a synthetic result: the object is still persisted here,
  // honestly as trustStatus COMPILED, never silently dropped). ---
  const verificationByCandidateRef = new Map(verificationResults.map((v) => [v.candidateRef, v] as const));
  const semanticTruthObjects: SemanticTruthObjectInput[] = compilationSummary.results.flatMap((entry) => {
    const compilerInput = compilationCandidates.find((c) => c.candidate.discoveryId === entry.discoveryId)?.compilerInput;
    const compilerVersions = compilerInput
      ? { irSchemaVersion: compilerInput.irSchemaVersion, compilerAlgorithmVersion: compilerInput.compilerAlgorithmVersion, compilerPromptVersion: compilerInput.compilerPromptVersion, toolPolicyVersion: compilerInput.toolPolicyVersion }
      : { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    const verification = verificationByCandidateRef.get(entry.discoveryId) ?? null;
    const ruleObjects: SemanticTruthObjectInput[] = entry.result.rules.map((rule) => ({ kind: "RULE", object: rule, candidateRef: entry.discoveryId, compilerVersions, verification, verifierPromptVersion: verification ? SEMANTIC_VERIFIER_PROMPT_VERSION : null }));
    const definitionObjects: SemanticTruthObjectInput[] = entry.result.definitions.map((def) => ({ kind: "DEFINITION", object: def, candidateRef: entry.discoveryId, compilerVersions, verification, verifierPromptVersion: verification ? SEMANTIC_VERIFIER_PROMPT_VERSION : null }));
    return [...ruleObjects, ...definitionObjects];
  });
  const semanticTruthSummary = await persistSemanticTruthForInstrument({ companyId, packageKey: analysisPackageKey, instrumentKey: unit.instrumentKey, analysisRunId: runId, objects: semanticTruthObjects });

  // --- whole-document semantic coverage (the freeze-before-load independent audit) ---
  const coverageResult = await runSemanticCoverageAudit({
    companyId,
    packageKey: analysisPackageKey,
    instrumentKey: unit.instrumentKey,
    index,
    documents: unit.documentIds.map((documentId) => ({ documentId })),
    discoveredCandidates: allCandidates,
    compiledResults: compilationSummary.results.map((r) => ({ candidateRef: r.discoveryId, rules: r.result.rules, definitions: r.result.definitions })),
    verifiedCandidateRefs,
    operativeState,
    operativeVersionRef: null,
    aiCaller: callers.aiInventoryCaller,
    structuralParserVersion: STRUCTURAL_INDEX_VERSION,
    providerIdentity: callers.discoveryCaller.providerName,
  });

  // --- explicit ClaimReviewItem persistence (the ONE wired safe-failure emission point) ---
  const claimReviewOutcomes = await recordClaimReviewsFromPackageCoverage(coverageResult.packageCoverage);

  return {
    instrumentKey: unit.instrumentKey,
    baseDocumentId: unit.baseDocumentId,
    documentIds: unit.documentIds,
    discoveredCandidateCount: allCandidates.length,
    compiledCount: compilationSummary.completedCount + compilationSummary.partialCount,
    verifiedCount: verifiedCandidateRefs.size,
    packageCoverage: coverageResult.packageCoverage,
    documentDetails: coverageResult.documentDetails,
    claimReviewOutcomes,
    semanticTruthSummary,
  };
}

/**
 * The live contract-analysis orchestration boundary. Analyzes a COMPANY's
 * full current contract-document set as one package (see
 * 19-contract-truth-ownership-map.json for why this is the disclosed,
 * bounded scoping decision for this phase, and CONTRACT_DOCUMENT_TYPE_SET
 * for exactly which Document.type values are in scope).
 *
 * Idempotent by construction (see identity.ts + service.ts's own header
 * comments): re-triggering for an unchanged document set converges on the
 * SAME AnalysisRun row and re-runs a pipeline whose every downstream write
 * is itself upsert-safe; a concurrent duplicate trigger for the identical
 * identity is skipped (SKIPPED_ALREADY_RUNNING) rather than double-run.
 */
export async function runContractAnalysis(input: RunContractAnalysisInput, options: RunContractAnalysisOptions = {}): Promise<RunContractAnalysisResult> {
  const { companyId } = input;
  const analysisAlgorithmVersion = CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION;

  // AUDIT-F7 (no log-only failure): everything from here through claiming a
  // real AnalysisRun row (startOrResumeAnalysisRun) has NO runId yet to
  // attach a durable fatalError to - this is the one genuine gap a prior
  // audit found (a DB failure on the very first query, or inside
  // startOrResumeAnalysisRun's own claim attempt, would previously escape
  // uncaught to app/'s own runExtractionAction, which only console.errors
  // it). This whole span is wrapped so a real failure here ALWAYS leaves a
  // durable Postgres trace (AnalysisFailureLog) before this function
  // returns/throws - the console.error at the app-action call site remains
  // pure defense-in-depth, never the only record, exactly as its own
  // comment already claims.
  let documents: Awaited<ReturnType<typeof prisma.document.findMany>>;
  let documentIds: string[];
  let packageKey: string;
  let runId: string;
  try {
    documents = await prisma.document.findMany({ where: { companyId, type: { in: [...CONTRACT_DOCUMENT_TYPE_SET] as never[] } }, orderBy: { createdAt: "asc" } });
    if (documents.length === 0) {
      return { outcome: "SKIPPED_NO_CONTRACT_DOCUMENTS", runId: null, status: null, companyId, packageKey: null, documentIds: [], analysisAlgorithmVersion, instruments: [], openReviewItemCount: 0, fatalError: null, instrumentFailures: [] };
    }

    documentIds = canonicalDocumentIdOrder(documents.map((d) => d.id));
    packageKey = computeAnalysisPackageKey(companyId, documentIds);

    const startOutcome = await startOrResumeAnalysisRun({ companyId, packageKey, documentIds, analysisAlgorithmVersion });
    if (startOutcome.kind === "ALREADY_RUNNING") {
      return { outcome: "SKIPPED_ALREADY_RUNNING", runId: startOutcome.run.id, status: startOutcome.run.status, companyId, packageKey, documentIds, analysisAlgorithmVersion, instruments: [], openReviewItemCount: startOutcome.run.reviewItemCount, fatalError: null, instrumentFailures: [] };
    }
    runId = startOutcome.run.id;
  } catch (err) {
    const { message, errorClass } = classifyError(err);
    await recordAnalysisFailureLog({ companyId, triggeringDocumentId: input.triggeringDocumentId ?? null, stage: "PRE_RUN_IDENTITY", errorClass, message });
    return { outcome: "FAILED", runId: null, status: null, companyId, packageKey: null, documentIds: [], analysisAlgorithmVersion, instruments: [], openReviewItemCount: 0, fatalError: { stage: "PRE_RUN_IDENTITY", message, errorClass }, instrumentFailures: [] };
  }

  const callers: Required<Pick<ContractAnalysisCallers, "discoveryCaller" | "amendmentCaller" | "verificationCaller" | "semanticCaller">> & Pick<ContractAnalysisCallers, "aiInventoryCaller"> = {
    discoveryCaller: options.callers?.discoveryCaller ?? getStageCaller(),
    amendmentCaller: options.callers?.amendmentCaller ?? getStageCaller(),
    verificationCaller: options.callers?.verificationCaller ?? getStageCaller(),
    semanticCaller: options.callers?.semanticCaller ?? getSemanticCaller(),
    aiInventoryCaller: options.callers?.aiInventoryCaller,
  };

  try {
    // --- document ingestion: real bytes -> real parsed text (never chunk-reconstructed - see this function's own note below) ---
    await setAnalysisRunStage(runId, "INGESTION");
    const storage = getDocumentStorageProvider();
    // Deliberately re-parses each document's own stored bytes via the SAME
    // parseDocument this document's own upload-time pipeline already used
    // (lib/onboarding/documents.ts's uploadAndChunkDocument), rather than
    // reconstructing text from persisted DocumentChunk rows - chunk.ts's own
    // OVERLAP_CHARS means adjacent chunks share text at their boundary, so
    // naive concatenation would duplicate/corrupt exactly the char offsets
    // structural-index.ts's own charStart/charEnd discipline depends on
    // being exact. Re-parsing the immutable original bytes is the single
    // source of truth both paths already agree on.
    const packageDocs: PackageDocumentInput[] = [];
    for (const doc of documents) {
      if (!doc.storageRef) throw new Error(`Document ${doc.id} has no storageRef - cannot be analyzed (was it created outside the upload pipeline?)`);
      const bytes = await storage.retrieve(doc.storageRef);
      const contentType = inferContentType(doc.originalFilename ?? doc.name);
      const parsed = await parseDocument(bytes, contentType);
      packageDocs.push({ documentId: doc.id, label: doc.name, text: parsed.fullText, declaredType: doc.type });
    }
    const packageDocsById = new Map(packageDocs.map((d) => [d.documentId, d] as const));

    // --- structural analysis ---
    await setAnalysisRunStage(runId, "STRUCTURAL_ANALYSIS");
    const structureRes = runStructureStage(packageDocs);
    const allNodes = structureRes.output;
    const nodesByDocument = new Map(packageDocs.map((d) => [d.documentId, { text: d.text, nodes: allNodes.filter((n) => n.documentId === d.documentId) }] as const));
    const allDefinitions = packageDocs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, allNodes.filter((n) => n.documentId === d.documentId)));
    const allReferences = packageDocs.flatMap((d) => detectStructuralReferences(d.documentId, d.text, allNodes.filter((n) => n.documentId === d.documentId)));
    const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

    // --- structural persistence ---
    await setAnalysisRunStage(runId, "STRUCTURAL_PERSISTENCE");
    await persistStructuralNodes(companyId, allNodes);

    // --- package relationships ---
    await setAnalysisRunStage(runId, "PACKAGE_RELATIONSHIPS");
    const packageGraph = buildPackageGraph(companyId, packageKey, packageDocs);
    await persistPackageGraph(companyId, packageGraph);

    const exactTermsByDocument = new Map<string, Map<string, string>>();
    for (const def of allDefinitions) {
      if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
      exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
    }

    const instrumentUnits = resolveInstrumentUnits(packageGraph, documentIds);

    // --- amendment/operative state -> discovery -> context retrieval -> semantic compilation -> verification -> coverage -> review persistence, per instrument ---
    await setAnalysisRunStage(runId, "PER_INSTRUMENT_ANALYSIS");
    const instrumentOutcomes: InstrumentAnalysisOutcome[] = [];
    const instrumentErrors: { instrumentKey: string; documentIds: string[]; message: string; errorClass: string }[] = [];
    for (const unit of instrumentUnits) {
      try {
        instrumentOutcomes.push(await analyzeInstrument({ companyId, analysisPackageKey: packageKey, runId, unit, index, packageGraph, packageDocsById, exactTermsByDocument, callers }));
      } catch (err) {
        // Fault isolation at instrument granularity (this file's own header
        // comment): one instrument's unexpected failure never discards
        // already-computed, unrelated valid claims from its siblings.
        instrumentErrors.push({ instrumentKey: unit.instrumentKey, documentIds: unit.documentIds, ...classifyError(err) });
      }
    }

    // AUDIT-F3 (no silent material failure): every instrument-level failure
    // is durably persisted BEFORE this run's own completion status is
    // decided - never left only in this in-memory array. Runs whether the
    // overall attempt below ends up FAILED (every instrument failed) or
    // PARTIAL (some succeeded) - an audit reading AnalysisRunIssue must see
    // every real failure either way, not just the one folded into
    // fatalError's own summary text for the total-failure case.
    for (const failure of instrumentErrors) {
      await recordAnalysisRunIssue({ runId, companyId, instrumentKey: failure.instrumentKey, documentIds: failure.documentIds, failedStage: "PER_INSTRUMENT_ANALYSIS", errorClass: failure.errorClass, message: failure.message });
    }

    if (instrumentOutcomes.length === 0 && instrumentErrors.length > 0) {
      // Every instrument failed - there is nothing meaningful to report as a
      // partial success; this is the genuinely fatal case task step 7
      // reserves for a whole-run failure. Every individual failure was
      // ALREADY durably recorded as its own AnalysisRunIssue row above -
      // fatalError's own summary text here is a convenience denormalization
      // of the FIRST failure only, never the sole durable trace of the
      // others (contrast with the pre-AUDIT-F3 behavior this replaces).
      const firstError = instrumentErrors[0]!;
      await failAnalysisRun(runId, { stage: "PER_INSTRUMENT_ANALYSIS", message: `every instrument failed (${instrumentErrors.length} total; see AnalysisRunIssue for each); first error (${firstError.instrumentKey}): ${firstError.message}`, errorClass: firstError.errorClass });
      return {
        outcome: "FAILED",
        runId,
        status: "FAILED",
        companyId,
        packageKey,
        documentIds,
        analysisAlgorithmVersion,
        instruments: [],
        openReviewItemCount: 0,
        fatalError: { stage: "PER_INSTRUMENT_ANALYSIS", message: firstError.message, errorClass: firstError.errorClass },
        instrumentFailures: instrumentErrors.map((e) => ({ instrumentKey: e.instrumentKey, errorClass: e.errorClass, message: e.message })),
      };
    }

    // --- explicit review persistence already happened per instrument above (safe-failure/integrate.ts) - completed analysis state below ---
    await setAnalysisRunStage(runId, "REVIEW_PERSISTENCE");
    const openReviewItemCount = await prisma.claimReviewItem.count({ where: { companyId, packageKey, status: "OPEN_REVIEW" } });

    // AUDIT-F3: PARTIAL (not COMPLETED/COMPLETED_WITH_REVIEW) whenever ANY
    // instrument in this attempt threw - even though other instruments in
    // instrumentOutcomes genuinely succeeded and their own trusted state is
    // real and persisted (never discarded - this file's own header comment
    // on instrument-level fault isolation). See AnalysisRunStatus's own
    // schema comment for why this is a deliberately separate status from
    // COMPLETED_WITH_REVIEW.
    await completeAnalysisRun(runId, { openReviewItemCount, hadInstrumentFailures: instrumentErrors.length > 0 });
    const finalRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });

    return {
      outcome: "STARTED_TO_COMPLETION",
      runId,
      status: finalRun.status,
      companyId,
      packageKey,
      documentIds,
      analysisAlgorithmVersion,
      instruments: instrumentOutcomes,
      openReviewItemCount,
      fatalError: null,
      instrumentFailures: instrumentErrors.map((e) => ({ instrumentKey: e.instrumentKey, errorClass: e.errorClass, message: e.message })),
    };
  } catch (err) {
    const { message, errorClass } = classifyError(err);
    await failAnalysisRun(runId, { stage: "INGESTION_OR_STRUCTURAL", message, errorClass });
    return { outcome: "FAILED", runId, status: "FAILED", companyId, packageKey, documentIds, analysisAlgorithmVersion, instruments: [], openReviewItemCount: 0, fatalError: { stage: "INGESTION_OR_STRUCTURAL", message, errorClass }, instrumentFailures: [] };
  }
}
