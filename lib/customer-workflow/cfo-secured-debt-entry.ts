/**
 * Canonical CFO product entry for the Matthews $50M secured-debt workflow.
 *
 * Reuses `evaluateCfoSecuredDebtWorkflow` — no second engine. Surfaces the
 * eight mission outputs + exportable audit trail with explicit authority labels
 * that distinguish modeled NOT_PERMITTED from CERTIFIED_4E legal determination.
 */

import {
  evaluateCfoSecuredDebtWorkflow,
  type CfoSecuredDebtWorkflowResult,
  type CfoWorkflowResult,
} from "@/lib/product/cfo-secured-debt-workflow";
import { MATTHEWS_COMPANY_ID } from "@/lib/product/real-dashboard-vertical-slice/package-matthews";

export const CFO_SECURED_DEBT_DEFAULT_ASK =
  "As of 2024-12-31, is a proposed $50 million secured debt transaction permitted under our Indenture and Credit Agreement?";

/** Authority of the customer-facing result — never upgrade modeled to certified. */
export type CfoSecuredDebtResultAuthority =
  | "MODELED_NOT_CERTIFIED_4E"
  | "NEEDS_AUTHENTIC_EVIDENCE"
  | "UNSUPPORTED_NO_PACKAGE"
  | "REVIEW_REQUIRED_UNEXPECTED_EXECUTABLE";

export type CfoSecuredDebtProductEntry = {
  schema: "cfo-secured-debt-product-entry.v1";
  companyId: string;
  routeEligible: boolean;
  /** Full orchestrator result when eligible (or omit-package demo). */
  workflow: CfoSecuredDebtWorkflowResult | null;
  result: CfoWorkflowResult | null;
  resultAuthority: CfoSecuredDebtResultAuthority | null;
  resultAuthorityLabel: string;
  /** Eight customer outputs — flattened for the product surface. */
  outputs: {
    applicableCovenants: CfoSecuredDebtWorkflowResult["applicableCovenants"] | null;
    operativeAndAmendmentState: CfoSecuredDebtWorkflowResult["operativeAndAmendmentState"] | null;
    debtBasketsAndRatioConditions: CfoSecuredDebtWorkflowResult["debtBasketsAndRatioConditions"] | null;
    approvedFinancialInputs: CfoSecuredDebtWorkflowResult["approvedFinancialInputs"] | null;
    utilizationAndRemaining: CfoSecuredDebtWorkflowResult["utilizationAndRemaining"] | null;
    pathAndSimulation: CfoSecuredDebtWorkflowResult["pathAndSimulation"] | null;
    result: CfoWorkflowResult | null;
    auditTrail: CfoSecuredDebtWorkflowResult["auditTrail"] | null;
  } | null;
  /** Machine-readable blockers for evidence gates. */
  evidenceBlockers: string[];
  /** JSON string for downloadable audit export. */
  auditExportJson: string | null;
  auditExportFilename: string | null;
  verifiedRemainingUsd: null;
  certifiedSimulationAvailable: false;
};

export function isMatthewsCfoSecuredDebtCompany(companyId: string): boolean {
  return companyId === MATTHEWS_COMPANY_ID || companyId === "matthews-international";
}

export function classifyCfoSecuredDebtResultAuthority(
  result: CfoWorkflowResult,
): CfoSecuredDebtResultAuthority {
  switch (result) {
    case "NOT_PERMITTED":
      return "MODELED_NOT_CERTIFIED_4E";
    case "UNSUPPORTED":
      return "UNSUPPORTED_NO_PACKAGE";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED_UNEXPECTED_EXECUTABLE";
    case "NEEDS_INPUT":
    case "PERMITTED":
    default:
      return "NEEDS_AUTHENTIC_EVIDENCE";
  }
}

export function cfoSecuredDebtResultAuthorityLabel(
  authority: CfoSecuredDebtResultAuthority,
): string {
  switch (authority) {
    case "MODELED_NOT_CERTIFIED_4E":
      return "MODELED — not a CERTIFIED_4E / production-authoritative legal determination";
    case "UNSUPPORTED_NO_PACKAGE":
      return "UNSUPPORTED — no authentic package bound";
    case "REVIEW_REQUIRED_UNEXPECTED_EXECUTABLE":
      return "REVIEW_REQUIRED — unexpected executable path; do not treat as customer PERMITTED";
    case "NEEDS_AUTHENTIC_EVIDENCE":
      return "NEEDS_INPUT / evidence — verified simulation unavailable until authentic VEP + gates pass";
  }
}

