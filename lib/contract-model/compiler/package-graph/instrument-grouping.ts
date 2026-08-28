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
const NON_INSTRUMENT_TYPES = new Set(["INTERCREDITOR_AGREEMENT", "GUARANTEE", "SECURITY_AGREEMENT", "GUARANTEE_AND_SECURITY_AGREEMENT", "COMPLIANCE_CERTIFICATE", "SIDE_LETTER", "FEE_LETTER"]);

/**
 * Phase 3F.1.4 Workstream C - PKG-01/PKG-02 defense-in-depth. Even a
 * status===RESOLVED grouping-type edge is only trusted to alter instrument
 * membership when it carries STRONG_TARGET_EVIDENCE (see package-graph/
 * types.ts's TargetEvidenceClass doc comment). relationship-resolution.ts's
 * own PKG-01 fix already never promotes a CONTEXTUAL_MENTION_ONLY/
 * NEGATIVE_EVIDENCE reference past UNRESOLVED and caps a
 * SUPPORTING_TARGET_EVIDENCE one at REVIEW_REQUIRED, so in today's pipeline
 * a RESOLVED grouping edge always already carries STRONG_TARGET_EVIDENCE -
 * this check exists so this module does not ALSO have to be re-audited (and
 * cannot silently regress into PKG-01's cross-instrument contamination)
 * every time relationship-resolution.ts changes, or if a future caller ever
 * feeds this function RESOLVED rows computed some other way. A candidate
 * with no evidenceClass at all (the historical pre-taxonomy shape) is
 * treated as trusted for backward compatibility - this module's own real
 * producer (relationship-resolution.ts) always sets the field today, so
 * this branch is dead in practice, not a live gap.
 */
function isTrustedGroupingEdge(rel: RelationshipCandidate): boolean {
  return rel.status === "RESOLVED" && !!rel.targetDocumentId && GROUPING_RELATIONSHIP_TYPES.has(rel.relationshipType) && (rel.evidenceClass === undefined || rel.evidenceClass === "STRONG_TARGET_EVIDENCE");
}

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
    if (!isTrustedGroupingEdge(rel)) continue;
    if (!instrumentEligible.includes(rel.sourceDocumentId) || !instrumentEligible.includes(rel.targetDocumentId!)) continue;
    uf.union(rel.sourceDocumentId, rel.targetDocumentId!);
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
    const amendsSomeoneInCluster = new Set(relationshipCandidates.filter((r) => isTrustedGroupingEdge(r) && members.includes(r.sourceDocumentId) && members.includes(r.targetDocumentId!)).map((r) => r.sourceDocumentId));
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
