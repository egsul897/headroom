/**
 * Phase 3F.1.5.R - persistence + lifecycle service for explicit claim-level
 * safe-failure state.
 *
 * Section 11's dedup contract: at most one ClaimReviewItem row ever exists
 * per (companyId, claimKey) - see prisma/schema.prisma's own @@unique. A
 * second detection for the SAME claim (whether from a later stage in the
 * same run, or a rerun of the same pipeline over unchanged content) appends
 * a ClaimReviewObservation to the EXISTING row rather than creating a
 * duplicate. Section 12's resolution-lifecycle contract: nothing is ever
 * deleted - a resolution is a ClaimReviewDecision row, and the item's own
 * `status` reflects only the LATEST decision (matching CandidateReviewEvent's
 * proven pattern elsewhere in this codebase).
 */
import { prisma } from "../../../prisma";
import type { ClaimReviewDecisionAction, ClaimReviewItemInput, ClaimReviewObservationInput, ClaimReviewRecordResult, ExplicitSafeFailureCheckResult, ResolveClaimReviewInput } from "./types";

/**
 * Record (or update) one claim's review need. Idempotent: calling this
 * twice with an identical (claimKey, stage, reasonCode, detail) observation
 * does not create a second observation row - see the "already recorded"
 * branch below, which compares against the most recent observation from the
 * same stage rather than doing a full historical scan (a stage re-detecting
 * the identical issue on every re-run of an unchanged pipeline is the common
 * case this optimizes for; a stage detecting a NEW distinct issue, even from
 * the same stage, still always appends).
 */