/**
 * Load the Matthews secured-debt workflow for the product Simulate/Ask surfaces.
 * Returns routeEligible=false for other companies (panel not shown).
 */
export async function loadCfoSecuredDebtProductEntry(args: {
  companyId: string;
  ask?: string;
  amountMillions?: number;
  evaluationDate?: string;
  /** Fail-closed demo when authentic package must be omitted. */
  omitAuthenticPackage?: boolean;
}): Promise<CfoSecuredDebtProductEntry> {
  if (!isMatthewsCfoSecuredDebtCompany(args.companyId) && !args.omitAuthenticPackage) {
    return {
      schema: "cfo-secured-debt-product-entry.v1",
      companyId: args.companyId,
      routeEligible: false,
      workflow: null,
      result: null,
      resultAuthority: null,
      resultAuthorityLabel: "",
      outputs: null,
      evidenceBlockers: [],
      auditExportJson: null,
      auditExportFilename: null,
      verifiedRemainingUsd: null,
      certifiedSimulationAvailable: false,
    };
  }

  const workflow = await evaluateCfoSecuredDebtWorkflow({
    ask: args.ask ?? CFO_SECURED_DEBT_DEFAULT_ASK,
    amountMillions: args.amountMillions ?? 50,
    evaluationDate: args.evaluationDate ?? "2024-12-31",
    omitAuthenticPackage: args.omitAuthenticPackage,
  });

  const resultAuthority = classifyCfoSecuredDebtResultAuthority(workflow.result);
  const evidenceBlockers = [
    ...workflow.auditTrail.unresolvedConditions,
    ...workflow.requiredExternalEvidence
      .filter((e) => e.status === "ABSENT")
      .map((e) => `ABSENT_EVIDENCE:${e.evidence}`),
    !workflow.pathAndSimulation.verifiedSimulateExecutable
      ? "CERTIFIED_SIMULATION_UNAVAILABLE"
      : null,
    workflow.utilizationAndRemaining.verifiedRemainingUsd == null
      ? "VERIFIED_REMAINING_NULL"
      : null,
  ].filter((x): x is string => Boolean(x));

  const auditPayload = {
    schema: "cfo-secured-debt-audit-export.v1",
    exportedAt: new Date().toISOString(),
    companyId: args.companyId,
    result: workflow.result,
    resultAuthority,
    resultAuthorityLabel: cfoSecuredDebtResultAuthorityLabel(resultAuthority),
    resultRationale: workflow.resultRationale,
    package: workflow.package,
    ask: workflow.ask,
    auditTrail: workflow.auditTrail,
    applicableCovenants: workflow.applicableCovenants,
    operativeAndAmendmentState: workflow.operativeAndAmendmentState,
    debtBasketsAndRatioConditions: workflow.debtBasketsAndRatioConditions,
    approvedFinancialInputs: workflow.approvedFinancialInputs,
    utilizationAndRemaining: workflow.utilizationAndRemaining,
    pathAndSimulation: workflow.pathAndSimulation,
    requiredExternalEvidence: workflow.requiredExternalEvidence,
    constraintsHonored: workflow.constraintsHonored,
    gitSha: workflow.gitSha,
  };

  return {
    schema: "cfo-secured-debt-product-entry.v1",
    companyId: args.companyId,
    routeEligible: true,
    workflow,
    result: workflow.result,
    resultAuthority,
    resultAuthorityLabel: cfoSecuredDebtResultAuthorityLabel(resultAuthority),
    outputs: {
      applicableCovenants: workflow.applicableCovenants,
      operativeAndAmendmentState: workflow.operativeAndAmendmentState,
      debtBasketsAndRatioConditions: workflow.debtBasketsAndRatioConditions,
      approvedFinancialInputs: workflow.approvedFinancialInputs,
      utilizationAndRemaining: workflow.utilizationAndRemaining,
      pathAndSimulation: workflow.pathAndSimulation,
      result: workflow.result,
      auditTrail: workflow.auditTrail,
    },
    evidenceBlockers,
    auditExportJson: JSON.stringify(auditPayload, null, 2),
    auditExportFilename: `matthews-secured-debt-audit-${workflow.draft.evaluationDate ?? "undated"}.json`,
    verifiedRemainingUsd: null,
    certifiedSimulationAvailable: false,
  };
}
