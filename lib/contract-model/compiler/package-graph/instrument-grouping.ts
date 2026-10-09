/**
 * Phase 2C §7 - groups a package's documents into DEBT INSTRUMENTS: the
 * underlying credit facility or note series a base agreement plus its own
 * amendments/joinders/supplements all belong to.
 *
 * Two membership strengths (Agent 6 A6-D4):
 * 1. CONFIRMED — RESOLVED + STRONG_TARGET_EVIDENCE (or pre-taxonomy RESOLVED)
 *    edges. Same trust bar as Phase 3F.1.4 PKG-01/PKG-02.
 * 2. PROVISIONAL_FAMILY — REVIEW_REQUIRED edges with SUPPORTING or STRONG
 *    evidence and a concrete targetDocumentId. Associates amendments with the
 *    correct instrument family for discovery/completeness WITHOUT promoting
 *    the edge to RESOLVED or treating the amendment as operatively confirmed.
 *
 * CONTEXTUAL_MENTION_ONLY / NEGATIVE_EVIDENCE / UNRESOLVED (null target) never
 * alter membership. Cross-cutting document types (INTERCREDITOR / GUARANTEE /
 * SECURITY / COMPLIANCE_CERTIFICATE / SIDE_LETTER / FEE_LETTER) are never
 * grouped into an instrument themselves.
 */
import type {
  DocumentClassification,
  DocumentIdentity,
  InstrumentGroupingResult,
  RelationshipCandidate,
  TargetEvidenceClass,
} from "./types";

const GROUPING_RELATIONSHIP_TYPES = new Set(["AMENDS", "RESTATES", "SUPPLEMENTS", "JOINS"]);
const NON_INSTRUMENT_TYPES = new Set([
  "INTERCREDITOR_AGREEMENT",
  "GUARANTEE",
  "SECURITY_AGREEMENT",
  "GUARANTEE_AND_SECURITY_AGREEMENT",
  "COMPLIANCE_CERTIFICATE",
  "SIDE_LETTER",
  "FEE_LETTER",
]);

const ASSOCIATIVE_EVIDENCE: ReadonlySet<TargetEvidenceClass | undefined> = new Set([
  "SUPPORTING_TARGET_EVIDENCE",
  "STRONG_TARGET_EVIDENCE",
]);

/**
 * Confirmed membership edge — may keep instrument.reviewStatus RESOLVED when
 * it alone builds the cluster. RESOLVED+SUPPORTING is deliberately rejected
 * (defense-in-depth; relationship-resolution caps that shape at REVIEW_REQUIRED).
 */
export function isTrustedGroupingEdge(rel: RelationshipCandidate): boolean {
  return (
    rel.status === "RESOLVED" &&
    !!rel.targetDocumentId &&
    GROUPING_RELATIONSHIP_TYPES.has(rel.relationshipType) &&
    (rel.evidenceClass === undefined || rel.evidenceClass === "STRONG_TARGET_EVIDENCE")
  );
}

/**
 * Provisional family-association edge (A6-D4). REVIEW_REQUIRED with a concrete
 * target and SUPPORTING/STRONG evidence joins family membership and forces
 * reviewStatus=REVIEW_REQUIRED / associationKind=PROVISIONAL_FAMILY. Never
 * upgrades relationship status and never alone establishes operative authority.
 */
export function isAssociativeGroupingEdge(rel: RelationshipCandidate): boolean {
  return (
    rel.status === "REVIEW_REQUIRED" &&
    !!rel.targetDocumentId &&
    GROUPING_RELATIONSHIP_TYPES.has(rel.relationshipType) &&
    ASSOCIATIVE_EVIDENCE.has(rel.evidenceClass)
  );
}

