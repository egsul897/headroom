/**
 * Phase 3D - Reviewed Semantic Precedent & Learning System V1
 * (docs/HEADROOM-ROADMAP.md §2's Phase 3 sequence, North Star §8/§12).
 *
 * ===========================================================================
 * CENTRAL PRINCIPLE (task §2/§16, repeated because it governs every design
 * decision below): CURRENT OPERATIVE SOURCE > REVIEWED PRECEDENT. Precedent
 * informs interpretation. It never overrides source. Every type/function in
 * this module exists to make that invariant easy to enforce and hard to
 * accidentally violate - never to make precedent authoritative.
 * ===========================================================================
 *
 * THREE SEPARATE CONCEPTS (task §3) - deliberately never collapsed:
 *  - ReviewedInstance: one specific reviewed source interpretation (task §4).
 *  - GeneralizedPrecedent: a reusable lesson derived from one or more
 *    reviewed instances (task §6/§7) - compositional across semantic
 *    dimensions, never a giant per-pattern enum (task §7's own explicit
 *    "do not create GREATER_OF_BASKET_PRECEDENT, JV_BASKET_PRECEDENT, ...").
 *  - RetrievalMatch: a determination that a precedent MAY be relevant to a
 *    new source (task §15) - always re-derived per retrieval, never stored
 *    as a fixed property of the precedent itself.
 *
 * PERSISTENCE DECISION (task §46, audited before writing this module):
 * in-memory for V1, extending the EXACT SAME "pure in-memory, zero Prisma
 * migration" convention every other Phase 2/3 compiler submodule already
 * uses (semantic/types.ts, semantic-verification/types.ts, coverage-audit/
 * types.ts all make and justify this same call). Reasoning, per task §46's
 * own required checklist:
 *   - Why in-memory suffices: this phase proves the LEARNING MECHANISM
 *     (retrieval, applicability, anti-memorization, transfer) actually
 *     works, not a production review queue for real end-users - there is no
 *     real reviewer-identity/auth system yet (Roadmap §7: "Authentication/
 *     authorization: MISSING"), so a durable multi-session review workflow
 *     has no real user to serve today. Building one now would repeat the
 *     exact premature-infrastructure mistake the Roadmap already flags for
 *     the FinancialSnapshot/FinancialState fork and the LedgerEntry/DebtEvent
 *     fork - a schema built ahead of the real workflow that needs it.
 *   - Why existing models can't represent the data: ExtractionCandidate
 *     (prisma/schema.prisma:1606) stores a flat `proposedValue: Json` for
 *     document-extraction facts (financial figures, dates, party names) -
 *     it has no representation for a compositional, dimension-scored,
 *     versioned, applicability-ranked semantic pattern. Forcing covenant
 *     semantic precedent into that shape would repeat the exact anti-pattern
 *     Phase 3A's own migration table already rejected for
 *     `CovenantProvision.params: Json` ("untyped and formula-shape-specific
 *     by convention only... the IR needs real typed structure, not another
 *     loosely-conventioned JSON bag").
 *   - What IS reused, deliberately (Roadmap §10's own explicit steer -
 *     "extending the existing ExtractionCandidate/CandidateReviewEvent
 *     review lifecycle, not a new parallel system"): CandidateReviewEvent's
 *     own PATTERN - an APPEND-ONLY review-event log where a later decision
 *     is always a NEW row/entry, never an overwrite of a prior one, with
 *     previousStatus/newStatus brackets and a never-fabricated reviewedBy.
 *     `PrecedentReviewEvent` below reproduces that exact discipline
 *     in-memory. The literal Prisma table is not reused because it is
 *     schema-bound to `ExtractionCandidateReviewStatus`'s 5-value
 *     extraction-specific lifecycle and to `candidateId`, neither of which
 *     fits a compositional, versioned, multi-instance-derived precedent -
 *     this is the same "right pattern, wrong concrete schema" judgment
 *     Phase 3A's own migration table made about `CalculationRuleKind`.
 *   - Drop-in-swap interface: `PrecedentStore` (store.ts) is written the
 *     same way cache.ts's own `SemanticCompilationCache` interface is -
 *     an in-memory Map implementation for this phase's own proof, with the
 *     interface shaped so a future Postgres-backed implementation (a new,
 *     additive model, never touching ExtractionCandidate/ContractRule) is a
 *     drop-in swap of the interface, not a redesign of retrieval/
 *     applicability logic.
 *
 * MECHANICAL SAFEGUARDS built into these types themselves (not just
 * enforced by convention elsewhere):
 *  - `SemanticSignature` (task §11) deliberately has NO field for company
 *    name, document ID, package ID, or exact section reference - those live
 *    only on `ReviewedInstanceProvenance`, a SEPARATE type never consulted
 *    by retrieval scoring (source-inventory-signature.ts's own import
 *    boundary test enforces this).
 *  - `ExpressionPatternNode` (task §24) represents composition SHAPE with
 *    explicit `PatternSlot` markers for values - a precedent derived from
 *    "$75,000,000 and 12.5% of EBITDA" is stored as
 *    MAX(MONEY(VARIABLE), MULTIPLY(PERCENT(VARIABLE), METRIC(VARIABLE))),
 *    never as MAX(MONEY(75000000), ...) - the literal figures are not part
 *    of the reusable lesson unless a precedent explicitly marks a slot
 *    FIXED because the value itself is conceptually load-bearing (rare -
 :    e.g. a well-known regulatory percentage threshold).
 */
