/**
 * End-to-end agreement pipeline on 3 HELDOUT agreements (issuers not in the DEV manifest; never used for tuning):
 * Nike 2015 credit agreement, Delta 2020 indenture, Live Nation 2025 indenture (TEXT_VERIFIED SEC texts).
 * Invariants are general; per-family outcomes are pinned so changes are visible in review.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_DDL, persistAgreementPipeline, runAgreementPipeline, type SqlExecutor,
} from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { splitFor, type DevManifest } from "@/lib/covenant-learning-factory/scoreboard";

const DIR = "tests/fixtures/agreement-pipeline";
const manifest = JSON.parse(readFileSync("scripts/covenant-learning-factory/scoreboard/dev-manifest.json", "utf8")) as DevManifest;
const load = (k: string) => ({
  meta: JSON.parse(readFileSync(`${DIR}/${k}.json`, "utf8")) as { sourceId: string; issuerCik: string },
  text: gunzipSync(readFileSync(`${DIR}/${k}.txt.gz`)).toString("utf8"),
});

const EXPECTED: Record<string, Record<string, string>> = {
  "nike-credit-2015": {"DEBT": "MISSING", "LIENS": "NEEDS_INPUT", "RESTRICTED_PAYMENTS": "MISSING", "INVESTMENTS": "MISSING", "ASSET_SALES": "CONDITIONS_LIMITED", "AFFILIATE_TRANSACTIONS": "CONDITIONS_LIMITED", "FUNDAMENTAL_CHANGES": "NEEDS_INPUT", "PREPAYMENTS": "MISSING", "FINANCIAL_RATIOS": "NEEDS_INPUT"},
  "delta-indenture-2020": {"DEBT": "NEEDS_INPUT", "LIENS": "NEEDS_INPUT", "RESTRICTED_PAYMENTS": "NEEDS_INPUT", "INVESTMENTS": "MISSING", "ASSET_SALES": "NEEDS_INPUT", "AFFILIATE_TRANSACTIONS": "MISSING", "FUNDAMENTAL_CHANGES": "NEEDS_INPUT", "PREPAYMENTS": "MISSING", "FINANCIAL_RATIOS": "NEEDS_INPUT"},
  "lyv-indenture-2025": {"DEBT": "MISSING", "LIENS": "MISSING", "RESTRICTED_PAYMENTS": "MISSING", "INVESTMENTS": "MISSING", "ASSET_SALES": "MISSING", "AFFILIATE_TRANSACTIONS": "MISSING", "FUNDAMENTAL_CHANGES": "CONDITIONS_LIMITED", "PREPAYMENTS": "MISSING", "FINANCIAL_RATIOS": "MISSING"},
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
      for (const d of KNOWLEDGE_DDL) await ex.execute(d);
      const stored = await persistAgreementPipeline(ex, r, { sourceId: meta.sourceId, verification: "TEXT_VERIFIED" });
      expect(stored).toEqual({ nodes: r.stats.nodes, xrefs: r.stats.xrefs, checklist: r.checklist.length });
      expect(ex.tables.get("kf_tree_parses")?.length).toBe(1);
      expect(ex.tables.get("kf_agreement_pipeline_results")?.length).toBe(1);
    }, 60_000);
  }
});
