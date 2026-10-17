/** Shared fixture for the EBITDA box tests: a small agreement, issuer financials, and an in-memory append-only store. */
import type { ConfirmationRow, EbitdaBoxStore } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

export const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
export const fin: IssuerFinancials = { cik: "0000000001", entityName: "T", missing: [], anchor: "2026-06-30", fiscalYear: 2026, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, RestructuringCharges: 8 * M }).map(([c, v]) => row(c, v)) };
export const TEXT = `ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges; plus (e) costs of new systems implementation in an aggregate amount not to exceed $5,000,000 for any period; plus (f) other non-recurring costs approved in writing by the Administrative Agent.
`;
export const args = { sourceId: "s1", text: TEXT, issuerCik: "1", financials: fin };

export type FakeStore = EbitdaBoxStore & { boxes: unknown[]; rows: ConfirmationRow[]; updates: number };

/** In-memory store. Implements the append-only API; a legacy `upsert` (pre-hardening code) is also provided and counted
 *  as an in-place update so tests can assert that history is never overwritten. */
export function fakeStore(): FakeStore {
  const boxes: Array<{ id: string; companyId: string; documentId: string; payload: unknown; createdAt: Date }> = [];
  const rows: ConfirmationRow[] = [];
  let t = 0;
  const s: FakeStore = {
    boxes, rows, updates: 0,
    customerEbitdaBox: {
      create: async ({ data }) => { const r = { id: `b${boxes.length}`, ...data, createdAt: new Date(++t * 1000) }; boxes.push(r); return { id: r.id }; },
      findFirst: async ({ where }) => [...boxes].reverse().find((b) => b.companyId === where.companyId && b.documentId === where.documentId) ?? null,
    },
    customerEbitdaConfirmation: {
      create: async ({ data }) => {
        if (rows.some((r) => r.companyId === data.companyId && r.documentId === data.documentId && r.idempotencyKey === data.idempotencyKey)) throw new Error("unique violation: idempotencyKey");
        const r: ConfirmationRow = { id: `r${String(rows.length).padStart(4, "0")}`, ...data, createdAt: new Date(++t * 1000) };
        rows.push(r); return { id: r.id };
      },
      findMany: async ({ where }) => rows.filter((r) => r.companyId === where.companyId && r.documentId === where.documentId).map((r) => ({ ...r, updatedAt: r.createdAt })),
      findFirst: async ({ where }) => rows.find((r) => r.companyId === where.companyId && r.documentId === where.documentId && r.idempotencyKey === where.idempotencyKey) ?? null,
      // legacy (pre-hardening) API
      upsert: async ({ where, create, update }: { where: { companyId_documentId_inputKey: { companyId: string; documentId: string; inputKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const w = where.companyId_documentId_inputKey;
        const prev = rows.find((r) => r.companyId === w.companyId && r.documentId === w.documentId && r.inputKey === w.inputKey);
        if (prev) { Object.assign(prev, update, { createdAt: new Date(++t * 1000) }); s.updates++; return { id: prev.id }; }
        const r = { id: `r${String(rows.length).padStart(4, "0")}`, kind: "AMOUNT", idempotencyKey: "", confirmedBy: null, ...(create as object), createdAt: new Date(++t * 1000) } as ConfirmationRow;
        rows.push(r); return { id: r.id };
      },
    } as EbitdaBoxStore["customerEbitdaConfirmation"],
  };
  return s;
}
