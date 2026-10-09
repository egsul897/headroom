/**
 * Compact precedent retrieval index — searchable without loading full structural trees.
 * Precedents inform drafting research; they are not operative legal authority.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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

export function writePrecedentRetrievalIndex(
  store: CorpusStore,
  outPath: string,
): PrecedentRetrievalIndex {
  const index = buildPrecedentRetrievalIndex(store);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
  return index;
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
