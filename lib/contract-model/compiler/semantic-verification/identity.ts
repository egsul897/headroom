/**
 * Phase 3C - stable, content-derived finding identity (task §15). Mirrors
 * coverage-audit/identity.ts's exact convention: hashParts over real
 * content fields plus the algorithm version, never a random UUID, array
 * position, or model response ordering. Equivalent reruns over unchanged
 * evidence produce stable finding IDs.
 */
import { hashParts } from "../hashing";
import type { SemanticVerificationFindingType } from "./types";

/**
 * `assertionKey` (semantic fidelity closure): the identity of the specific assertion the finding is about - for a numeric
 * assertion its normalized value, unit/type and raw text; for a semantic finding a stable digest of what it disputes.
 * Two distinct assertions at one path must never collide; the same content must always hash the same. No clock, no
 * randomness.
 */
export function computeSemanticVerificationFindingId(companyId: string, instrumentKey: string, candidateRef: string, findingType: SemanticVerificationFindingType, ruleOrDefinitionId: string | null, irPath: string | null, sourceCitation: string, verifierAlgorithmVersion: string, assertionKey: string | null = null): string {
  return hashParts([companyId, instrumentKey, candidateRef, findingType, ruleOrDefinitionId ?? "(none)", irPath ?? "(none)", sourceCitation, verifierAlgorithmVersion, ...(assertionKey ? [`assertion:${assertionKey}`] : [])]);
}

/** The assertion identity of a numeric assertion: kind, canonical value, unit/currency, raw text (whitespace-normalized). */
export function numericAssertionKey(a: { kind: string; normalizedValue: number | null; unit: string | null; currency: string | null; rawText: string }): string {
  return `${a.kind}|${a.normalizedValue ?? "null"}|${a.unit ?? ""}|${a.currency ?? ""}|${a.rawText.replace(/\s+/g, " ").trim().toLowerCase()}`;
}
