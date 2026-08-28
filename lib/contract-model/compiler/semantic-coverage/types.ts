/**
 * Phase 3E - Whole-Document Semantic Coverage & Representation Audit V1
 * (docs/HEADROOM-ROADMAP.md §2's Phase 3 sequence; North Star §10's closing
 * paragraph, which names this module by number before it existed).
 *
 * GOVERNING QUESTION: across the ENTIRE operative debt document/package,
 * has Headroom identified and accounted for every material contractual
 * semantic unit relevant to its intended covenant/compliance intelligence
 * function? This is the semantic-coverage analogue of Phase 2E - Phase 2E
 * asks whether contractual source/context was DISCOVERED/RETRIEVED; this
 * phase asks whether the entire operative document's material semantic
 * content was REPRESENTED, independent of whether any compiler proposal
 * was ever generated for a given region at all (a strictly larger question
 * than Phase 3C's, which only ever checks an ALREADY-SELECTED candidate's
 * fidelity - Phase 3C cannot, by construction, ever notice a region no
 * candidate was ever generated for).
 *
 * ===========================================================================
 * INDEPENDENCE CONTRACT (task §2/§53) - full text here, at the type-
 * definition site, mirroring coverage-audit/types.ts (Phase 2E) and
 * semantic-verification/types.ts (Phase 3C)'s own established convention
 * rather than inventing a new place to put it.
 * ===========================================================================
 *
 * ALLOWED INPUTS during independent inventory generation (Layers A/B/C,
 * §156's freeze boundary):
 *  - raw indexed source text and structural nodes/spans (Phase 2A's
 *    StructuralIndex - the same low-level substrate every independent
 *    auditor in this codebase is built on);
 *  - a document's own raw text directly, for the raw-source fallback path
 *    (Phase 2F.1's raw-source-fallback.ts, reused directly - see below);
 *  - package/instrument topology and document relationship topology
 *    (Phase 2C's PackageGraphResult - a topology fact, not a Phase 2B/2D/3B
 *    semantic conclusion);
 *  - operative contract state / lineage (Phase 2G's OperativeContractState)
 *    - which text currently governs is a FACT this module needs to scope
 *    its inventory to the CURRENT operative version, not an opinion about
 *    what that text means;
 *  - independently derived deterministic legal/economic signals (this
 *    module's own signal detectors, built the same way coverage-audit's
 *    signals.ts was - reusing that exact module directly where the signal
 *    is generic, never re-deriving a parallel copy);
 *  - a bounded, router-admitted AI inventory pass (Layer C) that reads ONLY
 *    the raw source text of a region the deterministic router already
 *    selected - it may never expand the search universe itself, and it
 *    never sees any compiler/verifier/precedent output;
 *  - low-level provenance/source metadata.
 *
 * FORBIDDEN as a source of truth during independent inventory generation
 * (Layers A/B/C) - this is the whole reconciliation's integrity guarantee,
 * since the reconciliation stage below exists specifically to compare this
 * inventory AGAINST those outputs:
 *  - Phase 2B DiscoveredCandidate[] or any discovery pipeline/pass module
 *    (discovery/pipeline.ts, discovery/pass-*.ts);
 *  - Phase 2D CovenantContextBundle or any context-retrieval pipeline/
 *    conclusion module (context-retrieval/pipeline.ts,
 *    context-retrieval/structural-context.ts, .../definition-graph.ts,
 *    .../reference-context.ts, .../cross-document-context.ts);
 *  - Phase 3B's compiled IR or compiler reasoning (semantic/compile.ts's
 *    compileCovenantToIR, semantic/caller.ts's RealSemanticCaller, or any
 *    SemanticCompilationResult);
 *  - Phase 3C's verification findings (semantic-verification/verify.ts,
 *    .../reviewer.ts, or any VerificationResult);
 *  - Phase 3D's semantic precedent (semantic-precedent/* entirely - a
 *    misleading precedent could otherwise correlate this auditor with the
 *    same compiler it is supposed to independently check, exactly the
 *    correlation risk Phase 3D §44 itself flagged and required preserved);
 *  - benchmark expected answers, package IDs, or fixture-specific
 *    thresholds anywhere in production matching/decision logic
 *    (Architecture Invariants #29).
 *
 * Reconciliation stage only (reconciliation.ts, family/document/package
 * rollup): after the independent inventory is FROZEN (hashed, immutable -
 * see FrozenSourceInventory below), reconciliation modules MAY read Phase
 * 3B's compiled IR and Phase 3C's verification results to classify whether
 * an independently identified material semantic unit was represented -
 * primary outputs are comparison targets here, never discovery inputs.
 * This mirrors coverage-audit's own "comparison stage only" carve-out
 * exactly.
 *
 * MECHANICAL ENFORCEMENT: tests/contract-model/semantic-coverage-independence.test.ts
 * statically inspects every file under this directory's own import
 * statements (the same static regex-over-import-lines technique as
 * coverage-audit-independence.test.ts and
 * semantic-verification-independence.test.ts, not a runtime sandbox) and
 * fails if any Layer A/B/C inventory-generation module imports a forbidden
 * module above, even type-only.
 *
 * FREEZE-BEFORE-LOAD (task §20's own anchoring-reduction requirement): the
 * independent inventory must be computed and content-hashed into a
 * FrozenSourceInventory BEFORE any compiled/verified IR is loaded into the
 * same process for the same document. This is enforced procedurally by
 * pipeline.ts's own call order (inventory build completes and is hashed
 * before compiled-IR lookup begins) and is disclosed here as a design
 * requirement every future caller of this module must preserve - reordering
 * those two steps would silently reintroduce anchoring even though no
 * import-boundary test would catch a call-order violation.
 *
 * SHARED-SUBSTRATE INDEPENDENCE (Architecture Invariants #18, North Star
 * §10's closing paragraph, which names this exact module): this auditor
 * shares Phase 2A's StructuralIndex with the compiler and verifier it
 * checks, exactly as Phase 2E's auditor shares it with Phase 2B's
 * discovery - and Phase 2F's blind run proved that shared-substrate risk is
 * real, not hypothetical (a Phase 2A structural gap silenced discovery AND
 * the Phase 2E auditor simultaneously). This module's disclosed mitigation,
 * per task §20 and Architecture Invariants #18's own named precedent, is to
 * reuse Phase 2F.1's raw-source-fallback.ts DIRECTLY and unmodified for any
 * document whose structural health is not STRUCTURE_HEALTHY - an
 * independent path anchored to raw text offsets, not to Phase 2A's node
 * tree, so a structural-substrate defect that produces zero nodes for a
 * region still yields a real (if coarser) inventory pass over that region's
 * raw text. This is a partial mitigation, not an architectural elimination
 * of the shared-substrate risk (a defect in the raw text extraction itself,
 * upstream of Phase 2A, would still defeat both) - disclosed as such, not
 * overclaimed, exactly as semantic-verification/types.ts discloses the same
 * honest limitation for Phase 3C.
 *
 * DISTINCTION FROM PHASE 2E (task §3): Phase 2E's independent inventory is
 * anchored to STRUCTURAL REGIONS (one CoverageRegion per structural node
 * with independent signal) and asks whether a region was DISCOVERED/
 * RETRIEVED. This module's independent inventory is anchored to MATERIAL
 * SEMANTIC UNITS - potentially many-to-one or one-to-many with structural
 * nodes (task §7's granularity requirement: one CoverageRegion-shaped node
 * may itself contain multiple independently operative semantic units, e.g.
 * a single "shall not... except..." section whose enumerated exceptions
 * each carry their own separate quantitative cap) - and asks whether each
 * such unit was REPRESENTED faithfully in the compiled/verified IR,
 * independent of whether any candidate was ever discovered for it at all.
 * A source region can be perfectly discovered (2E finds nothing wrong)
 * while still containing an unrepresented semantic unit within it (this
 * module's own job to catch) - e.g. one basket among several enumerated
 * exceptions inside an already-discovered, already-compiled prohibition
 * clause never received its own capacityExpression.
 *
 * DISTINCTION FROM PHASE 3C (task §4): Phase 3C verifies whether ONE
 * ALREADY-SELECTED candidate's compiled IR is faithful to the source
 * evidence Phase 2D already retrieved FOR IT. It has no mechanism to notice
 * a region for which no candidate was ever proposed in the first place -
 * by construction, a document region nobody ever discovered never reaches
 * Phase 3C at all. This module operates over the WHOLE document/package
 * from its own independent root-to-leaf traversal, so a semantic unit that
 * was never discovered, never retrieved, and never compiled is exactly the
 * failure mode this module exists to surface (the DANGEROUS_UNACCOUNTED
 * classification below) - Phase 3C cannot produce this classification even
 * in principle, since it never sees anything Phase 2B didn't first select.
 */
