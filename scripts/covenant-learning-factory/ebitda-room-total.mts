// Corpus cap-room total via the canonical capRoomTotal (addback-tracker). Usage:
//   npx tsx scripts/covenant-learning-factory/ebitda-room-total.mts <docsDir> <xbrlCacheDir> [listFile]
import { readFileSync, existsSync } from "node:fs";
import { findEbitdaMeasureTerm } from "../../lib/covenant-learning-factory/xbrl/definition-items";
import { optimizeConsolidatedEbitda } from "../../lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { extractFinancials } from "../../lib/covenant-learning-factory/xbrl/companyfacts";
import { capRoomTotal, priorAsOf, trackAddBacks } from "../../lib/covenant-learning-factory/xbrl/addback-tracker";

const [docs, cache, listFile = "scripts/covenant-learning-factory/scoreboard/fresh-tunable.txt"] = process.argv.slice(2);
if (!docs || !cache) throw new Error("usage: ebitda-room-total.mts <docsDir> <xbrlCacheDir> [listFile]");
let total = 0n, docsN = 0;
for (const f of readFileSync(listFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)) {
  const p = `${docs}/${f}`, c = `${cache}/CIK${f.split("_")[0]!.padStart(10, "0")}.json`;
  if (!existsSync(p) || !existsSync(c)) continue;
  const cf = JSON.parse(readFileSync(c, "utf8")); if (!cf?.facts) continue;
  const text = readFileSync(p, "utf8"); const term = findEbitdaMeasureTerm(text); if (!term) continue;
  const cik = f.split("_")[0]!.padStart(10, "0"); const fin = extractFinancials(cf, cik); const pa = priorAsOf(fin.anchor);
  const r = capRoomTotal(trackAddBacks(optimizeConsolidatedEbitda(term, text, fin), fin, pa ? extractFinancials(cf, cik, { asOf: pa }) : null));
  docsN++; total += r;
}
console.log(JSON.stringify({ docs: docsN, capRoomTotal: total.toString() }));
