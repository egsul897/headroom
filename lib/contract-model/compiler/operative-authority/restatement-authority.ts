/**
 * Resolve restatement authority from authentic evidence.
 *
 * Rules (fail closed):
 * - A package-graph RESTATES edge that is only SUPPORTING / REVIEW_REQUIRED
 *   is NEVER silently rewritten to RESOLVED here.
 * - Operative §11.01 / NOW THEREFORE restatement language + unique prior
 *   agreement match MAY independently confirm *operative authority* for
 *   Agent #6/#10 consumers without mutating the package graph.
 * - Conditions-precedent satisfaction is never manufactured. When CPs are
 *   stated but not independently proven, effectiveness may be inferred from
 *   dated-as-of + execution signatures only with an explicit caveat.
 * - Wrong facility / borrower mismatches / forks → UNSUPPORTED or AMBIGUOUS.
 */

import type { DocumentIdentity, PackageDocumentInput, PackageGraphResult, RelationshipCandidate } from "../package-graph/types";
import { compareIsoDates, toIsoDate } from "./date-utils";
import { extractRestatementAuthorityEvidence } from "./restatement-evidence";
import type {
  ConditionsPrecedentSatisfaction,
  EffectivenessInference,
  OperativeAuthorityStatus,
  RestatementAuthorityEvidence,
  RestatementAuthorityResolution,
} from "./types";

function restatesEdgesFor(sourceDocumentId: string, graph: PackageGraphResult): RelationshipCandidate[] {
  return graph.relationshipCandidates.filter((r) => r.sourceDocumentId === sourceDocumentId && r.relationshipType === "RESTATES");
}

function pickStrongestRestatesEdge(edges: RelationshipCandidate[]): RelationshipCandidate | null {
  if (edges.length === 0) return null;
  const rank: Record<string, number> = { RESOLVED: 3, REVIEW_REQUIRED: 2, UNRESOLVED: 1 };
  return [...edges].sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0) || b.confidence - a.confidence)[0] ?? null;
}

function hardFacilityMismatch(evidence: RestatementAuthorityEvidence): boolean {
  const fi = evidence.facilityIdentity;
  if (fi.administrativeAgentMatch === false) return true;
  if (fi.revolvingFacilityContinuity === false) return true;
  // Borrower mismatch without continuity signal already recorded in mismatchReasons.
  return fi.mismatchReasons.some((r) => r.startsWith("Borrower/issuer labels differ"));
}

