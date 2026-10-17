import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentEngineVersion, resolveScenarioBasis, scenarioFreshness, type ScenarioBasis } from "@/lib/scenarios/basis";
import { createScenarioWithinCap, type SavedScenarioRow, type ScenarioStore, type ScenarioTx } from "@/lib/scenarios/store";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const basis = (o: Partial<ScenarioBasis> = {}): ScenarioBasis => ({
  asOfDate: D("2026-06-30"),
  financialStateId: "fs1",
  financialStateUpdatedAt: new Date("2026-07-02T10:00:00Z"),
  engineVersion: "abc123",
  ...o,
});

describe("scenario freshness (asOf + engine version per save)", () => {
  const saved = { ...basis(), savedAt: D("2026-07-05") };
  it("CURRENT only when every part is known and equal", () => {
    const f = scenarioFreshness(saved, basis());
    expect(f.status).toBe("CURRENT");
    expect(f.label).toBe("Saved on 2026-07-05 against financials as of 2026-06-30; current.");
  });
  it("new period, re-uploaded financials, edited financials or a new engine build ⇒ STALE with the reason", () => {
    expect(scenarioFreshness(saved, basis({ asOfDate: D("2026-09-30"), financialStateId: "fs2" }))).toMatchObject({ status: "STALE", reasons: ["AS_OF_DATE", "FINANCIAL_STATE"] });
    expect(scenarioFreshness(saved, basis({ financialStateUpdatedAt: new Date("2026-08-01T00:00:00Z") }))).toMatchObject({ status: "STALE", reasons: ["FINANCIALS_EDITED"] });
    const eng = scenarioFreshness(saved, basis({ engineVersion: "def456" }));
    expect(eng).toMatchObject({ status: "STALE", reasons: ["ENGINE_VERSION"] });
    expect(eng.label).toBe("Saved on 2026-07-05 against financials as of 2026-06-30; not current: the covenant engine has changed since.");
  });
  it("anything unresolved (legacy row, no build id, ambiguous financials) ⇒ UNKNOWN, never CURRENT", () => {
    expect(scenarioFreshness({ ...saved, engineVersion: null }, basis())).toMatchObject({ status: "UNKNOWN", reasons: ["ENGINE_VERSION"] });
    expect(scenarioFreshness(saved, basis({ asOfDate: null, financialStateId: null, financialStateUpdatedAt: null }))).toMatchObject({ status: "UNKNOWN" });
    const legacy = scenarioFreshness({ asOfDate: null, financialStateId: null, financialStateUpdatedAt: null, engineVersion: null, savedAt: D("2026-07-05") }, basis());
    expect(legacy.status).toBe("UNKNOWN");
    expect(legacy.label).toBe("Saved on 2026-07-05; cannot confirm it is current.");
  });
  it("a known difference wins over a missing part (STALE, not UNKNOWN)", () => {
    expect(scenarioFreshness({ ...saved, engineVersion: null }, basis({ asOfDate: D("2026-09-30") })).status).toBe("STALE");
  });
});

describe("basis resolution (server-side, latest-cohort identity)", () => {
  it("records the unique latest FinancialState and the deployed build", async () => {
    const findMany = vi.fn(async () => [
      { id: "old", asOfDate: D("2026-03-31"), updatedAt: D("2026-04-02") },
      { id: "fs1", asOfDate: D("2026-06-30"), updatedAt: new Date("2026-07-02T10:00:00Z") },
    ]);
    expect(await resolveScenarioBasis({ financialState: { findMany } }, "co", { VERCEL_GIT_COMMIT_SHA: "abc123" })).toEqual(basis());
    expect((findMany.mock.calls[0] as unknown as [{ where: unknown }])[0].where).toEqual({ companyId: "co" });
  });
  it("ambiguous or missing financial state ⇒ nulls, not a guess; blank build id ⇒ null", async () => {
    const amb = vi.fn(async () => [
      { id: "a", asOfDate: D("2026-06-30"), updatedAt: D("2026-07-01") },
      { id: "b", asOfDate: D("2026-06-30"), updatedAt: D("2026-07-01") },
    ]);
    expect(await resolveScenarioBasis({ financialState: { findMany: amb } }, "co", {})).toEqual({ asOfDate: null, financialStateId: null, financialStateUpdatedAt: null, engineVersion: null });
    expect(currentEngineVersion({ VERCEL_GIT_COMMIT_SHA: "  " })).toBeNull();
  });
});

