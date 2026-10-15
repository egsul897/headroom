#!/usr/bin/env tsx
/**
 * npm run clf:scoreboard — sweep self-check scoreboard + HELDOUT regression gate.
 *
 * Modes (exactly one):
 *   --neon                 live read-only over every knowledge_sources row
 *                          (requires DATABASE_URL + NEON_TRANSPORT=https; no writes)
 *   --snapshot=PATH        offline over a captured input snapshot (.json or .json.gz)
 *
 * Options:
 *   --baseline=PATH        compare against a baseline report; exit 1 when HELDOUT errors rise
 *   --write-report=PATH    write the full report JSON
 *   --write-snapshot=PATH  (neon mode) also capture the inputs for offline replay
 *   --only=dev|heldout     (snapshot capture) restrict captured sources
 *   --manifest=PATH        DEV manifest (default scripts/covenant-learning-factory/scoreboard/dev-manifest.json)
 *   --progress=PATH        (neon mode) append-only per-source progress (resumes on rerun)
 *   --rules=neon           (neon mode) score with the LIVE latest learning_rulesets row (read-only SELECT)
 *   --rules-file=PATH      score with a pinned ruleset JSON (CI uses the committed scoreboard/ruleset.json)
 *   --shard=i/n            (snapshot mode) score only every n-th source starting at i; merge reports after
 *   --rules=v0             extractor-only: empty learned ruleset (v0)
 *   --write-findings=PATH  candidate-level JSONL: one row per scored error (class, candidateId, family, excerpt)
 *   --write-rules=PATH     write the ruleset actually used (pin it for offline replay)
 *   --relabels=PATH        apply the append-only reference-label corrections log (opt-in; bound into scorer config)
 *
 * Benchmark integrity (applies whenever --baseline is given; see docs/clf-scoreboard/README.md):
 *   --history=PATH         append-only baseline history (default scoreboard/baseline-history.json);
 *                          baseline must equal its latest entry; thresholds come from it
 *   --history-base=PATH    the base branch's history: must be an unchanged prefix (CI passes this)
 *   --membership=PATH      frozen HELDOUT membership (default scoreboard/heldout-membership.json)
 *   --migrations=PATH      committed benchmark migrations (default scoreboard/benchmark-migrations.json)
 *   Exit 1 = gate failed, exit 3 = incomparable evaluations (different snapshot / source hashes / ruleset).
 *
 * Deterministic. Zero AI / LLM calls. Never prints the connection string.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregate,
  compareToBaseline,
  IncomparableEvaluationError,
  rulesetIdentity,
  verifyHistory,
  type BaselineHistory,
  type BenchmarkMembership,
  type BenchmarkMigration,
  readSnapshot,
  scoreSource,
  snapshotIdentitySha256,
  sourceInputSha256,
  type ShardInfo,
  splitFor,
  writeSnapshotBuffer,
  type DevManifest,
  type ScoreboardReport,
  type ScoreboardSourceInput,
  type SourceScore,
} from "../../lib/covenant-learning-factory/scoreboard";
import { loadLatestLearnedRules } from "../../lib/covenant-learning-factory/learned-rules/load";
import { normalizeLearnedRuleSet } from "../../lib/covenant-learning-factory/learned-rules/types";
import { applyRelabels, indexRelabels, relabelLogSha256, type ReferenceRelabelLog } from "../../lib/covenant-learning-factory/scoreboard/reference-relabels";

/** --relabels=PATH (opt-in; committed log: scoreboard/reference-relabels.json). Off by default so the gate stays
 *  comparable to the recorded baseline; when on, the log sha is bound into the scorer config (a different evaluation). */
const relabelArg = process.argv.find((a) => a.startsWith("--relabels="))?.slice("--relabels=".length) ?? "none";
const relabelLog: ReferenceRelabelLog | null = relabelArg === "none" ? null : (JSON.parse(readFileSync(resolve(relabelArg), "utf8")) as ReferenceRelabelLog);
const relabelIdx = relabelLog ? indexRelabels(relabelLog) : null;
const relabel = (i: ScoreboardSourceInput): ScoreboardSourceInput => (relabelIdx ? applyRelabels(i, relabelIdx) : i);

