/**
 * Phase 3C - Independent Semantic Covenant Verification V1
 * (docs/HEADROOM-ROADMAP.md §2's Phase 3 sequence, North Star §10).
 *
 * This module's job: given the SAME source evidence Phase 3B saw, plus
 * Phase 3B's PROPOSED IR, independently evaluate whether the proposed IR
 * faithfully represents the materially relevant contractual source. It is
 * the trust layer between AI interpretation and future executable
 * contractual state (Phase 4) - it reports findings, it never repairs or
 * re-derives a competing IR.
 *
 * ===========================================================================
 * INDEPENDENCE CONTRACT (task §4) - full text here, at the type-definition
 * site, exactly mirroring coverage-audit/types.ts's own established
 * convention (Phase 2E) rather than inventing a new place to put it.
 * ===========================================================================
 *
 * ALLOWED INPUTS to verification:
 *  - source structural nodes/spans (Phase 2A's StructuralIndex - the same
 *    read-only navigation API semantic/tools.ts already wraps);
 *  - the CovenantContextBundle Phase 2D already retrieved for this exact
 *    candidate (already-gathered evidence, not a compiler conclusion);
 *  - operative contract state / lineage (Phase 2G's OperativeContractState,
 *    OperativeLineageRef - a fact about which text currently governs, not a
 *    compiler opinion about what it means);
 *  - package/instrument topology (Phase 2C's PackageGraphResult) where
 *    relevant to cross-reference/dependency verification;
 *  - the Phase 3A IR actually proposed by Phase 3B (SemanticCompilationResult)
 *    - the OBJECT being verified, not a source of truth about itself;
 *  - deterministic structural/reference infrastructure (structural-index.ts,
 *    structural-definitions.ts, structural-references.ts - the same
 *    primitives, reused directly, never reimplemented);
 *  - independently computed source-side signals (this module's own
 *    source-inventory.ts, built the same way coverage-audit/source-inventory.ts
 *    builds its inventory - from raw indexed text, not from anyone's
 *    conclusions about that text);
 *  - reviewed benchmark expectations (ExpectedRuleShape-style ground truth)
 *    - ONLY during evaluation/fault-injection testing, NEVER inside
 *    production verification code paths.
 *
 * FORBIDDEN as a verification source of truth:
 *  - Phase 3B compiler reasoning, hidden reasoning, or prompt conclusions
 *    (the compiler's own overallNotes/sufficiencyReasons/unresolvedIssues
 *    text may be LOGGED for audit but must never be treated as evidence
 *    that a representation is correct);
 *  - compiler confidence (a rule's own `sufficiency: "COMPLETE"`) as proof
 *    of correctness - task §19 requires COMPLETE to face STRONGER scrutiny,
 *    never a free pass;
 *  - known benchmark answers during PRODUCTION verification (evaluation
 *    code - fault-injection tests, the lsb-6.13/action-classification
 *    adversarial checks - is exempt, since it exists specifically to grade
 *    the verifier from outside; production verification code must never
 *    import or branch on a benchmark expectation);
 *  - Phase 3B grading conclusions (grading.ts's ExpectedRuleShape/
 *    SemanticErrorFinding are benchmark-comparison tools with no role in
 *    production verification, which has no ground truth to compare against);
 *  - manually supplied expected errors;
 *  - package-specific expected basket counts, thresholds, or section
 *    numbers embedded in any matching/decision/prompt logic (Architecture
 *    Invariants #29, the Anti-Benchmark-Gaming Contract).
 *
 * The verifier MAY inspect compiler output (that is its whole job - see
 * "the OBJECT being verified" above). It may NOT trust compiler conclusions
 * merely because they came from the compiler.
 *
 * MECHANICAL ENFORCEMENT (task §4's own "at minimum add an import-boundary
 * test"): tests/contract-model/semantic-verification-independence.test.ts
 * statically inspects every file under this directory's own import
 * statements and fails if any of them import
 * lib/contract-model/compiler/semantic/compile.ts (compileCovenantToIR -
 * the compiler's own entry point) or lib/contract-model/compiler/semantic/caller.ts's
 * RealSemanticCaller/getSemanticCaller (the compiler's own model-calling
 * loop) - mirroring coverage-audit-independence.test.ts's exact technique
 * (a static regex-over-import-lines check, not a runtime sandbox). This
 * module is free to import semantic/tools.ts and semantic/types.ts (pure
 * data-access wrappers and shared type definitions - not compiler
 * reasoning) and lib/contract-model/ir/* (the IR itself, and its own
 * structural validators, which is what is being verified).
 *
 * DISTINCTION FROM PHASE 2E (task §5): Phase 2E asks whether contractual
 * source/context was DISCOVERED/RETRIEVED. Phase 3C asks whether RETRIEVED
 * contractual meaning was REPRESENTED FAITHFULLY in IR. These are
 * deliberately not merged - a candidate can be perfectly discovered and
 * perfectly retrieved (2E finds nothing wrong) while still being
 * misrepresented in IR (3C's own job to catch), and vice versa.
 *
 * DISTINCTION FROM PHASE 3B GRADING (task §5): grading.ts evaluates against
 * hand-authored ExpectedRuleShape benchmark ground truth and has no role at
 * production runtime, when no such ground truth exists. This module's
 * production code path (source-inventory.ts, ir-inventory.ts,
 * reconciliation.ts, reviewer.ts, verify.ts) must never import
 * ExpectedRuleShape or anything from grading.ts. Evaluation code
 * (tests/.../semantic-verification-adversarial.test.ts,
 * fault-injection.test.ts) is exempt and MAY import grading.ts fixtures
 * for its own scoring, exactly as the Phase 3B.1 fault-injection tests do.
 *
 * SHARED-SUBSTRATE INDEPENDENCE (Architecture Invariants #18, North Star
 * §10's closing paragraph): this verifier shares Phase 2A's StructuralIndex
 * with the compiler it checks, exactly as Phase 2E's auditor shares it with
 * Phase 2B's discovery. That shared-substrate risk is inherited, not
 * eliminated, by this design - a StructuralIndex defect could in principle
 * defeat both the compiler and this verifier simultaneously, the same way
 * it once defeated Phase 2B and Phase 2E together in Phase 2F's blind run.
 * This is disclosed here, not silently accepted: Layer 2's adversarial
 * semantic review operates on the RAW operativeSourceText string
 * (input.compilerInput.operativeSourceText) directly, not solely through
 * StructuralIndex re-navigation, giving it a partial independent fallback
 * path analogous to Phase 2A's own raw-source-fallback.ts - but this is a
 * partial mitigation, not an architectural elimination of the shared-
 * substrate risk, and is documented as such rather than overclaimed.
 */
