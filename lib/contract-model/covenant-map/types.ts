/**
 * THE CANONICAL COVENANT MAP - the single ordered, verified representation of an instrument's covenant
 * package: every compiled rule, definition and shared capacity as a node in SOURCE ORDER, every
 * relationship as a typed edge, every gap as an explicit unresolved item, and the completeness of the
 * whole thing measured against the discovered population rather than assumed.
 *
 * Nothing here is a benchmark artifact. The map is what the compiler produces; benchmark scoring, UI
 * and Phase 4 gating consume it. Its identity (mapHash) is content-derived and excludes execution
 * telemetry, so two runs over the same source under the same certified configuration hash the same.
 */
import type { IRDefinition, IRRule, IRSharedCapacity } from "../ir/types";
import type { SemanticVerificationStatus } from "../compiler/semantic-verification/types";

export const COVENANT_MAP_SCHEMA_VERSION = "canonical-covenant-map.v3";
export const COVENANT_MAP_ALGORITHM_VERSION = "covenant-map-assembly.v3";

/** Deterministic position of a node in the package: document, then character offset, then depth, then the structural ordinal. */
export interface SourceOrder {
  documentOrdinal: number;
  charStart: number;
  structuralDepth: number;
  localOrdinal: number;
}

export type CovenantMapNodeKind = "RULE" | "DEFINITION" | "SHARED_CAPACITY";
/** STRONG: anchored to a real structural node AND a content-hashed operative text. WEAK: one of the two could not be established. */
export type IdentityStrength = "STRONG" | "WEAK";

export interface CovenantMapNodeVerification {
  status: SemanticVerificationStatus;
  findingIds: string[];
  materialFindings: number;
}

export interface CovenantMapNodeOperative {
  provisionKey: string;
  status: string;
  currentSourceDocumentId: string;
  appliedEffectIds: string[];
  supersededStructuralNodeIds: string[];
}

/** Certification as the node exposes it: the decision, the persisted artifact's content hash, the binding identity, the blocker codes. */
export interface CovenantMapNodeCertification {
  status: "CERTIFIED" | "REVIEW_REQUIRED" | "NOT_CERTIFIED";
  /** The persisted verified-unit artifact's content hash for THIS unit; null unless the candidate's package is complete and certifiable. */
  artifactHash: string | null;
  semanticSourceContractVersion: string | null;
  blockers: string[];
}

export interface CovenantMapNode {
  /** The IR unit's own content-derived id (ruleId / definitionId / sharedCapId) - never a map-local counter. */
  nodeId: string;
  kind: CovenantMapNodeKind;
  candidateRef: string;
  documentId: string;
  sectionRef: string | null;
  structuralNodeId: string | null;
  structuralNodeKey: string | null;
  sourceOrder: SourceOrder;
  family: string;
  ruleType: string | null;
  posture: string | null;
  termName: string | null;
  sufficiency: string | null;
  /** The BINDING identity the unit carries (the semantic source contract version sscv1 on the certified path; the operative scv1 on reconstructed maps). */
  sourceContentVersion: string | null;
  /** The operative (scv1) identity: exact operative text, anchor, applied effects. */
  operativeSourceVersion: string | null;
  identityStrength: IdentityStrength;
  verification: CovenantMapNodeVerification;
  certification: CovenantMapNodeCertification;
  operative: CovenantMapNodeOperative | null;
  unit: IRRule | IRDefinition | IRSharedCapacity;
}

export const COVENANT_MAP_EDGE_TYPES = [
  "RULE_DEPENDS_ON_RULE",
  "RULE_USES_DEFINITION",
  "DEFINITION_USES_DEFINITION",
  "RULE_USES_SHARED_CAPACITY",
  "RULE_MODIFIED_BY_EXCEPTION",
  "RULE_SUBJECT_TO_CONDITION",
  "RULE_SUBJECT_TO_PROVISO",
  "RULE_SUBJECT_TO_GENERAL_PROHIBITION",
  "CROSS_DOCUMENT_DEPENDENCY",
  "AMENDMENT_SUPERSEDES",
] as const;
export type CovenantMapEdgeType = (typeof COVENANT_MAP_EDGE_TYPES)[number];

