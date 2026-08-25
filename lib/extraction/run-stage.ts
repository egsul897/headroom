/**
 * Staged extraction execution (docs/document-onboarding-pipeline-foundation.md).
 *
 * `runExtractionStage` is the one function that actually drives a single
 * (extractionRunId, stage) unit of work: load the ExtractionStage row, mark
 * it IN_PROGRESS, assemble that stage's input (this document's chunks PLUS
 * the prior stage's already-PERSISTED context - never in-memory state
 * threaded from a separate invocation, so a retry can always resume from
 * durable state), call the matching ContractExtractionProvider method,
 * independently re-validate the result against this stage's zod schema
 * (lib/extraction/schemas.ts) regardless of which provider produced it,
 * persist the resulting ExtractionCandidate rows, and mark the stage
 * COMPLETE - or, on ANY failure (provider error, schema validation failure,
 * thrown exception), mark it FAILED with a clear `error` and bump
 * `attemptCount`, WITHOUT touching any other stage's row or any
 * already-persisted candidate from a prior successful stage.
 *
 * Retry is just calling this function again on the same (extractionRunId,
 * stage): a COMPLETE stage is refused outright (its candidates are never
 * touched); a FAILED or PENDING stage re-runs from scratch (its OWN prior
 * candidates, if any survived a bug, are deleted and replaced atomically -
 * see the transaction below - never left as stale duplicates alongside the
 * new attempt's output). tests/extraction/run-stage.test.ts proves this
 * with the exact scenario the task specifies: stage A succeeds, stage B is
 * forced to fail, stage B is retried, stage A's candidates are unaffected.
 */

import { Prisma, type ExtractionCandidate, type ExtractionCandidateKind, type ExtractionStageKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import type { CandidateSummary, ChunkRef, ContractExtractionProvider } from "./provider";
import {
  CoverageStageResultSchema,
  DefinedTermProposalSchema,
  DefinitionsStageResultSchema,
  DocumentRelationshipProposalSchema,
  FinancialInputsStageResultSchema,
  PermissionProposalSchema,
  PermissionsStageResultSchema,
  RelationshipsStageResultSchema,
  StructureStageResultSchema,
  type DefinedTermProposal,
  type PermissionProposal,
} from "./schemas";

export interface RunExtractionStageResult {
  status: "COMPLETE" | "FAILED";
  error?: string;
  candidateCount: number;
}

/** Already-COMPLETE is refused outright, not silently re-run, so a caller can never accidentally clobber completed work by re-invoking this function. */
export class StageAlreadyCompleteError extends Error {
  constructor(stage: string) {
    super(`ExtractionStage ${stage} is already COMPLETE - refusing to re-run it. Its candidates are untouched.`);
  }
}

async function loadChunkRefs(documentId: string): Promise<ChunkRef[]> {
  const rows = await prisma.documentChunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" },
  });
  return rows.map((r) => ({ id: r.id, page: r.page, articleRef: r.articleRef, sectionRef: r.sectionRef, heading: r.heading, text: r.text }));
}

/**
 * Reconstructs a typed proposal from a persisted row's separate columns +
 * proposedValue JSON, re-validating against the given per-kind schema -
 * defense in depth: the row was already schema-valid at write time, but a
 * stage should never trust unvalidated data crossing a read boundary
 * either. Invalid rows are skipped, not fatal - a single corrupted
 * historical row must not permanently break every later stage that reads
 * company-wide context.
 */
function hydrate<Schema extends z.ZodType>(row: ExtractionCandidate, schema: Schema): z.infer<Schema> | null {
  const candidate = {
    kind: row.kind,
    sourceChunkIds: row.sourceChunkIds,
    sourcePage: row.sourcePage ?? undefined,
    sourceSectionRef: row.sourceSectionRef ?? undefined,
    sourceExcerpt: row.sourceExcerpt ?? undefined,
    confidence: row.confidence ?? undefined,
    rationale: row.rationale ?? undefined,
    proposedValue: row.proposedValue,
  };
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    console.warn(`lib/extraction/run-stage.ts: skipping ExtractionCandidate ${row.id} - failed to re-hydrate against its expected schema: ${parsed.error.message}`);
    return null;
  }
  return parsed.data;
}