/** Either confirmed or provisional — used for union-find membership only. */
function isMembershipEdge(rel: RelationshipCandidate): boolean {
  return isTrustedGroupingEdge(rel) || isAssociativeGroupingEdge(rel);
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

function trustedReachableFrom(baseDocumentId: string, members: string[], relationshipCandidates: RelationshipCandidate[]): Set<string> {
  const uf = new UnionFind();
  for (const id of members) uf.find(id);
  for (const rel of relationshipCandidates) {
    if (!isTrustedGroupingEdge(rel)) continue;
    if (!members.includes(rel.sourceDocumentId) || !members.includes(rel.targetDocumentId!)) continue;
    uf.union(rel.sourceDocumentId, rel.targetDocumentId!);
  }
  const baseRoot = uf.find(baseDocumentId);
  return new Set(members.filter((id) => uf.find(id) === baseRoot));
}

export function groupPackageIntoInstruments(
  documentIds: string[],
  classifications: DocumentClassification[],
  identities: DocumentIdentity[],
  relationshipCandidates: RelationshipCandidate[],
): InstrumentGroupingResult[] {
  const classById = new Map(classifications.map((c) => [c.documentId, c] as const));
  const identityById = new Map(identities.map((i) => [i.documentId, i] as const));
  const instrumentEligible = documentIds.filter((id) => !NON_INSTRUMENT_TYPES.has(classById.get(id)?.type ?? "UNKNOWN"));

  const uf = new UnionFind();
  for (const id of instrumentEligible) uf.find(id);
  for (const rel of relationshipCandidates) {
    if (!isMembershipEdge(rel)) continue;
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
    // Base = document that is not the source of a membership AMENDS/RESTATES/…
    // edge targeting another member. Associative edges count for base selection
    // (so a REVIEW_REQUIRED amendment is not wrongly named the base) without
    // upgrading their relationship status.
    const amendsSomeoneInCluster = new Set(
      relationshipCandidates
        .filter(
          (r) =>
            isMembershipEdge(r) &&
            members.includes(r.sourceDocumentId) &&
            members.includes(r.targetDocumentId!),
        )
        .map((r) => r.sourceDocumentId),
    );
    const baseCandidates = members.filter((id) => !amendsSomeoneInCluster.has(id));
    const baseDocumentId =
      baseCandidates.length === 1
        ? baseCandidates[0]!
        : (baseCandidates.sort(
            (a, b) =>
              (identityById.get(a)?.amendmentNumber ?? identityById.get(a)?.supplementNumber ?? 0) -
              (identityById.get(b)?.amendmentNumber ?? identityById.get(b)?.supplementNumber ?? 0),
          )[0] ?? members[0]!);

    const usedAssociative = relationshipCandidates.some(
      (r) =>
        isAssociativeGroupingEdge(r) &&
        members.includes(r.sourceDocumentId) &&
        members.includes(r.targetDocumentId!),
    );
    const confirmedReachable = trustedReachableFrom(baseDocumentId, members, relationshipCandidates);
    const provisionalDocumentIds = members.filter((id) => id !== baseDocumentId && !confirmedReachable.has(id)).sort();

    const baseIdentity = identityById.get(baseDocumentId);
    const baseClassification = classById.get(baseDocumentId);
    const name =
      baseIdentity?.facilityOrInstrumentName ?? baseIdentity?.title ?? baseClassification?.type ?? "Unnamed instrument";

    const associationKind = usedAssociative || provisionalDocumentIds.length > 0 ? "PROVISIONAL_FAMILY" : "CONFIRMED";
    const reviewStatus =
      associationKind === "PROVISIONAL_FAMILY" || baseCandidates.length !== 1 ? "REVIEW_REQUIRED" : "RESOLVED";

    results.push({
      instrumentKey: `instrument:${baseDocumentId}`,
      name,
      documentIds: members,
      baseDocumentId,
      confidence: associationKind === "CONFIRMED" ? (members.length > 1 ? 0.9 : 0.5) : 0.6,
      reviewStatus,
      associationKind,
      provisionalDocumentIds,
    });
  }

  return results;
}
