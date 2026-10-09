/**
 * Corpus acceptance for an acquired SEC exhibit — two independent questions, answered separately:
 *
 *   1. Source-byte identity. The manifest's rawContentSha256 is the hash of the bytes a *previous*
 *      acquisition stored in the local corpus; the batch hashes the bytes it fetched now. When they
 *      differ, nothing here can say which (if either) is the canonical SEC byte stream, so the
 *      identity is UNRECONCILED — neither "corrupt" nor "confirmed" — until an explicit
 *      reconciliation compares both byte streams. The persisted hash is always the hash of the
 *      persisted bytes, so the stored object is self-consistent regardless.
 *   2. Substantive relevance. An EX-10 is not a financing agreement because it is an EX-10. The
 *      shared financing filter (title cues, classifier class, false-positive patterns) decides; a
 *      document it rejects is QUARANTINED: bytes preserved, excluded from financing-precedent
 *      counts, retrieval and benchmark datasets.
 *
 * Pure; no I/O; the persist path and the tests share it.
 */
import { classifyCorpusRole, hasFinancingBodyHeading, type CorpusQualityRow } from "../../product/covenant-intelligence/corpus-quality";

export type SourceByteIdentity = "MATCHES_MANIFEST" | "NO_MANIFEST_HASH" | "UNRECONCILED_MANIFEST_DRIFT";
export type CorpusRole = "SUBSTANTIVE_FINANCING" | "QUARANTINED_NON_FINANCING";

export interface CorpusAcceptance {
  corpusRole: CorpusRole;
  reason: string;
  sourceByteIdentity: SourceByteIdentity;
  /** True only for SUBSTANTIVE_FINANCING. Identity drift does not by itself exclude a document, it is disclosed. */
  countsAsFinancingPrecedent: boolean;
}

export function decideSourceByteIdentity(input: { manifestHash: string | null; fetchedHash: string; clientHash?: string | null }): SourceByteIdentity {
  if (!input.manifestHash) return "NO_MANIFEST_HASH";
  if (input.fetchedHash === input.manifestHash || input.clientHash === input.manifestHash) return "MATCHES_MANIFEST";
  return "UNRECONCILED_MANIFEST_DRIFT";
}

export function decideCorpusAcceptance(input: {
  source: CorpusQualityRow;
  manifestHash: string | null;
  fetchedHash: string;
  clientHash?: string | null;
  /** Plain text of the document's opening (tags stripped). Consulted only when class and title are uninformative. */
  bodyHeadSample?: string | null;
}): CorpusAcceptance {
  const sourceByteIdentity = decideSourceByteIdentity(input);
  const role = classifyCorpusRole(input.source);
  if (role === "SUBSTANTIVE_FINANCING") {
    return { corpusRole: "SUBSTANTIVE_FINANCING", reason: `class ${input.source.documentClass} / title establishes a financing instrument`, sourceByteIdentity, countsAsFinancingPrecedent: true };
  }
  // An exhibit whose filename says nothing (ex10-1.htm) can still name its instrument on its own
  // cover page. That is substantive content evidence, applied with the same non-debt exclusions.
  if ((input.source.byteSize ?? 0) >= 8_000 && hasFinancingBodyHeading(input.bodyHeadSample)) {
    return { corpusRole: "SUBSTANTIVE_FINANCING", reason: "opening text names a financing instrument (title and class were uninformative)", sourceByteIdentity, countsAsFinancingPrecedent: true };
  }
  return {
    corpusRole: "QUARANTINED_NON_FINANCING",
    reason: `class ${input.source.documentClass} with no financing title cue, or a non-debt exhibit pattern (${input.source.exhibitFilename})`,
    sourceByteIdentity,
    countsAsFinancingPrecedent: false,
  };
}