export type EdgeDerivation =
  | "IR_DEPENDS_ON"
  | "IR_EXPRESSION_TERM_REFERENCE"
  | "IR_CONDITION_REFERENCE"
  | "IR_EXCEPTION_PERMISSION"
  | "IR_DEFINITION_DEPENDS_ON_TERMS"
  | "IR_SHARED_CAPACITY_MEMBERS"
  /** A typed IRSourceDependency on the compiled unit, bound at package level to the owning candidate's unit(s) at the referenced node. */
  | "IR_SOURCE_DEPENDENCY"
  | "CONTEXT_BUNDLE_ITEM"
  | "STRUCTURAL_ANCESTRY"
  | "OPERATIVE_STATE";

/**
 * What an edge is authoritative for.
 *   CERTIFIED_SEMANTIC       established by the compiled IR (an IR_* derivation) AND both endpoints are CERTIFIED - the only authority Phase 4 acts on
 *   REVIEW_ONLY              established by the IR, but an endpoint is not certified
 *   DETERMINISTIC_STRUCTURAL established only by structural ancestry or operative state - a fact about the document tree, never a semantic relationship by itself
 *   CONTEXTUAL_INFERENCE     established only by a context-bundle classification (PARENT_SCOPE / CONDITION / PROVISO / cross-document) - an inference
 */
export type EdgeAuthority = "CERTIFIED_SEMANTIC" | "DETERMINISTIC_STRUCTURAL" | "CONTEXTUAL_INFERENCE" | "REVIEW_ONLY";

export interface CovenantMapEdge {
  /** Content-derived: sha256 of (type, from, to); one edge per relationship, its first derivation recorded. */
  edgeId: string;
  edgeType: CovenantMapEdgeType;
  fromNodeId: string;
  toNodeId: string;
  /** The IR relationship type (ContractRuleRelationshipType) for RULE_DEPENDS_ON_RULE, else null. */
  relationshipType: string | null;
  derivedFrom: EdgeDerivation;
  /** Every derivation that independently established this same relationship (derivedFrom first). */
  corroboratedBy: EdgeDerivation[];
  edgeAuthority: EdgeAuthority;
  reason: string;
  candidateRef: string;
}

export type CovenantMapUnresolvedKind =
  | "CANDIDATE_INELIGIBLE"
  | "CANDIDATE_EMPTY_OPERATIVE_TEXT"
  | "CANDIDATE_NO_STRUCTURAL_ANCHOR"
  | "CANDIDATE_COMPILE_FAILED"
  | "CANDIDATE_COMPILE_REVIEW_REQUIRED"
  | "CANDIDATE_NOT_VERIFIED"
  | "CANDIDATE_VERIFICATION_NOT_PASSED"
  | "CANDIDATE_UNSERVED"
  | "DANGLING_RULE_DEPENDENCY"
  | "DANGLING_EXCEPTION_PERMISSION"
  | "DANGLING_SHARED_CAPACITY_MEMBER"
  | "UNRESOLVED_DEFINED_TERM"
  | "UNRESOLVED_CONTEXT_DEPENDENCY"
  /** A typed source dependency / cross-rule condition target that package-level binding could not bind to a unit of this map (the detail says why: not in target set, owner compiled nothing, no unit at the ref, or genuinely unknown). */
  | "UNRESOLVED_SOURCE_DEPENDENCY"
  | "CROSS_DOCUMENT_UNRESOLVED"
  | "OPERATIVE_STATE_UNRESOLVED"
  | "UNIT_SUFFICIENCY_NOT_SUFFICIENT"
  | "WEAK_IDENTITY";

export interface CovenantMapUnresolvedItem {
  /** Content-derived: sha256 of (kind, candidateRef, nodeId, detail). */
  unresolvedId: string;
  kind: CovenantMapUnresolvedKind;
  /** BLOCKING: the map is incomplete at this point. REVIEW: the map has a node here but it must not be relied on without review. */
  severity: "BLOCKING" | "REVIEW";
  candidateRef: string | null;
  nodeId: string | null;
  documentId: string | null;
  sectionRef: string | null;
  sourceOrder: SourceOrder | null;
  detail: string;
}

export type CandidateOutcome =
  | "MAPPED"
  | "MAPPED_WITH_REVIEW"
  | "COMPILE_FAILED"
  | "VERIFICATION_FAILED"
  | "EMPTY_OPERATIVE_TEXT"
  | "NO_STRUCTURAL_ANCHOR"
  | "INELIGIBLE"
  | "UNSERVED";

