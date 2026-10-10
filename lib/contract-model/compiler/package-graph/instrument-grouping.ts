/**
 * Phase 2C §7 - groups a package's documents into DEBT INSTRUMENTS: the
 * underlying credit facility or note series a base agreement plus its own
 * amendments/joinders/supplements all belong to.
 *
 * Canonical instrument identity (HEADROOM-3 / Agent 6 audit remediation):
 * 1. CONFIRMED membership — union-find over trusted RESOLVED +
 *    STRONG_TARGET_EVIDENCE (or pre-taxonomy RESOLVED) edges ONLY. These
 *    members alone may receive Document.instrumentId at persistence.
 * 2. PROVISIONAL discovery associations — REVIEW_REQUIRED edges with
 *    SUPPORTING/STRONG evidence and a concrete targetDocumentId. Recorded on
 *    the target instrument as provisionalDocumentIds for discovery/completeness
 *    WITHOUT unioning clusters, WITHOUT merging two confirmed instruments, and
 *    WITHOUT assigning canonical Document.instrumentId.
 *
 * CONTEXTUAL_MENTION_ONLY / NEGATIVE_EVIDENCE / UNRESOLVED (null target) never
 * alter membership or discovery associations. Cross-cutting document types
 * (INTERCREDITOR / GUARANTEE / SECURITY / COMPLIANCE_CERTIFICATE / SIDE_LETTER /
 * FEE_LETTER / FINANCIAL_STATEMENT) are never grouped into an instrument
 * themselves.
 */
