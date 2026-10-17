#!/usr/bin/env node
/**
 * Compare two vitest JSON reports for the PR gate.
 *
 * The baseline is whatever report the workflow just produced by running
 * the suite on the base tip. This file does not contain a failure list,
 * and it does not skip, delete, or loosen tests.
 *
 * The gate fails when:
 *   - a test fails on the PR and did not fail on the base (new regression,
 *     including a test the base does not have)
 *   - a test that failed on the base is skipped or absent on the PR
 *     (a failure hidden by skip or deletion)
 *
 * Tests that fail on both sides are pre-existing. They are printed in
 * full and do not by themselves fail the gate.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CAUSE_ORDER = [
  "needs_db_or_env",
  "stale_prisma_client",
  "snapshot_drift",
  "timeout",
  "assertion_regression",
  "unspecified",
];

export function classifyFailure(message) {
  const msg = message || "";
  if (!msg.trim()) return "unspecified";
  if (
    /PrismaClientInitializationError|You must provide a nonempty URL|DATABASE_URL resolved to an empty string|Error validating datasource `db`|Can't reach database server|ECONNREFUSED|ENOTFOUND/.test(
      msg,
    )
  ) {
    return "needs_db_or_env";
  }
  if (/Invalid URL/.test(msg) && /ephemeral-db|baseDatabaseUrl|DATABASE_URL/.test(msg)) return "needs_db_or_env";
  const missing = msg.match(/ENOENT: no such file or directory, open '([^']+)'/);
  if (missing && isOutsideRepo(missing[1])) return "needs_db_or_env";
  if (/prisma generate|did not initialize yet|@prisma\/client did not initialize/i.test(msg)) {
    return "stale_prisma_client";
  }
  if (/toMatchInlineSnapshot|toMatchSnapshot|Snapshots? .* mismatched|obsolete snapshot/i.test(msg)) {
    return "snapshot_drift";
  }
  if (/Test timed out in \d+ms/.test(msg)) return "timeout";
  return "assertion_regression";
}

function isOutsideRepo(filePath) {
  if (!path.isAbsolute(filePath)) return false;
  const norm = filePath.replaceAll("\\", "/");
  if (norm.startsWith("/tmp/") || norm.startsWith("/var/")) return true;
  if (norm.includes("/claude-0/")) return true;
  return false;
}

export function toRepoRelative(filePath) {
  const norm = filePath.replaceAll("\\", "/");
  const marker = "/tests/";
  const idx = norm.lastIndexOf(marker);
  if (idx >= 0) return norm.slice(idx + 1);
  return norm;
}

function oneLine(message, max = 240) {
  const line = (message || "").replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return line.slice(0, max - 1) + "…";
}

function indexReport(report) {
  const map = new Map();
  for (const file of report.testResults || []) {
    const rel = toRepoRelative(file.name || "<unknown>");
    const assertions = file.assertionResults || [];
    let sawAssertionFailure = false;
    for (const test of assertions) {
      const fullName = test.fullName || test.title || "<unnamed>";
      const id = rel + "\n" + fullName;
      const status = test.status || "unknown";
      const message = (test.failureMessages || []).join("\n");
      const rec = { id, file: rel, fullName, status, message };
      const prev = map.get(id);
      if (!prev || (status === "failed" && prev.status !== "failed")) map.set(id, rec);
      if (status === "failed") sawAssertionFailure = true;
    }
    if (!sawAssertionFailure && file.status === "failed") {
      const id = rel + "\n<suite>";
      map.set(id, {
        id,
        file: rel,
        fullName: "<suite failed to load>",
        status: "failed",
        message: file.message || "",
      });
    }
  }
  return map;
}

function rowFrom(rec) {
  return {
    file: rec.file,
    fullName: rec.fullName,
    cause: classifyFailure(rec.message),
    detail: oneLine(rec.message),
  };
}

/** True when `file` has at least one test on this run and every one of them passed (none skipped/todo/failed). */
function suiteNowPasses(index, file) {
  let n = 0;
  for (const rec of index.values()) {
    if (rec.file !== file) continue;
    if (rec.status !== "passed") return false;
    n++;
  }
  return n > 0;
}

