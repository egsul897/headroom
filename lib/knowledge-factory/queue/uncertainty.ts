/**
 * Knowledge-driven active learning / uncertainty queue.
 * Cases become regression candidates and reviewer tasks — not silent auto-fixes.
 */

import type { CovenantCandidateRecord, KnowledgeSourceRecord, StructuralNodeRecord } from "../types";

export type UncertaintyReason =
  | "FAILS_TO_CLASSIFY_COVENANT"
  | "THRESHOLD_VS_PERMISSION_CONFUSION_RISK"
  | "ENTITY_SCOPE_UNCLEAR"
  | "SHARED_CAP_MISSED_RISK"
  | "AMENDMENT_MISREAD_RISK"
  | "EXCEPTION_MISPARENT_RISK"
  | "COMPARATOR_DIRECTION_RISK"
  | "UNUSUAL_DEFINITION"
  | "AMBIGUOUS_SOURCE_IDENTITY";

export interface UncertaintyItem {
  id: string;
  sourceId: string;
  candidateId?: string;
  nodeId?: string;
  reasons: UncertaintyReason[];
  excerpt: string;
  suggestedRegression: boolean;
  reviewerTask: boolean;
}

export function buildUncertaintyQueue(input: {
  sources: KnowledgeSourceRecord[];
  candidates: CovenantCandidateRecord[];
  nodesBySource: Map<string, StructuralNodeRecord[]>;
}): UncertaintyItem[] {
  const out: UncertaintyItem[] = [];

  for (const c of input.candidates) {
    const reasons: UncertaintyReason[] = [];
    if (c.families.includes("UNKNOWN")) reasons.push("FAILS_TO_CLASSIFY_COVENANT");
    if (/\b(?:threshold|greater of|lesser of)\b/i.test(c.excerpt) && /\bmay\b/i.test(c.excerpt)) {
      reasons.push("THRESHOLD_VS_PERMISSION_CONFUSION_RISK");
    }
    if (/\b(?:Restricted Subsidiary|Unrestricted Subsidiary|non-Guarantor)\b/i.test(c.excerpt) && !/\bGuarantor\b/i.test(c.excerpt)) {
      reasons.push("ENTITY_SCOPE_UNCLEAR");
    }
    if (/\b(?:Investments?|Restricted Payments?|Junior|Subordinated)\b/i.test(c.excerpt) && !/\b(?:shared|aggregate|combined)\b/i.test(c.excerpt)) {
      if (/\bAvailable Amount\b/i.test(c.excerpt)) reasons.push("SHARED_CAP_MISSED_RISK");
    }
    if (/\bamend/i.test(c.excerpt)) reasons.push("AMENDMENT_MISREAD_RISK");
    if (/\b(?:except|provided that|provided,? however)\b/i.test(c.excerpt)) reasons.push("EXCEPTION_MISPARENT_RISK");
    if (/\b(?:greater|lesser|at least|not less than|not more than)\b/i.test(c.excerpt)) reasons.push("COMPARATOR_DIRECTION_RISK");
    if (reasons.length === 0) continue;
    out.push({
      id: `unc:${c.candidateId}`,
      sourceId: c.sourceId,
      candidateId: c.candidateId,
      nodeId: c.nodeId,
      reasons,
      excerpt: c.excerpt.slice(0, 500),
      suggestedRegression: reasons.includes("FAILS_TO_CLASSIFY_COVENANT") || reasons.includes("SHARED_CAP_MISSED_RISK"),
      reviewerTask: true,
    });
  }

  for (const [sourceId, nodes] of input.nodesBySource) {
    const ambiguous = nodes.filter((n) => n.ambiguous);
    for (const n of ambiguous.slice(0, 20)) {
      out.push({
        id: `unc:amb:${n.nodeId}`,
        sourceId,
        nodeId: n.nodeId,
        reasons: ["AMBIGUOUS_SOURCE_IDENTITY"],
        excerpt: n.heading.slice(0, 500),
        suggestedRegression: true,
        reviewerTask: true,
      });
    }
  }

  for (const s of input.sources) {
    if (s.documentClass === "UNKNOWN") {
      out.push({
        id: `unc:doc:${s.sourceId}`,
        sourceId: s.sourceId,
        reasons: ["FAILS_TO_CLASSIFY_COVENANT"],
        excerpt: s.documentTitle,
        suggestedRegression: true,
        reviewerTask: true,
      });
    }
  }

  return out;
}
