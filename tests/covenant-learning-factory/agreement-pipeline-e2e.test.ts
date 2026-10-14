/**
 * End-to-end agreement pipeline on 3 HELDOUT agreements (issuers not in the DEV manifest; never used for tuning):
 * Nike 2015 credit agreement, Delta 2020 indenture, Live Nation 2025 indenture (TEXT_VERIFIED SEC texts).
 * Invariants are general; per-family outcomes are pinned so changes are visible in review.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  persistAgreementPipeline, persistCustomerAgreementRun, runAgreementPipeline, xrefSpanKey, type CustomerStore, type SqlExecutor,
} from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { splitFor, type DevManifest } from "@/lib/covenant-learning-factory/scoreboard";

const DIR = "tests/fixtures/agreement-pipeline";
const manifest = JSON.parse(readFileSync("scripts/covenant-learning-factory/scoreboard/dev-manifest.json", "utf8")) as DevManifest;
const load = (k: string) => ({
  meta: JSON.parse(readFileSync(`${DIR}/${k}.json`, "utf8")) as { sourceId: string; issuerCik: string },
  text: gunzipSync(readFileSync(`${DIR}/${k}.txt.gz`)).toString("utf8"),
});

const EXPECTED: Record<string, Record<string, string>> = {
  "nike-credit-2015": { DEBT: "MISSING", LIENS: "NEEDS_INPUT", RESTRICTED_PAYMENTS: "MISSING", INVESTMENTS: "CONDITIONS_LIMITED", ASSET_SALES: "CONDITIONS_LIMITED", AFFILIATE_TRANSACTIONS: "CONDITIONS_LIMITED", FUNDAMENTAL_CHANGES: "CONDITIONS_LIMITED", PREPAYMENTS: "MISSING", FINANCIAL_RATIOS: "MISSING" },
  "delta-indenture-2020": { DEBT: "NEEDS_INPUT", LIENS: "NEEDS_INPUT", RESTRICTED_PAYMENTS: "NEEDS_INPUT", INVESTMENTS: "MISSING", ASSET_SALES: "CONDITIONS_LIMITED", AFFILIATE_TRANSACTIONS: "MISSING", FUNDAMENTAL_CHANGES: "CONDITIONS_LIMITED", PREPAYMENTS: "MISSING", FINANCIAL_RATIOS: "NEEDS_INPUT" },
  "lyv-indenture-2025": { DEBT: "MISSING", LIENS: "MISSING", RESTRICTED_PAYMENTS: "MISSING", INVESTMENTS: "MISSING", ASSET_SALES: "MISSING", AFFILIATE_TRANSACTIONS: "MISSING", FUNDAMENTAL_CHANGES: "CONDITIONS_LIMITED", PREPAYMENTS: "MISSING", FINANCIAL_RATIOS: "MISSING" },
};

/** In-memory executor: records rows per table, answers the count(*) verification SELECTs. */
function memoryExecutor(): SqlExecutor & { tables: Map<string, unknown[][]> } {
  const tables = new Map<string, unknown[][]>();
  return {
    tables,
    async execute(sql, params = []) {
      const ins = /^INSERT INTO (\w+) \(([^)]*)\)/.exec(sql);
      if (ins && ins[1] && ins[2]) {
        const n = ins[2].split(",").length;
        const rows = tables.get(ins[1]) ?? [];
        for (let i = 0; i < params.length; i += n) rows.push(params.slice(i, i + n));
        tables.set(ins[1], rows);
        return [];
      }
      const cnt = /SELECT count\(\*\)::int AS n FROM (\w+)/.exec(sql);
      if (cnt && cnt[1]) return [{ n: (tables.get(cnt[1]!) ?? []).filter((r) => r[0] === params[0] && r[1] === params[1]).length }];
      return [];
    },
  };
}

