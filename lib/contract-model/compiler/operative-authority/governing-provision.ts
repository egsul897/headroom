/**
 * Provision-level governing-document resolution as of a query date.
 *
 * Supports original agreements, full restatements, partial restatements,
 * amendments, supplements, waivers, and side letters — failing closed to
 * REVIEW_REQUIRED / AMBIGUOUS / UNSUPPORTED when legal authority cannot
 * be established from authentic evidence.
 */

import { compareIsoDates } from "./date-utils";
import { authorityAsOf, parseAsOfDate } from "./restatement-authority";
import type {
  ConfirmedInstrumentIdentityView,
  GoverningAuthorityClassification,
  GoverningInstrumentLink,
  GoverningProvisionResolution,
  InstrumentRole,
  RestatementAuthorityResolution,
} from "./types";

export interface AmendmentLikeAuthority {
  documentId: string;
  role: Exclude<InstrumentRole, "ORIGINAL_AGREEMENT" | "RESTATEMENT" | "UNKNOWN">;
  /** ISO date when the instrument becomes effective; null → REVIEW_REQUIRED. */
  effectiveDateIso: string | null;
  /** Null / empty = whole-document effect (rare for amendments); otherwise targeted provisions. */
  targetSectionRefs: string[] | null;
  targetDefinedTermRefs: string[] | null;
  targetDocumentId: string | null;
  status: "RESOLVED" | "REVIEW_REQUIRED" | "UNRESOLVED" | "AMBIGUOUS";
  reason?: string;
}

export interface ResolveGoverningProvisionInput {
  asOfDate: string;
  sectionRef?: string | null;
  definedTermRef?: string | null;
  /** Document ids that belong to the instrument family under query (confirmed when available). */
  instrumentDocumentIds: string[];
  /** Chronological base / original document for the facility when known. */
  baseDocumentId: string | null;
  restatementAuthorities: RestatementAuthorityResolution[];
  amendmentLikeAuthorities?: AmendmentLikeAuthority[];
  confirmedInstrumentIdentity?: ConfirmedInstrumentIdentityView | null;
}

function provisionKey(sectionRef: string | null | undefined, definedTermRef: string | null | undefined): {
  key: string;
  kind: GoverningProvisionResolution["kind"];
} {
  if (sectionRef) return { key: `SECTION::${sectionRef}`, kind: "SECTION" };
  if (definedTermRef) return { key: `DEFINITION::${definedTermRef}`, kind: "DEFINITION" };
  return { key: "WHOLE_AGREEMENT", kind: "WHOLE_AGREEMENT" };
}

function targetsProvision(a: AmendmentLikeAuthority, sectionRef: string | null, definedTermRef: string | null): boolean {
  if (a.targetSectionRefs == null && a.targetDefinedTermRefs == null) return true; // whole-doc style
  if (sectionRef && a.targetSectionRefs?.includes(sectionRef)) return true;
  if (definedTermRef && a.targetDefinedTermRefs?.includes(definedTermRef)) return true;
  return false;
}

function roleForDocument(
  documentId: string,
  restatements: RestatementAuthorityResolution[],
  amendments: AmendmentLikeAuthority[],
  baseDocumentId: string | null,
): InstrumentRole {
  if (restatements.some((r) => r.successorDocumentId === documentId)) return "RESTATEMENT";
  const am = amendments.find((a) => a.documentId === documentId);
  if (am) return am.role;
  if (baseDocumentId === documentId) return "ORIGINAL_AGREEMENT";
  if (restatements.some((r) => r.predecessorDocumentId === documentId)) return "RESTATEMENT";
  return "UNKNOWN";
}

/**
 * Resolve which document's text governs a provision as of the query date.
 */