import type { IRDefinition, IRRule, IRSharedCapacity } from "../../ir/types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../semantic/types";
import type { NodeSupersessionStatus } from "../amendment/types";

export const SEMANTIC_VERIFIER_ALGORITHM_VERSION = "phase-3c-semantic-verifier.v1";
export const SEMANTIC_VERIFIER_PROMPT_VERSION = "phase-3c-semantic-verifier-prompt.v1";

// ---------------------------------------------------------------------------
// Verifier input/output contract (task §4's own allowed-inputs list,
// concretely typed). Deliberately reuses Phase 3B's own already-defined
// SemanticCompilerInput/SemanticCompilationResult rather than duplicating a
// second "what the compiler saw" model - the verifier's job is to check
// EXACTLY what the compiler was given and EXACTLY what it produced, nothing
// re-derived or paraphrased.
// ---------------------------------------------------------------------------

export interface VerificationInput {
  /** The exact evidence Phase 3B's compiler was given - operativeSourceText, contextBundle, operativeLineage, toolAccess. Never re-fetched or re-derived by this module. */
  compilerInput: SemanticCompilerInput;
  /** The exact proposal being checked. */
  compilationResult: SemanticCompilationResult;
}

// ---------------------------------------------------------------------------
// Finding taxonomy (task §13) - structured findings, never a bare
// confidence score (task §2's own "must not merely produce a confidence
// score").
// ---------------------------------------------------------------------------

