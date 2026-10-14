/**
 * Matthews International covenant book from pinned EDGAR exhibits.
 *
 * Indenture EX-4.1 (0001193125-24-228450), Fifth Amendment operative text
 * (0000063296-24-000010, strikethrough removed), Sixth Amendment EX-10.2
 * (0001193125-24-224129, replaces §6.01). As-of 2024-12-31. The Eighth
 * Amendment is later and is not the operative agreement. No compliance
 * certificate exhibit was found; the certificate document remains the
 * in-repo reconstruction and is not treated as an EDGAR filing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
} from "@/lib/financial-certificate-engine/fixtures/authentic-matthews-q1-fy2025";
import { MATTHEWS_PACKAGE_KEY } from "@/lib/product/real-dashboard-vertical-slice/package-matthews";
import { supersededClauseMarkers } from "../covenant-sections";
import { readCovenantSource, supersededSectionNumbers } from "../extract-baskets";
import type { ComputationPackage } from "../types";
import { norm } from "../text";

const INDENTURE_ID = "matw-indenture-2024-ex4-1";
const CA_ID = "matw-ca-fifth-amendment";
const SIXTH_ID = "matw-ca-sixth-amendment";

function loadOperative(name: string): string {
  return norm(readFileSync(join(process.cwd(), "tests/fixtures/edgar/matthews", name), "utf8"));
}

export function matthewsCovenantPackage(): ComputationPackage {
  const indenture = loadOperative("indenture-ex4-1.txt");
  const creditAgreement = loadOperative("credit-agreement-fifth-amendment.operative.txt");
  const sixth = loadOperative("credit-agreement-sixth-amendment.txt");
  const replaced = supersededSectionNumbers(sixth);
  const replacedClauses = supersededClauseMarkers(sixth);
  const indentureSource = readCovenantSource({ documentId: INDENTURE_ID, text: indenture });
  const creditSource = readCovenantSource({
    documentId: CA_ID,
    text: creditAgreement,
    skipSectionNumbers: replaced,
    skipClauses: replacedClauses,
  });
  const sixthSource = readCovenantSource({ documentId: SIXTH_ID, text: sixth });
  const baskets = [...indentureSource.clauses, ...creditSource.clauses, ...sixthSource.clauses];
  return {
    packageKey: MATTHEWS_PACKAGE_KEY,
    companyId: "matthews",
    instrumentKey: INDENTURE_ID,
    asOf: "2024-12-31",
    documents: [
      { documentId: INDENTURE_ID, role: "INDENTURE", text: indenture },
      { documentId: CA_ID, role: "CREDIT_AGREEMENT", text: creditAgreement },
      { documentId: SIXTH_ID, role: "OTHER", text: sixth },
      { documentId: "matw-10q-2024-12-31", role: "FINANCIAL_STATEMENT", text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025 },
      { documentId: "matw-compliance-certificate-q1-fy2025", role: "COMPLIANCE_CERTIFICATE", text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025 },
    ],
    baskets,
    sections: [...indentureSource.sections, ...creditSource.sections, ...sixthSource.sections],
    omissions: [
      {
        stableKey: "matw-omit-compliance-certificate",
        sectionRef: "Compliance certificate: CA EBITDA, Net Indebtedness, Senior Indebtedness, First Lien Debt, Eligible Cash Equivalents",
        covenantFamily: "FINANCIAL_COVENANT",
        reason:
          "EDGAR full-text search of CIK 0000063296 for a compliance certificate hits the credit agreement and the indenture (the delivery obligation), not a filed certificate. The in-repo certificate is a reconstruction and does not state those defined amounts. A delivered compliance certificate, or a filing that states them, would resolve the ratio computations.",
      },
    ],
  };
}
