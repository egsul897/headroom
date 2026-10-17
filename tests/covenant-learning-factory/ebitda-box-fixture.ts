/** Shared fixture for the EBITDA box tests: a small agreement, issuer financials, and an in-memory append-only store. */
import type { ConfirmationRow, EbitdaBoxStore, EbitdaProposalRow } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

export const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
export const fin: IssuerFinancials = { cik: "0000000001", entityName: "T", missing: [], anchor: "2026-06-30", fiscalYear: 2026, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, RestructuringCharges: 8 * M }).map(([c, v]) => row(c, v)) };
export const TEXT = `ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges; plus (e) costs of new systems implementation in an aggregate amount not to exceed $5,000,000 for any period; plus (f) other non-recurring costs approved in writing by the Administrative Agent.
`;
export const args = { sourceId: "s1", text: TEXT, issuerCik: "1", financials: fin };

export type FakeStore = EbitdaBoxStore & {
  boxes: Array<{ id: string; status?: string; payload: unknown }>; rows: ConfirmationRow[]; proposals: EbitdaProposalRow[]; updates: number; transactions: number; locks: string[];
  beforeCreate?: (data: Omit<ConfirmationRow, "id" | "createdAt">) => void | Promise<void>;
  /** Throw from the next box write (simulates a connection reset mid-transaction). */
  failBoxWrite?: Error | null;
  /** Runs when the per-document lock is acquired (simulates work committed while waiting for the lock). */
  onLock?: () => void | Promise<void>;
  /** Freeze the clock: every row gets the same createdAt (timestamps tie; only the DB sequence orders rows). */
  frozenClock?: boolean;
  /** Ids for the next created boxes / confirmation rows (otherwise generated). */
  nextBoxIds?: string[]; nextRowIds?: string[];
};

type Ordered = { id: string; createdAt: Date; seq: bigint };
const val = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "bigint" ? Number(v) : v) as number | string;
/** Sort like the database: by the requested keys only; rows equal on every key come back in id order (an arbitrary but
 *  deterministic tie order, as an index scan would give) — so code that relies on insertion order for ties is caught. */
function ordered<T extends Ordered>(rows: T[], orderBy: unknown): T[] {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) => Object.entries(o as Record<string, "asc" | "desc">));
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = val((a as Record<string, unknown>)[k]), y = val((b as Record<string, unknown>)[k]);
      if (x !== y) return (x < y ? -1 : 1) * (dir === "desc" ? -1 : 1);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** In-memory store. Implements the append-only API; a legacy `upsert` (pre-hardening code) is also provided and counted
 *  as an in-place update so tests can assert that history is never overwritten. */
export function fakeStore(): FakeStore {
  const boxes: Array<{ id: string; companyId: string; documentId: string; status?: string; payload: unknown; createdAt: Date; seq: bigint }> = [];
  const rows: ConfirmationRow[] = [];
  const proposals: EbitdaProposalRow[] = [];
  let t = 0, seq = 0n;
  const now = () => new Date((s.frozenClock ? t : ++t) * 1000);
  let chain: Promise<void> = Promise.resolve();
  const s = {
    boxes, rows, proposals, updates: 0, transactions: 0, locks: [],
    customerEbitdaBox: {
      create: async ({ data }) => {
        if (s.failBoxWrite) { const e = s.failBoxWrite; s.failBoxWrite = null; throw e; }
        const r = { id: s.nextBoxIds?.shift() ?? `b${boxes.length}`, ...data, createdAt: now(), seq: ++seq }; boxes.push(r); return { id: r.id };
      },
      findFirst: async ({ where, orderBy }: { where: { companyId: string; documentId: string; status?: { not: string } }; orderBy?: unknown }) => ordered(boxes, orderBy).find((b) => b.companyId === where.companyId && b.documentId === where.documentId && (!where.status || b.status !== where.status.not)) ?? null,
      findUnique: async ({ where }) => boxes.find((b) => b.id === where.id) ?? null,
    },
    customerEbitdaConfirmation: {
      create: async ({ data }) => {
        await s.beforeCreate?.(data);
        if (rows.some((r) => r.companyId === data.companyId && r.documentId === data.documentId && r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("Unique constraint failed on the fields: (`companyId`,`documentId`,`idempotencyKey`)"), { code: "P2002" });
        const r = { id: s.nextRowIds?.shift() ?? `r${String(rows.length).padStart(4, "0")}`, ...data, createdAt: now(), seq: ++seq } as ConfirmationRow & Ordered;
        rows.push(r); return { id: r.id };
      },
      findMany: async ({ where, orderBy }) => ordered(rows as Array<ConfirmationRow & Ordered>, orderBy).filter((r) => r.companyId === where.companyId && r.documentId === where.documentId).map((r) => ({ ...r, updatedAt: r.createdAt })),
      findFirst: async ({ where }) => rows.find((r) => r.companyId === where.companyId && r.documentId === where.documentId && r.idempotencyKey === where.idempotencyKey) ?? null,
      // legacy (pre-hardening) API
      upsert: async ({ where, create, update }: { where: { companyId_documentId_inputKey: { companyId: string; documentId: string; inputKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const w = where.companyId_documentId_inputKey;
        const prev = rows.find((r) => r.companyId === w.companyId && r.documentId === w.documentId && r.inputKey === w.inputKey);
        if (prev) { Object.assign(prev, update, { createdAt: now() }); s.updates++; return { id: prev.id }; }
        const r = { id: `r${String(rows.length).padStart(4, "0")}`, kind: "AMOUNT", idempotencyKey: "", confirmedBy: null, ...(create as object), createdAt: now(), seq: ++seq } as ConfirmationRow;
        rows.push(r); return { id: r.id };
      },
    } as EbitdaBoxStore["customerEbitdaConfirmation"],
    customerEbitdaProposal: {
      create: async ({ data }) => {
        if (proposals.some((r) => r.companyId === data.companyId && r.documentId === data.documentId && r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("Unique constraint failed on the fields: (`companyId`,`documentId`,`idempotencyKey`)"), { code: "P2002" });
        const r = { id: `p${String(proposals.length).padStart(4, "0")}`, ...data, createdAt: now(), seq: ++seq } as EbitdaProposalRow & Ordered;
        proposals.push(r); return { id: r.id };
      },
      findMany: async ({ where, orderBy }) => ordered(proposals as Array<EbitdaProposalRow & Ordered>, orderBy).filter((r) => r.companyId === where.companyId && r.documentId === where.documentId).map((r) => ({ ...r, updatedAt: r.createdAt })),
      findFirst: async ({ where }) => proposals.find((r) => r.companyId === where.companyId && r.documentId === where.documentId && r.idempotencyKey === where.idempotencyKey) ?? null,
    },
    // Interactive transaction: serialised (like the per-document advisory lock) and rolled back on throw. The store is
    // append-only, so rollback = truncate to the lengths at BEGIN.
    $transaction: async <T,>(fn: (tx: EbitdaBoxStore) => Promise<T>) => {
      const prev = chain;
      let release!: () => void;
      chain = new Promise<void>((r) => (release = r));
      await prev;
      s.transactions++;
      const nb = boxes.length, nr = rows.length, np = proposals.length;
      try { return await fn(s); } catch (e) { boxes.length = nb; rows.length = nr; proposals.length = np; throw e; } finally { release(); }
    },
    $queryRawUnsafe: async (_sql: string, ...v: unknown[]) => { s.locks.push(String(v[0])); await s.onLock?.(); return [{ "?column?": 1 }]; },
  } as FakeStore;
  return s;
}
