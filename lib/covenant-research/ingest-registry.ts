/**
 * Registry of already-acquired package discovery + compiled-IR sources for
 * Phase-2 corpus integration. No new EDGAR acquisition; no paid calls.
 */

import { loadFromSourceToCovenantExport } from "./canonical-adapters";
import { dedupeResearchEntries, attachIdentityFields } from "./identity";
import { ingestCompiledResults, type CompiledIngestSpec } from "./ingest-compiled";
import { ingestDiscoveryRun, type PackageIngestSpec } from "./ingest-discovery";
import { ingestNaturalSearchStructure, type StructureIngestSpec } from "./ingest-structure";
import { loadResearchCorpusFromFile } from "./corpus";
import { normalizeVerificationStatus, type ResearchCorpusEntry, type ResearchVerificationStatus } from "./types";

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

/** Phase-3 additions: SUP term loan package (issuer-disjoint from Phase-2 held-out). */
export function phase3DiscoverySpecs(): PackageIngestSpec[] {
  const SUP_DOCS: NonNullable<PackageIngestSpec["documentFilings"]> = {
    "doc-a": {
      url: "https://www.sec.gov/Archives/edgar/data/896622/000119312522315244/d403666dex101.htm",
      accession: "0001193125-22-315244",
      filedOn: "2022-12-15",
      documentName: "Term Loan Credit Agreement EX-10.1",
    },
    "doc-b": {
      url: "https://www.sec.gov/Archives/edgar/data/896622/000119312524214879/",
      accession: null,
      filedOn: "2024-08-14",
      documentName: "A&R Term Loan Credit Agreement",
    },
    "doc-c": {
      url: null,
      accession: null,
      filedOn: "2025-03-31",
      documentName: "First Amendment to A&R Credit Agreement",
    },
  };
  return [
    {
      packageId: "sup-term-loan",
      discoveryRunPath:
        "tests/fixtures/unseen-packages/final-lightweight-unseen-sup-run/stage2-all-discovery-candidates.json",
      issuer: {
        companyId: "sup-term-loan-2022-2025",
        name: "Superior Industries International, Inc.",
        ticker: "SUP",
        cik: "0000896622",
      },
      instrument: {
        instrumentKey: "sup-term-loan-facility",
        name: "Term Loan Credit Agreement (Superior Industries)",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: SUP_DOCS["doc-a"]!,
      documentFilings: SUP_DOCS,
    },
  ];
}

export function phase3CompiledSpecs(): CompiledIngestSpec[] {
  return [
    {
      packageId: "sup-term-loan",
      compiledResultsPath:
        "tests/fixtures/unseen-packages/final-lightweight-unseen-sup-run/stage6-compiled-results.json",
      issuer: {
        companyId: "sup-term-loan-2022-2025",
        name: "Superior Industries International, Inc.",
        ticker: "SUP",
        cik: "0000896622",
      },
      instrument: {
        instrumentKey: "sup-term-loan-facility",
        name: "Term Loan Credit Agreement (Superior Industries)",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: "https://www.sec.gov/Archives/edgar/data/896622/000119312522315244/d403666dex101.htm",
        accession: "0001193125-22-315244",
        filedOn: "2022-12-15",
        documentName: "Term Loan Credit Agreement EX-10.1",
      },
      documentFilings: {
        "doc-a": {
          url: "https://www.sec.gov/Archives/edgar/data/896622/000119312522315244/d403666dex101.htm",
          accession: "0001193125-22-315244",
          filedOn: "2022-12-15",
          documentName: "Term Loan Credit Agreement EX-10.1",
        },
        "doc-b": {
          url: null,
          accession: null,
          filedOn: "2024-08-14",
          documentName: "A&R Term Loan Credit Agreement",
        },
        "doc-c": {
          url: null,
          accession: null,
          filedOn: "2025-03-31",
          documentName: "First Amendment to A&R Credit Agreement",
        },
      },
    },
  ];
}

export function phase3StructureSpecs(): StructureIngestSpec[] {
  return [
    {
      packageId: "gibraltar-2026",
      naturalSearchPath:
        "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/natural-search.json",
      issuer: {
        companyId: "gibraltar-2026-credit-agreement",
        name: "Gibraltar Industries, Inc.",
        ticker: "ROCK",
        cik: "0000912562",
      },
      instrument: {
        instrumentKey: "gibraltar-2026-credit-facility",
        name: "Credit Agreement dated February 2, 2026",
        agreementType: "CREDIT_AGREEMENT",
      },
      filing: {
        url: "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
        accession: "0001140361-26-003087",
        filedOn: "2026-02-02",
        documentName: "Credit Agreement EX-10.1",
      },
      sourceDocumentId: "gibraltar-ex10-1",
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
  structureRawCount?: number;
  canonicalExportRawCount?: number;
  beforeDedupe: number;
  afterDedupe: number;
  duplicatesRemoved: number;
  newlyIndexedFromExistingData: number;
  distinctDocuments: number;
  distinctIssuers: number;
  distinctSourceSpans: number;
  verificationStatusDistribution: Record<string, number>;
  phase?: "phase2" | "phase3";
  entries: ResearchCorpusEntry[];
}

function statusDistribution(entries: readonly ResearchCorpusEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const k: ResearchVerificationStatus = normalizeVerificationStatus(e.verificationStatus);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function documentKey(e: ResearchCorpusEntry): string {
  return `${e.issuer.companyId}::${e.sourceDocumentId ?? e.filing.accession ?? e.filing.documentName ?? "unknown"}`;
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

  const docs = new Set(entries.map(documentKey));
  const issuers = new Set(entries.map((e) => e.issuer.companyId));
  const spans = new Set(entries.map((e) => e.sourceSpan?.excerptHash ?? e.entryId));

  return {
    curatedCount: curated.length,
    discoveryRawCount: discovery.length,
    compiledRawCount: compiled.length,
    structureRawCount: 0,
    canonicalExportRawCount: 0,
    beforeDedupe: before.length,
    afterDedupe: entries.length,
    duplicatesRemoved: removedCount,
    newlyIndexedFromExistingData: discovery.length + compiled.length,
    distinctDocuments: docs.size,
    distinctIssuers: issuers.size,
    distinctSourceSpans: spans.size,
    verificationStatusDistribution: statusDistribution(entries),
    phase: "phase2",
    entries,
  };
}

/**
 * Phase-3 corpus: Phase-2 sources + SUP discovery/compiled + Gibraltar structure
 * + any available CKF canonical exports (currently empty → blocker retained).
 */
export function buildPhase3ResearchCorpus(): CorpusBuildReport {
  const phase2 = buildPhase2ResearchCorpus();
  const discovery = phase3DiscoverySpecs().flatMap(ingestDiscoveryRun);
  const compiled = phase3CompiledSpecs().flatMap(ingestCompiledResults);
  const structure = phase3StructureSpecs().flatMap(ingestNaturalSearchStructure);
  const canonical = loadFromSourceToCovenantExport();
  const before = [...phase2.entries, ...discovery, ...compiled, ...structure, ...canonical];
  const { entries, removedCount } = dedupeResearchEntries(before);

  const docs = new Set(entries.map(documentKey));
  const issuers = new Set(entries.map((e) => e.issuer.companyId));
  const spans = new Set(entries.map((e) => e.sourceSpan?.excerptHash ?? e.entryId));

  return {
    curatedCount: phase2.curatedCount,
    discoveryRawCount: phase2.discoveryRawCount + discovery.length,
    compiledRawCount: phase2.compiledRawCount + compiled.length,
    structureRawCount: structure.length,
    canonicalExportRawCount: canonical.length,
    beforeDedupe: before.length,
    afterDedupe: entries.length,
    duplicatesRemoved: phase2.duplicatesRemoved + removedCount,
    newlyIndexedFromExistingData: discovery.length + compiled.length + structure.length + canonical.length,
    distinctDocuments: docs.size,
    distinctIssuers: issuers.size,
    distinctSourceSpans: spans.size,
    verificationStatusDistribution: statusDistribution(entries),
    phase: "phase3",
    entries,
  };
}
