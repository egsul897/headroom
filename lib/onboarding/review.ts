/**
 * Review workspace logic (docs/company-onboarding-v1-implementation.md).
 *
 * The ONLY place ExtractionCandidate.reviewStatus/reviewerEditedValue are
 * ever written by a human action (as opposed to the extraction pipeline
 * itself setting the initial PENDING/REVIEW_REQUIRED state - see
 * lib/extraction/run-stage.ts's `deriveReviewStatus`). Every call is logged
 * as a new, immutable CandidateReviewEvent row - a prior reviewer decision on
 * the same candidate is never silently overwritten without a trace; a later
 * review is always a NEW event, and `reviewedAt`/`reviewedBy` on the
 * candidate itself always reflect the LATEST decision only (the full history
 * lives in CandidateReviewEvent).
 *
 * `proposedValue` is NEVER written here - only `reviewerEditedValue`. That is
 * the permanent, load-bearing distinction the task requires: the AI's
 * original proposal must always remain inspectable independent of what a
 * reviewer later changed it to.
 */

import { Prisma, type ExtractionCandidate, type ExtractionCandidateKind, type ExtractionCandidateReviewStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  ActivationConditionValueSchema,
  CollateralScopeValueSchema,
  DefinedTermValueSchema,
  DocumentRelationshipValueSchema,
  ExternalInputRequirementValueSchema,
  PermissionValueSchema,
  RelationshipValueSchema,
  SharedConstraintValueSchema,
} from "../extraction/schemas";

/** Maps each candidate kind to the zod schema its `proposedValue`/`reviewerEditedValue` must validate against - reused verbatim from lib/extraction/schemas.ts, never redefined. */
export const VALUE_SCHEMA_BY_KIND: Record<ExtractionCandidateKind, z.ZodTypeAny> = {
  DEFINED_TERM: DefinedTermValueSchema,
  PERMISSION: PermissionValueSchema,
  RELATIONSHIP: RelationshipValueSchema,
  SHARED_CONSTRAINT: SharedConstraintValueSchema,
  COLLATERAL_SCOPE: CollateralScopeValueSchema,
  ACTIVATION_CONDITION: ActivationConditionValueSchema,
  DOCUMENT_RELATIONSHIP: DocumentRelationshipValueSchema,
  EXTERNAL_INPUT_REQUIREMENT: ExternalInputRequirementValueSchema,
};

export type ReviewAction = "APPROVE" | "EDIT" | "REJECT" | "REVIEW_REQUIRED";

const NEXT_STATUS: Record<ReviewAction, ExtractionCandidateReviewStatus> = {
  APPROVE: "APPROVED",
  EDIT: "EDITED",
  REJECT: "REJECTED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
};

export class InvalidReviewEditError extends Error {}
export class MissingReviewerError extends Error {
  constructor() {
    super("reviewedBy is required for a review decision and must not be fabricated - it must be the actual reviewer's own supplied name/identifier.");
  }
}

export interface ReviewCandidateParams {
  candidateId: string;
  action: ReviewAction;
  /** Required and validated for EDIT; ignored for every other action. */
  editedValue?: unknown;
  note?: string;
  /** Never invented by this function or its callers - see MissingReviewerError. */
  reviewedBy: string;
}

/**
 * Applies one review decision to one ExtractionCandidate, in a single
 * transaction with its CandidateReviewEvent audit row - both are written
 * atomically or neither is.
 */
export async function reviewCandidate(params: ReviewCandidateParams): Promise<ExtractionCandidate> {
  const { candidateId, action, note } = params;
  const reviewedBy = params.reviewedBy?.trim();
  if (!reviewedBy) throw new MissingReviewerError();

  const candidate = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (candidate.promotedAt) {
    throw new Error(`ExtractionCandidate ${candidateId} was already promoted at ${candidate.promotedAt.toISOString()} - a promoted candidate's review decision is final.`);
  }

  const newStatus = NEXT_STATUS[action];
  let editedValueToStore: Prisma.InputJsonValue | undefined;

  if (action === "EDIT") {
    const schema = VALUE_SCHEMA_BY_KIND[candidate.kind];
    const parsed = schema.safeParse(params.editedValue);
    if (!parsed.success) {
      throw new InvalidReviewEditError(`Edited value for ${candidate.kind} candidate ${candidateId} failed validation: ${parsed.error.message}`);
    }
    editedValueToStore = parsed.data as Prisma.InputJsonValue;
  }

  const [updated] = await prisma.$transaction([
    prisma.extractionCandidate.update({
      where: { id: candidateId },
      data: {
        reviewStatus: newStatus,
        // proposedValue is deliberately NEVER touched here.
        reviewerEditedValue: action === "EDIT" ? editedValueToStore : (candidate.reviewerEditedValue ?? Prisma.JsonNull),
        reviewedAt: new Date(),
        reviewedBy,
      },
    }),
    prisma.candidateReviewEvent.create({
      data: {
        candidateId,
        action,
        previousStatus: candidate.reviewStatus,
        newStatus,
        editedValue: action === "EDIT" ? editedValueToStore : undefined,
        note: note?.trim() || null,
        reviewedBy,
      },
    }),
  ]);

  return updated;
}