/** In-memory store whose lockWorkspace really serializes per workspace (like pg_advisory_xact_lock). */
function memStore(initial: number, opts: { lock: boolean } = { lock: true }) {
  const rows: SavedScenarioRow[] = Array.from({ length: initial }, (_, i) => ({ id: `s${i}`, name: "n", savedAt: new Date(), lines: [], ...basis() }));
  const tails = new Map<string, Promise<void>>();
  const store: ScenarioStore = {
    async transaction(fn) {
      let release: () => void = () => {};
      const tx: ScenarioTx = {
        async lockWorkspace(companyId) {
          if (!opts.lock) return;
          const prev = tails.get(companyId) ?? Promise.resolve();
          const mine = new Promise<void>((r) => (release = r));
          tails.set(companyId, prev.then(() => mine));
          await prev;
        },
        async count() {
          await new Promise((r) => setTimeout(r, 1)); // yield so concurrent saves interleave
          return rows.length;
        },
        async create(data) {
          await new Promise((r) => setTimeout(r, 1));
          const row = { id: `s${rows.length}`, savedAt: new Date(), ...data } as SavedScenarioRow;
          rows.push(row);
          return row;
        },
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    },
  };
  return { store, rows };
}

describe("100-scenario cap is atomic", () => {
  const input = { companyId: "co", createdBy: "u1", name: "x", lines: [{ label: "a", value: "b" }], basis: basis() };
  it("10 concurrent saves at 98 admit exactly 2", async () => {
    const m = memStore(98);
    const results = await Promise.all(Array.from({ length: 10 }, () => createScenarioWithinCap(m.store, input)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.error === "LIMIT_REACHED")).toHaveLength(8);
    expect(m.rows).toHaveLength(100);
  });
  it("the same race without the workspace lock over-admits (proves the test detects the bug)", async () => {
    const m = memStore(98, { lock: false });
    await Promise.all(Array.from({ length: 10 }, () => createScenarioWithinCap(m.store, input)));
    expect(m.rows.length).toBeGreaterThan(100);
  });
  it("stores the server-resolved basis with the row", async () => {
    const m = memStore(0);
    const r = await createScenarioWithinCap(m.store, input);
    expect(r.ok && r.row).toMatchObject({ asOfDate: D("2026-06-30"), financialStateId: "fs1", engineVersion: "abc123", createdBy: "u1" });
  });
});

describe("routes use the transactional store and a server-side basis", () => {
  const db = {
    savedScenario: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    financialState: { findMany: vi.fn() },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/auth/guard", () => ({ requireTenantAction: vi.fn(async () => ({ id: "u1", email: "u@x", companyId: "co", role: "USER" })) }));
    vi.doMock("@/lib/prisma", () => ({ prisma: db }));
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    db.financialState.findMany.mockReset().mockResolvedValue([{ id: "fs1", asOfDate: D("2026-06-30"), updatedAt: new Date("2026-07-02T10:00:00Z") }]);
    Object.values(db.savedScenario).forEach((f) => f.mockReset());
    db.$executeRaw.mockClear();
  });
  const ctx = { params: Promise.resolve({ companyId: "co" }) };
  it("POST locks the workspace inside the transaction, counts, then creates with the basis (client asOf ignored)", async () => {
    const order: string[] = [];
    db.$executeRaw.mockImplementation(async () => (order.push("lock"), 0));
    db.savedScenario.count.mockImplementation(async () => (order.push("count"), 5));
    db.savedScenario.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => (order.push("create"), { id: "s9", savedAt: D("2026-07-05"), ...data }));
    const { POST } = await import("@/app/[companyId]/simulate/scenarios/route");
    const res = await POST(new Request("http://x/", { method: "POST", body: JSON.stringify({ name: "x", lines: [{ label: "a", value: "b" }], asOfDate: "1999-01-01", engineVersion: "forged" }) }), ctx);
    expect(res.status).toBe(201);
    expect(order).toEqual(["lock", "count", "create"]);
    expect(db.$transaction).toHaveBeenCalled();
    const lockSql = (db.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]);
    expect(lockSql[0].join("?")).toContain("pg_advisory_xact_lock");
    expect(lockSql[1]).toBe("saved-scenarios:co");
    expect(db.savedScenario.create.mock.calls[0]![0].data).toMatchObject({ asOfDate: D("2026-06-30"), financialStateId: "fs1", engineVersion: "abc123" });
    const body = await res.json();
    expect(body.freshness.status).toBe("CURRENT");
    expect(Object.keys(body.scenario).sort()).toEqual(["id", "lines", "name", "savedAt"]);
  });
  it("GET marks a scenario saved against an older period STALE", async () => {
    db.savedScenario.findMany.mockResolvedValue([
      { id: "old", name: "n", savedAt: D("2026-04-05"), lines: [{ label: "a", value: "b" }], asOfDate: D("2026-03-31"), financialStateId: "fs0", financialStateUpdatedAt: D("2026-04-01"), engineVersion: "abc123" },
    ]);
    const { GET } = await import("@/app/[companyId]/simulate/scenarios/route");
    const body = await (await GET(new Request("http://x/"), ctx)).json();
    expect(body.freshness.old).toMatchObject({ status: "STALE", savedAsOfDate: "2026-03-31" });
    expect(body.freshness.old.label).toContain("not current");
  });
  it("store failure on POST ⇒ 503, nothing claimed saved", async () => {
    db.$transaction.mockRejectedValueOnce(new Error("down"));
    const { POST } = await import("@/app/[companyId]/simulate/scenarios/route");
    expect((await POST(new Request("http://x/", { method: "POST", body: JSON.stringify({ name: "x", lines: [{ label: "a", value: "b" }] }) }), ctx)).status).toBe(503);
  });
});
