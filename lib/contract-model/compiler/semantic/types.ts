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
import type { DefinitionCompletenessCheckResult } from "./completeness-check";
import type { FrozenSemanticInventory, SemanticAccountabilityResult, SourceContextResult } from "../semantic-accountability/types";

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
// Phase 3F.1 FIX-2 (trust-metadata-belongs-to-the-evidence-itself
// remediation) - bumped to v3: summarizeContextBundle (caller.ts) now
// renders each item's own evidenceStatus/reason in the model's first-turn
// prompt (a prompt-wording change), and compile.ts's own determineStatus
// gating now also forces non-COMPLETED status off a context-bundle-derived
// unresolved-evidence signal (an output-orchestration change) - either
// change alone requires a version bump per this module's own header
// comment; a cached Phase 3B/3B.1-era compilation (produced under the old
// prompt, with no such gating) must never be silently served as-is.
// SEMANTIC ACCOUNTABILITY bump (v3 -> v4): compile.ts now runs source-context
// sufficiency + Pass A inventory before the model call (output orchestration
// change), the first-turn prompt renders the frozen inventory and expanded
// source regions (prompt-wording change), the submit schema carries lineage
// and inventoryDispositions, and Pass C reconciliation feeds failureReasons.
// A v3-era cached compilation carries no accountability at all and must
// never be served as-is.
export const SEMANTIC_COMPILER_ALGORITHM_VERSION = "semantic-accountability-compiler.v4";
export const SEMANTIC_COMPILER_PROMPT_VERSION = "semantic-accountability-compiler-prompt.v4";
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
  /** POST-3F.2 remediation (Unit A3) - mirrors ToolExecutionOutcome.evidenceTruncated in semantic/tools.ts verbatim; see that field's own header comment for the full contract. */
  evidenceTruncated?: boolean;
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
  /**
   * SEMANTIC ACCOUNTABILITY (optional): absolute char offset of
   * operativeSourceText within sourceDocumentId's text. When supplied,
   * source-context sufficiency can prove whether the window is the complete
   * unit or a truncation (mission §12). Null/undefined = unknown offset.
   */
  operativeCharStart?: number | null;
  /** SEMANTIC ACCOUNTABILITY: populated by compileCovenantToIR before the model call - the resolved source-context (regions + state) handed to Pass A and Pass B. Never set by external callers. */
  sourceContext?: SourceContextResult | null;
  /** SEMANTIC ACCOUNTABILITY: the FROZEN Pass A inventory handed read-only to Pass B. Never set by external callers. */
  frozenInventory?: FrozenSemanticInventory | null;
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
  | "TRANSPORT_OR_INTERNAL_ERROR"
  /** POST-3F.2 remediation (Unit A2) - checkDefinitionCompleteness (./completeness-check.ts) found strong, quoted-citation evidence that the supplied source declares a defined term this attempt's compiled definitions[] does not represent. Never asserts what the missing term means; routes the attempt to at least REVIEW_REQUIRED via determineStatus below, exactly like every other failureReason. */
  | "DEFINITION_COMPLETENESS_SUSPECT"
  /** POST-3F.2 remediation (Unit A3) - at least one evidence tool call this attempt made returned text truncated at semantic/tools.ts's MAX_TEXT_RESULT_CHARS ceiling (ToolCallLogEntry.evidenceTruncated). Truncated evidence must never be silently treated as complete - this failureReason makes that explicit rather than leaving it to the model's own judgment of a JSON `truncated` flag it could ignore. */
  | "TRUNCATED_EVIDENCE_USED"
  /** SEMANTIC ACCOUNTABILITY (mission §12): source-context sufficiency proved the operative window is TRUNCATED_SOURCE or STRUCTURALLY_INCOMPLETE_SOURCE against its own unit boundary - inventory cannot inventory source it never received, so this attempt can never be COMPLETED. */
  | "SOURCE_CONTEXT_TRUNCATED"
  /** SEMANTIC ACCOUNTABILITY (mission §9/§10): Pass C found at least one CRITICAL/MATERIAL frozen-inventory item (or material quantitative value) with NO lineage in the composed IR and NO explicit disposition - a first-class safety signal; never COMPLETED. */
  | "INVENTORY_ITEM_MISSING_FROM_COMPOSITION"
  /** SEMANTIC ACCOUNTABILITY: Pass A failed or returned an empty inventory over source that carries quantitative values/operative language (INVENTORY_FAILED / INVENTORY_EMPTY_SUSPECT) - accountability cannot be established, so this attempt can never be COMPLETED. Not raised for INVENTORY_SKIPPED_NO_PROVIDER (no real provider configured), which is disclosed on the result instead. */
  | "SEMANTIC_INVENTORY_UNAVAILABLE"
  /** SEMANTIC ACCOUNTABILITY v2 (Phase 3 final closure, decision 05): Pass A ran but, even after its bounded gap re-inventory, left at least one operative-text segment carrying operative/conditional drafting language uncovered (INVENTORY_COVERAGE_GAP, residual segments disclosed on frozenInventory.uninventoriedSegments). Accountability for that text is not established, so this attempt can never be COMPLETED - the omission is visible instead of silent. */
  | "SEMANTIC_INVENTORY_COVERAGE_GAP";

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
  /**
   * Phase 3F.1 FIX-2 (§4 of the governing fix spec, "the actual safety gate
   * must not require any tool call") - computed directly from
   * `input.contextBundle.hasUnresolvedOperativeEvidence`, independent of
   * `toolCallLog` (which can be completely EMPTY when the model answers on
   * its very first turn with zero tool calls - the exact reproduced
   * exploit). True whenever the context bundle handed to the model itself
   * contained a CONFLICTED/AMBIGUOUS/PARTIAL/superseded item. Threaded
   * ALONGSIDE (never instead of) `toolCallLog[].evidenceUnresolved` -
   * semantic-verification/verify.ts's own determineStatus and this module's
   * own determineStatus both force non-COMPLETED/non-VERIFIED status off
   * EITHER source.
   */
  /** Optional (mirrors CovenantContextBundle's own fields this is derived from) - undefined only for a result object hand-built by pre-existing test fixtures that predate this fix; every real compileCovenantToIR call sets a real boolean. verify.ts's own gating treats undefined identically to false - never upgraded to a false "resolved" claim by omission. */
  inputHasUnresolvedOperativeEvidence?: boolean;
  /** itemIds from the context bundle that set inputHasUnresolvedOperativeEvidence above - bounded provenance, mirrors CovenantContextBundle.unresolvedEvidenceItemIds verbatim (never re-derived). */
  unresolvedEvidenceItemIds?: string[];
  /**
   * POST-3F.2 remediation (Unit A2) - the deterministic definition-
   * completeness cross-check's own result for this attempt (see
   * ./completeness-check.ts), preserved verbatim for provenance/audit.
   * Null whenever the check ran and found no suspected omission (the
   * common case). Diagnostic only: this field never itself contributes
   * semantic content to `definitions`/`rules` - see failureReasons for how
   * a `fired: true` result participates in `status` (via determineStatus,
   * exactly like every other failure reason - never a new/different status
   * kind).
   *
   * Optional (mirrors inputHasUnresolvedOperativeEvidence's own established
   * convention immediately above) - undefined only for a result object
   * hand-built by pre-existing test fixtures/mocks that predate this
   * remediation, or for the no-submission/transport-failure paths where no
   * compiled definitions ever existed to check. Every real
   * compileCovenantToIR call that reaches normalization sets a real value.
   */
  definitionCompletenessCheck?: DefinitionCompletenessCheckResult | null;
  /** SEMANTIC ACCOUNTABILITY: the source-context sufficiency result this attempt ran under (regions with provenance + state). Null when accountability was disabled for this call; undefined on results built by pre-existing fixtures. */
  sourceContext?: SourceContextResult | null;
  /** SEMANTIC ACCOUNTABILITY: the FROZEN Pass A inventory (hashed before Pass B ran). Null when accountability was disabled. */
  frozenInventory?: FrozenSemanticInventory | null;
  /** SEMANTIC ACCOUNTABILITY: Pass C's deterministic reconciliation of the frozen inventory against the composed IR. Null when accountability was disabled or no submission was produced. Never consumed by the independent verifier. */
  accountability?: SemanticAccountabilityResult | null;
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
