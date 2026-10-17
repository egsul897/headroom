/**
 * Regression suite for `loadCovenantDataOrEmpty` failure semantics.
 *
 * Background (2026-10-17, YETI staging demo): the shared database was
 * missing the `ledger_entries.supersededBy` column (migration
 * 20261016140000 not applied), so `loadCompanyCovenantData`'s ledger query
 * threw Prisma P2022. The guard swallowed EVERY non-AMBIGUOUS error and
 * substituted an empty covenant dataset — the dashboard then presented a
 * facilities-based $0M total-debt headline and Simulate reported "no
 * document imposes a finite capacity limit" over zero provisions, both
 * indistinguishable from real results.
 *
 * Contract after the fix: ONLY a FinancialIdentityError with code UNKNOWN
 * (no legacy FinancialSnapshot row at all) resolves to the empty dataset.
 * AMBIGUOUS and every infrastructure error reject, so the failure is
 * visible instead of masquerading as real figures.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { FinancialIdentityError } from "../../lib/financial-identity";

const mocks = vi.hoisted(() => ({
  loadCompanyCovenantData: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("../../lib/covenant-engine", () => ({
  loadCompanyCovenantData: mocks.loadCompanyCovenantData,
  computeLeverageMetrics: vi.fn(() => ({})),
}));
vi.mock("../../lib/financial-core/position-service", () => ({
  getFinancialPosition: vi.fn(() => ({})),
}));
vi.mock("../../lib/financial-core-db/adapter", () => ({
  loadCompanyFinancialCoreData: vi.fn(async () => ({})),
}));
vi.mock("../../lib/dashboard-service", () => ({
  buildSolverContext: vi.fn(async () => ({})),
  getCompanySummary: vi.fn(async () => ({})),
}));
vi.mock("../../lib/covenant-overview-builder", () => ({
  buildCovenantOverview: vi.fn(() => ({})),
}));
vi.mock("../../lib/product/unified-position/attributed-utilization", () => ({
  serializeAttributedUtilization: vi.fn(() => null),
}));
vi.mock("../../lib/product/unified-position/attributed-utilization-server", () => ({
  loadAttributedUtilization: vi.fn(async () => null),
}));

import { loadCovenantDataOrEmpty } from "../../lib/covenant-overview-service";

const AS_OF = new Date("2026-07-04T00:00:00.000Z");

describe("loadCovenantDataOrEmpty failure semantics", () => {
  beforeEach(() => {
    mocks.loadCompanyCovenantData.mockReset();
  });

  it("passes a successful load through unchanged", async () => {
    const data = {
      companyId: "acme",
      documents: [{ id: "doc-1" }],
      provisions: [{ id: "prov-1" }],
      financials: { ebitda: 291.1, totalDebt: 100.8 },
      ledger: [],
    };
    mocks.loadCompanyCovenantData.mockResolvedValue(data);
    await expect(loadCovenantDataOrEmpty("acme", AS_OF)).resolves.toBe(data);
  });

  it("UNKNOWN financial identity (no legacy snapshot) resolves to the empty dataset", async () => {
    mocks.loadCompanyCovenantData.mockRejectedValue(
      new FinancialIdentityError("UNKNOWN", 0, "No financial snapshot found for company acme"),
    );
    const data = await loadCovenantDataOrEmpty("acme", AS_OF);
    expect(data.companyId).toBe("acme");
    expect(data.documents).toEqual([]);
    expect(data.provisions).toEqual([]);
    expect(data.financials.totalDebt).toBe(0);
    expect(data.ledger).toEqual([]);
  });

  it("AMBIGUOUS financial identity rejects — duplicate snapshots are a conflict, not emptiness", async () => {
    const err = new FinancialIdentityError("AMBIGUOUS", 2, "2 FinancialSnapshot rows claim the same identity");
    mocks.loadCompanyCovenantData.mockRejectedValue(err);
    await expect(loadCovenantDataOrEmpty("acme", AS_OF)).rejects.toBe(err);
  });

  it("infrastructure errors reject — a missing database column must never become an empty dataset", async () => {
    const err = new Error(
      "Invalid `prisma.ledgerEntry.findMany()` invocation: The column `ledger_entries.supersededBy` does not exist in the current database.",
    );
    err.name = "PrismaClientKnownRequestError";
    mocks.loadCompanyCovenantData.mockRejectedValue(err);
    await expect(loadCovenantDataOrEmpty("acme", AS_OF)).rejects.toBe(err);
  });

  it("non-Error throwables reject as well", async () => {
    mocks.loadCompanyCovenantData.mockRejectedValue("database unreachable");
    await expect(loadCovenantDataOrEmpty("acme", AS_OF)).rejects.toBe("database unreachable");
  });
});
