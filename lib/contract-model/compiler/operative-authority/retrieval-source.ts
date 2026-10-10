/**
 * Bind a discovery candidate to Agent #7's governing document for Agent #6
 * context retrieval.
 *
 * Rules:
 * - CONFIRMED_OPERATIVE / CONFIRMED_OPERATIVE_WITH_CAVEATS with a governing
 *   documentId → remap structural anchors into that document (caveated authority
 *   is usable for retrieval/disclosure; production elevation is gated elsewhere).
 * - PROVISIONAL_IDENTITY_BLOCKED / AMBIGUOUS / REVIEW_REQUIRED / UNSUPPORTED /
 *   NOT_YET_EFFECTIVE / SUPERSEDED_SOURCE / null governingDocumentId → do not
 *   invent a successor operative source; keep the discovery document and mark
 *   remapping refused so consumers cannot silently consolidate identity.
 */

import type { DiscoveredCandidate } from "../discovery/types";
import type { StructuralIndex } from "../structural-index";
import { resolveCanonicalBodyAnchor } from "../context-retrieval/body-anchor";
import type {
  GoverningAuthorityClassification,
  GoverningProvisionResolution,
  OperativeAuthorityHandoffBundle,
} from "./types";

/**
 * Classifications that may authorize retrieval from governingDocumentId.
 * NOT_YET_EFFECTIVE is included when the predecessor/base remains governing
 * (successor is not yet effective) — retrieval reads the still-operative text,
 * never the future restatement. Production elevation remains gated separately.
 */
const RETRIEVAL_AUTHORIZED = new Set<GoverningAuthorityClassification>([
  "CONFIRMED_OPERATIVE",
  "CONFIRMED_OPERATIVE_WITH_CAVEATS",
  "NOT_YET_EFFECTIVE",
]);

export interface OperativeRetrievalSourceBinding {
  /** Candidate handed to buildCovenantContextBundle (may be remapped). */
  retrievalCandidate: DiscoveredCandidate;
  originalDocumentId: string;
  governingDocumentId: string | null;
  authorityClassification: GoverningAuthorityClassification | null;
  provisionKey: string | null;
  remapped: boolean;
  /** True when Agent #7 authorized reading operative text from governingDocumentId. */
  retrievalAuthorized: boolean;
  refusalReason: string | null;
  remapDetail: string | null;
}