import type { CovenantFamily } from "@prisma/client";
import type { StructuralHealthState } from "../structural-coverage";

// Phase 3F.1 (F1/F2 remediation) materially changed both the routing
// algorithm (bounded hierarchical closure, router.ts) and the unit
// hypothesis algorithm (contextual materiality floor + cross-reference
// bump, unit-hypothesis.ts) - both version strings below are bumped to
// v2 so every region/unit identity computed from now on is content-hash
// distinct from anything computed under the pre-remediation v1 algorithm
// (the exact identity these hashes exist to guarantee - see
// computeRoutedRegionId/computeSemanticUnitId). The frozen Phase 3F
// first-blind artifacts under tests/fixtures/unseen-packages/phase-3f-*
// permanently retain the v1 strings they were sealed with and are never
// rewritten. The AI Layer C prompt itself (ai-inventory.ts) was not
// changed by this phase, so SEMANTIC_COVERAGE_PROMPT_VERSION stays v1.
export const SEMANTIC_COVERAGE_ALGORITHM_VERSION = "phase-3f1-semantic-coverage.v2";
export const SEMANTIC_COVERAGE_PROMPT_VERSION = "phase-3e-semantic-coverage-prompt.v1";
export const SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION = "phase-3f1-semantic-coverage-router.v2";

