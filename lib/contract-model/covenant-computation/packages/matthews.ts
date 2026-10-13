/**
 * Matthews International covenant book — authentic in-repo excerpts only.
 *
 * Operative slices are taken from the reconstructed indenture and credit
 * agreement already used by the secured-debt workflow. Clauses the research
 * inventory names, but which those excerpts do not contain, are omissions
 * with no numeric cap.
 */

import {
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
} from "@/lib/financial-certificate-engine/fixtures/authentic-matthews-q1-fy2025";
import {
  MATTHEWS_CREDIT_AGREEMENT_SOURCE,
  MATTHEWS_INDENTURE_SOURCE,
} from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";
import { MATTHEWS_PACKAGE_KEY } from "@/lib/product/real-dashboard-vertical-slice/package-matthews";
import type { BasketClause, ComputationPackage } from "../types";
import { excerptFrom, excerptThrough } from "../text";

const INDENTURE_ID = MATTHEWS_INDENTURE_SOURCE.documentId;
const CA_ID = MATTHEWS_CREDIT_AGREEMENT_SOURCE.documentId;

function indentureBaskets(text: string): BasketClause[] {
  return [
    clause("matw-pd-1a", "Permitted Debt (1)(a)", "DEBT_INCURRENCE", INDENTURE_ID, excerptFrom(text, "(1) (a) Debt under Debt Facilities", ", plus")),
    clause("matw-pd-1bx", "Permitted Debt (1)(b)(x)", "DEBT_INCURRENCE", INDENTURE_ID, excerptFrom(text, "(b) (x) additional Debt", ", and (y)")),
    clause("matw-pd-1by", "Permitted Debt (1)(b)(y)", "DEBT_INCURRENCE", INDENTURE_ID, excerptFrom(text, "(y) with respect to Debt", "; and")),
    clause("matw-pd-2", "Permitted Debt (2)", "DEBT_INCURRENCE", INDENTURE_ID, excerptFrom(text, "(2) Debt represented by the Notes", ";")),
    clause("matw-409a", "§4.09(a)", "DEBT_INCURRENCE", INDENTURE_ID, excerptThrough(text, "(a) The Company will not", "2.00 to 1.00.")),
    clause("matw-410", "§4.10", "LIENS", INDENTURE_ID, excerptThrough(text, "SECTION 4.10", "Permitted Liens.")),
  ];
}

function clause(
  stableKey: string,
  sectionRef: string,
  covenantFamily: string,
  documentId: string,
  operativeText: string,
): BasketClause {
  return { stableKey, sectionRef, covenantFamily, documentId, operativeText };
}

export function matthewsCovenantPackage(): ComputationPackage {
  const indenture = MATTHEWS_INDENTURE_SOURCE.text;
  return {
    packageKey: MATTHEWS_PACKAGE_KEY,
    companyId: "matthews",
    instrumentKey: INDENTURE_ID,
    asOf: "2024-12-31",
    documents: [
      { documentId: INDENTURE_ID, role: "INDENTURE", text: indenture },
      { documentId: CA_ID, role: "CREDIT_AGREEMENT", text: MATTHEWS_CREDIT_AGREEMENT_SOURCE.text },
      { documentId: "matw-10q-2024-12-31", role: "FINANCIAL_STATEMENT", text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025 },
      { documentId: "matw-compliance-certificate-q1-fy2025", role: "COMPLIANCE_CERTIFICATE", text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025 },
    ],
    baskets: [
      ...indentureBaskets(indenture),
      clause("matw-ca-601j", "§6.01(j)", "LIENS", CA_ID, MATTHEWS_CREDIT_AGREEMENT_SOURCE.text),
    ],
    omissions: [
      {
        stableKey: "matw-omit-514a-leverage",
        sectionRef: "Credit Agreement §5.14(a)(i) Leverage Ratio",
        covenantFamily: "FINANCIAL_COVENANT",
        reason: "Named in the onboarding inventory. The reconstructed credit-agreement excerpt does not contain the operative test.",
      },
      {
        stableKey: "matw-omit-514a-senior",
        sectionRef: "Credit Agreement §5.14(a)(ii) Senior Leverage Ratio",
        covenantFamily: "FINANCIAL_COVENANT",
        reason: "Named in the onboarding inventory. The reconstructed credit-agreement excerpt does not contain the operative test.",
      },
      {
        stableKey: "matw-omit-514b-icr",
        sectionRef: "Credit Agreement §5.14(b) Interest Coverage Ratio",
        covenantFamily: "FINANCIAL_COVENANT",
        reason: "Named in the onboarding inventory. The reconstructed credit-agreement excerpt does not contain the operative test or its definition.",
      },
      {
        stableKey: "matw-omit-409a-proviso",
        sectionRef: "Indenture §4.09(a) non-guarantor proviso",
        covenantFamily: "DEBT_INCURRENCE",
        reason: "Onboarding describes a greater-of Total Assets sub-cap. That proviso is not in the reconstructed indenture excerpt, so no $125 million or 7% cap is published.",
      },
      {
        stableKey: "matw-omit-pd-rest",
        sectionRef: "Permitted Debt (3)-(22)",
        covenantFamily: "DEBT_INCURRENCE",
        reason: "The reconstructed excerpt stops at clause (2). Later clauses are not typed and have no cap.",
      },
    ],
  };
}
