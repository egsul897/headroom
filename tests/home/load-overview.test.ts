/**
 * Overview loader wiring — fail-closed when engine path unavailable;
 * populates figure/ledger slots only through invent-absence constructors.
 * PAI-05: non-authoritative remaining never publishes as headroom.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompanySummary: vi.fn(),
  getCompanyDashboard: vi.fn(),
  getCovenantOverview: vi.fn(),
  loadCapacityReadiness: vi.fn(),
  loadMonitoringFeed: vi.fn(),
  getCompanySetupStatus: vi.fn(),
  ledgerFindMany: vi.fn(),
  facilityFindMany: vi.fn(),
}));

vi.mock("@/lib/dashboard-service", () => ({
  getCompanySummary: mocks.getCompanySummary,
  getCompanyDashboard: mocks.getCompanyDashboard,
}));

vi.mock("@/lib/covenant-overview-service", () => ({
  getCovenantOverview: mocks.getCovenantOverview,
}));

vi.mock("@/lib/product/customer-intelligence/capacity-readiness", () => ({
  loadCapacityReadiness: mocks.loadCapacityReadiness,
}));

vi.mock("@/lib/product/customer-intelligence/monitoring", () => ({
  loadMonitoringFeed: mocks.loadMonitoringFeed,
}));

vi.mock("@/lib/onboarding/setup-status", () => ({
  getCompanySetupStatus: mocks.getCompanySetupStatus,
  nextSetupStep: () => null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ledgerEntry: { findMany: mocks.ledgerFindMany },
    facility: { findMany: mocks.facilityFindMany },
  },
}));

import { loadCompanyOverview } from "@/lib/home/load-overview";
import { presentFigure, presentTransactions } from "@/lib/home/load-state";

describe("loadCompanyOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCompanySummary.mockResolvedValue({ name: "Apex Demo Co" });
    mocks.ledgerFindMany.mockResolvedValue([]);
    mocks.facilityFindMany.mockResolvedValue([]);
    mocks.getCovenantOverview.mockRejectedValue(new Error("no overview in unit fixture"));
    mocks.loadMonitoringFeed.mockResolvedValue({
      companyId: "co-1",
      generatedAt: "2025-06-30T00:00:00Z",
      alerts: [],
      note: "fixture",
    });
    mocks.getCompanySetupStatus.mockResolvedValue(null);
    mocks.loadCapacityReadiness.mockResolvedValue({
      canEvaluateExecutableCapacity: false,
      headline: "Discovery only — no figures.",
      guidance: "LEGACY_ENGINE ≠ certified Phase 4E.",
    });
  });

  it("wires ledger empty and keeps figures UNKNOWN when not executable", async () => {
    const bundle = await loadCompanyOverview("co-1");
    expect(bundle.identityName).toBe("Apex Demo Co");
    expect(presentTransactions(bundle.load.transactions).kind).toBe("VERIFIED_EMPTY");
    expect(presentFigure(bundle.load.totalHeadroom, "totalHeadroom").kind).toBe("UNKNOWN");
    expect(mocks.getCompanyDashboard).not.toHaveBeenCalled();
  });

  it("PAI-05: withholds headroom when utilization remaining is not production-authoritative", async () => {
    mocks.loadCapacityReadiness.mockResolvedValue({
      canEvaluateExecutableCapacity: true,
      headline: "Executable path available.",
      guidance: "engine-backed",
    });
    mocks.getCompanyDashboard.mockResolvedValue({
      asOfDate: new Date("2025-06-30T00:00:00Z"),
      capacity: {
        secured: {
          remainingCapacity: 84,
          utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE",
          perDocument: [
            {
              documentId: "d1",
              documentName: "Credit Agreement",
              method: "SOLVER_NATIVE_RECOMPUTED",
              remainingCapacity: 84,
            },
          ],
        },
        unsecured: {
          remainingCapacity: 84,
          utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE",
          perDocument: [],
        },
      },
      financialPosition: {
        capitalStructure: { grossDebt: 750 },
        metrics: { genericNetLeverage: { value: 2.1, status: "AVAILABLE" } },
      },
    });
    mocks.facilityFindMany.mockResolvedValue([
      { name: "Revolver", commitmentAmount: 600, originalPrincipal: 600 },
      { name: "Term Loan B", commitmentAmount: null, originalPrincipal: 400 },
    ]);
    mocks.ledgerFindMany.mockResolvedValue([
      {
        date: new Date("2025-05-08T00:00:00Z"),
        description: "Revolver Borrowing",
        amount: { toNumber: () => 25 },
        direction: "DEBIT",
        basket: "DEBT_INCUR",
      },
    ]);

    const bundle = await loadCompanyOverview("co-1");
    const headroom = presentFigure(bundle.load.totalHeadroom, "totalHeadroom");
    expect(headroom.kind).toBe("UNKNOWN");
    const util = presentFigure(bundle.load.utilization, "utilization");
    expect(util.kind).toBe("VERIFIED_POPULATED");
    const tx = presentTransactions(bundle.load.transactions);
    expect(tx.kind).toBe("VERIFIED_POPULATED");
    expect(bundle.load.statusTable.kind).toBe("VERIFIED_POPULATED");
    // Gross modeled amounts must not be labeled as healthy remaining headroom.
    const statusRows =
      bundle.load.statusTable.kind === "VERIFIED_POPULATED" ? bundle.load.statusTable.rows : [];
    expect(statusRows.some((r) => r.status === "Healthy")).toBe(false);
    expect(statusRows.some((r) => String(r.headroom).includes("gross") || r.headroom === "—")).toBe(true);
  });

  it("publishes headroom only when utilization remaining authority is PRODUCTION_AUTHORITATIVE", async () => {
    mocks.loadCapacityReadiness.mockResolvedValue({
      canEvaluateExecutableCapacity: true,
      headline: "Executable path available.",
      guidance: "engine-backed",
    });
    mocks.getCompanyDashboard.mockResolvedValue({
      asOfDate: new Date("2025-06-30T00:00:00Z"),
      capacity: {
        secured: {
          remainingCapacity: 84,
          utilizationRemainingAuthority: "PRODUCTION_AUTHORITATIVE",
          perDocument: [
            {
              documentId: "d1",
              documentName: "Credit Agreement",
              method: "SOLVER_NATIVE_RECOMPUTED",
              remainingCapacity: 84,
            },
          ],
        },
        unsecured: {
          remainingCapacity: 84,
          utilizationRemainingAuthority: "PRODUCTION_AUTHORITATIVE",
          perDocument: [],
        },
      },
      financialPosition: {
        capitalStructure: { grossDebt: 750 },
        metrics: { genericNetLeverage: { value: 2.1, status: "AVAILABLE" } },
      },
    });
    mocks.facilityFindMany.mockResolvedValue([
      { name: "Revolver", commitmentAmount: 600, originalPrincipal: 600 },
    ]);
    mocks.ledgerFindMany.mockResolvedValue([]);

    const bundle = await loadCompanyOverview("co-1");
    const headroom = presentFigure(bundle.load.totalHeadroom, "totalHeadroom");
    expect(headroom.kind).toBe("VERIFIED_POPULATED");
    if (headroom.kind === "VERIFIED_POPULATED") {
      expect(headroom.display).toBe("$84M");
    }
  });

  it("refuses invented zero headroom when engine returns undefined remaining", async () => {
    mocks.loadCapacityReadiness.mockResolvedValue({
      canEvaluateExecutableCapacity: true,
      headline: "Executable",
      guidance: "g",
    });
    mocks.getCompanyDashboard.mockResolvedValue({
      asOfDate: new Date("2025-06-30T00:00:00Z"),
      capacity: {
        secured: {
          remainingCapacity: undefined,
          utilizationRemainingAuthority: "PRODUCTION_AUTHORITATIVE",
          perDocument: [],
        },
        unsecured: {
          remainingCapacity: undefined,
          utilizationRemainingAuthority: "PRODUCTION_AUTHORITATIVE",
          perDocument: [],
        },
      },
      financialPosition: {
        capitalStructure: { grossDebt: 0 },
        metrics: { genericNetLeverage: { value: null, status: "MISSING" } },
      },
    });

    const bundle = await loadCompanyOverview("co-1");
    expect(presentFigure(bundle.load.totalHeadroom, "totalHeadroom").kind).toBe("UNKNOWN");
  });
});
