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
import { runStructureStageWithAmbiguityResolution, type StructuralReviewSignal, type StructuralAmbiguityResolutionRateMetrics } from "../compiler/structural-ambiguity-resolution";
import { STRUCTURAL_INDEX_VERSION } from "../compiler/types";
import { detectStructuralDefinitions } from "../compiler/structural-definitions";
import { detectStructuralReferences } from "../compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../compiler/structural-index";
import { persistStructuralNodes } from "../compiler/persistence";
import { buildPackageGraph } from "../compiler/package-graph/pipeline";
import { persistPackageGraph } from "../compiler/package-graph/persistence";
import type { InstrumentGroupingResult, PackageDocumentInput, PackageGraphResult } from "../compiler/package-graph/types";
import { runAmendmentPipeline } from "../compiler/amendment/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus, EMPTY_SUPERSESSION_INDEX } from "../compiler/amendment/operative-state";
import type { OperativeContractState, NodeSupersessionIndex, NodeSupersessionResult, NodeSupersessionStatus, OperativeStateStatus } from "../compiler/amendment/types";
import { runDiscoveryPipeline } from "../compiler/discovery/pipeline";
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import type { OperativeLineageRef } from "../ir/types";
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
  /**
   * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1, REAL-orchestrator
   * wiring fix - docs/phase-3f1-human-architecture-decision/
   * 04-structural-implementation.json's own "workstreamOPEN1RealOrchestratorWiringFix"
   * section). The STRUCTURE stage below now calls
   * `runStructureStageWithAmbiguityResolution` (structural-ambiguity-resolution.ts)
   * instead of the old, purely-deterministic `runStructureStage` - a genuinely
   * AMBIGUOUS structural candidate (one the deterministic triage cannot
   * confidently resolve on typography alone) is routed to the bounded
   * structural-ambiguity classifier, which is itself an LLM call and therefore
   * needs a real `StageCaller` exactly like discoveryCaller/amendmentCaller/
   * verificationCaller above. Injectable here for the identical reason those
   * are: a test can supply a ScriptedStageCaller to deterministically drive
   * (or force fail-closed on) the classifier without a real credential or
   * network call. Defaults to the real, env-var-driven getStageCaller() below.
   */
  structuralCaller?: StageCaller;
  semanticCaller?: SemanticCaller;
  /** Layer C (bounded AI inventory) for semantic-coverage - omit for the legitimate, cheaper Layers-A/B-only deterministic configuration (this orchestrator's default; see runSemanticCoverageAudit's own doc comment on this being "a legitimate, cheaper, deterministic-only configuration"). */
  aiInventoryCaller?: StageCaller;
}

export interface RunContractAnalysisOptions {
  callers?: ContractAnalysisCallers;
}

/**
 * Fix 3F.1 FIX-3 (this workstream): `classifyError` is the failure-
 * observability FLOOR of the whole orchestrator - every catch block in this
 * file calls it, including ones with nothing further to fall back to (see
 * the PRE_RUN_IDENTITY catch block below). A prior independent audit
 * (tests/contract-model/part-b-terminal-recert-open6-independent.test.ts)
 * proved the previous one-line implementation was NOT total over `unknown`:
 *
 *   return { message: err instanceof Error ? err.message : String(err),
 *             errorClass: err instanceof Error ? err.constructor.name : "UnknownError" };
 *
 * Every operation in that line can itself throw for a hostile `err`:
 *   - `err.message` is a property GETTER access on the real object - a
 *     genuine `Error` (or subclass) instance can still have `message`
 *     overridden with a throwing getter (Object.defineProperty). `instanceof
 *     Error` being true is NOT proof `.message` is safe to read.
 *   - `err.constructor` is likewise a property GETTER access - a poisoned
 *     `constructor` getter, or a Proxy that throws on ANY `get` trap, throws
 *     here even for a value that otherwise looks like a normal object.
 *   - `String(err)` invokes `ToPrimitive(err, "string")`, which calls a
 *     user-controlled `Symbol.toPrimitive` or `toString`/`valueOf` - any of
 *     which can throw (a broken custom class, a hostile mock/wrapper).
 *
 * `safeErrorMessage`/`safeErrorClass` below make EACH individual read/
 * coercion its own defensive try/catch, deliberately NOT one try/catch
 * wrapping the whole function - a single hostile property (e.g. a poisoned
 * `message` getter on an otherwise perfectly normal Error) degrades ONLY
 * that one signal, never the other, and never recurses (a degraded fallback
 * is always a fixed string literal, never re-fed through these functions).
 */
