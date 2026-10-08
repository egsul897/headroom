/**
 * Canonical research-entry identity and dedupe keys.
 * Dedupes by source document + operative version + source span + covenant
 * identity + extraction version — never by free-text paraphrase.
 */

import { createHash } from "node:crypto";
import {
  normalizeVerificationStatus,
  type OperativeVersionStatus,
  type ResearchCorpusEntry,
  type ResearchVerificationStatus,
} from "./types";

export function excerptHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 24);
}

export function covenantIdentityKey(input: {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string | null;
  sourceSectionRef: string | null;
  covenantFamily: string;
  kind: string;
  roleOrRuleType: string | null;
}): string {
  return [
    input.companyId,
    input.instrumentKey,
    input.sourceDocumentId ?? "",
    input.sourceSectionRef ?? "",
    input.covenantFamily,
    input.kind,
    input.roleOrRuleType ?? "",
  ].join("|");
}

export function researchIdentityKey(input: {
  sourceDocumentId: string | null;
  operativeStatus: OperativeVersionStatus;
  sourceSpanHash: string;
  covenantIdentity: string;
  extractionVersion: string | null;
}): string {
  return [
    input.sourceDocumentId ?? "",
    input.operativeStatus,
    input.sourceSpanHash,
    input.covenantIdentity,
    input.extractionVersion ?? "",
  ].join("::");
}

export function attachIdentityFields(
  entry: ResearchCorpusEntry,
  over: {
    sourceDocumentId?: string | null;
    extractionVersion?: string | null;
    charStart?: number | null;
    charEnd?: number | null;
  } = {},
): ResearchCorpusEntry {
  const sourceDocumentId = over.sourceDocumentId ?? entry.sourceDocumentId ?? entry.filing.documentName ?? null;
  const extractionVersion = over.extractionVersion ?? entry.extractionVersion ?? null;
  const spanHash = excerptHash(entry.sourceExcerpt);
  const covenantIdentity =
    entry.covenantIdentity ||
    covenantIdentityKey({
      companyId: entry.issuer.companyId,
      instrumentKey: entry.instrument.instrumentKey,
      sourceDocumentId,
      sourceSectionRef: entry.sourceSectionRef,
      covenantFamily: String(entry.covenantFamily),
      kind: entry.kind,
      roleOrRuleType: entry.ruleType,
    });
  const identityKey = researchIdentityKey({
    sourceDocumentId,
    operativeStatus: entry.operativeVersion.status,
    sourceSpanHash: spanHash,
    covenantIdentity,
    extractionVersion,
  });

  return {
    ...entry,
    sourceDocumentId,
    extractionVersion,
    covenantIdentity,
    identityKey,
    sourceSpan: {
      charStart: over.charStart ?? entry.sourceSpan?.charStart ?? null,
      charEnd: over.charEnd ?? entry.sourceSpan?.charEnd ?? null,
      excerptHash: spanHash,
    },
    missingDependencies: entry.missingDependencies ?? [],
  };
}

/**
 * Prefer higher-trust statuses when collapsing exact identity dupes.
 * Never invent SOURCE_VERIFIED / INDEPENDENTLY_LEGALLY_VERIFIED.
 */
const STATUS_RANK: Record<ResearchVerificationStatus, number> = {
  INDEPENDENTLY_LEGALLY_VERIFIED: 60,
  SOURCE_VERIFIED: 50,
  VERIFIED: 50, // legacy alias → treated like SOURCE_VERIFIED rank
  HYPOTHESIS: 30,
  COMPILED: 30, // legacy alias
  REVIEW_REQUIRED: 25,
  UNVERIFIED: 20,
  FIXTURE: 10,
};

export interface DedupeResult {
  entries: ResearchCorpusEntry[];
  removedCount: number;
  keptByIdentity: Map<string, ResearchCorpusEntry>;
}

export function dedupeResearchEntries(entries: readonly ResearchCorpusEntry[]): DedupeResult {
  const keptByIdentity = new Map<string, ResearchCorpusEntry>();
  let removedCount = 0;

  for (const raw of entries) {
    const normalizedStatus = normalizeVerificationStatus(raw.verificationStatus);
    const entry = attachIdentityFields({ ...raw, verificationStatus: normalizedStatus });
    const key = entry.identityKey!;
    const prev = keptByIdentity.get(key);
    if (!prev) {
      keptByIdentity.set(key, entry);
      continue;
    }
    removedCount += 1;
    const prevRank = STATUS_RANK[prev.verificationStatus] ?? 0;
    const nextRank = STATUS_RANK[entry.verificationStatus] ?? 0;
    // Prefer richer excerpts / higher-trust status; never invent legal verification.
    if (nextRank > prevRank || (nextRank === prevRank && entry.sourceExcerpt.length > prev.sourceExcerpt.length)) {
      keptByIdentity.set(key, entry);
    }
  }

  return {
    entries: [...keptByIdentity.values()],
    removedCount,
    keptByIdentity,
  };
}