async function loadRunCandidates<Schema extends z.ZodType>(extractionRunId: string, kind: ExtractionCandidateKind, schema: Schema): Promise<Array<z.infer<Schema>>> {
  const rows = await prisma.extractionCandidate.findMany({ where: { extractionRunId, kind } });
  return rows.map((r) => hydrate(r, schema)).filter((v): v is z.infer<Schema> => v !== null);
}

async function loadCompanyCandidates<Schema extends z.ZodType>(companyId: string, kind: ExtractionCandidateKind, excludeRunId: string, schema: Schema): Promise<Array<z.infer<Schema>>> {
  const rows = await prisma.extractionCandidate.findMany({ where: { companyId, kind, extractionRunId: { not: excludeRunId } } });
  return rows.map((r) => hydrate(r, schema)).filter((v): v is z.infer<Schema> => v !== null);
}

/** RELATIONSHIPS/COVERAGE-stage company-wide context - a lightweight summary (kind/section/excerpt), not the full proposedValue payload of every candidate the company has ever produced. */
async function loadCompanyCandidateSummaries(companyId: string): Promise<CandidateSummary[]> {
  const rows = await prisma.extractionCandidate.findMany({
    where: { companyId },
    select: { kind: true, sourceSectionRef: true, sourceExcerpt: true },
  });
  return rows.map((r) => ({ kind: r.kind, sectionRef: r.sourceSectionRef, excerpt: r.sourceExcerpt }));
}

/**
 * Derives ExtractionCandidate.reviewStatus for a freshly-validated proposal.
 * A PERMISSION proposal whose own proposedValue.modelingStatus is
 * KNOWN_NOT_MODELED (the COVERAGE-stage gap-placeholder shape - see
 * schemas.ts) is REVIEW_REQUIRED; everything else starts PENDING - an
 * ordinary reviewer-queue item nobody has looked at yet. This keys off the
 * proposal's own declared modelingStatus, not which ExtractionStageKind
 * produced it, so the rule stays correct even if a future stage's prompt
 * legitimately proposes a KNOWN_NOT_MODELED permission outside COVERAGE.
 */
function deriveReviewStatus(kind: string, proposedValue: unknown): "PENDING" | "REVIEW_REQUIRED" {
  if (kind === "PERMISSION" && typeof proposedValue === "object" && proposedValue !== null && (proposedValue as { modelingStatus?: string }).modelingStatus === "KNOWN_NOT_MODELED") {
    return "REVIEW_REQUIRED";
  }
  return "PENDING";
}

interface StageProposal {
  kind: string;
  sourceChunkIds: string[];
  sourcePage?: number;
  sourceSectionRef?: string;
  sourceExcerpt?: string;
  confidence?: number;
  rationale?: string;
  proposedValue: unknown;
}

interface StageRunOutcome {
  resultSchema: z.ZodType;
  candidates: StageProposal[];
}

/** Builds the (companyId, documentId, extractionRunId)-scoped closure for each stage - assembling that stage's input (this document's chunks + persisted prior-stage context) and calling the matching provider method. Reading prior-stage context from the database (never from an in-memory value threaded across calls) is what makes a retry able to resume from durable state. */
async function buildStageRunners(companyId: string, documentId: string, extractionRunId: string, provider: ContractExtractionProvider): Promise<Record<ExtractionStageKind, () => Promise<StageRunOutcome>>> {
  const chunks = await loadChunkRefs(documentId);

  return {
    STRUCTURE: async () => {
      const result = await provider.extractDocumentStructure({ companyId, documentId, chunks });
      return { resultSchema: StructureStageResultSchema, candidates: result.candidates };
    },
    DEFINITIONS: async () => {
      const structureCandidates = await loadRunCandidates(extractionRunId, "DOCUMENT_RELATIONSHIP", DocumentRelationshipProposalSchema);
      const result = await provider.extractDefinitions({ companyId, documentId, chunks, structure: { candidates: structureCandidates } });
      return { resultSchema: DefinitionsStageResultSchema, candidates: result.candidates };
    },
    PERMISSIONS: async () => {
      const definitions: DefinedTermProposal[] = await loadRunCandidates(extractionRunId, "DEFINED_TERM", DefinedTermProposalSchema);
      const result = await provider.extractPermissions({ companyId, documentId, chunks, definitions });
      return { resultSchema: PermissionsStageResultSchema, candidates: result.candidates };
    },
    RELATIONSHIPS: async () => {
      const permissions: PermissionProposal[] = await loadRunCandidates(extractionRunId, "PERMISSION", PermissionProposalSchema);
      const companyPermissions: PermissionProposal[] = await loadCompanyCandidates(companyId, "PERMISSION", extractionRunId, PermissionProposalSchema);
      const result = await provider.extractRelationships({ companyId, documentId, chunks, permissions, companyPermissions });
      return { resultSchema: RelationshipsStageResultSchema, candidates: result.candidates };
    },
    COVERAGE: async () => {
      const companyCandidateSummaries = await loadCompanyCandidateSummaries(companyId);
      const result = await provider.extractCoverageGaps({ companyId, documentId, chunks, companyCandidateSummaries });
      return { resultSchema: CoverageStageResultSchema, candidates: result.candidates };
    },
    FINANCIAL_INPUTS: async () => {
      const definitions: DefinedTermProposal[] = await loadRunCandidates(extractionRunId, "DEFINED_TERM", DefinedTermProposalSchema);
      const result = await provider.extractFinancialInputs({ companyId, documentId, chunks, definitions });
      return { resultSchema: FinancialInputsStageResultSchema, candidates: result.candidates };
    },
  };
}

