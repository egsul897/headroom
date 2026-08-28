/**
 * Phase 3E - deterministic content-derived identity, same discipline as
 * Phase 2E's coverage-audit/identity.ts and Phase 2D's own identity.ts:
 * every id is content-derived (documentId + anchor spans + detection
 * signature + algorithm version), never array-position-derived. Re-running
 * the same inventory build over unchanged source must reproduce identical
 * semanticUnitIds - this is what makes FrozenSourceInventory's own
 * frozenContentHash meaningful as a freeze proof.
 */
import { hashJson, hashParts } from "../hashing";
import type { SourceAnchor } from "./types";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "./types";

function normalizeForIdentity(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function anchorKey(anchor: SourceAnchor): string {
  // Phase 3F.1.2: keyed by structuralNodeId (real physical occurrence
  // identity), never structuralNodeKey - two distinct occurrences sharing a
  // label must never collapse into the same semanticUnitId.
  return `${anchor.documentId}::${anchor.structuralNodeId ?? ""}::${anchor.charStart}-${anchor.charEnd}`;
}

/**
 * Anchors are sorted before hashing so a unit spanning the same set of
 * anchors always produces the same id regardless of the order the detector
 * happened to discover them in.
 */
export function computeSemanticUnitId(anchors: SourceAnchor[], detectionSignature: string): string {
  const sortedAnchorKeys = anchors.map(anchorKey).sort();
  return hashParts([...sortedAnchorKeys, normalizeForIdentity(detectionSignature), SEMANTIC_COVERAGE_ALGORITHM_VERSION]);
}

export function computeCoverageEntryId(semanticUnitId: string, coverageState: string): string {
  return hashParts([semanticUnitId, coverageState, SEMANTIC_COVERAGE_ALGORITHM_VERSION]);
}

export interface FreezeIdentityInput {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentIds: string[];
  /** semanticUnitId + a stable per-unit content fingerprint (excerpt + signals), sorted before hashing. */
  unitFingerprints: { semanticUnitId: string; fingerprint: string }[];
  inventoryAlgorithmVersion: string;
}

/** The freeze proof: computed once, immediately after inventory generation completes, strictly BEFORE any compiled/verified IR is loaded (see the FREEZE-BEFORE-LOAD contract note in types.ts). */
export function computeFrozenContentHash(input: FreezeIdentityInput): string {
  return hashJson({
    companyId: input.companyId,
    packageKey: input.packageKey,
    instrumentKey: input.instrumentKey,
    documentIds: [...input.documentIds].sort(),
    unitFingerprints: [...input.unitFingerprints].sort((a, b) => a.semanticUnitId.localeCompare(b.semanticUnitId)),
    inventoryAlgorithmVersion: input.inventoryAlgorithmVersion,
  });
}

export interface PackageContentIdentityInput {
  companyId: string;
  packageKey: string;
  structuralParserVersion: string;
  coverageAlgorithmVersion: string;
  aiInventoryPromptVersion: string | null;
  providerIdentity: string | null;
  frozenContentHash: string;
}

export function computePackageContentIdentity(input: PackageContentIdentityInput): string {
  return hashJson({
    companyId: input.companyId,
    packageKey: input.packageKey,
    structuralParserVersion: input.structuralParserVersion,
    coverageAlgorithmVersion: input.coverageAlgorithmVersion,
    aiInventoryPromptVersion: input.aiInventoryPromptVersion,
    providerIdentity: input.providerIdentity,
    frozenContentHash: input.frozenContentHash,
  });
}
