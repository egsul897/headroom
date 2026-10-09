/**
 * Compact precedent retrieval index — searchable without loading full structural trees.
 * Precedents inform drafting research; they are not operative legal authority.
 *
 * Publication rules (backfill / partial runs):
 * - Partial corpus builds must MERGE into any existing published index so
 *   unprocessed / skipped / failed sources are not silently dropped.
 * - Index files are written atomically (temp + rename) so an interrupted
 *   publish cannot leave a truncated JSON document.
 * - Intentional removal requires an explicit removeSourceIds set — there is
 *   no implicit shrink from a sparse corpus rebuild.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CorpusStore } from "../store/corpus-store";
import { searchKnowledge, type SearchQuery, type SearchHit } from "../search/query";
import { discoverDocumentRelationships } from "../relationships/discover";

export const RETRIEVAL_INDEX_SCHEMA = "knowledge-factory.precedent-retrieval-index.v1" as const;

export interface PrecedentIndexEntry {
  sourceId: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  documentTitle: string;
  documentClass: string;
  formType: string;
  filingDate: string;
  representationLevel: string;
  extractionStatus: string;
  originalBytesHash: string;
  byteSize?: number;
  definitionCount: number;
  covenantCandidateCount: number;
  crossReferenceCount: number;
  conditionExceptionCount: number;
  definitionTerms: string[];
  covenantFamilies: string[];
  discoveryScore?: number;
}

export interface PrecedentRetrievalIndex {
  schemaVersion: typeof RETRIEVAL_INDEX_SCHEMA;
  generatedAt: string;
  note: string;
  promotedToLegalTruth: 0;
  totals: {
    sources: number;
    distinctIssuers: number;
    definitions: number;
    covenantCandidates: number;
    crossReferences: number;
    conditionExceptions: number;
    amendmentRelationships: number;
    distinctDocumentClasses: number;
    distinctCovenantFamilies: number;
  };
  entries: PrecedentIndexEntry[];
  familyHistogram: Record<string, number>;
  documentClassHistogram: Record<string, number>;
  digest: string;
}

export function buildPrecedentRetrievalIndex(store: CorpusStore): PrecedentRetrievalIndex {
  // Ensure amendment/relationship graph is refreshed from current sources.
  const relationships = discoverDocumentRelationships(store.listSources());
  store.saveRelationships(relationships);

  const entries: PrecedentIndexEntry[] = [];
  const familyHistogram: Record<string, number> = {};
  const documentClassHistogram: Record<string, number> = {};
  let definitions = 0;
  let covenantCandidates = 0;
  let crossReferences = 0;
  let conditionExceptions = 0;
  const issuers = new Set<string>();

  for (const s of store.listSources().sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    const defs = store.loadDefinitions(s.sourceId);
    const candidates = store.loadCandidates(s.sourceId);
    const xrefs = store.loadCrossReferences(s.sourceId);
    const conditions = store.loadConditions(s.sourceId);
    const families = [...new Set(candidates.flatMap((c) => c.families))];
    for (const f of families) familyHistogram[f] = (familyHistogram[f] ?? 0) + 1;
    documentClassHistogram[s.documentClass] = (documentClassHistogram[s.documentClass] ?? 0) + 1;
    issuers.add(s.issuerCik);
    definitions += defs.length;
    covenantCandidates += candidates.length;
    crossReferences += xrefs.length;
    conditionExceptions += conditions.length;

    entries.push({
      sourceId: s.sourceId,
      issuerCik: s.issuerCik,
      issuerTicker: s.issuerTicker,
      issuerName: s.issuerName,
      documentTitle: s.documentTitle,
      documentClass: s.documentClass,
      formType: s.formType,
      filingDate: s.filingDate,
      representationLevel: s.representationLevel,
      extractionStatus: s.extractionStatus,
      originalBytesHash: s.originalBytesHash,
      byteSize: s.byteSize,
      definitionCount: defs.length,
      covenantCandidateCount: candidates.length,
      crossReferenceCount: xrefs.length,
      conditionExceptionCount: conditions.length,
      definitionTerms: defs.map((d) => d.term).slice(0, 80),
      covenantFamilies: families,
      discoveryScore: s.discoveryScore,
    });
  }

  const amendmentRelationships = relationships.filter(
    (r) =>
      r.kind === "AGREEMENT_AMENDMENT" ||
      r.kind === "AGREEMENT_RESTATEMENT" ||
      r.kind === "INDENTURE_SUPPLEMENTAL",
  ).length;

  const body = {
    schemaVersion: RETRIEVAL_INDEX_SCHEMA,
    generatedAt: new Date().toISOString(),
    note: "DISCOVERED ≠ VERIFIED. PRECEDENT ≠ OPERATIVE AUTHORITY. Index is research retrieval only.",
    promotedToLegalTruth: 0 as const,
    totals: {
      sources: entries.length,
      distinctIssuers: issuers.size,
      definitions,
      covenantCandidates,
      crossReferences,
      conditionExceptions,
      amendmentRelationships,
      distinctDocumentClasses: Object.keys(documentClassHistogram).length,
      distinctCovenantFamilies: Object.keys(familyHistogram).length,
    },
    entries,
    familyHistogram,
    documentClassHistogram,
    digest: "",
  };
  body.digest = createHash("sha256").update(JSON.stringify({ ...body, digest: undefined })).digest("hex");
  return body;
}

export function loadPrecedentRetrievalIndex(filePath: string): PrecedentRetrievalIndex | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as PrecedentRetrievalIndex;
    if (parsed?.schemaVersion !== RETRIEVAL_INDEX_SCHEMA || !Array.isArray(parsed.entries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function recomputeIndexAggregates(
  entries: PrecedentIndexEntry[],
  amendmentRelationships: number,
): Omit<PrecedentRetrievalIndex, "digest"> & { digest: string } {
  const familyHistogram: Record<string, number> = {};
  const documentClassHistogram: Record<string, number> = {};
  const issuers = new Set<string>();
  let definitions = 0;
  let covenantCandidates = 0;
  let crossReferences = 0;
  let conditionExceptions = 0;

  const sorted = [...entries].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  for (const e of sorted) {
    issuers.add(e.issuerCik);
    definitions += e.definitionCount;
    covenantCandidates += e.covenantCandidateCount;
    crossReferences += e.crossReferenceCount;
    conditionExceptions += e.conditionExceptionCount;
    documentClassHistogram[e.documentClass] = (documentClassHistogram[e.documentClass] ?? 0) + 1;
    for (const f of e.covenantFamilies) {
      familyHistogram[f] = (familyHistogram[f] ?? 0) + 1;
    }
  }

  const body = {
    schemaVersion: RETRIEVAL_INDEX_SCHEMA,
    generatedAt: new Date().toISOString(),
    note: "DISCOVERED ≠ VERIFIED. PRECEDENT ≠ OPERATIVE AUTHORITY. Index is research retrieval only.",
    promotedToLegalTruth: 0 as const,
    totals: {
      sources: sorted.length,
      distinctIssuers: issuers.size,
      definitions,
      covenantCandidates,
      crossReferences,
      conditionExceptions,
      amendmentRelationships,
      distinctDocumentClasses: Object.keys(documentClassHistogram).length,
      distinctCovenantFamilies: Object.keys(familyHistogram).length,
    },
    entries: sorted,
    familyHistogram,
    documentClassHistogram,
    digest: "",
  };
  body.digest = createHash("sha256").update(JSON.stringify({ ...body, digest: undefined })).digest("hex");
  return body;
}

export interface MergePrecedentIndexOptions {
  /** Explicit intentional removals only — never inferred from a partial corpus. */
  removeSourceIds?: Iterable<string>;
}

