#!/usr/bin/env tsx
/**
 * End to end: SEC XBRL companyfacts → kf_financials (Neon, read back) → agreement pipeline capacity compute, on the
 * HELDOUT + DEV scoreboard sources that carry an issuer CIK. Reports baskets / ratios that moved NEEDS_INPUT → COMPUTED.
 *   SEC_EDGAR_USER_AGENT=... NEON_TRANSPORT=https DATABASE_URL=... tsx scripts/covenant-learning-factory/xbrl-financials-run.ts OUT.json
 * Never prints connection strings. Companyfacts JSON is cached under XBRL_CACHE (default /tmp/xbrl-cache).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { extractFinancials, fetchSecJson, companyFactsUrl, pad10, type CompanyFacts, type IssuerFinancials } from "../../lib/covenant-learning-factory/xbrl/companyfacts";
import { persistFinancials } from "../../lib/covenant-learning-factory/xbrl/store";
import { runAgreementPipeline } from "../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { createNeonHttpsExecutor, getNeonTransportMode, redactConnectionSecrets } from "../../lib/covenant-learning-factory/store/neon-transport";

const SB = new URL("./scoreboard/", import.meta.url);
const out = process.argv[2] ?? "xbrl-run.json";
const only = process.env.XBRL_ONLY ? new Set(process.env.XBRL_ONLY.split(",")) : null;
/** Covenant test date: latest fiscal period ended AND filed on or before it (default: today). */
const TEST_DATE = process.env.XBRL_TEST_DATE ?? new Date().toISOString().slice(0, 10);
const cacheDir = process.env.XBRL_CACHE ?? "/tmp/xbrl-cache";
mkdirSync(cacheDir, { recursive: true });

const snap = JSON.parse(gunzipSync(readFileSync(new URL("snapshot.json.gz", SB))).toString("utf8")) as { sources: Array<{ source: { sourceId: string; issuerCik: string | null }; documentText: string }> };
const heldout = new Set((JSON.parse(readFileSync(new URL("heldout-membership.json", SB), "utf8")).heldout as Array<{ sourceId: string }>).map((h) => h.sourceId));
const dev = new Set(JSON.parse(readFileSync(new URL("dev-manifest.json", SB), "utf8")).sourceIds as string[]);
const docs = snap.sources.filter((s) => s.source.issuerCik && /^\d+$/.test(s.source.issuerCik) && (heldout.has(s.source.sourceId) || dev.has(s.source.sourceId)) && (!only || only.has(s.source.sourceId)));

async function financials(cik: string): Promise<IssuerFinancials | null> {
  const f = `${cacheDir}/CIK${pad10(cik)}.json`;
  let cf: CompanyFacts | null;
  if (existsSync(f)) cf = JSON.parse(readFileSync(f, "utf8"));
  else { cf = await fetchSecJson<CompanyFacts>(companyFactsUrl(cik)); if (cf) writeFileSync(f, JSON.stringify(cf)); }
  return cf ? extractFinancials(cf, pad10(cik), { asOf: TEST_DATE }) : null;
}