// ---------------------------------------------------------------------------
// §154 - document-root traversal / high-recall region routing. This is the
// layer BEFORE semantic-unit hypothesis generation: it decides which raw
// spans of a document are worth hypothesis-generation attention at all,
// favoring recall over precision (task's own "false positives are
// filterable later, missed regions are unrecoverable" - a human-curated
// section list is FORBIDDEN in production routing logic). One RoutedRegion
// may later yield zero, one, or many MaterialSemanticUnits - routing and
// unit hypothesis generation are deliberately separate steps.
// ---------------------------------------------------------------------------

export type RoutedRegionAdmissionReason =
  | "INDEPENDENT_SIGNAL"
  | "HEADLINE_SECTION"
  | "DEFINITION_NODE"
  | "UNSTRUCTURED_MULTI_ITEM"
  | "RAW_SOURCE_FALLBACK"
  // Phase 3F.1 Workstream A (F1) - hierarchical routing closure (task §6-18).
  // A node admitted for NONE of the reasons above (no independent local
  // signal, not a headline/definition node, no unrepresented inline
  // enumeration) can still deserve hypothesis-generation attention purely
  // because of its bounded structural RELATIONSHIP to a node that WAS
  // independently admitted ("seed" region) - e.g. a lettered basket item
  // with no local dollar/percentage/keyword token, nested under an
  // operative "shall not ... except:" seed. Every closure reason below is
  // evidence-based (derived from real StructuralIndex parent/child/sibling
  // relationships, never a package-specific lookup table) and bounded
  // (DocumentRoutingResult.closureStats records the resulting expansion so
  // this never silently becomes "route the whole document" - task §16/§46).
  | "CHILD_OF_ROUTED_COVENANT_REGION"
  | "CHAPEAU_OF_ROUTED_ENUMERATION"
  | "SIBLING_IN_ROUTED_EXCEPTION_LIST"
  | "TRAILING_PROVISO_OF_ROUTED_REGION"
  | "ANCESTOR_SCOPE_CONTEXT";

