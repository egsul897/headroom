import type { CovenantKnowledgeStore } from "./store";
import type { KnowledgeRecord } from "./schema";

export interface SourceBackedQuery {
  documentId?: string | null;
  candidateRef?: string | null;
  excerptContains?: string;
  kinds?: KnowledgeRecord["kind"][];
  verificationStatus?: KnowledgeRecord["verificationStatus"][];
  /** Require at least one provenance source span. */
  requireSourceSpan?: boolean;
}

/**
 * Source-backed retrieval over the knowledge store.
 * Returns only records that carry provenance when requireSourceSpan is set.
 * Never upgrades verification status.
 */
export function retrieveSourceBacked(store: CovenantKnowledgeStore, query: SourceBackedQuery): KnowledgeRecord[] {
  return store.list().filter((r) => {
    if (query.documentId != null && r.documentId !== query.documentId) return false;
    if (query.candidateRef != null && r.candidateRef !== query.candidateRef) return false;
    if (query.kinds && !query.kinds.includes(r.kind)) return false;
    if (query.verificationStatus && !query.verificationStatus.includes(r.verificationStatus)) return false;
    if (query.requireSourceSpan && r.provenance.sourceSpans.length === 0) return false;
    if (query.excerptContains) {
      const hay = JSON.stringify(r.body) + r.provenance.sourceSpans.map((s) => s.excerpt).join("\n");
      if (!hay.includes(query.excerptContains)) return false;
    }
    return true;
  });
}
