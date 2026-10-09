/**
 * Deterministic-first knowledge-factory pipeline.
 * Stages 1–11 without LLM. Paid semantic compilation remains disabled.
 */

import { KNOWLEDGE_FACTORY_VERSION, type CorpusManifestStats, type DiscoveredFilingDocument, type KnowledgeSourceRecord } from "../types";
import { CorpusStore } from "../store/corpus-store";
import { EdgarKnowledgeClient } from "../edgar/client";
import { validateSourceUrl } from "../edgar/client";
import { classifyDebtDocument } from "../classify/debt-document";
import { scoreDiscoveryPotential } from "../rank/discovery-score";
import { extractTextAsync, hashBytes } from "./text";
import { extractStructure } from "./structural";
import { discoverCovenantCandidates } from "./candidates";
import { extractConditionsAndExceptions } from "./conditions";
import { attachInstrumentIdentity } from "./instrument-identity";
import { discoverDocumentRelationships } from "../relationships/discover";
import { findExactByteDuplicates, findExactNormalizedDuplicates } from "../dedupe/near-duplicate";
import { buildSemanticPriorityQueue } from "../queue/semantic-priority";
import { buildUncertaintyQueue } from "../queue/uncertainty";
import { recordCost, emptyStats, summarizeCosts } from "../cost/ledger";
import { assertRepresentationCannotApproveCapacity } from "../legal-safety/promotion-guards";
import { detectPatternsInText } from "../patterns/library";

export interface ProcessDocumentInput {
  discovered: DiscoveredFilingDocument;
  bytes: Buffer;
  contentHash: string;
  provenance: string;
  usageRightsReviewStatus: KnowledgeSourceRecord["usageRightsReviewStatus"];
}

export interface ProcessDocumentResult {
  source: KnowledgeSourceRecord;
  structuralNodeCount: number;
  candidateCount: number;
  definitionCount: number;
  crossReferenceCount: number;
  conditionExceptionCount: number;
  ambiguousCount: number;
  processingMs: number;
  wasDuplicate: boolean;
}

