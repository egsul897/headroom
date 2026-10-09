/**
 * CONMED authentic demo package catalog — fixture paths + document identity.
 * Source of truth for bytes: tests/fixtures/unseen-packages/conmed-2025-credit-facility/
 * No capacity formulas — capacity remains NOT_DETERMINABLE until financials + IR exist.
 */

export const CONMED_DEMO_COMPANY_ID = "conmed-demo";
export const CONMED_DEMO_PACKAGE_KEY = "conmed-2025-credit-facility";

export const CONMED_DEMO_COMPANY = {
  id: CONMED_DEMO_COMPANY_ID,
  name: "CONMED Corporation",
  ticker: "CNMD",
  cik: "0000816956",
  currency: "USD",
} as const;

export interface ConmedDemoDocumentSpec {
  /** Stable Document.id for idempotent upsert */
  id: string;
  name: string;
  type:
    | "AMENDED_AND_RESTATED_AGREEMENT"
    | "SECURITY_AGREEMENT"
    | "AMENDMENT"
    | "OTHER_DEBT_DOCUMENT";
  governs: string;
  executedOn: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesDocumentId: string | null;
  originalFilename: string;
  rawRelativePath: string;
  curatedRelativePath: string | null;
  accession: string;
  sourceUrl: string;
  role: string;
  unresolvedNote?: string;
}

const ROOT = "tests/fixtures/unseen-packages/conmed-2025-credit-facility";

export const CONMED_DEMO_DOCUMENTS: ConmedDemoDocumentSpec[] = [
  {
    id: "conmed-demo-doc-a",
    name: "Eighth Amended and Restated Credit Agreement (June 10, 2025)",
    type: "AMENDED_AND_RESTATED_AGREEMENT",
    governs: "Senior secured credit facility — Parent Borrower CONMED Corporation",
    executedOn: "2025-06-10",
    effectiveFrom: "2025-06-10",
    effectiveTo: null,
    supersedesDocumentId: null,
    originalFilename: "ex10-1-eighth-ar-credit-agreement-2025-06-16.htm",
    rawRelativePath: `${ROOT}/raw-source/ex10-1-eighth-ar-credit-agreement-2025-06-16.htm`,
    curatedRelativePath: `${ROOT}/curated/base-credit-agreement-article-vii-negative-covenants.txt`,
    accession: "0001174947-25-000941",
    sourceUrl:
      "https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/ex10-1.htm",
    role: "BASE_CREDIT_AGREEMENT",
  },
  {
    id: "conmed-demo-doc-b",
    name: "Amended and Restated Guarantee and Collateral Agreement (June 10, 2025)",
    type: "SECURITY_AGREEMENT",
    governs: "Guarantee and collateral for the Eighth A&R Credit Agreement",
    executedOn: "2025-06-10",
    effectiveFrom: "2025-06-10",
    effectiveTo: null,
    supersedesDocumentId: null,
    originalFilename: "ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm",
    rawRelativePath: `${ROOT}/raw-source/ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm`,
    curatedRelativePath: `${ROOT}/curated/guarantee-and-collateral-agreement-full.txt`,
    accession: "0001174947-25-000941",
    sourceUrl:
      "https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/ex10-2.htm",
    role: "GUARANTEE_AND_COLLATERAL",
  },
  {
    id: "conmed-demo-doc-c",
    name: "Second Amendment to Seventh A&R Credit Agreement (August 1, 2022)",
    type: "AMENDMENT",
    governs: "Amends prior Seventh A&R (out of package) — not Document A",
    executedOn: "2022-08-01",
    effectiveFrom: "2022-08-01",
    effectiveTo: null,
    supersedesDocumentId: null,
    originalFilename: "ex10-2-second-amendment-2022-08-02.htm",
    rawRelativePath: `${ROOT}/raw-source/ex10-2-second-amendment-2022-08-02.htm`,
    curatedRelativePath: `${ROOT}/curated/second-amendment-2022-full.txt`,
    accession: "0001193125-22-209154",
    sourceUrl:
      "https://www.sec.gov/Archives/edgar/data/816956/000119312522209154/d220699dex102.htm",
    role: "OUT_OF_PACKAGE_AMENDMENT",
    unresolvedNote:
      "Amends the Seventh A&R (July 16, 2021), which is not in this package. Do not attach to Document A.",
  },
  {
    id: "conmed-demo-doc-d",
    name: "First Omnibus Amendment and Increased Facility Activation Notice (May 27, 2026)",
    type: "AMENDMENT",
    governs: "Amends Document A and Document B; adds $450M Term A-2",
    executedOn: "2026-05-27",
    effectiveFrom: "2026-05-27",
    effectiveTo: null,
    supersedesDocumentId: null,
    originalFilename: "ex10-1-first-omnibus-amendment-2026-06-01.htm",
    rawRelativePath: `${ROOT}/raw-source/ex10-1-first-omnibus-amendment-2026-06-01.htm`,
    curatedRelativePath: `${ROOT}/curated/first-omnibus-amendment-2026-curated.txt`,
    accession: "0002077096-26-000190",
    sourceUrl:
      "https://www.sec.gov/Archives/edgar/data/816956/000207709626000190/ea029246401ex10-1.htm",
    role: "IN_PACKAGE_OMNIBUS_AMENDMENT",
  },
];
