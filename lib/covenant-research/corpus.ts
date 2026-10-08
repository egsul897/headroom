/**
 * Corpus loading for covenant precedent research.
 *
 * Primary offline path: curated fixture JSON (source excerpts pinned in-repo).
 * Optional DB path: project SemanticTruthRecord (+ Company/Document/SourceArtifact)
 * rows into the same ResearchCorpusEntry shape — reuse, not a parallel store.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ResearchCorpusEntry, ResearchStructuralFeatures } from "./types";

export const DEFAULT_RESEARCH_CORPUS_PATH = resolve(
  process.cwd(),
  "tests/fixtures/covenant-research/research-corpus.json",
);

export interface ResearchCorpusFile {
  schemaVersion: string;
  disclaimer: string;
  entries: ResearchCorpusEntry[];
}

function defaultFeatures(partial?: Partial<ResearchStructuralFeatures>): ResearchStructuralFeatures {
  return {
    moneyAmountsUsd: [],
    hasRatioGate: false,
    hasUnlimitedCapacity: false,
    conditionTypes: [],
    entityScopeTags: [],
    hasSharedCapacity: false,
    hasReclassification: false,
    hasSpringingTest: false,
    hasSynergyAddback: false,
    synergyAddbackCapped: null,
    sharesWithJuniorDebtPrepay: false,
    isGeneralDebtBasket: false,
    amendmentReducesRpCapacity: false,
    hasOverlappingBaskets: false,
    unusualReclassification: false,
    ...partial,
  };
}

/** Ensure every entry has searchable text and complete structural feature defaults. */
export function normalizeCorpusEntry(entry: ResearchCorpusEntry): ResearchCorpusEntry {
  const structuralFeatures = defaultFeatures(entry.structuralFeatures);
  const searchText =
    entry.searchText?.trim() ||
    [
      entry.sourceExcerpt,
      entry.sourceCitation,
      entry.sourceSectionRef ?? "",
      entry.action ?? "",
      entry.ruleType ?? "",
      String(entry.covenantFamily),
      ...entry.relevantDefinitions.map((d) => `${d.termName} ${d.excerpt ?? ""}`),
      ...entry.relatedConditions.map((c) => `${c.type} ${c.description}`),
      ...entry.tags,
    ].join("\n");

  return { ...entry, structuralFeatures, searchText };
}

export function loadResearchCorpusFromFile(path: string = DEFAULT_RESEARCH_CORPUS_PATH): ResearchCorpusEntry[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ResearchCorpusFile;
  if (!Array.isArray(raw.entries)) {
    throw new Error(`research corpus at ${path} missing entries[]`);
  }
  return raw.entries.map(normalizeCorpusEntry);
}

/**
 * Project a SemanticTruthRecord-shaped row (plus joined issuer/filing fields)
 * into a ResearchCorpusEntry. Used when --from-db is requested; keeps research
 * results in the same schema as the fixture corpus.
 */
