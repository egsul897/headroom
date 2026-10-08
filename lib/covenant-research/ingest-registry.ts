/**
 * Registry of already-acquired package discovery + compiled-IR sources for
 * Phase-2 corpus integration. No new EDGAR acquisition; no paid calls.
 */

import { dedupeResearchEntries, attachIdentityFields } from "./identity";
import { ingestCompiledResults, type CompiledIngestSpec } from "./ingest-compiled";
import { ingestDiscoveryRun, type PackageIngestSpec } from "./ingest-discovery";
import { loadResearchCorpusFromFile } from "./corpus";
import type { ResearchCorpusEntry, ResearchVerificationStatus } from "./types";

const DSGR_DOCS: NonNullable<PackageIngestSpec["documentFilings"]> = {
  "doc-a": {
    url: "https://www.sec.gov/Archives/edgar/data/703604/000119312522095177/d345714dex102.htm",
    accession: "0001193125-22-095177",
    filedOn: "2022-04-04",
    documentName: "A&R Credit Agreement EX-10.2",
  },
  "doc-b": {
    url: "https://www.sec.gov/Archives/edgar/data/703604/000119312524202196/d885541dex101.htm",
    accession: "0001193125-24-202196",
    filedOn: "2024-08-16",
    documentName: "Third Amendment EX-10.1",
  },
  "doc-c": {
    url: "https://www.sec.gov/Archives/edgar/data/703604/000119312525070858/d906948dex101.htm",
    accession: "0001193125-25-070858",
    filedOn: "2025-04-02",
    documentName: "Fourth Amendment EX-10.1",
  },
  "doc-d": {
    url: "https://www.sec.gov/Archives/edgar/data/703604/000119312525328786/d83410dex101.htm",
    accession: "0001193125-25-328786",
    filedOn: "2025-12-22",
    documentName: "Second A&R Credit Agreement EX-10.1",
  },
};

