/**
 * Workstream 2 — Contractual reasoning representation.
 *
 * Preserves legal meaning of provision text as a structured record.
 * Uncertain interpretation is never converted into executable authority.
 */

import type { ProvisionAnalysis } from "./analyze-provision";
import type { CovenantSummaryItem } from "./summarize";

export const CONTRACTUAL_REPRESENTATION_VERSION = "product.contractual-representation.v1";

export type ExecutabilityStance =
  | "NOT_EXECUTABLE"
  | "JUDGMENT_REQUIRED"
  | "DISCOVERED_ONLY"
  | "CERTIFIED_UPSTREAM";

export interface ContractualProvisionRepresentation {
  version: typeof CONTRACTUAL_REPRESENTATION_VERSION;
  sectionRef: string;
  sourceCitation: string;
  applicableEntities: string[];
  restrictedAction: string | null;
  permissionOrException: string[];
  preconditions: string[];
  quantitativeLimit: string[];
  calculationFormula: string | null;
  definedTermDependencies: Array<{ term: string; resolved: boolean; excerpt: string }>;
  financialTestingRequirements: string[];
  measurementDate: string | null;
  basketInteraction: string[];
  reclassificationAuthority: string | null;
  amendmentProvenance: string | null;
  sourceCitations: string[];
  ambiguityAndUnsupportedMechanics: string[];
  executabilityStance: ExecutabilityStance;
  epistemicNote: string;
}

function detectFormula(text: string): string | null {
  if (/greater of/i.test(text) && /%/.test(text)) {
    const m = text.match(/greater of[^.;]{0,120}/i);
    return m ? m[0].replace(/\s+/g, " ").trim() : "greater-of grower (see source)";
  }
  if (/lesser of/i.test(text)) {
    const m = text.match(/lesser of[^.;]{0,120}/i);
    return m ? m[0].replace(/\s+/g, " ").trim() : "lesser-of (see source)";
  }
  if (/\d+(?:\.\d+)?\s*%\s*of/i.test(text)) {
    const m = text.match(/\d+(?:\.\d+)?\s*%\s*of\s+[A-Za-z][A-Za-z0-9\s]+/i);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
  }
  return null;
}

function detectMeasurementDate(text: string): string | null {
  if (/at any (?:one )?time outstanding/i.test(text)) return "at any time outstanding";
  if (/as of the (?:last day of the )?most recently ended/i.test(text)) {
    const m = text.match(/as of the[^.;]{0,100}/i);
    return m ? m[0].replace(/\s+/g, " ").trim() : "as-of most recently ended period";
  }
  if (/per fiscal year|in any fiscal year/i.test(text)) return "per fiscal year";
  if (/on a pro forma basis/i.test(text)) return "pro forma measurement basis (date unresolved without financial inputs)";
  return null;
}

function detectReclassification(text: string): string | null {
  if (/reclassif/i.test(text) || /redesignat/i.test(text) || /divide and classify/i.test(text)) {
    const m = text.match(/[^.;]{0,40}(?:reclassif\w*|redesignat\w*|divide and classify)[^.;]{0,80}/i);
    return m ? m[0].replace(/\s+/g, " ").trim() : "Reclassification / redesignation authority present — not executable without certification";
  }
  return null;
}

function detectBasketInteraction(text: string): string[] {
  const out: string[] = [];
  if (/together with/i.test(text)) out.push("Shared / aggregate capacity with another clause (together with)");
  if (/Available Amount|Cumulative Credit|builder/i.test(text)) out.push("Builder / Available Amount interaction");
  if (/in reliance on/i.test(text)) out.push("Usage in reliance on another basket");
  if (/shared (?:cap|capacity|basket)|in the aggregate with/i.test(text)) out.push("Explicit shared-capacity drafting");
  return out;
}

function detectFinancialTesting(text: string): string[] {
  const out: string[] = [];
  if (/Consolidated (?:Total )?(?:Net )?Leverage Ratio|Fixed Charge Coverage|Interest Coverage/i.test(text)) {
    out.push("Ratio-based financial test referenced");
  }
  if (/pro forma/i.test(text)) out.push("Pro forma evaluation basis required");
  if (/no Default|no Event of Default|Payment Conditions/i.test(text)) out.push("Default / Payment Conditions gate");
  return out;
}

/** Build a lawyer-facing structured representation from a provision analysis / summary item. */
export function representProvision(params: {
  item: CovenantSummaryItem;
  amendmentProvenance?: string | null;
  certifiedUpstream?: boolean;
}): ContractualProvisionRepresentation {
  const a: ProvisionAnalysis = params.item.analysis;
  const text = `${a.operativeLanguageExcerpt}\n${a.plainEnglish}`;
  const ambiguity = [...a.unresolved];
  const formula = detectFormula(text);
  if (formula && /unresolved|unsupported/i.test(a.plainEnglish)) {
    ambiguity.push("Calculation formula surface-detected but not verified as executable");
  }
  if (!a.restriction && a.posture === "UNRESOLVED") {
    ambiguity.push("Restricted action could not be established from excerpt");
  }

  const stance: ExecutabilityStance = params.certifiedUpstream
    ? "CERTIFIED_UPSTREAM"
    : ambiguity.length > 0 || a.posture === "UNRESOLVED"
      ? "JUDGMENT_REQUIRED"
      : "DISCOVERED_ONLY";

  return {
    version: CONTRACTUAL_REPRESENTATION_VERSION,
    sectionRef: a.sectionRef,
    sourceCitation: a.sourceCitation,
    applicableEntities: a.coveredEntities,
    restrictedAction: a.restriction,
    permissionOrException: [...a.permissions, ...a.exceptions],
    preconditions: a.conditions,
    quantitativeLimit: a.basketsAndThresholds,
    calculationFormula: formula,
    definedTermDependencies: a.applicableDefinitions.map((d) => ({
      term: d.term,
      resolved: d.resolved,
      excerpt: d.excerpt,
    })),
    financialTestingRequirements: detectFinancialTesting(text),
    measurementDate: detectMeasurementDate(text),
    basketInteraction: detectBasketInteraction(text),
    reclassificationAuthority: detectReclassification(text),
    amendmentProvenance: params.amendmentProvenance ?? null,
    sourceCitations: [a.sourceCitation, ...a.crossReferences.slice(0, 6)],
    ambiguityAndUnsupportedMechanics: ambiguity,
    executabilityStance: stance === "CERTIFIED_UPSTREAM" ? stance : "NOT_EXECUTABLE",
    epistemicNote:
      "Structured discovery representation only. Uncertain mechanics are listed under ambiguityAndUnsupportedMechanics and are never treated as executable authority unless a Phase 3 certified rule is bound upstream.",
  };
}