export function researchEntryFromSemanticTruth(input: {
  id: string;
  companyId: string;
  companyName: string;
  ticker?: string | null;
  cik?: string | null;
  instrumentKey: string;
  instrumentName?: string | null;
  agreementType?: string | null;
  filingUrl?: string | null;
  accession?: string | null;
  filedOn?: string | null;
  documentName?: string | null;
  kind: "RULE" | "DEFINITION";
  covenantFamily?: string | null;
  ruleType?: string | null;
  action?: string | null;
  sourceExcerpt: string | null;
  sourceCitation: string | null;
  sourceSectionRef: string | null;
  verificationStatus: string | null;
  trustStatus?: string | null;
  operativeStatus?: string | null;
  conditions?: { type: string; description: string }[];
  definedTerms?: { termName: string; excerpt: string | null }[];
  features?: Partial<ResearchStructuralFeatures>;
}): ResearchCorpusEntry {
  const verificationStatus = (() => {
    const v = (input.verificationStatus ?? input.trustStatus ?? "UNVERIFIED").toUpperCase();
    if (v.includes("VERIFIED")) return "VERIFIED" as const;
    if (v.includes("COMPILE")) return "COMPILED" as const;
    if (v.includes("REVIEW")) return "REVIEW_REQUIRED" as const;
    return "UNVERIFIED" as const;
  })();

  const operativeStatus = (() => {
    const s = (input.operativeStatus ?? "").toUpperCase();
    if (s.includes("CURRENT") || s.includes("OPERATIVE")) return "CURRENT_OPERATIVE" as const;
    if (s.includes("SUPERSEDE")) return "SUPERSEDED" as const;
    if (s.includes("AMEND")) return "AMENDED" as const;
    if (s.includes("HISTOR")) return "HISTORICAL" as const;
    return "UNKNOWN" as const;
  })();

  return normalizeCorpusEntry({
    entryId: `db:${input.id}`,
    kind: input.kind,
    issuer: {
      companyId: input.companyId,
      name: input.companyName,
      ticker: input.ticker ?? null,
      cik: input.cik ?? null,
    },
    instrument: {
      instrumentKey: input.instrumentKey,
      name: input.instrumentName ?? input.instrumentKey,
      agreementType: input.agreementType ?? "CREDIT_AGREEMENT",
    },
    filing: {
      url: input.filingUrl ?? null,
      accession: input.accession ?? null,
      filedOn: input.filedOn ?? null,
      documentName: input.documentName ?? null,
    },
    covenantFamily: input.covenantFamily ?? "QUALITATIVE_NEGATIVE_COVENANTS",
    ruleType: input.ruleType ?? null,
    action: input.action ?? null,
    operativeVersion: {
      status: operativeStatus,
      effectiveFrom: null,
      effectiveTo: null,
      supersededByEntryId: null,
    },
    sourceExcerpt: input.sourceExcerpt ?? "",
    sourceCitation: input.sourceCitation ?? input.sourceSectionRef ?? "",
    sourceSectionRef: input.sourceSectionRef,
    relevantDefinitions: (input.definedTerms ?? []).map((d) => ({
      termName: d.termName,
      excerpt: d.excerpt,
      definitionEntryId: null,
    })),
    relatedConditions: input.conditions ?? [],
    amendmentRelationships: [],
    verificationStatus,
    structuralFeatures: defaultFeatures(input.features),
    searchText: "",
    tags: ["db-projected"],
  });
}

/**
 * Optional Prisma-backed load. Returns [] when the client/tables are unavailable
 * so CLI/tests can fall back to the fixture corpus without failing closed on
 * an empty evaluation database.
 */
export async function tryLoadResearchCorpusFromDb(): Promise<ResearchCorpusEntry[]> {
  try {
    const { prisma } = await import("../prisma");
    const rows = await prisma.semanticTruthRecord.findMany({
      take: 500,
      include: { company: true },
      orderBy: { updatedAt: "desc" },
    });

    const out: ResearchCorpusEntry[] = [];
    for (const row of rows) {
      const payload = row.payload as Record<string, unknown> | null;
      const excerpt = row.sourceExcerpt ?? (typeof payload?.["description"] === "string" ? String(payload["description"]) : "");
      if (!excerpt.trim()) continue;

      out.push(
        researchEntryFromSemanticTruth({
          id: row.id,
          companyId: row.companyId,
          companyName: row.company.name,
          ticker: row.company.ticker,
          cik: row.company.cik,
          instrumentKey: row.instrumentKey,
          kind: row.kind === "DEFINITION" ? "DEFINITION" : "RULE",
          covenantFamily: typeof payload?.["covenantFamily"] === "string" ? String(payload["covenantFamily"]) : null,
          ruleType: typeof payload?.["ruleType"] === "string" ? String(payload["ruleType"]) : null,
          action: typeof payload?.["action"] === "string" ? String(payload["action"]) : null,
          sourceExcerpt: excerpt,
          sourceCitation: row.sourceCitation,
          sourceSectionRef: row.sourceSectionRef,
          verificationStatus: row.verificationStatus,
          trustStatus: row.trustStatus,
          operativeStatus:
            payload && typeof payload["operativeLineage"] === "object" && payload["operativeLineage"]
              ? String((payload["operativeLineage"] as { operativeStatus?: string }).operativeStatus ?? "")
              : null,
        }),
      );
    }
    return out;
  } catch {
    return [];
  }
}