export async function processAcquiredDocument(store: CorpusStore, input: ProcessDocumentInput): Promise<ProcessDocumentResult> {
  const started = Date.now();
  const { discovered, bytes, contentHash } = input;

  if (!discovered.exhibit.sourceUrl.startsWith("fixture://") && !validateSourceUrl(discovered.exhibit.sourceUrl)) {
    throw new Error(`Invalid source URL: ${discovered.exhibit.sourceUrl}`);
  }

  // Exact-byte dedupe across corpus — second run must not invent a new sourceId row.
  const existingByHash = store.findByOriginalBytesHash(contentHash);
  if (existingByHash && existingByHash.sourceId !== discovered.sourceId) {
    const aliasMeta = store.readJson<Record<string, string[]>>("dedupe-aliases.json") ?? {};
    const list = aliasMeta[existingByHash.sourceId] ?? [];
    if (!list.includes(discovered.sourceId)) list.push(discovered.sourceId);
    aliasMeta[existingByHash.sourceId] = list;
    store.writeJson("dedupe-aliases.json", aliasMeta);
    return {
      source: existingByHash,
      structuralNodeCount: store.loadStructuralNodes(existingByHash.sourceId).length,
      candidateCount: store.loadCandidates(existingByHash.sourceId).length,
      definitionCount: store.loadDefinitions(existingByHash.sourceId).length,
      crossReferenceCount: store.loadCrossReferences(existingByHash.sourceId).length,
      conditionExceptionCount: store.loadConditions(existingByHash.sourceId).length,
      ambiguousCount: store.loadStructuralNodes(existingByHash.sourceId).filter((n) => n.ambiguous).length,
      processingMs: Date.now() - started,
      wasDuplicate: true,
    };
  }

  // Idempotent download / resume: if bytes already present for hash, reuse.
  const storagePath = store.writeBytes(contentHash, bytes);

  const title = discovered.exhibit.description || discovered.exhibit.filename;
  const preClass = classifyDebtDocument({
    title,
    description: discovered.exhibit.description,
    exhibitType: discovered.exhibit.exhibitType,
    filename: discovered.exhibit.filename,
  });

  let source: KnowledgeSourceRecord = {
    sourceId: discovered.sourceId,
    issuerCik: discovered.filing.issuer.cik,
    issuerTicker: discovered.filing.issuer.ticker,
    issuerName: discovered.filing.issuer.name,
    accessionNumber: discovered.filing.accessionNumber,
    exhibitFilename: discovered.exhibit.filename,
    sourceUrl: discovered.exhibit.sourceUrl,
    filingDate: discovered.filing.filingDate,
    formType: discovered.filing.formType,
    documentTitle: title,
    documentClass: preClass.documentClass,
    originalBytesHash: contentHash,
    acquisitionTimestamp: new Date().toISOString(),
    parserVersion: KNOWLEDGE_FACTORY_VERSION,
    extractionStatus: "ACQUIRED",
    representationLevel: "SOURCE_ONLY",
    provenance: input.provenance,
    usageRightsReviewStatus: input.usageRightsReviewStatus,
    byteSize: bytes.length,
    storagePath,
    discoveryScore: 0,
  };
  assertRepresentationCannotApproveCapacity(source.representationLevel);
  store.upsertSource(source);

  // Text extraction
  let text: string;
  let normalizedTextHash: string;
  try {
    const extracted = await extractTextAsync(bytes, discovered.exhibit.filename);
    text = extracted.text;
    normalizedTextHash = extracted.normalizedTextHash;
    source = {
      ...source,
      normalizedTextHash,
      extractionStatus: text.length > 0 ? "TEXT_EXTRACTED" : "UNSUPPORTED_FORMAT",
    };
  } catch {
    source = { ...source, extractionStatus: "FAILED" };
    store.upsertSource(source);
    recordCost(store, "PARSING_MS", Date.now() - started, "ms", false, "failed extraction");
    return {
      source,
      structuralNodeCount: 0,
      candidateCount: 0,
      definitionCount: 0,
      crossReferenceCount: 0,
      conditionExceptionCount: 0,
      ambiguousCount: 0,
      processingMs: Date.now() - started,
      wasDuplicate: false,
    };
  }

  if (!text || text.length < 40) {
    source = { ...source, extractionStatus: "UNSUPPORTED_FORMAT" };
    store.upsertSource(source);
    return {
      source,
      structuralNodeCount: 0,
      candidateCount: 0,
      definitionCount: 0,
      crossReferenceCount: 0,
      conditionExceptionCount: 0,
      ambiguousCount: 0,
      processingMs: Date.now() - started,
      wasDuplicate: false,
    };
  }

  // Re-classify with text headings
  const classified = classifyDebtDocument({
    title,
    description: discovered.exhibit.description,
    exhibitType: discovered.exhibit.exhibitType,
    filename: discovered.exhibit.filename,
    textSample: text.slice(0, 12_000),
  });
  const rank = scoreDiscoveryPotential(text.slice(0, 200_000), title);
  // Pattern attachment (discovery aid)
  void detectPatternsInText(text.slice(0, 50_000));

  // Structural indexing via Headroom compiler
  const structural = extractStructure(discovered.sourceId, text);
  store.saveStructuralNodes(discovered.sourceId, structural.nodes);
  store.saveDefinitions(discovered.sourceId, structural.definitions);
  store.saveCrossReferences(discovered.sourceId, structural.crossReferences);

  const candidates = discoverCovenantCandidates(discovered.sourceId, text, structural.nodes);
  store.saveCandidates(discovered.sourceId, candidates);
  const conditions = extractConditionsAndExceptions(discovered.sourceId, text, structural.nodes);
  store.saveConditions(discovered.sourceId, conditions);

  source = {
    ...source,
    documentClass: classified.documentClass,
    discoveryScore: rank.score,
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: candidates.length > 0 ? "DISCOVERED_CANDIDATE" : "STRUCTURALLY_INDEXED",
    normalizedTextHash,
  };
  source = attachInstrumentIdentity(source);
  assertRepresentationCannotApproveCapacity(source.representationLevel);
  store.upsertSource(source);

  const processingMs = Date.now() - started;
  recordCost(store, "PARSING_MS", processingMs, "ms", false, discovered.sourceId);
  recordCost(store, "STORAGE_BYTES", bytes.length, "bytes", false, contentHash);
  recordCost(store, "DOWNLOAD_BYTES", bytes.length, "bytes", false, discovered.sourceId);

  return {
    source,
    structuralNodeCount: structural.nodes.length,
    candidateCount: candidates.length,
    definitionCount: structural.definitions.length,
    crossReferenceCount: structural.crossReferences.length,
    conditionExceptionCount: conditions.length,
    ambiguousCount: structural.ambiguousCount,
    processingMs,
    wasDuplicate: false,
  };
}

