/**
 * Compare two scoreboard reports (or merged shard reports) per split and per source, restricted
 * to the sources present in the NEW report. Lists DEV regressions (any DEV source whose total rose).
 *   npx tsx scripts/covenant-learning-factory/scoreboard/compare-reports.ts BASE.json NEW.json
 */
import { readFileSync } from "node:fs";

type S = { sourceId: string; split: string; duplicateOf?: string | null; total: number; counts: Record<string, number> };
const load = (p: string) => new Map((JSON.parse(readFileSync(p, "utf8")).perSource as S[]).map((s) => [s.sourceId, s]));
const [basePath, newPath] = process.argv.slice(2);
const base = load(basePath!);
const next = load(newPath!);
const tot: Record<string, { before: number; after: number; byClass: Record<string, number> }> = {};
const devReg: [string, number, number][] = [];
for (const [id, s] of next) {
  if (s.duplicateOf) continue;
  const b = base.get(id);
  if (!b) continue;
  const t = (tot[s.split] ??= { before: 0, after: 0, byClass: {} });
  t.before += b.total;
  t.after += s.total;
  for (const c of Object.keys(s.counts)) t.byClass[c] = (t.byClass[c] ?? 0) + s.counts[c]! - (b.counts[c] ?? 0);
  if (s.split === "DEV" && s.total > b.total) devReg.push([id, b.total, s.total]);
}
console.log(JSON.stringify({ totals: tot, devRegressions: devReg }, null, 2));
