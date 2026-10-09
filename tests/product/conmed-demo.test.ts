import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  CONMED_DEMO_COMPANY_ID,
  CONMED_DEMO_DOCUMENTS,
} from "../../lib/product/conmed-demo/package";
import {
  listConmedCovenantExplorerRows,
  getConmedCovenantById,
} from "../../lib/product/conmed-demo/covenant-catalog";
import {
  DEMO_LIVE_WRITE_ENV,
  DEMO_LIVE_WRITE_TOKEN,
  setupConmedDemo,
} from "../../lib/product/conmed-demo/setup";
import { companyNavItems } from "../../lib/home/nav";

const mocks = vi.hoisted(() => ({
  companyCount: vi.fn(),
  snapshotCount: vi.fn(),
  findUniqueCompany: vi.fn(),
  findUniqueDocument: vi.fn(),
  createCompany: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    company: {
      count: mocks.companyCount,
      findUnique: mocks.findUniqueCompany,
      create: mocks.createCompany,
    },
    financialSnapshot: { count: mocks.snapshotCount },
    document: {
      findUnique: mocks.findUniqueDocument,
      create: mocks.createDocument,
      update: mocks.updateDocument,
    },
  },
}));

describe("CONMED authentic package fixtures", () => {
  it("has all four raw-source HTML bodies present", () => {
    for (const doc of CONMED_DEMO_DOCUMENTS) {
      const abs = path.join(process.cwd(), doc.rawRelativePath);
      expect(existsSync(abs), doc.rawRelativePath).toBe(true);
      expect(statSync(abs).size).toBeGreaterThan(1000);
    }
  });

  it("exposes covenant explorer rows without inventing capacity numbers", () => {
    const rows = listConmedCovenantExplorerRows();
    expect(rows.length).toBeGreaterThan(20);
    const rp = getConmedCovenantById("a-7.6-d");
    expect(rp?.realFigures.join(" ")).toMatch(/40,000,000/);
    expect(rp?.capacityStatus).toBe("NEEDS_FINANCIAL_INPUTS");
    expect(rows.every((r) => r.capacityStatus !== undefined)).toBe(true);
    expect(rows.some((r) => r.capacityStatus === "RATIO_GATED_UNRESOLVED")).toBe(true);
  });
});

describe("product nav", () => {
  it("includes Documents, Covenants, Position, Simulations, Evidence, Transactions", () => {
    const labels = companyNavItems(CONMED_DEMO_COMPANY_ID, "ACTIVE").map((i) => i.label);
    for (const label of ["Documents", "Covenants", "Position", "Simulations", "Evidence", "Transactions", "Dashboard", "Capacity"]) {
      expect(labels).toContain(label);
    }
  });
});

describe("conmed demo setup gate", () => {
  beforeEach(() => {
    mocks.companyCount.mockResolvedValue(5);
    mocks.snapshotCount.mockResolvedValue(3);
    mocks.findUniqueCompany.mockResolvedValue(null);
    mocks.findUniqueDocument.mockResolvedValue(null);
    delete process.env[DEMO_LIVE_WRITE_ENV];
  });

  it("dry-run plans creates without writing", async () => {
    const r = await setupConmedDemo({ live: false });
    expect(r.mode).toBe("dry-run");
    expect(r.documents.length).toBe(4);
    expect(r.documents.every((d) => d.action === "would-create")).toBe(true);
    expect(mocks.createCompany).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(r.preservedCounts.companies).toBe(5);
  });

  it("refuses live without token", async () => {
    await expect(setupConmedDemo({ live: true })).rejects.toThrow(/refused/);
  });

  it("live with token creates company and documents", async () => {
    process.env[DEMO_LIVE_WRITE_ENV] = DEMO_LIVE_WRITE_TOKEN;
    mocks.createCompany.mockResolvedValue({});
    mocks.createDocument.mockResolvedValue({});
    const r = await setupConmedDemo({ live: true });
    expect(r.mode).toBe("live");
    expect(mocks.createCompany).toHaveBeenCalledOnce();
    expect(mocks.createDocument).toHaveBeenCalledTimes(4);
    expect(r.documents.every((d) => d.action === "created")).toBe(true);
  });
});
