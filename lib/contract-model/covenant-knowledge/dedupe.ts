import { contentAddress, sha256Hex } from "../compiler/inference/hash";
import type { KnowledgeRecord } from "./schema";

/**
 * Exact content-addressed reuse for structural extraction.
 * Semantic interpretation reuse is stricter and gated separately.
 */
export function structuralContentKey(payload: {
  documentId: string | null;
  sectionRef: string | null;
  text: string;
  extractorVersion: string;
}): string {
  return contentAddress({
    documentId: payload.documentId,
    sectionRef: payload.sectionRef,
    text: payload.text,
    extractorVersion: payload.extractorVersion,
  });
}

/** Normalized text fingerprint for near-duplicate detection (whitespace-folded). */
export function nearDuplicateFingerprint(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return sha256Hex(normalized);
}

export interface NearDuplicateMatch {
  recordId: string;
  contentHash: string;
  fingerprint: string;
  exact: boolean;
}

/**
 * Validated near-duplicate detection: exact content hash OR identical normalized fingerprint.
 * Does NOT imply semantic equivalence of interpretations.
 */
export function findNearDuplicates(
  text: string,
  records: KnowledgeRecord[],
  options?: { requireSameKind?: KnowledgeRecord["kind"] }
): NearDuplicateMatch[] {
  const fp = nearDuplicateFingerprint(text);
  const exactHash = contentAddress({ text });
  const out: NearDuplicateMatch[] = [];
  for (const r of records) {
    if (options?.requireSameKind && r.kind !== options.requireSameKind) continue;
    const bodyText = typeof r.body.text === "string" ? r.body.text : JSON.stringify(r.body);
    const rfp = nearDuplicateFingerprint(bodyText);
    const rexact = contentAddress({ text: bodyText });
    if (rfp === fp || rexact === exactHash || r.contentHash === exactHash) {
      out.push({
        recordId: r.recordId,
        contentHash: r.contentHash,
        fingerprint: rfp,
        exact: rexact === exactHash || r.contentHash === exactHash,
      });
    }
  }
  return out;
}

/**
 * Semantic interpretation reuse is forbidden across different operative contexts
 * unless an explicit equivalence certificate is supplied.
 */
export function mayReuseSemanticInterpretation(args: {
  sourceContextHash: string;
  targetContextHash: string;
  equivalenceCertificateId?: string | null;
}): { allowed: boolean; reason: string } {
  if (args.sourceContextHash === args.targetContextHash) {
    return { allowed: true, reason: "Identical operative context hash." };
  }
  if (args.equivalenceCertificateId) {
    return { allowed: true, reason: `Equivalence certificate ${args.equivalenceCertificateId} established.` };
  }
  return {
    allowed: false,
    reason: "Refusing semantic interpretation reuse across different operative contexts without established equivalence.",
  };
}