import type { CovenantFamily, ContractRulePosture, ContractRuleType, EntityClassTag } from "@prisma/client";
import type { ContractAction, ContractConditionType } from "../../types";

export const SEMANTIC_PRECEDENT_SCHEMA_VERSION = "phase-3d-semantic-precedent.v1";

// ---------------------------------------------------------------------------
// Tenancy (task §47/§48) - modeled explicitly, never implicit.
// ---------------------------------------------------------------------------

export type PrecedentTenancyScope = "TENANT_PRIVATE" | "SYSTEM_REVIEWED";

// ---------------------------------------------------------------------------
// Benchmark contamination metadata (task §33) - mechanically enforceable
// exclusion of the Phase 3F unseen package from precedent creation, and
// explicit tagging of known development packages so leave-one-package-out
// evaluation (task §34/§57) has a real field to filter on.
// ---------------------------------------------------------------------------

export interface BenchmarkProvenance {
  /** A short, stable package identifier (e.g. "fwrg", "lsb", "conmed") - used ONLY for provenance/exclusion/audit (task §9's own explicit allowlist of legitimate uses), never as a retrieval signal. */
  packageId: string;
  /** True for a package known to have been used during Phase 2/3 development (FWRG, LSB, CONMED) - false is reserved for a genuinely unseen Phase 3F package, which must never appear here before its frozen evaluation (task §33/§68). */
  isKnownDevelopmentPackage: boolean;
}

// ---------------------------------------------------------------------------
// A. Reviewed instance (task §4) - one specific reviewed source
// interpretation. Preserves the full history: source -> compiler proposal ->
// verifier findings -> reviewed result. Never loses the original proposal.
// ---------------------------------------------------------------------------

export interface ReviewedInstanceProvenance {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  /** The compiler's own candidateRef for the reviewed provision/definition. */
  candidateRef: string;
  sourceSectionRef: string | null;
  /** Content-hash of the operative source text at review time (cache/dedup use only - task §10's own "exact-match cache is not precedent" - never a retrieval key). */
  sourceTextHash: string;
  /** The context bundle's own contentIdentity at review time. */
  contextIdentity: string;
  operativeStatus: string | null;
  benchmark: BenchmarkProvenance | null;
}

export type ReviewStatus = "PROPOSED" | "UNDER_REVIEW" | "APPROVED" | "APPROVED_WITH_LIMITATIONS" | "REJECTED" | "SUPERSEDED";

/**
 * task §4's full field list, preserved without exception. `proposedIr`/
 * `verifierFindings` are the compiler/verifier's own real, unedited output -
 * `reviewedIr` is the separate, independently-editable adjudicated result.
 * Never collapse the two (task §4's own "do not lose original proposal").
 */
export interface ReviewedInstance {
  instanceId: string;
  provenance: ReviewedInstanceProvenance;
  tenancy: PrecedentTenancyScope;

  /** The compiler's real proposed IR for this instance - untouched, exactly as Phase 3B produced it. */
  proposedIrSnapshot: unknown;
  /** Phase 3C's real verifier findings against the proposal, if verification ran - untouched. */
  verifierFindingsSnapshot: unknown[] | null;
  /** The reviewer-adjudicated, approved representation - may equal proposedIrSnapshot (reviewer confirmed it as-is) or differ (reviewer corrected it). */
  reviewedIrSnapshot: unknown;

  reviewStatus: ReviewStatus;
  /** Append-only - see PrecedentReviewEvent. The instance's own reviewStatus always equals the newStatus of the latest event. */
  reviewEvents: PrecedentReviewEvent[];

  irSchemaVersion: string;
  compilerVersion: string | null;
  verifierVersion: string | null;
  precedentSystemVersion: string;

  createdAt: string;
}

