/**
 * Compare two scoreboard reports per split and per source, restricted to the sources present in the
 * NEW report. Lists DEV regressions (any DEV source whose total rose).
 *   npx tsx scripts/covenant-learning-factory/scoreboard/compare-reports.ts BASE.json NEW.json [--allow-unbound-analysis]
 *
 * Comparisons are bound to the same input snapshot, source hashes, ruleset identity and scorer config
 * (integrity.ts). Reports without a matching identity (e.g. python-merged shard reports) are refused
 * (exit 3) unless --allow-unbound-analysis is given, in which case the output is labelled UNBOUND and is
 * analysis only, never a gate result. Note: comparing tree on vs off is by definition a different scorer
 * config, so that analysis always needs the flag.
 */
import { readFileSync } from "node:fs";
import { assertComparable, IncomparableEvaluationError, type EvaluationIdentity } from "../../../lib/covenant-learning-factory/scoreboard/integrity";

type S = { sourceId: string; split: string; duplicateOf?: string | null; total: number; counts: Record<string, number> };
type R = { identity?: EvaluationIdentity | null; perSource: S[] };
const args = process.argv.slice(2);
const allowUnbound = args.includes("--allow-unbound-analysis");
const [basePath, newPath] = args.filter((a) => !a.startsWith("--"));
const baseR = JSON.parse(readFileSync(basePath!, "utf8")) as R;
const nextR = JSON.parse(readFileSync(newPath!, "utf8")) as R;
let bound = true;
try {
  assertComparable(baseR, nextR);
} catch (err) {
  if (!(err instanceof IncomparableEvaluationError)) throw err;
  bound = false;
  if (!allowUnbound) {
    console.error(err.message);
    console.error("refusing to compare (pass --allow-unbound-analysis for a labelled, non-gating analysis)");
    process.exit(3);
  }
}
const load = (r: R) => new Map(r.perSource.map((s) => [s.sourceId, s]));
const base = load(baseR);
const next = load(nextR);
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
console.log(JSON.stringify({ comparison: bound ? "BOUND" : "UNBOUND (analysis only; not a gate result)", totals: tot, devRegressions: devReg }, null, 2));
