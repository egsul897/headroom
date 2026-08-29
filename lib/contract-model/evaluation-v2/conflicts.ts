/**
 * Evaluation Methodology V2 — Layer 3: contradiction / omission checks.
 *
 * Phase 3F.1.5. Runs even for a candidate that already looks like a partial
 * match. A conflict here is never averaged away into a similarity score: each
 * finding is a first-class record with its own code, severity, dimension and
 * the raw evidence from both sides.
 *
 * Severity vocabulary (types.ts):
 *   MATERIAL_CONFLICT          — the candidate asserts something the ground
 *                                truth contradicts. Blocks credit outright.
 *   MISSING_REQUIRED_DIMENSION — the ground truth asserts something material
 *                                the candidate is silent on. Caps credit at
 *                                PARTIAL.
 *   NON_MATERIAL_VARIANCE      — a real but non-controlling difference.
 */
import { compareClaimIdentity } from "./claim-identity";
import { figuresEquivalent, jaccard, overlapDetail, postureClass } from "./signals";
import type { ProvisionBreadth } from "./signals";
import type {
  CandidateSemanticRepresentation,
  ConflictFinding,
  ConflictSeverity,
  GroundTruthSemanticUnit,
  NumericComparisonRecord,
  NumericFigure,
  SemanticSignals,
} from "./types";

/**
 * Content-vocabulary thresholds for the object/resource dimension. Below the
 * material threshold the two provisions are about different things; at or above
 * the correspondence threshold the object dimension is affirmatively satisfied;
 * in between the evidence is real but thin and the dimension stays
 * INDETERMINATE (which withholds credit rather than granting it).
 */
export const OBJECT_MATERIAL_CONFLICT_THRESHOLD = 0.12;
export const OBJECT_CORRESPONDENCE_THRESHOLD = 0.3;
/** Absolute floors that stop a very short candidate from scoring a high coefficient on two incidental words. */
export const MIN_SHARED_TERMS_FOR_CORRESPONDENCE = 4;
export const MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT = 3;
/**
 * SAFE_SURFACING_REQUIRES_SEMANTIC_CORRESPONDENCE (Phase 3F.1.5.2): when the
 * ground truth's action signal is empty, A_SUBJECT_ACTION is NOT_APPLICABLE
 * for every candidate and supplies no discriminating evidence — object/
 * resource lexical overlap becomes the SOLE dimension deciding whether a
 * candidate is even about the claim. A materially higher bar applies in that
 * scenario, and the family-assisted lower threshold is not available (a
 * shared covenant family is not independent corroboration when nothing else
 * is corroborating either). Calibrated from the forensically-confirmed
 * false-safe-surfacing cluster and definitional-candidate over-match defect —
 * see docs/evaluation-v2-iteration-2/02-safe-surfacing-correspondence-spec.json.
 */
export const SOLE_DIMENSION_OBJECT_THRESHOLD = 0.5;
export const SOLE_DIMENSION_MIN_SHARED_TERMS = 6;

/** Conditions whose absence changes what is actually permitted, not merely how it is described. */
const MATERIAL_CONDITIONS = new Set([
  "NO_DEFAULT",
  "PAYMENT_CONDITIONS",
  "PRO_FORMA_COMPLIANCE",
  "RATIO_SATISFIED",
  "AVAILABILITY_TEST",
  "SUBORDINATION_REQUIRED",
  "CASH_CONSIDERATION_MINIMUM",
]);

/** Exceptions whose absence changes the scope of the restriction. */
const MATERIAL_EXCEPTIONS = new Set(["ORDINARY_COURSE", "NOTWITHSTANDING_OVERRIDE", "PERMITTED_ACQUISITION_CARVEOUT", "INTERCOMPANY_CARVEOUT"]);

/** Entity scopes that are mutually exclusive as drafted — pairing either one against the other is a real scope error. */
const MUTUALLY_EXCLUSIVE_SCOPES: ReadonlyArray<readonly [string, string]> = [
  ["US_ENTITY_ONLY", "CANADIAN_ENTITY"],
  ["US_ENTITY_ONLY", "FOREIGN_SUBSIDIARY"],
  ["RESTRICTED_SUBSIDIARY", "UNRESTRICTED_SUBSIDIARY"],
  ["LOAN_PARTY", "NON_LOAN_PARTY_SUBSIDIARY"],
];