export async function ingestFixtureDocument(
  store: CorpusStore,
  opts: {
    sourceId: string;
    issuerCik: string;
    issuerTicker?: string;
    issuerName?: string;
    title: string;
    text: string;
    documentClassHint?: string;
  },
): Promise<ProcessDocumentResult> {
  const bytes = Buffer.from(opts.text, "utf8");
  const contentHash = hashBytes(bytes);
  const discovered: DiscoveredFilingDocument = {
    sourceId: opts.sourceId,
    filing: {
      accessionNumber: "0000000000-00-000000",
      formType: "FIXTURE",
      filingDate: "2020-01-01",
      issuer: { cik: opts.issuerCik.padStart(10, "0"), ticker: opts.issuerTicker, name: opts.issuerName },
    },
    exhibit: {
      filename: `${opts.sourceId}.txt`,
      description: opts.title,
      exhibitType: "EX-10.1",
      sourceUrl: `fixture://${opts.sourceId}`,
    },
    discoverySignals: ["fixture"],
  };
  return processAcquiredDocument(store, {
    discovered,
    bytes,
    contentHash,
    provenance: `fixture:${opts.sourceId}`,
    usageRightsReviewStatus: "FIXTURE_INTERNAL",
  });
}

export interface IssuerIngestResult {
  ticker?: string;
  cik: string;
  discovered: number;
  downloaded: number;
  errors: string[];
  sourceIds: string[];
}

