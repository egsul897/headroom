import { describe, expect, it, vi } from "vitest";

const db = {
  workspaceNotification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  covenantBandEvent: { findMany: vi.fn() },
  covenantBandThreshold: { findMany: vi.fn(), upsert: vi.fn() },
  monitoredFiling: { findMany: vi.fn() },
  workspaceVisit: { findUnique: vi.fn(), upsert: vi.fn() },
  customerEbitdaBox: { findMany: vi.fn(), findFirst: vi.fn() },
  contractEventObligation: { findMany: vi.fn() },
  workspaceFinanceMember: { count: vi.fn() },
};
const overviewRows = vi.fn(() => [
  { kind: "RATIO", stableKey: "d:LEV", name: "Max total net leverage", documentName: "CA", sectionRef: "§7.11", currentRatio: 3, ratioLimit: 4.5, comparisonDirection: "at_or_below", status: "MODELED", testKind: "MAINTENANCE" },
  { kind: "RATIO", stableKey: "ratio:rd", name: "Total Net Leverage — Ratio Debt", documentName: "CA", sectionRef: "§7.03(r)", currentRatio: 5, ratioLimit: 3, comparisonDirection: "at_or_below", status: "MODELED" },
]);
vi.mock("@/lib/covenant-overview-service", () => ({ getCovenantOverview: vi.fn(async () => ({ asOfDate: new Date("2026-06-30"), covenantFamilies: [{ family: "FINANCIAL_COVENANTS", rows: overviewRows() }] })) }));
vi.mock("@/lib/auth/guard", () => ({
  requireTenantAction: vi.fn(async (id: string) => {
    if (id !== "co_mine") throw new Error("Forbidden");
    return { id: "u1", email: "u@x", companyId: "co_mine", role: "USER" };
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const ctx = (companyId: string) => ({ params: Promise.resolve({ companyId }) });
const touched = () => Object.values(db).flatMap((m) => Object.values(m)).some((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls.length > 0);

describe("monitoring routes: tenant gate before any read/write", () => {
  it("changes / bands / notifications reject another workspace with 403 and no DB access", async () => {
    const changes = await import("@/app/[companyId]/monitoring/changes/route");
    const bands = await import("@/app/[companyId]/monitoring/bands/route");
    const notes = await import("@/app/[companyId]/monitoring/notifications/route");
    const req = (m = "GET", body?: unknown) => new Request("http://x/", { method: m, body: body ? JSON.stringify(body) : undefined });
    expect((await changes.GET(req(), ctx("co_other"))).status).toBe(403);
    expect((await bands.GET(req(), ctx("co_other"))).status).toBe(403);
    expect((await bands.PUT(req("PUT", { covenantKey: "d:LEV", direction: "lower-is-safer", healthyUntil: 3.5, moderateUntil: 4.2 }), ctx("co_other"))).status).toBe(403);
    expect((await notes.GET(req(), ctx("co_other"))).status).toBe(403);
    expect((await notes.POST(req("POST", { ids: ["n1"] }), ctx("co_other"))).status).toBe(403);
    const brief = await import("@/app/[companyId]/monitoring/brief/route");
    const cal = await import("@/app/[companyId]/monitoring/calendar/route");
    expect((await brief.GET(req(), ctx("co_other"))).status).toBe(403);
    expect((await brief.POST(req("POST"), ctx("co_other"))).status).toBe(403);
    expect((await cal.GET(req(), ctx("co_other"))).status).toBe(403);
    expect(touched()).toBe(false);
  });
  it("visit is recorded for the caller in the caller's workspace only", async () => {
    db.workspaceVisit.upsert.mockResolvedValue({});
    const brief = await import("@/app/[companyId]/monitoring/brief/route");
    await brief.POST(new Request("http://x/", { method: "POST" }), ctx("co_mine"));
    expect(db.workspaceVisit.upsert.mock.calls[0]![0].where).toEqual({ companyId_userId: { companyId: "co_mine", userId: "u1" } });
  });
  it("N3: PUT requires ADMIN or a workspace finance member; key must be a real maintenance covenant", async () => {
    const bands = await import("@/app/[companyId]/monitoring/bands/route");
    const put = (b: unknown) => bands.PUT(new Request("http://x/", { method: "PUT", body: JSON.stringify(b) }), ctx("co_mine"));
    db.workspaceFinanceMember.count.mockResolvedValueOnce(0);
    expect((await put({ covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 4.2 })).status).toBe(403);
    expect(db.workspaceFinanceMember.count.mock.calls.at(-1)![0]).toEqual({ where: { companyId: "co_mine", userId: "u1" } });
    db.workspaceFinanceMember.count.mockResolvedValue(1);
    expect((await put({ covenantKey: "made-up", healthyUntil: 3.5, moderateUntil: 4.2 })).status).toBe(422);
    const inc = await put({ covenantKey: "ratio:rd", healthyUntil: 2.5, moderateUntil: 2.8 });
    expect(inc.status).toBe(422);
    expect((await inc.json()).error).toBe("NOT_A_MAINTENANCE_COVENANT");
    expect((await put({ covenantKey: "d:LEV", direction: "higher-is-safer", healthyUntil: 3.5, moderateUntil: 4.2 })).status).toBe(422);
    expect((await put({ covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 5.0 })).status).toBe(422);
    expect(db.covenantBandThreshold.upsert).not.toHaveBeenCalled();
    db.covenantBandThreshold.upsert.mockResolvedValue({ covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 4.2 });
    const ok = await put({ covenantKey: "d:LEV", healthyUntil: 3.5, moderateUntil: 4.2 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).direction).toBe("lower-is-safer");
    db.covenantBandThreshold.upsert.mockReset();
  });
  it("PUT thresholds validates ordering (422) before writing", async () => {
    db.workspaceFinanceMember.count.mockResolvedValue(1);
    const bands = await import("@/app/[companyId]/monitoring/bands/route");
    const res = await bands.PUT(new Request("http://x/", { method: "PUT", body: JSON.stringify({ covenantKey: "d:LEV", direction: "lower-is-safer", healthyUntil: 4.2, moderateUntil: 3.5 }) }), ctx("co_mine"));
    expect(res.status).toBe(422);
    expect(db.covenantBandThreshold.upsert).not.toHaveBeenCalled();
  });
  it("mark-read is scoped to the caller's workspace in the WHERE", async () => {
    db.workspaceNotification.updateMany.mockResolvedValue({ count: 1 });
    const notes = await import("@/app/[companyId]/monitoring/notifications/route");
    await notes.POST(new Request("http://x/", { method: "POST", body: JSON.stringify({ ids: ["n1"] }) }), ctx("co_mine"));
    expect(db.workspaceNotification.updateMany.mock.calls[0]![0].where.companyId).toBe("co_mine");
  });
  it("feed store failure ⇒ 503 NOT_DETERMINABLE, not an empty brief", async () => {
    db.workspaceNotification.findMany.mockRejectedValue(new Error("down"));
    const changes = await import("@/app/[companyId]/monitoring/changes/route");
    expect((await changes.GET(new Request("http://x/"), ctx("co_mine"))).status).toBe(503);
  });
});