/** Instrument distinctions that change the legal effect of an otherwise identical permission. */
const MUTUALLY_EXCLUSIVE_INSTRUMENTS: ReadonlyArray<readonly [string, string]> = [
  ["SECURED", "UNSECURED"],
  ["FIRST_LIEN", "SECOND_LIEN"],
  ["SENIOR", "SUBORDINATED"],
  ["SENIOR", "JUNIOR"],
  ["REVOLVING", "TERM_LOAN"],
];

/**
 * Breadth pairs that are outright incompatible. UNIVERSAL vs NARROW is the
 * historically-confirmed false-credit vector; DEFINITIONAL vs either is a
 * category error (a calculation rule is not an operative restriction).
 * INDETERMINATE on either side yields no conflict — the evaluator withholds
 * judgment rather than inventing one, and the core dimensions still have to
 * correspond for credit.
 */
export function breadthConflictSeverity(gt: ProvisionBreadth, candidate: ProvisionBreadth): ConflictSeverity | null {
  if (gt === "INDETERMINATE_BREADTH" || candidate === "INDETERMINATE_BREADTH") return null;
  if (gt === candidate) return null;
  const hard: ReadonlyArray<readonly [ProvisionBreadth, ProvisionBreadth]> = [
    ["UNIVERSAL_RESTRICTION", "NARROW_CARVEOUT"],
    ["UNIVERSAL_RESTRICTION", "DEFINITIONAL"],
    ["NARROW_CARVEOUT", "DEFINITIONAL"],
    ["SPECIFIC_OBLIGATION", "DEFINITIONAL"],
  ];
  for (const [a, b] of hard) {
    if ((gt === a && candidate === b) || (gt === b && candidate === a)) return "MATERIAL_CONFLICT";
  }
  return "NON_MATERIAL_VARIANCE";
}

export interface ConflictInput {
  gt: GroundTruthSemanticUnit;
  candidate: CandidateSemanticRepresentation;
  gtSignals: SemanticSignals;
  candidateSignals: SemanticSignals;
}

export interface ConflictResult {
  conflicts: ConflictFinding[];
  numericComparisons: NumericComparisonRecord[];
}

function excerptOf(candidate: CandidateSemanticRepresentation): string {
  const raw = candidate.excerpts.find((e) => e.trim().length > 0);
  return (raw ?? candidate.normalizedSemantics ?? "").slice(0, 400);
}