import type {
  DocumentClassification,
  DocumentIdentity,
  InstrumentGroupingResult,
  ProvisionalBridgeBlocker,
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
  "FINANCIAL_STATEMENT",
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
 * Provisional family-association edge. REVIEW_REQUIRED with a concrete
 * target and SUPPORTING/STRONG evidence may be recorded as a discovery/review
 * association on the target instrument. Never unions confirmed clusters, never
 * upgrades relationship status, and never alone establishes operative authority
 * or canonical Document.instrumentId.
 */
export function isAssociativeGroupingEdge(rel: RelationshipCandidate): boolean {
  return (
    rel.status === "REVIEW_REQUIRED" &&
    !!rel.targetDocumentId &&
    GROUPING_RELATIONSHIP_TYPES.has(rel.relationshipType) &&
    ASSOCIATIVE_EVIDENCE.has(rel.evidenceClass)
  );
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

/**
 * Document ids in discovery scope for an instrument: confirmed members plus
 * provisional discovery associations. Never use this set for canonical
 * Document.instrumentId assignment.
 */
export function discoveryAssociatedDocumentIds(
  instrument: Pick<InstrumentGroupingResult, "documentIds" | "provisionalDocumentIds">,
): string[] {
  return [...new Set([...instrument.documentIds, ...(instrument.provisionalDocumentIds ?? [])])].sort();
}

/**
 * Provisional family membership is NOT a legally confirmed amendment chain and
 * must never be treated as a consolidated operative agreement.
 *
 * Returns true only when associationKind is CONFIRMED (or legacy absent+RESOLVED)
 * AND reviewStatus is RESOLVED. PROVISIONAL_FAMILY always returns false.
 */
export function isLegallyConfirmedAmendmentChain(
  instrument: Pick<InstrumentGroupingResult, "associationKind" | "reviewStatus">,
): boolean {
  if (instrument.associationKind === "PROVISIONAL_FAMILY") return false;
  if (instrument.reviewStatus !== "RESOLVED") return false;
  return instrument.associationKind === undefined || instrument.associationKind === "CONFIRMED";
}

/** True only when associationKind is explicitly PROVISIONAL_FAMILY. */
export function isProvisionalInstrumentFamily(
  instrument: Pick<InstrumentGroupingResult, "associationKind">,
): boolean {
  return instrument.associationKind === "PROVISIONAL_FAMILY";
}

/**
 * Operative consolidation (treating amendment text as governing over base) requires
 * a legally confirmed chain. Provisional family association alone is insufficient.
 */
export function mayConsolidateOperativeAgreement(
  instrument: Pick<InstrumentGroupingResult, "associationKind" | "reviewStatus" | "provisionalDocumentIds">,
): boolean {
  if (!isLegallyConfirmedAmendmentChain(instrument)) return false;
  if ((instrument.provisionalDocumentIds?.length ?? 0) > 0) return false;
  return true;
}

function findInstrumentForDocument(
  instruments: InstrumentGroupingResult[],
  documentId: string,
): InstrumentGroupingResult | undefined {
  return instruments.find((i) => i.documentIds.includes(documentId));
}

/**
 * Attach REVIEW_REQUIRED associative edges as discovery associations without
 * mutating confirmed clusters. Never merges two trusted clusters.
 */
function applyProvisionalDiscoveryAssociations(
  instruments: InstrumentGroupingResult[],
  relationshipCandidates: RelationshipCandidate[],
  instrumentEligible: string[],
): void {
  const eligible = new Set(instrumentEligible);
  const associative = relationshipCandidates.filter(
    (r) =>
      isAssociativeGroupingEdge(r) &&
      eligible.has(r.sourceDocumentId) &&
      eligible.has(r.targetDocumentId!),
  );

  // Ambiguity: a singleton source with associative edges into 2+ confirmed
  // clusters is cross-document-ambiguous — record blockers, attach to none.
  const targetsBySource = new Map<string, Set<string>>();
  for (const rel of associative) {
    const srcInst = findInstrumentForDocument(instruments, rel.sourceDocumentId);
    const tgtInst = findInstrumentForDocument(instruments, rel.targetDocumentId!);
    if (!srcInst || !tgtInst) continue;
    if (srcInst.instrumentKey === tgtInst.instrumentKey) continue;
    const set = targetsBySource.get(rel.sourceDocumentId) ?? new Set<string>();
    set.add(tgtInst.instrumentKey);
    targetsBySource.set(rel.sourceDocumentId, set);
  }

  const pushBlocker = (inst: InstrumentGroupingResult, blocker: ProvisionalBridgeBlocker) => {
    const list = inst.provisionalBridgeBlockers ?? [];
    if (list.some((b) => b.sourceDocumentId === blocker.sourceDocumentId && b.targetDocumentId === blocker.targetDocumentId && b.reason === blocker.reason)) {
      return;
    }
    inst.provisionalBridgeBlockers = [...list, blocker];
    inst.reviewStatus = "REVIEW_REQUIRED";
  };

  for (const rel of associative) {
    const src = rel.sourceDocumentId;
    const tgt = rel.targetDocumentId!;
    const srcInst = findInstrumentForDocument(instruments, src);
    const tgtInst = findInstrumentForDocument(instruments, tgt);
    if (!srcInst || !tgtInst) continue;
    if (srcInst.instrumentKey === tgtInst.instrumentKey) continue;

    const srcIsMulti = srcInst.documentIds.length > 1;
    const tgtKeys = targetsBySource.get(src) ?? new Set();

    if (srcIsMulti) {
      // Confirmed member of one instrument must not provisionally join another.
      const blocker: ProvisionalBridgeBlocker = {
        sourceDocumentId: src,
        targetDocumentId: tgt,
        reason: "BRIDGES_CONFIRMED_INSTRUMENTS",
      };
      pushBlocker(srcInst, blocker);
      pushBlocker(tgtInst, blocker);
      continue;
    }

    if (tgtKeys.size > 1) {
      const blocker: ProvisionalBridgeBlocker = {
        sourceDocumentId: src,
        targetDocumentId: tgt,
        reason: "AMBIGUOUS_MULTI_TARGET",
      };
      pushBlocker(srcInst, blocker);
      pushBlocker(tgtInst, blocker);
      continue;
    }

    // Singleton source → unique target cluster: discovery association only.
    const prov = new Set(tgtInst.provisionalDocumentIds ?? []);
    prov.add(src);
    tgtInst.provisionalDocumentIds = [...prov].sort();
    tgtInst.associationKind = "PROVISIONAL_FAMILY";
    tgtInst.reviewStatus = "REVIEW_REQUIRED";
    tgtInst.confidence = Math.min(tgtInst.confidence, 0.6);
  }
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

  // Canonical clusters: trusted edges ONLY. Provisional edges never union.
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
    // Base selection uses trusted membership edges only (never provisional).
    const amendsSomeoneInCluster = new Set(
      relationshipCandidates
        .filter(
          (r) =>
            isTrustedGroupingEdge(r) &&
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

    const baseIdentity = identityById.get(baseDocumentId);
    const baseClassification = classById.get(baseDocumentId);
    const name =
      baseIdentity?.facilityOrInstrumentName ?? baseIdentity?.title ?? baseClassification?.type ?? "Unnamed instrument";

    const reviewStatus = baseCandidates.length !== 1 ? "REVIEW_REQUIRED" : "RESOLVED";

    results.push({
      instrumentKey: `instrument:${baseDocumentId}`,
      name,
      documentIds: [...members].sort(),
      baseDocumentId,
      confidence: members.length > 1 ? 0.9 : 0.5,
      reviewStatus,
      associationKind: "CONFIRMED",
      provisionalDocumentIds: [],
      provisionalBridgeBlockers: [],
    });
  }

  applyProvisionalDiscoveryAssociations(results, relationshipCandidates, instrumentEligible);

  return results;
}
