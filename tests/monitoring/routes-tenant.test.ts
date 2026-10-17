import { describe, expect, it, vi } from "vitest";

const db = {
  workspaceNotification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  covenantBandEvent: { findMany: vi.fn() },
  covenantBandThreshold: { findMany: vi.fn(), upsert: vi.fn() },
  monitoredFiling: { findMany: vi.fn() },
};
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
    expect((await bands.PUT(req("PUT", { covenantKey: "*", moderateBelow: 0.2, dangerBelow: 0.1 }), ctx("co_other"))).status).toBe(403);
    expect((await notes.GET(req(), ctx("co_other"))).status).toBe(403);
    expect((await notes.POST(req("POST", { ids: ["n1"] }), ctx("co_other"))).status).toBe(403);
    expect(touched()).toBe(false);
  });
  it("PUT thresholds validates ordering (422) before writing", async () => {
    const bands = await import("@/app/[companyId]/monitoring/bands/route");
    const res = await bands.PUT(new Request("http://x/", { method: "PUT", body: JSON.stringify({ covenantKey: "*", moderateBelow: 0.1, dangerBelow: 0.2 }) }), ctx("co_mine"));
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
