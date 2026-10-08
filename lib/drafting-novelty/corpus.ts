/**
 * Document registry for rare-covenant drafting discovery.
 *
 * CORPUS = packages Headroom has heavily exercised (known fixtures).
 * PROBE  = other public financing extracts used to hunt rare drafting.
 *
 * Paths are repo-relative. No network / paid calls.
 */
import type { DocumentSource } from "./types";

export const DOCUMENT_REGISTRY: DocumentSource[] = [
  // ----- CORPUS (known Headroom fixtures) -----
  {
    documentId: "corpus-conmed-article-vii",
    packageId: "conmed-2025-credit-facility",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    label: "CONMED Article VII negative covenants (curated)",
    publicSourceNote: "Public CONMED credit agreement exhibits curated in-repo",
  },
  {
    documentId: "corpus-conmed-definitions",
    packageId: "conmed-2025-credit-facility",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt",
    label: "CONMED definitions excerpt (curated)",
    publicSourceNote: "Public CONMED credit agreement exhibits curated in-repo",
  },
  {
    documentId: "corpus-conmed-second-amendment",
    packageId: "conmed-2025-credit-facility",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt",
    label: "CONMED Second Amendment 2022 (curated)",
    publicSourceNote: "Public CONMED amendment exhibit curated in-repo",
  },
  {
    documentId: "corpus-fwrg-article-6",
    packageId: "fwrg-2021-credit-agreement",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
    label: "FWRG Article 6 negative covenants",
    publicSourceNote: "Public First Watch credit agreement excerpt",
  },
  {
    documentId: "corpus-fwrg-definitions",
    packageId: "fwrg-2021-credit-agreement",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt",
    label: "FWRG definitions excerpt",
    publicSourceNote: "Public First Watch credit agreement excerpt",
  },
  {
    documentId: "corpus-lsb-article-6",
    packageId: "lsb-2023-abl-credit-agreement",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
    label: "LSB Article 6 negative covenants",
    publicSourceNote: "Public LSB ABL credit agreement excerpt",
  },
  {
    documentId: "corpus-lsb-definitions",
    packageId: "lsb-2023-abl-credit-agreement",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
    label: "LSB definitions excerpt",
    publicSourceNote: "Public LSB ABL credit agreement excerpt",
  },
  {
    documentId: "corpus-lsb-intercreditor-joinder",
    packageId: "lsb-2023-abl-credit-agreement",
    role: "CORPUS",
    path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt",
    label: "LSB Intercreditor Joinder",
    publicSourceNote: "Public LSB intercreditor joinder exhibit",
  },

  // ----- PROBE (public financing extracts for novelty hunt) -----
  {
    documentId: "probe-chwy-2026-ca",
    packageId: "chwy-2026-credit-agreement",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    label: "Chewy 2026 Credit Agreement",
    publicSourceNote: "SEC EDGAR public credit agreement extract",
  },
  {
    documentId: "probe-dsgr-2022-arca",
    packageId: "dsgr-2022-2025-credit-facility",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
    label: "DSGR 2022 A&R Credit Agreement",
    publicSourceNote: "SEC EDGAR public credit agreement extract",
  },
  {
    documentId: "probe-dsgr-2025-second-arca",
    packageId: "dsgr-2022-2025-credit-facility",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
    label: "DSGR 2025 Second A&R Credit Agreement",
    publicSourceNote: "SEC EDGAR public credit agreement extract",
  },
  {
    documentId: "probe-riot-2025-ca",
    packageId: "riot-2025-2026-credit-facility",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
    label: "Riot 2025 Credit Agreement",
    publicSourceNote: "SEC EDGAR public credit agreement extract",
  },
  {
    documentId: "probe-riot-2026-second-arca",
    packageId: "riot-2025-2026-credit-facility",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
    label: "Riot 2026 Second A&R Credit Agreement",
    publicSourceNote: "SEC EDGAR public credit agreement extract",
  },
  {
    documentId: "probe-sup-2022-tlca",
    packageId: "final-lightweight-unseen-sup",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt",
    label: "Superior Industries 2022 Term Loan CA",
    publicSourceNote: "SEC EDGAR public term loan credit agreement extract",
  },
  {
    documentId: "probe-gibraltar-2026-ca",
    packageId: "gibraltar-2026-credit-agreement",
    role: "PROBE",
    path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    label: "Gibraltar 2026 Credit Agreement",
    publicSourceNote: "SEC EDGAR public credit agreement extract",
  },
];
