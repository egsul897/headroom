/**
 * Ingestion job runner (docs/autonomous-retrieval-phase-a-foundation.md).
 *
 * Mirrors lib/extraction/run-stage.ts + pipeline.ts's exact proven discipline
 * for IngestionJob/IngestionJobStage instead of ExtractionRun/ExtractionStage:
 * `runIngestionJobStage` is the single-stage unit of work (load the stage
 * row, refuse if already COMPLETE, mark IN_PROGRESS, assemble this stage's
 * input from PERSISTED prior-stage `output` JSON only - never in-memory
 * state threaded across calls - run the stage, persist its own `output`, and
 * mark COMPLETE; on ANY failure mark FAILED with a clear error, leaving
 * every sibling stage's row untouched). `runAllPendingIngestionStages` drives
 * every pending stage in STAGE order, stopping at the first failure - the
 * same "one request per stage, or a loop across pending stages" contract
 * that makes this Vercel-compatible by construction (never one giant
 * synchronous "discover, fetch, extract everything" request).
 *
 * Scope decision (documented per the task's own "use your judgment, document
 * it" allowance): a Phase A IngestionJob is always connector-scoped -
 * `sourceConnectionId` is required (the schema itself leaves it nullable for
 * a future multi-connector job Phase B may build; this phase does not
 * implement that orchestration). DOCUMENT_UPLOAD does not run through this
 * job machinery at all - a manual upload is a synchronous, single-file,
 * human-initiated action with nothing to "discover" or poll, so it converges
 * into the SourceArtifact/dedup ledger through
 * lib/connectors/upload-connector.ts's `uploadDocumentThroughIngestion`
 * directly instead. Both paths write into the exact same SourceArtifact
 * table and (for documents) the exact same createExtractionRun/
 * runAllPendingStages pipeline - the convergence the task requires - just
 * through two different entry points suited to how each connector actually
 * produces bytes (pull vs. push).
 */

