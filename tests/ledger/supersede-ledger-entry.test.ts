/**
 * P3-R0 C10 partial. The product ledger action supersedes. It does not
 * hard-delete. The preserved row drops out of live capacity loading.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { supersedeLedgerEntry } = await import("../../app/[companyId]/ledger/actions");
const { prisma } = await import("../../lib/prisma");
const { loadCompanyCovenantData } = await import("../../lib/covenant-engine");

const COMPANY_ID = "fixture-p3-r0-c10-ledger";
const OTHER_COMPANY_ID = "fixture-p3-r0-c10-other";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
}

describe("P3-R0 C10 — ledger supersession preserves history", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { tenantKind: "EVALUATION", id: COMPANY_ID, name: "Fixture P3-R0 C10 (synthetic, test-only)" } });
    await prisma.company.create({ data: { tenantKind: "EVALUATION", id: OTHER_COMPANY_ID, name: "Fixture P3-R0 C10 other (synthetic, test-only)" } });
    await prisma.financialSnapshot.create({
      data: {
        companyId: COMPANY_ID,
        asOfDate: new Date("2026-06-30T00:00:00.000Z"),
        ebitda: 100,
        cash: 10,
        interestExpense: 1,
        cumulativeNetIncome: 2,
        equityProceedsSinceIssue: 3,
        assumedNewDebtRatePct: 5,
        totalDebt: 40,
        securedDebt: 20,
      },
    });
  });

  afterAll(async () => {
    await teardown();
  });

  it("the product action and the ledger page have no hard-delete path", () => {
    const actions = readFileSync(join(process.cwd(), "app/[companyId]/ledger/actions.ts"), "utf8");
    const page = readFileSync(join(process.cwd(), "app/[companyId]/ledger/page.tsx"), "utf8");
    expect(actions).not.toMatch(/ledgerEntry\.delete/);
    expect(actions).not.toMatch(/deleteLedgerEntry/);
    expect(actions).toMatch(/status:\s*"SUPERSEDED"/);
    expect(page).not.toMatch(/deleteLedgerEntry/);
    expect(page).not.toMatch(/>\s*Remove\s*</);
    expect(page).toMatch(/Supersede/);
    expect(page).toMatch(/history preserved/);
    const loaders = readFileSync(join(process.cwd(), "lib/coherent.ts"), "utf8");
    expect(loaders).toMatch(/status:\s*"ACTIVE"/);
    expect(loaders).toMatch(/status:\s*"SUPERSEDED"/);
    const engine = readFileSync(join(process.cwd(), "lib/covenant-engine.ts"), "utf8");
    expect(engine).toMatch(/status:\s*"ACTIVE"/);
  });

  it("supersede keeps the row, drops it from live capacity, and does not invent a successor", async () => {
    const keep = await prisma.ledgerEntry.create({
      data: { companyId: COMPANY_ID, date: new Date("2026-02-01T00:00:00.000Z"), description: "Equity raise that stays", basket: "EQUITY", amount: 25, direction: "CREDIT", source: "test" },
    });
    const withdraw = await prisma.ledgerEntry.create({
      data: { companyId: COMPANY_ID, date: new Date("2026-03-01T00:00:00.000Z"), description: "Dividend to supersede", basket: "DIVIDEND", amount: 12, direction: "DEBIT", source: "test" },
    });

    const before = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date("2026-12-31T00:00:00.000Z"));
    expect(before.ledger).toHaveLength(2);

    await supersedeLedgerEntry(COMPANY_ID, withdraw.id);

    const preserved = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: withdraw.id } });
    expect(preserved.status).toBe("SUPERSEDED");
    expect(preserved.supersededAt).not.toBeNull();
    expect(preserved.supersededById).toBeNull();
    expect(preserved.description).toBe("Dividend to supersede");
    expect(preserved.amount.toNumber()).toBe(12);
    expect(preserved.basket).toBe("DIVIDEND");

    expect(await prisma.ledgerEntry.count({ where: { companyId: COMPANY_ID } })).toBe(2);

    const after = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date("2026-12-31T00:00:00.000Z"));
    expect(after.ledger).toEqual([{ basket: "EQUITY", amount: 25, direction: "CREDIT" }]);

    const live = await prisma.ledgerEntry.findMany({ where: { companyId: COMPANY_ID, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    expect(live.map((e) => e.id)).toEqual([keep.id]);
    const history = await prisma.ledgerEntry.findMany({ where: { companyId: COMPANY_ID, status: "SUPERSEDED" } });
    expect(history.map((e) => e.id)).toEqual([withdraw.id]);

    await expect(supersedeLedgerEntry(COMPANY_ID, withdraw.id)).rejects.toThrow(/already superseded/);
    await expect(supersedeLedgerEntry(OTHER_COMPANY_ID, keep.id)).rejects.toThrow(/does not belong to this company/);

    const stillLive = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: keep.id } });
    expect(stillLive.status).toBe("ACTIVE");
    expect(stillLive.supersededAt).toBeNull();
  });
});