export async function recordClaimReview(input: ClaimReviewItemInput): Promise<ClaimReviewRecordResult> {
  const existing = await prisma.claimReviewItem.findUnique({
    where: { companyId_claimKey: { companyId: input.companyId, claimKey: input.claimKey } },
    include: { observations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const observation: ClaimReviewObservationInput = {
    stage: input.originStage,
    reasonCode: input.reasonCode,
    detail: input.rationale,
    algorithmVersion: input.algorithmVersion,
  };

  if (!existing) {
    const created = await prisma.claimReviewItem.create({
      data: {
        companyId: input.companyId,
        packageKey: input.packageKey,
        instrumentKey: input.instrumentKey,
        documentId: input.documentId,
        claimKey: input.claimKey,
        structuralNodeId: input.structuralNodeId,
        sectionRef: input.sectionRef,
        charStart: input.charStart,
        charEnd: input.charEnd,
        covenantFamily: input.covenantFamily,
        materiality: input.materiality,
        status: "OPEN_REVIEW",
        reasonCode: input.reasonCode,
        unresolvedDimensions: input.unresolvedDimensions,
        originStage: input.originStage,
        sourceEvidence: input.sourceEvidence,
        sourceCitation: input.sourceCitation,
        relatedSemanticObjectId: input.relatedSemanticObjectId,
        operativeVersionRef: input.operativeVersionRef,
        rationale: input.rationale,
        algorithmVersion: input.algorithmVersion,
        observations: { create: observation },
      },
    });
    return { outcome: "CREATED", reviewItemId: created.id, claimKey: input.claimKey };
  }

  const lastObservation = existing.observations[0] ?? null;
  const isDuplicateOfLast = lastObservation !== null && lastObservation.stage === observation.stage && lastObservation.reasonCode === observation.reasonCode && lastObservation.detail === observation.detail;

  const wasResolved = existing.status !== "OPEN_REVIEW";

  if (isDuplicateOfLast && !wasResolved) {
    return { outcome: "ALREADY_RECORDED", reviewItemId: existing.id, claimKey: input.claimKey };
  }

  await prisma.claimReviewItem.update({
    where: { id: existing.id },
    data: {
      // A resolved claim re-detected as still-unresolved reopens - never
      // silently stays RESOLVED_ACCEPTED/REJECTED/SUPERSEDED while the
      // pipeline is actively re-flagging it (fail closed, matching this
      // phase's own NO_SILENT_MATERIAL_FAILURE invariant).
      status: "OPEN_REVIEW",
      resolvedAt: wasResolved ? null : existing.resolvedAt,
      resolvedBy: wasResolved ? null : existing.resolvedBy,
      resolutionNote: wasResolved ? null : existing.resolutionNote,
      // Keep the item's own top-level fields fresh with the latest
      // detection's evidence, without discarding history - history lives in
      // `observations`, never in the mutable top-level row alone.
      reasonCode: input.reasonCode,
      unresolvedDimensions: input.unresolvedDimensions,
      sourceEvidence: input.sourceEvidence,
      sourceCitation: input.sourceCitation ?? existing.sourceCitation,
      relatedSemanticObjectId: input.relatedSemanticObjectId ?? existing.relatedSemanticObjectId,
      operativeVersionRef: input.operativeVersionRef ?? existing.operativeVersionRef,
      rationale: input.rationale,
      algorithmVersion: input.algorithmVersion,
      observations: { create: observation },
      ...(wasResolved
        ? {
            decisions: {
              create: {
                action: "REOPEN",
                previousStatus: existing.status,
                newStatus: "OPEN_REVIEW",
                note: `Automatically reopened: pipeline stage ${observation.stage} re-detected this claim as unresolved (${input.reasonCode}) after a prior ${existing.status} resolution.`,
                decidedBy: null,
              },
            },
          }
        : {}),
    },
  });

  return { outcome: wasResolved ? "REOPENED_FROM_RESOLVED" : "OBSERVATION_APPENDED", reviewItemId: existing.id, claimKey: input.claimKey };
}

/**
 * Section 12's resolution lifecycle. Always writes a ClaimReviewDecision row
 * (append-only audit trail) alongside updating the item's current status -
 * never a bare status flip with no trace of who/why.
 */
export async function resolveClaimReview(input: ResolveClaimReviewInput): Promise<void> {
  const item = await prisma.claimReviewItem.findUniqueOrThrow({ where: { id: input.reviewItemId } });

  const newStatus = actionToStatus(input.action);

  await prisma.$transaction([
    prisma.claimReviewItem.update({
      where: { id: input.reviewItemId },
      data: {
        status: newStatus,
        resolvedAt: newStatus === "OPEN_REVIEW" ? null : new Date(),
        resolvedBy: newStatus === "OPEN_REVIEW" ? null : input.decidedBy,
        resolutionNote: newStatus === "OPEN_REVIEW" ? null : input.note,
      },
    }),
    prisma.claimReviewDecision.create({
      data: {
        reviewItemId: input.reviewItemId,
        action: input.action,
        previousStatus: item.status,
        newStatus,
        note: input.note,
        decidedBy: input.decidedBy,
      },
    }),
  ]);
}

function actionToStatus(action: ClaimReviewDecisionAction): "OPEN_REVIEW" | "RESOLVED_ACCEPTED" | "RESOLVED_REJECTED" | "SUPERSEDED" {
  switch (action) {
    case "ACCEPT":
      return "RESOLVED_ACCEPTED";
    case "REJECT":
      return "RESOLVED_REJECTED";
    case "SUPERSEDE":
      return "SUPERSEDED";
    case "REOPEN":
      return "OPEN_REVIEW";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * Section 15's thin evaluator-compatibility function:
 *
 *   explicitSafeFailure = noCredit && claimSpecificReviewEventExists
 *
 * Deliberately relies on explicit production state (a ClaimReviewItem row
 * matching this exact claimKey) rather than any heuristic reconstruction
 * from generic warnings or nearby pipeline artifacts - the whole point of
 * this phase. Never introduces a new certification threshold; this is a
 * lookup, not a methodology.
 */
export async function checkExplicitSafeFailure(companyId: string, claimKey: string, noCredit: boolean): Promise<ExplicitSafeFailureCheckResult> {
  const item = await prisma.claimReviewItem.findUnique({ where: { companyId_claimKey: { companyId, claimKey } } });
  const claimSpecificReviewEventExists = item !== null;
  return {
    claimKey,
    noCredit,
    claimSpecificReviewEventExists,
    explicitSafeFailure: noCredit && claimSpecificReviewEventExists,
    matchedReviewItemId: item?.id ?? null,
    matchedReviewItemStatus: item?.status ?? null,
  };
}