export async function runExtractionStage(extractionRunId: string, stage: ExtractionStageKind, provider: ContractExtractionProvider): Promise<RunExtractionStageResult> {
  const run = await prisma.extractionRun.findUniqueOrThrow({ where: { id: extractionRunId } });
  const stageRow = await prisma.extractionStage.findUnique({ where: { extractionRunId_stage: { extractionRunId, stage } } });
  if (!stageRow) {
    throw new Error(`runExtractionStage: no ExtractionStage row for run ${extractionRunId} / stage ${stage} - create it first.`);
  }
  if (stageRow.status === "COMPLETE") {
    throw new StageAlreadyCompleteError(stage);
  }

  await prisma.extractionStage.update({
    where: { id: stageRow.id },
    data: { status: "IN_PROGRESS", startedAt: new Date(), attemptCount: { increment: 1 } },
  });

  try {
    const stageRunners = await buildStageRunners(run.companyId, run.documentId, extractionRunId, provider);
    const { resultSchema, candidates: rawCandidates } = await stageRunners[stage]();

    // Independently re-validate the FULL { candidates: [...] } envelope
    // against this stage's own schema before persisting anything - the hard
    // "validated with zod BEFORE being treated as valid" requirement,
    // enforced here regardless of which provider produced `rawCandidates`.
    const validated = resultSchema.safeParse({ candidates: rawCandidates });
    if (!validated.success) {
      throw new Error(`schema validation failed: ${validated.error.message}`);
    }
    const candidates = (validated.data as { candidates: StageProposal[] }).candidates;

    await prisma.$transaction([
      // A retry's own prior candidates (if any survived a bug) are replaced
      // atomically with this attempt's output - never left as stale
      // duplicates. A FAILED stage never reaches this point with existing
      // candidates in the normal case (nothing is persisted before this
      // transaction), so this is almost always a no-op delete.
      prisma.extractionCandidate.deleteMany({ where: { extractionStageId: stageRow.id } }),
      ...candidates.map((c) =>
        prisma.extractionCandidate.create({
          data: {
            extractionRunId,
            extractionStageId: stageRow.id,
            companyId: run.companyId,
            kind: c.kind as ExtractionCandidateKind,
            sourceDocumentId: run.documentId,
            sourceChunkIds: c.sourceChunkIds,
            sourcePage: c.sourcePage ?? null,
            sourceSectionRef: c.sourceSectionRef ?? null,
            sourceExcerpt: c.sourceExcerpt ?? null,
            proposedValue: c.proposedValue as Prisma.InputJsonValue,
            confidence: c.confidence ?? null,
            rationale: c.rationale ?? null,
            reviewStatus: deriveReviewStatus(c.kind, c.proposedValue),
          },
        })
      ),
      prisma.extractionStage.update({
        where: { id: stageRow.id },
        data: { status: "COMPLETE", completedAt: new Date(), error: null },
      }),
    ]);

    return { status: "COMPLETE", candidateCount: candidates.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.extractionStage.update({
      where: { id: stageRow.id },
      data: { status: "FAILED", error: message },
    });
    return { status: "FAILED", error: message, candidateCount: 0 };
  }
}
