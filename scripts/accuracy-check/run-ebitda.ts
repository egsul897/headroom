#!/usr/bin/env tsx
// @ts-nocheck -- this harness targets the #398 API (financials / xbrl / computedRatios); it is typechecked on #398, not on release-1.
/**
 * Independent accuracy check — MEASUREMENT-ONLY. Runs the #398 agreement pipeline WITH the issuer's SEC XBRL
 * companyfacts (read-only fetch, cached) so the EBITDA optimizer / add-back tracker / ratio capacity are exercised
 * exactly as the product would. Must be executed from a checkout of cursor/clf-ebitda-optimizer (#398).
 *   SEC_EDGAR_USER_AGENT='Headroom accuracy-check <owner email>' npx tsx scripts/accuracy-check/run-ebitda.ts <docsDir> <manifest.json> <outDir>
 * No Neon, no AI, no engine changes. The sample must never be used for tuning.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";
import { runAgreementPipeline } from "../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
// Only present on #398 and descendants.
import { extractFinancials, fetchSecJson, companyFactsUrl, pad10, type CompanyFacts } from "../../lib/covenant-learning-factory/xbrl/companyfacts";

async function main() {
  const [docsDir, manifestPath, outDir] = process.argv.slice(2);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { sample: Array<{ id: string; cik: string }> };
  const cache = process.env.XBRL_CACHE ?? "/tmp/acc-xbrl-cache";
  mkdirSync(cache, { recursive: true }); mkdirSync(outDir, { recursive: true });
  const testDate = process.env.XBRL_TEST_DATE ?? "2026-10-17";
  for (const s of manifest.sample) {
    const f = join(docsDir, `${s.id}.htm`);
    if (!existsSync(f)) { console.log(s.id, "missing doc"); continue; }
    const cf0 = join(cache, `CIK${pad10(s.cik)}.json`);
    let cf: CompanyFacts | null = existsSync(cf0) ? JSON.parse(readFileSync(cf0, "utf8")) : null;
    if (!cf) { cf = await fetchSecJson<CompanyFacts>(companyFactsUrl(s.cik)); if (cf) writeFileSync(cf0, JSON.stringify(cf)); }
    const fin = cf ? extractFinancials(cf, pad10(s.cik), { asOf: testDate }) : null;
    const { text } = await extractTextAsync(readFileSync(f), `${s.id}.htm`);
    const r = runAgreementPipeline({ sourceId: `acc-${s.id}`, text, issuerCik: s.cik, financials: fin });
    const x = r.xbrl;
    writeFileSync(join(outDir, `${s.id}.json`), JSON.stringify({
      id: s.id, hasFacts: !!cf, financials: fin ? { asOf: fin.asOf, anchor: fin.anchor, values: fin.values, missing: fin.missing } : null,
      ebitda: x?.ebitda, ebitdaBaseHold: x?.ebitdaBaseHold, leverageCapacity: x?.leverageCapacity, ratioCapacity: x?.ratioCapacity,
      addBackTracker: x?.addBackTracker, computedRatios: r.computedRatios, headroom: r.headroom,
    }, (_k, v) => (typeof v === "bigint" ? String(v) : v), 1));
    console.log(s.id, "facts", !!cf, "ebitda", x?.ebitda?.status ?? "none", "addBacks", x?.ebitda?.addBacks.length ?? 0, "lev", x?.leverageCapacity ? "yes" : "no");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
