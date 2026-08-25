/**
 * Proves FINANCIAL_FACT candidates flow through the EXISTING
 * reviewCandidate()/getCandidatesForReview() functions UNMODIFIED
 * (docs/autonomous-retrieval-phase-a-foundation.md) - a connector-discovered
 * financial fact is reviewed with the exact same approve/edit/reject/audit
 * machinery a PERMISSION or DEFINED_TERM candidate already uses. No new
 * review code was written for this kind.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "../../lib/connectors/ingestion";
import { getCandidatesForReview, getReviewProgress, reviewCandidate } from "../../lib/onboarding/review";

const COMPANY_ID = "fixture-financial-fact-review-co";
const CSV = "metricName,value,asOfDate,unit\ncash,3200000,2026-06-30,USD\ncovenant_ebitda,21000000,2026-06-30,USD\ntotal_debt,50000000,2026-06-30,USD";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("FINANCIAL_FACT candidates through the existing review workspace (unmodified)", () => {
  let candidateIds: string[] = [];

  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Financial Fact Review Co (synthetic, test-only)" } });

    const connection = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
    const job = await createIngestionJob({ companyId: COMPANY_ID, kind: "INITIALIZE", sourceConnectionId: connection.id, rawInput: Buffer.from(CSV) });
    const results = await runAllPendingIngestionStages(job.id);
    expect(results.every((r) => r.status === "COMPLETE")).toBe(true);

    const candidates = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" } });
    expect(candidates).toHaveLength(3);
    candidateIds = candidates.map((c) => c.id);
  });

  afterAll(async () => {
    await teardown();
  });

  it("getCandidatesForReview groups FINANCIAL_FACT candidates by kind exactly like every other kind", async () => {
    const byKind = await getCandidatesForReview(COMPANY_ID);
    expect(byKind.FINANCIAL_FACT).toHaveLength(3);
    for (const c of byKind.FINANCIAL_FACT) {
      expect(c.reviewStatus).toBe("PENDING");
      expect(c.proposedValue).toHaveProperty("metricName");
    }
  });

  it("reviewCandidate(APPROVE) works unmodified for a FINANCIAL_FACT candidate, with a CandidateReviewEvent audit row", async () => {
    const [id] = candidateIds;
    const updated = await reviewCandidate({ candidateId: id!, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    expect(updated.reviewStatus).toBe("APPROVED");
    expect(updated.reviewedBy).toBe("test-reviewer@headroom.app");

    const events = await prisma.candidateReviewEvent.findMany({ where: { candidateId: id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("APPROVE");
    expect(events[0]!.previousStatus).toBe("PENDING");
    expect(events[0]!.newStatus).toBe("APPROVED");
  });

  it("reviewCandidate(EDIT) validates the edited value against FinancialFactValueSchema and NEVER overwrites proposedValue", async () => {
    const id = candidateIds[1]!;
    const before = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id } });
    const originalProposedValue = before.proposedValue;

    const editedValue = { metricName: "covenant_ebitda", value: 21500000, asOfDate: "2026-06-30", unit: "USD" };
    const updated = await reviewCandidate({ candidateId: id, action: "EDIT", editedValue, reviewedBy: "test-reviewer@headroom.app" });
    expect(updated.reviewStatus).toBe("EDITED");
    expect(updated.reviewerEditedValue).toMatchObject(editedValue);
    expect(updated.proposedValue).toEqual(originalProposedValue); // untouched, permanently

    // An invalid edit (wrong shape) is rejected, not silently coerced.
    await expect(reviewCandidate({ candidateId: id, action: "EDIT", editedValue: { metricName: "" }, reviewedBy: "test-reviewer@headroom.app" })).rejects.toThrow();
  });

  it("reviewCandidate(REJECT) works unmodified for a FINANCIAL_FACT candidate", async () => {
    const id = candidateIds[2]!;
    const updated = await reviewCandidate({ candidateId: id, action: "REJECT", reviewedBy: "test-reviewer@headroom.app" });
    expect(updated.reviewStatus).toBe("REJECTED");
  });

  it("getReviewProgress reflects all three review decisions", async () => {
    const progress = await getReviewProgress(COMPANY_ID);
    expect(progress.approved).toBe(1);
    expect(progress.edited).toBe(1);
    expect(progress.rejected).toBe(1);
    expect(progress.total).toBe(3);
  });

  it("reviewCandidate refuses without a reviewedBy - never fabricated, same as every other kind", async () => {
    await expect(reviewCandidate({ candidateId: candidateIds[0]!, action: "APPROVE", reviewedBy: "" })).rejects.toThrow(/reviewedBy/);
  });
});
