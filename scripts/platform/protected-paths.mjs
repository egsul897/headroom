#!/usr/bin/env node
/**
 * PR-gate protected-path check.
 *
 * Fails when a PR adds, modifies, deletes or renames any path whose name marks it as
 * frozen evidence (held-out / blind sets, sealed baselines, FROZEN fixtures, ground truth, CLF unit dumps),
 * unless the PR carries the explicit owner label OWNER_LABEL.
 *
 * What is protected (case-insensitive, "/" separators):
 *  1. PROTECTED_PATHS: an explicit list of evidence locations whose names carry no token
 *     (certified test corpus, stratified-certification pins, the scoreboard's data files).
 *     An entry ending in "/" protects everything under it; otherwise it is an exact file.
 *  2. Token rules. Tokens: held-out / holdout / frozen / ground-truth / baseline(s) / sealed /
 *     unit-dump(s), delimited by "/", "_", "-", "." or the string ends; "blind" matches anywhere.
 *     - any DIRECTORY segment carrying a token protects every file under it;
 *     - a FILE whose name carries a token is protected, unless it is source code
 *       (SOURCE_EXTENSIONS). Such source files are not frozen evidence (a script named
 *       *-baseline.ts computes, it is not the recorded output), so they are listed as a
 *       warning instead. Any other extension (data, docs, archives, unknown) is protected:
 *       the check fails closed on what it does not recognise as source.
 * Renames contribute both the old and the new path, so moving or deleting a protected file fails.
 *
 * CLI:  node protected-paths.mjs --base <ref> [--head <ref>]
 *       labels come from env PR_LABELS (JSON array of names, as from toJSON(...labels.*.name)).
 * Exit: 0 ok, 1 protected change without label, 2 usage / git error.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const OWNER_LABEL = "owner-approved-protected-paths";

/** Token rule (see header). Applied to directory segments and to file names. */
export const PROTECTED_TOKEN =
  /(?:(?:^|[/_.\-])(?:held[-_]?out|hold[-_]?out|frozen|ground[-_]?truth|baselines?|sealed|unit[-_]?dumps?)(?=[/_.\-]|$))|blind/i;

/** Kept for callers of the old export: the token rule as a single regex. */
export const PROTECTED_PATTERN = PROTECTED_TOKEN;

/** Explicit evidence locations that carry no token in their name. "dir/" = everything under it. */
export const PROTECTED_PATHS = Object.freeze([
  "tests/contract-model/certified/",
  "docs/phase-3-reliability-stratified-certification/",
  "scripts/covenant-learning-factory/scoreboard/baseline.json",
  "scripts/covenant-learning-factory/scoreboard/baseline-history.json",
  "scripts/covenant-learning-factory/scoreboard/baselines/",
  "scripts/covenant-learning-factory/scoreboard/snapshot.json.gz",
  "scripts/covenant-learning-factory/scoreboard/ruleset.json",
  "scripts/covenant-learning-factory/scoreboard/fresh-tunable.txt",
  "scripts/covenant-learning-factory/scoreboard/fresh-heldout.json",
  "scripts/covenant-learning-factory/scoreboard/heldout-membership.json",
  "scripts/covenant-learning-factory/scoreboard/sealed-heldout.json",
  "scripts/covenant-learning-factory/scoreboard/dev-manifest.json",
  "scripts/covenant-learning-factory/scoreboard/text-verified.json",
  "scripts/covenant-learning-factory/scoreboard/benchmark-migrations.json",
]);

/** Extensions treated as source code for the file-name token rule. */
export const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".sh", ".py", ".sql", ".prisma"]);

/** @param {string} file */
function normalise(file) {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Classify one path. "protected": frozen evidence. "warn": source file whose name carries a token.
 * "ok": neither.
 * @param {string} file
 * @returns {{ status: "protected" | "warn" | "ok", reason: string }}
 */
export function classifyPath(file) {
  const p = normalise(file);
  const lower = p.toLowerCase();
  for (const entry of PROTECTED_PATHS) {
    const e = entry.toLowerCase();
    if (e.endsWith("/") ? lower.startsWith(e) : lower === e) return { status: "protected", reason: `listed: ${entry}` };
  }
  const segments = p.split("/");
  const name = segments.pop() ?? "";
  const dir = segments.find((s) => PROTECTED_TOKEN.test(s));
  if (dir !== undefined) return { status: "protected", reason: `directory "${dir}/"` };
  if (PROTECTED_TOKEN.test(name)) {
    const lowerName = name.toLowerCase();
    const isSource = SOURCE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    return isSource
      ? { status: "warn", reason: "source file whose name carries a protected token" }
      : { status: "protected", reason: `file name "${name}"` };
  }
  return { status: "ok", reason: "" };
}

/** @param {string} file */
export function isProtectedPath(file) {
  return classifyPath(file).status === "protected";
}

/**
 * @param {readonly string[]} changedPaths
 * @param {readonly string[]} labels
 */
export function checkProtectedPaths(changedPaths, labels) {
  const unique = [...new Set(changedPaths.filter(Boolean))].sort();
  const protectedChanged = unique.filter((p) => classifyPath(p).status === "protected");
  const warnings = unique.filter((p) => classifyPath(p).status === "warn");
  const approved = labels.includes(OWNER_LABEL);
  return { ok: protectedChanged.length === 0 || approved, approved, protectedChanged, warnings };
}

/** @param {string | undefined} raw */
export function parseLabels(raw) {
  if (!raw || !raw.trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("PR_LABELS must be a JSON array");
  return parsed.map((l) => (typeof l === "string" ? l : String(l?.name ?? ""))).filter(Boolean);
}

/** Every path touched between base and head; renames contribute both sides (--no-renames). */
export function changedPathsBetween(base, head = "HEAD", cwd = process.cwd()) {
  const out = execFileSync("git", ["diff", "--name-only", "--no-renames", `${base}...${head}`], { cwd, encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const base = get("--base");
  const head = get("--head") ?? "HEAD";
  if (!base) {
    console.error("usage: protected-paths.mjs --base <ref> [--head <ref>]");
    process.exit(2);
  }
  let result;
  try {
    result = checkProtectedPaths(changedPathsBetween(base, head), parseLabels(process.env.PR_LABELS));
  } catch (err) {
    console.error(`protected-path check could not run: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  if (result.warnings.length > 0) {
    console.log(`warning: source files whose names mention a protected token changed (${result.warnings.length}); not frozen evidence, review that they do not alter recorded outputs:`);
    for (const p of result.warnings) console.log(`  ${p}`);
    if (process.env.GITHUB_ACTIONS) for (const p of result.warnings) console.log(`::warning file=${p}::source file name mentions a protected token; not blocked, review its outputs`);
  }
  if (result.protectedChanged.length === 0) {
    console.log("protected-path check: no held-out / blind / baseline / frozen / ground-truth paths changed");
    return;
  }
  console.log(`protected paths changed (${result.protectedChanged.length}):`);
  for (const p of result.protectedChanged) console.log(`  ${p}  (${classifyPath(p).reason})`);
  if (result.approved) {
    console.log(`label "${OWNER_LABEL}" present: allowed by explicit owner approval`);
    return;
  }
  console.error(`FAIL: these paths are frozen evidence. An owner must add the label "${OWNER_LABEL}" to allow this PR.`);
  process.exit(1);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main();
