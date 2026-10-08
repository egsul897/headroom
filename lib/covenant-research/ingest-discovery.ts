/**
 * Ingest already-acquired discovery-candidate fixtures into ResearchCorpusEntry
 * rows. Zero EDGAR / zero paid model calls — reuses pinned package runs only.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { normalizeCorpusEntry } from "./corpus";
import type { ResearchCorpusEntry, ResearchStructuralFeatures } from "./types";

export interface PackageIngestSpec {
  packageId: string;
  discoveryRunPath: string;
  issuer: ResearchCorpusEntry["issuer"];
  instrument: ResearchCorpusEntry["instrument"];
  filing: ResearchCorpusEntry["filing"];
  /** Max candidates to ingest from this package (high-signal first). */
  limit?: number;
}

function featuresFromCandidate(c: {
  families?: string[];
  description?: string;
  sourceCitation?: string;
  role?: string;
}): ResearchStructuralFeatures {
  const text = `${c.description ?? ""} ${c.sourceCitation ?? ""}`.toLowerCase();
  const moneyAmountsUsd: number[] = [];
  for (const m of text.matchAll(/\$([0-9]{1,3}(?:,[0-9]{3})+)/g)) {
    moneyAmountsUsd.push(Number(m[1]!.replace(/,/g, "")));
  }
  const families = (c.families ?? []).map((f) => f.toUpperCase());
  return {
    moneyAmountsUsd: [...new Set(moneyAmountsUsd)],
    hasRatioGate: /leverage ratio|coverage ratio|ratio (does )?not exceed|pro forma/.test(text),
    hasUnlimitedCapacity: /unlimited amount|unlimited/.test(text),
    conditionTypes: /no (event of )?default/.test(text) ? ["NO_DEFAULT"] : [],
    entityScopeTags: /not a loan party|non-guarantor/.test(text)
      ? ["NON_GUARANTOR_RS", "NOT_A_LOAN_PARTY"]
      : ["BORROWER"],
    hasSharedCapacity: /available amount|shared|in the aggregate with/.test(text),
    hasReclassification: /reclassif/.test(text),
    hasSpringingTest: /springing|availability block/.test(text),
    hasSynergyAddback: /synerg/.test(text),
    synergyAddbackCapped: /synerg/.test(text) ? (/shall not exceed|% of/.test(text) ? true : null) : null,
    sharesWithJuniorDebtPrepay: /restricted debt payment|junior lien|subordinated/.test(text) && /investment|available amount/.test(text),
    isGeneralDebtBasket: families.includes("INDEBTEDNESS") && /other indebtedness|general/.test(text),
    amendmentReducesRpCapacity: false,
    hasOverlappingBaskets: /reclassif|overlapping|available amount/.test(text),
    unusualReclassification: /reclassif/.test(text) && /sole discretion|later divide/.test(text),
  };
}

export function ingestDiscoveryRun(spec: PackageIngestSpec): ResearchCorpusEntry[] {
  const path = resolve(process.cwd(), spec.discoveryRunPath);
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const candidates: Array<Record<string, unknown>> = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : Array.isArray((raw as { candidates?: unknown }).candidates)
      ? ((raw as { candidates: Array<Record<string, unknown>> }).candidates)
      : [];

  const scored = candidates
    .filter((c) => typeof c.sourceCitation === "string" && String(c.sourceCitation).trim().length > 20)
    .map((c, idx) => {
      const citation = String(c.sourceCitation);
      const description = String(c.description ?? "");
      const families = Array.isArray(c.families) ? (c.families as string[]) : [];
      const family = families[0] ?? "QUALITATIVE_NEGATIVE_COVENANTS";
      const features = featuresFromCandidate({
        families,
        description,
        sourceCitation: citation,
        role: typeof c.role === "string" ? c.role : undefined,
      });
      // Prefer quantitative / basket-like candidates for research utility.
      let priority = 0;
      if (features.moneyAmountsUsd.length) priority += 3;
      if (features.hasRatioGate) priority += 2;
      if (features.hasSpringingTest) priority += 3;
      if (features.hasReclassification) priority += 2;
      if (features.hasSynergyAddback) priority += 2;
      if (features.conditionTypes.includes("NO_DEFAULT")) priority += 1;
      if (/basket|except|permitted/.test(description.toLowerCase())) priority += 1;
      return { c, idx, priority, family, features, citation, description };
    })
    .sort((a, b) => b.priority - a.priority || a.idx - b.idx);

  const limit = spec.limit ?? 80;
  return scored.slice(0, limit).map(({ c, family, features, citation, description }) =>
    normalizeCorpusEntry({
      entryId: `discovery:${spec.packageId}:${String(c.discoveryId ?? c.normalizedSourceRef ?? citation).slice(0, 80)}`,
      kind: "RULE",
      issuer: spec.issuer,
      instrument: spec.instrument,
      filing: spec.filing,
      covenantFamily: family,
      ruleType: typeof c.role === "string" ? String(c.role) : null,
      action: null,
      operativeVersion: {
        status: "UNKNOWN",
        effectiveFrom: spec.filing.filedOn,
        effectiveTo: null,
        supersededByEntryId: null,
      },
      sourceExcerpt: citation,
      sourceCitation: typeof c.normalizedSourceRef === "string" ? `§${c.normalizedSourceRef}` : citation.slice(0, 120),
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
      tags: ["discovery-ingest", spec.packageId, ...(Array.isArray(c.families) ? (c.families as string[]) : [])],
    }),
  );
}

/** Default ingest set: already-acquired FWRG + LSB discovery runs (pinned in-repo). */
export function defaultDiscoveryIngestSpecs(): PackageIngestSpec[] {
  return [
    {
      packageId: "fwrg-2021",
      discoveryRunPath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json",
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
      limit: 100,
    },
    {
      packageId: "lsb-2023",
      discoveryRunPath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json",
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
      limit: 80,
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