export function phase2DiscoverySpecs(): PackageIngestSpec[] {
  return [
    {
      packageId: "fwrg-2021",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json",
      issuer: {
        companyId: "fwrg-2021-credit-agreement",
        name: "First Watch Restaurant Group, Inc.",
        ticker: "FWRG",
        cik: "0001789940",
      },
      instrument: {
        instrumentKey: "fwrg-2021-credit-facility",
        name: "Credit Agreement dated October 6, 2021",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: "https://www.sec.gov/Archives/edgar/data/1789940/000119312521293207/d212487dex101.htm",
        accession: "0001193125-21-293207",
        filedOn: "2021-10-06",
        documentName: "Credit Agreement (EX-10.1)",
      },
    },
    {
      packageId: "lsb-2023",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json",
      issuer: {
        companyId: "lsb-2023-abl-credit-agreement",
        name: "LSB Industries, Inc.",
        ticker: "LXU",
        cik: "0000060714",
      },
      instrument: {
        instrumentKey: "lsb-2023-abl-facility",
        name: "ABL Credit Agreement dated December 21, 2023",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: "https://www.sec.gov/Archives/edgar/data/60714/000119312523303035/d614151dex101.htm",
        accession: "0001193125-23-303035",
        filedOn: "2023-12-26",
        documentName: "Credit Agreement (EX-10.1)",
      },
    },
    {
      packageId: "dsgr-3f",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage2-all-discovery-candidates.json",
      issuer: {
        companyId: "dsgr-phase-3f-unseen",
        name: "Distribution Solutions Group, Inc.",
        ticker: "DSGR",
        cik: "0000703604",
      },
      instrument: {
        instrumentKey: "dsgr-credit-facility-instrument",
        name: "DSGR multi-document credit facility",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: DSGR_DOCS["doc-a"]!,
      documentFilings: DSGR_DOCS,
    },
    {
      packageId: "chwy-2026",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json",
      issuer: {
        companyId: "chwy-2026-credit-agreement",
        name: "Chewy, Inc.",
        ticker: "CHWY",
        cik: "0001766502",
      },
      instrument: {
        instrumentKey: "chwy-2026-credit-facility",
        name: "Credit Agreement dated June 23, 2026",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: "https://www.sec.gov/Archives/edgar/data/1766502/000119312526281042/",
        accession: "0001193125-26-281042",
        filedOn: "2026-06-24",
        documentName: "Credit Agreement EX-10.1",
      },
    },
    {
      packageId: "conmed-2f",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f1/discovery-candidates.json",
      issuer: {
        companyId: "conmed-2025-credit-facility",
        name: "CONMED Corporation",
        ticker: "CNMD",
        cik: "0000816956",
      },
      instrument: {
        instrumentKey: "conmed-eighth-ar-credit-facility",
        name: "Eighth Amended and Restated Credit Agreement",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: "https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/ex10-1.htm",
        accession: "0001174947-25-000941",
        filedOn: "2025-06-16",
        documentName: "Eighth A&R Credit Agreement EX-10.1",
      },
    },
    {
      packageId: "riot-3f2",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run/stage2-all-discovery-candidates.json",
      issuer: {
        companyId: "riot-2025-2026-credit-facility",
        name: "Riot Platforms package (fixture)",
        ticker: null,
        cik: null,
      },
      instrument: {
        instrumentKey: "riot-credit-facility-instrument",
        name: "Riot multi-document credit facility",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: null,
        accession: null,
        filedOn: null,
        documentName: "Riot package document",
      },
    },
  ];
}

export function phase2CompiledSpecs(): CompiledIngestSpec[] {
  return [
    {
      packageId: "dsgr-3f",
      compiledResultsPath:
        "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage6-compiled-results.json",
      issuer: {
        companyId: "dsgr-phase-3f-unseen",
        name: "Distribution Solutions Group, Inc.",
        ticker: "DSGR",
        cik: "0000703604",
      },
      instrument: {
        instrumentKey: "dsgr-credit-facility-instrument",
        name: "DSGR multi-document credit facility",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: DSGR_DOCS["doc-a"]!,
      documentFilings: DSGR_DOCS,
    },
    {
      packageId: "riot-3f2",
      compiledResultsPath:
        "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run/stage6-compiled-results.json",
      issuer: {
        companyId: "riot-2025-2026-credit-facility",
        name: "Riot Platforms package (fixture)",
        ticker: null,
        cik: null,
      },
      instrument: {
        instrumentKey: "riot-credit-facility-instrument",
        name: "Riot multi-document credit facility",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: { url: null, accession: null, filedOn: null, documentName: "Riot package document" },
    },
  ];
}

export interface CorpusBuildReport {
  curatedCount: number;
  discoveryRawCount: number;
  compiledRawCount: number;
  beforeDedupe: number;
  afterDedupe: number;
  duplicatesRemoved: number;
  newlyIndexedFromExistingData: number;
  distinctDocuments: number;
  distinctIssuers: number;
  verificationStatusDistribution: Record<string, number>;
  entries: ResearchCorpusEntry[];
}

function statusDistribution(entries: readonly ResearchCorpusEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const k: ResearchVerificationStatus = e.verificationStatus;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Build the Phase-2 research corpus: curated fixtures + all available
 * discovery/compiled records from already-acquired packages, deduped.
 */
export function buildPhase2ResearchCorpus(): CorpusBuildReport {
  const curated = loadResearchCorpusFromFile().map((e) =>
    attachIdentityFields({ ...e, verificationStatus: e.verificationStatus ?? "FIXTURE" }),
  );

  const discovery = phase2DiscoverySpecs().flatMap(ingestDiscoveryRun);
  const compiled = phase2CompiledSpecs().flatMap(ingestCompiledResults);
  const before = [...curated, ...discovery, ...compiled];
  const { entries, removedCount } = dedupeResearchEntries(before);

  const docs = new Set(
    entries.map((e) => `${e.issuer.companyId}::${e.sourceDocumentId ?? e.filing.accession ?? e.filing.documentName}`),
  );
  const issuers = new Set(entries.map((e) => e.issuer.companyId));

  return {
    curatedCount: curated.length,
    discoveryRawCount: discovery.length,
    compiledRawCount: compiled.length,
    beforeDedupe: before.length,
    afterDedupe: entries.length,
    duplicatesRemoved: removedCount,
    newlyIndexedFromExistingData: discovery.length + compiled.length,
    distinctDocuments: docs.size,
    distinctIssuers: issuers.size,
    verificationStatusDistribution: statusDistribution(entries),
    entries,
  };
}
