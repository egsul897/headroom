/**
 * Merge --shard=i/n scoreboard reports into one identity-bound report (same as an unsharded run):
 * perSource rows are concatenated and re-aggregated with the shards' common ruleset identity and scorer
 * config. Refuses shards that disagree on ruleset, scorer config or snapshot identity, that overlap, or that miss
 * a shard index or any snapshot source; the merged snapshot hash must equal the recorded full-snapshot hash.
 *   npx tsx scripts/covenant-learning-factory/scoreboard/merge-shards.ts OUT.json SHARD0.json SHARD1.json ...
 * No AI / LLM calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { aggregate, verifyShardSet, type ScoreboardReport } from "../../../lib/covenant-learning-factory/scoreboard";

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) throw new Error("usage: merge-shards.ts OUT.json SHARD.json...");
const reports = inputs.map((p) => JSON.parse(readFileSync(p, "utf8")) as ScoreboardReport);
// Refuses mismatched identities, missing or duplicated shard indexes, sources in two shards, and missing sources.
const info = verifyShardSet(reports);
const perSource = reports.flatMap((r) => r.perSource);
const r0 = reports[0]!;
const merged = aggregate(perSource, { mode: r0.mode, rulesetVersion: r0.rulesetVersion, rulesetSha256: r0.identity?.rulesetSha256, scorerConfig: r0.identity?.scorerConfig ?? null });
if (merged.identity?.snapshotSha256 !== info.snapshotSha256) throw new Error(`merged snapshot identity ${merged.identity?.snapshotSha256 ?? "NONE"} != recorded full snapshot ${info.snapshotSha256}`);
writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
console.log(JSON.stringify({ out, sources: perSource.length, snapshotSha256: merged.identity?.snapshotSha256 ?? null, totals: merged.totals }));