/**
 * Merge a partial/updated index into a broader existing index.
 * Updated sourceIds replace prior entries; unaffected identities are preserved;
 * only removeSourceIds are dropped.
 */
export function mergePrecedentRetrievalIndexes(
  existing: PrecedentRetrievalIndex | null | undefined,
  updated: PrecedentRetrievalIndex,
  options: MergePrecedentIndexOptions = {},
): PrecedentRetrievalIndex {
  const remove = new Set(options.removeSourceIds ?? []);
  const byId = new Map<string, PrecedentIndexEntry>();

  if (existing?.entries) {
    for (const e of existing.entries) {
      if (!remove.has(e.sourceId)) byId.set(e.sourceId, e);
    }
  }
  for (const e of updated.entries) {
    if (remove.has(e.sourceId)) {
      byId.delete(e.sourceId);
      continue;
    }
    byId.set(e.sourceId, e);
  }

  const amendmentRelationships = Math.max(
    existing?.totals.amendmentRelationships ?? 0,
    updated.totals.amendmentRelationships,
  );
  return recomputeIndexAggregates([...byId.values()], amendmentRelationships);
}

/** Atomic publish: write temp sibling then rename over the destination. */
export function writePrecedentRetrievalIndexFile(
  index: PrecedentRetrievalIndex,
  outPath: string,
): void {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(index, null, 2) + "\n");
  renameSync(tmpPath, outPath);
}

export interface PublishPrecedentIndexOptions extends MergePrecedentIndexOptions {
  /**
   * When true, merge store-built entries into any existing file at outPath so
   * a partial corpus cannot shrink published coverage.
   * Full rebuilds from a complete corpus should leave this false/omit it.
   */
  mergeWithExisting?: boolean;
}

/**
 * Build from the corpus store and publish.
 * Partial backfills must pass mergeWithExisting: true.
 */
export function publishPrecedentRetrievalIndex(
  store: CorpusStore,
  outPath: string,
  options: PublishPrecedentIndexOptions = {},
): PrecedentRetrievalIndex {
  const built = buildPrecedentRetrievalIndex(store);
  const mergeWithExisting = options.mergeWithExisting === true;
  const existing = mergeWithExisting ? loadPrecedentRetrievalIndex(outPath) : null;
  const index =
    mergeWithExisting && existing
      ? mergePrecedentRetrievalIndexes(existing, built, {
          removeSourceIds: options.removeSourceIds,
        })
      : options.removeSourceIds
        ? mergePrecedentRetrievalIndexes(null, built, {
            removeSourceIds: options.removeSourceIds,
          })
        : built;
  writePrecedentRetrievalIndexFile(index, outPath);
  return index;
}

export function writePrecedentRetrievalIndex(
  store: CorpusStore,
  outPath: string,
  options: PublishPrecedentIndexOptions = {},
): PrecedentRetrievalIndex {
  // Full-corpus rebuild default (merge opt-in). Atomic file replace always.
  return publishPrecedentRetrievalIndex(store, outPath, options);
}

export function searchPrecedentIndex(
  store: CorpusStore,
  query: SearchQuery,
): SearchHit[] {
  return searchKnowledge(store, query);
}

/** Issuer-disjoint filter: exclude a held-out CIK from hits. */
export function searchIssuerDisjoint(
  store: CorpusStore,
  query: SearchQuery,
  excludeIssuerCik: string,
): SearchHit[] {
  const pad = excludeIssuerCik.padStart(10, "0");
  return searchKnowledge(store, query).filter((h) => {
    const src = store.getSource(h.sourceId);
    return src && src.issuerCik.padStart(10, "0") !== pad;
  });
}