export function resolveGoverningProvision(input: ResolveGoverningProvisionInput): GoverningProvisionResolution {
  const asOf = parseAsOfDate(input.asOfDate);
  const { key, kind } = provisionKey(input.sectionRef, input.definedTermRef);
  const sectionRef = input.sectionRef ?? null;
  const definedTermRef = input.definedTermRef ?? null;
  const amendments = input.amendmentLikeAuthorities ?? [];
  const unresolvedConflicts: string[] = [];
  const caveats: string[] = [];
  const reasons: string[] = [];

  if (!asOf) {
    return {
      asOfDate: input.asOfDate,
      provisionKey: key,
      kind,
      sectionRef,
      definedTermRef,
      authorityClassification: "REVIEW_REQUIRED",
      governingDocumentId: null,
      supersededDocumentIds: [],
      instrumentLinks: [],
      applicableAuthorityChain: [],
      unresolvedConflicts: [`asOfDate "${input.asOfDate}" is not a parseable ISO/calendar date.`],
      caveats,
      reasons: ["Cannot compare effectiveness without a parseable as-of date."],
      provenance: {
        usedConfirmedInstrumentIdentity: false,
        packageGraphRestatesStatus: null,
        effectivenessInference: null,
        conditionsPrecedentSatisfaction: null,
      },
    };
  }

  const identity = input.confirmedInstrumentIdentity ?? null;
  if (identity && !identity.mayConsolidateOperative) {
    return {
      asOfDate: asOf,
      provisionKey: key,
      kind,
      sectionRef,
      definedTermRef,
      authorityClassification: "PROVISIONAL_IDENTITY_BLOCKED",
      governingDocumentId: null,
      supersededDocumentIds: [],
      instrumentLinks: input.instrumentDocumentIds.map((documentId) => ({
        documentId,
        role: roleForDocument(documentId, input.restatementAuthorities, amendments, input.baseDocumentId),
        relationshipToGoverning: "INAPPLICABLE",
        restatementAuthorityStatus: input.restatementAuthorities.find((r) => r.successorDocumentId === documentId)?.status ?? null,
      })),
      applicableAuthorityChain: [],
      unresolvedConflicts: [
        "Canonical instrument identity is not confirmed; provisional associations cannot authorize operative consolidation.",
        ...(identity.bridgeBlockers ?? []).map((b) => `${b.sourceDocumentId}→${b.targetDocumentId}: ${b.reason}`),
      ],
      caveats: ["CONSUMED_CONFIRMED_IDENTITY_FROM_HEADROOM_3"],
      reasons: ["Fail closed on provisional instrument identity (#274 contract)."],
      provenance: {
        usedConfirmedInstrumentIdentity: true,
        packageGraphRestatesStatus: null,
        effectivenessInference: null,
        conditionsPrecedentSatisfaction: null,
      },
    };
  }

  // Restrict to instrument family; when confirmed identity is present, use confirmed ids only.
  const familyIds = new Set(
    identity ? identity.confirmedDocumentIds : input.instrumentDocumentIds,
  );

  const datedRestatements = input.restatementAuthorities
    .filter((r) => familyIds.has(r.successorDocumentId) || (r.predecessorDocumentId != null && familyIds.has(r.predecessorDocumentId)))
    .map((r) => authorityAsOf(r, asOf));

  // Conflicting full restatements effective same day / forks.
  const effectiveFull = datedRestatements.filter(
    (r) =>
      r.status === "OPERATIVE_AUTHORITY_CONFIRMED" &&
      r.evidence.restatementScope === "FULL_AGREEMENT" &&
      r.effectiveDateIso != null &&
      compareIsoDates(r.effectiveDateIso, asOf) <= 0,
  );
  if (effectiveFull.length > 1) {
    // Keep only the latest effectiveDate; if tie → AMBIGUOUS.
    effectiveFull.sort((a, b) => compareIsoDates(b.effectiveDateIso!, a.effectiveDateIso!));
    const latest = effectiveFull[0]!.effectiveDateIso!;
    const tied = effectiveFull.filter((r) => r.effectiveDateIso === latest);
    if (tied.length > 1) {
      return {
        asOfDate: asOf,
        provisionKey: key,
        kind,
        sectionRef,
        definedTermRef,
        authorityClassification: "AMBIGUOUS",
        governingDocumentId: null,
        supersededDocumentIds: [],
        instrumentLinks: [],
        applicableAuthorityChain: tied,
        unresolvedConflicts: [
          `Multiple full restatements claim operative effect on ${latest}: ${tied.map((t) => t.successorDocumentId).join(", ")}.`,
        ],
        caveats,
        reasons: ["Conflicting restatement authorities — refuse to guess which governs."],
        provenance: {
          usedConfirmedInstrumentIdentity: !!identity,
          packageGraphRestatesStatus: tied[0]?.evidence.packageGraphRelationshipStatus ?? null,
          effectivenessInference: tied[0]?.effectivenessInference ?? null,
          conditionsPrecedentSatisfaction: tied[0]?.conditionsPrecedentSatisfaction ?? null,
        },
      };
    }
  }

  // Choose governing restatement: latest confirmed full restatement as of date,
  // else latest confirmed partial that targets this provision.
  let governingRestatement: RestatementAuthorityResolution | null = null;
  const confirmedAsOf = datedRestatements
    .filter((r) => r.status === "OPERATIVE_AUTHORITY_CONFIRMED" && r.effectiveDateIso && compareIsoDates(r.effectiveDateIso, asOf) <= 0)
    .sort((a, b) => compareIsoDates(b.effectiveDateIso!, a.effectiveDateIso!));

  for (const r of confirmedAsOf) {
    if (r.evidence.restatementScope === "FULL_AGREEMENT") {
      governingRestatement = r;
      break;
    }
    if (
      r.evidence.restatementScope === "PARTIAL_PROVISIONS" &&
      sectionRef &&
      r.evidence.partialProvisionRefs.includes(sectionRef)
    ) {
      governingRestatement = r;
      break;
    }
  }

  // Surface review-required / ambiguous authorities that would otherwise silently drop.
  // CRITICAL: predecessorDocumentId may be null when prior-agreement identity is unresolved
  // (AutoNation Fourth A&R absent). That MUST still block CONFIRMED_OPERATIVE fallback onto
  // baseDocumentId — otherwise superseded/uncertain predecessors are falsely promoted.
  for (const r of datedRestatements) {
    if (r.status === "AMBIGUOUS") {
      unresolvedConflicts.push(`Restatement authority AMBIGUOUS for ${r.successorDocumentId}: ${r.reasons.join(" ")}`);
    }
    if (
      (r.status === "REVIEW_REQUIRED" || r.status === "UNSUPPORTED") &&
      familyIds.has(r.successorDocumentId)
    ) {
      if (!governingRestatement) {
        const predNote =
          r.predecessorDocumentId == null
            ? " (predecessor identity unresolved — refuse base CONFIRMED_OPERATIVE fallback)"
            : "";
        unresolvedConflicts.push(
          `Restatement authority ${r.status} for ${r.successorDocumentId}: ${r.reasons.join(" ")}${predNote}`,
        );
      } else {
        caveats.push(`NON_BLOCKING_REVIEW_ITEM:${r.successorDocumentId}`);
      }
    }
    caveats.push(...r.caveats.map((c) => `${r.successorDocumentId}:${c}`));
  }

  // Amendment-like overlays (amendments / waivers / supplements / side letters).
  const applicableAmendments = amendments.filter((a) => {
    if (a.status === "UNRESOLVED" || a.status === "AMBIGUOUS") {
      unresolvedConflicts.push(`${a.role} ${a.documentId}: ${a.reason ?? a.status}`);
      return false;
    }
    if (a.status === "REVIEW_REQUIRED") {
      unresolvedConflicts.push(`${a.role} ${a.documentId} is REVIEW_REQUIRED: ${a.reason ?? "insufficient authority evidence"}`);
      return false;
    }
    if (!a.effectiveDateIso) {
      unresolvedConflicts.push(`${a.role} ${a.documentId} missing effective date.`);
      return false;
    }
    if (compareIsoDates(a.effectiveDateIso, asOf) > 0) return false;
    if (!targetsProvision(a, sectionRef, definedTermRef)) return false;
    // Must target the current governing document or its predecessor chain.
    return true;
  });

  // Conflicting same-date amendments to the same provision.
  const byDate = new Map<string, AmendmentLikeAuthority[]>();
  for (const a of applicableAmendments) {
    const list = byDate.get(a.effectiveDateIso!) ?? [];
    list.push(a);
    byDate.set(a.effectiveDateIso!, list);
  }
  for (const [date, list] of byDate) {
    if (list.length > 1) {
      unresolvedConflicts.push(
        `Conflicting ${list.map((x) => x.role).join("/")} instruments effective ${date} target the same provision: ${list.map((x) => x.documentId).join(", ")}.`,
      );
    }
  }

  if (unresolvedConflicts.some((c) => /Conflicting/.test(c) || /AMBIGUOUS/.test(c)) && !governingRestatement) {
    return {
      asOfDate: asOf,
      provisionKey: key,
      kind,
      sectionRef,
      definedTermRef,
      authorityClassification: "AMBIGUOUS",
      governingDocumentId: null,
      supersededDocumentIds: [],
      instrumentLinks: [],
      applicableAuthorityChain: datedRestatements,
      unresolvedConflicts,
      caveats,
      reasons: ["Authority conflicts prevent designating a governing document."],
      provenance: {
        usedConfirmedInstrumentIdentity: !!identity,
        packageGraphRestatesStatus: null,
        effectivenessInference: null,
        conditionsPrecedentSatisfaction: null,
      },
    };
  }

  // Unresolved *current* succession candidates (not the base itself, not clearly future).
  // A REVIEW_REQUIRED Fifth A&R with null predecessor and effectiveDate <= asOf must block
  // CONFIRMED_OPERATIVE fallback onto doc-a. A NOT_YET_EFFECTIVE successor must NOT block —
  // predecessor remains governing under NOT_YET_EFFECTIVE.
  const unresolvedCurrentSuccessors = datedRestatements.filter((r) => {
    if (!familyIds.has(r.successorDocumentId)) return false;
    if (input.baseDocumentId && r.successorDocumentId === input.baseDocumentId) return false;
    if (r.status === "NOT_YET_EFFECTIVE" || r.status === "OPERATIVE_AUTHORITY_CONFIRMED") return false;
    if (r.status !== "REVIEW_REQUIRED" && r.status !== "AMBIGUOUS" && r.status !== "UNSUPPORTED") {
      return false;
    }
    if (r.effectiveDateIso == null) return true; // uncertain dating → block
    return compareIsoDates(r.effectiveDateIso, asOf) <= 0;
  });

  // Fail closed when a later/current restatement candidate's succession is unresolved.
  if (!governingRestatement && unresolvedCurrentSuccessors.length > 0) {
    return {
      asOfDate: asOf,
      provisionKey: key,
      kind,
      sectionRef,
      definedTermRef,
      authorityClassification: "REVIEW_REQUIRED",
      governingDocumentId: null,
      supersededDocumentIds: [],
      instrumentLinks: [...familyIds].sort().map((documentId) => ({
        documentId,
        role: roleForDocument(documentId, input.restatementAuthorities, amendments, input.baseDocumentId),
        relationshipToGoverning: "INAPPLICABLE" as const,
        restatementAuthorityStatus:
          datedRestatements.find((r) => r.successorDocumentId === documentId)?.status ?? null,
      })),
      applicableAuthorityChain: datedRestatements,
      unresolvedConflicts,
      caveats,
      reasons: [
        "Restatement succession is unresolved — refuse CONFIRMED_OPERATIVE on base or successor; governing-document identity remains uncertain.",
        `Unresolved successor candidate(s): ${unresolvedCurrentSuccessors.map((r) => r.successorDocumentId).join(", ")}.`,
        ...(input.baseDocumentId
          ? [`Base document ${input.baseDocumentId} is NOT confirmed as operative while succession review is outstanding.`]
          : ["No confirmed restatement authority and no base document — refuse."]),
      ],
      provenance: {
        usedConfirmedInstrumentIdentity: !!identity,
        packageGraphRestatesStatus: datedRestatements[0]?.evidence.packageGraphRelationshipStatus ?? null,
        effectivenessInference: datedRestatements[0]?.effectivenessInference ?? null,
        conditionsPrecedentSatisfaction: datedRestatements[0]?.conditionsPrecedentSatisfaction ?? null,
      },
    };
  }

  if (!governingRestatement && unresolvedConflicts.length > 0 && !input.baseDocumentId) {
    return {
      asOfDate: asOf,
      provisionKey: key,
      kind,
      sectionRef,
      definedTermRef,
      authorityClassification: "REVIEW_REQUIRED",
      governingDocumentId: null,
      supersededDocumentIds: [],
      instrumentLinks: [],
      applicableAuthorityChain: datedRestatements,
      unresolvedConflicts,
      caveats,
      reasons: ["No confirmed restatement authority and no base document — refuse."],
      provenance: {
        usedConfirmedInstrumentIdentity: !!identity,
        packageGraphRestatesStatus: datedRestatements[0]?.evidence.packageGraphRelationshipStatus ?? null,
        effectivenessInference: datedRestatements[0]?.effectivenessInference ?? null,
        conditionsPrecedentSatisfaction: datedRestatements[0]?.conditionsPrecedentSatisfaction ?? null,
      },
    };
  }

  // Determine governing document id.
  let governingDocumentId: string | null = null;
  let authorityClassification: GoverningAuthorityClassification = "REVIEW_REQUIRED";
  const supersededDocumentIds: string[] = [];

  if (governingRestatement) {
    governingDocumentId = governingRestatement.successorDocumentId;
    if (governingRestatement.predecessorDocumentId) supersededDocumentIds.push(governingRestatement.predecessorDocumentId);
    authorityClassification =
      governingRestatement.caveats.includes("CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN") ||
      governingRestatement.conditionsPrecedentSatisfaction === "NOT_INDEPENDENTLY_PROVEN"
        ? "CONFIRMED_OPERATIVE_WITH_CAVEATS"
        : "CONFIRMED_OPERATIVE";
    reasons.push(`Full/partial restatement ${governingRestatement.successorDocumentId} governs as of ${asOf}.`);
    reasons.push(...governingRestatement.reasons);
  } else {
    // Check whether a future restatement exists (not yet effective).
    const future = datedRestatements.find((r) => r.status === "NOT_YET_EFFECTIVE");
    governingDocumentId = input.baseDocumentId;
    if (future && input.baseDocumentId) {
      authorityClassification = "NOT_YET_EFFECTIVE";
      reasons.push(
        `Restatement ${future.successorDocumentId} is not yet effective as of ${asOf}; base/predecessor ${input.baseDocumentId} remains governing.`,
      );
    } else if (input.baseDocumentId) {
      // Only when no unresolved *current* successor restatement exists.
      authorityClassification = "CONFIRMED_OPERATIVE";
      reasons.push(`No effective restatement as of ${asOf}; base document ${input.baseDocumentId} governs.`);
    } else {
      authorityClassification = "UNSUPPORTED";
      reasons.push("No base document and no effective restatement authority.");
    }
  }

  // Apply latest non-conflicting amendment-like overlay onto governing doc.
  if (governingDocumentId && applicableAmendments.length > 0 && !unresolvedConflicts.some((c) => /Conflicting/.test(c))) {
    applicableAmendments.sort((a, b) => compareIsoDates(a.effectiveDateIso!, b.effectiveDateIso!));
    const last = applicableAmendments[applicableAmendments.length - 1]!;
    // Waivers / side letters / supplements never replace the whole governing agreement identity —
    // they remain overlays; governing document stays the agreement, with chain noting the overlay.
    if (last.role === "AMENDMENT" && last.targetSectionRefs != null) {
      reasons.push(`Amendment ${last.documentId} overlays ${sectionRef ?? definedTermRef ?? "provision"} as of ${last.effectiveDateIso}.`);
      caveats.push(`AMENDMENT_OVERLAY:${last.documentId}`);
    } else if (last.role === "WAIVER" || last.role === "SIDE_LETTER") {
      reasons.push(`${last.role} ${last.documentId} applies provisionally to this provision; does not supersede whole agreement.`);
      caveats.push(`${last.role}_OVERLAY:${last.documentId}`);
    } else if (last.role === "SUPPLEMENT") {
      reasons.push(`Supplement ${last.documentId} applies to targeted provisions only.`);
      caveats.push(`SUPPLEMENT_OVERLAY:${last.documentId}`);
    }
  }

  if (unresolvedConflicts.some((c) => /Conflicting/.test(c))) {
    authorityClassification = "AMBIGUOUS";
    governingDocumentId = null;
  }

  const instrumentLinks: GoverningInstrumentLink[] = [...familyIds].sort().map((documentId) => {
    const rest = datedRestatements.find((r) => r.successorDocumentId === documentId);
    let relationship: GoverningInstrumentLink["relationshipToGoverning"] = "INAPPLICABLE";
    if (governingDocumentId && documentId === governingDocumentId) relationship = "GOVERNING";
    else if (supersededDocumentIds.includes(documentId)) relationship = "SUPERSEDED_PREDECESSOR";
    else if (rest?.status === "NOT_YET_EFFECTIVE") relationship = "NOT_YET_EFFECTIVE_SUCCESSOR";
    else if (rest?.status === "AMBIGUOUS") relationship = "CONFLICTING";
    return {
      documentId,
      role: roleForDocument(documentId, input.restatementAuthorities, amendments, input.baseDocumentId),
      relationshipToGoverning: relationship,
      restatementAuthorityStatus: rest?.status ?? null,
    };
  });

  return {
    asOfDate: asOf,
    provisionKey: key,
    kind,
    sectionRef,
    definedTermRef,
    authorityClassification,
    governingDocumentId,
    supersededDocumentIds: [...new Set(supersededDocumentIds)],
    instrumentLinks,
    applicableAuthorityChain: datedRestatements,
    unresolvedConflicts,
    caveats: [...new Set(caveats)],
    reasons,
    provenance: {
      usedConfirmedInstrumentIdentity: !!identity,
      packageGraphRestatesStatus: governingRestatement?.evidence.packageGraphRelationshipStatus ?? datedRestatements[0]?.evidence.packageGraphRelationshipStatus ?? null,
      effectivenessInference: governingRestatement?.effectivenessInference ?? null,
      conditionsPrecedentSatisfaction: governingRestatement?.conditionsPrecedentSatisfaction ?? null,
    },
  };
}
