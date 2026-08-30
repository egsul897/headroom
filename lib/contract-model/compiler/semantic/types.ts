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

/**
 * Phase 3B.1 (task §35) - any change to output orchestration, tool-use
 * policy, prompt wording, or continuation/recovery logic MUST bump the
 * relevant version constant below, because cache.ts's own computeCacheKey
 * folds all three into its content hash: bumping one guarantees a stale
 * Phase 3B-era cached compilation (produced under the old 8192-token
 * ceiling, the old tool-use prompt, or the old tool policy) is never
 * silently served after this fix, while leaving unrelated Phase 2 state
 * (structural index, context bundles, operative state) completely
 * untouched - this is an additive cache-key input, not a schema migration.
 */
export const SEMANTIC_COMPILER_ALGORITHM_VERSION = "phase-3b1-semantic-compiler.v2";
export const SEMANTIC_COMPILER_PROMPT_VERSION = "phase-3b1-semantic-compiler-prompt.v2";
export const SEMANTIC_COMPILER_TOOL_POLICY_VERSION = "phase-3b1-tool-policy.v2";

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
  /**
   * Phase 3F.1.6-terminal Part A (OPEN-2 / BLOCKER-5 / BLOCKER-6) - true
   * only when this call's own returned evidence could not be confirmed
   * current operative truth (see ToolExecutionOutcome.evidenceUnresolved
   * in semantic/tools.ts for the full contract); undefined for a refusal
   * or for a tool discipline this does not apply to. compileCovenantToIR
   * (compile.ts) and verifyCompiledCandidate (semantic-verification/
   * verify.ts) both scan this field so a candidate can never be marked
   * COMPLETED/VERIFIED off an unresolved definition alone, regardless of
   * whether the model's own self-reported sufficiency noticed it.
   */
  evidenceUnresolved?: boolean;
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
  | "PARTIAL_COMPILATION"
  /** Phase 3B.1 (task §5/§10) - distinct from MODEL_SCHEMA_FAILURE: the provider's own `stop_reason` confirmed the response was cut off at the output-token ceiling (a transport/capacity fact, not a model reasoning mistake). Set only when caller.ts has POSITIVE evidence of truncation (stop_reason === "max_tokens"), never inferred from a schema failure alone - see caller.ts's own recoverPartialSubmission for the accompanying safe-prefix-recovery behavior this pairs with. */
  | "OUTPUT_TRUNCATED"
  /** Phase 3B.1 (task §16) - the dependency genuinely exists and is source-referenced, but the specific evidence needed to resolve it (a document, a schedule, an external agreement) is confirmed absent even after an attempted bounded tool retrieval - distinct from UNSUPPORTED_SEMANTICS, which means the IR itself cannot faithfully express a mechanic even with full evidence in hand. */
  | "TOOL_RESOLUTION_FAILED"
  /** Phase 3F.1 §33/F6 - a genuine thrown exception escaped the model-call/tool-use loop (network/transport error, timeout, an unexpected internal error) rather than compileCovenantToIR's own structured MODEL_SCHEMA_FAILURE/IR_VALIDATION_FAILURE paths, which only ever trigger on a returned-but-unusable response. Distinct because the caller never even received a response to classify - see errorDetail below for the specific failure class/message. */
  | "TRANSPORT_OR_INTERNAL_ERROR";

/** Phase 3F.1 §33/F6 - preserved for every FAILED result whose failureReasons includes TRANSPORT_OR_INTERNAL_ERROR (never populated for any other failure path, which already carries its own structured detail via failureReasons/unresolvedIssues). Bounded and sanitized - never a raw stack dump, never a credential/token value, per task §33's explicit "no secrets/unrestricted stack dumps" instruction. */
export interface SemanticCompilerErrorDetail {
  /** e.g. "TypeError", "AbortError", "Error" - the thrown value's own constructor name, or "UnknownError" when the thrown value was not an Error instance. */
  errorClass: string;
  /** Bounded (<=500 chars), sanitized: any substring matching a common credential/token/bearer-header shape is redacted before storage. */
  sanitizedMessage: string;
  /** Best-effort coarse bucket for triage - inferred from the error class/message, never authoritative. */
  failureCategory: "TRANSPORT" | "SCHEMA" | "MODEL" | "TOOL" | "INTERNAL";
  /** Number of retry attempts already made by the caller before this exception was thrown, when the caller tracks retries; null when not tracked. */
  retryCount: number | null;
  /** True when a partial submission had already been assembled (e.g. a partial tool-use transcript) before the exception interrupted compilation - distinct from OUTPUT_TRUNCATED, which is a completed-but-truncated response. */
  hadPartialOutput: boolean;
}

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
  /** Phase 3F.1 §33/F6 - non-null only when failureReasons includes TRANSPORT_OR_INTERNAL_ERROR. */
  errorDetail: SemanticCompilerErrorDetail | null;
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