/** Execution facts for ONE candidate attempt. Excluded from mapHash. */
export interface CandidateExecutionTelemetry {
  candidateAttempt: number;
  semanticConversations: number;
  refinementConversations: number;
  transportAttempts: number;
  shardAttempts: number;
  inventoryCalls: number;
  verifierCalls: number;
  providerCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  pricingStatus: string | null;
  wallClockMs: number | null;
  deadlineMs: number | null;
  timedOut: boolean;
}

export interface CovenantMapCandidateRecord {
  candidateRef: string;
  discoveryId: string;
  documentId: string;
  sectionRef: string;
  sourceOrder: SourceOrder | null;
  structuralNodeIds: string[];
  families: string[];
  role: string;
  operativeSourceSha256: string | null;
  operativeSourceChars: number;
  sourceContentVersion: string | null;
  outcome: CandidateOutcome;
  compilationStatus: string | null;
  compilationFailureReasons: string[];
  verificationStatus: string | null;
  certificationStatus: "CERTIFIED" | "REVIEW_REQUIRED" | "NOT_CERTIFIED";
  certificationBlockers: string[];
  semanticSourceContractVersion: string | null;
  nodeIds: string[];
  failure: { kind: string; detail: string } | null;
  telemetry: CandidateExecutionTelemetry | null;
}

export interface CovenantMapDocument {
  documentId: string;
  label: string;
  documentOrdinal: number;
  textSha256: string;
  role: "BASE" | "AMENDMENT" | "ANCILLARY" | "UNKNOWN";
}

export interface CovenantMapIdentity {
  mapAlgorithmVersion: string;
  certifiedConfigIdentity: string | null;
  compilerAlgorithmVersion: string;
  compilerPromptVersion: string;
  irSchemaVersion: string;
  verifierAlgorithmVersion: string;
  discoveryRunVersion: string | null;
}

export interface CovenantMapCompleteness {
  candidatesDiscovered: number;
  candidatesEligible: number;
  candidatesAttempted: number;
  candidatesMapped: number;
  candidatesMappedWithReview: number;
  candidatesFailed: number;
  candidatesUnserved: number;
  candidatesByOutcome: Record<string, number>;
  nodesByKind: Record<CovenantMapNodeKind, number>;
  edgesByType: Record<CovenantMapEdgeType, number>;
  unresolvedByKind: Record<string, number>;
  unresolvedBlocking: number;
  unresolvedReview: number;
  nodesVerifiedNoMaterialGap: number;
  nodesUnderReview: number;
  nodesStrongIdentity: number;
  /** candidatesMapped / candidatesEligible, 0..1, or null when nothing was eligible. */
  mappedFraction: number | null;
  complete: boolean;
  /** Same as `complete`: every eligible candidate MAPPED and nothing unresolved. */
  mapComplete: boolean;
  /** Every eligible candidate CERTIFIED. Separate from mapComplete: a complete map can be entirely uncertified. */
  certificationComplete: boolean;
  candidatesCertified: number;
  candidatesReviewRequired: number;
  candidatesNotCertified: number;
  semanticUnits: number;
  semanticUnitsCertified: number;
  edgesByAuthority: Record<EdgeAuthority, number>;
}

export interface CovenantMapDiscoveryPopulation {
  scope: "COMPLETE" | "PARTIAL_TARGET_SET";
  sealedDiscoveryIdentity: string | null;
  candidatePopulationHash: string;
  discoveryVersion: string | null;
  candidatesDiscovered: number;
}

export interface CanonicalCovenantMap {
  schemaVersion: typeof COVENANT_MAP_SCHEMA_VERSION;
  /** sha256 over the canonical (key-sorted) content of every field except mapHash itself and execution telemetry. */
  mapHash: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  asOfDate: string | null;
  documents: CovenantMapDocument[];
  identity: CovenantMapIdentity;
  operativeState: { status: string; asOfDate: string; provisions: number; unattachedEffects: number } | null;
  /** The sealed Phase 2 population this map was assembled over; null when the caller supplied none (then never package-certifiable). */
  discoveryPopulation: CovenantMapDiscoveryPopulation | null;
  nodes: CovenantMapNode[];
  edges: CovenantMapEdge[];
  candidates: CovenantMapCandidateRecord[];
  unresolved: CovenantMapUnresolvedItem[];
  /** Package-level binding of every typed source dependency / cross-rule condition target to the owning candidates' units (derived artifact; units untouched). */
  packageDependencies: import("./package-dependencies").PackageDependencyResolution;
  completeness: CovenantMapCompleteness;
}
