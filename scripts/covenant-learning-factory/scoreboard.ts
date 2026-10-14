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
 *   --rules=v0             extractor-only: empty learned ruleset (v0)
 *   --write-findings=PATH  candidate-level JSONL: one row per scored error (class, candidateId, family, excerpt)
 *   --write-rules=PATH     write the ruleset actually used (pin it for offline replay)
 *
 * Deterministic. Zero AI / LLM calls. Never prints the connection string.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregate,
  compareToBaseline,
  readSnapshot,
  scoreSource,
  splitFor,
  writeSnapshotBuffer,
  type DevManifest,
  type ScoreboardReport,
  type ScoreboardSourceInput,
  type SourceScore,
} from "../../lib/covenant-learning-factory/scoreboard";
import { loadLatestLearnedRules } from "../../lib/covenant-learning-factory/learned-rules/load";
import { normalizeLearnedRuleSet } from "../../lib/covenant-learning-factory/learned-rules/types";

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

function printSummary(report: ScoreboardReport): void {
  for (const split of ["DEV", "HELDOUT"] as const) {
    const t = report.totals[split];
    console.log(
      `${split.padEnd(8)} sources=${t.sources} total=${t.total} COVERAGE_GAP=${t.COVERAGE_GAP} DISCOVERY_GAP=${t.DISCOVERY_GAP} UNSUPPORTED_SEMANTICS=${t.UNSUPPORTED_SEMANTICS}`,
    );
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
    rules = emptyRuleSet(0);
  }
  if (argStr("rules") === "neon") {
    if (!neon) {
      console.error("--rules=neon requires --neon");
      process.exit(2);
    }
    rules = await loadLiveRulesReadOnly();
  }
  console.log(`ruleset v${rules.rulesetVersion} (${rules.rules.length} rules)`);
  const writeRules = argStr("write-rules");
  if (writeRules) writeFileSync(writeRules, JSON.stringify(rules, null, 2) + "\n");

  const perSource: SourceScore[] = [];
  if (snapshotPath) {
    const snap = readSnapshot(resolve(snapshotPath));
    for (const input of snap.sources) perSource.push(scoreSource(input, rules, manifest));
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
      const s = scoreSource(input, rules, manifest);
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
  const report = aggregate(perSource, { mode: neon ? "neon" : "snapshot", rulesetVersion: rules.rulesetVersion });
  printSummary(report);
  const out = argStr("write-report");
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  const baselinePath = argStr("baseline");
  if (baselinePath) {
    const baseline = JSON.parse(readFileSync(resolve(baselinePath), "utf8")) as ScoreboardReport;
    const gate = compareToBaseline(baseline, report);
    console.log(JSON.stringify({ event: "clf.scoreboard.gate", pass: gate.pass, reasons: gate.reasons, heldout: [gate.heldoutBefore, gate.heldoutAfter], dev: [gate.devBefore, gate.devAfter], byClass: gate.byClass }, null, 2));
    for (const d of gate.deltas.slice(0, 40)) console.log(`  Δ ${d.delta > 0 ? "+" : ""}${d.delta} ${d.split} ${d.sourceId} ${JSON.stringify(d.byClass)}`);
    if (!gate.pass) process.exit(1);
  }
}

main().catch((err) => {
  console.error("clf:scoreboard failed:", redact(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