export async function ingestIssuerFromEdgar(
  store: CorpusStore,
  client: EdgarKnowledgeClient,
  cikOrTicker: { cik?: string; ticker?: string },
  options: { filingLimit?: number; maxDocuments?: number; since?: string } = {},
): Promise<IssuerIngestResult> {
  const errors: string[] = [];
  let cik = cikOrTicker.cik;
  let ticker = cikOrTicker.ticker;
  if (!cik && ticker) {
    const issuer = await client.resolveCikForTicker(ticker);
    cik = issuer.cik;
    ticker = issuer.ticker ?? ticker;
  }
  if (!cik) throw new Error("ingestIssuerFromEdgar: cik or ticker required");

  const checkpointName = `issuer:${cik}`;
  const checkpoint = store.loadCheckpoint<{ completedSourceIds: string[] }>(checkpointName) ?? { completedSourceIds: [] };
  const completed = new Set(checkpoint.completedSourceIds);

  const discovered = await client.discoverForCik(cik, {
    filingLimit: options.filingLimit ?? 40,
    since: options.since,
  });
  recordCost(store, "SEC_REQUEST", 1, "issuer_discover_pass", false, cik);

  const maxDocuments = options.maxDocuments ?? 10;
  const sourceIds: string[] = [];
  let downloaded = 0;

  for (const doc of discovered) {
    if (downloaded >= maxDocuments) break;
    if (completed.has(doc.sourceId)) {
      sourceIds.push(doc.sourceId);
      continue;
    }
    try {
      const { bytes, contentHash, fromCache } = await client.fetchDocument(doc);
      if (!fromCache) recordCost(store, "SEC_REQUEST", 1, "fetch", false, doc.sourceId);
      await processAcquiredDocument(store, {
        discovered: doc,
        bytes,
        contentHash,
        provenance: "sec-edgar",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });
      downloaded += 1;
      sourceIds.push(doc.sourceId);
      completed.add(doc.sourceId);
      store.saveCheckpoint(checkpointName, { completedSourceIds: [...completed] });
    } catch (err) {
      errors.push(`${doc.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ticker, cik, discovered: discovered.length, downloaded, errors, sourceIds };
}

export function finalizeCorpusIndex(store: CorpusStore): CorpusManifestStats {
  const sources = store.listSources();
  const rels = discoverDocumentRelationships(sources);
  store.saveRelationships(rels);

  const allCandidates = sources.flatMap((s) => store.loadCandidates(s.sourceId));
  const nodesBySource = new Map(sources.map((s) => [s.sourceId, store.loadStructuralNodes(s.sourceId)]));
  const semanticQueue = buildSemanticPriorityQueue(sources, allCandidates);
  const uncertainty = buildUncertaintyQueue({ sources, candidates: allCandidates, nodesBySource });
  const dups = [...findExactByteDuplicates(sources), ...findExactNormalizedDuplicates(sources)];

  store.writeJson("semantic-queue.json", semanticQueue);
  store.writeJson("uncertainty-queue.json", uncertainty);
  store.writeJson("duplicates.json", dups);

  const costs = summarizeCosts(store.readCostLedger());
  const stats = emptyStats();
  stats.issuersDiscovered = new Set(sources.map((s) => s.issuerCik)).size;
  stats.documentsDownloaded = sources.length;
  stats.relevantFilings = new Set(sources.map((s) => s.accessionNumber)).size;
  stats.distinctAgreements = sources.filter((s) =>
    ["CREDIT_AGREEMENT", "REVOLVING_CREDIT_AGREEMENT", "TERM_LOAN_AGREEMENT", "ABL_AGREEMENT", "RESTATEMENT"].includes(s.documentClass),
  ).length;
  stats.amendments = sources.filter((s) => s.documentClass === "AMENDMENT").length;
  stats.indentures = sources.filter((s) => s.documentClass === "INDENTURE" || s.documentClass === "SUPPLEMENTAL_INDENTURE").length;
  stats.extractableDocuments = sources.filter((s) => s.extractionStatus !== "FAILED" && s.extractionStatus !== "UNSUPPORTED_FORMAT").length;
  stats.structuralNodes = sources.reduce((n, s) => n + store.loadStructuralNodes(s.sourceId).length, 0);
  stats.covenantCandidates = allCandidates.length;
  stats.definitions = sources.reduce((n, s) => n + store.loadDefinitions(s.sourceId).length, 0);
  stats.crossReferences = sources.reduce((n, s) => n + store.loadCrossReferences(s.sourceId).length, 0);
  stats.unsupportedFormats = sources.filter((s) => s.extractionStatus === "UNSUPPORTED_FORMAT").length;
  stats.duplicateRate = sources.length === 0 ? 0 : dups.length / sources.length;
  stats.errors = sources.filter((s) => s.extractionStatus === "FAILED").length;
  stats.measuredProcessingMs = costs.parsingMs;
  stats.actualPaidSpendUsd = costs.actualPaidUsd;

  // Estimated model costs only (execution disabled)
  const estimatedTokens = semanticQueue.reduce((n, q) => n + q.estimatedTokens, 0);
  recordCost(store, "ESTIMATED_MODEL_TOKENS", estimatedTokens, "tokens", true, "semantic queue if paid execution were enabled");
  recordCost(store, "ESTIMATED_MODEL_COST_USD", (estimatedTokens / 1000) * 0.003, "usd", true, "placeholder unit estimate — not actual spend");
  recordCost(store, "ACTUAL_PROVIDER_COST_USD", 0, "usd", false, "paid AI providers disabled");

  store.writeJson("corpus-stats.json", stats);
  return stats;
}
