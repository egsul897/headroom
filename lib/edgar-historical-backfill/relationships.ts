/**
 * Parent/amendment relationship *candidates* from exhibit metadata.
 *
 * These are discovery hints only — never operative amendment authority.
 * IBR citations alone do not establish that an amendment governs.
 */

import type { DebtDocumentKind, ParentRelationshipCandidate } from "./types";

export function parentRelationshipCandidates(params: {
  documentKind: DebtDocumentKind;
  description: string;
  agreementIdentityKey: string;
  ibrAccessionNumber?: string;
  ibrExhibitType?: string;
}): ParentRelationshipCandidate[] {
  const out: ParentRelationshipCandidate[] = [];
  const desc = params.description;

  const kindMap: Partial<Record<DebtDocumentKind, ParentRelationshipCandidate["kind"]>> = {
    AMENDMENT: "AMENDS",
    RESTATEMENT: "RESTATES",
    SUPPLEMENTAL_INDENTURE: "SUPPLEMENTS",
    WAIVER: "WAIVES",
    CONSENT: "CONSENTS_TO",
  };
  const rel = kindMap[params.documentKind];
  if (rel) {
    const parentHint =
      desc.match(
        /(?:to|of|amending|amends|restating|supplementing)\s+(?:the\s+)?(.{8,80}?(?:credit agreement|loan agreement|indenture|facility))/i,
      )?.[1] ?? "parent-agreement-unspecified";
    out.push({
      kind: rel,
      candidateRef: parentHint.trim().toLowerCase(),
      evidence: `documentKind=${params.documentKind}; description-hint`,
      authority: "DISCOVERY_HINT_ONLY",
    });
  }

  if (params.ibrAccessionNumber) {
    out.push({
      kind: "UNKNOWN_RELATED",
      candidateRef: `${params.ibrAccessionNumber}:${params.ibrExhibitType ?? "?"}`,
      evidence: "IBR citation points at prior filing exhibit (not operative authority by itself)",
      authority: "DISCOVERY_HINT_ONLY",
    });
  }

  return out;
}
