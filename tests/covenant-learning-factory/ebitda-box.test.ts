import { describe, expect, it } from "vitest";
import { computeEbitdaBox, confirmEbitdaItem, latestEbitdaBox, type EbitdaBoxStore } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin: IssuerFinancials = { cik: "0000000001", entityName: "T", missing: [], anchor: "2026-06-30", fiscalYear: 2026, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, RestructuringCharges: 8 * M }).map(([c, v]) => row(c, v)) };
const TEXT = `ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges; plus (e) costs of new systems implementation in an aggregate amount not to exceed $5,000,000 for any period; plus (f) other non-recurring costs approved in writing by the Administrative Agent.
`;
const args = { sourceId: "s1", text: TEXT, issuerCik: "1", financials: fin };

function fakeStore(): EbitdaBoxStore & { boxes: unknown[]; conf: Map<string, { inputKey: string; value: string; source: string; updatedAt: Date }> } {
  const boxes: Array<{ id: string; companyId: string; documentId: string; payload: unknown; createdAt: Date }> = [];
  const conf = new Map<string, { inputKey: string; value: string; source: string; updatedAt: Date }>();
  let t = 0;
  return {
    boxes, conf,
    customerEbitdaBox: {
      create: async ({ data }) => { const r = { id: `b${boxes.length}`, ...data, createdAt: new Date(++t * 1000) }; boxes.push(r); return { id: r.id }; },
      findFirst: async ({ where }) => [...boxes].reverse().find((b) => b.companyId === where.companyId && b.documentId === where.documentId) ?? null,
    },
    customerEbitdaConfirmation: {
      upsert: async ({ where, create, update }) => { const k = `${where.companyId_documentId_inputKey.companyId}|${where.companyId_documentId_inputKey.documentId}|${where.companyId_documentId_inputKey.inputKey}`; const prev = conf.get(k); conf.set(k, { ...(prev ?? (create as never)), ...(prev ? (update as never) : {}), updatedAt: new Date(++t * 1000) }); return { id: k }; },
      findMany: async ({ where }) => [...conf.entries()].filter(([k]) => k.startsWith(`${where.companyId}|${where.documentId}|`)).map(([, v]) => v),
    },
  };
}

describe("EBITDA box data shape", () => {
  const box = computeEbitdaBox(args);
  it("totals: base, confirmed add-backs, total", () => {
    expect(box.status).toBe("READY");
    expect(box.base?.value).toBe(String(100 * M));
    expect(box.confirmedAddBacks).toBe(String(8 * M)); // restructuring evidenced by filings
    expect(box.totalEbitda).toBe(String((100 + 20 + 30 + 50 + 8) * M));
  });
  it("items carry amount/source/clause/cap/status; nothing invented", () => {
    const d = box.items.find((i) => i.label === "(d)")!;
    expect(d).toMatchObject({ status: "EVIDENCED", counted: String(8 * M), amount: String(8 * M) });
    expect(d.source[0]).toMatchObject({ kind: "XBRL", value: String(8 * M) });
    const e = box.items.find((i) => i.label === "(e)")!;
    expect(e).toMatchObject({ status: "PENDING", counted: "0", amount: null, potentialEbitda: String(5 * M) });
    expect(e.cap?.amount).toBe(String(5 * M));
    const f = box.items.find((i) => i.label === "(f)")!;
    expect(f.status).toBe("CONDITIONAL");
    expect(f.conditionText).toMatch(/approved in writing by the Administrative Agent/);
  });
  it("extra available = known cap room on pending items; unbounded pending counted, not valued", () => {
    expect(box.extraAvailableIfConfirmed).toBe(String(5 * M));
    expect(box.pendingConditional).toBe(1);
  });
  it("no financials → NEEDS_FINANCIALS, no amounts", () => {
    const b = computeEbitdaBox({ ...args, financials: null });
    expect(b).toMatchObject({ status: "NEEDS_FINANCIALS", totalEbitda: null, items: [] });
  });
});

describe("CFO confirm flow (persisted, recomputed)", () => {
  const scope = { companyId: "c1", documentId: "d1" };
  it("confirming a capped item counts it (cap applied) and persists the figure + a new box", async () => {
    const db = fakeStore();
    const key = computeEbitdaBox(args).items.find((i) => i.label === "(e)")!.inputKey;
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(7 * M), source: "Q2 2026 management accounts", confirmedBy: "cfo@x" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.gain?.ebitda).toBe(String(5 * M)); // capped at $5M
    const e = out.box.items.find((i) => i.label === "(e)")!;
    expect(e).toMatchObject({ status: "CONFIRMED", counted: String(5 * M), amount: String(7 * M) });
    expect(e.source[0]).toMatchObject({ kind: "CFO" });
    expect(out.box.totalEbitda).toBe(String(213 * M));
    expect(db.conf.size).toBe(1);
    expect((await latestEbitdaBox(db, scope))?.totalEbitda).toBe(String(213 * M));
  });
  it("conditional item counts only once the CFO confirms it", async () => {
    const db = fakeStore();
    const key = computeEbitdaBox(args).items.find((i) => i.label === "(f)")!.inputKey;
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(2 * M), source: "Agent approval letter 2026-07-15" });
    expect(out.ok && out.box.items.find((i) => i.label === "(f)")!.status).toBe("CONFIRMED");
  });
  it("refuses: no source, non-integer, unknown key; nothing persisted", async () => {
    const db = fakeStore();
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: "ADDBACK:(e)", value: "100", source: " " })).toMatchObject({ ok: false, status: 400 });
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: "ADDBACK:(e)", value: "1.5", source: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await confirmEbitdaItem(db, scope, args, { inputKey: "ADDBACK:(zz)", value: "100", source: "x" })).toMatchObject({ ok: false, status: 404 });
    expect(db.conf.size).toBe(0);
    expect(db.boxes.length).toBe(0);
  });
  it("re-confirming a key replaces the figure (latest wins)", async () => {
    const db = fakeStore();
    const key = computeEbitdaBox(args).items.find((i) => i.label === "(e)")!.inputKey;
    await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(1 * M), source: "a" });
    const out = await confirmEbitdaItem(db, scope, args, { inputKey: key, value: String(2 * M), source: "b" });
    expect(db.conf.size).toBe(1);
    expect(out.ok && out.box.items.find((i) => i.label === "(e)")!.counted).toBe(String(2 * M));
  });
});
