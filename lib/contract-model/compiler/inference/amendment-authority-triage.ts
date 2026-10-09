/**
 * Root-cause triage for Phase-2 "AMENDMENT_AUTHORITY" uncertainty claims.
 *
 * Coordinates with Amendment Chain Research (consume-only): this module does
 * NOT rewrite amendment/operative-state code. It classifies VIC uncertainty
 * labels against source excerpts so overbroad family-signal noise is not
 * mistaken for genuine amendment-precedence defects.
 */

export type AmendmentAuthorityRootCause =
  | "OVERBROAD_UNCERTAINTY_CLASSIFICATION"
  | "GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE"
  | "MISSING_OPERATIVE_DOCUMENT"
  | "INCORRECT_VERSION_SELECTION"
  | "FALSE_AMENDMENT_DETECTION"
  | "MISSING_EFFECTIVE_DATE_CONDITION"
  | "MISSING_PARENT_AGREEMENT_IDENTITY"
  | "OTHER";

export interface AmendmentAuthorityTriageInput {
  claim: string;
  excerpt: string;
  documentId: string;
  sourceClass?: string | null;
  packageHasFullOperativeText?: boolean;
  amendmentPipelineConflict?: boolean;
  effectiveDateUnresolved?: boolean;
  parentAgreementUnresolved?: boolean;
  versionSelectionDisputed?: boolean;
}

export interface AmendmentAuthorityTriageResult {
  rootCause: AmendmentAuthorityRootCause;
  evidence: string;
  materiality: "NOISE" | "HEURISTIC" | "REQUIRES_AMENDMENT_PIPELINE" | "BLOCKER";
}

const FAMILY_SIGNAL_CLAIM =
  /covenant-family\/signal recognition is not a verified operative|structural\/family recognition is not operative authority/i;

const LEGACY_OVERBROAD_CLAIM =
  /structural\/family recognition is not operative authority;\s*governing operative text and amendments must be compiled/i;

const AMEND_OP_RE =
  /\b(?:is hereby (?:amended|deleted|replaced|restated)|hereby amends|amended and restated|this amendment|supplemental (?:indenture|agreement)|subject to the (?:terms of )?(?:this )?amendment)\b/i;

const FALSE_AMEND_RE =
  /\b(?:shall not (?:amend|modify)|no (?:loan party|borrower).{0,40}amend|as amended from time to time|banking act.{0,20}as amended)\b/i;

const EFFECTIVE_DATE_RE = /\beffective (?:as of|date)|shall become effective|conditions? precedent to (?:the )?effectiveness\b/i;

const PARENT_ID_RE = /\b(?:credit agreement|parent agreement|existing agreement|original agreement)\b/i;

/**
 * Classify one uncertainty claim. Prefer exact claim-template matches first.
 * Do NOT resolve uncertainty merely because a later filing exists.
 */
export function triageAmendmentAuthorityClaim(input: AmendmentAuthorityTriageInput): AmendmentAuthorityTriageResult {
  const claim = input.claim ?? "";
  const excerpt = input.excerpt ?? "";

  // Phase-2 mislabel: family-signal hypotheses were bucketed as AMENDMENT_AUTHORITY.
  if (FAMILY_SIGNAL_CLAIM.test(claim) || LEGACY_OVERBROAD_CLAIM.test(claim)) {
    if (FALSE_AMEND_RE.test(excerpt) && !AMEND_OP_RE.test(excerpt)) {
      return {
        rootCause: "FALSE_AMENDMENT_DETECTION",
        evidence: "Excerpt uses amend/modify in a negative covenant or statutory 'as amended' sense, not an amendment-operation clause.",
        materiality: "HEURISTIC",
      };
    }
    if (!AMEND_OP_RE.test(excerpt)) {
      return {
        rootCause: "OVERBROAD_UNCERTAINTY_CLASSIFICATION",
        evidence: "Claim is operative-authority / family-signal uncertainty, not amendment-chain precedence.",
        materiality: "NOISE",
      };
    }
    // Family-signal claim text but excerpt has real amendment ops — still not resolved.
    return {
      rootCause: "GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE",
      evidence: "Amendment-operation language present in excerpt; precedence not independently resolved by VIC.",
      materiality: "REQUIRES_AMENDMENT_PIPELINE",
    };
  }

  if (input.sourceClass === "CURATED_EXCERPT" || input.packageHasFullOperativeText === false) {
    return {
      rootCause: "MISSING_OPERATIVE_DOCUMENT",
      evidence: "Package/source is excerpt-only or lacks full operative filing body on disk.",
      materiality: "BLOCKER",
    };
  }

  if (input.effectiveDateUnresolved || (EFFECTIVE_DATE_RE.test(excerpt) && /conditional|subject to|upon (?:the )?satisfaction/i.test(excerpt))) {
    return {
      rootCause: "MISSING_EFFECTIVE_DATE_CONDITION",
      evidence: "Effective-date condition language present or pipeline flagged unresolved dating.",
      materiality: "REQUIRES_AMENDMENT_PIPELINE",
    };
  }

  if (input.parentAgreementUnresolved || (AMEND_OP_RE.test(excerpt) && !PARENT_ID_RE.test(excerpt))) {
    return {
      rootCause: "MISSING_PARENT_AGREEMENT_IDENTITY",
      evidence: "Amendment language without clear parent-agreement identity in the local excerpt.",
      materiality: "REQUIRES_AMENDMENT_PIPELINE",
    };
  }

  if (input.versionSelectionDisputed) {
    return {
      rootCause: "INCORRECT_VERSION_SELECTION",
      evidence: "Caller flagged disputed operative-version selection; not auto-resolved from later filing presence.",
      materiality: "BLOCKER",
    };
  }

  if (input.amendmentPipelineConflict || AMEND_OP_RE.test(excerpt)) {
    return {
      rootCause: "GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE",
      evidence: "Amendment-operation or pipeline conflict evidence without independent operative-state resolution.",
      materiality: "REQUIRES_AMENDMENT_PIPELINE",
    };
  }

  if (FALSE_AMEND_RE.test(excerpt)) {
    return {
      rootCause: "FALSE_AMENDMENT_DETECTION",
      evidence: "Amend/modify language is restrictive covenant or citation boilerplate.",
      materiality: "HEURISTIC",
    };
  }

  return {
    rootCause: "OTHER",
    evidence: "No more specific root cause established from claim/excerpt evidence.",
    materiality: "HEURISTIC",
  };
}

export function summarizeAmendmentAuthorityTriage(
  results: AmendmentAuthorityTriageResult[]
): Record<AmendmentAuthorityRootCause, number> {
  const out: Record<AmendmentAuthorityRootCause, number> = {
    OVERBROAD_UNCERTAINTY_CLASSIFICATION: 0,
    GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE: 0,
    MISSING_OPERATIVE_DOCUMENT: 0,
    INCORRECT_VERSION_SELECTION: 0,
    FALSE_AMENDMENT_DETECTION: 0,
    MISSING_EFFECTIVE_DATE_CONDITION: 0,
    MISSING_PARENT_AGREEMENT_IDENTITY: 0,
    OTHER: 0,
  };
  for (const r of results) out[r.rootCause] += 1;
  return out;
}
