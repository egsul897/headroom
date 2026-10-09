/**
 * P3-R0 C5. Approving a SNAPSHOT_UPDATE writes only the payload's own facts.
 * An incomplete payload is refused and left PENDING. Prior-period values and
 * debt tranches are not copied onto the new date.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { approveFeedItem } = await import("../../app/[companyId]/feeds/actions");
const { prisma } = await import("../../lib/prisma");

const COMPANY_ID = "fixture-p3-r0-c5-feeds";

const PRIOR = {
  ebitda: 1700,
  cash: 1162,
  interestExpense: 190,
  cumulativeNetIncome: 520,
  equityProceedsSinceIssue: 2150,
  assumedNewDebtRatePct: 6.5,
  totalDebt: 4000,
  securedDebt: 2500,
};

const COMPLETE = {
  asOfDate: "2026-09-30",
  ebitda: 1740,
  cash: 1240,
  interestExpense: 186,
  cumulativeNetIncome: 560,
  equityProceedsSinceIssue: 900,
  assumedNewDebtRatePct: 7.25,
  totalDebt: 3100,
  securedDebt: 1800,
};

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("P3-R0 C5 — SNAPSHOT_UPDATE approval does not carry prior facts forward", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { tenantKind: "EVALUATION", id: COMPANY_ID, name: "Fixture P3-R0 C5 (synthetic, test-only)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("the approve action does not read a latest snapshot or clone tranches", () => {
    const src = readFileSync(join(process.cwd(), "app/[companyId]/feeds/actions.ts"), "utf8");
    expect(src).not.toMatch(/\?\?\s*latest/);
    expect(src).not.toMatch(/debtTranche\.(create|createMany|findMany)/);
    expect(src).not.toMatch(/financialSnapshot\.findFirst/);
  });

  it("refuses a partial SNAPSHOT_UPDATE, leaves it PENDING, and does not clone tranches or omitted fields", async () => {
    const prior = await prisma.financialSnapshot.create({
      data: {
        companyId: COMPANY_ID,
        asOfDate: new Date("2026-06-30T00:00:00.000Z"),
        notes: "PRIOR NOTES",
        ...PRIOR,
      },
    });
    await prisma.debtTranche.create({
      data: { companyId: COMPANY_ID, financialSnapshotId: prior.id, name: "Term Loan B", amount: 2500, secured: true, documentName: "Credit Agreement" },
    });
    const item = await prisma.feedQueueItem.create({
      data: {
        companyId: COMPANY_ID,
        title: "Partial 10-Q",
        description: "Omits debt and equity facts on purpose.",
        source: "test",
        filedDate: new Date("2026-11-10T00:00:00.000Z"),
        kind: "SNAPSHOT_UPDATE",
        payload: {
          asOfDate: "2026-09-30",
          ebitda: 1740,
          cash: 1240,
          interestExpense: 186,
          cumulativeNetIncome: 560,
          notes: "must not be applied",
        },
      },
    });

    await expect(approveFeedItem(COMPANY_ID, item.id)).rejects.toThrow(/incomplete.*left PENDING/s);

    const still = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(still.status).toBe("PENDING");
    expect(still.resolvedAt).toBeNull();

    const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId: COMPANY_ID } });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.id).toBe(prior.id);
    expect(snapshots[0]!.ebitda.toNumber()).toBe(PRIOR.ebitda);
    expect(snapshots[0]!.notes).toBe("PRIOR NOTES");

    const tranches = await prisma.debtTranche.findMany({ where: { companyId: COMPANY_ID } });
    expect(tranches).toHaveLength(1);
    expect(tranches[0]!.financialSnapshotId).toBe(prior.id);
  });

  it("a complete payload writes only supplied facts and does not clone prior tranches or notes", async () => {
    const item = await prisma.feedQueueItem.create({
      data: {
        companyId: COMPANY_ID,
        title: "Complete 10-Q",
        description: "Every required numeric field is on the payload.",
        source: "test",
        filedDate: new Date("2026-11-10T00:00:00.000Z"),
        kind: "SNAPSHOT_UPDATE",
        payload: COMPLETE,
      },
    });

    await approveFeedItem(COMPANY_ID, item.id);

    const applied = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(applied.status).toBe("APPLIED");

    const created = await prisma.financialSnapshot.findFirstOrThrow({
      where: { companyId: COMPANY_ID, asOfDate: new Date("2026-09-30T00:00:00.000Z") },
    });
    expect(created.ebitda.toNumber()).toBe(COMPLETE.ebitda);
    expect(created.cash.toNumber()).toBe(COMPLETE.cash);
    expect(created.interestExpense.toNumber()).toBe(COMPLETE.interestExpense);
    expect(created.cumulativeNetIncome.toNumber()).toBe(COMPLETE.cumulativeNetIncome);
    expect(created.equityProceedsSinceIssue.toNumber()).toBe(COMPLETE.equityProceedsSinceIssue);
    expect(created.assumedNewDebtRatePct.toNumber()).toBe(COMPLETE.assumedNewDebtRatePct);
    expect(created.totalDebt.toNumber()).toBe(COMPLETE.totalDebt);
    expect(created.securedDebt.toNumber()).toBe(COMPLETE.securedDebt);
    expect(created.notes).toBeNull();
    expect(created.totalDebt.toNumber()).not.toBe(PRIOR.totalDebt);
    expect(created.equityProceedsSinceIssue.toNumber()).not.toBe(PRIOR.equityProceedsSinceIssue);

    const tranchesOnNew = await prisma.debtTranche.count({ where: { financialSnapshotId: created.id } });
    expect(tranchesOnNew).toBe(0);
    expect(await prisma.debtTranche.count({ where: { companyId: COMPANY_ID } })).toBe(1);
  });

  it("a complete payload does not require a prior snapshot to exist", async () => {
    const freshId = "fixture-p3-r0-c5-feeds-fresh";
    await prisma.company.deleteMany({ where: { id: freshId } });
    await prisma.company.create({ data: { tenantKind: "EVALUATION", id: freshId, name: "Fixture P3-R0 C5 fresh (synthetic, test-only)" } });
    try {
      const item = await prisma.feedQueueItem.create({
        data: {
          companyId: freshId,
          title: "First snapshot",
          description: "No prior row.",
          source: "test",
          filedDate: new Date("2026-11-10T00:00:00.000Z"),
          kind: "SNAPSHOT_UPDATE",
          payload: { ...COMPLETE, asOfDate: "2026-03-31", notes: "supplied note" },
        },
      });
      await approveFeedItem(freshId, item.id);
      const created = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: freshId } });
      expect(created.notes).toBe("supplied note");
      expect(created.ebitda.toNumber()).toBe(COMPLETE.ebitda);
      expect(await prisma.debtTranche.count({ where: { companyId: freshId } })).toBe(0);
    } finally {
      await prisma.company.deleteMany({ where: { id: freshId } });
    }
  });
});
