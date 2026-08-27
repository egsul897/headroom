/**
 * Phase 2E - deterministic content-derived identity, same discipline as
 * Phase 2D's identity.ts (§29/§36 - cache/version identity must account
 * for source content, structural-parser version, auditor algorithm
 * version, and provider/model identity where applicable; never derived
 * from array ordering).
 */
import { hashJson, hashParts } from "../hashing";
import { COVERAGE_AUDIT_ALGORITHM_VERSION } from "./types";

function normalizeForIdentity(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeRegionId(documentId: string, structuralNodeKey: string, signalSetKey: string): string {
  return hashParts([documentId, structuralNodeKey, normalizeForIdentity(signalSetKey), COVERAGE_AUDIT_ALGORITHM_VERSION]);
}

export function computeFindingId(documentId: string, structuralNodeKey: string | null, findingType: string, sourceEvidence: string): string {
  return hashParts([documentId, structuralNodeKey ?? "", findingType, normalizeForIdentity(sourceEvidence), COVERAGE_AUDIT_ALGORITHM_VERSION]);
}

export function computeInjectionId(packageKey: string, documentId: string, sourceLocation: string, defectType: string): string {
  return hashParts([packageKey, documentId, sourceLocation, defectType]);
}

export interface ContentIdentityInput {
  companyId: string;
  packageKey: string;
  structuralParserVersion: string;
  auditAlgorithmVersion: string;
  semanticPromptVersion: string | null;
  providerIdentity: string | null;
  readSpans: { documentId: string; text: string }[];
}

export function computeContentIdentity(input: ContentIdentityInput): string {
  return hashJson({
    companyId: input.companyId,
    packageKey: input.packageKey,
    structuralParserVersion: input.structuralParserVersion,
    auditAlgorithmVersion: input.auditAlgorithmVersion,
    semanticPromptVersion: input.semanticPromptVersion,
    providerIdentity: input.providerIdentity,
    readSpans: [...input.readSpans].sort((a, b) => (a.documentId + a.text).localeCompare(b.documentId + b.text)),
  });
}
