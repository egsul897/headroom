/**
 * Phase 3C - stable, content-derived finding identity (task §15). Mirrors
 * coverage-audit/identity.ts's exact convention: hashParts over real
 * content fields plus the algorithm version, never a random UUID, array
 * position, or model response ordering. Equivalent reruns over unchanged
 * evidence produce stable finding IDs.
 */
import { hashParts } from "../hashing";
import type { SemanticVerificationFindingType } from "./types";

export function computeSemanticVerificationFindingId(companyId: string, instrumentKey: string, candidateRef: string, findingType: SemanticVerificationFindingType, ruleOrDefinitionId: string | null, irPath: string | null, sourceCitation: string, verifierAlgorithmVersion: string): string {
  return hashParts([companyId, instrumentKey, candidateRef, findingType, ruleOrDefinitionId ?? "(none)", irPath ?? "(none)", sourceCitation, verifierAlgorithmVersion]);
}