function evaluateAuthority(evidence: RestatementAuthorityEvidence): RestatementAuthorityResolution {
  const reasons: string[] = [];
  const caveats: string[] = [];

  if (!evidence.captionRestatement.present && !evidence.operativeRestatementLanguage.present) {
    return {
      status: "UNSUPPORTED",
      successorDocumentId: evidence.successorDocumentId,
      predecessorDocumentId: evidence.predecessorDocumentId,
      effectiveDateIso: evidence.executionDate.isoDate,
      effectivenessInference: "UNKNOWN",
      conditionsPrecedentSatisfaction: "NOT_APPLICABLE",
      evidence,
      reasons: ["Document lacks both an amended-and-restated caption and operative restatement language."],
      caveats,
      doesNotMutatePackageGraphRelationship: true,
    };
  }

  if (!evidence.predecessorDocumentId) {
    const ambiguous = /Ambiguous prior-agreement match/i.test(
      // recover reason from package graph when present
      evidence.packageGraphUnresolvedReason ?? "",
    );
    return {
      status: ambiguous || (evidence.packageGraphRelationshipStatus === "UNRESOLVED" && /ambiguous/i.test(evidence.packageGraphUnresolvedReason ?? ""))
        ? "AMBIGUOUS"
        : "REVIEW_REQUIRED",
      successorDocumentId: evidence.successorDocumentId,
      predecessorDocumentId: null,
      effectiveDateIso: evidence.executionDate.isoDate,
      effectivenessInference: evidence.executionDate.isoDate ? "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" : "UNKNOWN",
      conditionsPrecedentSatisfaction: evidence.conditionsPrecedent.present ? "NOT_INDEPENDENTLY_PROVEN" : "NOT_STATED",
      evidence,
      reasons: [
        evidence.packageGraphUnresolvedReason ??
          "Prior agreement could not be uniquely resolved inside this package; operative governing document cannot be designated without guessing.",
      ],
      caveats,
      doesNotMutatePackageGraphRelationship: true,
    };
  }

  if (hardFacilityMismatch(evidence)) {
    return {
      status: "UNSUPPORTED",
      successorDocumentId: evidence.successorDocumentId,
      predecessorDocumentId: evidence.predecessorDocumentId,
      effectiveDateIso: evidence.executionDate.isoDate,
      effectivenessInference: "UNKNOWN",
      conditionsPrecedentSatisfaction: evidence.conditionsPrecedent.present ? "NOT_INDEPENDENTLY_PROVEN" : "NOT_STATED",
      evidence,
      reasons: ["Facility / party identity mismatch blocks treating the successor as an operative restatement of the predecessor.", ...evidence.facilityIdentity.mismatchReasons],
      caveats,
      doesNotMutatePackageGraphRelationship: true,
    };
  }

  if (!evidence.operativeRestatementLanguage.present) {
    reasons.push("Prior agreement is uniquely named, but no operative restatement language (NOW THEREFORE / Article restatement section) was found — WHEREAS alone is insufficient.");
    return {
      status: "REVIEW_REQUIRED",
      successorDocumentId: evidence.successorDocumentId,
      predecessorDocumentId: evidence.predecessorDocumentId,
      effectiveDateIso: evidence.executionDate.isoDate,
      effectivenessInference: evidence.executionDate.isoDate ? "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" : "UNKNOWN",
      conditionsPrecedentSatisfaction: evidence.conditionsPrecedent.present ? "NOT_INDEPENDENTLY_PROVEN" : "NOT_STATED",
      evidence,
      reasons,
      caveats: [
        ...caveats,
        "PACKAGE_GRAPH_RELATIONSHIP_NOT_MUTATED",
        evidence.packageGraphEvidenceClass === "SUPPORTING_TARGET_EVIDENCE"
          ? "PACKAGE_GRAPH_RESTATES_REMAINS_SUPPORTING_ONLY"
          : "PACKAGE_GRAPH_STATUS_CONSUMED_AS_IS",
      ],
      doesNotMutatePackageGraphRelationship: true,
    };
  }

  // Authentic operative authority is present.
  reasons.push("Unique prior-agreement match plus operative restatement language establish restatement authority.");
  if (evidence.operativeRestatementLanguage.supersedesEntirety) {
    reasons.push("Operative language states the Existing Credit Agreement is amended, superseded and restated in its entirety.");
  }
  if (evidence.operativeRestatementLanguage.novationDisclaimed) {
    reasons.push("Novation expressly disclaimed — continuity of the same credit facility, not a new unrelated instrument.");
  }
  if (evidence.packageGraphRelationshipStatus && evidence.packageGraphRelationshipStatus !== "RESOLVED") {
    caveats.push("PACKAGE_GRAPH_RESTATES_NOT_RESOLVED");
    caveats.push("ADDITIVE_AUTHORITY_DOES_NOT_REWRITE_PACKAGE_GRAPH");
    reasons.push(
      `Package-graph RESTATES status remains ${evidence.packageGraphRelationshipStatus}` +
        (evidence.packageGraphEvidenceClass ? ` (${evidence.packageGraphEvidenceClass})` : "") +
        "; this additive authority layer confirms operative authority from source text without mutating that edge.",
    );
  }

  let effectivenessInference: EffectivenessInference = "UNKNOWN";
  let conditionsPrecedentSatisfaction: ConditionsPrecedentSatisfaction = "NOT_APPLICABLE";
  let status: OperativeAuthorityStatus = "OPERATIVE_AUTHORITY_CONFIRMED";
  const effectiveDateIso = evidence.executionDate.isoDate;

  if (evidence.conditionsPrecedent.present) {
    conditionsPrecedentSatisfaction = "NOT_INDEPENDENTLY_PROVEN";
    caveats.push("CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN");
    reasons.push(
      `Restatement effectiveness is conditioned on Section ${evidence.conditionsPrecedent.sectionRef ?? "4.01"} conditions precedent; package artifacts do not independently prove each CP was satisfied.`,
    );
  } else {
    conditionsPrecedentSatisfaction = "NOT_STATED";
  }

  if (!evidence.signatureEvidence.present) {
    status = "REVIEW_REQUIRED";
    effectivenessInference = evidence.conditionsPrecedent.present ? "CONDITIONAL_UNRESOLVED" : "UNKNOWN";
    reasons.push("No signature / IN WITNESS WHEREOF execution evidence found in successor text — effectiveness cannot be confirmed.");
  } else if (!effectiveDateIso) {
    status = "REVIEW_REQUIRED";
    effectivenessInference = "UNKNOWN";
    reasons.push("Execution/dated-as-of calendar date could not be established.");
  } else if (evidence.conditionsPrecedent.present) {
    // Honest inference: dated-as-of + executed signatures, with CP caveat retained.
    effectivenessInference = "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION";
    reasons.push("Execution signatures present and dated-as-of known; effectiveness inferred with explicit CP-satisfaction caveat (not manufactured as proven).");
  } else {
    effectivenessInference = "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION";
    reasons.push("Execution signatures present and dated-as-of known; no separate CP clause tied to restatement effectiveness.");
  }

  return {
    status,
    successorDocumentId: evidence.successorDocumentId,
    predecessorDocumentId: evidence.predecessorDocumentId,
    effectiveDateIso,
    effectivenessInference,
    conditionsPrecedentSatisfaction,
    evidence,
    reasons,
    caveats,
    doesNotMutatePackageGraphRelationship: true,
  };
}

