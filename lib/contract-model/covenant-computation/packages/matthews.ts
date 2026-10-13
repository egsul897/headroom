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
import { extractBasketClauses, supersededSectionNumbers } from "../extract-baskets";
import type { BasketClause, ComputationPackage } from "../types";
import { norm } from "../text";

const INDENTURE_ID = "matw-indenture-2024-ex4-1";
const CA_ID = "matw-ca-fifth-amendment";
const SIXTH_ID = "matw-ca-sixth-amendment";

function loadOperative(name: string): string {
  return norm(readFileSync(join(process.cwd(), "tests/fixtures/edgar/matthews", name), "utf8"));
}

function aliasMatthews(clause: BasketClause): BasketClause {
  const text = clause.operativeText;
  const hit = ALIASES.find((alias) => alias.test(text));
  if (hit) return { ...clause, stableKey: hit.key, sectionRef: hit.section };
  const debt = clause.sectionRef.match(/^Permitted Debt \((\d+)\)$/);
  if (debt && clause.documentId === INDENTURE_ID) {
    return { ...clause, stableKey: `matw-pd-${debt[1]}`, sectionRef: clause.sectionRef };
  }
  return clause;
}

const ALIASES: { key: string; section: string; test: (text: string) => boolean }[] = [
  {
    key: "matw-pd-1a",
    section: "Permitted Debt (1)(a)",
    test: (text) => text.includes("not to exceed the sum of (a) $1,300.0 million"),
  },
  {
    key: "matw-pd-1bx",
    section: "Permitted Debt (1)(b)(x)",
    test: (text) => text.includes("(x) the Secured Net Leverage Ratio") && text.includes("3.50 to 1.00"),
  },
  {
    key: "matw-pd-1by",
    section: "Permitted Debt (1)(b)(y)",
    test: (text) =>
      text.includes("(y)") &&
      text.includes("First Lien Net Leverage Ratio") &&
      text.includes("2.50 to 1.00") &&
      text.includes("First Priority Obligations"),
  },
  {
    key: "matw-409a",
    section: "§4.09(a)",
    test: (text) =>
      /Fixed Charge Coverage Ratio/i.test(text) &&
      /2\.00 to 1\.00/.test(text) &&
      !/greater of/i.test(text),
  },
  {
    key: "matw-409a-proviso",
    section: "§4.09(a) non-guarantor proviso",
    test: (text) => /Non-Guarantor Subsidiaries/.test(text) && /greater of/i.test(text),
  },
  {
    key: "matw-410",
    section: "§4.10",
    test: (text) => text.includes("Section 4.10 Limitation on Liens.") && text.includes("except Permitted Liens"),
  },
  {
    key: "matw-514a",
    section: "Credit Agreement §5.14(a) Leverage Ratio",
    test: (text) => /shall maintain a Leverage Ratio/.test(text) && /4\.50 to 1\.00/.test(text),
  },
  {
    key: "matw-514a-temporary",
    section: "Credit Agreement §5.14(a) Temporary Leverage Increase Period",
    test: (text) => /required Leverage Ratio/.test(text) && /5\.00 to 1\.00/.test(text) && !/Senior/.test(text),
  },
  {
    key: "matw-514a-temporary-senior",
    section: "Credit Agreement §5.14(a) Temporary Senior Leverage Test Period",
    test: (text) => /Senior Leverage Ratio/.test(text) && /4\.00 to 1\.00/.test(text),
  },
  {
    key: "matw-514b",
    section: "Credit Agreement §5.14(b) Interest Coverage Ratio",
    test: (text) => /Interest Coverage Ratio/.test(text) && /3\.00 to 1\.0/.test(text),
  },
  {
    key: "matw-ca-601j",
    section: "§6.01(j)",
    test: (text) => text.includes("Liens securing Indebtedness under the 2024 Note Offering"),
  },
];

export function matthewsCovenantPackage(): ComputationPackage {
  const indenture = loadOperative("indenture-ex4-1.txt");
  const creditAgreement = loadOperative("credit-agreement-fifth-amendment.operative.txt");
  const sixth = loadOperative("credit-agreement-sixth-amendment.txt");
  const replaced = supersededSectionNumbers(sixth);
  const baskets = [
    ...extractBasketClauses({ documentId: INDENTURE_ID, text: indenture }),
    ...extractBasketClauses({ documentId: CA_ID, text: creditAgreement, skipSectionNumbers: replaced }),
    ...extractBasketClauses({ documentId: SIXTH_ID, text: sixth }),
  ].map(aliasMatthews);
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