export function detectConflicts(input: ConflictInput): ConflictResult {
  const { gt, candidate, gtSignals, candidateSignals } = input;
  const conflicts: ConflictFinding[] = [];
  const numericComparisons: NumericComparisonRecord[] = [];
  const gtEvidence = (gt.sourceExcerpt || gt.semanticDescription).slice(0, 400);
  const candEvidence = excerptOf(candidate);

  const push = (f: Omit<ConflictFinding, "groundTruthEvidence" | "candidateEvidence"> & Partial<Pick<ConflictFinding, "groundTruthEvidence" | "candidateEvidence">>) => {
    conflicts.push({
      groundTruthEvidence: f.groundTruthEvidence ?? gtEvidence,
      candidateEvidence: f.candidateEvidence ?? candEvidence,
      ...f,
    } as ConflictFinding);
  };

  // --- A. Subject / action --------------------------------------------------
  const gtActions = gt.action.length > 0 ? gt.action : gtSignals.actions;
  const candActions = candidate.action.length > 0 ? candidate.action : candidateSignals.actions;
  if (gtActions.length > 0) {
    if (candActions.length === 0) {
      push({
        code: "WRONG_ACTION",
        severity: "MISSING_REQUIRED_DIMENSION",
        dimension: "A_SUBJECT_ACTION",
        explanation: `Ground truth governs [${gtActions.join(", ")}]; the candidate names no governed action at all.`,
      });
    } else if (!gtActions.some((a) => candActions.includes(a))) {
      push({
        code: "WRONG_ACTION",
        severity: "MATERIAL_CONFLICT",
        dimension: "A_SUBJECT_ACTION",
        explanation: `Ground truth governs [${gtActions.join(", ")}]; the candidate governs [${candActions.join(", ")}] — disjoint sets, so the candidate is about a different transaction.`,
      });
    }
  }

  // --- B. Legal posture -----------------------------------------------------
  const gtPosture = gt.legalPosture;
  const candPosture = candidate.legalPosture;
  if (gtPosture !== "UNDETERMINED" && candPosture !== "UNDETERMINED" && gtPosture !== candPosture) {
    const gtClass = postureClass(gtPosture);
    const candClass = postureClass(candPosture);
    const inverted = (gtClass === "RESTRICTIVE" && candClass === "PERMISSIVE") || (gtClass === "PERMISSIVE" && candClass === "RESTRICTIVE");
    push({
      code: "INVERTED_LEGAL_POSTURE",
      severity: inverted ? "MATERIAL_CONFLICT" : "NON_MATERIAL_VARIANCE",
      dimension: "B_LEGAL_POSTURE",
      explanation:
        `Ground truth posture is ${gtPosture} (${gtClass}); candidate posture is ${candPosture} (${candClass}).` +
        (inverted ? " A permission does not represent a restriction, and a restriction does not represent one of its permissions — they are opposite legal claims over the same subject." : ""),
    });
  }

  // --- H. Provision breadth ------------------------------------------------
  // A universal restriction and one enumerated carve-out under it are different
  // legal claims. This is the general rule that makes descendant-union credit
  // impossible, and it is keyed to drafting shape, never to a section number.
  const breadthSeverity = breadthConflictSeverity(gt.provisionBreadth, candidate.provisionBreadth);
  if (breadthSeverity) {
    push({
      code: "SCOPE_BREADTH_MISMATCH",
      severity: breadthSeverity,
      dimension: "H_PROVISION_ROLE_BREADTH",
      explanation:
        `Ground truth breadth is ${gt.provisionBreadth} (role ${gt.provisionRole}); candidate breadth is ${candidate.provisionBreadth} (role ${candidate.provisionRole}).` +
        (breadthSeverity === "MATERIAL_CONFLICT"
          ? " A narrow enumerated carve-out does not represent the universal restriction it sits under, and vice versa — the claims differ in breadth and legal effect even when they share a section, a family, a governed action and most of their vocabulary."
          : ""),
    });
  }

  // --- I. Claim identity (sibling sub-provision) ----------------------------
  // Phase 3F.1.5.3, Workstream A: SAME_COVENANT_FAMILY_IS_NOT_SAME_SEMANTIC_CLAIM.
  // Two candidates anchored under the identical parent section but at
  // DIFFERENT enumerated sub-items (e.g. 6.02(h) vs 6.02(d)) are siblings, not
  // the same claim, no matter how much genuine covenant-family vocabulary they
  // share. This is purely structural (parsed section-reference shape via
  // splitSectionRef, already used and tested for DSGR excerpt resolution) —
  // it carries no package, document, or term-specific knowledge. Recorded as
  // NON_MATERIAL_VARIANCE (not MATERIAL_CONFLICT): semantic-correspondence.ts
  // routes this pair to INDETERMINATE for semantic-judge review rather than
  // outright rejecting it, since section-reference data can occasionally be
  // imprecise for discovery-stage candidates — see 02-semantic-claim-fingerprint-spec.json.
  const claimIdentity = compareClaimIdentity(gt, candidate);
  if (claimIdentity.outcome === "DIFFERENT_SUBPROVISION_SAME_PARENT") {
    push({
      code: "SIBLING_CLAIM_MISMATCH",
      severity: "NON_MATERIAL_VARIANCE",
      dimension: "I_CLAIM_IDENTITY",
      explanation: `Ground truth is anchored at ${claimIdentity.gtSubReference}; candidate is anchored at ${claimIdentity.candidateSubReference} — both enumerated sub-items of the same parent section (${claimIdentity.parentSection}), but different sub-items. Shared covenant-family vocabulary between siblings is not evidence they are the same specific claim.`,
    });
  }

  // --- C. Object / resource -------------------------------------------------
  // Every material conflict must leave a FINDING behind, so a reviewer can see
  // why a dimension failed without re-deriving it. Content overlap is measured
  // with the overlap coefficient (normalized by the smaller vocabulary) so a
  // correct-but-terse candidate is not penalized for brevity against a long
  // adjudicated description.
  const overlap = overlapDetail(gtSignals.contentTerms, candidateSignals.contentTerms);
  const objectTagOverlap = jaccard(gt.objectResource, candidate.objectResource);
  const bothHaveContent = gtSignals.contentTerms.length > 0 && candidateSignals.contentTerms.length > 0;
  if (bothHaveContent && (overlap.coefficient < OBJECT_MATERIAL_CONFLICT_THRESHOLD || overlap.sharedCount < MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT)) {
    push({
      code: "WRONG_OBJECT_RESOURCE",
      severity: "MATERIAL_CONFLICT",
      dimension: "C_OBJECT_RESOURCE",
      explanation: `The two provisions share too little substantive vocabulary to be about the same thing (overlap coefficient ${overlap.coefficient.toFixed(3)}, ${overlap.sharedCount} shared substantive term(s) over a smaller vocabulary of ${overlap.smallerSize}). Ground-truth object/resource tags [${gt.objectResource.join(", ") || "none"}] vs candidate [${candidate.objectResource.join(", ") || "none"}].`,
    });
  } else if (gt.objectResource.length > 0 && candidate.objectResource.length > 0 && objectTagOverlap === 0) {
    push({
      code: "WRONG_OBJECT_RESOURCE",
      severity: "NON_MATERIAL_VARIANCE",
      dimension: "C_OBJECT_RESOURCE",
      explanation: `Object/resource tags do not intersect ([${gt.objectResource.join(", ")}] vs [${candidate.objectResource.join(", ")}]) although the substantive vocabulary does overlap (coefficient ${overlap.coefficient.toFixed(3)}, ${overlap.sharedCount} shared terms).`,
    });
  }

  // --- D. Entity scope ------------------------------------------------------
  const gtScope = gt.scope.length > 0 ? gt.scope : gtSignals.scope;
  const candScope = candidate.scope.length > 0 ? candidate.scope : candidateSignals.scope;
  const scopePairConflict = (x: string, y: string): boolean => {
    const gtHasX = (gtScope as readonly string[]).includes(x);
    const gtHasY = (gtScope as readonly string[]).includes(y);
    const candHasX = (candScope as readonly string[]).includes(x);
    const candHasY = (candScope as readonly string[]).includes(y);
    return (gtHasX && !gtHasY && candHasY && !candHasX) || (gtHasY && !gtHasX && candHasX && !candHasY);
  };
  for (const [x, y] of MUTUALLY_EXCLUSIVE_SCOPES) {
    if (scopePairConflict(x, y)) {
      push({
        code: "WRONG_ENTITY_SCOPE",
        severity: "MATERIAL_CONFLICT",
        dimension: "D_SCOPE_ENTITY",
        explanation: `Ground truth and candidate sit on opposite sides of the ${x} / ${y} distinction. These entity classes are mutually exclusive as drafted, so one cannot represent the other.`,
      });
    }
  }
  if (gtScope.length > 0 && candScope.length > 0 && !gtScope.some((s) => (candScope as readonly string[]).includes(s))) {
    push({
      code: "WRONG_ENTITY_SCOPE",
      severity: "MATERIAL_CONFLICT",
      dimension: "D_SCOPE_ENTITY",
      explanation: `Ground truth is scoped to [${gtScope.join(", ")}]; the candidate is scoped to [${candScope.join(", ")}]. The two entity sets are disjoint, so the candidate governs a different set of obligors.`,
    });
  }
  if (gtScope.length > 0 && candScope.length === 0) {
    push({
      code: "WRONG_ENTITY_SCOPE",
      severity: "MISSING_REQUIRED_DIMENSION",
      dimension: "D_SCOPE_ENTITY",
      explanation: `Ground truth restricts the provision to [${gtScope.join(", ")}]; the candidate carries no entity scope, so it would overstate who the provision reaches.`,
    });
  }

  // --- Instrument -----------------------------------------------------------
  const gtInstr = gt.instrument.length > 0 ? gt.instrument : gtSignals.instruments;
  const candInstr = candidate.instrument.length > 0 ? candidate.instrument : candidateSignals.instruments;
  for (const [x, y] of MUTUALLY_EXCLUSIVE_INSTRUMENTS) {
    const gtHasX = gtInstr.includes(x as never);
    const gtHasY = gtInstr.includes(y as never);
    const candHasX = candInstr.includes(x as never);
    const candHasY = candInstr.includes(y as never);
    if (gtHasX && !gtHasY && candHasY && !candHasX) {
      push({
        code: "WRONG_INSTRUMENT",
        severity: "MATERIAL_CONFLICT",
        dimension: "C_OBJECT_RESOURCE",
        explanation: `Ground truth concerns ${x} obligations; the candidate concerns ${y} obligations. The distinction changes the legal effect of the provision.`,
      });
    }
  }

  // --- E. Economics ---------------------------------------------------------
  const econ = compareEconomics(gt.figures, candidate.figures, gtSignals, candidateSignals);
  numericComparisons.push(...econ.records);
  for (const c of econ.conflicts) push(c);

  // Cap structure ("greater of X and Y%" is not "X").
  if (gtSignals.capStructure === "GREATER_OF" || gtSignals.capStructure === "LESSER_OF") {
    if (candidateSignals.capStructure !== gtSignals.capStructure) {
      push({
        code: "WRONG_CAP_STRUCTURE",
        severity: candidateSignals.capStructure === "NONE" ? "MISSING_REQUIRED_DIMENSION" : "MATERIAL_CONFLICT",
        dimension: "E_ECONOMICS",
        explanation: `Ground truth's cap is a ${gtSignals.capStructure} structure; the candidate's is ${candidateSignals.capStructure}. A single fixed figure does not represent a greater-of/lesser-of cap.`,
      });
      numericComparisons.push({
        dimension: "CAP_STRUCTURE",
        groundTruthFigure: null,
        candidateFigure: null,
        matched: false,
        explanation: `gt=${gtSignals.capStructure} candidate=${candidateSignals.capStructure}`,
      });
    }
  }

  // Comparison direction (a "not to exceed" test is not an "at least" test).
  const gtDirs = gtSignals.comparisonDirections.filter((d) => d !== "UNDETERMINED");
  const candDirs = candidateSignals.comparisonDirections.filter((d) => d !== "UNDETERMINED");
  if (gtDirs.length > 0 && candDirs.length > 0 && !gtDirs.some((d) => candDirs.includes(d))) {
    push({
      code: "WRONG_COMPARISON_DIRECTION",
      severity: "MATERIAL_CONFLICT",
      dimension: "E_ECONOMICS",
      explanation: `Ground truth tests [${gtDirs.join(", ")}]; the candidate tests [${candDirs.join(", ")}].`,
    });
  }

  // Metric basis (12.5% of EBITDA is not 12.5% of Total Assets).
  if (gtSignals.metrics.length > 0 && candidateSignals.metrics.length > 0 && !gtSignals.metrics.some((m) => candidateSignals.metrics.includes(m))) {
    push({
      code: "WRONG_METRIC",
      severity: "MATERIAL_CONFLICT",
      dimension: "E_ECONOMICS",
      explanation: `Ground truth's metric basis is [${gtSignals.metrics.join(", ")}]; the candidate's is [${candidateSignals.metrics.join(", ")}].`,
    });
  }

  // Time period.
  if (gtSignals.timePeriods.length > 0 && candidateSignals.timePeriods.length > 0) {
    const overlap = gtSignals.timePeriods.some((p) => candidateSignals.timePeriods.some((q) => q.toLowerCase() === p.toLowerCase()));
    if (!overlap) {
      push({
        code: "WRONG_TIME_PERIOD",
        severity: "NON_MATERIAL_VARIANCE",
        dimension: "E_ECONOMICS",
        explanation: `Ground truth period(s) [${gtSignals.timePeriods.join("; ")}] vs candidate period(s) [${candidateSignals.timePeriods.join("; ")}].`,
      });
      numericComparisons.push({
        dimension: "TIME_PERIOD",
        groundTruthFigure: null,
        candidateFigure: null,
        matched: false,
        explanation: `gt=[${gtSignals.timePeriods.join("; ")}] candidate=[${candidateSignals.timePeriods.join("; ")}]`,
      });
    }
  }

  // --- F. Conditions / exceptions ------------------------------------------
  const gtConditions = gt.conditions.length > 0 ? gt.conditions : gtSignals.conditions;
  const candConditions = candidate.conditions.length > 0 ? candidate.conditions : candidateSignals.conditions;
  for (const c of gtConditions) {
    if (!candConditions.includes(c) && MATERIAL_CONDITIONS.has(c)) {
      push({
        code: "MISSING_CONDITION",
        severity: "MISSING_REQUIRED_DIMENSION",
        dimension: "F_CONDITIONS_EXCEPTIONS",
        explanation: `Ground truth gates this provision on ${c}; the candidate carries no such condition, so it would present the provision as more freely available than it is.`,
      });
    }
  }
  const gtExceptions = gt.exceptions.length > 0 ? gt.exceptions : gtSignals.exceptions;
  const candExceptions = candidate.exceptions.length > 0 ? candidate.exceptions : candidateSignals.exceptions;
  for (const e of gtExceptions) {
    if (!candExceptions.includes(e) && MATERIAL_EXCEPTIONS.has(e)) {
      push({
        code: "MISSING_EXCEPTION",
        severity: "MISSING_REQUIRED_DIMENSION",
        dimension: "F_CONDITIONS_EXCEPTIONS",
        explanation: `Ground truth carries a ${e} carve-out the candidate omits.`,
      });
    }
  }

  // Shared-cap relationship.
  if (gtSignals.capSharing && !candidateSignals.capSharing) {
    push({
      code: "INCORRECT_SHARED_CAP_RELATIONSHIP",
      severity: "MISSING_REQUIRED_DIMENSION",
      dimension: "F_CONDITIONS_EXCEPTIONS",
      explanation: "Ground truth ties this basket's capacity to a shared cap; the candidate represents it as standalone capacity, which would allow double counting.",
    });
  }

  // Material dependency the ground truth calls out.
  if (gt.materialDependencies.length > 0) {
    const candDeps = [...candidate.dependencyRefs, ...candidate.crossReferences];
    const missing = gt.materialDependencies.filter((d) => !candDeps.some((c) => c.toLowerCase().includes(d.toLowerCase())));
    if (missing.length === gt.materialDependencies.length) {
      push({
        code: "MISSING_DEPENDENCY",
        severity: "MISSING_REQUIRED_DIMENSION",
        dimension: "F_CONDITIONS_EXCEPTIONS",
        explanation: `Ground truth depends on [${gt.materialDependencies.join(", ")}]; the candidate records no corresponding dependency.`,
      });
    }
  }

  // --- G. Operative provenance ---------------------------------------------
  if (gt.documentId !== candidate.documentId) {
    push({
      code: "WRONG_OPERATIVE_VERSION",
      severity: "MATERIAL_CONFLICT",
      dimension: "G_OPERATIVE_PROVENANCE",
      explanation: `Ground truth asserts this claim as of ${gt.documentId} (${gt.operativeStateAssumption}); the candidate is anchored in ${candidate.documentId}. Superseded or not-yet-effective language must never be presented as the operative provision.`,
    });
  }

  // --- Honest-state integrity ----------------------------------------------
  if (candidate.accountingRole === "SUBSTANTIVE_REPRESENTATION" && candidate.selfReportedState.unresolvedReasons.length > 0) {
    push({
      code: "UNSUPPORTED_SEMANTICS_PRESENTED_AS_COMPLETE",
      severity: "MATERIAL_CONFLICT",
      dimension: "G_OPERATIVE_PROVENANCE",
      explanation: `The candidate is presented as a complete representation while carrying unresolved reasons: ${candidate.selfReportedState.unresolvedReasons.join("; ")}.`,
    });
  }

  return { conflicts, numericComparisons };
}