export interface RoutedRegion {
  /** Deterministic, content-derived. */
  regionId: string;
  documentId: string;
  /** Null for a region reached only via the raw-source fallback path (no structural node anchors it). */
  structuralNodeKey: string | null;
  sectionRef: string | null;
  charStart: number;
  charEnd: number;
  excerptText: string;
  detectedSignals: string[];
  admissionReasons: RoutedRegionAdmissionReason[];
  fromRawSourceFallback: boolean;
  routingAlgorithmVersion: string;
  /** 0 for a seed region admitted on its own local evidence (or the raw-source-fallback path); 1+ for a region admitted only via closure, counting hops from the nearest seed. */
  closureDepth: number;
  /** The seed (or nearer closure) node that justified this region's closure admission; null for a seed region itself. */
  closureSourceNodeKey: string | null;
}

/** Phase 3F.1 §16/§46 - boundedness evidence for the closure pass, so routing expansion is always measurable rather than merely asserted. */
export interface RoutingClosureStats {
  seedRegionCount: number;
  closureAdmittedRegionCount: number;
  maxClosureDepth: number;
  /** Largest single connected seed+closure group, by node count. */
  largestClosureGroupSize: number;
  /** closureAdmittedRegionCount / max(seedRegionCount, 1) - the headline boundedness metric task §46 asks be tracked and gated. */
  expansionFactor: number;
  /** True if the per-seed closure cap (MAX_CLOSURE_NODES_PER_SEED) truncated any seed's closure group - a disclosed, non-silent bound rather than an unbounded walk. */
  capped: boolean;
}

export interface DocumentRoutingResult {
  documentId: string;
  structuralHealth: StructuralHealthState;
  healthReasons: string[];
  regions: RoutedRegion[];
  totalNodesScanned: number;
  admittedNodeCount: number;
  closureStats: RoutingClosureStats;
}

// ---------------------------------------------------------------------------
// Inventory granularity (task §7) - never forced 1:1 with a structural node.
// ---------------------------------------------------------------------------

export type SemanticUnitGranularity = "DOCUMENT" | "SECTION" | "CLAUSE" | "SUBCLAUSE" | "SEMANTIC_UNIT" | "CROSS_SECTION_RELATIONSHIP" | "CROSS_DOCUMENT_RELATIONSHIP";

// ---------------------------------------------------------------------------
// Family taxonomy (task §9) - open, never an exhaustive closed switch. Reuses
// the real Prisma CovenantFamily enum where a unit's family is a known shape
// (the common case), but a genuinely novel family that fits none of those 20
// values is `OTHER_UNCLASSIFIED` WITH REQUIRED EVIDENCE - never silently
// dropped and never force-fit into the nearest enum value (Architecture
// Invariants #9). This is the same lesson North Star §6 already drew from
// FormulaType vs. CalculationRuleKind: the closed enum is fine to reuse where
// it fits; the escape hatch is what keeps it from becoming a manual-
// encoding bottleneck for a family this repository has genuinely never seen.
// ---------------------------------------------------------------------------

export type MaterialUnitFamily = CovenantFamily | "OTHER_UNCLASSIFIED";

// ---------------------------------------------------------------------------
// Independently-detected role/posture signal (task §8) - deliberately NOT
// the IR's own `action`/`posture` fields (ContractAction/ContractRulePosture)
// and NOT Phase 2B's own DiscoveryRole. This is this module's OWN
// independent read of the source text, computed the same way
// coverage-audit/signals.ts's probableRole is computed - reusing that
// module's detectors directly rather than re-deriving a parallel copy of
// the same regex set under a different name.
// ---------------------------------------------------------------------------

