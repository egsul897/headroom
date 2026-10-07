/**
 * AUD-S24-01 create path: concurrent first recordClaimReview calls for a
 * brand-new (companyId, claimKey) must not surface an unhandled P2002.
 * Exactly one ClaimReviewItem row is created. Every loser returns one of
 * the existing-item outcomes (ALREADY_RECORDED / OBSERVATION_APPENDED /
 * REOPENED_FROM_RESOLVED). No new outcome code.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { recordClaimReview } from "../../lib/contract-model/compiler/safe-failure/service";
import type { ClaimReviewItemInput, ClaimReviewRecordOutcome } from "../../lib/contract-model/compiler/safe-failure/types";

const PREFIX = "audit-repro-claim-review-create-race";
const EXISTING_OUTCOMES: readonly ClaimReviewRecordOutcome[] = ["ALREADY_RECORDED", "OBSERVATION_APPENDED", "REOPENED_FROM_RESOLVED"];

function claimInput(companyId: string, documentId: string, claimKey: string): ClaimReviewItemInput {
  return {
    companyId,
    packageKey: null,
    instrumentKey: null,
    documentId,
    claimKey,
    structuralNodeId: null,
    sectionRef: "Section 24.01",
    charStart: null,
    charEnd: null,
    covenantFamily: null,
    materiality: "MATERIAL",
    reasonCode: "SEMANTIC_AMBIGUITY",
    unresolvedDimensions: ["threshold"],
    originStage: "SEMANTIC_COMPILER",
    sourceEvidence: "AUD-S24-01 create-race fixture.",
    sourceCitation: null,
    relatedSemanticObjectId: null,
    operativeVersionRef: null,
    rationale: "AUD-S24-01 create-race fixture rationale.",
    algorithmVersion: "audit-v1",
  };
}

async function teardownCompany(companyId: string) {
  await prisma.claimReviewObservation.deleteMany({ where: { reviewItem: { companyId } } }).catch(() => {});
  await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId } } }).catch(() => {});
  await prisma.claimReviewItem.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
}

describe("repro: recordClaimReview concurrent first-create race (AUD-S24-01)", () => {
  afterAll(async () => {
    const companies = await prisma.company.findMany({ where: { id: { startsWith: PREFIX } }, select: { id: true } });
    for (const company of companies) await teardownCompany(company.id);
  });

  it("concurrent first recordClaimReview for the same new claimKey: zero unhandled P2002, one row, loser uses an existing outcome", async () => {
    const trials = 20;
    const concurrency = 6;
    for (let trial = 0; trial < trials; trial++) {
      const companyId = `${PREFIX}-${trial}`;
      const claimKey = `s24-create-race-${trial}`;
      await teardownCompany(companyId);
      await prisma.company.create({ data: { id: companyId, name: `Claim review create race ${trial}` } });
      const doc = await prisma.document.create({ data: { companyId, name: "AUD-S24-01 race fixture", type: "CREDIT_AGREEMENT" } });
      const input = claimInput(companyId, doc.id, claimKey);

      const settled = await Promise.allSettled(Array.from({ length: concurrency }, () => recordClaimReview(input)));
      const rejected = settled.filter((s) => s.status === "rejected");
      expect(rejected, `trial ${trial} rejected`).toHaveLength(0);

      const fulfilled = settled.filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof recordClaimReview>>> => s.status === "fulfilled");
      expect(fulfilled).toHaveLength(concurrency);

      const outcomes = fulfilled.map((s) => s.value.outcome);
      expect(outcomes.filter((outcome) => outcome === "CREATED")).toHaveLength(1);
      for (const outcome of outcomes) {
        if (outcome === "CREATED") continue;
        expect(EXISTING_OUTCOMES).toContain(outcome);
      }
      expect(new Set(fulfilled.map((s) => s.value.reviewItemId)).size).toBe(1);

      const items = await prisma.claimReviewItem.findMany({ where: { companyId, claimKey } });
      expect(items).toHaveLength(1);

      await teardownCompany(companyId);
    }
  });
});
