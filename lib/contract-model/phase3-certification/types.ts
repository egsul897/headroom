/**
 * PHASE 3 CERTIFICATION - the explicit, structured answer to "may Phase 4 execute this?".
 *
 * A candidate's MAP OUTCOME (MAPPED / MAPPED_WITH_REVIEW / ...) says what the compiler produced. Its CERTIFICATION
 * says whether the paired artifacts (exact snapshotted units + the verification of exactly those units) are complete,
 * identity-bound and clean enough for product execution. The two are separate dimensions: a candidate can be MAPPED
 * and NOT_CERTIFIED (weak identity, incomplete artifact package). Only CERTIFIED artifacts cross into Phase 4.
 */
import type { IdentityStrength } from "../covenant-map/types";

export const PHASE3_CERTIFICATION_DECISION_VERSION = "phase3-candidate-certification.v1" as const;
export const PHASE3_PACKAGE_CERTIFICATION_VERSION = "phase3-package-certification.v2" as const;
export const PHASE3_PACKAGE_MANIFEST_SCHEMA = "p3-package-certification-manifest.v1" as const;

export type Phase3CertificationStatus = "CERTIFIED" | "REVIEW_REQUIRED" | "NOT_CERTIFIED";

/**
 * BLOCKING blockers make the candidate NOT_CERTIFIED: the artifacts cannot be relied on at all (identity, pairing,
 * persistence, compile/verify failure). REVIEW blockers make it REVIEW_REQUIRED: the artifacts are sound but the
 * semantics carry an open question a reviewer must close. A CERTIFIED candidate has neither.
 */
export type CertificationBlockerSeverity = "BLOCKING" | "REVIEW";

export type CertificationBlockerCode =
  | "CANDIDATE_NOT_COMPILED"
  | "NOT_ANCHORED"
  | "SOURCE_IDENTITY_WEAK"
  | "SEMANTIC_SOURCE_IDENTITY_WEAK"
  | "OPERATIVE_STATE_UNACCEPTABLE"
  | "CONTEXT_CONTRACT_UNACCEPTABLE"
  | "INVENTORY_MISSING"
  | "INVENTORY_STATUS_UNACCEPTABLE"
  | "UNACCOUNTED_MATERIAL_SOURCE"
  | "SUPPORT_UNACCEPTABLE"
  | "COMPILATION_FAILED"
  | "COMPILATION_NOT_COMPLETED"
  | "UNIT_SUFFICIENCY_INCOMPLETE"
  | "LINEAGE_UNACCEPTABLE"
  | "VERIFICATION_MISSING"
  | "VERIFICATION_NOT_COMPLETED"
  | "VERIFICATION_NOT_CLEAN"
  | "FINDING_OWNER_NOT_CANONICAL"
  | "OPEN_MATERIAL_OR_UNCERTAIN_FINDING"
  | "DEPENDENCY_INVALID"
  | "SNAPSHOT_MISSING"
  | "NO_UNITS"
  | "VERIFIED_PACKAGE_INCOMPLETE"
  | "ARTIFACT_IDENTITY_MISMATCH"
  | "DUPLICATE_UNIT_ID"
  | "CERTIFICATION_NOT_PERFORMED";

export interface CertificationBlocker {
  code: CertificationBlockerCode;
  severity: CertificationBlockerSeverity;
  detail: string;
  refs: string[];
}

export interface CertificationWarning { code: string; detail: string; refs: string[] }

export interface CandidateCertification {
  decisionVersion: typeof PHASE3_CERTIFICATION_DECISION_VERSION;
  candidateRef: string;
  status: Phase3CertificationStatus;
  blockers: CertificationBlocker[];
  warnings: CertificationWarning[];
  /** The operative (scv1) identity strength. */
  sourceIdentityStrength: IdentityStrength;
  /** The semantic source contract (sscv1) identity strength - what CERTIFIED actually requires. */
  semanticSourceIdentityStrength: IdentityStrength;
  operativeSourceVersion: string | null;
  semanticSourceContractVersion: string | null;
  /** The paired verified-unit package's content hash, null when no package was built. */
  artifactPackageHash: string | null;
  /** The pre-verification snapshot's content hash, null when no snapshot was taken. */
  snapshotHash: string | null;
  unitIds: string[];
  /** Per-unit artifact hashes of the persisted verified units (empty unless the package is complete). */
  unitArtifactHashes: Record<string, string>;
}

export type Phase3PackageCertificationStatus = "CERTIFIED" | "PARTIAL" | "REVIEW_REQUIRED" | "FAILED";

