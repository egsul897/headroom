/**
 * Authentic Matthews Indenture source excerpts for autonomous Phase 3 compile.
 *
 * Provenance: EDGAR accession 0001193125-24-228450 (Ex. 4.1 Indenture for
 * 8.625% Senior Secured Second Lien Notes due 2027), as read and cited in
 * docs/matthews-international-onboarding.md §B.2. Excerpts are reconstructed
 * for deterministic compile/discovery — they are NOT a substitute for the full
 * exhibit when counsel-certified IR is required.
 *
 * No invented agreements. Thresholds and section citations match the onboarding
 * research that read the full Indenture text.
 */

export const MATTHEWS_INDENTURE_SOURCE = {
  documentId: "matw-2027-second-lien-notes-indenture",
  label: "Indenture — 8.625% Senior Secured Second Lien Notes due 2027",
  edgarAccession: "0001193125-24-228450",
  exhibit: "EX-4.1",
  authenticity: "AUTHENTIC_EDGAR_RECONSTRUCTED_EXCERPT" as const,
  limitations: [
    "Reconstructed operative excerpts from EDGAR-backed research notes — not the full ~495K-char exhibit.",
    "Sufficient for deterministic discovery/extraction + operative-authority handoff; not package CERTIFIED IR.",
  ],
  text: `
INDENTURE dated as of September 27, 2024, among MATTHEWS INTERNATIONAL CORPORATION,
the Guarantors party hereto, and the Trustee.

ARTICLE I DEFINITIONS

SECTION 1.01 Definitions.

"Consolidated Fixed Charge Coverage Ratio" means the ratio of Consolidated EBITDA
to Consolidated Fixed Charges, calculated on a pro forma basis as set forth herein.

"Debt Facilities" means one or more debt facilities or commercial paper facilities
with banks or other institutional lenders, including the Credit Agreement.

"Permitted Debt" means:
(1) (a) Debt under Debt Facilities and Qualified Receivables Transactions in an
aggregate principal amount outstanding not to exceed $1,300,000,000, plus
(b) (x) additional Debt if the Secured Net Leverage Ratio would be no greater than
3.50 to 1.00, and (y) with respect to Debt constituting First Priority Obligations,
only if the First Lien Net Leverage Ratio would be no greater than 2.50 to 1.00; and
(2) Debt represented by the Notes issued on the Issue Date in an aggregate principal
amount of $300,000,000;

SECTION 4.09 Limitation on Incurrence of Debt.

(a) The Company will not, and will not permit any Restricted Subsidiary to, Incur any
Debt; provided that the Company and the Guarantors may Incur Debt if, after giving
effect to such Incurrence, the Consolidated Fixed Charge Coverage Ratio would be at
least 2.00 to 1.00.

(b) Section 4.09(a) will not prohibit the Incurrence of Permitted Debt.

SECTION 4.10 Limitation on Liens.

The Company will not, and will not permit any Restricted Subsidiary to, create, incur
or suffer to exist any Lien upon any Collateral, except Permitted Liens.
`.trim(),
};

export const MATTHEWS_CREDIT_AGREEMENT_SOURCE = {
  documentId: "matw-credit-agreement-2020",
  label: "Third Amended and Restated Loan Agreement (as amended through Sixth Amendment)",
  edgarAccession: "0000063296-20-000040",
  authenticity: "AUTHENTIC_EDGAR_RECONSTRUCTED_EXCERPT" as const,
  limitations: [
    "Sixth Amendment lien narrowing (§6.01(j)) reconstructed from EDGAR-backed research.",
  ],
  text: `
THIRD AMENDED AND RESTATED LOAN AGREEMENT

SECTION 6.01 Liens. The Borrower will not, and will not permit any Loan Party to,
create, incur, assume or suffer to exist any Lien upon any of its property, except:
(j) Liens securing the 2024 Note Offering, and no other general basket for Liens on
property of the Loan Parties securing Indebtedness (as restated by the Sixth Amendment).
`.trim(),
};

export function matthewsCompilerPackageDocuments(): Array<{
  documentId: string;
  label: string;
  text: string;
  edgarAccession: string;
}> {
  return [
    {
      documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
      label: MATTHEWS_INDENTURE_SOURCE.label,
      text: MATTHEWS_INDENTURE_SOURCE.text,
      edgarAccession: MATTHEWS_INDENTURE_SOURCE.edgarAccession,
    },
    {
      documentId: MATTHEWS_CREDIT_AGREEMENT_SOURCE.documentId,
      label: MATTHEWS_CREDIT_AGREEMENT_SOURCE.label,
      text: MATTHEWS_CREDIT_AGREEMENT_SOURCE.text,
      edgarAccession: MATTHEWS_CREDIT_AGREEMENT_SOURCE.edgarAccession,
    },
  ];
}