async function main() {
  const ciks = [...new Set(docs.map((d) => d.source.issuerCik!))];
  const fin = new Map<string, IssuerFinancials | null>();
  for (const c of ciks) fin.set(c, await financials(c));
  const neon: Record<string, unknown> = { attempted: false };
  if (getNeonTransportMode() === "https" && process.env.DATABASE_URL) {
    try {
      const ex = await createNeonHttpsExecutor(process.env.DATABASE_URL);
      const ddl = readFileSync(new URL("../../prisma/migrations/20261015050000_kf_financials/migration.sql", import.meta.url), "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n");
      for (const stmt of ddl.split(";").map((x) => x.trim()).filter(Boolean)) {
        if (/\b(drop|delete|truncate)\b/i.test(stmt)) throw new Error("refusing destructive DDL");
        await ex.execute(stmt);
      }
      let written = 0, verified = 0;
      for (const f of fin.values()) if (f) { const r = await persistFinancials(ex, f); written += r.written; verified += r.verified; }
      const total = await ex.execute(`SELECT count(*)::int AS n, count(DISTINCT "cik")::int AS issuers FROM kf_financials`);
      Object.assign(neon, { attempted: true, written, verified, table: total[0] });
    } catch (e) { Object.assign(neon, { attempted: true, error: redactConnectionSecrets(e instanceof Error ? e.message : String(e)).slice(0, 300) }); }
  }
  console.error(JSON.stringify({ issuers: ciks.length, withFacts: [...fin.values()].filter(Boolean).length, neon }));

  const rows: unknown[] = [];
  const tot = { docs: 0, basketsBefore: 0, basketsAfter: 0, ratiosBefore: 0, ratiosAfter: 0, basketsNeedsToComputed: 0, ratiosNeedsToComputed: 0, basketsAtLeast: 0, ratiosBounded: 0, reverted: 0, testDate: TEST_DATE, decisions: { BOUND: 0, LOWER_BOUND: 0, NEEDS_INPUT: 0 } as Record<string, number> };
  for (const d of docs) {
    const f = fin.get(d.source.issuerCik!);
    if (!f) continue;
    let r;
    try { r = runAgreementPipeline({ sourceId: d.source.sourceId, text: d.documentText, issuerCik: d.source.issuerCik, financials: f }); } catch (e) { rows.push({ sourceId: d.source.sourceId, error: String(e).slice(0, 200) }); continue; }
    const b0 = new Set(r.xbrl!.before.basketsComputed), r0 = new Set(r.xbrl!.before.ratiosComputed);
    const b1 = r.computedBaskets.filter((b) => b.capStatus === "COMPUTED"), r1 = r.computedRatios.filter((x) => x.status === "COMPUTED");
    const newB = b1.filter((b) => !b0.has(b.stableKey)), newR = r1.filter((x) => !r0.has(x.stableKey));
    tot.docs++; tot.basketsBefore += b0.size; tot.basketsAfter += b1.length; tot.ratiosBefore += r0.size; tot.ratiosAfter += r1.length;
    const bk = new Map(r.xbrl!.bounds.map((x) => [x.stableKey, x]));
    tot.basketsNeedsToComputed += newB.filter((b) => !bk.has(b.stableKey)).length; tot.ratiosNeedsToComputed += newR.filter((x) => !bk.has(x.stableKey)).length;
    tot.basketsAtLeast += newB.filter((b) => bk.has(b.stableKey)).length; tot.ratiosBounded += newR.filter((x) => bk.has(x.stableKey)).length; tot.reverted += r.xbrl!.reverted.length;
    for (const x of r.xbrl!.decisions) tot.decisions[x.status] = (tot.decisions[x.status] ?? 0) + 1;
    rows.push({ sourceId: d.source.sourceId, cik: f.cik, entity: f.entityName, split: heldout.has(d.source.sourceId) ? "HELDOUT" : "DEV",
      decisions: r.xbrl!.decisions.map((x) => ({ name: x.metricName, status: x.status, reason: x.reason, value: x.input?.value, period: x.input ? `${x.input.periodType} ${x.input.periodEnd}` : null, accession: x.input?.accession, definition: x.definition?.slice(0, 200), derivation: x.input?.derivation, items: x.evaluation?.items.map((i) => `${i.sign}${i.label} ${i.coverage} ${i.value} ${i.concepts.map((c) => c.concept).join('/')} | ${i.note} | ${i.text.slice(0, 90)}`) })),
      newBaskets: newB.map((b) => ({ bound: bk.get(b.stableKey)?.kind ?? 'EXACT', missing: bk.get(b.stableKey)?.missing, sectionRef: b.sectionRef, family: b.covenantFamily, category: b.category, cap: b.capCanonical, currency: b.capCurrency, note: b.note, excerpt: b.citationExcerpt.slice(0, 400) })),
      newRatios: newR.map((x) => ({ bound: bk.get(x.stableKey)?.kind ?? 'EXACT', ratio: x.displayName, value: x.canonical, numerator: x.numerator, denominator: x.denominator })) });
  }
  writeFileSync(out, JSON.stringify({ totals: tot, neon, financials: [...fin.values()].filter(Boolean), rows }, null, 1));
  console.log(JSON.stringify({ totals: tot, neon }, null, 1));
}
main().catch((e) => { console.error(redactConnectionSecrets(String(e?.stack ?? e))); process.exit(1); });