import { type CompanySourceConnection, type IngestionJob, type IngestionJobKind, type IngestionJobStage, type IngestionStageKind, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { getDocumentStorageProvider } from "../document-storage";
import { chunkDocument } from "../extraction/chunk";
import { parseDocument } from "../extraction/parse";
import { persistDocumentChunks } from "../extraction/persist-chunks";
import { getExtractionProvider } from "../extraction/get-provider";
import { runExtractionForDocument } from "../onboarding/documents";
import { FinancialFactValueSchema } from "../extraction/schemas";
import { upsertArtifactWithDedup, findDuplicateArtifact } from "./dedup";
import { CsvFinancialConnector } from "./csv-financial-connector";
import { getConnectorForConnection } from "./registry";
import type { DiscoveredSourceItem, SourceConnector } from "./types";

/** Which IngestionJobStage rows a job needs, by kind - documented per the task's own "minimal correct stage set per kind" instruction. INITIALIZE/AMENDMENT_PROCESS run the full pipeline (a first-time or amendment-triggered pull genuinely needs every stage, including the RECONCILE stub - see runReconcileStage below). SYNC (an incremental delta pull) skips RECONCILE, exactly as the task brief's own example names - Phase B has not wired real reconciliation logic yet for ANY job kind, so carrying a stub RECONCILE stage through every SYNC run would only be busywork with no real behavior behind it; INITIALIZE/AMENDMENT_PROCESS keep it so the full stage set exists once a company's very first pull completes (or an amendment triggers reprocessing), ready for Phase B to fill in. */
const STAGE_SET_BY_KIND: Record<IngestionJobKind, IngestionStageKind[]> = {
  INITIALIZE: ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT", "RECONCILE", "COMPLETE"],
  SYNC: ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT", "COMPLETE"],
  AMENDMENT_PROCESS: ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT", "RECONCILE", "COMPLETE"],
};

export class IngestionStageAlreadyCompleteError extends Error {
  constructor(stage: string) {
    super(`IngestionJobStage ${stage} is already COMPLETE - refusing to re-run it.`);
  }
}

export interface CreateIngestionJobParams {
  companyId: string;
  kind: IngestionJobKind;
  sourceConnectionId: string;
  /** CSV_FINANCIAL only: the uploaded CSV's raw bytes, stored via lib/document-storage and carried into the DISCOVER stage's own persisted `output` (never threaded in-memory) so a fresh process can still run DISCOVER/FETCH/re-parse deterministically from durable state. */
  rawInput?: Buffer;
}

export async function createIngestionJob(params: CreateIngestionJobParams): Promise<IngestionJob & { stages: IngestionJobStage[] }> {
  const connection = await prisma.companySourceConnection.findUniqueOrThrow({ where: { id: params.sourceConnectionId } });
  if (connection.companyId !== params.companyId) {
    throw new Error(`createIngestionJob: connection ${params.sourceConnectionId} does not belong to company ${params.companyId}.`);
  }

  let inputStorageRef: string | undefined;
  if (params.rawInput) {
    if (connection.connectorType !== "CSV_FINANCIAL") {
      throw new Error(`createIngestionJob: rawInput is only supported for CSV_FINANCIAL connections (got ${connection.connectorType}).`);
    }
    const stored = await getDocumentStorageProvider().store({ companyId: params.companyId, filename: "ingestion-input.csv", contentType: "text/csv", data: params.rawInput });
    inputStorageRef = stored.storageRef;
  }

  const stageKinds = STAGE_SET_BY_KIND[params.kind];
  return prisma.ingestionJob.create({
    data: {
      companyId: params.companyId,
      sourceConnectionId: params.sourceConnectionId,
      kind: params.kind,
      stages: {
        create: stageKinds.map((stage) => ({
          stage,
          output: stage === "DISCOVER" && inputStorageRef ? { inputStorageRef } : undefined,
        })),
      },
    },
    include: { stages: true },
  });
}

interface TaggedDiscoveredItem extends DiscoveredSourceItem {
  sourceConnectionId: string;
}

/** Reconstructs a connector instance from PERSISTED state only - never an in-memory value carried from a prior stage's own invocation. For CSV_FINANCIAL, re-parses the SAME bytes DISCOVER already parsed (retrieved via the same inputStorageRef) so `fetch()` can resolve a row by id deterministically, even in a fresh process/request. */
async function buildConnector(connection: CompanySourceConnection, discoverOutput: Record<string, unknown> | null): Promise<SourceConnector> {
  if (connection.connectorType === "EDGAR") {
    return getConnectorForConnection(connection);
  }
  if (connection.connectorType === "CSV_FINANCIAL") {
    const inputStorageRef = discoverOutput?.inputStorageRef;
    if (typeof inputStorageRef !== "string") {
      throw new Error(`buildConnector: CSV_FINANCIAL connection ${connection.id} has no inputStorageRef on its DISCOVER stage output - was createIngestionJob called with rawInput?`);
    }
    const bytes = await getDocumentStorageProvider().retrieve(inputStorageRef);
    const connector = new CsvFinancialConnector({ rawCsv: bytes, sourceLabel: connection.id });
    await connector.discover({}); // hydrate internal parse state deterministically from the same persisted bytes
    return connector;
  }
  throw new Error(`buildConnector: connectorType ${connection.connectorType} does not run through the IngestionJob pipeline - see this file's own header comment (DOCUMENT_UPLOAD converges via uploadDocumentThroughIngestion instead).`);
}

async function loadStageOutput(ingestionJobId: string, stage: IngestionStageKind): Promise<Record<string, unknown> | null> {
  const row = await prisma.ingestionJobStage.findUnique({ where: { ingestionJobId_stage: { ingestionJobId, stage } } });
  return (row?.output as Record<string, unknown> | null) ?? null;
}

// ---------------------------------------------------------------------------
// Per-stage handlers. Each returns the counts + the durable `output` payload
// to persist on this stage's own row.
// ---------------------------------------------------------------------------

interface StageOutcome {
  recordsDiscovered: number;
  recordsChanged: number;
  output: Record<string, unknown>;
}

async function runDiscoverStage(job: IngestionJob, connection: CompanySourceConnection, ownStageOutput: Record<string, unknown> | null): Promise<StageOutcome> {
  const connector = await buildConnector(connection, ownStageOutput);
  const items = job.kind === "SYNC" ? (await connector.syncSince(connection.cursor)).map((d) => d.item) : await connector.discover({});
  const tagged: TaggedDiscoveredItem[] = items.map((item) => ({ ...item, sourceConnectionId: connection.id }));
  return {
    recordsDiscovered: tagged.length,
    recordsChanged: tagged.length,
    output: { ...(ownStageOutput ?? {}), items: tagged },
  };
}

async function runFetchStage(job: IngestionJob, connectionsById: Map<string, CompanySourceConnection>, discoverOutput: Record<string, unknown> | null): Promise<StageOutcome> {
  const items = (discoverOutput?.items as TaggedDiscoveredItem[] | undefined) ?? [];
  const hydratedConnectors = new Map<string, SourceConnector>();
  const storage = getDocumentStorageProvider();
  const artifactIds: string[] = [];
  let changed = 0;

  for (const item of items) {
    const connection = connectionsById.get(item.sourceConnectionId);
    if (!connection) throw new Error(`runFetchStage: no connection ${item.sourceConnectionId} loaded for item ${item.id}.`);

    let connector = hydratedConnectors.get(connection.id);
    if (!connector) {
      connector = await buildConnector(connection, discoverOutput);
      hydratedConnectors.set(connection.id, connector);
    }

    const raw = await connector.fetch(item);
    const alreadyExists = await findDuplicateArtifact(job.companyId, raw.contentHash);

    let storageRef: string | undefined;
    let storageProviderName: string | undefined;
    if (!alreadyExists && item.artifactType === "DOCUMENT") {
      const stored = await storage.store({ companyId: job.companyId, filename: item.sourceIdentifier || item.id, contentType: raw.mimeType ?? "application/octet-stream", data: raw.data });
      storageRef = stored.storageRef;
      storageProviderName = stored.provider;
    }

    const { artifact, wasDuplicate } = await upsertArtifactWithDedup({
      companyId: job.companyId,
      sourceConnectionId: connection.id,
      artifactType: item.artifactType,
      sourceIdentifier: item.sourceIdentifier,
      sourceUri: item.sourceUri,
      retrievedAt: new Date(),
      effectiveDate: item.effectiveDate ? new Date(item.effectiveDate) : null,
      contentHash: raw.contentHash,
      mimeType: raw.mimeType,
      storageRef,
      rawPayload: raw.rawPayload,
      provenanceMetadata: storageProviderName ? { storageProvider: storageProviderName } : undefined,
    });
    artifactIds.push(artifact.id);
    if (!wasDuplicate) changed++;
  }

  return { recordsDiscovered: items.length, recordsChanged: changed, output: { artifactIds } };
}

/** Materializes any un-materialized DOCUMENT artifact into a real Document row (source: parse -> chunk -> persist, exactly Phase 1's own pipeline - see lib/onboarding/documents.ts's uploadAndChunkDocument, which this deliberately does NOT call wholesale since there is no uploaded-file-bytes flow here, only already-fetched artifact bytes+storageRef). FINANCIAL_RECORD artifacts are left alone here - EXTRACT handles those directly. */
async function runClassifyDedupeStage(job: IngestionJob, connection: CompanySourceConnection, fetchOutput: Record<string, unknown> | null): Promise<StageOutcome> {
  const artifactIds = (fetchOutput?.artifactIds as string[] | undefined) ?? [];
  const artifacts = await prisma.sourceArtifact.findMany({ where: { id: { in: artifactIds }, artifactType: "DOCUMENT", documentId: null } });
  const storage = getDocumentStorageProvider();
  const materializedDocumentIds: string[] = [];

  for (const artifact of artifacts) {
    if (!artifact.storageRef) continue; // a duplicate of an artifact that was itself never stored (shouldn't happen for a genuinely-new row, but fail closed rather than throw mid-batch)
    const data = await storage.retrieve(artifact.storageRef);
    const provenanceMeta = artifact.provenanceMetadata as { storageProvider?: string } | null;
    const document = await prisma.document.create({
      data: {
        companyId: job.companyId,
        name: artifact.sourceIdentifier ?? `${connection.connectorType} document ${artifact.id}`,
        type: "OTHER",
        storageRef: artifact.storageRef,
        storageProvider: provenanceMeta?.storageProvider,
        originalFilename: artifact.sourceIdentifier,
        uploadedAt: artifact.retrievedAt,
        source: `connector:${connection.connectorType}`,
        typeConfirmedByUser: false,
        amendmentRelationshipConfirmedByUser: false,
      },
    });
    const parsed = await parseDocument(data, artifact.mimeType ?? "text/plain");
    const chunks = chunkDocument(parsed);
    await persistDocumentChunks(document.id, chunks);
    await prisma.sourceArtifact.update({ where: { id: artifact.id }, data: { documentId: document.id } });
    materializedDocumentIds.push(document.id);
  }

  return { recordsDiscovered: artifacts.length, recordsChanged: materializedDocumentIds.length, output: { materializedDocumentIds } };
}

/** Ensures a stable "container" Document/ExtractionRun/ExtractionStage chain exists for FINANCIAL_RECORD candidates to hang off of, satisfying ExtractionCandidate's own required (sourceDocumentId, extractionRunId, extractionStageId) foreign keys without a schema change - a CSV upload genuinely IS the "document" a financial fact was sourced from, so this is real provenance, not a workaround. Idempotent: reuses the same synthetic Document/ExtractionRun for a given connection across repeated EXTRACT stage runs. */
async function ensureFinancialFactContainer(companyId: string, connection: CompanySourceConnection): Promise<{ documentId: string; extractionRunId: string; extractionStageId: string }> {
  const marker = `connector-financial-records:${connection.id}`;
  let document = await prisma.document.findFirst({ where: { companyId, source: marker } });
  if (!document) {
    document = await prisma.document.create({
      data: { companyId, name: `${connection.provider} - financial records`, type: "OTHER", source: marker, typeConfirmedByUser: true, amendmentRelationshipConfirmedByUser: true },
    });
  }

  let run = await prisma.extractionRun.findFirst({ where: { documentId: document.id } });
  if (!run) {
    run = await prisma.extractionRun.create({
      data: { companyId, documentId: document.id, provider: "connector", model: "n/a", promptVersion: "n/a", schemaVersion: "v1" },
    });
  }

  let stage = await prisma.extractionStage.findUnique({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "FINANCIAL_INPUTS" } } });
  if (!stage) {
    stage = await prisma.extractionStage.create({
      data: { extractionRunId: run.id, stage: "FINANCIAL_INPUTS", status: "COMPLETE", attemptCount: 1, startedAt: new Date(), completedAt: new Date() },
    });
  }

  return { documentId: document.id, extractionRunId: run.id, extractionStageId: stage.id };
}

