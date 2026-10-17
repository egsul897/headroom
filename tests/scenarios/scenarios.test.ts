import { beforeEach, describe, expect, it, vi } from "vitest";
import { toSavedScenario, validateScenarioInput } from "@/lib/scenarios/validate";

const db = { savedScenario: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() } };
vi.mock("@/lib/auth/guard", () => ({
  requireTenantAction: vi.fn(async (id: string) => {
    if (id !== "co_mine") throw new Error("Forbidden");
    return { id: "u1", email: "u@x", companyId: "co_mine", role: "USER" };
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const req = (m: string, body?: unknown) => new Request("http://x/", { method: m, body: body === undefined ? undefined : JSON.stringify(body) });

describe("validation (display values stored verbatim, bounded)", () => {
  it("accepts {name, lines[{label, value}]} and trims", () => {
    expect(validateScenarioInput({ name: " Add-on $50m ", lines: [{ label: "Net leverage", value: "4.10x" }] })).toEqual({ ok: true, name: "Add-on $50m", lines: [{ label: "Net leverage", value: "4.10x" }] });
  });
  it("rejects numbers (no figures, only display strings), empty, oversize", () => {
    expect(validateScenarioInput({ name: "x", lines: [{ label: "a", value: 4.1 }] }).ok).toBe(false);
    expect(validateScenarioInput({ name: "", lines: [{ label: "a", value: "b" }] }).ok).toBe(false);
    expect(validateScenarioInput({ name: "x", lines: [] }).ok).toBe(false);
    expect(validateScenarioInput({ name: "x", lines: Array.from({ length: 51 }, () => ({ label: "a", value: "b" })) }).ok).toBe(false);
    expect(validateScenarioInput({ name: "x".repeat(121), lines: [{ label: "a", value: "b" }] }).ok).toBe(false);
  });
  it("malformed stored lines are dropped, not invented", () => {
    expect(toSavedScenario({ id: "s", name: "n", savedAt: new Date("2026-10-17T00:00:00Z"), lines: [{ label: "a", value: "1" }, { label: "b" }, 3] })).toEqual({ id: "s", name: "n", savedAt: "2026-10-17T00:00:00.000Z", lines: [{ label: "a", value: "1" }] });
  });
});

describe("routes: tenant gate first, workspace-scoped", () => {
  beforeEach(() => Object.values(db.savedScenario).forEach((f) => f.mockReset()));
  it("cross-tenant ⇒ 403 with no DB access on GET/POST/DELETE", async () => {
    const list = await import("@/app/[companyId]/simulate/scenarios/route");
    const one = await import("@/app/[companyId]/simulate/scenarios/[scenarioId]/route");
    expect((await list.GET(req("GET"), ctx({ companyId: "co_other" }))).status).toBe(403);
    expect((await list.POST(req("POST", { name: "x", lines: [{ label: "a", value: "b" }] }), ctx({ companyId: "co_other" }))).status).toBe(403);
    expect((await one.DELETE(req("DELETE"), ctx({ companyId: "co_other", scenarioId: "s1" }))).status).toBe(403);
    expect(Object.values(db.savedScenario).some((f) => f.mock.calls.length)).toBe(false);
  });
  it("POST stores under the caller's workspace and user; bad body 400 before any write", async () => {
    const list = await import("@/app/[companyId]/simulate/scenarios/route");
    expect((await list.POST(req("POST", { name: "x" }), ctx({ companyId: "co_mine" }))).status).toBe(400);
    expect(db.savedScenario.create).not.toHaveBeenCalled();
    db.savedScenario.count.mockResolvedValue(0);
    db.savedScenario.create.mockImplementation(async ({ data }: { data: { name: string; lines: unknown } }) => ({ id: "s1", savedAt: new Date("2026-10-17T00:00:00Z"), ...data }));
    const res = await list.POST(req("POST", { name: "Add-on", lines: [{ label: "Net leverage", value: "4.10x" }] }), ctx({ companyId: "co_mine" }));
    expect(res.status).toBe(201);
    expect(db.savedScenario.create.mock.calls[0]![0].data).toMatchObject({ companyId: "co_mine", createdBy: "u1" });
    expect((await res.json()).scenario).toEqual({ id: "s1", name: "Add-on", savedAt: "2026-10-17T00:00:00.000Z", lines: [{ label: "Net leverage", value: "4.10x" }] });
  });
  it("workspace cap ⇒ 409", async () => {
    db.savedScenario.count.mockResolvedValue(100);
    const list = await import("@/app/[companyId]/simulate/scenarios/route");
    expect((await list.POST(req("POST", { name: "x", lines: [{ label: "a", value: "b" }] }), ctx({ companyId: "co_mine" }))).status).toBe(409);
  });
  it("DELETE is scoped by companyId in the WHERE; another workspace's id is 404", async () => {
    db.savedScenario.deleteMany.mockResolvedValue({ count: 0 });
    const one = await import("@/app/[companyId]/simulate/scenarios/[scenarioId]/route");
    const res = await one.DELETE(req("DELETE"), ctx({ companyId: "co_mine", scenarioId: "theirs" }));
    expect(res.status).toBe(404);
    expect(db.savedScenario.deleteMany.mock.calls[0]![0].where).toEqual({ id: "theirs", companyId: "co_mine" });
  });
  it("store failure on GET ⇒ 503, not an empty list", async () => {
    db.savedScenario.findMany.mockRejectedValue(new Error("down"));
    const list = await import("@/app/[companyId]/simulate/scenarios/route");
    expect((await list.GET(req("GET"), ctx({ companyId: "co_mine" }))).status).toBe(503);
  });
});
