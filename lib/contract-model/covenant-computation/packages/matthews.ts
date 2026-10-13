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
import type { BasketClause, ComputationPackage } from "../types";
import { excerptFrom, excerptThrough, norm } from "../text";

const INDENTURE_ID = "matw-indenture-2024-ex4-1";
const CA_ID = "matw-ca-fifth-amendment";
const SIXTH_ID = "matw-ca-sixth-amendment";

const PERMITTED_DEBT_STARTS = [
  "(2) Debt under the Notes issued on the Issue Date",
  "(3) Debt under the Existing Notes outstanding on the Issue Date",
  "(4) Debt of the Company or any Restricted Subsidiary outstanding on the Issue Date",
  "(5) Guarantees by the Company or Restricted Subsidiaries of Debt permitted",
  "(6) Debt of the Company owing to and held by any Restricted Subsidiary",
  "(7) Debt Incurred in respect of workers",
  "(8) Debt under Swap Contracts and Hedging Obligations that are Incurred in the ordinary course of business",
  "(9) Debt of the Company or any Restricted Subsidiary pursuant to Capital Lease",
  "(10) Debt arising from agreements of the Company or a Restricted Subsidiary providing for",
  "(11) Debt arising from the honoring by a bank",
  "(12) obligations of the Company or its Subsidiaries in respect of customer advances",
  "(13) Debt of Foreign Subsidiaries in an aggregate amount",
  "(14) performance bonds or performance guaranties",
  "(15) (i) Debt of Persons Incurred and outstanding",
  "(16) Debt of the Company or any Restricted Subsidiary not otherwise permitted",
  "(17) the Incurrence by the Company or any Restricted Subsidiary of Refinancing Debt",
  "(18) the issuance by any of the",
  "(19) Debt arising in connection with endorsement of instruments",
  "(20) Debt evidenced by promissory notes subordinated",
  "(21) the issuance by a Receivable Subsidiary of a Purchase Money Note",
  "(22) Debt incurred in connection with Federal",
] as const;

function loadOperative(name: string): string {
  return norm(readFileSync(join(process.cwd(), "tests/fixtures/edgar/matthews", name), "utf8"));
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

function orderedSlices(text: string, starts: readonly string[], end: string): string[] {
  const positions: number[] = [];
  let from = 0;
  for (const start of starts) {
    const at = text.indexOf(start, from);
    if (at < 0) throw new Error(`covenant computation: source marker missing: ${start.slice(0, 70)}`);
    positions.push(at);
    from = at + start.length;
  }
  const endAt = text.indexOf(end, from);
  if (endAt < 0) throw new Error(`covenant computation: source end marker missing: ${end.slice(0, 70)}`);
  return positions.map((at, index) => text.slice(at, index + 1 < positions.length ? positions[index + 1]! : endAt).trim());
}

function indentureBaskets(text: string): BasketClause[] {
  const facilities = excerptFrom(
    text,
    "not to exceed the sum of (a) $1,300.0 million",
    " and (b) an amount of Debt",
  );
  const secured = excerptFrom(
    text,
    "(x) the Secured Net Leverage Ratio",
    " and (y) in the case of Debt",
  );
  const firstLien = excerptThrough(
    text,
    "(y) in the case of Debt that constitutes First Priority Obligations",
    "2.50 to 1.00",
  );
  const later = orderedSlices(
    text,
    PERMITTED_DEBT_STARTS,
    "If any Debt incurred by the Company or any Restricted Subsidiary would qualify",
  );
  const numbered = later.map((operativeText, index) =>
    clause(`matw-pd-${index + 2}`, `Permitted Debt (${index + 2})`, "DEBT_INCURRENCE", INDENTURE_ID, operativeText),
  );
  return [
    clause("matw-pd-1a", "Permitted Debt (1)(a)", "DEBT_INCURRENCE", INDENTURE_ID, facilities),
    clause("matw-pd-1bx", "Permitted Debt (1)(b)(x)", "DEBT_INCURRENCE", INDENTURE_ID, secured),
    clause("matw-pd-1by", "Permitted Debt (1)(b)(y)", "DEBT_INCURRENCE", INDENTURE_ID, firstLien),
    ...numbered,
    clause(
      "matw-409a",
      "§4.09(a)",
      "DEBT_INCURRENCE",
      INDENTURE_ID,
      excerptThrough(text, "Section 4.09 Limitation on Incurrence of Debt. (a)", "2.00 to 1.00"),
    ),
    clause(
      "matw-409a-proviso",
      "§4.09(a) non-guarantor proviso",
      "DEBT_INCURRENCE",
      INDENTURE_ID,
      excerptThrough(
        text,
        "the aggregate principal amount of Debt Incurred by Non-Guarantor Subsidiaries pursuant to this Section 4.09(a)",
        "in the aggregate.",
      ),
    ),
    clause(
      "matw-410",
      "§4.10",
      "LIENS",
      INDENTURE_ID,
      excerptFrom(text, "Section 4.10 Limitation on Liens.", "Any Lien created for the benefit of Holders"),
    ),
  ];
}

function creditAgreementBaskets(text: string, sixth: string): BasketClause[] {
  return [
    clause(
      "matw-514a",
      "Credit Agreement §5.14(a) Leverage Ratio",
      "FINANCIAL_COVENANT",
      CA_ID,
      excerptThrough(
        text,
        "(a) Leverage Ratio. The US Borrower and its Subsidiaries shall maintain a Leverage Ratio",
        "4.50 to 1.00",
      ),
    ),
    clause(
      "matw-514a-temporary",
      "Credit Agreement §5.14(a) Temporary Leverage Increase Period",
      "FINANCIAL_COVENANT",
      CA_ID,
      excerptThrough(text, "(x) the required Leverage Ratio", "5.00 to 1.00"),
    ),
    clause(
      "matw-514a-temporary-senior",
      "Credit Agreement §5.14(a) Temporary Senior Leverage Test Period",
      "FINANCIAL_COVENANT",
      CA_ID,
      excerptThrough(text, "(y) the required Senior Leverage Ratio", "4.00 to 1.00"),
    ),
    clause(
      "matw-514b",
      "Credit Agreement §5.14(b) Interest Coverage Ratio",
      "FINANCIAL_COVENANT",
      CA_ID,
      excerptThrough(
        text,
        "(b) Interest Coverage Ratio. The US Borrower and its Subsidiaries shall maintain an Interest Coverage Ratio",
        "3.00 to 1.0.",
      ),
    ),
    clause(
      "matw-ca-601j",
      "§6.01(j)",
      "LIENS",
      SIXTH_ID,
      excerptFrom(sixth, "(j) Liens securing Indebtedness under the 2024 Note Offering", "; (k)"),
    ),
  ];
}

export function matthewsCovenantPackage(): ComputationPackage {
  const indenture = loadOperative("indenture-ex4-1.txt");
  const creditAgreement = loadOperative("credit-agreement-fifth-amendment.operative.txt");
  const sixth = loadOperative("credit-agreement-sixth-amendment.txt");
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
    baskets: [...indentureBaskets(indenture), ...creditAgreementBaskets(creditAgreement, sixth)],
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