const UNREADABLE_MESSAGE_FALLBACK = "[unreadable thrown value]";
const UNKNOWN_ERROR_CLASS_FALLBACK = "UnknownError";

/**
 * Total over ALL of `unknown`. Never assumes `instanceof Error` implies
 * `.message` is safe (defends the PoisonedMessageError-style construction
 * above: a real Error subclass with `message` overridden as a throwing
 * getter), never assumes `String(value)` is safe (defends a non-Error value
 * with a throwing `toString`/`Symbol.toPrimitive`), and never assumes
 * `instanceof Error` itself is safe to evaluate - `instanceof` invokes the
 * target's internal `[[GetPrototypeOf]]`, which for a Proxy runs the
 * `getPrototypeOf` trap, so a Proxy that throws on ANY trap (including that
 * one) throws from the `instanceof` check itself, before any property of
 * `value` is ever explicitly read. That check is therefore inside its own
 * try below, never gating entry the way a plain `if` would.
 */
export function safeErrorMessage(value: unknown): string {
  let isRealError = false;
  try {
    isRealError = value instanceof Error;
  } catch {
    // `instanceof Error` itself threw (a Proxy whose getPrototypeOf trap
    // throws) - treat as "not an Error" and fall through to the generic
    // String(value) path below.
  }
  if (isRealError) {
    try {
      const msg = (value as Error).message;
      if (typeof msg === "string") return msg;
      // A `.message` getter that returns a non-string (e.g. a hostile
      // subclass) still needs a safe stringification, not a raw return.
      try {
        return String(msg);
      } catch {
        return UNREADABLE_MESSAGE_FALLBACK;
      }
    } catch {
      // Reading `.message` itself threw (poisoned getter) - fall through to
      // the generic String(value) path below rather than giving up
      // immediately; a poisoned `message` getter does not imply `String()`
      // on the same object is also poisoned, though it independently might
      // be (guarded again immediately below).
    }
  }
  try {
    return String(value);
  } catch {
    return UNREADABLE_MESSAGE_FALLBACK;
  }
}

/**
 * Total over ALL of `unknown`. Never assumes `.constructor` is safe to read
 * (defends a poisoned `constructor` getter, and a Proxy that throws on ANY
 * property `get` - including `constructor` and `instanceof`'s own internal
 * `getPrototypeOf` trap, which is why the `instanceof Error` check itself is
 * inside the try below rather than gating entry into it).
 */
export function safeErrorClass(value: unknown): string {
  try {
    if (value instanceof Error) {
      try {
        const ctor: unknown = value.constructor;
        if (typeof ctor === "function" && typeof ctor.name === "string" && ctor.name.length > 0) return ctor.name;
        return "Error";
      } catch {
        // `.constructor` itself threw (poisoned getter, or a Proxy) - a real
        // Error instance whose class name cannot be read still IS an Error,
        // so this is a safer fallback than the generic UnknownError below.
        return "Error";
      }
    }
  } catch {
    // Even the `instanceof Error` check threw (a Proxy whose `get`/
    // `getPrototypeOf` trap throws on every access). Fall through.
  }
  return UNKNOWN_ERROR_CLASS_FALLBACK;
}

/**
 * NEVER throws for ANY JavaScript value - see safeErrorMessage/
 * safeErrorClass above for the specific adversarial value each individual
 * guard defends against. Every call site in this file relies on this
 * contract holding even for the value that caused the very failure being
 * classified.
 */
export function classifyError(err: unknown): { message: string; errorClass: string } {
  return { message: safeErrorMessage(err), errorClass: safeErrorClass(err) };
}

/**
 * FINDING-6 (zombie-writer fencing) - thrown by `setStageOrBail` (inside
 * `runContractAnalysis`) the instant a `setAnalysisRunStage` call reports it
 * did NOT apply (a newer execution has since reclaimed this same `runId` and
 * bumped its `executionGeneration` past what this execution was handed at
 * claim time). Caught by `runContractAnalysis`'s own outer try/catch and
 * routed to a `SKIPPED_SUPERSEDED` result WITHOUT calling `failAnalysisRun`
 * (which would itself just no-op against the same stale generation, and
 * would incorrectly suggest this execution still had standing to report a
 * failure for a run it no longer owns) - this execution simply stops making
 * further state-mutating calls the moment it learns it has been superseded.
 */
