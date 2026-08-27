/**
 * Phase 3B - AI Semantic Covenant Compiler V1. Shared types (task §3/§4/
 * §29/§34). This module's job: OPERATIVE CONTRACTUAL EVIDENCE + COVENANT
 * CONTEXT + CONTROLLED RETRIEVAL TOOLS + the Phase 3A IR schema -> PROPOSED
 * source-backed IR. It is an interpretation layer, never the final
 * verifier (Phase 3C), never the deterministic calculator (Phase 4).
 *
 * PERSISTENCE (task §34) - none in V1, by deliberate design, extending the
 * exact same convention Phase 3A's own module header established (and
 * every other Phase 2 compiler submodule: discovery/, package-graph/,
 * context-retrieval/, amendment/ are all pure in-memory libraries). A
 * `SemanticCompilationCache` interface (cache.ts) is the documented
 * persistence-design decision: an in-memory Map implementation is provided
 * for this phase's own resumability/idempotency proof, and the interface
 * is written so a future Postgres-backed implementation (a new, additive
 * model analogous to ContractCompilerRun/ContractCompilerStage - never
 * touching that existing state machine, which the Roadmap's own migration
 * table explicitly says NOT to build 3B on top of) is a drop-in swap, not
 * a redesign. This keeps Phase 3B's own footprint additive-file-only,
 * matching this task's own "do not alter macro architecture without an
 * ARCHITECTURE_CHANGE_PROPOSAL."
 */
import type { CovenantContextBundle } from "../context-retrieval/types";
import type { StructuralIndex } from "../structural-index";
import type { AmendmentEffectCandidate, OperativeContractState } from "../amendment/types";
import type { PackageGraphResult } from "../package-graph/types";
import type { IRDefinition, IRRule, IRSharedCapacity, OperativeLineageRef } from "../../ir/types";
import type { AnalyzerCallTelemetry } from "../../analyzer/telemetry";

export const SEMANTIC_COMPILER_ALGORITHM_VERSION = "phase-3b-semantic-compiler.v1";
export const SEMANTIC_COMPILER_PROMPT_VERSION = "phase-3b-semantic-compiler-prompt.v1";
export const SEMANTIC_COMPILER_TOOL_POLICY_VERSION = "phase-3b-tool-policy.v1";

// ---------------------------------------------------------------------------
// Tool budgets (task §7) - bounded, never unlimited retrieval.
// ---------------------------------------------------------------------------

export interface ToolBudget {
  /** Hard ceiling on the number of evidence tool calls in one compilation attempt (submit_compilation does not count against this). */
  maxToolCalls: number;
  /** Hard ceiling on recursive definition/reference-chain depth a single tool call may traverse (mirrors context-retrieval's own RetrievalBudget.maxDefinitionDepth/maxCrossReferenceDepth discipline). */
  maxRecursionDepth: number;
  /** Hard ceiling on total additional source characters returned across every tool call in one attempt. */
  maxAdditionalSourceChars: number;
}

export const DEFAULT_TOOL_BUDGET: ToolBudget = { maxToolCalls: 8, maxRecursionDepth: 3, maxAdditionalSourceChars: 20_000 };