export type DetectedPostureSignal = "PROHIBITION_SIGNAL" | "PERMISSION_SIGNAL" | "OBLIGATION_SIGNAL" | "CONDITION_ONLY_SIGNAL" | "DEFINITIONAL_SIGNAL" | "CALCULATION_SIGNAL" | "AMENDMENT_MECHANIC_SIGNAL" | "UNCLEAR_SIGNAL";

// ---------------------------------------------------------------------------
// Materiality (task §10) - four levels, not three: CRITICAL is its own tier
// because an omission at this tier can change a capacity/permission/
// prohibition/ratio-test/shared-resource/entity-applicability/operative-
// version conclusion, which is categorically worse than a merely "MATERIAL"
// omission and must never be diluted by averaging against low-materiality
// units in a rollup (task §37's "never let 99 trivial units hide 1 critical
// omission").
// ---------------------------------------------------------------------------

export type SemanticUnitMateriality = "CRITICAL" | "MATERIAL" | "REVIEW_UNCERTAIN" | "INFORMATIONAL";

// ---------------------------------------------------------------------------
// §8 - a bounded source anchor. A unit may span multiple structural nodes
// (a multi-section shared cap) or multiple raw-text spans within one node
// (several enumerated exceptions inside one clause's own text) - never
// assumed to be exactly one node.
// ---------------------------------------------------------------------------

export interface SourceAnchor {
  documentId: string;
  /** Null when this anchor comes from the raw-source fallback path (no structural node exists for this span). */
  structuralNodeKey: string | null;
  sectionRef: string | null;
  charStart: number;
  charEnd: number;
  sourceCitation: string;
}

// ---------------------------------------------------------------------------
// §8/§9/§10/§11 - the core inventory item. One MaterialSemanticUnit is one
// independently identified, potentially-material piece of contractual
// meaning - a basket, an exception with its own cap, a condition, a
// definition, a cross-reference, a shared-cap relationship, an entity-scope
// restriction, or a whole missing family signal. Stable identity is
// content-derived (documentId + anchor span + detection signature), never
// array-position-derived - re-running the same inventory build over
// unchanged source must reproduce identical semanticUnitIds.
// ---------------------------------------------------------------------------

export interface MaterialSemanticUnit {
  /** Deterministic, content-derived - see identity.ts's computeSemanticUnitId. */
  semanticUnitId: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  /** The operative document version this unit was inventoried against (Phase 2G's OperativeContractState version identity, when resolved) - null when operative version could not be resolved (surfaces as OPERATIVE_STATE_UNRESOLVED downstream, never silently assumed current). */
  operativeVersionRef: string | null;
  granularity: SemanticUnitGranularity;
  anchors: SourceAnchor[];
  family: MaterialUnitFamily;
  /** Free-text evidence for the family classification - REQUIRED when family is OTHER_UNCLASSIFIED (task §9's "UNKNOWN/OTHER allowed with evidence"), optional otherwise. */
  familyEvidence: string | null;
  postureSignal: DetectedPostureSignal;
  materiality: SemanticUnitMateriality;
  /** Why this materiality was assigned - never a bare label with no evidence trail. When contextuallyElevated is true, this string also names the structural parent and the floor rule applied (Phase 3F.1 §19-23/F2) - never a bare "no numeric signal" reasoning left standing after context was actually considered. */
  materialityReasoning: string;
  /** Phase 3F.1 §19-23/F2 - true when this unit's own local-text materiality was raised by the contextual floor pass (applyContextualMaterialityFloor) because it is a structural child of an operative (PROHIBITION/OBLIGATION/exception-bearing), CRITICAL-or-MATERIAL parent - e.g. an enumerated basket item whose own clause references an amount defined elsewhere, with no independent numeric/keyword signal of its own. False for every unit whose materiality is exactly its own local classification (including a unit that had a qualifying parent but was already at or above the floor). */
  contextuallyElevated: boolean;
  /** Bounded excerpt of this unit's own text (never a full-document dump). */
  excerptText: string;
  /** Deterministically detected economic/legal signal names that fired for this unit - the evidence trail, mirroring coverage-audit's own detectedSignals convention. */
  detectedSignals: string[];
  /** True when this unit was found only via the raw-source fallback path (no structural node anchors it) - task §20/Architecture Invariants #18's disclosed partial mitigation, surfaced per-unit so a caller can see exactly which units carry that weaker anchoring. */
  fromRawSourceFallback: boolean;
  /** How this unit was detected: deterministic-only (Layer A/B) or AI-assisted (Layer C, router-admitted region only). */
  detectionMethod: "DETERMINISTIC_SIGNAL" | "STRUCTURAL_HYPOTHESIS" | "BOUNDED_AI_INVENTORY";
  /** Layer C only - null for deterministic-only units. */
  aiInventoryPromptVersion: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  uncertaintyReasons: string[];
  inventoryAlgorithmVersion: string;
  provenance: string;
}