/** Read-only: SELECT the latest ruleset. Never bootstraps / writes (unlike loadLatestRulesetFromNeon). */
async function loadLiveRulesReadOnly() {
  const { createNeonHttpsExecutor } = await import("../../lib/covenant-learning-factory/store/neon-transport");
  const ex = await createNeonHttpsExecutor(process.env.DATABASE_URL!);
  const rows = await ex.execute(`SELECT "payloadJson" FROM learning_rulesets ORDER BY "rulesetVersion" DESC LIMIT 1`, []);
  const payload = rows[0]?.payloadJson ?? (rows[0] as Record<string, unknown> | undefined)?.payloadjson;
  if (!payload) throw new Error("no learning_rulesets row in Neon (refusing to bootstrap: read-only)");
  return normalizeLearnedRuleSet((typeof payload === "string" ? JSON.parse(payload) : payload) as never);
}

function argStr(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (n: string) => process.argv.includes(`--${n}`);
const redact = (s: string) => s.replace(/postgres(ql)?:\/\/[^ "]+/g, "[URL]");

async function loadNeonInputs(onSource: (i: ScoreboardSourceInput) => Promise<void>, skip: Set<string>): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for --neon");
  const { createNeonHttpsExecutor, getNeonTransportMode } = await import(
    "../../lib/covenant-learning-factory/store/neon-transport"
  );
  if (getNeonTransportMode() !== "https") throw new Error("--neon requires NEON_TRANSPORT=https");
  const nl = await import("../../lib/covenant-learning-factory/sweep/neon-load");
  const ex = await createNeonHttpsExecutor(url);
  let after = "";
  for (;;) {
    const page = await nl.fetchKnowledgeSources(ex, { afterSourceId: after, limit: 25 });
    if (page.length === 0) break;
    for (const source of page) {
      after = source.sourceId;
      if (skip.has(source.sourceId)) continue;
      const [documentText, candidates, definitions, conditions] = await Promise.all([
        nl.fetchDocumentText(ex, source),
        nl.fetchCandidates(ex, source.sourceId),
        nl.fetchDefinitions(ex, source.sourceId),
        nl.fetchConditions(ex, source.sourceId),
      ]);
      await onSource({ source, documentText, candidates, definitions, conditions });
    }
  }
}

/** Scorer settings that change results; bound into the evaluation identity (tree on/off, tree mode). */
function scorerConfig(): string {
  const tree = process.env.CLF_SCOREBOARD_TREE === "0" ? "off" : "on";
  const mode = process.env.CLF_SCOREBOARD_TREE_MODE === "override" ? "override" : "agree";
  const base = tree === "off" ? "tree=off" : `tree=on;mode=${mode}`;
  return relabelLog && relabelLog.entries.length ? `${base};relabels=${relabelLogSha256(relabelLog).slice(0, 16)}` : base;
}

function printSummary(report: ScoreboardReport): void {
  for (const split of ["DEV", "HELDOUT"] as const) {
    const t = report.totals[split];
    console.log(
      `${split.padEnd(8)} sources=${t.sources} total=${t.total} COVERAGE_GAP=${t.COVERAGE_GAP} DISCOVERY_GAP=${t.DISCOVERY_GAP} UNSUPPORTED_SEMANTICS=${t.UNSUPPORTED_SEMANTICS}`,
    );
  }
  if (report.inScopeTotals) {
    for (const split of ["DEV", "HELDOUT"] as const) {
      const t = report.inScopeTotals[split];
      console.log(
        `IN-SCOPE ${split.padEnd(8)} sources=${t.sources} total=${t.total} COVERAGE_GAP=${t.COVERAGE_GAP} DISCOVERY_GAP=${t.DISCOVERY_GAP} UNSUPPORTED_SEMANTICS=${t.UNSUPPORTED_SEMANTICS}`,
      );
    }
    console.log(`EXCLUDED (doc type OTHER, still counted in the gate totals above): ${report.excluded?.length ?? 0}`);
    for (const e of report.excluded ?? []) console.log(`  excluded ${e.split} ${e.sourceId} errors=${e.total}`);
  }
}

async function main(): Promise<void> {
  const manifestPath = resolve(argStr("manifest") ?? "scripts/covenant-learning-factory/scoreboard/dev-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DevManifest;
  const rulesFile = argStr("rules-file");
  let rules = rulesFile
    ? normalizeLearnedRuleSet(JSON.parse(readFileSync(resolve(rulesFile), "utf8")))
    : loadLatestLearnedRules();
  const snapshotPath = argStr("snapshot");
  const neon = hasFlag("neon");
  if (Number(neon) + Number(Boolean(snapshotPath)) !== 1) {
    console.error("choose exactly one of --neon or --snapshot=PATH");
    process.exit(2);
  }

  if (argStr("rules") === "v0") {
    // Extractor-only: empty learned ruleset (no unverified learned rules inflate the numbers).
    const { emptyRuleSet } = await import("../../lib/covenant-learning-factory/learned-rules/types");
    // Fixed timestamp: the v0 identity hash must not depend on wall-clock time (it differed per shard).
    rules = { ...emptyRuleSet(0), updatedAt: "1970-01-01T00:00:00.000Z" };
  }
  if (argStr("rules") === "neon") {
    if (!neon) {
      console.error("--rules=neon requires --neon");
      process.exit(2);
    }
    rules = await loadLiveRulesReadOnly();
  }
  const TEXT_VERIFIED = new Set<string>((JSON.parse(readFileSync("scripts/covenant-learning-factory/scoreboard/text-verified.json", "utf8")) as { contentSha256: string[] }).contentSha256);
  console.log(`ruleset v${rules.rulesetVersion} (${rules.rules.length} rules)`);
  const writeRules = argStr("write-rules");
  if (writeRules) writeFileSync(writeRules, JSON.stringify(rules, null, 2) + "\n");

  const perSource: SourceScore[] = [];
  let shardInfo: ShardInfo | null = null;
  if (snapshotPath) {
    const snap = readSnapshot(resolve(snapshotPath));
    // --shard=i/n: score only sources with index % n === i (parallel offline replay; merge reports after).
    const shard = argStr("shard");
    const [si, sn] = shard ? shard.split("/").map(Number) : [0, 1];
    snap.sources.forEach((input, idx) => {
      if (idx % sn! === si) perSource.push(scoreSource(relabel(input), rules, manifest, TEXT_VERIFIED));
    });
    const pairs = snap.sources.map((input) => [input.source.sourceId, sourceInputSha256(relabel(input))] as const);
    shardInfo = { index: si!, count: sn!, snapshotSha256: snapshotIdentitySha256(pairs), snapshotSourceIds: pairs.map((p) => p[0]).sort() };
  } else {
    const progress = argStr("progress");
    const done = new Set<string>();
    if (progress && existsSync(progress)) {
      for (const line of readFileSync(progress, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const s = JSON.parse(line) as SourceScore;
        perSource.push(s);
        done.add(s.sourceId);
      }
      console.log(`resuming: ${done.size} sources already scored in ${progress}`);
    }
    const capture = argStr("write-snapshot");
    const only = argStr("only");
    const captured: ScoreboardSourceInput[] = [];
    await loadNeonInputs(async (input) => {
      const s = scoreSource(relabel(input), rules, manifest, TEXT_VERIFIED);
      perSource.push(s);
      if (progress) appendFileSync(progress, JSON.stringify({ ...s, findings: undefined }) + "\n");
      if (capture && (!only || only.toUpperCase() === s.split || (only === "dev" && s.split === "DEV"))) captured.push(input);
      if (perSource.length % 10 === 0) console.log(`scored ${perSource.length}`);
    }, done);
    if (capture) {
      writeFileSync(capture, writeSnapshotBuffer({ schema: "clf-scoreboard-snapshot/v1", capturedFrom: "neon:knowledge_sources", sources: captured }));
      console.log(`snapshot: ${captured.length} sources → ${capture}`);
    }
  }

  const findingsPath = argStr("write-findings");
  if (findingsPath) {
    const lines: string[] = [];
    for (const s of perSource) for (const f of s.findings ?? []) lines.push(JSON.stringify({ sourceId: s.sourceId, split: s.split, textBasis: s.textBasis, ...f }));
    writeFileSync(findingsPath, lines.join("\n") + "\n");
    console.log(`findings: ${lines.length} rows → ${findingsPath}`);
  }
  for (const s of perSource) delete s.findings;
  const rid = rulesetIdentity(rules);
  const report = aggregate(perSource, { mode: neon ? "neon" : "snapshot", rulesetVersion: rules.rulesetVersion, rulesetSha256: rid.rulesetSha256, scorerConfig: scorerConfig() });
  if (shardInfo) report.shard = shardInfo;
  printSummary(report);
  console.log(
    `identity: ruleset v${rid.rulesetVersion} sha256=${rid.rulesetSha256} snapshot=${report.identity?.snapshotSha256 ?? "NONE (missing per-source input hashes)"}`,
  );
  const out = argStr("write-report");
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  // --relabels gates against the relabels track (scoreboard/baseline-relabels.json = latest relabels history entry).
  const baselineArg = argStr("baseline");
  const baselinePath = baselineArg && relabelLog && baselineArg.endsWith("scoreboard/baseline.json")
    ? baselineArg.replace(/baseline\.json$/, "baseline-relabels.json")
    : baselineArg;
  if (baselinePath && baselinePath !== baselineArg) console.log(`--relabels: gating against ${baselinePath} (relabels track)`);
  if (baselinePath) {
    const baselineText = readFileSync(resolve(baselinePath));
    const baseline = JSON.parse(baselineText.toString("utf8")) as ScoreboardReport;
    const dir = "scripts/covenant-learning-factory/scoreboard";
    const readJson = <T>(p: string): T => JSON.parse(readFileSync(resolve(p), "utf8")) as T;
    const historyPath = argStr("history") ?? `${dir}/baseline-history.json`;
    const membershipPath = argStr("membership") ?? `${dir}/heldout-membership.json`;
    const migrationsPath = argStr("migrations") ?? `${dir}/benchmark-migrations.json`;
    const integrity: string[] = [];
    for (const p of [historyPath, membershipPath, migrationsPath]) if (!existsSync(resolve(p))) integrity.push(`required integrity file missing: ${p}`);
    if (integrity.length) {
      console.log(JSON.stringify({ event: "clf.scoreboard.gate", pass: false, reasons: integrity }, null, 2));
      process.exit(1);
    }
    const historyBase = argStr("history-base");
    const hist = verifyHistory(
      readJson<BaselineHistory>(historyPath),
      (rel) => (existsSync(resolve(rel)) ? readFileSync(resolve(rel)) : null),
      { baselineText, baseHistory: historyBase ? readJson<BaselineHistory>(historyBase) : null, track: relabelLog ? "relabels" : "default" },
    );
    let gate;
    try {
      gate = compareToBaseline(baseline, report, {
        membership: readJson<BenchmarkMembership>(membershipPath),
        migrations: readJson<{ migrations: BenchmarkMigration[] }>(migrationsPath).migrations ?? [],
        thresholds: hist.thresholds,
      });
    } catch (err) {
      if (err instanceof IncomparableEvaluationError) {
        console.log(JSON.stringify({ event: "clf.scoreboard.gate", pass: false, incomparable: err.problems }, null, 2));
        process.exit(3);
      }
      throw err;
    }
    if (hist.reasons.length) {
      gate.reasons.push(...hist.reasons);
      gate.pass = false;
    }
    console.log(JSON.stringify({ event: "clf.scoreboard.gate", pass: gate.pass, reasons: gate.reasons, thresholds: hist.thresholds, historyEntries: hist.latest?.seq ?? 0, heldout: [gate.heldoutBefore, gate.heldoutAfter], dev: [gate.devBefore, gate.devAfter], byClass: gate.byClass }, null, 2));
    for (const d of gate.deltas.slice(0, 40)) console.log(`  Δ ${d.delta > 0 ? "+" : ""}${d.delta} ${d.split} ${d.sourceId} ${JSON.stringify(d.byClass)}`);
    if (!gate.pass) process.exit(1);
  }
}

main().catch((err) => {
  console.error("clf:scoreboard failed:", redact(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