describe("agreement pipeline end-to-end (held-out)", () => {
  for (const k of Object.keys(EXPECTED)) {
    const { meta, text } = load(k);
    it(`${k}: held-out, deterministic, cited, never unlimited by default`, async () => {
      expect(splitFor(meta.sourceId, manifest, meta.issuerCik)).toBe("HELDOUT");
      const r = runAgreementPipeline({ sourceId: meta.sourceId, text });
      const again = runAgreementPipeline({ sourceId: meta.sourceId, text });
      expect(JSON.stringify(again.families)).toBe(JSON.stringify(r.families));

      expect(r.stats.sections).toBeGreaterThan(50);
      expect(r.stats.xrefResolved / Math.max(1, r.stats.xrefs)).toBeGreaterThan(0.7);
      const got = Object.fromEntries(r.families.filter((f) => f.family in EXPECTED[k]!).map((f) => [f.family, f.outcome]));
      expect(got).toEqual(EXPECTED[k]);

      // Compare on alphanumerics only: the compute path and the tree use different (both deterministic) HTML strippers.
      const an = (x: string) => x.replace(/&[a-z#0-9]+;/gi, "").replace(/[^A-Za-z0-9]/g, "");
      const plain = an(r.tree.text);
      for (const f of r.families) for (const b of f.baskets) {
        // Every basket is cited from the document; no cap is "unlimited" unless the clause says so.
        expect(plain.includes(an(b.citation).slice(0, 80)), b.citation).toBe(true);
        if (b.cap === "UNLIMITED_EXPLICIT") expect(b.category).toBe("UNLIMITED");
        if (b.capStatus === "NEEDS_INPUT") expect(b.missingInputs.length).toBeGreaterThan(0);
      }
      for (const c of r.checklist) if (c.status === "MISSING") expect(c.note).toMatch(/not treated as unlimited/);

      const ex = memoryExecutor();
      const stored = await persistAgreementPipeline(ex, r, { sourceId: meta.sourceId, verification: "TEXT_VERIFIED" });
      const spanKeys = new Set(r.crossRefs.map((x) => JSON.stringify(xrefSpanKey(r.tree.text, x))));
      expect(stored).toEqual({ nodes: r.stats.nodes, xrefs: spanKeys.size, checklist: r.checklist.length });
      expect(ex.tables.get("kf_tree_xrefs")).toBeUndefined();
      expect(ex.tables.get("kf_tree_parses")?.length).toBe(1);
      expect(ex.tables.get("kf_agreement_pipeline_results")?.length).toBe(1);
    }, 60_000);
  }
});

/** In-memory Prisma-shaped store for the customer tables (records rows per model; createMany honors PKs). */
function memoryCustomerStore(failOn?: string): CustomerStore & { rows: Record<string, Record<string, unknown>[]> } {
  const rows: Record<string, Record<string, unknown>[]> = { run: [], node: [], xref: [], checklist: [] };
  let seq = 0;
  const many = (k: string, pk: string[]) => ({
    async createMany({ data }: { data: Record<string, unknown>[] }) {
      if (failOn === k) throw new Error(`boom:${k}`);
      const seen = new Set(rows[k]!.map((r) => pk.map((c) => r[c]).join("|")));
      for (const d of data) { const id = pk.map((c) => d[c]).join("|"); if (seen.has(id)) throw new Error(`unique violation ${k} ${id}`); seen.add(id); rows[k]!.push(d); }
      return { count: data.length };
    },
  });
  const store: CustomerStore & { rows: typeof rows } = {
    rows,
    async $transaction(fn) {
      const snap = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
      try { return await fn(store); } catch (e) { for (const [k, n] of Object.entries(snap)) rows[k]!.length = n; throw e; }
    },
    customerAgreementRun: { async create({ data }) { const id = `run${++seq}`; rows.run!.push({ id, ...data }); return { id }; } },
    customerTreeNode: many("node", ["runId", "nodeId"]),
    customerTreeXref: many("xref", ["runId", "spanStart", "spanEnd", "spanSha256"]),
    customerTreeChecklist: many("checklist", ["runId", "family"]),
  };
  return store;
}

describe("customer upload persistence (scoped, never in the shared corpus)", () => {
  const { text } = load("nike-credit-2015");
  const r = runAgreementPipeline({ sourceId: "customer:doc", text });

  it("identical text from two companies yields two separate runs with no shared rows", async () => {
    const db = memoryCustomerStore();
    const a = await persistCustomerAgreementRun(db, { companyId: "co-A", documentId: "d1", sourceId: "customer:d1" }, () => r);
    const b = await persistCustomerAgreementRun(db, { companyId: "co-B", documentId: "d2", sourceId: "customer:d2" }, () => r);
    expect(a.status).toBe("OK"); expect(b.status).toBe("OK");
    expect(a.runId).not.toBe(b.runId);
    expect(db.rows.run!.map((x) => [x.companyId, x.status])).toEqual([["co-A", "OK"], ["co-B", "OK"]]);
    const perRun = (id: string | null) => db.rows.node!.filter((x) => x.runId === id).length;
    expect(perRun(a.runId)).toBe(r.tree.nodes.length);
    expect(perRun(b.runId)).toBe(r.tree.nodes.length);
  }, 60_000);

  it("refuses to write customer uploads into the kf_* corpus tables", async () => {
    await expect(persistAgreementPipeline({ execute: async () => [] }, r, { sourceId: "customer:x", verification: "CUSTOMER_UPLOAD" })).rejects.toThrow(/kf_\*/);
  });

  it("records a pipeline exception as a FAILED run with the error", async () => {
    const db = memoryCustomerStore();
    const out = await persistCustomerAgreementRun(db, { companyId: "co-A", documentId: "d3", sourceId: "customer:d3" }, () => { throw new Error("unparseable"); });
    expect(out).toMatchObject({ status: "FAILED", error: "unparseable" });
    expect(db.rows.run).toHaveLength(1);
    expect(db.rows.run![0]).toMatchObject({ status: "FAILED", error: "unparseable", companyId: "co-A", documentId: "d3" });
  });

  it("records a persistence failure as FAILED and rolls back partial rows", async () => {
    const db = memoryCustomerStore("xref");
    const out = await persistCustomerAgreementRun(db, { companyId: "co-A", documentId: "d4", sourceId: "customer:d4" }, () => r);
    expect(out.status).toBe("FAILED");
    expect(db.rows.node).toHaveLength(0);
    expect(db.rows.run!.map((x) => x.status)).toEqual(["FAILED"]);
    expect(String(db.rows.run![0]!.error)).toMatch(/boom:xref/);
  }, 60_000);
});