/** Mirrors CandidateReviewEvent's own append-only discipline (see module header) - never mutated once written; a later decision is always a new entry. */
export interface PrecedentReviewEvent {
  eventId: string;
  action: "PROPOSE" | "SUBMIT_FOR_REVIEW" | "APPROVE" | "APPROVE_WITH_LIMITATIONS" | "REJECT" | "SUPERSEDE";
  previousStatus: ReviewStatus | null;
  newStatus: ReviewStatus;
  note: string | null;
  /** Never fabricated - left null unless a real identity is genuinely available, matching ExtractionCandidate.reviewedBy's own established convention. */
  reviewedBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reviewer-correction model (task §27) - the diff between compiler proposal
// and reviewed result, classified by dimension. A learning signal for
// prioritizing precedent, never a fine-tuning input in this phase.
// ---------------------------------------------------------------------------

export type CorrectionDimension = "MISSING_RULE" | "ACTION" | "POSTURE" | "AMOUNT" | "PERCENT" | "METRIC" | "LOGIC" | "CONDITION" | "EXCEPTION" | "SCOPE" | "DEPENDENCY" | "SHARED_CAP" | "PROVENANCE" | "UNSUPPORTED_SEMANTIC_SHAPE";

export interface ReviewerCorrection {
  dimension: CorrectionDimension;
  /** Human-readable description of what changed - never the raw literal values alone (task §24's own parameterization requirement extends to how corrections are recorded, not just how precedent is generalized). */
  description: string;
  /** The compiler's own proposed value/shape at this dimension, serialized for audit. */
  proposedValue: string;
  /** The reviewer-adjudicated value/shape at this dimension. */
  reviewedValue: string;
}

// ---------------------------------------------------------------------------
// Compositional semantic dimensions (task §7) - precedent teaches ONE OR
// MORE of these, never forced into "the whole provision" as the only
// learning unit (task §8's own granularity requirement).
// ---------------------------------------------------------------------------

export type PrecedentDimension = "ACTION" | "POSTURE" | "EXPRESSION_SHAPE" | "METRIC_RELATIONSHIP" | "CONDITIONS" | "EXCEPTIONS" | "SCOPE" | "DEPENDENCY" | "SHARED_CAPACITY" | "STRUCTURAL_ATTACHMENT" | "TEMPORAL_BEHAVIOR";

export type PrecedentGranularity = "EXPRESSION_PATTERN" | "CONDITION_PATTERN" | "SCOPE_PATTERN" | "DEPENDENCY_PATTERN" | "LOGIC_PATTERN" | "RULE_PATTERN" | "MULTI_RULE_PATTERN" | "STRUCTURAL_ATTACHMENT_PATTERN";

// ---------------------------------------------------------------------------
// Parameterized IR pattern (task §6/§24) - composition SHAPE with literal
// values abstracted into slots, unless a slot is conceptually load-bearing.
// ---------------------------------------------------------------------------

export type PatternSlot<T> = { mode: "VARIABLE"; description: string } | { mode: "FIXED"; value: T; whyFixed: string };

export interface ExpressionPatternNode {
  /** Mirrors an IRExpression `kind` (MONEY, PERCENT, RATIO, METRIC_REFERENCE, MAX, MIN, MULTIPLY, ADD, SUBTRACT, DIVIDE, SUM, COMPARE, AND, OR, NOT, IF, UNLIMITED_CAPACITY, SCHEDULE, EVENT_ACTIVE, ...) or a higher-level structural pattern kind not tied 1:1 to a single IR node (e.g. "TRAILING_PROVISO_ATTACHMENT"). */
  kind: string;
  operatorSlot?: PatternSlot<string>;
  numericSlot?: PatternSlot<number>;
  textSlot?: PatternSlot<string>;
  /** Composition children, generically - operands/left+right/condition+then+else/cases all flatten here; order is preserved but this is a pattern, not an executable tree, so no evaluator ever runs it. */
  children: ExpressionPatternNode[];
}

// ---------------------------------------------------------------------------
// Semantic signature (task §11) - the retrieval-facing fingerprint. Every
// field is optional (task §11's own "should tolerate partial information")
// and NONE of them is a company/document/package/section/hash identifier
// (task §9's mechanical anti-memorization requirement) - those fields
// simply do not exist on this type.
// ---------------------------------------------------------------------------

export interface SemanticSignature {
  action: ContractAction | null;
  posture: ContractRulePosture | null;
  ruleType: ContractRuleType | null;
  covenantFamily: CovenantFamily | null;
  /** Top-level expression operator shape, e.g. "MAX", "UNLIMITED_CAPACITY", "MIN", "SCHEDULE" - the single strongest structural signal for expression-shape precedent. */
  topLevelOperator: string | null;
  /** Set of operator kinds appearing anywhere in the expression tree (order-independent) - "MULTIPLY, PERCENT, METRIC_REFERENCE" for a percent-of-metric limb, etc. */
  operatorSet: string[];
  hasRatioGate: boolean;
  hasScheduledThreshold: boolean;
  hasEventActiveStepUp: boolean;
  conditionTypes: ContractConditionType[];
  hasExceptions: boolean;
  entityScopeTags: EntityClassTag[];
  hasSharedCapacity: boolean;
  hasReclassificationDependency: boolean;
  /** Generic dependency-relationship shapes present (e.g. "REQUIRES", "SHARES_CAPACITY_WITH") - never the specific target's identity. */
  dependencyRelationshipTypes: string[];
}

// ---------------------------------------------------------------------------
// B. Generalized semantic precedent (task §6) - the reusable lesson.
// ---------------------------------------------------------------------------

export interface PrecedentSupportMetadata {
  /** Reviewed instances this precedent generalizes from - task §32's diversity accounting lives here (see support.ts's own diversity computation, never inflated by near-duplicate amendments of the same instrument). */
  supportingInstanceIds: string[];
  distinctSourceDocumentCount: number;
  distinctInstrumentCount: number;
  distinctCompanyCount: number;
  /** Known counterexamples - reviewed instances that superficially matched this precedent's candidate signature but were adjudicated NOT to follow it (task §31's own "known counterexamples" quality signal). */
  knownCounterexampleInstanceIds: string[];
}

export interface GeneralizedPrecedent {
  precedentId: string;
  /** Precedent version - bumped on any correction; never silently mutated in place (task §30). */
  version: number;
  /** Null for v1; set for v2+, pointing at the version this one supersedes. */
  supersedesPrecedentId: string | null;
  /** Set once a later version exists - a superseded precedent is retained (never deleted) but excluded from new retrieval (task §30). */
  supersededByPrecedentId: string | null;

