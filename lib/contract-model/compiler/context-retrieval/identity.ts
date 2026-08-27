/**
 * Phase 2D - deterministic identity (task §31). Reuses the exact hashing
 * primitives Phase C/2B/2C already established (hashParts/hashJson,
 * lib/connectors/dedup.ts's own sha256), never a second hashing scheme.
 */
import { hashParts } from "../hashing";
import type { ContextItemType } from "./types";

/**
 * Identity must never depend on incidental casing: a definition item is
 * created once using its exact-cased term (kept in the item's own
 * `normalizedRef` field for a clean citation) but looked up again later
 * using the lowercase form definition-graph.ts's own exact-match index
 * uses internally - both must hash to the SAME itemId, or the same
 * definition would silently get a second, duplicate item (a real bug this
 * fix closes - see context-retrieval-pipeline.test.ts's own "same
 * definition reachable through two paths" case).
 */
function normalizeForIdentity(ref: string): string {
  return ref.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeItemId(documentId: string, normalizedRef: string, type: ContextItemType): string {
  return `context-item:${hashParts([documentId, normalizeForIdentity(normalizedRef), type])}`;
}

export function computeBundleId(packageKey: string, originatingDocumentId: string, normalizedSourceRef: string): string {
  return `context-bundle:${hashParts([packageKey, originatingDocumentId, normalizedSourceRef])}`;
}

/**
 * Content identity (task §29/§31): hashes every input this bundle's own
 * content actually depends on - the candidate's own identity, the
 * retrieval algorithm/prompt/provider versions, and the exact set of
 * (documentId, retrieved-span) pairs the traversal actually read. Two
 * builds are guaranteed byte-identical output iff this hash is identical;
 * a changed document, a changed retrieval algorithm version, or a changed
 * set of spans actually read all change this hash, which is exactly the
 * granularity task §29 asks invalidation to respect (a document unrelated
 * to what was actually read never changes this hash).
 */
export function computeContentIdentity(parts: {
  discoveryId: string;
  discoveryRunVersion: string;
  retrievalAlgorithmVersion: string;
  semanticPromptVersion: string | null;
  providerIdentity: string | null;
  readSpans: { documentId: string; text: string }[];
}): string {
  const sortedSpans = [...parts.readSpans].sort((a, b) => (a.documentId + a.text < b.documentId + b.text ? -1 : 1));
  return hashParts([parts.discoveryId, parts.discoveryRunVersion, parts.retrievalAlgorithmVersion, parts.semanticPromptVersion ?? "none", parts.providerIdentity ?? "none", ...sortedSpans.map((s) => `${s.documentId}::${s.text}`)]);
}
