/**
 * Review-ready activation records for the EXISTING counsel-compile path
 * (PR #227/#232 lifecycle): Neon summary → parseCounselFormulaForTest →
 * compileAcceptedInterpretation → Permission (UNVERIFIED).
 *
 * Cycle 6: REVIEW_READY_WITH_GAPS and incomplete excerpts are NOT
 * counsel-compile-eligible. PRODUCTION_AUTHORITATIVE is never set here.
 */

import type { CovenantSummaryItem } from "../../product/covenant-intelligence/summarize";
import { parseCounselFormulaForTest } from "../../product/customer-intelligence/compile-accepted";
import type { IndependentAuditResult } from "./independent-audit";
import {
  assessOperativeCompleteness,
  type PromotionState,
} from "./completeness";

export type CertificationState =
  | "NOT_CERTIFIED"
  | "REVIEW_READY_UNVERIFIED"
  | "BLOCKED_FALSE_EXECUTABLE"
  | "BLOCKED_INSUFFICIENT_EVIDENCE"
  | "BLOCKED_INCOMPLETE_OPERATIVE";

export interface ReviewReadyActivationRecord {
  schemaVersion: "intelligence-factory.review-ready-activation.v1";
  sourceId: string;
  sectionRef: string;
  heading: string;
  governingAgreement: string;
  documentClass: string | null;
  issuerTicker: string | null;
  activationPath: "counsel-compile-accepted-interpretation";
  peerCoordination: {
    lifecyclePr: "https://github.com/egsul897/headroom/pull/227";
    extractionPr: "https://github.com/egsul897/headroom/pull/225";
    durableLifecyclePr: "https://github.com/egsul897/headroom/pull/232";
    note: "Uses parseCounselFormulaForTest / compileAcceptedInterpretation — no competing activation pipeline. Peers #225/#227/#232.";
  };
  parsedFormula: {
    modelingStatus: string;
    formulaType: string | null;
    thresholdValue: number | null;
    params: Record<string, unknown> | null;
    missingFields: string[];
  };
  independentAudit: {
    disposition: IndependentAuditResult["disposition"];
    sufficientForExecutableEvaluation: boolean;
    falseExecutableClassification: boolean;
    materialOmissions: string[];
    independentFormula: string | null;
    independentThresholdMillions: number | null;
  };
  sourceEvidence: {
    operativeLanguageExcerpt: string;
    operativeWindowPreview: string;
    sourceCitation: string;
    families: string[];
    posture: string;
    conditions: string[];
    exceptions: string[];
    applicableDefinitions: Array<{ term: string; resolved?: boolean }>;
  };
  provenance: {
    epistemicStatus: string;
    promotedToLegalTruth: 0;
    neonMutations: 0;
  };
  certificationState: CertificationState;
  /** Distinct from review-ready: requires completeness + no material omissions. */
  counselCompileEligible: boolean;
  promotionState: PromotionState;
  completenessReasons: string[];
  note: string;
}

/**
 * Downstream consumers MUST use this (or `counselCompileEligible` boolean),
 * never `promotionState === "COUNSEL_COMPILE_ELIGIBLE"` alone — labels can lag
 * audit-backed completeness when activation used a short excerpt.
 */
export function mayEnterCounselCompilePath(
  rec: Pick<ReviewReadyActivationRecord, "counselCompileEligible" | "promotionState" | "certificationState">,
): boolean {
  return (
    rec.counselCompileEligible === true &&
    rec.certificationState === "REVIEW_READY_UNVERIFIED" &&
    rec.promotionState === "COUNSEL_COMPILE_ELIGIBLE"
  );
}

