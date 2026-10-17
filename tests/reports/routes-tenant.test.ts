import { beforeEach, describe, expect, it, vi } from "vitest";

const loadSpy = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/auth/guard", () => ({
  requireTenantAction: vi.fn(async (id: string) => {
    if (id !== "co_mine") throw new Error("Forbidden");
    return { id: "u", email: "u@x", companyId: "co_mine", role: "USER" };
  }),
}));
vi.mock("@/lib/reports/load", () => ({ loadComplianceReport: (...a: unknown[]) => loadSpy(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { contractEventObligation: { findMany: (...a: unknown[]) => findMany(...a) } } }));

const ctx = (companyId: string) => ({ params: Promise.resolve({ companyId }) });

describe("report routes enforce the tenant gate before any data load", () => {
  beforeEach(() => {
    loadSpy.mockReset();
    findMany.mockReset();
  });
  for (const [name, path] of [
    ["compliance", "@/app/[companyId]/reports/compliance/route"],
    ["certificate", "@/app/[companyId]/reports/certificate/route"],
    ["key-ratios", "@/app/[companyId]/reports/key-ratios/route"],
  ] as const) {
    it(`${name}: cross-tenant ⇒ 403 and no load`, async () => {
      const mod = await import(path);
      const res = await mod.GET(new Request(`http://x/co_other/reports/${name}`), ctx("co_other"));
      expect(res.status).toBe(403);
      expect(loadSpy).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });
  }
  it("compliance: own tenant, csv + pdf + bad format", async () => {
    const { notDeterminableReport } = await import("@/lib/reports/build");
    loadSpy.mockResolvedValue(notDeterminableReport("co_mine", "No financial state"));
    const mod = await import("@/app/[companyId]/reports/compliance/route");
    const csv = await mod.GET(new Request("http://x/co_mine/reports/compliance?format=csv"), ctx("co_mine"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const pdf = await mod.GET(new Request("http://x/co_mine/reports/compliance?format=pdf"), ctx("co_mine"));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const bad = await mod.GET(new Request("http://x/co_mine/reports/compliance?format=xls"), ctx("co_mine"));
    expect(bad.status).toBe(400);
    const badDate = await mod.GET(new Request("http://x/co_mine/reports/compliance?asOf=2026-13-01"), ctx("co_mine"));
    expect(badDate.status).toBe(400);
  });
});