export function compareRuns(baseReport, headReport) {
  const base = indexReport(baseReport);
  const head = indexReport(headReport);
  const preExisting = [];
  const regressions = [];
  const fixed = [];
  const suppressed = [];
  const ids = new Set([...base.keys(), ...head.keys()]);
  for (const id of ids) {
    const b = base.get(id);
    const h = head.get(id);
    const baseFailed = b?.status === "failed";
    const headFailed = h?.status === "failed";
    if (baseFailed && headFailed) {
      preExisting.push(rowFrom(h));
    } else if (headFailed) {
      regressions.push(rowFrom(h));
    } else if (baseFailed && h?.status === "passed") {
      fixed.push(rowFrom(b));
    } else if (baseFailed && !h && id.endsWith("\n<suite>") && suiteNowPasses(head, b.file)) {
      // The file failed to load on the base; on the PR it loads and EVERY test in it passed (at least one).
      fixed.push({ ...rowFrom(b), detail: "suite loads on PR; all its tests passed" });
    } else if (baseFailed) {
      suppressed.push({
        file: b.file,
        fullName: b.fullName,
        cause: classifyFailure(b.message),
        detail: h ? "status on PR: " + h.status : "absent on PR",
      });
    }
  }
  const byName = (a, c) => a.file.localeCompare(c.file) || a.fullName.localeCompare(c.fullName);
  preExisting.sort(byName);
  regressions.sort(byName);
  fixed.sort(byName);
  suppressed.sort(byName);
  return {
    preExisting,
    regressions,
    fixed,
    suppressed,
    fail: regressions.length > 0 || suppressed.length > 0,
  };
}

function countCauses(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.cause, (counts.get(row.cause) || 0) + 1);
  return counts;
}

export function renderReport(result, labels = {}) {
  const lines = [];
  lines.push("# pr-gate");
  lines.push("");
  lines.push("Baseline regenerated in this job from the base tip. Not a committed manifest.");
  if (labels.base) lines.push("Base: " + labels.base);
  if (labels.head) lines.push("Head: " + labels.head);
  lines.push("");
  lines.push("New regressions: " + result.regressions.length);
  lines.push("Pre-existing base failures: " + result.preExisting.length);
  lines.push("Base failures skipped or deleted on the PR: " + result.suppressed.length);
  lines.push("Fixed since base: " + result.fixed.length);
  lines.push("");
  const causes = countCauses(result.preExisting);
  lines.push("## Pre-existing failures by cause");
  lines.push("");
  for (const cause of CAUSE_ORDER) {
    lines.push("- " + cause + ": " + (causes.get(cause) || 0));
  }
  for (const [cause, n] of causes) {
    if (!CAUSE_ORDER.includes(cause)) lines.push("- " + cause + ": " + n);
  }
  lines.push("");
  lines.push("## New regressions");
  lines.push("");
  if (result.regressions.length === 0) lines.push("None.");
  for (const row of result.regressions) {
    lines.push("- `" + row.file + "` — " + row.fullName);
    if (row.detail) lines.push("  - " + row.detail);
  }
  lines.push("");
  lines.push("## Base failures skipped or deleted on the PR");
  lines.push("");
  if (result.suppressed.length === 0) lines.push("None.");
  for (const row of result.suppressed) {
    lines.push("- `" + row.file + "` — " + row.fullName + " (" + row.detail + ")");
  }
  lines.push("");
  lines.push("## Fixed since base");
  lines.push("");
  if (result.fixed.length === 0) lines.push("None.");
  for (const row of result.fixed) {
    lines.push("- `" + row.file + "` — " + row.fullName);
  }
  lines.push("");
  lines.push("## Pre-existing base failures");
  lines.push("");
  if (result.preExisting.length === 0) lines.push("None.");
  for (const row of result.preExisting) {
    lines.push("- `" + row.cause + "` `" + row.file + "` — " + row.fullName);
    if (row.detail) lines.push("  - " + row.detail);
  }
  lines.push("");
  return lines.join("\n");
}

function readReport(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function main() {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      console.error("usage: pr-gate-compare.mjs --base <json> --head <json> [--base-label s] [--head-label s]");
      process.exit(2);
    }
    opt[key.slice(2)] = value;
  }
  if (!opt.base || !opt.head) {
    console.error("missing --base or --head");
    process.exit(2);
  }
  const result = compareRuns(readReport(opt.base), readReport(opt.head));
  const text = renderReport(result, { base: opt["base-label"], head: opt["head-label"] });
  console.log(text);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, text + "\n");
  for (const row of result.regressions) {
    console.log("::error::new regression: " + row.file + " :: " + row.fullName);
  }
  for (const row of result.suppressed) {
    console.log("::error::base failure hidden on PR: " + row.file + " :: " + row.fullName + " (" + row.detail + ")");
  }
  for (const row of result.preExisting) {
    console.log("::warning::pre-existing " + row.cause + ": " + row.file + " :: " + row.fullName);
  }
  console.log(
    "pr-gate regressions=" +
      result.regressions.length +
      " preexisting=" +
      result.preExisting.length +
      " suppressed=" +
      result.suppressed.length +
      " fixed=" +
      result.fixed.length,
  );
  process.exit(result.fail ? 1 : 0);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main();
