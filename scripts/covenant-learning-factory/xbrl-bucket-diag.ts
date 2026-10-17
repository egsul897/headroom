#!/usr/bin/env tsx
/**
 * Where do basket / ratio clauses fail BEFORE the financial fill step? Runs the agreement pipeline (with XBRL
 * financials) on HELDOUT + DEV snapshot sources and fresh TUNABLE docs (never BLIND), and buckets every basket and
 * every named ratio by outcome and failure reason.  tsx xbrl-bucket-diag.ts OUT.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { extractFinancials, fetchSecJson, companyFactsUrl, pad10, type CompanyFacts, type IssuerFinancials } from "../../lib/covenant-learning-factory/xbrl/companyfacts";
import { loadNameIndex, loadTickerCiks, resolveBorrowerCik } from "../../lib/covenant-learning-factory/xbrl/cik-resolve";
import { plainText } from "../../lib/covenant-learning-factory/xbrl/definition-items";
import { latestInstanceFacts } from "../../lib/covenant-learning-factory/xbrl/instance-debt";
import { headroomBound, runAgreementPipeline } from "../../lib/covenant-learning-factory/pipeline/agreement-pipeline";

const SB = new URL("./scoreboard/", import.meta.url);
const out = process.argv[2] ?? "bucket.json";
const cacheDir = process.env.XBRL_CACHE ?? "/tmp/xbrl-cache";
const freshDir = process.env.FRESH_DIR ?? "/workspace/fresh/docs";
const TEST_DATE = process.env.XBRL_TEST_DATE ?? new Date().toISOString().slice(0, 10);
const limit = Number(process.env.DIAG_LIMIT ?? 1e9);

const snap = JSON.parse(gunzipSync(readFileSync(new URL("snapshot.json.gz", SB))).toString("utf8")) as { sources: Array<{ source: { sourceId: string; issuerCik: string | null }; documentText: string }> };
const heldout = new Set((JSON.parse(readFileSync(new URL("heldout-membership.json", SB), "utf8")).heldout as Array<{ sourceId: string }>).map((h) => h.sourceId));
const dev = new Set(JSON.parse(readFileSync(new URL("dev-manifest.json", SB), "utf8")).sourceIds as string[]);
type Doc = { id: string; set: string; cik: string | null; text: () => string };
const docs: Doc[] = snap.sources.filter((s) => heldout.has(s.source.sourceId) || dev.has(s.source.sourceId))
  .map((s) => ({ id: s.source.sourceId, set: heldout.has(s.source.sourceId) ? "HELDOUT" : "DEV", cik: s.source.issuerCik && /^\d+$/.test(s.source.issuerCik) && !/^0+$/.test(s.source.issuerCik) ? s.source.issuerCik : null, text: () => s.documentText }));
// No (or a placeholder) CIK: resolve the borrower's legal name to EDGAR exactly; ambiguous stays null.
const cikResolved: Record<string, string> = {};
if (process.env.DIAG_RESOLVE_CIK !== "0" && existsSync(`${cacheDir}/cik-lookup-data.txt`)) {
  const idx = loadNameIndex(`${cacheDir}/cik-lookup-data.txt`);
  const tk = existsSync(`${cacheDir}/company_tickers.json`) ? loadTickerCiks(`${cacheDir}/company_tickers.json`) : undefined;
  for (const d of docs) if (!d.cik) { const r = resolveBorrowerCik(plainText(d.text()), idx, tk); if (r.cik) { d.cik = r.cik.replace(/^0+/, ""); cikResolved[d.id] = `${r.cik} ${r.name}`; } }
}
// TUNABLE only: the BLIND split (fresh-heldout.json) is never read.
if (process.env.DIAG_NO_FRESH !== "1") for (const f of readFileSync(new URL("fresh-tunable.txt", SB), "utf8").split("\n").map((x) => x.trim()).filter(Boolean)) {
  const p = `${freshDir}/${f}`;
  if (existsSync(p)) docs.push({ id: `fresh:${f}`, set: "TUNABLE", cik: f.split("_")[0]!, text: () => readFileSync(p, "utf8") });
}

async function financials(cik: string): Promise<IssuerFinancials | null> {
  const f = `${cacheDir}/CIK${pad10(cik)}.json`;
  let cf: CompanyFacts | null = null;
  if (existsSync(f)) cf = JSON.parse(readFileSync(f, "utf8"));
  else { try { cf = await fetchSecJson<CompanyFacts>(companyFactsUrl(cik)); } catch { cf = null; } writeFileSync(f, JSON.stringify(cf)); }
  return cf ? extractFinancials(cf, pad10(cik), { asOf: TEST_DATE }) : null;
}

function basketBucket(b: { category: string; capStatus: string; note: string; missingInputs: string[] }, why: (n: string) => string): string {
  const n = b.note;
  if (/limb could not be read/.test(n)) return `${b.category}: greater-of limb not parsed`;
  if (/metric is not bound|is not a bound metric/.test(n)) return `${b.category}: metric unbound (${why(b.missingInputs[0] ?? "")})`;
  if (/base it applies to could not be read/.test(n)) return `${b.category}: percent base not parsed`;
  if (/single cap-role dollar/.test(n)) return `${b.category}: fixed amount not parsed`;
  if (/different units/.test(n)) return `${b.category}: unit alignment`;
  if (b.missingInputs.includes("contract ratio definition")) return `${b.category}: ratio definition not linked`;
  if (b.missingInputs.some((m) => m.startsWith("ratio not in catalog"))) return `${b.category}: ratio term not in catalog`;
  if (b.missingInputs.includes("ratio definition arithmetic")) return `${b.category}: linked ratio definition not one numerator over one denominator`;
  if (b.missingInputs.some((m) => m.startsWith("ratio operand"))) return `${b.category}: linked ratio operand unbound (${why(b.missingInputs.find((m) => m.startsWith("ratio operand"))!.replace(/^ratio operand: ?/, ""))})`;
  if (b.missingInputs.includes("ratio threshold")) return `${b.category}: ratio computed, threshold not stated once`;
  if (/not a closed sum/.test(n)) return `${b.category}: builder components not a closed sum`;
  if (/builder component is unbound/.test(n)) return `${b.category}: builder metric unbound (${why(b.missingInputs[0] ?? "")})`;
  if (b.missingInputs.includes("no cap stated in clause")) return `${b.category}: no cap stated`;
  return `${b.category}: ${n.slice(0, 70) || b.missingInputs.slice(0, 2).join(",")}`;
}

const usageB: Record<string, number> = {}; const usageOut: unknown[] = [];
async function main() {
  const tally = { headroom: {} as Record<string, number>, docs: 0, baskets: { COMPUTED: 0, AT_LEAST: 0, AT_MOST: 0, NEEDS_INPUT: 0 } as Record<string, number>, ratios: { COMPUTED: 0, AT_LEAST: 0, AT_MOST: 0, NEEDS_INPUT: 0 } as Record<string, number> };
  const buckets: Record<string, number> = {}, rbuckets: Record<string, number> = {};
  const samples: Record<string, string[]> = {};
  const computed: unknown[] = [];
  const ratiosOut: unknown[] = [];
  const finCache = new Map<string, IssuerFinancials | null>();
  const [si, sn] = (process.env.DIAG_SHARD ?? "0/1").split("/").map(Number) as [number, number];
  for (const d of docs.slice(0, limit).filter((_, i) => i % sn === si)) {
    const fin = d.cik ? (finCache.has(d.cik) ? finCache.get(d.cik)! : (finCache.set(d.cik, await financials(d.cik)), finCache.get(d.cik)!)) : null;
    let r;
    try { r = runAgreementPipeline({ sourceId: d.id, text: d.text(), issuerCik: d.cik, financials: fin, facilityFacts: d.cik ? await latestInstanceFacts(d.cik, TEST_DATE, `${cacheDir}/instances`) : null }); } catch { continue; }
    tally.docs++;
    for (const h of r.headroom) if (h.kind === "BASKET") { const k = h.status === "COMPUTED" ? "COMPUTED" : (h.missing[0] ?? "").replace(/"[^"]*"/g, '"…"').replace(/: .*;.*/, "").slice(0, 70); usageB[k] = (usageB[k] ?? 0) + 1; if (h.status === "COMPUTED") usageOut.push({ doc: d.id, ...h }); }
    const bound = new Map((r.xbrl?.bounds ?? []).map((x) => [x.stableKey, x.kind]));
    const why = (name: string) => { const dec = r.xbrl?.decisions.find((x) => x.metricName === name); return !fin ? "no XBRL financials" : !dec ? `not a filing family: ${name.slice(0, 40)}` : dec.reason.replace(/:.*/, "").slice(0, 60); };
    for (const b of r.computedBaskets) {
      if (b.capStatus === "COMPUTED") { const k = b.capBound ?? bound.get(b.stableKey) ?? "COMPUTED"; tally.baskets[k]!++; if (b.category !== "FIXED_DOLLAR") computed.push({ doc: d.id, set: d.set, key: b.stableKey, cat: b.category, cap: b.capCanonical, cur: b.capCurrency, bound: k, missing: b.missingInputs, why: b.missingInputs.slice(0, 2).map(why), excerpt: b.citationExcerpt.slice(0, 300) }); continue; }
      tally.baskets.NEEDS_INPUT!++;
      const k = basketBucket(b, why);
      buckets[k] = (buckets[k] ?? 0) + 1;
      (samples[k] ??= []).length < 6 && samples[k]!.push(`${d.id} ${b.sectionRef} | ${b.citationExcerpt.replace(/\s+/g, " ").slice(0, 260)}`);
    }
    for (const x of r.computedRatios) {
      if (x.status === "UNKNOWN") continue; // not named in the document
      if (x.status === "COMPUTED") {
        const rb = bound.get(x.stableKey) as "AT_LEAST" | "AT_MOST" | undefined;
        tally.ratios[rb ?? "COMPUTED"]!++;
        const ops = (xs: typeof x.numerator) => xs.map((n) => `${n.metricName}=${n.canonical} [${n.sourceDocumentId} ${n.citationExcerpt.slice(0, 160)}]`);
        ratiosOut.push({ doc: d.id, set: d.set, key: x.stableKey, name: x.displayName, value: x.canonical, bound: rb ?? "EXACT", numerator: ops(x.numerator), denominator: ops(x.denominator), definition: (x.definitionExcerpt ?? "").slice(0, 400),
          headroom: x.thresholds.map((t) => ({ section: t.sectionRef, limit: t.canonical, direction: t.direction, headroom: t.headroomCanonical, label: headroomBound(rb, t.direction), clause: t.citationExcerpt.replace(/\s+/g, " ").slice(0, 200) })) });
        for (const t of x.thresholds) if (t.headroomStatus === "COMPUTED") tally.headroom[headroomBound(rb, t.direction)] = (tally.headroom[headroomBound(rb, t.direction)] ?? 0) + 1;
        continue;
      }
      tally.ratios.NEEDS_INPUT!++;
      const k = `${x.ratioKey}: ${x.missingInputs.includes("contract definition") ? "named, ratio-of definition not linked" : x.missingInputs.includes("definition arithmetic") ? "definition not one numerator over one denominator" : `operand unbound (${x.missingInputs.map(why).join("; ").slice(0, 80)})`}`;
      const g = k.replace(/^[A-Z_]+: /, "");
      rbuckets[g] = (rbuckets[g] ?? 0) + 1;
      (samples[`ratio: ${g}`] ??= []).length < 6 && samples[`ratio: ${g}`]!.push(`${d.id} ${x.displayName} | ${(x.definitionExcerpt ?? x.note).slice(0, 200)}`);
    }
  }
  const sort = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  writeFileSync(out, JSON.stringify({ testDate: TEST_DATE, cikResolved, usageB, usageOut, tally, basketBuckets: sort(buckets), ratioBuckets: sort(rbuckets), samples, computed, ratios: ratiosOut }, null, 1));
  console.log(JSON.stringify({ tally, basketBuckets: Object.fromEntries(Object.entries(sort(buckets)).slice(0, 25)), ratioBuckets: sort(rbuckets) }, null, 1));
}
main().catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