export interface ResolvePackageRestatementAuthorityInput {
  documents: PackageDocumentInput[];
  packageGraph: PackageGraphResult;
  /** Optional override map successorId → predecessorId (tests / confirmed identity). */
  predecessorOverrides?: Record<string, string>;
}

/**
 * Evaluate restatement authority for every amended-and-restated (or
 * restatement-shaped) document in the package.
 */
export function resolvePackageRestatementAuthorities(
  input: ResolvePackageRestatementAuthorityInput,
): RestatementAuthorityResolution[] {
  const byId = new Map(input.documents.map((d) => [d.documentId, d] as const));
  const identityById = new Map(input.packageGraph.identities.map((i) => [i.documentId, i] as const));
  const out: RestatementAuthorityResolution[] = [];

  for (const classification of input.packageGraph.classifications) {
    const isRestatement =
      classification.type === "AMENDED_AND_RESTATED_AGREEMENT" ||
      restatesEdgesFor(classification.documentId, input.packageGraph).length > 0;
    if (!isRestatement) continue;

    const doc = byId.get(classification.documentId);
    if (!doc) continue;

    const edge = pickStrongestRestatesEdge(restatesEdgesFor(classification.documentId, input.packageGraph));
    const overridePred = input.predecessorOverrides?.[classification.documentId];
    const predecessorDocumentId = overridePred ?? edge?.targetDocumentId ?? undefined;
    const predecessorText = predecessorDocumentId ? byId.get(predecessorDocumentId)?.text : undefined;
    const predecessorIdentity: DocumentIdentity | undefined = predecessorDocumentId
      ? identityById.get(predecessorDocumentId)
      : undefined;

    const evidence = extractRestatementAuthorityEvidence({
      successorDocumentId: classification.documentId,
      successorText: doc.text,
      successorIdentity: identityById.get(classification.documentId),
      predecessorDocumentId,
      predecessorText,
      predecessorIdentity,
      packageIdentities: input.packageGraph.identities,
      packageGraphRestatesEdge: edge,
    });

    // If package graph named a target but evidence extraction found a different unique recital target, refuse rather than silently prefer one.
    if (
      edge?.targetDocumentId &&
      evidence.predecessorDocumentId &&
      edge.targetDocumentId !== evidence.predecessorDocumentId
    ) {
      out.push({
        status: "AMBIGUOUS",
        successorDocumentId: evidence.successorDocumentId,
        predecessorDocumentId: null,
        effectiveDateIso: evidence.executionDate.isoDate,
        effectivenessInference: "UNKNOWN",
        conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN",
        evidence: { ...evidence, predecessorDocumentId: null },
        reasons: [
          `Conflicting amendment targets: package-graph RESTATES names ${edge.targetDocumentId} while recital evidence uniquely matches ${evidence.predecessorDocumentId}.`,
        ],
        caveats: ["PACKAGE_GRAPH_RELATIONSHIP_NOT_MUTATED"],
        doesNotMutatePackageGraphRelationship: true,
      });
      continue;
    }

    out.push(evaluateAuthority(evidence));
  }

  // Deterministic order for replay.
  out.sort((a, b) => a.successorDocumentId.localeCompare(b.successorDocumentId));
  return out;
}

/**
 * Apply as-of dating to a confirmed restatement authority.
 * Pre-effective → NOT_YET_EFFECTIVE (authority exists; does not yet govern).
 */
export function authorityAsOf(
  resolution: RestatementAuthorityResolution,
  asOfDateIso: string,
): RestatementAuthorityResolution {
  if (resolution.status !== "OPERATIVE_AUTHORITY_CONFIRMED") return resolution;
  if (!resolution.effectiveDateIso) {
    return {
      ...resolution,
      status: "REVIEW_REQUIRED",
      reasons: [...resolution.reasons, "Confirmed restatement authority lacks an establishable effective date for as-of comparison."],
    };
  }
  if (compareIsoDates(asOfDateIso, resolution.effectiveDateIso) < 0) {
    return {
      ...resolution,
      status: "NOT_YET_EFFECTIVE",
      reasons: [
        ...resolution.reasons,
        `As-of ${asOfDateIso} is before inferred/stated effective date ${resolution.effectiveDateIso}; predecessor remains governing.`,
      ],
    };
  }
  return resolution;
}

export function parseAsOfDate(asOfDate: string): string | null {
  return toIsoDate(asOfDate) ?? (/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : null);
}
