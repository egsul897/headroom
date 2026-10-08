/**
 * CLI: runs the offline acceptance suite over the corpus and writes
 *   docs/product-readiness/acceptance-runs/<headSha12>/report.json  (machine-readable)
 *   docs/product-readiness/acceptance-runs/<headSha12>/summary.md   (human summary)
 * Usage: npx tsx scripts/product-acceptance/run-all.ts [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { runAll } from "./runner";
import { renderSummary } from "./summary";

(async () => {
  const report = await runAll();
  const outArg = process.argv.indexOf("--out");
  const dir = outArg >= 0 ? path.resolve(process.argv[outArg + 1]!) : path.resolve(__dirname, "../../docs/product-readiness/acceptance-runs", report.repository.headSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "summary.md"), renderSummary(report));
  console.log(`wrote ${dir}`);
  console.log(`checks ${report.totals.checks}: pass ${report.totals.pass}, fail ${report.totals.fail}, not tested ${report.totals.notTested}; findings ${report.totals.findings} ${JSON.stringify(report.totals.findingsBySeverity)} ${JSON.stringify(report.totals.findingsByOutcome)}`);
  for (const p of report.packages) console.log(`  ${p.packageId}: ${p.summary.pass}/${p.summary.checks} pass, ${p.summary.fail} fail, ${p.summary.notTested} not tested; findings ${JSON.stringify(p.summary.findingsBySeverity)}`);
})().catch((e) => { console.error(e); process.exit(1); });
