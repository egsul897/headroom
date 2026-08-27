/**
 * Phase 2E - Independent Covenant Coverage & Context Auditor V1
 * (docs/phase-2e-independent-coverage-auditor.md).
 *
 * INDEPENDENCE CONTRACT (full text in the final report, §2 of this file's
 * own header for quick reference at the type-definition site):
 *
 * Allowed during independent inventory generation: raw indexed source
 * text, structural nodes/spans (Phase 2A's StructuralIndex), package
 * identity/instrument topology/document relationship topology (Phase 2C's
 * PackageGraphResult - a topology fact, not a Phase 2B/2D semantic
 * conclusion), source-side defined-term locations and explicit source-side
 * references (Phase 2A's own definition/reference index), independently
 * derived deterministic legal/economic signals, independently selected
 * structural regions, low-level provenance/source metadata.
 *
 * Forbidden during independent inventory generation: Phase 2B
 * DiscoveredCandidate[], Phase 2B semantic conclusions/family
 * classifications, Phase 2D CovenantContextBundle, Phase 2D dependency
 * lists/sufficiency states, compiler rule outputs, primary-pipeline
 * "coverage" conclusions, benchmark expected answers.
 *
 * Comparison stage only: after the independent inventory exists,
 * comparison modules (discovery-comparison.ts, context-comparison.ts,
 * amendment-audit.ts) MAY read Phase 2B/2D/2C outputs to classify whether
 * independently identified material was discovered/retrieved/omitted.
 * Primary outputs are comparison targets, not discovery inputs - this is
 * mechanically enforced by tests/contract-model/coverage-audit-independence.test.ts,
 * which statically inspects this module's own import statements.
 */
import type { CovenantFamily } from "@prisma/client";

// ---------------------------------------------------------------------------
// §5/§6 - independent source-side inventory
// ---------------------------------------------------------------------------

export type CoverageRegionRole =
  | "GENERAL_PROHIBITION_CANDIDATE"
  | "PERMISSION_CANDIDATE"
  | "BASKET_CANDIDATE"
  | "EXCEPTION_CANDIDATE"
  | "RATIO_TEST_CANDIDATE"
  | "BUILDER_GROWER_CANDIDATE"
  | "SHARED_CAP_CANDIDATE"
  | "CONDITION_CANDIDATE"
  | "DEFINITION_CANDIDATE"
  | "CALCULATION_CANDIDATE"
  | "ENTITY_SCOPE_CANDIDATE"
  | "AMENDMENT_MECHANIC_CANDIDATE"
  | "HEADLINE_SECTION_CANDIDATE"
  | "OTHER_ECONOMIC_SIGNAL";

/** Structural source-side audit unit (task §6) - anchored to real Phase 2A structure, never an arbitrary token chunk. */
export interface CoverageRegion {
  /** Deterministic, content-derived: documentId + nodeKey + a stable signal-set hash. */
  regionId: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentId: string;
  structuralNodeKey: string;
  sectionRef: string;
  sourceCitation: string;
  /** Bounded excerpt of this region's own text (not full DESCENDANTS dump). */
  excerptText: string;
  /** Which independent signals fired - the evidence trail (never a bare boolean). */
  detectedSignals: string[];
  probableRole: CoverageRegionRole;
  /** True when this region's OWN text contains >=2 independent enumerated-item markers (e.g. "(i)"/"(ii)") that do NOT correspond to separate child StructuralNodes - a possible unrepresented multi-basket list the structural substrate itself never separated (task §13/§30). */
  possibleUnstructuredMultiItem: boolean;
  /** Count of independent enumerated items detected inside the region's own text, whether or not they are separately navigable structural nodes. */
  inlineEnumeratedItemCount: number;
  auditAlgorithmVersion: string;
  provenance: string;
}

// ---------------------------------------------------------------------------
// §10 - materiality
// ---------------------------------------------------------------------------

export type Materiality = "MATERIAL" | "NON_MATERIAL" | "UNCERTAIN";

// ---------------------------------------------------------------------------
// §9/§12 - discovery coverage classification
// ---------------------------------------------------------------------------

export type DiscoveryComparisonStatus = "DISCOVERED_EXACTLY" | "DISCOVERED_BY_DESCENDANT" | "DISCOVERED_BY_ANCESTOR" | "DISCOVERED_SEMANTICALLY_EQUIVALENT" | "PARTIALLY_DISCOVERED" | "NOT_DISCOVERED" | "AMBIGUOUS";

// ---------------------------------------------------------------------------
// §21 - finding model
// ---------------------------------------------------------------------------

export type AuditFindingType =
  | "MATERIAL_DISCOVERY_MISS"
  | "PARTIAL_DISCOVERY"
  | "MISSING_PARENT_CONTEXT"
  | "MISSING_CHILD_CONTEXT"
  | "MISSING_PROVISO"
  | "MISSING_SHARED_CAP"
  | "MISSING_EXCEPTION"
  | "MISSING_CONDITION"
  | "MISSING_DEFINITION"
  | "MISSING_DEFINITION_DEPENDENCY"
  | "MISSING_CALCULATION_CONTEXT"
  | "MISSING_ENTITY_SCOPE"
  | "MISSING_CROSS_REFERENCE"
  | "MISSING_CROSS_DOCUMENT_REFERENCE"
  | "MISSING_AMENDMENT_LEAD"
  | "SILENT_UNRESOLVED_DEPENDENCY"
  | "STRUCTURAL_COVERAGE_GAP"
  | "POSSIBLE_FALSE_POSITIVE"
  | "OTHER_MATERIAL_COVERAGE_GAP";