export type PackageCertificationBlockerCode =
  | "DISCOVERY_POPULATION_UNSEALED"
  | "PARTIAL_TARGET_SET"
  | "POPULATION_HASH_MISMATCH"
  | "ELIGIBLE_CANDIDATE_NOT_REPRESENTED"
  | "CANDIDATE_NOT_CERTIFIED"
  | "CANDIDATE_REVIEW_REQUIRED"
  | "BLOCKING_UNRESOLVED_ITEM"
  | "REVIEW_UNRESOLVED_ITEM"
  | "REVIEW_ONLY_EXECUTABLE_DEPENDENCY"
  | "WEAK_IDENTITY"
  | "INCOMPLETE_ARTIFACT"
  | "DANGLING_EXECUTABLE_RELATIONSHIP"
  /** A typed source dependency / cross-rule condition target bound to a unit that is not CERTIFIED (or whose source unit is not) - Phase 4 must not act on it. */
  | "UNBOUND_EXECUTABLE_BINDING"
  /** A typed source dependency whose owning candidate is outside this package's target set: the package is a partial view. */
  | "DEPENDENCY_TARGET_NOT_IN_TARGET_SET"
  /** A typed source dependency the package could not bind although its owner is in the target set (owner compiled nothing / no unit at the ref). */
  | "DEPENDENCY_TARGET_NOT_BOUND"
  /** v2 resolver: a one-to-many expansion whose referenced provision is not completely represented by compiled units - the target set must be reviewed. */
  | "DEPENDENCY_TARGET_SET_REVIEW_REQUIRED"
  /** A dependency the compiler could not resolve to any structural node. */
  | "DEPENDENCY_UNKNOWN"
  | "NO_CANDIDATES";

export interface PackageCertificationBlocker { code: PackageCertificationBlockerCode; severity: "FAILED" | "PARTIAL" | "REVIEW"; detail: string; refs: string[] }

export type DiscoveryPopulationScope = "COMPLETE" | "PARTIAL_TARGET_SET";

/** Phase 2's sealed statement of the candidate population Phase 3 was handed. Phase 3 never discovers; it certifies over this. */
export interface DiscoveryPopulationIdentity {
  scope: DiscoveryPopulationScope;
  /** Phase 2's seal over (documents, discovery version, candidate population); null means the population was never sealed. */
  sealedDiscoveryIdentity: string | null;
  candidatePopulationHash: string;
  discoveryVersion: string | null;
  candidatesDiscovered: number;
}

export interface Phase3PackageCertification {
  version: typeof PHASE3_PACKAGE_CERTIFICATION_VERSION;
  status: Phase3PackageCertificationStatus;
  blockers: PackageCertificationBlocker[];
  warnings: CertificationWarning[];
  discoveryPopulation: DiscoveryPopulationIdentity;
  /** Recomputed here from the candidates the map was assembled over; must equal discoveryPopulation.candidatePopulationHash. */
  representedPopulationHash: string;
  candidates: { total: number; eligible: number; represented: number; certified: number; reviewRequired: number; notCertified: number };
  edges: { executable: number; certifiedSemantic: number; reviewOnly: number; deterministicStructural: number; contextualInference: number };
  /** Package-level dependency bindings (v2): total typed dependencies, bound, executable (both endpoints CERTIFIED), and the unbound breakdown. */
  bindings: { total: number; bound: number; executable: number; notInTargetSet: number; notCompiled: number; unitNotFound: number; unknown: number };
}

export interface Phase3PackageManifestCandidate {
  candidateRef: string;
  sectionRef: string;
  documentId: string;
  outcome: string;
  status: Phase3CertificationStatus;
  blockers: CertificationBlockerCode[];
  operativeSourceVersion: string | null;
  semanticSourceContractVersion: string | null;
  artifactPackageHash: string | null;
  snapshotHash: string | null;
  unitIds: string[];
  unitArtifactHashes: Record<string, string>;
}

/** The canonical package manifest: every identity Phase 4 (or an auditor) needs to tie a map to its sealed inputs and its certified artifacts. */
export interface Phase3PackageCertificationManifest {
  schema: typeof PHASE3_PACKAGE_MANIFEST_SCHEMA;
  sourcePackage: { companyId: string; packageKey: string; instrumentKey: string; asOfDate: string | null; documents: { documentId: string; role: string; textSha256: string }[] };
  discoveryPopulation: DiscoveryPopulationIdentity;
  certifiedConfigIdentity: string | null;
  mapIdentity: { mapHash: string; mapAlgorithmVersion: string; compilerAlgorithmVersion: string; verifierAlgorithmVersion: string; irSchemaVersion: string };
  candidateCertifications: Phase3PackageManifestCandidate[];
  verifiedArtifactPackageHashes: string[];
  packageCertification: Phase3PackageCertification;
  manifestHash: string;
}
