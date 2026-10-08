/**
 * Ingest already-acquired discovery-candidate fixtures into ResearchCorpusEntry
 * rows. Zero EDGAR / zero paid model calls — reuses pinned package runs only.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { normalizeCorpusEntry } from "./corpus";
import { featuresFromText, mapSupersessionToOperative } from "./features";
import { attachIdentityFields } from "./identity";
import type { ResearchCorpusEntry } from "./types";

export interface PackageIngestSpec {
  packageId: string;
  discoveryRunPath: string;
  issuer: ResearchCorpusEntry["issuer"];
  instrument: ResearchCorpusEntry["instrument"];
  filing: ResearchCorpusEntry["filing"];
  /** Max candidates; omit/undefined = ingest all with a source citation. */
  limit?: number;
  /** Optional map documentId → filing override (multi-doc packages). */
  documentFilings?: Record<string, ResearchCorpusEntry["filing"]>;
}

function loadCandidateArray(path: string): Array<Record<string, unknown>> {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.candidates)) return obj.candidates as Array<Record<string, unknown>>;
    // Some freeze files nest under results/allCandidates
    for (const key of ["allCandidates", "discoveredCandidates", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function priorityOf(features: ReturnType<typeof featuresFromText>, description: string): number {
  let priority = 0;
  if (features.moneyAmountsUsd.length) priority += 3;
  if (features.hasRatioGate) priority += 2;
  if (features.hasSpringingTest) priority += 3;
  if (features.hasReclassification) priority += 2;
  if (features.hasSynergyAddback) priority += 2;
  if (features.conditionTypes.includes("NO_DEFAULT")) priority += 1;
  if (/basket|except|permitted/.test(description.toLowerCase())) priority += 1;
  return priority;
}

export function ingestDiscoveryRun(spec: PackageIngestSpec): ResearchCorpusEntry[] {
  const path = resolve(process.cwd(), spec.discoveryRunPath);
  if (!existsSync(path)) return [];
  const candidates = loadCandidateArray(path);

  const scored = candidates
    .filter((c) => typeof c.sourceCitation === "string" && String(c.sourceCitation).trim().length > 20)
    .map((c, idx) => {
      const citation = String(c.sourceCitation);
      const description = String(c.description ?? "");
      const families = Array.isArray(c.families) ? (c.families as string[]) : [];
      const family = families[0] ?? "QUALITATIVE_NEGATIVE_COVENANTS";
      const features = featuresFromText({ families, description, sourceCitation: citation });
      const documentId = typeof c.documentId === "string" ? c.documentId : null;
      const filing = (documentId && spec.documentFilings?.[documentId]) || spec.filing;
      const operativeStatus = mapSupersessionToOperative(c.supersessionStatus);
      const extractionVersion =
        typeof c.discoveryRunVersion === "string" ? c.discoveryRunVersion : "discovery-unknown";

      const missingDependencies =
        c.definedTermDependencyLikely === true
          ? [
              {
                kind: "DEFINED_TERM_DEPENDENCY_LIKELY",
                description:
                  "Discovery flagged likely defined-term dependency; definition text was not attached at ingest.",
                disclosed: true as const,
              },
            ]
          : [];

      const entry = normalizeCorpusEntry({
        entryId: `discovery:${spec.packageId}:${String(c.discoveryId ?? `${documentId}-${c.normalizedSourceRef}-${idx}`)}`,
        kind: "RULE",
        issuer: spec.issuer,
        instrument: spec.instrument,
        filing,
        covenantFamily: family,
        ruleType: typeof c.role === "string" ? String(c.role) : null,
        action: null,
        operativeVersion: {
          status: operativeStatus,
          effectiveFrom: filing.filedOn,
          effectiveTo: null,
          supersededByEntryId: null,
        },
        sourceExcerpt: citation,
        sourceCitation:
          typeof c.normalizedSourceRef === "string" ? `§${c.normalizedSourceRef}` : citation.slice(0, 120),
        sourceSectionRef: typeof c.normalizedSourceRef === "string" ? String(c.normalizedSourceRef) : null,
        relevantDefinitions: [],
        relatedConditions: features.conditionTypes.map((type) => ({
          type,
          description: type === "NO_DEFAULT" ? "no-default language present in source citation/description" : type,
        })),
        amendmentRelationships: [],
        verificationStatus: "UNVERIFIED",
        structuralFeatures: features,
        searchText: [citation, description, family, spec.issuer.name, spec.issuer.ticker ?? ""].join("\n"),
        tags: ["discovery-ingest", spec.packageId, ...families.map(String)],
        sourceDocumentId: documentId,
        extractionVersion,
        missingDependencies,
      });

      return {
        entry: attachIdentityFields(entry, { sourceDocumentId: documentId, extractionVersion }),
        priority: priorityOf(features, description),
        idx,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.idx - b.idx);

  const limit = spec.limit;
  const sliced = limit == null ? scored : scored.slice(0, limit);
  return sliced.map((s) => s.entry);
}

/** Legacy FWRG/LSB defaults (kept for backward-compatible CLI flag). */
export function defaultDiscoveryIngestSpecs(): PackageIngestSpec[] {
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
  ];
}

function resolveExistingDiscoveryPath(spec: PackageIngestSpec): PackageIngestSpec {
  if (existsSync(resolve(process.cwd(), spec.discoveryRunPath))) return spec;
  if (spec.packageId !== "lsb-2023") return spec;
  const dir = resolve(process.cwd(), "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs");
  if (!existsSync(dir)) return spec;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) return spec;
  return {
    ...spec,
    discoveryRunPath: join(
      "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs",
      files[files.length - 1]!,
    ),
  };
}

export function ingestDefaultDiscoveryPackages(): ResearchCorpusEntry[] {
  return defaultDiscoveryIngestSpecs().map(resolveExistingDiscoveryPath).flatMap(ingestDiscoveryRun);
}
