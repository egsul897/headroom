/**
 * Review-ready activation records for the EXISTING counsel-compile path
 * (PR #227 lifecycle): Neon summary → parseCounselFormulaForTest →
 * compileAcceptedInterpretation → Permission (UNVERIFIED).
 *
 * This module does NOT write Permissions or SemanticTruth.
 */

import type { CovenantSummaryItem } from "../../product/covenant-intelligence/summarize";
import { parseCounselFormulaForTest } from "../../product/customer-intelligence/compile-accepted";
import type { IndependentAuditResult } from "./independent-audit";

export type CertificationState =
  | "NOT_CERTIFIED"
  | "REVIEW_READY_UNVERIFIED"
  | "BLOCKED_FALSE_EXECUTABLE"
  | "BLOCKED_INSUFFICIENT_EVIDENCE";

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
  counselCompileEligible: boolean;
  note: string;
}

export function buildReviewReadyRecord(params: {
  sourceId: string;
  item: CovenantSummaryItem;
  audit: IndependentAuditResult;
  documentClass?: string | null;
  issuerTicker?: string | null;
}): ReviewReadyActivationRecord {
  const parsed = parseCounselFormulaForTest(params.item);
  let certificationState: CertificationState = "NOT_CERTIFIED";
  if (params.audit.disposition === "FALSE_EXECUTABLE" || params.audit.falseExecutableClassification) {
    certificationState = "BLOCKED_FALSE_EXECUTABLE";
  } else if (params.audit.disposition === "INSUFFICIENT_OPERATIVE_TEXT") {
    certificationState = "BLOCKED_INSUFFICIENT_EVIDENCE";
  } else if (
    params.audit.disposition === "REVIEW_READY_EXECUTABLE" ||
    params.audit.disposition === "REVIEW_READY_WITH_GAPS"
  ) {
    certificationState = "REVIEW_READY_UNVERIFIED";
  }

  const counselCompileEligible =
    certificationState === "REVIEW_READY_UNVERIFIED" &&
    parsed.modelingStatus === "MODELED" &&
    params.audit.sufficientForExecutableEvaluation;

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
    note: counselCompileEligible
      ? "Eligible for counsel ACCEPT → compileAcceptedInterpretation (UNVERIFIED Permission). NOT auto-certified; NOT written."
      : "Blocked or needs human review before counsel compile.",
  };
}
