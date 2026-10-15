/**
 * Merge --shard=i/n scoreboard reports into one identity-bound report (same as an unsharded run):
 * perSource rows are concatenated and re-aggregated with the shards' common ruleset identity and scorer
 * config. Refuses shards that disagree on ruleset or scorer config, or that overlap / miss sources.
 *   npx tsx scripts/covenant-learning-factory/scoreboard/merge-shards.ts OUT.json SHARD0.json SHARD1.json ...
 * No AI / LLM calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { aggregate, type ScoreboardReport } from "../../../lib/covenant-learning-factory/scoreboard";

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) throw new Error("usage: merge-shards.ts OUT.json SHARD.json...");
const reports = inputs.map((p) => JSON.parse(readFileSync(p, "utf8")) as ScoreboardReport);
const ids = new Set(reports.map((r) => JSON.stringify([r.rulesetVersion, r.identity?.rulesetSha256 ?? null, r.identity?.scorerConfig ?? null, r.mode])));
if (ids.size !== 1) throw new Error(`shards disagree on ruleset/scorer identity: ${[...ids].join(" | ")}`);
const perSource = reports.flatMap((r) => r.perSource);
const seen = new Set<string>();
for (const s of perSource) {
  if (seen.has(s.sourceId)) throw new Error(`source scored in two shards: ${s.sourceId}`);
  seen.add(s.sourceId);
}
const r0 = reports[0]!;
const merged = aggregate(perSource, { mode: r0.mode, rulesetVersion: r0.rulesetVersion, rulesetSha256: r0.identity?.rulesetSha256, scorerConfig: r0.identity?.scorerConfig ?? null });
writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
console.log(JSON.stringify({ out, sources: perSource.length, snapshotSha256: merged.identity?.snapshotSha256 ?? null, totals: merged.totals }));