/** One real, source-backed tool invocation, logged for provenance/audit (task §7/§34) - never silently discarded. */
export interface ToolCallLogEntry {
  toolName: string;
  input: unknown;
  /** Bounded summary of what was returned, or the refusal reason when the tool declined (budget exhausted, target not found, cross-instrument request) - never the full raw text (that would defeat the point of bounding). */
  outputSummary: string;
  charsReturned: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Compiler input contract (task §3) - bounded, references only. No
// arbitrary package state is ever dumped into the prompt; the model
// receives exactly the CovenantContextBundle Phase 2D already built for
// this one candidate/provision, plus real, source-backed tools to request
// bounded MORE evidence when it identifies a specific need (task §5/§6).
// ---------------------------------------------------------------------------

/** The real Phase 2 indices the controlled tools (tools.ts) query against - never a raw DB handle, never unrestricted query access (task §6's own "do not expose unrestricted DB/query access to the model"). */
export interface SemanticToolAccess {
  structuralIndex: StructuralIndex;
  /** Null when Phase 2G's amendment pipeline found no operative-state entries for this instrument at all (never amended) - a legitimate, honest state, not an error. */
  operativeState: OperativeContractState | null;
  /** Null when Phase 2C's package-graph was not run for this package (a single-document instrument, most commonly) - getInstrumentDocuments()/getRelatedAmendments() degrade to "this document only" rather than failing. */
  packageGraph: PackageGraphResult | null;
  /** Null when no amendment pipeline run exists for this package. Real AmendmentEffectCandidate rows (which carry oldText/newText, unlike OperativeProvisionView's own summarized AmendmentChainEntry) - getPriorVersion() resolves a chain entry's effectId against this list for a source-backed prior-text answer, rather than fabricating one. */
  amendmentEffects: AmendmentEffectCandidate[] | null;
  /** The SAME bundle passed in SemanticCompilerInput.contextBundle - tools query it directly for getContextBundleComponent()/getSharedCapContext() rather than re-deriving a second copy. */
  contextBundle: CovenantContextBundle;
}

export interface SemanticCompilerInput {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  /** Stable identity of the candidate/provision being compiled - a Phase 2B DiscoveredCandidate.discoveryId where one exists, else the normalized source section ref. Never a fresh random id (task §27's own identity discipline, reused here). */
  candidateRef: string;
  sourceSectionRef: string | null;
  /** The bounded operative text itself - already resolved against Phase 2G's amendment chain where an operative-state entry exists for this provision (task §4), the base document's own structural text otherwise. Never the whole document. */
  operativeSourceText: string;
  /** Phase 2D's own bounded context bundle for this exact candidate - the static-context-first evidence (task §5). */
  contextBundle: CovenantContextBundle;
  /** Reused verbatim from Phase 3A's own IR type (task §4's own "the compiler must consume Phase 2G operative-state output") - null when this provision was never amended. */
  operativeLineage: OperativeLineageRef | null;
  toolAccess: SemanticToolAccess;
  toolBudget?: ToolBudget;
  irSchemaVersion: string;
  compilerAlgorithmVersion: string;
  compilerPromptVersion: string;
  toolPolicyVersion: string;
}

// ---------------------------------------------------------------------------
// Failure states (task §29) - explicit, never a silent empty result.
// ---------------------------------------------------------------------------

export type SemanticCompilerFailureReason =
  | "MODEL_SCHEMA_FAILURE"
  | "IR_VALIDATION_FAILURE"
  | "MISSING_CONTEXT"
  | "TOOL_BUDGET_EXHAUSTED"
  | "UNSUPPORTED_SEMANTICS"
  | "OPERATIVE_STATE_UNRESOLVED"
  | "PROVIDER_FAILURE"
  | "PARTIAL_COMPILATION";

/** Overall attempt-level status - distinct from any one rule's own IR `sufficiency` (task §35's "proposed, never human-approved" distinction: this is about whether the ATTEMPT produced usable output at all, sufficiency is about how COMPLETE each individual rule's own representation is). */
export type SemanticCompilationStatus = "COMPLETED" | "PARTIAL" | "REVIEW_REQUIRED" | "FAILED";

/** Task §10's own required escape hatch for the compiler itself (distinct from IRUnsupportedExpression, which is a per-node escape hatch): a genuinely new, reusable IR primitive the model believes is needed - recorded, never auto-implemented in this phase. */
export interface IRExtensionCandidate {
  sourceEvidence: string;
  semanticRequirement: string;
  whyExistingPrimitivesFail: string;
  candidateGeneralizedPrimitive: string;
}

export interface SemanticCompilationResult {
  status: SemanticCompilationStatus;
  failureReasons: SemanticCompilerFailureReason[];
  rules: IRRule[];
  definitions: IRDefinition[];
  sharedCapacities: IRSharedCapacity[];
  irExtensionCandidates: IRExtensionCandidate[];
  /** Human-readable notes surfaced by deterministic post-processing or the model's own overallNotes - never silent (matches StageRunResult.notes's own existing convention). */
  unresolvedIssues: string[];
  toolCallLog: ToolCallLogEntry[];
  /** The raw, unnormalized wire object the model actually submitted - preserved for audit/debugging, never treated as authoritative (task §9). */
  rawModelOutput: unknown;
  provider: string;
  model: string;
  /** Aggregated across every turn of the tool-use loop (input/output tokens summed, latency summed, cost summed) - a single attempt is not one API call, task §31/§50. */
  telemetry: AnalyzerCallTelemetry | null;
  /** Content-hash cache identity (task §31) - see cache.ts's own computeCacheKey. */
  cacheKey: string;
  compiledAt: string;
}