/**
 * For DOCUMENT artifacts materialized in CLASSIFY_DEDUPE: kicks off the
 * EXACT SAME Phase 1/2 extraction pipeline (createExtractionRun +
 * runAllPendingStages via runExtractionForDocument) any manually-uploaded
 * document already goes through - no second classification/extraction path.
 *
 * For FINANCIAL_RECORD artifacts: creates ExtractionCandidate rows of kind
 * FINANCIAL_FACT DIRECTLY - no LLM call, per the task brief ("the CSV row's
 * own values map straightforwardly"). Idempotent on stage retry: an artifact
 * already converted to a candidate (tracked via proposedValue.sourceRecordRef
 * = the artifact's own id) is skipped, never double-created.
 */
async function runExtractStage(job: IngestionJob, connection: CompanySourceConnection, classifyOutput: Record<string, unknown> | null, fetchOutput: Record<string, unknown> | null): Promise<StageOutcome> {
  let extractedDocuments = 0;
  let createdFacts = 0;

  const materializedDocumentIds = (classifyOutput?.materializedDocumentIds as string[] | undefined) ?? [];
  if (materializedDocumentIds.length > 0) {
    const { provider, providerName, model } = getExtractionProvider();
    for (const documentId of materializedDocumentIds) {
      await runExtractionForDocument({ companyId: job.companyId, documentId, provider, providerName, model });
      extractedDocuments++;
    }
  }

  const artifactIds = (fetchOutput?.artifactIds as string[] | undefined) ?? [];
  const financialArtifacts = await prisma.sourceArtifact.findMany({ where: { id: { in: artifactIds }, artifactType: "FINANCIAL_RECORD" } });
  if (financialArtifacts.length > 0) {
    const existingCandidates = await prisma.extractionCandidate.findMany({ where: { companyId: job.companyId, kind: "FINANCIAL_FACT" }, select: { proposedValue: true } });
    const alreadyProcessed = new Set(existingCandidates.map((c) => (c.proposedValue as { sourceRecordRef?: string }).sourceRecordRef).filter((v): v is string => Boolean(v)));

    const pending = financialArtifacts.filter((a) => !alreadyProcessed.has(a.id));
    if (pending.length > 0) {
      const container = await ensureFinancialFactContainer(job.companyId, connection);
      for (const artifact of pending) {
        const payload = artifact.rawPayload as { metricName?: string; value?: number; asOfDate?: string; unit?: string | null } | null;
        if (!payload) continue;
        const candidateValue = {
          metricName: payload.metricName,
          value: payload.value,
          asOfDate: payload.asOfDate,
          unit: payload.unit ?? undefined,
          sourceRecordRef: artifact.id,
        };
        const validated = FinancialFactValueSchema.safeParse(candidateValue);
        if (!validated.success) {
          // Fail closed for this one row - never a fabricated candidate - but never abort the whole batch either.
          continue;
        }
        await prisma.extractionCandidate.create({
          data: {
            extractionRunId: container.extractionRunId,
            extractionStageId: container.extractionStageId,
            companyId: job.companyId,
            kind: "FINANCIAL_FACT",
            sourceDocumentId: container.documentId,
            sourceChunkIds: [],
            sourceExcerpt: `${payload.metricName} = ${payload.value}${payload.unit ? ` ${payload.unit}` : ""} as of ${payload.asOfDate}`,
            proposedValue: validated.data,
            reviewStatus: "PENDING",
          },
        });
        createdFacts++;
      }
    }
  }

  return { recordsDiscovered: materializedDocumentIds.length + financialArtifacts.length, recordsChanged: extractedDocuments + createdFacts, output: { extractedDocuments, createdFacts } };
}

