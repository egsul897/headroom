/**
 * Phase 2C §7 - groups a package's documents into DEBT INSTRUMENTS: the
 * underlying credit facility or note series a base agreement plus its own
 * amendments/joinders/supplements all belong to. Built purely from the
 * RESOLVED (never REVIEW_REQUIRED/UNRESOLVED - task §14's "a missing edge
 * is safer than a wrong one" applies to grouping too) AMENDS/
 * AMENDS_AND_RESTATES/SUPPLEMENTS/JOINS relationship candidates, via a
 * simple union-find over document ids. Cross-cutting document types
 * (INTERCREDITOR_AGREEMENT/GUARANTEE/SECURITY_AGREEMENT/COMPLIANCE_CERTIFICATE)
 * are deliberately never grouped into an instrument themselves - task §7's
 * own framing has them "associated with the relevant instrument(s)" via
 * their own GOVERNS/GUARANTEES/SECURES/CERTIFIES_COMPLIANCE_WITH edges
 * instead, which can legitimately point at more than one instrument's
 * documents (a single Document.instrumentId FK could not represent that).
 */
import type { DocumentClassification, DocumentIdentity, InstrumentGroupingResult, RelationshipCandidate } from "./types";

const GROUPING_RELATIONSHIP_TYPES = new Set(["AMENDS", "RESTATES", "SUPPLEMENTS", "JOINS"]);
const NON_INSTRUMENT_TYPES = new Set(["INTERCREDITOR_AGREEMENT", "GUARANTEE", "SECURITY_AGREEMENT", "COMPLIANCE_CERTIFICATE", "SIDE_LETTER", "FEE_LETTER"]);

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function groupPackageIntoInstruments(documentIds: string[], classifications: DocumentClassification[], identities: DocumentIdentity[], relationshipCandidates: RelationshipCandidate[]): InstrumentGroupingResult[] {
  const classById = new Map(classifications.map((c) => [c.documentId, c] as const));
  const identityById = new Map(identities.map((i) => [i.documentId, i] as const));
  const instrumentEligible = documentIds.filter((id) => !NON_INSTRUMENT_TYPES.has(classById.get(id)?.type ?? "UNKNOWN"));

  const uf = new UnionFind();
  for (const id of instrumentEligible) uf.find(id);
  for (const rel of relationshipCandidates) {
    if (rel.status !== "RESOLVED" || !rel.targetDocumentId) continue;
    if (!GROUPING_RELATIONSHIP_TYPES.has(rel.relationshipType)) continue;
    if (!instrumentEligible.includes(rel.sourceDocumentId) || !instrumentEligible.includes(rel.targetDocumentId)) continue;
    uf.union(rel.sourceDocumentId, rel.targetDocumentId);
  }

  const clusters = new Map<string, string[]>();
  for (const id of instrumentEligible) {
    const root = uf.find(id);
    clusters.set(root, [...(clusters.get(root) ?? []), id]);
  }

  const results: InstrumentGroupingResult[] = [];
  for (const [, members] of clusters) {
    // The base document is the one no RESOLVED grouping edge points AWAY
    // FROM as a source targeting another member (i.e. it is never itself
    // an amendment/supplement/joinder of another member) - deterministic,
    // not a guess: a cluster with more than one such "root" candidate
    // (should not happen given how union-find was built from these exact
    // edges, but checked defensively) reports the lowest amendment/
    // supplement number instead of picking arbitrarily.
    const amendsSomeoneInCluster = new Set(relationshipCandidates.filter((r) => r.status === "RESOLVED" && r.targetDocumentId && members.includes(r.sourceDocumentId) && members.includes(r.targetDocumentId) && GROUPING_RELATIONSHIP_TYPES.has(r.relationshipType)).map((r) => r.sourceDocumentId));
    const baseCandidates = members.filter((id) => !amendsSomeoneInCluster.has(id));
    const baseDocumentId = baseCandidates.length === 1 ? baseCandidates[0]! : (baseCandidates.sort((a, b) => (identityById.get(a)?.amendmentNumber ?? identityById.get(a)?.supplementNumber ?? 0) - (identityById.get(b)?.amendmentNumber ?? identityById.get(b)?.supplementNumber ?? 0))[0] ?? members[0]!);

    const baseIdentity = identityById.get(baseDocumentId);
    const baseClassification = classById.get(baseDocumentId);
    const name = baseIdentity?.facilityOrInstrumentName ?? baseIdentity?.title ?? baseClassification?.type ?? "Unnamed instrument";

    results.push({
      instrumentKey: `instrument:${baseDocumentId}`,
      name,
      documentIds: members,
      baseDocumentId,
      confidence: members.length > 1 ? 0.9 : 0.5,
      reviewStatus: baseCandidates.length === 1 ? "RESOLVED" : "REVIEW_REQUIRED",
    });
  }

  return results;
}