  tenancy: PrecedentTenancyScope;
  /** Task §46's own tenant-isolation requirement, made enforceable: null for SYSTEM_REVIEWED (a global precedent no single company owns); the owning company's id for TENANT_PRIVATE - store.ts's own filter uses this to keep one company's private precedent invisible to every other company by default. */
  ownerCompanyId: string | null;
  dimensions: PrecedentDimension[];
  granularity: PrecedentGranularity;

  /** Free-text description of the reusable lesson, written for a human reviewer - e.g. "a trailing proviso structurally applies to every preceding lettered sub-clause in the same enumerated list, not only the clause immediately before it." */
  lessonDescription: string;

  signature: SemanticSignature;
  /** Present for EXPRESSION_PATTERN/LOGIC_PATTERN granularities; null for pure structural/dependency lessons that do not reduce to one expression shape. */
  expressionPattern: ExpressionPatternNode | null;

  /** Structural/dependency lessons that are not naturally expression-shaped (task §25/§26) - kept as short, generalized natural-language rules, never a literal defined-term name (task §26's own "do not hardcode Payment Conditions as the universal concept"). */
  structuralLessons: string[];
  dependencyLessons: string[];

  /** True for a lesson of the form "this superficially similar pattern is NOT equivalent" (task §28) - a negative precedent contributes to applicability ranking by actively arguing AGAINST a naive match, never toward one. */
  isNegativePrecedent: boolean;
  /** Set only when isNegativePrecedent - the contrasting signature/pattern this precedent warns is NOT the same as `signature`/`expressionPattern` above. */
  contrastedWithSignature: SemanticSignature | null;

  reviewStatus: ReviewStatus;
  reviewEvents: PrecedentReviewEvent[];
  support: PrecedentSupportMetadata;

  /** How this precedent came to exist - task §22/§23's own explicit AI-PROPOSES -> VALIDATION -> REVIEW -> APPROVED workflow, auditable after the fact. */
  origin: "AI_PROPOSED" | "HUMAN_AUTHORED";

  precedentSchemaVersion: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// C. Retrieval match (task §3/§15) - a per-retrieval determination, never
// stored as a fixed property of the precedent.
// ---------------------------------------------------------------------------

export type PrecedentApplicability = "APPLICABLE" | "PARTIALLY_APPLICABLE" | "CONFLICTING" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";

export interface PrecedentRetrievalMatch {
  precedentId: string;
  precedentVersion: number;
  /** Stage 1 candidate-generation score - signature-overlap based, never a company/document/package/section match (task §9/§14). */
  candidateScore: number;
  /** Stage 2 applicability determination - task §15's own explicit "do not inject precedent merely because retrieval score is high." */
  applicability: PrecedentApplicability;
  applicabilityReasoning: string;
  /** Set only for CONFLICTING - the id(s) of other retrieved precedent this one disagrees with (task §29). */
  conflictsWithPrecedentIds: string[];
  retrievalAlgorithmVersion: string;
  applicabilityAlgorithmVersion: string;
}

export interface PrecedentRetrievalResult {
  candidateRef: string;
  matches: PrecedentRetrievalMatch[];
  /** Bounded top-K actually surfaced as advisory evidence (task §19's own "do not dump dozens of examples into the prompt") - a strict subset of matches, APPLICABLE/PARTIALLY_APPLICABLE only. */
  boundedAdvisoryPrecedentIds: string[];
  retrievedAt: string;
}