// ---------------------------------------------------------------------------
// §20 - the frozen, hashed inventory. Must exist, complete and hashed,
// BEFORE any compiled/verified IR is loaded for the same document (see the
// FREEZE-BEFORE-LOAD contract note above).
// ---------------------------------------------------------------------------

export interface FrozenSourceInventory {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentIds: string[];
  units: MaterialSemanticUnit[];
  /** Content-derived hash over every unit's own identity + excerpt - proves this inventory was frozen before comparison, never mutated afterward to match what was found. */
  frozenContentHash: string;
  frozenAt: string;
  inventoryAlgorithmVersion: string;
}

// ---------------------------------------------------------------------------
// §12/§13 - coverage states (8, generalizing Phase 2E's own
// DiscoveryComparisonStatus vocabulary to semantic REPRESENTATION rather
// than mere discovery).
// ---------------------------------------------------------------------------

export type SemanticCoverageState =
  | "FULLY_REPRESENTED_VERIFIED"
  | "FULLY_REPRESENTED_REVIEW_REQUIRED"
  | "PARTIALLY_REPRESENTED"
  | "UNREPRESENTED"
  | "UNSUPPORTED"
  | "SOURCE_CONTEXT_INCOMPLETE"
  | "OPERATIVE_STATE_UNRESOLVED"
  | "AMBIGUOUS_MATCH";

export interface SemanticUnitCoverageEntry {
  semanticUnitId: string;
  coverageState: SemanticCoverageState;
  /** Compiled IR rule/definition ids reconciliation matched this unit against, if any. */
  matchedIrIds: string[];
  /** REQUIRED and non-null whenever coverageState is PARTIALLY_REPRESENTED (task's own "must always name the missing economic element - no free-floating partials") - named explicitly, e.g. "capacityExpression" or "entityScope" or "shared-cap relationship". Null for every other state. */
  missingEconomicElement: string | null;
  reasoning: string;
  materiality: SemanticUnitMateriality;
  coverageAlgorithmVersion: string;
}

// ---------------------------------------------------------------------------
// §14 - the core safety metric.
// ---------------------------------------------------------------------------

export type DangerousUnaccountedReason = "NO_CANDIDATE_EVER_DISCOVERED" | "CANDIDATE_DISCOVERED_NEVER_COMPILED" | "COMPILED_BUT_UNIT_OMITTED_FROM_IR" | "COMPILED_BUT_MATERIALLY_MISREPRESENTED";

export interface DangerousUnaccountedSemanticUnit {
  semanticUnitId: string;
  reason: DangerousUnaccountedReason;
  materiality: SemanticUnitMateriality;
  sourceEvidence: string;
  auditorReasoning: string;
}