export type SemanticVerificationFindingType =
  | "MISSING_RULE"
  | "MISSING_BASKET"
  | "MISSING_EXCEPTION"
  | "MISSING_CONDITION"
  | "MISSING_PROVISO"
  | "MISSING_SHARED_CAP"
  | "MISSING_RECLASSIFICATION"
  | "MISSING_DEPENDENCY"
  | "MISSING_DEFINITION_EFFECT"
  | "WRONG_AMOUNT"
  | "WRONG_PERCENT"
  | "WRONG_RATIO"
  | "WRONG_METRIC"
  | "WRONG_FORMULA"
  | "WRONG_LOGIC"
  | "WRONG_ACTION"
  | "WRONG_POSTURE"
  | "WRONG_ENTITY_SCOPE"
  | "WRONG_TRANSACTION_SCOPE"
  | "WRONG_DEPENDENCY"
  | "UNSUPPORTED_IR_ADDITION"
  | "PROVENANCE_MISMATCH"
  | "POSSIBLE_DUPLICATE_RULE"
  | "POSSIBLE_RULE_MERGE_ERROR"
  | "POSSIBLE_RULE_SPLIT_ERROR"
  | "VERIFICATION_CONTEXT_INCOMPLETE"
  | "OTHER_MATERIAL_SEMANTIC_DISCREPANCY";

/**
 * Task §14's materiality standard, applied mechanically wherever this
 * module assigns severity: MATERIAL if a competent finance/legal reviewer
 * could reasonably change capacity, permission, prohibition, condition,
 * threshold, formula, scope, transaction analysis, or compliance
 * conclusion after seeing the discrepancy. UNCERTAIN is a real, distinct
 * outcome - never collapsed into NON_MATERIAL merely to simplify a report
 * (Architecture Invariants #29's own "never suppress an auditor finding to
 * improve a reported number").
 */
export type SemanticVerificationSeverity = "MATERIAL" | "NON_MATERIAL" | "UNCERTAIN";

/** Which of Layer 1 (deterministic) / Layer 2 (adversarial semantic review) / both produced a finding - task §31's own required classification. */
export type SemanticVerificationMethod = "DETERMINISTIC_ONLY" | "SEMANTIC_ONLY" | "BOTH";

export type SemanticVerificationFindingResolutionStatus = "OPEN" | "ACKNOWLEDGED" | "DISPUTED" | "RESOLVED";

/**
 * Task §14's finding model, in full. Every field the task lists is present
 * - never trimmed down "for simplicity."
 */
