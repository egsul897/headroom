/**
 * Restartable, idempotent Neon corpus expansion batch.
 *
 * Stages: discover → dedupe → fetch → persist → parse/extract → relationships →
 * summaries → retrieval index → checkpoint → QC metrics.
 *
 * Does not promote DISCOVERED candidates to CERTIFIED legal truth.
 * Does not invent document bytes. Paid model calls remain disabled.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../prisma";
import { EdgarKnowledgeClient } from "../edgar/client";
import { classifyDebtDocument } from "../classify/debt-document";
import { processAcquiredDocument } from "../pipeline/run";
import { persistDurableKnowledgeSource } from "../preservation/durable-store";
import { CorpusStore, defaultCorpusPaths } from "../store/corpus-store";
import { discoverDocumentRelationships } from "../relationships/discover";
import { buildDocumentCovenantSummary } from "../../product/covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../../product/covenant-intelligence/corpus-quality";
import { persistProvisionGraph } from "../../product/legal-reasoning/provision-graph";
import { persistAmendmentGraph } from "../../product/legal-reasoning/amendment-graph";
import type { DiscoveredFilingDocument, KnowledgeSourceRecord } from "../types";
import { DIVERSITY_EXPAND_TARGETS, scoreExhibitForTargets } from "./target-issuers";
import { buildSyntheticCalculationLibrary, type CalculationExampleCase } from "./calculation-examples";
import { MASS_LIVE_ENV, MASS_LIVE_TOKEN } from "../acquisition/persistence-mode";
import { assertCorpusGraphWriteAuthorized } from "./graph-write-gate";

export interface NeonExpandBatchOptions {
  repoRoot?: string;
  batchKey?: string;
  maxNewDocuments?: number;
  maxIssuers?: number;
  filingLimit?: number;
  maxPerIssuer?: number;
  live?: boolean;
  includeLiveEdgar?: boolean;
  includeCbcfl?: boolean;
  includeEhbHandoff?: boolean;
  tickers?: string[];
}

export interface NeonExpandBatchResult {
  batchKey: string;
  live: boolean;
  startedAt: string;
  finishedAt: string;
  wallMs: number;
  discovered: number;
  skippedExisting: number;
  skippedNonFinancing: number;
  fetched: number;
  persisted: number;
  reused: number;
  analyzed: number;
  failed: number;
  relationshipEdgesPersisted: number;
  calculationExamples: number;
  errors: Array<{ sourceId?: string; ticker?: string; error: string }>;
  persistedSourceIds: string[];
  byClassDelta: Record<string, number>;
  neonAfter: {
    knowledgeSources: number;
    documentByteObjects: number;
    knowledgeRelationships: number;
    distinctIssuers: number;
    covenantSummaryItems: number;
    databaseSizePretty?: string;
  };
  quality: {
    representationLevels: Record<string, number>;
    certifiedPromotionCount: number;
    note: string;
  };
}

function liveAuthorized(): boolean {
  return process.env[MASS_LIVE_ENV] === MASS_LIVE_TOKEN;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function looksLikeAuthenticExhibit(bytes: Buffer): boolean {
  if (bytes.length < 8_000) return false;
  const head = bytes.slice(0, 4_000).toString("utf8").toLowerCase();
  if (head.includes("undeclared automated tool")) return false;
  if (head.includes("your request has been denied")) return false;
  if (head.includes("access denied")) return false;
  return head.includes("<html") || head.includes("<!doctype") || head.includes("<document") || head.includes("agreement");
}

async function ensureBatchRow(batchKey: string, planned: number): Promise<string> {
  const existing = await prisma.knowledgeImportBatch.findUnique({ where: { batchKey } });
  if (existing) return existing.id;
  const row = await prisma.knowledgeImportBatch.create({
    data: {
      batchKey,
      mode: "NEON_MASSIVE_EXPAND",
      status: "RUNNING",
      family: "continuous-debt-corpus",
      plannedCount: planned,
      checkpoint: { completedSourceIds: [] },
    },
  });
  return row.id;
}

async function updateBatch(
  batchKey: string,
  patch: {
    status?: string;
    insertedCount?: number;
    reusedCount?: number;
    errorCount?: number;
    checkpoint?: unknown;
    errorSummary?: string;
    finishedAt?: Date;
  },
): Promise<void> {
  await prisma.knowledgeImportBatch.update({
    where: { batchKey },
    data: {
      ...patch,
      checkpoint: patch.checkpoint ? (patch.checkpoint as never) : undefined,
    },
  });
}

async function loadExistingIdentity(): Promise<{
  sourceIds: Set<string>;
  hashes: Set<string>;
  tickers: Set<string>;
}> {
  const rows = await prisma.knowledgeSource.findMany({
    select: { sourceId: true, originalBytesHash: true, issuerTicker: true },
  });
  return {
    sourceIds: new Set(rows.map((r) => r.sourceId)),
    hashes: new Set(rows.map((r) => r.originalBytesHash).filter(Boolean)),
    tickers: new Set(rows.map((r) => (r.issuerTicker ?? "").toUpperCase()).filter(Boolean)),
  };
}

async function persistAnalyzedSource(params: {
  source: KnowledgeSourceRecord;
  bytes: Buffer;
  store: CorpusStore;
  live: boolean;
  existing: { sourceIds: Set<string>; hashes: Set<string> };
}): Promise<{
  canonical: string;
  persisted: boolean;
  reused: boolean;
  analyzed: boolean;
  documentClass: string;
  candidates: number;
  definitions: number;
  structural: number;
}> {
  const { source, bytes, store, live, existing } = params;
  let canonical = source.sourceId;
  let persisted = false;
  let reused = false;

  if (live) {
    const persist = await persistDurableKnowledgeSource({
      source,
      bytes,
      contentType: "text/html",
    });
    canonical = persist.sourceId;
    reused = persist.reusedExisting;
    persisted = !persist.reusedExisting;
    existing.sourceIds.add(canonical);
    existing.hashes.add(persist.originalBytesHash);
  }

  const processed = await processAcquiredDocument(store, {
    discovered: {
      sourceId: canonical,
      filing: {
        accessionNumber: source.accessionNumber,
        formType: source.formType,
        filingDate: source.filingDate,
        issuer: {
          cik: source.issuerCik,
          ticker: source.issuerTicker ?? undefined,
          name: source.issuerName ?? undefined,
        },
      },
      exhibit: {
        filename: source.exhibitFilename,
        description: source.documentTitle,
        exhibitType: "EX-10",
        sourceUrl: source.sourceUrl,
      },
      discoverySignals: ["neon-massive-expand"],
    },
    bytes,
    contentHash: source.originalBytesHash,
    provenance: source.provenance,
    usageRightsReviewStatus: source.usageRightsReviewStatus,
  });

  const summary = buildDocumentCovenantSummary({
    sourceId: canonical,
    documentTitle: processed.source.documentTitle || source.documentTitle,
    issuerName: processed.source.issuerName ?? source.issuerName ?? undefined,
    issuerCik: source.issuerCik,
    documentClass: processed.source.documentClass,
    candidates: store.loadCandidates(canonical),
    definitions: store.loadDefinitions(canonical),
    structuralNodes: store.loadStructuralNodes(canonical),
    crossReferences: store.loadCrossReferences(canonical),
  });

  if (live) {
    const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: canonical } });
    if (row) {
      const prev =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      await prisma.knowledgeSource.update({
        where: { sourceId: canonical },
        data: {
          documentTitle: processed.source.documentTitle,
          documentClass: processed.source.documentClass as never,
          extractionStatus: processed.source.extractionStatus as never,
          representationLevel: processed.source.representationLevel as never,
          issuerName: processed.source.issuerName ?? source.issuerName,
          issuerTicker: processed.source.issuerTicker ?? source.issuerTicker,
          metadata: JSON.parse(
            JSON.stringify({
              ...prev,
              analysis: {
                structuralNodes: processed.structuralNodeCount,
                definitions: processed.definitionCount,
                covenantCandidates: processed.candidateCount,
                crossReferences: processed.crossReferenceCount,
                processingMs: processed.processingMs,
              },
              covenantSummary: summary,
              promotedToLegalTruth: 0,
              continuousExpandBatch: true,
            }),
          ),
        },
      });
    }
  }

  return {
    canonical,
    persisted,
    reused,
    analyzed: true,
    documentClass: processed.source.documentClass,
    candidates: processed.candidateCount,
    definitions: processed.definitionCount,
    structural: processed.structuralNodeCount,
  };
}

async function importCbcfl(params: {
  repoRoot: string;
  store: CorpusStore;
  live: boolean;
  existing: { sourceIds: Set<string>; hashes: Set<string> };
  remaining: number;
  out: NeonExpandBatchResult;
}): Promise<void> {
  const manPath = path.join(
    params.repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/acquisition-manifest.json",
  );
  if (!existsSync(manPath) || params.remaining <= 0) return;
  const man = JSON.parse(readFileSync(manPath, "utf8")) as {
    documents: Array<{
      docId: string;
      ticker?: string;
      issuer?: string;
      cik?: string;
      accession?: string;
      filingDate?: string;
      form?: string;
      filename?: string;
      description?: string;
      sourceUrl?: string;
      relativeDir: string;
      bodySha256: string;
    }>;
  };

  for (const doc of man.documents) {
    if (params.out.persisted >= params.remaining) break;

    const htmlPath = path.join(params.repoRoot, doc.relativeDir, "source.html");
    if (!existsSync(htmlPath)) {
      params.out.failed += 1;
      params.out.errors.push({ sourceId: doc.docId, error: "missing source.html" });
      continue;
    }
    const bytes = readFileSync(htmlPath);
    const hash = sha256(bytes);
    const sourceId =
      doc.accession && doc.filename
        ? `edgar:${doc.accession}:${doc.filename}`
        : `cbcfl:${doc.docId}`;

    if (params.existing.sourceIds.has(sourceId) || params.existing.hashes.has(hash)) {
      params.out.skippedExisting += 1;
      continue;
    }

    const title = doc.description || doc.filename || doc.docId;
    if (
      !isSubstantiveFinancingPrecedent({
        sourceId,
        documentTitle: title,
        documentClass: "CREDIT_AGREEMENT",
        exhibitFilename: doc.filename ?? "source.html",
        provenance: "cbcfl-phase2-edgar-acquisition",
        byteSize: bytes.length,
      })
    ) {
      params.out.skippedNonFinancing += 1;
      continue;
    }

    const source: KnowledgeSourceRecord = {
      sourceId,
      issuerCik: (doc.cik ?? "0000000000").padStart(10, "0"),
      issuerTicker: doc.ticker,
      issuerName: doc.issuer,
      accessionNumber: doc.accession ?? sourceId,
      exhibitFilename: doc.filename ?? "source.html",
      sourceUrl: doc.sourceUrl ?? `committed://${sourceId}`,
      filingDate: (doc.filingDate ?? "1970-01-01").slice(0, 10),
      formType: doc.form ?? "8-K",
      documentTitle: title,
      documentClass: "CREDIT_AGREEMENT",
      originalBytesHash: hash,
      acquisitionTimestamp: new Date().toISOString(),
      parserVersion: "neon-massive-expand.v1",
      extractionStatus: "ACQUIRED",
      representationLevel: "SOURCE_ONLY",
      provenance: "cbcfl-phase2-edgar-acquisition",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      byteSize: bytes.length,
    };

    try {
      const r = await persistAnalyzedSource({
        source,
        bytes,
        store: params.store,
        live: params.live,
        existing: params.existing,
      });
      if (r.persisted) {
        params.out.persisted += 1;
        params.out.persistedSourceIds.push(r.canonical);
        params.out.byClassDelta[r.documentClass] = (params.out.byClassDelta[r.documentClass] ?? 0) + 1;
      } else if (r.reused) {
        params.out.reused += 1;
      }
      if (r.analyzed) params.out.analyzed += 1;
    } catch (e) {
      params.out.failed += 1;
      params.out.errors.push({
        sourceId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function importEhbHandoff(params: {
  repoRoot: string;
  store: CorpusStore;
  client: EdgarKnowledgeClient;
  live: boolean;
  existing: { sourceIds: Set<string>; hashes: Set<string> };
  remaining: number;
  out: NeonExpandBatchResult;
}): Promise<void> {
  const handoffPath = path.join(params.repoRoot, "docs/edgar-historical-backfill/ckf-handoff-summary.json");
  if (!existsSync(handoffPath) || params.remaining <= 0) return;
  const handoff = JSON.parse(readFileSync(handoffPath, "utf8")) as {
    documents?: Array<{
      sourceId: string;
      filing: DiscoveredFilingDocument["filing"];
      exhibit: DiscoveredFilingDocument["exhibit"];
      documentClass?: string;
    }>;
  };
  const docs = handoff.documents ?? [];

  for (const d of docs) {
    if (params.out.persisted >= params.remaining) break;
    if (params.existing.sourceIds.has(d.sourceId)) {
      params.out.skippedExisting += 1;
      continue;
    }
    params.out.discovered += 1;
    try {
      const { bytes, contentHash } = await params.client.fetchDocument({
        sourceId: d.sourceId,
        filing: d.filing,
        exhibit: d.exhibit,
        discoverySignals: ["ehb-handoff"],
      });
      params.out.fetched += 1;
      if (!looksLikeAuthenticExhibit(bytes)) {
        params.out.skippedNonFinancing += 1;
        continue;
      }
      if (params.existing.hashes.has(contentHash)) {
        params.out.skippedExisting += 1;
        continue;
      }
      const title = d.exhibit.description || d.exhibit.filename;
      const documentClass = (d.documentClass as KnowledgeSourceRecord["documentClass"]) || "UNKNOWN";
      if (
        !isSubstantiveFinancingPrecedent({
          sourceId: d.sourceId,
          documentTitle: title,
          documentClass,
          exhibitFilename: d.exhibit.filename,
          provenance: "ehb-handoff-consume",
          byteSize: bytes.length,
        })
      ) {
        params.out.skippedNonFinancing += 1;
        continue;
      }
      const source: KnowledgeSourceRecord = {
        sourceId: d.sourceId,
        issuerCik: d.filing.issuer.cik.padStart(10, "0"),
        issuerTicker: d.filing.issuer.ticker,
        issuerName: d.filing.issuer.name,
        accessionNumber: d.filing.accessionNumber,
        exhibitFilename: d.exhibit.filename,
        sourceUrl: d.exhibit.sourceUrl,
        filingDate: d.filing.filingDate,
        formType: d.filing.formType,
        documentTitle: title,
        documentClass,
        originalBytesHash: contentHash,
        acquisitionTimestamp: new Date().toISOString(),
        parserVersion: "neon-massive-expand.v1",
        extractionStatus: "ACQUIRED",
        representationLevel: "SOURCE_ONLY",
        provenance: "ehb-handoff-consume",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
        byteSize: bytes.length,
      };
      const r = await persistAnalyzedSource({
        source,
        bytes,
        store: params.store,
        live: params.live,
        existing: params.existing,
      });
      if (r.persisted) {
        params.out.persisted += 1;
        params.out.persistedSourceIds.push(r.canonical);
        params.out.byClassDelta[r.documentClass] = (params.out.byClassDelta[r.documentClass] ?? 0) + 1;
      } else if (r.reused) params.out.reused += 1;
      if (r.analyzed) params.out.analyzed += 1;
    } catch (e) {
      params.out.failed += 1;
      params.out.errors.push({
        sourceId: d.sourceId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function importLiveEdgar(params: {
  store: CorpusStore;
  client: EdgarKnowledgeClient;
  live: boolean;
  existing: { sourceIds: Set<string>; hashes: Set<string>; tickers: Set<string> };
  remaining: number;
  maxIssuers: number;
  filingLimit: number;
  maxPerIssuer: number;
  tickers?: string[];
  out: NeonExpandBatchResult;
}): Promise<void> {
  if (params.remaining <= 0) return;

  const targets = params.tickers?.length
    ? DIVERSITY_EXPAND_TARGETS.filter((t) => params.tickers!.includes(t.ticker)).concat(
        params.tickers
          .filter((t) => !DIVERSITY_EXPAND_TARGETS.some((d) => d.ticker === t))
          .map((ticker) => ({
            ticker,
            priorityClasses: ["CREDIT_AGREEMENT", "INDENTURE", "AMENDMENT"],
            debtHint: "MIXED",
            rationale: "explicit ticker",
          })),
      )
    : DIVERSITY_EXPAND_TARGETS;

  // Prefer issuers with fewer existing docs
  const issuerCounts = new Map<string, number>();
  const rows = await prisma.knowledgeSource.findMany({
    where: { issuerTicker: { not: null } },
    select: { issuerTicker: true },
  });
  for (const r of rows) {
    const t = (r.issuerTicker ?? "").toUpperCase();
    issuerCounts.set(t, (issuerCounts.get(t) ?? 0) + 1);
  }
  const ordered = [...targets].sort(
    (a, b) => (issuerCounts.get(a.ticker) ?? 0) - (issuerCounts.get(b.ticker) ?? 0),
  );

  let issuersUsed = 0;
  for (const target of ordered) {
    if (params.out.persisted >= params.remaining) break;
    if (issuersUsed >= params.maxIssuers) break;
    issuersUsed += 1;
    try {
      const issuer = await params.client.resolveCikForTicker(target.ticker);
      const discovered = await params.client.discoverForCik(issuer.cik, {
        filingLimit: params.filingLimit,
      });
      params.out.discovered += discovered.length;

      const ranked = [...discovered]
        .map((d) => {
          const title = d.exhibit.description || d.exhibit.filename;
          let score = scoreExhibitForTargets(title, d.exhibit.filename, target.priorityClasses);
          const size = d.exhibit.sizeBytes ?? 0;
          const type = (d.exhibit.exhibitType || "").toUpperCase();
          const isEx10or4 = /^EX-10(\.|$)/.test(type) || /^EX-4(\.|$)/.test(type);
          // Prefer large material exhibits when description is only "EX-10.1"
          if (isEx10or4 && size >= 80_000) score += 5;
          if (isEx10or4 && size >= 400_000) score += 8;
          // Drop tiny EX-99 earnings/press exhibits unless debt-titled
          if (/^EX-99/i.test(type) && score < 8 && size < 80_000) score = -1;
          if (/\b(?:earnings|press release|xbrl)\b/i.test(title) && score < 10) score = -1;
          return { d, score };
        })
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score);

      let perIssuer = 0;
      for (const { d } of ranked) {
        if (params.out.persisted >= params.remaining) break;
        if (perIssuer >= params.maxPerIssuer) break;
        if (params.existing.sourceIds.has(d.sourceId)) {
          params.out.skippedExisting += 1;
          continue;
        }
        try {
          const title = d.exhibit.description || d.exhibit.filename;
          const preClass = classifyDebtDocument({
            title,
            description: d.exhibit.description,
            exhibitType: d.exhibit.exhibitType,
            filename: d.exhibit.filename,
          });
          const indexSize = d.exhibit.sizeBytes ?? 0;
          // Pre-filter before network fetch to protect SEC budget / storage.
          if (
            indexSize > 0 &&
            !isSubstantiveFinancingPrecedent({
              sourceId: d.sourceId,
              documentTitle: title,
              documentClass: preClass.documentClass,
              exhibitFilename: d.exhibit.filename,
              provenance: "sec-edgar-continuous-expand",
              byteSize: indexSize,
            })
          ) {
            params.out.skippedNonFinancing += 1;
            continue;
          }
          const type = (d.exhibit.exhibitType || "").toUpperCase();
          if (/^EX-99/i.test(type) && !/\b(?:indenture|credit|loan|intercreditor|guarantee|security agreement)\b/i.test(title)) {
            params.out.skippedNonFinancing += 1;
            continue;
          }

          const { bytes, contentHash } = await params.client.fetchDocument(d);
          params.out.fetched += 1;
          if (!looksLikeAuthenticExhibit(bytes)) {
            params.out.skippedNonFinancing += 1;
            continue;
          }
          if (params.existing.hashes.has(contentHash)) {
            params.out.skippedExisting += 1;
            continue;
          }
          if (
            !isSubstantiveFinancingPrecedent({
              sourceId: d.sourceId,
              documentTitle: title,
              documentClass: preClass.documentClass,
              exhibitFilename: d.exhibit.filename,
              provenance: "sec-edgar-continuous-expand",
              byteSize: bytes.length,
            })
          ) {
            params.out.skippedNonFinancing += 1;
            continue;
          }
          const source: KnowledgeSourceRecord = {
            sourceId: d.sourceId,
            issuerCik: issuer.cik,
            issuerTicker: issuer.ticker ?? target.ticker,
            issuerName: issuer.name,
            accessionNumber: d.filing.accessionNumber,
            exhibitFilename: d.exhibit.filename,
            sourceUrl: d.exhibit.sourceUrl,
            filingDate: d.filing.filingDate,
            formType: d.filing.formType,
            documentTitle: title,
            documentClass: preClass.documentClass,
            originalBytesHash: contentHash,
            acquisitionTimestamp: new Date().toISOString(),
            parserVersion: "neon-massive-expand.v1",
            extractionStatus: "ACQUIRED",
            representationLevel: "SOURCE_ONLY",
            provenance: "sec-edgar-continuous-expand",
            usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
            byteSize: bytes.length,
          };
          const r = await persistAnalyzedSource({
            source,
            bytes,
            store: params.store,
            live: params.live,
            existing: params.existing,
          });
          if (r.persisted) {
            params.out.persisted += 1;
            params.out.persistedSourceIds.push(r.canonical);
            params.out.byClassDelta[r.documentClass] = (params.out.byClassDelta[r.documentClass] ?? 0) + 1;
            perIssuer += 1;
          } else if (r.reused) {
            params.out.reused += 1;
          }
          if (r.analyzed) params.out.analyzed += 1;
        } catch (e) {
          params.out.failed += 1;
          params.out.errors.push({
            sourceId: d.sourceId,
            ticker: target.ticker,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (e) {
      params.out.failed += 1;
      params.out.errors.push({
        ticker: target.ticker,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function neonSnapshot(): Promise<NeonExpandBatchResult["neonAfter"]> {
  const knowledgeSources = await prisma.knowledgeSource.count();
  const documentByteObjects = await prisma.documentByteObject.count();
  const knowledgeRelationships = await prisma.knowledgeRelationshipEdge.count();
  const issuers = await prisma.knowledgeSource.findMany({
    select: { issuerCik: true },
    distinct: ["issuerCik"],
  });
  const rows = await prisma.knowledgeSource.findMany({ select: { metadata: true, representationLevel: true } });
  let covenantSummaryItems = 0;
  const representationLevels: Record<string, number> = {};
  for (const r of rows) {
    representationLevels[r.representationLevel] = (representationLevels[r.representationLevel] ?? 0) + 1;
    const m =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    const items = (m.covenantSummary as { items?: unknown[] } | undefined)?.items;
    if (Array.isArray(items)) covenantSummaryItems += items.length;
  }
  let databaseSizePretty: string | undefined;
  try {
    const size = await prisma.$queryRaw<Array<{ db_size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size
    `;
    databaseSizePretty = size[0]?.db_size;
  } catch {
    /* ignore */
  }
  return {
    knowledgeSources,
    documentByteObjects,
    knowledgeRelationships,
    distinctIssuers: issuers.length,
    covenantSummaryItems,
    databaseSizePretty,
  };
}