function matchProvision(
  candidate: DiscoveredCandidate,
  provisions: readonly GoverningProvisionResolution[],
): GoverningProvisionResolution | null {
  const defMatch = /^def:([^(]+)/i.exec(candidate.normalizedSourceRef);
  if (defMatch) {
    const term = defMatch[1]!.trim().toLowerCase();
    return (
      provisions.find(
        (p) =>
          p.kind === "DEFINITION" &&
          (p.definedTermRef ?? "").toLowerCase() === term,
      ) ?? null
    );
  }
  const secMatch = /^(\d+\.\d+)/.exec(candidate.normalizedSourceRef);
  if (secMatch) {
    const sectionRef = secMatch[1]!;
    return (
      provisions.find((p) => p.kind === "SECTION" && p.sectionRef === sectionRef) ??
      null
    );
  }
  return (
    provisions.find((p) => p.kind === "WHOLE_AGREEMENT") ?? null
  );
}

function remapStructuralNodes(
  index: StructuralIndex,
  governingDocumentId: string,
  candidate: DiscoveredCandidate,
): { nodeIds: string[]; nodeKeys: string[]; detail: string } | null {
  const defMatch = /^def:([^(]+)/i.exec(candidate.normalizedSourceRef);
  if (defMatch) {
    const term = defMatch[1]!.trim();
    const def =
      index.getDefinition(term, governingDocumentId) ??
      index
        .allDefinitions()
        .find(
          (d) =>
            d.documentId === governingDocumentId &&
            d.normalizedTerm === term.toLowerCase(),
        );
    if (!def) {
      return null;
    }
    // Prefer a SECTION node covering the definition span; else keep empty structure
    // and let definition-graph retrieval resolve by term on the governing document.
    const covering = index
      .allNodes()
      .filter(
        (n) =>
          n.documentId === governingDocumentId &&
          n.nodeType === "SECTION" &&
          n.charStart <= def.charStart &&
          n.charEnd > def.charStart,
      )
      .sort((a, b) => b.charStart - a.charStart)[0];
    if (!covering) {
      return null;
    }
    return {
      nodeIds: [covering.nodeId],
      nodeKeys: [covering.nodeKey],
      detail: `Remapped definition "${term}" to governing document ${governingDocumentId} via section ${covering.sectionRef}.`,
    };
  }

  const secMatch = /^(\d+\.\d+(?:\([a-z0-9]+\))?)/i.exec(candidate.normalizedSourceRef);
  const sectionRef = secMatch?.[1] ?? candidate.normalizedSourceRef.replace(/^§/, "").trim();
  if (!sectionRef) return null;

  const anchor = resolveCanonicalBodyAnchor(index, governingDocumentId, sectionRef);
  if (anchor.selected) {
    return {
      nodeIds: [anchor.selected.nodeId],
      nodeKeys: [anchor.selected.nodeKey],
      detail: `Remapped ${sectionRef} to governing document ${governingDocumentId} (${anchor.status}: ${anchor.reason})`,
    };
  }

  // Fallback: any unique findNodesByRef hit without body-anchor selection.
  const matches = index.findNodesByRef(governingDocumentId, sectionRef);
  if (matches.length === 1) {
    return {
      nodeIds: [matches[0]!.nodeId],
      nodeKeys: [matches[0]!.nodeKey],
      detail: `Remapped ${sectionRef} to unique structural node on governing document ${governingDocumentId}.`,
    };
  }
  return null;
}

/**
 * Resolve which document Agent #6 must read for this candidate's operative text.
 */
export function bindCandidateToOperativeRetrievalSource(input: {
  candidate: DiscoveredCandidate;
  authority: OperativeAuthorityHandoffBundle;
  index: StructuralIndex;
}): OperativeRetrievalSourceBinding {
  const { candidate, authority, index } = input;
  const originalDocumentId = candidate.documentId;
  const provision = matchProvision(candidate, authority.provisions);

  if (!provision) {
    return {
      retrievalCandidate: candidate,
      originalDocumentId,
      governingDocumentId: null,
      authorityClassification: null,
      provisionKey: null,
      remapped: false,
      retrievalAuthorized: false,
      refusalReason: "No matching Agent #7 provision resolution for this candidate.",
      remapDetail: null,
    };
  }

  const classification = provision.authorityClassification;
  const governingDocumentId = provision.governingDocumentId;

  if (!RETRIEVAL_AUTHORIZED.has(classification) || !governingDocumentId) {
    return {
      retrievalCandidate: candidate,
      originalDocumentId,
      governingDocumentId,
      authorityClassification: classification,
      provisionKey: provision.provisionKey,
      remapped: false,
      retrievalAuthorized: false,
      refusalReason: !governingDocumentId
        ? `Authority ${classification} has null governingDocumentId — refuse silent operative-source consolidation.`
        : `Authority ${classification} cannot authorize remapping retrieval to a successor operative source.`,
      remapDetail: null,
    };
  }

  if (governingDocumentId === originalDocumentId) {
    return {
      retrievalCandidate: candidate,
      originalDocumentId,
      governingDocumentId,
      authorityClassification: classification,
      provisionKey: provision.provisionKey,
      remapped: false,
      retrievalAuthorized: true,
      refusalReason: null,
      remapDetail: `Candidate already anchored on governing document ${governingDocumentId}.`,
    };
  }

  const nodes = remapStructuralNodes(index, governingDocumentId, candidate);
  if (!nodes) {
    return {
      retrievalCandidate: candidate,
      originalDocumentId,
      governingDocumentId,
      authorityClassification: classification,
      provisionKey: provision.provisionKey,
      remapped: false,
      retrievalAuthorized: true,
      refusalReason: `Governing document ${governingDocumentId} authorized, but no structural/definition anchor found for "${candidate.normalizedSourceRef}" — kept discovery document to avoid inventing a span.`,
      remapDetail: null,
    };
  }

  const retrievalCandidate: DiscoveredCandidate = {
    ...candidate,
    documentId: governingDocumentId,
    structuralNodeIds: nodes.nodeIds.length > 0 ? nodes.nodeIds : candidate.structuralNodeIds,
    structuralNodeKeys: nodes.nodeKeys.length > 0 ? nodes.nodeKeys : candidate.structuralNodeKeys,
    evidenceSignals: [
      ...candidate.evidenceSignals,
      `OPERATIVE_AUTHORITY_GOVERNING_DOCUMENT:${governingDocumentId}`,
      `OPERATIVE_AUTHORITY_CLASSIFICATION:${classification}`,
      `OPERATIVE_AUTHORITY_ORIGINAL_DOCUMENT:${originalDocumentId}`,
    ],
  };

  return {
    retrievalCandidate,
    originalDocumentId,
    governingDocumentId,
    authorityClassification: classification,
    provisionKey: provision.provisionKey,
    remapped: true,
    retrievalAuthorized: true,
    refusalReason: null,
    remapDetail: nodes.detail,
  };
}