/** §22 - attribution: which subsystem actually owns this gap, never charged to more than one downstream stage merely because outputs cascade. */
export type RootCauseSubsystem = "STRUCTURAL_SUBSTRATE" | "DISCOVERY_PHASE_2B" | "CONTEXT_RETRIEVAL_PHASE_2D" | "PACKAGE_RELATIONSHIP_PHASE_2C" | "AUDITOR_ITSELF" | "NOT_APPLICABLE";

export type FindingResolutionStatus = "OPEN" | "ACKNOWLEDGED_LIMITATION" | "FALSE_POSITIVE_CONFIRMED";

export interface AuditFinding {
  /** Deterministic, content-derived - never random, never array-position-derived. */
  findingId: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentId: string;
  structuralNodeKey: string | null;
  sourceCitation: string;
  findingType: AuditFindingType;
  materiality: Materiality;
  /** The actual missing economic/legal unit (task §11 - never "section incomplete"). */
  sourceEvidence: string;
  auditorReasoning: string;
  comparisonResult: DiscoveryComparisonStatus | "CONTEXT_ITEM_PRESENT" | "CONTEXT_ITEM_MISSING" | "CONTEXT_ITEM_SURFACED_UNRESOLVED" | "AMENDMENT_LEAD_PRESENT" | "AMENDMENT_LEAD_MISSING" | "N_A";
  rootCauseSubsystem: RootCauseSubsystem;
  affectedDiscoveryId: string | null;
  affectedBundleId: string | null;
  resolutionStatus: FindingResolutionStatus;
  auditAlgorithmVersion: string;
  semanticPromptVersion: string | null;
  providerIdentity: string | null;
  provenance: string;
}

// ---------------------------------------------------------------------------
// §26 - fault injection
// ---------------------------------------------------------------------------

export type InjectedDefectType =
  | "REMOVE_BASKET"
  | "REMOVE_TRAILING_PROVISO"
  | "REMOVE_SHARED_CAP"
  | "REMOVE_PARENT_SCOPE"
  | "REMOVE_TOP_LEVEL_DEFINITION"
  | "REMOVE_NESTED_DEFINITION"
  | "REMOVE_CALCULATION_PROVISION"
  | "REMOVE_ENTITY_SCOPE"
  | "REMOVE_AMENDMENT_LEAD"
  | "REMOVE_CROSS_REFERENCE"
  | "REMOVE_UNRESOLVED_DEPENDENCY_SIGNAL"
  | "SUPPRESS_MULTIPLE_RULES_FLAG";

export interface FaultManifestEntry {
  /** Deterministic, content-derived. */
  injectionId: string;
  companyId: string;
  packageKey: string;
  documentId: string;
  sourceLocation: string;
  injectedDefectType: InjectedDefectType;
  materiality: Materiality;
  expectedAuditorBehavior: string;
  actualFindingIds: string[];
  caught: boolean;
  reasonIfNotCaught: string | null;
}

// ---------------------------------------------------------------------------
// §35 - coverage map
// ---------------------------------------------------------------------------

export type RegionAuditState = "AUDITED_NO_GAP_FOUND" | "AUDITED_GAP_FOUND" | "AUDIT_UNCERTAIN" | "NOT_AUDITED" | "STRUCTURALLY_UNAVAILABLE";

export interface CoverageMapEntry {
  regionId: string;
  documentId: string;
  sectionRef: string;
  state: RegionAuditState;
  primaryDiscovered: boolean;
  auditorCandidate: boolean;
  materialFindingCount: number;
  unresolvedFindingCount: number;
}

// ---------------------------------------------------------------------------
// top-level run result
// ---------------------------------------------------------------------------

export const COVERAGE_AUDIT_ALGORITHM_VERSION = "phase-2e-coverage-audit.v1";

export interface CoverageAuditRunResult {
  companyId: string;
  packageKey: string;
  regions: CoverageRegion[];
  findings: AuditFinding[];
  coverageMap: CoverageMapEntry[];
  auditAlgorithmVersion: string;
  contentIdentity: string;
  performance: CoverageAuditPerformance;
}

export interface CoverageAuditPerformance {
  documentsAudited: number;
  structuralRegionsAudited: number;
  independentCandidates: number;
  deterministicWallClockMs: number;
  semanticRegionsReviewed: number;
  semanticWallClockMs: number;
  comparisonWallClockMs: number;
  totalFindings: number;
  materialFindings: number;
  uncertainFindings: number;
  semanticCalls: number;
  inputTokens: number;
  outputTokens: number;
}

/** Re-exported for comparison-stage modules only - see the independence contract above. */
export type { CovenantFamily };
