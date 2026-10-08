/**
 * Full source inventory for durable corpus preservation.
 * Inventories every acquired source with SEC identity, hashes, versions, and aliases.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { STRUCTURAL_INDEX_VERSION } from "../../contract-model/compiler/types";
import { KNOWLEDGE_FACTORY_VERSION } from "../types";
import type { CorpusStore } from "../store/corpus-store";
import { isFalsePositiveDebtExhibit, isFinancingDoc, isFixtureDoc } from "../corpus/financing-filter";

export const SOURCE_INVENTORY_SCHEMA_VERSION = "knowledge-factory.source-inventory.v1";

export interface SourceInventoryEntry {
  sourceId: string;
  accessionNumber: string;
  exhibitFilename: string;
  exhibitIdentity: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  instrumentIdentity?: string;
  documentClass: string;
  documentTitle: string;
  formType: string;
  filingDate: string;
  originalSourceUrl: string;
  acquisitionTimestamp: string;
  rawContentSha256: string;
  normalizedTextHash?: string;
  extractionVersion: string;
  structuralParserVersion: string;
  sourceByteLocation: {
    kind: "CONTENT_ADDRESSED_LOCAL" | "MISSING";
    relativePath?: string;
    absolutePath?: string;
    bytesPresent: boolean;
    byteSize?: number;
  };
  deduplicationIdentity: string;
  aliases: string[];
  provenance: string;
  usageRightsReviewStatus: string;
  representationLevel: string;
  extractionStatus: string;
  corpusRole: "FINANCING" | "FIXTURE" | "FALSE_POSITIVE_EXHIBIT" | "OTHER";
  artifactDigests: {
    structuralNodesSha256: string | null;
    covenantCandidatesSha256: string | null;
    definitionsSha256: string | null;
    dependencyEdgesSha256: string | null;
    conditionsExceptionsSha256: string | null;
    structuralNodeCount: number;
    covenantCandidateCount: number;
    definitionCount: number;
    dependencyEdgeCount: number;
    conditionExceptionCount: number;
  };
}

export interface SourceInventoryDocument {
  schemaVersion: typeof SOURCE_INVENTORY_SCHEMA_VERSION;
  generatedAt: string;
  knowledgeFactoryVersion: string;
  structuralParserVersion: string;
  durabilityClaim: "NONE";
  counts: {
    totalSources: number;
    financingDocuments: number;
    fixtureDocuments: number;
    falsePositiveExhibits: number;
    bytesPresent: number;
    bytesMissing: number;
  };
  sources: SourceInventoryEntry[];
}

function shaJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function corpusRole(s: Parameters<typeof isFinancingDoc>[0]): SourceInventoryEntry["corpusRole"] {
  if (isFixtureDoc(s)) return "FIXTURE";
  if (isFalsePositiveDebtExhibit(s)) return "FALSE_POSITIVE_EXHIBIT";
  if (isFinancingDoc(s)) return "FINANCING";
  return "OTHER";
}

export function buildSourceInventory(store: CorpusStore): SourceInventoryDocument {
  const aliases = store.readJson<Record<string, string[]>>("dedupe-aliases.json") ?? {};
  const reverseAliases = new Map<string, string[]>();
  for (const [canonical, list] of Object.entries(aliases)) {
    reverseAliases.set(canonical, list);
    for (const a of list) {
      const existing = reverseAliases.get(a) ?? [];
      if (!existing.includes(canonical)) existing.push(canonical);
      reverseAliases.set(a, existing);
    }
  }

  const sources = store.listSources().sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const entries: SourceInventoryEntry[] = [];
  let bytesPresent = 0;
  let financingDocuments = 0;
  let fixtureDocuments = 0;
  let falsePositiveExhibits = 0;

  for (const s of sources) {
    const role = corpusRole(s);
    if (role === "FINANCING") financingDocuments += 1;
    if (role === "FIXTURE") fixtureDocuments += 1;
    if (role === "FALSE_POSITIVE_EXHIBIT") falsePositiveExhibits += 1;

    const present = store.hasBytes(s.originalBytesHash);
    if (present) bytesPresent += 1;
    const abs = store.bytesPath(s.originalBytesHash);
    const rel = path.relative(store.paths.root, abs);

    const structural = store.loadStructuralNodes(s.sourceId);
    const candidates = store.loadCandidates(s.sourceId);
    const definitions = store.loadDefinitions(s.sourceId);
    const edges = store.loadCrossReferences(s.sourceId);
    const conditions = store.loadConditions(s.sourceId);

    entries.push({
      sourceId: s.sourceId,
      accessionNumber: s.accessionNumber,
      exhibitFilename: s.exhibitFilename,
      exhibitIdentity: `${s.accessionNumber}:${s.exhibitFilename}`,
      issuerCik: s.issuerCik,
      issuerTicker: s.issuerTicker,
      issuerName: s.issuerName,
      instrumentIdentity: s.instrumentIdentity,
      documentClass: s.documentClass,
      documentTitle: s.documentTitle,
      formType: s.formType,
      filingDate: s.filingDate,
      originalSourceUrl: s.sourceUrl,
      acquisitionTimestamp: s.acquisitionTimestamp,
      rawContentSha256: s.originalBytesHash,
      normalizedTextHash: s.normalizedTextHash,
      extractionVersion: s.parserVersion || KNOWLEDGE_FACTORY_VERSION,
      structuralParserVersion: STRUCTURAL_INDEX_VERSION,
      sourceByteLocation: {
        kind: present ? "CONTENT_ADDRESSED_LOCAL" : "MISSING",
        relativePath: present ? rel : undefined,
        absolutePath: present && existsSync(abs) ? abs : undefined,
        bytesPresent: present,
        byteSize: s.byteSize,
      },
      deduplicationIdentity: s.originalBytesHash,
      aliases: reverseAliases.get(s.sourceId) ?? [],
      provenance: s.provenance,
      usageRightsReviewStatus: s.usageRightsReviewStatus,
      representationLevel: s.representationLevel,
      extractionStatus: s.extractionStatus,
      corpusRole: role,
      artifactDigests: {
        structuralNodesSha256: structural.length ? shaJson(structural) : null,
        covenantCandidatesSha256: candidates.length ? shaJson(candidates) : null,
        definitionsSha256: definitions.length ? shaJson(definitions) : null,
        dependencyEdgesSha256: edges.length ? shaJson(edges) : null,
        conditionsExceptionsSha256: conditions.length ? shaJson(conditions) : null,
        structuralNodeCount: structural.length,
        covenantCandidateCount: candidates.length,
        definitionCount: definitions.length,
        dependencyEdgeCount: edges.length,
        conditionExceptionCount: conditions.length,
      },
    });
  }

  return {
    schemaVersion: SOURCE_INVENTORY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    knowledgeFactoryVersion: KNOWLEDGE_FACTORY_VERSION,
    structuralParserVersion: STRUCTURAL_INDEX_VERSION,
    durabilityClaim: "NONE",
    counts: {
      totalSources: entries.length,
      financingDocuments,
      fixtureDocuments,
      falsePositiveExhibits,
      bytesPresent,
      bytesMissing: entries.length - bytesPresent,
    },
    sources: entries,
  };
}