export interface SemanticVerificationFinding {
  /** Stable, content-derived (task §15) - see identity.ts's computeFindingId. Never a random UUID, array position, or model response ordering. */
  findingId: string;
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  /** The compiler's own candidateRef (SemanticCompilerInput.candidateRef) - the semantic unit this finding concerns. */
  candidateRef: string;
  /** The specific IRRule.ruleId/IRDefinition.definitionId this finding concerns, when the finding is about one particular compiled unit rather than the whole compilation attempt. */
  ruleOrDefinitionId: string | null;
  /** Dot/bracket path into the IR subexpression tree where applicable (e.g. "rules[0].capacityExpression.operands[1]") - never just "somewhere in the rule." */
  irPath: string | null;
  findingType: SemanticVerificationFindingType;
  severity: SemanticVerificationSeverity;
  /** The real source text this finding is grounded in - never fabricated, never a paraphrase presented as a quote. */
  sourceEvidence: string;
  sourceCitation: string;
  /** The specific piece of the proposed IR (or its absence) this finding concerns, serialized for the report. */
  proposedIrEvidence: string;
  /** Why the verifier believes this is a discrepancy - written by the deterministic layer (a fixed template) or the adversarial reviewer (its own real reasoning), never fabricated post-hoc. */
  verifierReasoning: string;
  /** Layer 1's own deterministic signals that contributed to raising or confirming this finding (e.g. "source contains MONEY leaf 35000000 not present in any compiled rule"). Empty array for a purely Layer 2 finding. */
  deterministicSignals: string[];
  verificationMethod: SemanticVerificationMethod;
  /** Provider/model identity when a semantic (Layer 2) call contributed - null for a purely deterministic finding. */
  provider: string | null;
  model: string | null;
  verifierAlgorithmVersion: string;
  verifierPromptVersion: string | null;
  resolutionStatus: SemanticVerificationFindingResolutionStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Verification status model (task §17) - a dimension separate from
// RepresentationSufficiency. "VERIFIED" here never means legally approved;
// it means "this machine-checked pass found no material gap," full stop.
// ---------------------------------------------------------------------------

export type SemanticVerificationStatus =
  | "NOT_VERIFIED"
  | "VERIFIED_NO_MATERIAL_GAP_FOUND"
  | "VERIFIED_WITH_NON_MATERIAL_FINDINGS"
  | "REVIEW_REQUIRED"
  | "MATERIAL_DISCREPANCY"
  | "VERIFICATION_INCOMPLETE"
  | "VERIFICATION_FAILED";

// ---------------------------------------------------------------------------
// Layer 1a - source-side economic/structural inventory (task §9). Every
// item retains real source provenance - this inventory does not need to
// understand the whole covenant, only give the verifier independent
// evidence of what the IR must account for.
// ---------------------------------------------------------------------------

export type SourceInventoryItemKind =
  | "AMOUNT"
  | "PERCENT"
  | "RATIO"
  | "METRIC_MENTION"
  | "COMPARISON_OPERATOR"
  | "CONDITIONAL_PHRASE"
  | "EXCEPTION_MARKER"
  | "PROVISO_MARKER"
  | "SHARED_CAP_MARKER"
  | "BUILDER_SIGNAL"
  | "RECLASSIFICATION_SIGNAL"
  | "ENTITY_SCOPE_TERM"
  | "TRANSACTION_ACTION_SIGNAL"
  | "INDEPENDENT_LIST_ITEM";

export interface SourceInventoryItem {
  itemId: string;
  kind: SourceInventoryItemKind;
  /** The real source substring this item was detected from. */
  rawText: string;
  /** Parsed numeric value for AMOUNT/PERCENT/RATIO kinds - null for non-numeric kinds. */
  numericValue: number | null;
  sourceDocumentId: string;
  sourceCitation: string;
  structuralNodeKey: string | null;
  /** Char offset within the operative source text this item was found in - used for reconciliation-adjacent-window heuristics (e.g. "this MONEY figure sits inside a MAX(...) construction with this PERCENT figure"), never for legal conclusions on its own. */
  charStart: number;
  charEnd: number;
}

export interface SourceInventory {
  candidateRef: string;
  items: SourceInventoryItem[];
  /** Structural completeness signal (task §8) - independently-derived count of apparent sibling/enumerated independent units in the audited scope (e.g. lettered sub-clauses, semicolon-separated permissions). Never compared 1:1 against IR rule count as a hard requirement - see reconciliation.ts. */
  apparentIndependentUnitCount: number;
  apparentIndependentUnitEvidence: string[];
  inventoryAlgorithmVersion: string;
  /**
   * Phase 3F.1.5 Workstream B - P1-11 fix. Whether the physical structural
   * node this inventory's `operativeSourceText` was taken from is still
   * current-operative as of the caller's analysis date, per
   * amendment/operative-state.ts's own getNodeSupersessionStatus - an
   * "allowed input" this module's own independence contract above already
   * names (operative contract state / lineage). Defaults to
   * UNKNOWN_SUPERSESSION_STATUS (never CURRENT_OPERATIVE) whenever the
   * caller does not supply a real supersession index/node identity, so a
   * reconciliation finding built from this inventory can never be silently
   * read as "the source text this compares against is confirmed current."
   */
  supersessionStatus: NodeSupersessionStatus;
  /** Always populated - explains supersessionStatus, same disclosure discipline as targetResolutionReason elsewhere in this codebase. */
  supersessionReason: string;
}

// ---------------------------------------------------------------------------
// Layer 1b - IR-side canonicalized semantic inventory (task §10). Preserves
// AST path context - a MONEY(50_000_000) inside MAX(...) is a different
// fact than an independent MONEY(50_000_000) basket.
// ---------------------------------------------------------------------------

export type IrInventoryItemKind = "AMOUNT" | "PERCENT" | "RATIO" | "METRIC_REFERENCE" | "DEFINED_TERM_REFERENCE" | "ACTION" | "POSTURE" | "CONDITION" | "EXCEPTION" | "ENTITY_SCOPE" | "DEPENDENCY" | "SHARED_CAP_RELATIONSHIP" | "UNLIMITED_CAPACITY_MARKER" | "UNSUPPORTED_MARKER";

export interface IrInventoryItem {
  itemId: string;
  kind: IrInventoryItemKind;
  ruleOrDefinitionId: string;
  /** e.g. "rules[0].capacityExpression.operands[1]" - full path from the compilation unit root. */
  irPath: string;
  numericValue: number | null;
  textValue: string | null;
  /** True when this numeric/text value sits inside a MAX/MIN/SCHEDULE alternative-selection construction rather than being an unconditional, independently-operative figure. */
  isAlternativeWithinSelection: boolean;
  sourceCitation: string | null;
  sourceExcerpt: string | null;
}

export interface IrInventory {
  candidateRef: string;
  items: IrInventoryItem[];
  ruleCount: number;
  definitionCount: number;
  inventoryAlgorithmVersion: string;
}

// ---------------------------------------------------------------------------
// Layer 1c - deterministic reconciliation (task §11).
// ---------------------------------------------------------------------------

export type ReconciliationClassification = "ACCOUNTED_FOR" | "POSSIBLY_ACCOUNTED_FOR" | "NOT_ACCOUNTED_FOR" | "IR_ONLY" | "AMBIGUOUS";

export interface ReconciliationItem {
  classification: ReconciliationClassification;
  /** Set for ACCOUNTED_FOR/POSSIBLY_ACCOUNTED_FOR/NOT_ACCOUNTED_FOR - the source item this concerns. */
  sourceItem: SourceInventoryItem | null;
  /** Set for ACCOUNTED_FOR/POSSIBLY_ACCOUNTED_FOR/IR_ONLY - the IR item(s) matched. */
  irItems: IrInventoryItem[];
  reason: string;
}

export interface ReconciliationResult {
  candidateRef: string;
  items: ReconciliationItem[];
  /** NOT_ACCOUNTED_FOR + AMBIGUOUS items that warrant Layer 2 adversarial review - never auto-declared a semantic error (task §11's own "do not automatically declare semantic error from NOT_ACCOUNTED_FOR"). */
  materialUnresolvedCount: number;
}

// ---------------------------------------------------------------------------
// Top-level per-candidate verification result.
// ---------------------------------------------------------------------------

export interface SemanticVerificationResult {
  candidateRef: string;
  status: SemanticVerificationStatus;
  findings: SemanticVerificationFinding[];
  sourceInventory: SourceInventory;
  irInventory: IrInventory;
  reconciliation: ReconciliationResult;
  /** True when Layer 2 (adversarial semantic review) was actually invoked for this candidate - task §32's own call-routing discipline, auditable rather than implicit. */
  semanticReviewInvoked: boolean;
  semanticReviewSkippedReason: string | null;
  verifierAlgorithmVersion: string;
  verifiedAt: string;
}

export type { IRDefinition, IRRule, IRSharedCapacity };
