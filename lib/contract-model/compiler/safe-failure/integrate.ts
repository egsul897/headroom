/**
 * Phase 3F.1.5.R - the ONE wired emission point (Section 9's "smallest set
 * of production emission points necessary"). Call this after
 * runSemanticCoverageAudit() (semantic-coverage/pipeline.ts) produces its
 * result to persist/update/auto-resolve ClaimReviewItem rows from that
 * result's own already-computed per-unit safety signal.
 *
 * Deliberately NOT folded into runSemanticCoverageAudit() itself: that
 * function is a pure, DB-free computation exercised by many existing tests
 * without a live database (tests/contract-model/semantic-coverage-*.test.ts);
 * forcing a Prisma dependency into it would break that contract for no
 * benefit. This module is the explicit, optional persistence step a caller
 * (a script today; a future live route in a later phase) opts into.
 */
import { deriveFromCoverageEntry } from "./derive";
import { recordClaimReview, resolveClaimReview } from "./service";
import { claimKeyFromSemanticUnit } from "./identity";
import { prisma } from "../../../prisma";
import type { DocumentCoverageResult, PackageCoverageResult } from "../semantic-coverage/types";
import type { ClaimReviewRecordOutcome } from "./types";

export interface RecordClaimReviewsFromCoverageResult {
  documentId: string;
  outcomesByType: Record<ClaimReviewRecordOutcome, number>;
  autoResolvedCount: number;
  skippedBelowMaterialityOrHealthy: number;
}

/** One document's worth of coverage results - the granularity DocumentCoverageResult already computes at. */
export async function recordClaimReviewsFromDocumentCoverage(companyId: string, packageKey: string | null, result: DocumentCoverageResult): Promise<RecordClaimReviewsFromCoverageResult> {
  const dangerousByUnitId = new Map(result.dangerousUnaccounted.map((d) => [d.semanticUnitId, d]));
  const unitsById = new Map(result.units.map((u) => [u.semanticUnitId, u]));

  const outcomesByType: Record<ClaimReviewRecordOutcome, number> = { CREATED: 0, OBSERVATION_APPENDED: 0, ALREADY_RECORDED: 0, REOPENED_FROM_RESOLVED: 0 };
  let autoResolvedCount = 0;
  let skipped = 0;

  for (const entry of result.coverageEntries) {
    const unit = unitsById.get(entry.semanticUnitId);
    if (!unit) {
      skipped += 1;
      continue;
    }

    if (entry.coverageState === "FULLY_REPRESENTED_VERIFIED") {
      // Section 12's auto-resolution path: a claim previously flagged, now
      // found fully represented and verified by a later/rerun coverage
      // audit, is automatically accepted - never left OPEN_REVIEW forever
      // once the underlying problem is genuinely gone.
      const claimKey = claimKeyFromSemanticUnit({ semanticUnitId: unit.semanticUnitId });
      const existing = await prisma.claimReviewItem.findUnique({ where: { companyId_claimKey: { companyId, claimKey } } });
      if (existing && existing.status === "OPEN_REVIEW") {
        await resolveClaimReview({
          reviewItemId: existing.id,
          action: "ACCEPT",
          note: `Automatically resolved: a later coverage audit (algorithm ${entry.coverageAlgorithmVersion}) found this claim FULLY_REPRESENTED_VERIFIED.`,
          decidedBy: null,
        });
        autoResolvedCount += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const input = deriveFromCoverageEntry({
      unit,
      entry,
      dangerous: dangerousByUnitId.get(entry.semanticUnitId) ?? null,
      companyId,
      packageKey,
      instrumentKey: unit.instrumentKey,
      coverageAlgorithmVersion: entry.coverageAlgorithmVersion,
    });

    if (!input) {
      skipped += 1;
      continue;
    }

    const outcome = await recordClaimReview(input);
    outcomesByType[outcome.outcome] += 1;
  }

  return { documentId: result.documentId, outcomesByType, autoResolvedCount, skippedBelowMaterialityOrHealthy: skipped };
}

export async function recordClaimReviewsFromPackageCoverage(result: PackageCoverageResult): Promise<RecordClaimReviewsFromCoverageResult[]> {
  const out: RecordClaimReviewsFromCoverageResult[] = [];
  for (const doc of result.documents) {
    out.push(await recordClaimReviewsFromDocumentCoverage(result.companyId, result.packageKey, doc));
  }
  return out;
}