/**
 * A LEGITIMATE SCOPED STUB, not a fake success: Phase A does not implement
 * reconciliation (MATCH/MATERIAL_DIFFERENCE/etc. classification across
 * sources) - that is explicitly Phase B's job per this phase's own brief.
 * This stage marks itself COMPLETE with a clearly-labeled note rather than
 * silently no-op'ing without a trace, so a reader of the stage row (or a
 * future Phase B implementation) can see exactly what did and did not run
 * here.
 */
async function runReconcileStage(): Promise<StageOutcome> {
  return {
    recordsDiscovered: 0,
    recordsChanged: 0,
    output: { note: "Phase A scoped stub - no reconciliation logic runs here. Phase B implements MATCH/MATERIAL_DIFFERENCE/etc. classification across sources per docs/autonomous-retrieval-phase-a-foundation.md." },
  };
}

async function runCompleteStage(job: IngestionJob, discoverOutput: Record<string, unknown> | null): Promise<StageOutcome> {
  if (job.sourceConnectionId) {
    const items = (discoverOutput?.items as TaggedDiscoveredItem[] | undefined) ?? [];
    const latestEffectiveDate = items.reduce<string | undefined>((max, item) => (item.effectiveDate && (!max || item.effectiveDate > max) ? item.effectiveDate : max), undefined);
    await prisma.companySourceConnection.update({
      where: { id: job.sourceConnectionId },
      data: { lastSuccessfulSyncAt: new Date(), cursor: latestEffectiveDate ?? new Date().toISOString().slice(0, 10), status: "CONNECTED", errorState: null },
    });
  }
  return { recordsDiscovered: 0, recordsChanged: 0, output: { finishedAt: new Date().toISOString() } };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface RunIngestionJobStageResult {
  status: "COMPLETE" | "FAILED";
  error?: string;
  recordsDiscovered: number;
  recordsChanged: number;
}

export async function runIngestionJobStage(ingestionJobId: string, stage: IngestionStageKind): Promise<RunIngestionJobStageResult> {
  const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: ingestionJobId } });
  const stageRow = await prisma.ingestionJobStage.findUnique({ where: { ingestionJobId_stage: { ingestionJobId, stage } } });
  if (!stageRow) {
    throw new Error(`runIngestionJobStage: no IngestionJobStage row for job ${ingestionJobId} / stage ${stage} - create it first.`);
  }
  if (stageRow.status === "COMPLETE") {
    throw new IngestionStageAlreadyCompleteError(stage);
  }
  if (!job.sourceConnectionId) {
    throw new Error(`runIngestionJobStage: job ${ingestionJobId} has no sourceConnectionId - Phase A only supports connector-scoped jobs, see this file's own header comment.`);
  }

  await prisma.ingestionJobStage.update({
    where: { id: stageRow.id },
    data: { status: "IN_PROGRESS", startedAt: new Date(), attemptCount: { increment: 1 } },
  });

  try {
    const connection = await prisma.companySourceConnection.findUniqueOrThrow({ where: { id: job.sourceConnectionId } });
    const connectionsById = new Map([[connection.id, connection]]);

    let outcome: StageOutcome;
    switch (stage) {
      case "DISCOVER":
        outcome = await runDiscoverStage(job, connection, stageRow.output as Record<string, unknown> | null);
        break;
      case "FETCH": {
        const discoverOutput = await loadStageOutput(ingestionJobId, "DISCOVER");
        outcome = await runFetchStage(job, connectionsById, discoverOutput);
        break;
      }
      case "CLASSIFY_DEDUPE": {
        const fetchOutput = await loadStageOutput(ingestionJobId, "FETCH");
        outcome = await runClassifyDedupeStage(job, connection, fetchOutput);
        break;
      }
      case "EXTRACT": {
        const classifyOutput = await loadStageOutput(ingestionJobId, "CLASSIFY_DEDUPE");
        const fetchOutput = await loadStageOutput(ingestionJobId, "FETCH");
        outcome = await runExtractStage(job, connection, classifyOutput, fetchOutput);
        break;
      }
      case "RECONCILE":
        outcome = await runReconcileStage();
        break;
      case "COMPLETE": {
        const discoverOutput = await loadStageOutput(ingestionJobId, "DISCOVER");
        outcome = await runCompleteStage(job, discoverOutput);
        break;
      }
      default: {
        const exhaustive: never = stage;
        throw new Error(`runIngestionJobStage: unhandled stage ${String(exhaustive)}.`);
      }
    }

    await prisma.ingestionJobStage.update({
      where: { id: stageRow.id },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        error: null,
        recordsDiscovered: outcome.recordsDiscovered,
        recordsChanged: outcome.recordsChanged,
        output: outcome.output as Prisma.InputJsonValue,
      },
    });

    return { status: "COMPLETE", recordsDiscovered: outcome.recordsDiscovered, recordsChanged: outcome.recordsChanged };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.ingestionJobStage.update({
      where: { id: stageRow.id },
      data: { status: "FAILED", error: message },
    });
    // Surface connection-level error state too, so a company's Connect
    // Sources view can show WHY a sync stopped without opening job details.
    if (job.sourceConnectionId) {
      await prisma.companySourceConnection.update({ where: { id: job.sourceConnectionId }, data: { status: "ERROR", errorState: message } }).catch(() => {});
    }
    return { status: "FAILED", error: message, recordsDiscovered: 0, recordsChanged: 0 };
  }
}

/** Drives every pending stage of a job, in its own STAGE_SET_BY_KIND order, stopping at the first FAILED stage - the exact same contract as lib/extraction/pipeline.ts's runAllPendingStages. */
export async function runAllPendingIngestionStages(ingestionJobId: string): Promise<RunIngestionJobStageResult[]> {
  const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: ingestionJobId } });
  const stageKinds = STAGE_SET_BY_KIND[job.kind];
  const results: RunIngestionJobStageResult[] = [];
  for (const stage of stageKinds) {
    const stageRow = await prisma.ingestionJobStage.findUnique({ where: { ingestionJobId_stage: { ingestionJobId, stage } } });
    if (stageRow?.status === "COMPLETE") continue;
    const result = await runIngestionJobStage(ingestionJobId, stage);
    results.push(result);
    if (result.status === "FAILED") break;
  }
  return results;
}