export function buildReviewReadyRecord(params: {
  sourceId: string;
  item: CovenantSummaryItem;
  audit: IndependentAuditResult;
  documentClass?: string | null;
  issuerTicker?: string | null;
}): ReviewReadyActivationRecord {
  const parsed = parseCounselFormulaForTest(params.item);
  const excerpt = params.item.operativeLanguageExcerpt ?? "";
  // Audit preview is short; when materialOmissions already flag missed conditions,
  // treat as incomplete regardless of window length.
  const completenessFinal = assessOperativeCompleteness({
    item: params.item,
    operativeExcerpt: excerpt,
    fullOperativeWindow:
      params.audit.materialOmissions.includes("missed_condition_language") ||
      params.audit.materialOmissions.includes("missed_shared_capacity_dependency")
        ? `${excerpt}\n provided that no Default shall have occurred and without duplication pursuant to clauses (a) and (b)`
        : params.audit.operativeWindowPreview && params.audit.operativeWindowPreview.length > 40
          ? `${excerpt}\n${params.audit.operativeWindowPreview}`
          : undefined,
  });

  let certificationState: CertificationState = "NOT_CERTIFIED";
  if (params.audit.disposition === "FALSE_EXECUTABLE" || params.audit.falseExecutableClassification) {
    certificationState = "BLOCKED_FALSE_EXECUTABLE";
  } else if (params.audit.disposition === "INSUFFICIENT_OPERATIVE_TEXT") {
    certificationState = "BLOCKED_INSUFFICIENT_EVIDENCE";
  } else if (
    params.audit.materialOmissions.length > 0 ||
    params.audit.disposition === "REVIEW_READY_WITH_GAPS" ||
    !completenessFinal.complete
  ) {
    certificationState = "BLOCKED_INCOMPLETE_OPERATIVE";
  } else if (params.audit.disposition === "REVIEW_READY_EXECUTABLE") {
    certificationState = "REVIEW_READY_UNVERIFIED";
  }

  const counselCompileEligible =
    certificationState === "REVIEW_READY_UNVERIFIED" &&
    parsed.modelingStatus === "MODELED" &&
    params.audit.sufficientForExecutableEvaluation &&
    params.audit.materialOmissions.length === 0 &&
    completenessFinal.complete;

  const promotionState: PromotionState = counselCompileEligible
    ? "COUNSEL_COMPILE_ELIGIBLE"
    : params.audit.sufficientForExecutableEvaluation &&
        !params.audit.falseExecutableClassification
      ? "EXECUTABLE_FORMULA_ONLY"
      : certificationState.startsWith("BLOCKED")
        ? "DISCOVERED"
        : "REVIEW_READY";

  return {
    schemaVersion: "intelligence-factory.review-ready-activation.v1",
    sourceId: params.sourceId,
    sectionRef: params.item.sectionRef,
    heading: params.item.heading,
    governingAgreement: params.item.governingAgreement,
    documentClass: params.documentClass ?? null,
    issuerTicker: params.issuerTicker ?? null,
    activationPath: "counsel-compile-accepted-interpretation",
    peerCoordination: {
      lifecyclePr: "https://github.com/egsul897/headroom/pull/227",
      extractionPr: "https://github.com/egsul897/headroom/pull/225",
      durableLifecyclePr: "https://github.com/egsul897/headroom/pull/232",
      note: "Uses parseCounselFormulaForTest / compileAcceptedInterpretation — no competing activation pipeline. Peers #225/#227/#232.",
    },
    parsedFormula: {
      modelingStatus: parsed.modelingStatus,
      formulaType: parsed.formulaType ?? null,
      thresholdValue: parsed.thresholdValue ?? null,
      params: (parsed.params as Record<string, unknown>) ?? null,
      missingFields: parsed.missingFields ?? [],
    },
    independentAudit: {
      disposition: params.audit.disposition,
      sufficientForExecutableEvaluation: params.audit.sufficientForExecutableEvaluation,
      falseExecutableClassification: params.audit.falseExecutableClassification,
      materialOmissions: params.audit.materialOmissions,
      independentFormula: params.audit.independentFormula,
      independentThresholdMillions: params.audit.independentThresholdMillions,
    },
    sourceEvidence: {
      operativeLanguageExcerpt: (params.item.operativeLanguageExcerpt ?? "").slice(0, 600),
      operativeWindowPreview: params.audit.operativeWindowPreview,
      sourceCitation: params.item.sourceCitation,
      families: params.item.families,
      posture: params.item.posture,
      conditions: params.item.conditions ?? [],
      exceptions: params.item.exceptions ?? [],
      applicableDefinitions: (params.item.applicableDefinitions ?? []).map((d) => ({
        term: d.term,
        resolved: d.resolved,
      })),
    },
    provenance: {
      epistemicStatus: params.item.epistemicStatus,
      promotedToLegalTruth: 0,
      neonMutations: 0,
    },
    certificationState,
    counselCompileEligible,
    promotionState,
    completenessReasons: completenessFinal.reasons,
    note: counselCompileEligible
      ? "Counsel-compile-eligible (UNVERIFIED). NOT production-authoritative; NOT auto-certified; NOT written."
      : certificationState === "BLOCKED_INCOMPLETE_OPERATIVE"
        ? `Forced REVIEW_REQUIRED / incomplete — gaps: ${completenessFinal.reasons.concat(params.audit.materialOmissions).join(", ") || "material omissions"}. Not a complete-rule representation.`
        : "Blocked or needs human review before counsel compile. PRODUCTION_AUTHORITATIVE never set by KF.",
  };
}