/** Full, ordered review history for one candidate - the audit trail the task requires beyond reviewedAt/reviewedBy's own "latest decision only" scope. */
export async function getCandidateReviewHistory(candidateId: string) {
  return prisma.candidateReviewEvent.findMany({ where: { candidateId }, orderBy: { createdAt: "asc" } });
}

// ---------------------------------------------------------------------------
// Review workspace listing (app/[companyId]/onboarding/review/**)
// ---------------------------------------------------------------------------

export interface CandidateForReview {
  id: string;
  kind: ExtractionCandidateKind;
  reviewStatus: ExtractionCandidateReviewStatus;
  proposedValue: unknown;
  reviewerEditedValue: unknown;
  confidence: number | null;
  rationale: string | null;
  sourceDocumentId: string;
  sourceDocumentName: string;
  sourceChunkIds: string[];
  sourcePage: number | null;
  sourceSectionRef: string | null;
  sourceExcerpt: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  promotedAt: Date | null;
}

/**
 * Every candidate for a company, organized by kind - the review workspace's
 * single data source. Company-agnostic (plain companyId parameter, no
 * branching). Optionally filtered to a single reviewStatus (e.g. the
 * workspace's "needs review" default view vs. a "show everything" toggle).
 */
export async function getCandidatesForReview(companyId: string, opts?: { reviewStatus?: ExtractionCandidateReviewStatus[] }): Promise<Record<ExtractionCandidateKind, CandidateForReview[]>> {
  const rows = await prisma.extractionCandidate.findMany({
    where: { companyId, ...(opts?.reviewStatus ? { reviewStatus: { in: opts.reviewStatus } } : {}) },
    include: { sourceDocument: { select: { name: true } } },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  const byKind: Record<string, CandidateForReview[]> = {};
  for (const r of rows) {
    const entry: CandidateForReview = {
      id: r.id,
      kind: r.kind,
      reviewStatus: r.reviewStatus,
      proposedValue: r.proposedValue,
      reviewerEditedValue: r.reviewerEditedValue,
      confidence: r.confidence,
      rationale: r.rationale,
      sourceDocumentId: r.sourceDocumentId,
      sourceDocumentName: r.sourceDocument.name,
      sourceChunkIds: r.sourceChunkIds,
      sourcePage: r.sourcePage,
      sourceSectionRef: r.sourceSectionRef,
      sourceExcerpt: r.sourceExcerpt,
      reviewedAt: r.reviewedAt,
      reviewedBy: r.reviewedBy,
      promotedAt: r.promotedAt,
    };
    (byKind[r.kind] ??= []).push(entry);
  }
  return byKind as Record<ExtractionCandidateKind, CandidateForReview[]>;
}

export interface ReviewProgressSummary {
  total: number;
  pending: number;
  approved: number;
  edited: number;
  rejected: number;
  reviewRequired: number;
  promoted: number;
}

export async function getReviewProgress(companyId: string): Promise<ReviewProgressSummary> {
  const groups = await prisma.extractionCandidate.groupBy({ by: ["reviewStatus"], where: { companyId }, _count: true });
  const count = (s: ExtractionCandidateReviewStatus) => groups.find((g) => g.reviewStatus === s)?._count ?? 0;
  const promoted = await prisma.extractionCandidate.count({ where: { companyId, promotedAt: { not: null } } });
  return {
    total: groups.reduce((s, g) => s + g._count, 0),
    pending: count("PENDING"),
    approved: count("APPROVED"),
    edited: count("EDITED"),
    rejected: count("REJECTED"),
    reviewRequired: count("REVIEW_REQUIRED"),
    promoted,
  };
}

/** One chunk's full text, for the "click through to view the excerpt in context" requirement - the review workspace's citation-drilldown. */
export async function getChunkContext(chunkId: string) {
  return prisma.documentChunk.findUniqueOrThrow({ where: { id: chunkId } });
}