// ---------------------------------------------------------------------------
// §15/§16 - document/package rollup. Both raw counts AND materiality-
// weighted metrics are required together - never one without the other.
// ---------------------------------------------------------------------------

export interface FamilyCoverageSummary {
  family: MaterialUnitFamily;
  unitCount: number;
  fullyRepresentedCount: number;
  partiallyRepresentedCount: number;
  unrepresentedCount: number;
  dangerousUnaccountedCount: number;
  /** True when this ENTIRE family is missing from the compiled/verified IR despite appearing materially in source - task's own "missing an entire material family is an automatic document-level gate failure regardless of unit-level percentages". */
  entireFamilyMissing: boolean;
}

export type DocumentCoverageGateStatus = "DOCUMENT_GATE_PASSED" | "DOCUMENT_GATE_FAILED";

export interface DocumentCoverageResult {
  documentId: string;
  units: MaterialSemanticUnit[];
  coverageEntries: SemanticUnitCoverageEntry[];
  dangerousUnaccounted: DangerousUnaccountedSemanticUnit[];
  familySummaries: FamilyCoverageSummary[];
  /** Raw, unweighted. */
  rawFullyRepresentedFraction: number;
  /** Materiality-weighted: CRITICAL/MATERIAL units dominate the denominator; INFORMATIONAL units never dilute it (task §37). */
  materialityWeightedFullyRepresentedFraction: number;
  gateStatus: DocumentCoverageGateStatus;
  gateFailureReasons: string[];
}

// ---------------------------------------------------------------------------
// §17 - package-level status. Never "SAFE" as a legal conclusion.
// ---------------------------------------------------------------------------

export type PackageSemanticCoverageStatus = "PACKAGE_SEMANTICALLY_COVERED" | "PACKAGE_REVIEW_REQUIRED" | "PACKAGE_SEMANTICALLY_INCOMPLETE" | "PACKAGE_AUDIT_INCOMPLETE" | "PACKAGE_OPERATIVE_STATE_UNRESOLVED";

export interface PackageCoverageResult {
  companyId: string;
  packageKey: string;
  documents: DocumentCoverageResult[];
  status: PackageSemanticCoverageStatus;
  statusReasons: string[];
  auditAlgorithmVersion: string;
  contentIdentity: string;
}

// ---------------------------------------------------------------------------
// §159 - cross-section relationship + cross-document/operative-state audits.
// Distinct from per-unit coverage (SemanticUnitCoverageEntry above): a
// shared cap, reclassification right, or incorporated condition connects
// TWO OR MORE units/rules - each rule can individually look fully
// represented while the RELATIONSHIP between them is silently dropped
// (e.g. two baskets each correctly capped on their own, but sharing one
// aggregate limit the compiled IR never links - a real double-counting
// risk no per-unit check alone can see).
// ---------------------------------------------------------------------------

export type CrossSectionRelationshipType = "SHARED_CAP" | "RECLASSIFICATION_OR_REDESIGNATION" | "CROSS_REFERENCE_PERMISSION" | "INCORPORATED_CONDITION";

export interface CrossSectionRelationshipFinding {
  relationshipType: CrossSectionRelationshipType;
  /** The semantic unit(s) whose own detected signal implied this relationship should exist. */
  sourceUnitIds: string[];
  /** True when a corresponding IR-level relationship (dependency edge / shared-cap reference) was found anywhere among the document's compiled rules. */
  found: boolean;
  reasoning: string;
  materiality: SemanticUnitMateriality;
}

export type OperativeStateAuditFindingType = "STALE_SUPERSEDED_TEXT_CREDITED" | "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT";

export interface OperativeStateAuditFinding {
  findingType: OperativeStateAuditFindingType;
  semanticUnitId: string;
  provisionKey: string | null;
  reasoning: string;
  materiality: SemanticUnitMateriality;
}

/** Re-exported for reconciliation-stage modules only - see the independence contract above. */
export type { CovenantFamily };
