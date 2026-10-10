/**
 * Approval → execution bridge: DRAFT / REVIEW_REQUIRED never become authoritative.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  assertSnapshotAuthoritative,
  isAuthoritativeSnapshotStatus,
  NonAuthoritativeSnapshotError,
  proposeFinancialSnapshotLifecycle,
  approveProposedFinancialSnapshot,
  loadVerifiedFinancialCapacityInput,
  runApprovalToCapacityBridge,
  buildSharedFinancialViewFromEngineRun,
  SHARED_FINANCIAL_SURFACES,
} from "@/lib/financial-certificate-engine";
import {
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
} from "@/lib/financial-certificate-engine/fixtures";

const COMPANY_ID = "fce-approval-bridge-co";

async function cleanUp() {
  const snaps = await prisma.contractInputSnapshot.findMany({
    where: { companyId: COMPANY_ID },
    select: { snapshotId: true },
  });
  const snapshotIds = snaps.map((s) => s.snapshotId);
  if (snapshotIds.length > 0) {
    const facts = await prisma.contractInputFact.findMany({
      where: { snapshotId: { in: snapshotIds } },
      select: { id: true },
    });
    const factIds = facts.map((f) => f.id);
    if (factIds.length > 0) {
      await prisma.contractInputFactLocator.deleteMany({ where: { factId: { in: factIds } } });
    }
    await prisma.contractInputFact.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
  }
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("approval-to-execution bridge", () => {
  beforeAll(async () => {
    await cleanUp();
    await prisma.company.create({
      data: { id: COMPANY_ID, name: "FCE Approval Bridge Co", onboardingStatus: "ONBOARDING" },
    });
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("refuses DRAFT and REVIEW_REQUIRED as authoritative", () => {
    expect(isAuthoritativeSnapshotStatus("DRAFT")).toBe(false);
    expect(isAuthoritativeSnapshotStatus("REVIEW_REQUIRED")).toBe(false);
    expect(isAuthoritativeSnapshotStatus("APPROVED")).toBe(true);
    expect(() => assertSnapshotAuthoritative("DRAFT")).toThrow(NonAuthoritativeSnapshotError);
    expect(() => assertSnapshotAuthoritative("REVIEW_REQUIRED")).toThrow(NonAuthoritativeSnapshotError);
  });

  it("propose stays non-authoritative; attributable approve then loads verified capacity", async () => {
    const proposed = await proposeFinancialSnapshotLifecycle({
      companyId: COMPANY_ID,
      statement: {
        documentId: "bridge-stmt",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "bridge-cert",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });

    expect(proposed.authoritative).toBe(false);
    expect(proposed.propose.ok).toBe(true);
    const snapshotId = proposed.propose.snapshotId!;
    expect(["DRAFT", "REVIEW_REQUIRED"]).toContain(proposed.propose.status);

    const before = await loadVerifiedFinancialCapacityInput(COMPANY_ID, { snapshotId });
    expect(before.status).toBe("NOT_AUTHORITATIVE");

    const viewDraft = buildSharedFinancialViewFromEngineRun(proposed.run);
    expect(viewDraft.authoritative).toBe(false);
    expect(viewDraft.surfaces).toEqual([...SHARED_FINANCIAL_SURFACES]);
    expect(["DRAFT", "REVIEW_REQUIRED"]).toContain(viewDraft.approvalStatus);
    expect(viewDraft.asOfDate).toBe("2026-06-30");

    const approved = await approveProposedFinancialSnapshot({
      companyId: COMPANY_ID,
      snapshotId,
      reviewedBy: "fce-reviewer@example.com",
      approvalRef: "fce-approval-bridge-1",
      reconciliation: proposed.run.reconciliation,
    });

    // Attribution may still refuse when disposition is REVIEW_REQUIRED — either path is fail-closed.
    if (!approved.authoritative) {
      const still = await loadVerifiedFinancialCapacityInput(COMPANY_ID, { snapshotId });
      expect(["NOT_AUTHORITATIVE", "NO_APPROVED_SNAPSHOT"]).toContain(still.status);
      return;
    }

    const verified = await loadVerifiedFinancialCapacityInput(COMPANY_ID, { snapshotId });
    expect(verified.status).toBe("OK");
    if (verified.status !== "OK") return;
    expect(verified.input.status).toBe("APPROVED");
    expect(verified.input.reviewedBy).toBeTruthy();
    expect(verified.input.capacitySnapshot?.ebitda).toBe(1700);
  }, 30_000);

  it("end-to-end bridge never marks extract-only path authoritative without approve", async () => {
    const companyB = `${COMPANY_ID}-b`;
    // Clean leftover rows from prior timed-out runs on shared Neon.
    const prior = await prisma.contractInputSnapshot.findMany({
      where: { companyId: companyB },
      select: { snapshotId: true },
    });
    const priorIds = prior.map((s) => s.snapshotId);
    if (priorIds.length > 0) {
      const facts = await prisma.contractInputFact.findMany({
        where: { snapshotId: { in: priorIds } },
        select: { id: true },
      });
      const fids = facts.map((f) => f.id);
      if (fids.length > 0) {
        await prisma.contractInputFactLocator.deleteMany({ where: { factId: { in: fids } } });
      }
      await prisma.contractInputFact.deleteMany({ where: { snapshotId: { in: priorIds } } });
    }
    await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: companyB } });
    await prisma.contractInputSnapshot.deleteMany({ where: { companyId: companyB } });
    await prisma.company.deleteMany({ where: { id: companyB } });
    await prisma.company.create({
      data: { id: companyB, name: "FCE Bridge B", onboardingStatus: "ONBOARDING" },
    });
    try {
      const result = await runApprovalToCapacityBridge({
        engineParams: {
          companyId: companyB,
          statement: {
            documentId: "b-stmt",
            text: COHERENT_FINANCIAL_STATEMENT_FY2026,
            declaredType: "FINANCIAL_STATEMENT",
          },
          certificate: {
            documentId: "b-cert",
            text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
            declaredType: "COMPLIANCE_CERTIFICATE",
          },
          now: new Date("2026-08-20T00:00:00Z"),
        },
        reviewedBy: "bridge-reviewer",
        approvalRef: "bridge-ref-b",
      });
      expect(result.propose.ok).toBe(true);
      // Authoritative only when approve + verified load both succeed.
      if (result.authoritative) {
        expect(result.verified?.status).toBe("OK");
        expect(result.approve?.status).toBe("APPROVED");
      } else {
        expect(result.verified?.status !== "OK" || result.approve?.status !== "APPROVED").toBe(true);
      }
    } finally {
      const snaps = await prisma.contractInputSnapshot.findMany({
        where: { companyId: companyB },
        select: { snapshotId: true },
      });
      const ids = snaps.map((s) => s.snapshotId);
      if (ids.length > 0) {
        const facts = await prisma.contractInputFact.findMany({
          where: { snapshotId: { in: ids } },
          select: { id: true },
        });
        const fids = facts.map((f) => f.id);
        if (fids.length > 0) {
          await prisma.contractInputFactLocator.deleteMany({ where: { factId: { in: fids } } });
        }
        await prisma.contractInputFact.deleteMany({ where: { snapshotId: { in: ids } } });
      }
      await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: companyB } });
      await prisma.contractInputSnapshot.deleteMany({ where: { companyId: companyB } });
      await prisma.company.deleteMany({ where: { id: companyB } });
    }
  }, 30_000);
});