class RunSupersededError extends Error {
  constructor(public readonly stage: string) {
    super(`AnalysisRun execution superseded at stage ${stage} (a newer owner has since reclaimed this run)`);
    this.name = "RunSupersededError";
  }
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

/** Worst-first severity, mirroring discovery/pass-d-reconcile.ts's own combineSupersessionForNodes convention (KNOWN_SUPERSEDED > UNKNOWN > CURRENT_OPERATIVE) - reused here, never re-derived independently, so a candidate spanning several structural nodes can never be reported safer than its worst node. */
const SUPERSESSION_SEVERITY: Record<NodeSupersessionStatus, number> = { KNOWN_SUPERSEDED: 2, UNKNOWN_SUPERSESSION_STATUS: 1, CURRENT_OPERATIVE: 0 };

/**
 * Derives a genuine OperativeLineageRef for one compiled candidate from the
 * real NodeSupersessionIndex this orchestrator now builds (see
 * analyzeInstrument's own header comment on the AUDIT-F1/BLOCKER-2 coupled
 * fix this pairs with). This is the one place operativeLineage is ever
 * constructed for the live orchestrator - previously hardcoded null,
 * silently defeating semantic/normalize.ts's own enforceSufficiencyConsistency
 * downgrade for every real candidate regardless of actual amendment state.
 */
function deriveOperativeLineage(candidate: DiscoveredCandidate, supersessionIndex: NodeSupersessionIndex, instrumentKey: string, asOfDate: string): OperativeLineageRef {
  let worst: NodeSupersessionResult | null = null;
  for (const nodeId of candidate.structuralNodeIds) {
    const result = getNodeSupersessionStatus(supersessionIndex, candidate.documentId, nodeId);
    if (!worst || SUPERSESSION_SEVERITY[result.status] > SUPERSESSION_SEVERITY[worst.status]) worst = result;
  }
  const resolved: NodeSupersessionResult = worst ?? { status: "UNKNOWN_SUPERSESSION_STATUS", record: null, reason: "This candidate carries no structural node identity at all - supersession status cannot be determined." };
  const operativeStatus: OperativeStateStatus =
    resolved.status === "KNOWN_SUPERSEDED" ? "OPERATIVE_STATE_CONFLICTED" : resolved.status === "UNKNOWN_SUPERSESSION_STATUS" ? "OPERATIVE_STATE_REVIEW_REQUIRED" : "OPERATIVE_STATE_RESOLVED";
  return {
    instrumentKey: resolved.record?.instrumentKey ?? instrumentKey,
    provisionKey: resolved.record?.provisionKey ?? `${candidate.documentId}::${candidate.normalizedSourceRef}`,
    asOfDate,
    operativeStatus,
    currentSourceDocumentId: resolved.record?.supersededByAmendmentDocumentId ?? candidate.documentId,
  };
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
  /** FINDING-6 (zombie-writer fencing) - the generation this execution held at claim time, threaded down so persistSemanticTruthForInstrument can gate its own write against a fresh read of the run's CURRENT generation (see semantic-truth/service.ts's own doc comment on why this is a pre-write gate, not a per-row CAS). */
  expectedGeneration: number;
  unit: InstrumentUnit;
  index: StructuralIndex;
  packageGraph: PackageGraphResult;
  packageDocsById: Map<string, PackageDocumentInput>;
  exactTermsByDocument: Map<string, Map<string, string>>;
  callers: Required<Pick<ContractAnalysisCallers, "discoveryCaller" | "amendmentCaller" | "verificationCaller" | "semanticCaller">> & Pick<ContractAnalysisCallers, "aiInventoryCaller">;
}): Promise<InstrumentAnalysisOutcome> {
  const { companyId, analysisPackageKey, runId, expectedGeneration, unit, index, packageGraph, packageDocsById, exactTermsByDocument, callers } = params;
  const instrumentDocs = unit.documentIds.map((id) => packageDocsById.get(id)!).filter(Boolean);

  // --- amendment/operative state ---
  const asOfDate = new Date().toISOString().slice(0, 10);
  const amendmentResult = await runAmendmentPipeline(callers.amendmentCaller, { documents: instrumentDocs, packageGraph, index });
  const operativeState: OperativeContractState | null = unit.baseDocumentId
    ? computeOperativeContractState({ instrumentKey: unit.instrumentKey, baseDocumentId: unit.baseDocumentId, asOfDate, index, allEffects: amendmentResult.effects })
    : null;

  // Phase 3F.1.6.RX Workstream B / orchestrator-integration fix (the
  // NEW_COUPLED_BLOCKER_DISCOVERED this workstream found while revalidating
  // BLOCKER-2 - see docs/phase-3f1-6-rx-final-blocker-closure/
  // 04-operative-supersession-remediation.json): this orchestrator computed
  // operativeState above but NEVER used it to build a NodeSupersessionIndex
  // or pass one to runDiscoveryPipeline - every real DiscoveredCandidate's
  // own supersessionStatus therefore silently resolved UNKNOWN_SUPERSESSION_
  // STATUS in live production regardless of real amendment data (discovery/
  // pipeline.ts's own EMPTY_SUPERSESSION_INDEX default), which in turn made
  // Workstream B's own context-retrieval fix (buildCovenantContextBundle
  // reading candidate.supersessionStatus) inert end-to-end in the one place
  // that actually runs live. Building and threading the real index here
  // closes the whole chain in one root-cause fix.
  const supersessionIndex: NodeSupersessionIndex = unit.baseDocumentId && operativeState ? buildNodeSupersessionIndex([{ baseDocumentId: unit.baseDocumentId, state: operativeState }]) : EMPTY_SUPERSESSION_INDEX;

  // --- material covenant discovery (per document) ---
  const allCandidates: DiscoveredCandidate[] = [];
  for (const doc of instrumentDocs) {
    const result = await runDiscoveryPipeline(callers.discoveryCaller, doc.documentId, index, supersessionIndex);
    allCandidates.push(...result.candidates);
  }

  // --- recursive context retrieval (per candidate) ---
  // Phase 3F.1 FIX-2 - operativeState/supersessionIndex are the SAME real,
  // already-computed values threaded into SemanticToolAccess below for the
  // model's own evidence tools; passing them here too closes the gap a prior
  // independent auditor found (buildCovenantContextBundle previously had no
  // operative-state awareness at all - every DEFINITION/SECTION excerpt was
  // read raw and unconditionally, regardless of a real, on-file
  // CONFLICTED/AMBIGUOUS/superseded amendment state).
  const access: PackageAccess = { index, packageGraph, exactTermsByDocument, operativeState, supersessionIndex };
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
    // Phase 3F.1.6.RX orchestrator-integration fix (paired with the
    // supersessionIndex wiring above): operativeLineage was previously
    // hardcoded null, silently disabling normalize.ts's own
    // enforceSufficiencyConsistency downgrade (OPERATIVE_STATE_CONFLICTED/
    // REVIEW_REQUIRED forcing a non-COMPLETE sufficiency) for every real
    // candidate - this candidate's own supersessionStatus is now genuinely
    // computed (via the real supersessionIndex threaded into discovery
    // above), so it is honestly reflected here rather than discarded.
    const operativeLineage = deriveOperativeLineage(candidate, supersessionIndex, unit.instrumentKey, asOfDate);
    const compilerInput: SemanticCompilerInput = {
      companyId,
      instrumentKey: unit.instrumentKey,
      sourceDocumentId: candidate.documentId,
      candidateRef: candidate.discoveryId,
      sourceSectionRef: candidate.normalizedSourceRef,
      operativeSourceText,
      contextBundle: bundle,
      operativeLineage,
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
  const semanticTruthSummary = await persistSemanticTruthForInstrument({ companyId, packageKey: analysisPackageKey, instrumentKey: unit.instrumentKey, analysisRunId: runId, objects: semanticTruthObjects, expectedGeneration });

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
  // FINDING-6 (zombie-writer fencing) - the execution generation THIS call
  // won at claim time (StartAnalysisRunOutcome.run.executionGeneration).
  // Every mutating call this execution makes from here on presents this
  // exact value, never a value re-read later (see service.ts's own
  // setAnalysisRunStage doc comment for why that distinction matters).
  let generation: number;
  try {
    documents = await prisma.document.findMany({ where: { companyId, type: { in: [...CONTRACT_DOCUMENT_TYPE_SET] as never[] } }, orderBy: { createdAt: "asc" } });
    if (documents.length === 0) {
      return { outcome: "SKIPPED_NO_CONTRACT_DOCUMENTS", runId: null, status: null, companyId, packageKey: null, documentIds: [], analysisAlgorithmVersion, instruments: [], openReviewItemCount: 0, fatalError: null, instrumentFailures: [], structuralReviewSignals: [], structuralAmbiguityMetrics: null, failureRecordPersisted: null, failureRecordError: null, failureRecordFallbackLogged: null };
    }

    documentIds = canonicalDocumentIdOrder(documents.map((d) => d.id));
    packageKey = computeAnalysisPackageKey(companyId, documentIds);

    const startOutcome = await startOrResumeAnalysisRun({ companyId, packageKey, documentIds, analysisAlgorithmVersion });
    if (startOutcome.kind === "ALREADY_RUNNING") {
      return { outcome: "SKIPPED_ALREADY_RUNNING", runId: startOutcome.run.id, status: startOutcome.run.status, companyId, packageKey, documentIds, analysisAlgorithmVersion, instruments: [], openReviewItemCount: startOutcome.run.reviewItemCount, fatalError: null, instrumentFailures: [], structuralReviewSignals: [], structuralAmbiguityMetrics: null, failureRecordPersisted: null, failureRecordError: null, failureRecordFallbackLogged: null };
    }
    runId = startOutcome.run.id;
    generation = startOutcome.run.executionGeneration;
  } catch (err) {
    const { message, errorClass } = classifyError(err);
    const fatalError = { stage: "PRE_RUN_IDENTITY" as const, message, errorClass };

    // Part B AUDIT-F7 recertification (FINDING-8): recordAnalysisFailureLog
    // is itself a Postgres write, independent of the ORIGINAL failure just
    // classified above - a single transient statement failure there (a
    // serialization error, momentary pool exhaustion, a bad FK), not
    // necessarily a total outage, can throw on its own. This call is
    // therefore wrapped in its OWN try/catch, deliberately narrow (it must
    // never widen to swallow anything else in this catch block). Two
    // invariants this specific try/catch exists to guarantee:
    //   1. The ORIGINAL error (`fatalError` above) is NEVER masked or
    //      replaced by a failure of the recording write - it is already
    //      fully captured before this write is even attempted, and is
    //      always what gets returned to the caller below regardless of how
    //      this write goes.
    //   2. This function still NEVER throws uncaught from this catch block
    //      (the one contract this whole PRE_RUN_IDENTITY branch exists to
    //      hold) - a bad recording write must not defeat that.
    // The fallback on failure is deliberately NOT another attempt to write
    // through the same failing abstraction (prisma/Postgres) - retrying or
    // routing to a different table would just be "log failure -> log the
    // logging failure" with new names, which this phase's own constraint
    // forbids. A structured console.error is the genuine, deliberate SECOND
    // tier of this fallback hierarchy: it does not depend on the abstraction
    // that just failed, and it is never confused with the durable case via
    // the separately-observable `failureRecordPersisted` result field.
    //
    // OPEN-6 / AUDIT-F7 (Part B FINDING-8 recertification, construction 3 -
    // docs/phase-3f1-6-rx-final-terminal-closure/20-part-b-finding8-
    // recertification.json): an earlier version of this fallback assumed a
    // bare `console.error` call "cannot throw under this runtime's own
    // semantics" and left it unguarded. That premise does not hold for a
    // wrapped/instrumented `console` (Sentry's console integration, a
    // Winston/pino console transport, Next.js edge-runtime console
    // interception, or any other environment that monkey-patches console
    // methods) - a reproducible construction showed that throwing escaping
    // this call uncaught, one tier deeper than the original defect. The
    // console.error call is therefore now ITS OWN try/catch, deliberately
    // narrow and with an otherwise-empty catch body: there is genuinely
    // nothing further to attempt from inside a DB-logger's own failure path
    // - in particular, NEVER another call back into
    // recordAnalysisFailureLog/Postgres (that would just be "log the logging
    // failure" recursing into the same failing abstraction this whole branch
    // exists to route around; see `failureRecordFallbackLogged` below for
    // this tier's own success/failure signal, which is set but never itself
    // logged anywhere). This is the true, disclosed BOTTOM of the fallback
    // hierarchy: whatever happens here, this function still returns its
    // normal structured `FAILED` result below rather than letting anything
    // propagate uncaught.
    let failureRecordPersisted = true;
    let failureRecordError: { message: string; errorClass: string } | null = null;
    let failureRecordFallbackLogged: boolean | null = null;
    try {
      await recordAnalysisFailureLog({ companyId, triggeringDocumentId: input.triggeringDocumentId ?? null, stage: fatalError.stage, errorClass: fatalError.errorClass, message: fatalError.message });
    } catch (recordErr) {
      failureRecordPersisted = false;
      const recordFailure = classifyError(recordErr);
      failureRecordError = { message: recordFailure.message, errorClass: recordFailure.errorClass };
      try {
        // Deliberate, disclosed, terminal last-resort observability path -
        // NOT a substitute for the durable AnalysisFailureLog row that could
        // not be written. Kept clearly distinguished (both in this label and
        // in the structured payload) from the ordinary, durably-persisted
        // case so this can never be mistaken for a successful recording.
        console.error("[runContractAnalysis] AUDIT-F7 fallback: could not durably record a PRE_RUN_IDENTITY failure - the AnalysisFailureLog write itself failed. This console line is a last-resort trace only; no Postgres row exists for the original failure below.", {
          originalFailure: fatalError,
          failureRecordError,
        });
        failureRecordFallbackLogged = true;
      } catch {
        // TRUE bottom: even the last-resort console trace itself threw (a
        // wrapped/instrumented console - see comment above). Intentionally
        // swallowed with no further action of any kind - no retry, no
        // alternate channel, and above all no call back into any
        // Postgres-backed logger. `failureRecordFallbackLogged` records the
        // fact honestly; the caller still gets a normal, structured,
        // never-success-shaped `FAILED` result below.
        failureRecordFallbackLogged = false;
      }
    }

    return {
      outcome: "FAILED",
      runId: null,
      status: null,
      companyId,
      packageKey: null,
      documentIds: [],
      analysisAlgorithmVersion,
      instruments: [],
      openReviewItemCount: 0,
      fatalError,
      failureRecordPersisted,
      failureRecordError,
      failureRecordFallbackLogged,
      instrumentFailures: [],
      structuralReviewSignals: [],
      structuralAmbiguityMetrics: null,
    };
  }

  const callers: Required<Pick<ContractAnalysisCallers, "discoveryCaller" | "amendmentCaller" | "verificationCaller" | "structuralCaller" | "semanticCaller">> & Pick<ContractAnalysisCallers, "aiInventoryCaller"> = {
    discoveryCaller: options.callers?.discoveryCaller ?? getStageCaller(),
    amendmentCaller: options.callers?.amendmentCaller ?? getStageCaller(),
    verificationCaller: options.callers?.verificationCaller ?? getStageCaller(),
    structuralCaller: options.callers?.structuralCaller ?? getStageCaller(),
    semanticCaller: options.callers?.semanticCaller ?? getSemanticCaller(),
    aiInventoryCaller: options.callers?.aiInventoryCaller,
  };

  // Phase 3F.1 Human Architecture Decision (Workstream OPEN-1, REAL-orchestrator
  // wiring fix): populated by the STRUCTURE stage below (empty/null until then,
  // and left at their default whenever a return path is reached before the
  // STRUCTURE stage ever runs - e.g. SKIPPED_NO_CONTRACT_DOCUMENTS/
  // SKIPPED_ALREADY_RUNNING/the PRE_RUN_IDENTITY FAILED case above, none of
  // which ever reach INGESTION). See `RunContractAnalysisResult`'s own doc
  // comment on these two fields for the full rationale - this mirrors
  // CompilerRunSummary.structuralReviewSignals/structuralAmbiguityMetrics in
  // the (quarantined) lib/contract-model/compiler/orchestrator.ts exactly.
  let structuralReviewSignals: StructuralReviewSignal[] = [];
  let structuralAmbiguityMetrics: StructuralAmbiguityResolutionRateMetrics | null = null;

  // FINDING-6 (zombie-writer fencing): every stage transition below presents
  // the SAME `generation` this execution won at claim time; the instant one
  // reports it did not apply, this execution has been superseded and must
  // stop making further AnalysisRun-mutating calls (see RunSupersededError's
  // own doc comment and the outer catch block below).
  const setStageOrBail = async (stage: string): Promise<void> => {
    const applied = await setAnalysisRunStage(runId, stage, generation);
    if (!applied) throw new RunSupersededError(stage);
  };
  const supersededResult = (stage: string): RunContractAnalysisResult => ({
    outcome: "SKIPPED_SUPERSEDED",
    runId,
    status: null,
    companyId,
    packageKey,
    documentIds,
    analysisAlgorithmVersion,
    instruments: [],
    openReviewItemCount: 0,
    fatalError: null,
    instrumentFailures: [],
    structuralReviewSignals,
    structuralAmbiguityMetrics,
    failureRecordPersisted: null,
    failureRecordError: null,
    failureRecordFallbackLogged: null,
  });

  try {
    // --- document ingestion: real bytes -> real parsed text (never chunk-reconstructed - see this function's own note below) ---
    await setStageOrBail("INGESTION");
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
    await setStageOrBail("STRUCTURAL_ANALYSIS");
    // Phase 3F.1 Human Architecture Decision (Workstream OPEN-1, REAL-
    // orchestrator wiring fix): this is THE live entry point a real end
    // user's compile run actually reaches (app/[companyId]/onboarding/
    // documents/actions.ts -> runContractAnalysis), unlike
    // lib/contract-model/compiler/orchestrator.ts (quarantined - see that
    // file's own header). Before this fix, this call site independently
    // called the old, synchronous, classifier-free `runStructureStage`
    // directly - the deterministic-triage + bounded-classifier architecture
    // (b017fee) was reachable in unit tests and through the quarantined
    // pipeline, but NEVER through a real user's compile. `instrumentKey:
    // packageKey` mirrors the identical choice the quarantined file's own
    // wiring fix already made (see that file's STRUCTURE-stage comment):
    // this stage runs ONCE for the whole package (`packageDocs`), before
    // `instrumentUnits` is even computed below, so the package's own
    // already-unique `packageKey` is the stable, unique-enough classifier-
    // cache identity scope - there is no per-instrument identity available
    // yet at this point in the pipeline.
    const structureRes = await runStructureStageWithAmbiguityResolution(packageDocs, { companyId, instrumentKey: packageKey }, callers.structuralCaller);
    structuralReviewSignals = structureRes.reviewSignals;
    structuralAmbiguityMetrics = structureRes.metrics;
    const allNodes = structureRes.output;
    const nodesByDocument = new Map(packageDocs.map((d) => [d.documentId, { text: d.text, nodes: allNodes.filter((n) => n.documentId === d.documentId) }] as const));
    const allDefinitions = packageDocs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, allNodes.filter((n) => n.documentId === d.documentId)));
    const allReferences = packageDocs.flatMap((d) => detectStructuralReferences(d.documentId, d.text, allNodes.filter((n) => n.documentId === d.documentId)));
    const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

    // --- structural persistence ---
    await setStageOrBail("STRUCTURAL_PERSISTENCE");
    await persistStructuralNodes(companyId, allNodes);

    // --- package relationships ---
    await setStageOrBail("PACKAGE_RELATIONSHIPS");
    const packageGraph = buildPackageGraph(companyId, packageKey, packageDocs);
    await persistPackageGraph(companyId, packageGraph);

    const exactTermsByDocument = new Map<string, Map<string, string>>();
    for (const def of allDefinitions) {
      if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
      exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
    }

    const instrumentUnits = resolveInstrumentUnits(packageGraph, documentIds);

    // --- amendment/operative state -> discovery -> context retrieval -> semantic compilation -> verification -> coverage -> review persistence, per instrument ---
    await setStageOrBail("PER_INSTRUMENT_ANALYSIS");
    const instrumentOutcomes: InstrumentAnalysisOutcome[] = [];
    const instrumentErrors: { instrumentKey: string; documentIds: string[]; message: string; errorClass: string }[] = [];
    for (const unit of instrumentUnits) {
      try {
        instrumentOutcomes.push(await analyzeInstrument({ companyId, analysisPackageKey: packageKey, runId, expectedGeneration: generation, unit, index, packageGraph, packageDocsById, exactTermsByDocument, callers }));
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
      // FINDING-6: gated on `generation` too (see recordAnalysisRunIssue's
      // own doc comment) - not individually bailed-out-of here, since a
      // superseded generation at this point is already conclusively
      // detected and handled by the failAnalysisRun/completeAnalysisRun
      // calls immediately below, whichever branch this attempt reaches.
      await recordAnalysisRunIssue({ runId, companyId, instrumentKey: failure.instrumentKey, documentIds: failure.documentIds, failedStage: "PER_INSTRUMENT_ANALYSIS", errorClass: failure.errorClass, message: failure.message, expectedGeneration: generation });
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
      const failResult = await failAnalysisRun(runId, { stage: "PER_INSTRUMENT_ANALYSIS", message: `every instrument failed (${instrumentErrors.length} total; see AnalysisRunIssue for each); first error (${firstError.instrumentKey}): ${firstError.message}`, errorClass: firstError.errorClass }, generation);
      // FINDING-6: a `null` result means a newer owner reclaimed this run
      // before this (superseded) execution could record its own failure -
      // that newer owner's own state is authoritative, never this one's.
      if (!failResult) return supersededResult("PER_INSTRUMENT_ANALYSIS");
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
        structuralReviewSignals,
        structuralAmbiguityMetrics,
        failureRecordPersisted: null,
        failureRecordError: null,
        failureRecordFallbackLogged: null,
      };
    }

    // --- explicit review persistence already happened per instrument above (safe-failure/integrate.ts) - completed analysis state below ---
    await setStageOrBail("REVIEW_PERSISTENCE");
    const openReviewItemCount = await prisma.claimReviewItem.count({ where: { companyId, packageKey, status: "OPEN_REVIEW" } });

    // AUDIT-F3: PARTIAL (not COMPLETED/COMPLETED_WITH_REVIEW) whenever ANY
    // instrument in this attempt threw - even though other instruments in
    // instrumentOutcomes genuinely succeeded and their own trusted state is
    // real and persisted (never discarded - this file's own header comment
    // on instrument-level fault isolation). See AnalysisRunStatus's own
    // schema comment for why this is a deliberately separate status from
    // COMPLETED_WITH_REVIEW.
    const completeResult = await completeAnalysisRun(runId, { openReviewItemCount, hadInstrumentFailures: instrumentErrors.length > 0 }, generation);
    // FINDING-6: a `null` result means a newer owner reclaimed this run
    // before this (superseded) execution reached completion - this
    // execution's own (by-then-meaningless) view of success must never be
    // written over the newer owner's real, live state (the exact "old
    // worker finishes and clobbers the new owner's COMPLETED state" defect
    // tests/contract-model/part-b-recert-auditf2-concurrency.test.ts's own
    // "ZOMBIE WRITER" test reproduced).
    if (!completeResult) return supersededResult("REVIEW_PERSISTENCE");

    return {
      outcome: "STARTED_TO_COMPLETION",
      runId,
      status: completeResult.status,
      companyId,
      packageKey,
      documentIds,
      analysisAlgorithmVersion,
      instruments: instrumentOutcomes,
      openReviewItemCount,
      fatalError: null,
      instrumentFailures: instrumentErrors.map((e) => ({ instrumentKey: e.instrumentKey, errorClass: e.errorClass, message: e.message })),
      structuralReviewSignals,
      structuralAmbiguityMetrics,
      failureRecordPersisted: null,
      failureRecordError: null,
      failureRecordFallbackLogged: null,
    };
  } catch (err) {
    if (err instanceof RunSupersededError) return supersededResult(err.stage);
    const { message, errorClass } = classifyError(err);
    const failResult = await failAnalysisRun(runId, { stage: "INGESTION_OR_STRUCTURAL", message, errorClass }, generation);
    if (!failResult) return supersededResult("INGESTION_OR_STRUCTURAL");
    return { outcome: "FAILED", runId, status: "FAILED", companyId, packageKey, documentIds, analysisAlgorithmVersion, instruments: [], openReviewItemCount: 0, fatalError: { stage: "INGESTION_OR_STRUCTURAL", message, errorClass }, instrumentFailures: [], structuralReviewSignals, structuralAmbiguityMetrics, failureRecordPersisted: null, failureRecordError: null, failureRecordFallbackLogged: null };
  }
}
