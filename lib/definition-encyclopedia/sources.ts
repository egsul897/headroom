/**
 * Source catalog for the Definition Encyclopedia.
 * Paths are repo-relative fixture texts (EDGAR-derived / curated extracts already in-tree).
 */

export interface EncyclopediaSourceSpec {
  sourceId: string;
  packageKey: string;
  documentId: string;
  documentLabel: string;
  agreementVersion: string;
  documentType: "CREDIT_AGREEMENT" | "INDENTURE" | "AMENDMENT" | "ANCILLARY" | "DEFINITIONS_EXCERPT" | "OTHER";
  retrievalPath: string;
}

export const ENCYCLOPEDIA_SOURCES: EncyclopediaSourceSpec[] = [
  {
    sourceId: "chwy-2026-ca",
    packageKey: "chwy-2026-credit-agreement",
    documentId: "chwy-doc-a-2026-06-23",
    documentLabel: "Chewy, Inc. Credit Agreement dated June 23, 2026",
    agreementVersion: "2026-06-23 Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
  },
  {
    sourceId: "gibraltar-2026-ca",
    packageKey: "gibraltar-2026-credit-agreement",
    documentId: "gibraltar-doc-a-2026",
    documentLabel: "Gibraltar Industries Credit Agreement (2026 EDGAR extract)",
    agreementVersion: "2026 Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
  },
  {
    sourceId: "dsgr-2022-arca",
    packageKey: "dsgr-2022-2025-credit-facility",
    documentId: "dsgr-doc-a-2022",
    documentLabel: "Distribution Solutions Group Amended & Restated Credit Agreement (2022)",
    agreementVersion: "2022 A&R Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
  },
  {
    sourceId: "dsgr-2024-third-amd",
    packageKey: "dsgr-2022-2025-credit-facility",
    documentId: "dsgr-doc-b-2024",
    documentLabel: "DSGR Third Amendment (2024) (restated definitions present in extract)",
    agreementVersion: "2024 Third Amendment",
    documentType: "AMENDMENT",
    retrievalPath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
  },
  {
    sourceId: "dsgr-2025-second-arca",
    packageKey: "dsgr-2022-2025-credit-facility",
    documentId: "dsgr-doc-d-2025",
    documentLabel: "DSGR Second Amended & Restated Credit Agreement (2025)",
    agreementVersion: "2025 Second A&R Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
  },
  {
    sourceId: "sup-2022-tlca",
    packageKey: "final-lightweight-unseen-sup",
    documentId: "sup-doc-a-2022",
    documentLabel: "Superior Industries Term Loan Credit Agreement (2022-12-15)",
    agreementVersion: "2022-12-15 Term Loan Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt",
  },
  {
    sourceId: "sup-2024-artlca",
    packageKey: "final-lightweight-unseen-sup",
    documentId: "sup-doc-b-2024",
    documentLabel: "Superior Industries Amended & Restated Term Loan Credit Agreement (2024-08-14)",
    agreementVersion: "2024-08-14 A&R Term Loan Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt",
  },
  {
    sourceId: "sup-2025-first-amd",
    packageKey: "final-lightweight-unseen-sup",
    documentId: "sup-doc-c-2025",
    documentLabel: "Superior Industries First Amendment (2025-03-31)",
    agreementVersion: "2025-03-31 First Amendment",
    documentType: "AMENDMENT",
    retrievalPath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt",
  },
  {
    sourceId: "conmed-2025-defs",
    packageKey: "conmed-2025-credit-facility",
    documentId: "conmed-doc-a-defs-excerpt",
    documentLabel: "CONMED Eighth A&R Credit Agreement (2025-06-10) — curated definitions excerpt",
    agreementVersion: "2025-06-10 Eighth A&R Credit Agreement (definitions excerpt)",
    documentType: "DEFINITIONS_EXCERPT",
    retrievalPath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt",
  },
  {
    sourceId: "conmed-gca",
    packageKey: "conmed-2025-credit-facility",
    documentId: "conmed-doc-b-gca",
    documentLabel: "CONMED Amended & Restated Guarantee and Collateral Agreement (2025-06-10)",
    agreementVersion: "2025-06-10 Guarantee and Collateral Agreement",
    documentType: "ANCILLARY",
    retrievalPath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt",
  },
  {
    sourceId: "fwrg-2021-defs",
    packageKey: "fwrg-2021-credit-agreement",
    documentId: "fwrg-defs-excerpt",
    documentLabel: "First Watch Restaurant Group Credit Agreement (2021) — definitions excerpt",
    agreementVersion: "2021 Credit Agreement (definitions excerpt)",
    documentType: "DEFINITIONS_EXCERPT",
    retrievalPath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt",
  },
  {
    sourceId: "lsb-2023-defs",
    packageKey: "lsb-2023-abl-credit-agreement",
    documentId: "lsb-defs-excerpt",
    documentLabel: "LSB Industries ABL Credit Agreement (2023) — definitions excerpt",
    agreementVersion: "2023 ABL Credit Agreement (definitions excerpt)",
    documentType: "DEFINITIONS_EXCERPT",
    retrievalPath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
  },
  {
    sourceId: "riot-2025a-ca",
    packageKey: "riot-2025-2026-credit-facility",
    documentId: "riot-doc-a-2025-04-22",
    documentLabel: "Riot Platforms Credit Agreement (2025-04-22)",
    agreementVersion: "2025-04-22 Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
  },
  {
    sourceId: "riot-2025b-arca",
    packageKey: "riot-2025-2026-credit-facility",
    documentId: "riot-doc-b-2025-05-19",
    documentLabel: "Riot Platforms Amended & Restated Credit Agreement (2025-05-19)",
    agreementVersion: "2025-05-19 A&R Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt",
  },
  {
    sourceId: "riot-2026-second-arca",
    packageKey: "riot-2025-2026-credit-facility",
    documentId: "riot-doc-c-2026-04-21",
    documentLabel: "Riot Platforms Second Amended & Restated Credit Agreement (2026-04-21)",
    agreementVersion: "2026-04-21 Second A&R Credit Agreement",
    documentType: "CREDIT_AGREEMENT",
    retrievalPath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
  },
];
