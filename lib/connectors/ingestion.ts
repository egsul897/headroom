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
import { reconcileFinancialFacts, type FinancialFactCandidateWithSource } from "./reconciliation";
import type { DiscoveredSourceItem, SourceConnector } from "./types";

/**
 * Which IngestionJobStage rows a job needs, by kind - documented per the
 * task's own "minimal correct stage set per kind" instruction.
 *
 * Phase B UPDATE: SYNC now ALSO runs RECONCILE. Phase A's own stub-era
 * rationale for skipping it on SYNC ("carrying a stub through every
 * incremental sync would be pure busywork") no longer applies now that
 * RECONCILE does real work (see runReconcileStage below) - the task's own
 * brief names the exact scenario this matters for: a SYNC pulling fresh CSV
 * data SHOULD be reconciled against already-approved/pending EDGAR or
 * upload-sourced facts for the same metric/period, not just silently land as
 * more PENDING candidates. INITIALIZE/AMENDMENT_PROCESS already ran the full
 * pipeline including RECONCILE.
 */
const STAGE_SET_BY_KIND: Record<IngestionJobKind, IngestionStageKind[]> = {
  INITIALIZE: ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT", "RECONCILE", "COMPLETE"],
  SYNC: ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT", "RECONCILE", "COMPLETE"],
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

/** Duck-typed: only CsvFinancialConnector currently implements this (its fail-closed per-row parse/unit errors - lib/connectors/csv-financial-connector.ts). Not part of the generic SourceConnector interface (a pull-based connector like EdgarConnector has no "row-level parse error" concept at all), so this is an optional capability check, not a required method every connector must implement. */
interface HasLastParseErrors {
  getLastParseErrors(): { rowIndex: number; error: string }[];
}
function hasLastParseErrors(connector: SourceConnector): connector is SourceConnector & HasLastParseErrors {
  return typeof (connector as Partial<HasLastParseErrors>).getLastParseErrors === "function";
}

async function runDiscoverStage(job: IngestionJob, connection: CompanySourceConnection, ownStageOutput: Record<string, unknown> | null): Promise<StageOutcome> {
  const connector = await buildConnector(connection, ownStageOutput);
  const items = job.kind === "SYNC" ? (await connector.syncSince(connection.cursor)).map((d) => d.item) : await connector.discover({});
  const tagged: TaggedDiscoveredItem[] = items.map((item) => ({ ...item, sourceConnectionId: connection.id }));
  // Surfaces every row this connector rejected (missing/invalid unit,
  // unrecognized metric, malformed value, etc.) as a durable, inspectable
  // INGESTION_ERROR on this stage's own persisted output - never silently
  // dropped with no trace (docs/autonomous-ingestion-production-readiness.md).
  const ingestionErrors = hasLastParseErrors(connector) ? connector.getLastParseErrors() : [];
  return {
    recordsDiscovered: tagged.length,
    recordsChanged: tagged.length,
    output: { ...(ownStageOutput ?? {}), items: tagged, ingestionErrors },
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
export async function ensureFinancialFactContainer(companyId: string, connection: CompanySourceConnection): Promise<{ documentId: string; extractionRunId: string; extractionStageId: string }> {
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
    const { provider, providerName, model, promptVersion, schemaVersion } = getExtractionProvider();
    for (const documentId of materializedDocumentIds) {
      await runExtractionForDocument({ companyId: job.companyId, documentId, provider, providerName, model, promptVersion, schemaVersion });
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
        // rawPayload already carries the unit-normalized shape
        // lib/connectors/csv-financial-connector.ts's fetch() produces
        // (canonicalUnit/originalValue/originalUnit/withinSanityBounds) -
        // this stage never re-derives or re-guesses units itself, it only
        // forwards what the connector already normalized and re-validates
        // the result against the schema (defense in depth, same discipline
        // as lib/extraction/run-stage.ts's own independent re-validation).
        const payload = artifact.rawPayload as { metricName?: string; value?: number; asOfDate?: string; canonicalUnit?: string; originalValue?: number; originalUnit?: string; withinSanityBounds?: boolean; sanityNote?: string | null } | null;
        if (!payload) continue;
        const candidateValue = {
          metricName: payload.metricName,
          value: payload.value,
          asOfDate: payload.asOfDate,
          canonicalUnit: payload.canonicalUnit,
          originalValue: payload.originalValue,
          originalUnit: payload.originalUnit,
          sourceRecordRef: artifact.id,
        };
        const validated = FinancialFactValueSchema.safeParse(candidateValue);
        if (!validated.success) {
          // Fail closed for this one row - never a fabricated candidate - but never abort the whole batch either.
          continue;
        }
        const withinSanityBounds = payload.withinSanityBounds !== false;
        await prisma.extractionCandidate.create({
          data: {
            extractionRunId: container.extractionRunId,
            extractionStageId: container.extractionStageId,
            companyId: job.companyId,
            kind: "FINANCIAL_FACT",
            sourceDocumentId: container.documentId,
            sourceChunkIds: [],
            sourceExcerpt: `${payload.metricName} = ${payload.originalValue} ${payload.originalUnit} (normalized: ${payload.value} ${payload.canonicalUnit}) as of ${payload.asOfDate}`,
            proposedValue: validated.data,
            // A value that converted successfully but exceeds the
            // extreme-magnitude sanity ceiling is never silently trusted as
            // an ordinary PENDING fact - REVIEW_REQUIRED, with the reason in
            // rationale, exactly like a KNOWN_NOT_MODELED contractual
            // candidate is never silently promotable either.
            reviewStatus: withinSanityBounds ? "PENDING" : "REVIEW_REQUIRED",
            rationale: withinSanityBounds ? undefined : payload.sanityNote ?? undefined,
          },
        });
        createdFacts++;
      }
    }
  }

  return { recordsDiscovered: materializedDocumentIds.length + financialArtifacts.length, recordsChanged: extractedDocuments + createdFacts, output: { extractedDocuments, createdFacts } };
}

/**
 * Real reconciliation (Phase B). Loads every PENDING/REVIEW_REQUIRED
 * FINANCIAL_FACT candidate for this company (promoted/rejected/approved
 * candidates are settled - re-reconciling them would be pointless and could
 * spuriously flip a human decision), joins each one back to its source
 * connection (candidate.proposedValue.sourceRecordRef -> SourceArtifact ->
 * CompanySourceConnection, exactly the join the brief describes - nothing
 * new invented here), runs the PURE reconcileFinancialFacts function, and
 * applies its verdict:
 *
 *  - MATCH: no writes. Every candidate's reviewStatus is left exactly as it
 *    already was - the normal PENDING review flow proceeds untouched.
 *  - MATERIAL_DIFFERENCE: every candidate EXCEPT the winner is flagged
 *    REVIEW_REQUIRED with a rationale naming the higher-priority value that
 *    conflicts with it.
 *  - CONFLICTING_SOURCE: every candidate in the group is flagged
 *    REVIEW_REQUIRED (no winner exists to leave untouched) - never silently
 *    picked.
 *  - STALE_SOURCE: every candidate in the group is flagged REVIEW_REQUIRED
 *    with a staleness rationale.
 *
 * COMPARISON SCOPE vs. WRITE SCOPE (deliberately different - documented per
 * the task's own "never silently overwrite the approved one" requirement):
 * the candidates COMPARED against each other include every non-REJECTED
 * FINANCIAL_FACT candidate for the company - APPROVED/EDITED/already-
 * PROMOTED ones too, not just PENDING/REVIEW_REQUIRED - so a NEWLY-arrived
 * fact that conflicts with an ALREADY-DECIDED (or already-promoted) one is
 * still genuinely detected as a conflict, not silently missed just because
 * the earlier fact left the "open" pool. The candidates this stage actually
 * WRITES to are a strict subset: only ones still open (reviewStatus PENDING
 * or REVIEW_REQUIRED AND promotedAt IS NULL). An already-approved, edited,
 * or promoted candidate is NEVER flipped back to REVIEW_REQUIRED by this
 * system process, no matter which side of a conflict it's on - only a human
 * review decision (lib/onboarding/review.ts) or promotion can change its
 * status once it has left the open pool. This is what makes "a
 * deliberately-conflicting re-upload produces a REVIEW_REQUIRED candidate
 * rather than silently overwriting the approved one" concretely true:
 * tests/onboarding/*-acceptance*.test.ts exercises exactly this scenario.
 *
 * This is a SYSTEM-initiated status change, not a human review decision, so
 * it deliberately does NOT go through reviewCandidate() (lib/onboarding/review.ts)
 * - that function requires a real reviewedBy identity and is reserved for an
 * actual human's decision (see its own MissingReviewerError). A direct
 * `prisma.extractionCandidate.update` is the correct, narrower write here.
 * Audit-trail decision (documented per the task's own "your call, document
 * it" allowance): NO CandidateReviewEvent row is written for this system
 * flag. CandidateReviewEvent's own schema comment frames it as "one row per
 * review DECISION" bracketed by an action from CandidateReviewAction
 * (APPROVE/EDIT/REJECT/REVIEW_REQUIRED) - genuinely human decisions, each
 * with a `reviewedBy`. Overloading that table with a system-authored,
 * reviewer-less row would blur "who decided this" for every real reviewer
 * looking at a candidate's history. This stage's own persisted `output` JSON
 * (below) is a complete, durable, re-inspectable audit trail already - every
 * classification produced, every group's rationale and member candidateIds -
 * and IngestionJobStage rows are never deleted, so nothing is lost by not
 * duplicating it into CandidateReviewEvent. If a future phase wants a
 * candidate-level "why is this REVIEW_REQUIRED" trail visible from the
 * candidate's own history panel, the rationale field this stage writes onto
 * each flagged candidate already carries that explanation inline.
 */
async function runReconcileStage(companyId: string): Promise<StageOutcome> {
  const [pendingCandidates, priorityRules] = await Promise.all([
    // Comparison scope: every non-REJECTED FINANCIAL_FACT candidate - see
    // this function's own header comment for why this deliberately includes
    // already-decided/promoted candidates (comparison scope) while the WRITE
    // scope below stays much narrower (open candidates only).
    prisma.extractionCandidate.findMany({
      where: { companyId, kind: "FINANCIAL_FACT", reviewStatus: { not: "REJECTED" } },
    }),
    prisma.sourcePriorityRule.findMany({ where: { OR: [{ companyId }, { companyId: null }] } }),
  ]);

  if (pendingCandidates.length === 0) {
    return { recordsDiscovered: 0, recordsChanged: 0, output: { note: "No FINANCIAL_FACT candidates to reconcile.", classificationCounts: {} } };
  }

  const sourceRecordRefs = pendingCandidates.map((c) => (c.proposedValue as { sourceRecordRef?: string }).sourceRecordRef).filter((v): v is string => Boolean(v));
  const artifacts = await prisma.sourceArtifact.findMany({ where: { id: { in: sourceRecordRefs } }, include: { sourceConnection: true } });
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));

  const candidateRowById = new Map(pendingCandidates.map((c) => [c.id, c]));
  const withSource: FinancialFactCandidateWithSource[] = [];
  for (const c of pendingCandidates) {
    const value = c.proposedValue as { metricName: string; value: number; asOfDate: string; canonicalUnit?: string; sourceRecordRef?: string };
    const artifact = value.sourceRecordRef ? artifactById.get(value.sourceRecordRef) : undefined;
    if (!artifact) continue; // no resolvable source connection - cannot reconcile this candidate; it stays PENDING, reviewed normally.
    withSource.push({
      candidateId: c.id,
      metricName: value.metricName,
      value: value.value,
      asOfDate: value.asOfDate,
      unit: value.canonicalUnit,
      sourceConnectionId: artifact.sourceConnectionId,
      connectorType: artifact.sourceConnection.connectorType,
      connectionSourcePriority: artifact.sourceConnection.sourcePriority,
      reviewStatus: c.reviewStatus,
    });
  }

  const groups = reconcileFinancialFacts(withSource, priorityRules, { companyId });

  const classificationCounts: Record<string, number> = {};
  let flaggedCount = 0;
  const groupSummaries: Record<string, unknown>[] = [];

  for (const group of groups) {
    classificationCounts[group.classification] = (classificationCounts[group.classification] ?? 0) + 1;
    groupSummaries.push({
      metricName: group.metricName,
      period: group.period,
      classification: group.classification,
      candidateIds: group.candidates.map((c) => c.candidateId),
      winnerCandidateId: group.winnerCandidateId,
      rationale: group.rationale,
    });

    if (group.classification === "MATCH" || group.classification === "MISSING_SOURCE") continue;

    const toFlag = group.classification === "MATERIAL_DIFFERENCE" ? group.candidates.filter((c) => c.candidateId !== group.winnerCandidateId) : group.candidates;

    for (const c of toFlag) {
      const winner = group.classification === "MATERIAL_DIFFERENCE" ? group.candidates.find((w) => w.candidateId === group.winnerCandidateId) : undefined;
      const rationale =
        group.classification === "MATERIAL_DIFFERENCE" && winner
          ? `Conflicts with a higher-priority ${winner.connectorType} value of ${winner.value}${winner.unit ? ` ${winner.unit}` : ""} as of ${winner.asOfDate} - see candidate ${winner.candidateId}. ${group.rationale}`
          : group.rationale;
      const current = candidateRowById.get(c.candidateId);
      // WRITE SCOPE (see this function's own header comment): never touch a
      // candidate that has left the open pool - already APPROVED/EDITED/
      // PROMOTED (or REJECTED, though REJECTED is already excluded from the
      // comparison scope above). It still fully participated in the
      // classification/rationale above; it is simply never written to.
      if (!current || current.promotedAt || (current.reviewStatus !== "PENDING" && current.reviewStatus !== "REVIEW_REQUIRED")) continue;
      // Idempotent re-runs (this stage scans EVERY open FINANCIAL_FACT
      // candidate company-wide, not just this job's own - see this stage's
      // own header comment on why per-company scope is correct): skip the
      // write entirely, and don't count it in recordsChanged, when the
      // candidate is already exactly REVIEW_REQUIRED with this same
      // rationale - re-running RECONCILE after nothing relevant has changed
      // should be a true no-op, not a phantom "change."
      if (current.reviewStatus === "REVIEW_REQUIRED" && current.rationale === rationale) continue;
      await prisma.extractionCandidate.update({
        where: { id: c.candidateId },
        data: { reviewStatus: "REVIEW_REQUIRED", rationale },
      });
      flaggedCount++;
    }
  }

  return {
    recordsDiscovered: withSource.length,
    recordsChanged: flaggedCount,
    output: { classificationCounts, groups: groupSummaries },
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
        outcome = await runReconcileStage(job.companyId);
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