export async function runNeonExpandBatch(
  options: NeonExpandBatchOptions = {},
): Promise<{ result: NeonExpandBatchResult; calculationCases: CalculationExampleCase[] }> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const live = Boolean(options.live);
  if (live) {
    // Dual operator gate: mass live-write token AND explicit remediation resume.
    // liveAuthorized() alone is insufficient while quality remediation blockers remain open.
    assertCorpusGraphWriteAuthorized("neon-massive-expand");
    if (!liveAuthorized()) {
      throw new Error(`Live Neon expand refused: set ${MASS_LIVE_ENV}=${MASS_LIVE_TOKEN}`);
    }
  }

  process.env.HEADROOM_SEC_FETCH_OWNER = process.env.HEADROOM_SEC_FETCH_OWNER || "WS-CKF";

  const batchKey =
    options.batchKey ?? `neon-massive-expand-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const maxNew = options.maxNewDocuments ?? 25;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const out: NeonExpandBatchResult = {
    batchKey,
    live,
    startedAt,
    finishedAt: "",
    wallMs: 0,
    discovered: 0,
    skippedExisting: 0,
    skippedNonFinancing: 0,
    fetched: 0,
    persisted: 0,
    reused: 0,
    analyzed: 0,
    failed: 0,
    relationshipEdgesPersisted: 0,
    calculationExamples: 0,
    errors: [],
    persistedSourceIds: [],
    byClassDelta: {},
    neonAfter: {
      knowledgeSources: 0,
      documentByteObjects: 0,
      knowledgeRelationships: 0,
      distinctIssuers: 0,
      covenantSummaryItems: 0,
    },
    quality: {
      representationLevels: {},
      certifiedPromotionCount: 0,
      note: "Automated pipeline stops at DISCOVERED_CANDIDATE / DETERMINISTICALLY_VALIDATED — never invents CERTIFIED",
    },
  };

  if (live) await ensureBatchRow(batchKey, maxNew);

  const store = new CorpusStore(defaultCorpusPaths(path.join(repoRoot, ".local-knowledge-corpus")));
  // requireDebtSignal=false: many modern indexes label exhibits only as "EX-10.1".
  // We still gate on size + post-fetch classification / substantive financing checks.
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(store.paths.cache, "sec"),
    logDir: path.join(store.paths.root, "logs"),
    requireDebtSignal: false,
  });
  const existing = await loadExistingIdentity();

  const includeCbcfl = options.includeCbcfl ?? true;
  const includeEhb = options.includeEhbHandoff ?? true;
  const includeLive = options.includeLiveEdgar ?? true;

  if (includeCbcfl) {
    await importCbcfl({
      repoRoot,
      store,
      live,
      existing,
      remaining: maxNew - out.persisted,
      out,
    });
  }
  if (includeEhb && out.persisted < maxNew) {
    await importEhbHandoff({
      repoRoot,
      store,
      client,
      live,
      existing,
      remaining: maxNew - out.persisted,
      out,
    });
  }
  if (includeLive && out.persisted < maxNew) {
    await importLiveEdgar({
      store,
      client,
      live,
      existing,
      remaining: maxNew - out.persisted,
      maxIssuers: options.maxIssuers ?? 12,
      filingLimit: options.filingLimit ?? 80,
      maxPerIssuer: options.maxPerIssuer ?? 3,
      tickers: options.tickers,
      out,
    });
  }

  // Relationships (additive, discovered-only)
  let relPersisted = 0;
  if (live) {
    try {
      const amend = await persistAmendmentGraph({ dryRun: false });
      relPersisted += amend.persisted ?? 0;
    } catch (e) {
      out.errors.push({
        error: `amendment-graph: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    try {
      const prov = await persistProvisionGraph({ dryRun: false });
      relPersisted += prov.persisted ?? 0;
    } catch (e) {
      out.errors.push({
        error: `provision-graph: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    // Also persist document-level relationships from local store sources if present
    try {
      const localSources = store.listSources();
      const docRels = discoverDocumentRelationships(localSources);
      store.saveRelationships(docRels);
      const idRows = await prisma.knowledgeSource.findMany({
        where: { sourceId: { in: localSources.map((s) => s.sourceId) } },
        select: { id: true, sourceId: true },
      });
      const idBySourceId = new Map(idRows.map((r) => [r.sourceId, r.id]));
      for (const r of docRels) {
        const sourceRecordId = idBySourceId.get(r.sourceId);
        if (!sourceRecordId || !idBySourceId.has(r.targetId)) continue;
        const existingEdge = await prisma.knowledgeRelationshipEdge.findFirst({
          where: {
            sourceRecordId,
            targetSourceId: r.targetId,
            kind: r.kind as never,
          },
        });
        if (existingEdge) continue;
        await prisma.knowledgeRelationshipEdge.create({
          data: {
            sourceRecordId,
            targetSourceId: r.targetId,
            kind: r.kind as never,
            evidenceStatus: (r.evidenceStatus ?? "DISCOVERED") as never,
            rationale: r.rationale.slice(0, 500),
            confidence: r.confidence ?? 0.5,
            metadata: {
              discoveryId: r.id,
              note: "Document relationship DISCOVERED — not legal effectiveness",
            },
          },
        });
        relPersisted += 1;
      }
    } catch (e) {
      out.errors.push({
        error: `document-relationships: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  out.relationshipEdgesPersisted = relPersisted;

  // Calculation example library (synthetic; expected ≠ engine prediction)
  const anchors = (
    await prisma.knowledgeSource.findMany({
      where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
      select: { sourceId: true, documentClass: true },
      take: 20,
      orderBy: { updatedAt: "desc" },
    })
  ).map((r) => ({
    sourceId: r.sourceId,
    documentClass: r.documentClass,
  }));
  const calculationCases = buildSyntheticCalculationLibrary({ sourceAnchors: anchors });
  out.calculationExamples = calculationCases.length;

  const artifactDir = path.join(repoRoot, "docs/knowledge-factory/continuous");
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    path.join(artifactDir, "calculation-examples.json"),
    JSON.stringify(
      {
        schema: "kf-calculation-example-library.v1",
        generatedAt: new Date().toISOString(),
        note: "Synthetic financial inputs — not authentic customer evidence; expected stored separately from enginePrediction",
        cases: calculationCases,
      },
      null,
      2,
    ) + "\n",
  );

  out.neonAfter = await neonSnapshot();
  const levelRows = await prisma.knowledgeSource.groupBy({
    by: ["representationLevel"],
    _count: true,
  });
  out.quality.representationLevels = Object.fromEntries(
    levelRows.map((r) => [r.representationLevel, r._count]),
  );
  out.quality.certifiedPromotionCount = out.quality.representationLevels["CERTIFIED"] ?? 0;

  out.finishedAt = new Date().toISOString();
  out.wallMs = Date.now() - t0;

  writeFileSync(
    path.join(artifactDir, `${batchKey}.json`),
    JSON.stringify(out, null, 2) + "\n",
  );
  writeFileSync(
    path.join(artifactDir, "latest-batch.json"),
    JSON.stringify(out, null, 2) + "\n",
  );

  if (live) {
    await updateBatch(batchKey, {
      status: out.failed > 0 && out.persisted === 0 ? "FAILED" : "COMPLETED",
      insertedCount: out.persisted,
      reusedCount: out.reused,
      errorCount: out.failed,
      checkpoint: {
        completedSourceIds: out.persistedSourceIds,
        byClassDelta: out.byClassDelta,
        neonAfter: out.neonAfter,
      },
      errorSummary: out.errors.slice(0, 20).map((e) => e.error).join(" | ").slice(0, 1000) || undefined,
      finishedAt: new Date(),
    });
  }

  return { result: out, calculationCases };
}