// ---------------------------------------------------------------------------
// Numeric correspondence
// ---------------------------------------------------------------------------

function compareEconomics(
  gtFigures: readonly NumericFigure[],
  candidateFigures: readonly NumericFigure[],
  gtSignals: SemanticSignals,
  candidateSignals: SemanticSignals,
): { conflicts: ConflictFinding[]; records: NumericComparisonRecord[] } {
  const conflicts: ConflictFinding[] = [];
  const records: NumericComparisonRecord[] = [];

  const gtAll = gtFigures.length > 0 ? [...gtFigures] : [...gtSignals.amounts, ...gtSignals.percentages, ...gtSignals.ratios];
  const candAll = candidateFigures.length > 0 ? [...candidateFigures] : [...candidateSignals.amounts, ...candidateSignals.percentages, ...candidateSignals.ratios];

  for (const kind of ["MONEY", "PERCENT", "RATIO"] as const) {
    const gtOfKind = gtAll.filter((f) => f.kind === kind);
    if (gtOfKind.length === 0) continue;
    const candOfKind = candAll.filter((f) => f.kind === kind);
    const dimension = kind === "MONEY" ? "AMOUNT" : kind === "PERCENT" ? "PERCENT" : "RATIO";

    if (candOfKind.length === 0) {
      for (const g of gtOfKind) {
        records.push({ dimension, groundTruthFigure: g, candidateFigure: null, matched: false, explanation: "candidate carries no figure of this kind" });
      }
      conflicts.push({
        code: "MISSING_ECONOMICS",
        severity: "MISSING_REQUIRED_DIMENSION",
        dimension: "E_ECONOMICS",
        groundTruthEvidence: gtOfKind.map((f) => f.raw).join(" | "),
        candidateEvidence: "(no figure of this kind on the candidate)",
        explanation: `Ground truth asserts ${kind} figure(s) [${gtOfKind.map((f) => f.raw).join(", ")}]; the candidate carries none.`,
      });
      continue;
    }

    let anyMatched = false;
    for (const g of gtOfKind) {
      const hit = candOfKind.find((c) => figuresEquivalent(g, c));
      const nearestSameValue = candOfKind.find((c) => Math.abs(c.value - g.value) / Math.max(Math.abs(g.value), 1) < 0.005);
      records.push({
        dimension,
        groundTruthFigure: g,
        candidateFigure: hit ?? nearestSameValue ?? candOfKind[0] ?? null,
        matched: Boolean(hit),
        explanation: hit
          ? `matched value ${g.value}${g.basis ? ` on basis ${g.basis}` : ""}`
          : nearestSameValue
            ? `same numeric value ${g.value} but different basis (gt=${g.basis ?? "unstated"} candidate=${nearestSameValue.basis ?? "unstated"}) — NOT a match`
            : `no candidate figure equals ${g.value}${g.basis ? ` on basis ${g.basis}` : ""}`,
      });
      if (hit) anyMatched = true;
      else if (nearestSameValue) {
        conflicts.push({
          code: kind === "PERCENT" ? "WRONG_PERCENT_BASIS" : kind === "RATIO" ? "WRONG_RATIO" : "WRONG_AMOUNT",
          severity: "MATERIAL_CONFLICT",
          dimension: "E_ECONOMICS",
          groundTruthEvidence: g.raw,
          candidateEvidence: nearestSameValue.raw,
          explanation: `The numeric value matches (${g.value}) but the basis does not: ground truth ${g.basis ?? "unstated"} vs candidate ${nearestSameValue.basis ?? "unstated"}. A matching number on a different basis is a different economic claim.`,
        });
      }
    }
    if (!anyMatched) {
      conflicts.push({
        code: kind === "MONEY" ? "WRONG_AMOUNT" : kind === "PERCENT" ? "WRONG_PERCENT_BASIS" : "WRONG_RATIO",
        severity: "MATERIAL_CONFLICT",
        dimension: "E_ECONOMICS",
        groundTruthEvidence: gtOfKind.map((f) => f.raw).join(" | "),
        candidateEvidence: candOfKind.map((f) => f.raw).join(" | "),
        explanation: `No ground-truth ${kind} figure [${gtOfKind.map((f) => `${f.value}${f.basis ? `/${f.basis}` : ""}`).join(", ")}] is represented by any candidate figure [${candOfKind.map((f) => `${f.value}${f.basis ? `/${f.basis}` : ""}`).join(", ")}].`,
      });
    }
  }

  return { conflicts, records };
}
