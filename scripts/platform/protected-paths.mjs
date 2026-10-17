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
 *     - a FILE whose name carries a token is protected, whatever its extension (fixtures and
 *       oracles are often .ts: the unseen-packages human-ground-truth.ts fixtures are frozen evidence).
 *       The only exception is SOURCE_WARN_ALLOWLIST: exact paths of scripts under scripts/
 *       that only COMPUTE (their names mention a token but they are not recorded output).
 *       Those are listed as a warning instead. The list is deliberately explicit and starts
 *       empty; adding an entry is a change to this file, which the gate reads from the BASE
 *       ref, so a PR cannot allowlist itself. tests/ and docs/ entries are refused.
 * Renames contribute both the old and the new path, so moving or deleting a protected file fails.
 * A symlink added or changed by the PR is protected when its target is protected, is the repo
 * root or a directory containing evidence, or is absolute / escapes the repository (fail closed).
 * All git output is read NUL-separated (-z), so unusual characters in names cannot hide a path.
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
  // frozen evidence written as source: ground-truth fixtures, held-out oracles, recorded baselines
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth.ts",
  "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth.ts",
  "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/human-ground-truth.ts",
  "tests/fixtures/context-retrieval-benchmark/fwrg-context-ground-truth.ts",
  "tests/fixtures/context-retrieval-benchmark/lsb-context-ground-truth.ts",
  "tests/autonomous-financial-computation/held-out-oracles.test.ts",
  "tests/contract-model/semantic-compiler/phase-3b-baseline.ts",
]);

/**
 * Exact paths of computing scripts under scripts/ whose names carry a token but which are not
 * frozen evidence; a change to one is a warning, not a failure. Empty by default (fail closed).
 */
export const SOURCE_WARN_ALLOWLIST = Object.freeze([]);

/** Extensions treated as source code for the file-name token rule. */
export const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".sh", ".py", ".sql", ".prisma"]);

/** @param {string} file */
function normalise(file) {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Classify one path. "protected": frozen evidence. "warn": allowlisted computing script whose
 * name carries a token. "ok": neither.
 * @param {string} file
 * @param {{ warnAllowlist?: readonly string[] }} [opts]
 * @returns {{ status: "protected" | "warn" | "ok", reason: string }}
 */
export function classifyPath(file, opts = {}) {
  const warnAllowlist = opts.warnAllowlist ?? SOURCE_WARN_ALLOWLIST;
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
    const allowlisted =
      lower.startsWith("scripts/") &&
      SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext)) &&
      warnAllowlist.some((a) => normalise(a).toLowerCase() === lower);
    return allowlisted
      ? { status: "warn", reason: "allowlisted computing script whose name carries a protected token" }
      : { status: "protected", reason: `file name "${name}"` };
  }
  return { status: "ok", reason: "" };
}

/** @param {string} file */
export function isProtectedPath(file) {
  return classifyPath(file).status === "protected";
}

/**
 * Resolve a symlink's target (as stored in git) relative to the link. Returns null when the
 * target is absolute or escapes the repository root.
 * @param {string} link repo-relative path of the symlink
 * @param {string} target raw link text
 */
export function resolveLinkTarget(link, target) {
  const t = target.trim().replace(/\\/g, "/");
  if (!t || t.startsWith("/") || /^[A-Za-z]:/.test(t)) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(normalise(link)), t));
  if (resolved === ".." || resolved.startsWith("../")) return null;
  return resolved;
}

/**
 * A symlink is protected when its resolved target (file, or anything under it if it names a
 * directory) is protected, or when the target cannot be resolved inside the repo.
 * @param {{ link: string; target: string }} s
 */
export function symlinkIsProtected(s, protectedTracked = []) {
  const resolved = resolveLinkTarget(s.link, s.target);
  if (resolved === null) return true;
  // the repo root, or any directory that contains evidence (a listed entry or a tracked protected file)
  if (resolved === "" || resolved === ".") return true;
  if (isProtectedPath(resolved) || isProtectedPath(`${resolved}/x`)) return true;
  const prefix = `${resolved.toLowerCase()}/`;
  if (PROTECTED_PATHS.some((e) => e.toLowerCase().startsWith(prefix))) return true;
  return protectedTracked.some((f) => normalise(f).toLowerCase().startsWith(prefix));
}

/**
 * @param {readonly string[]} changedPaths
 * @param {readonly string[]} labels
 * @param {readonly { link: string; target: string }[]} [symlinks] symlinks added or changed by the PR
 * @param {readonly string[]} [protectedTracked] protected files tracked at head (for links to their parent dirs)
 */
export function checkProtectedPaths(changedPaths, labels, symlinks = [], protectedTracked = []) {
  const unique = [...new Set(changedPaths.filter(Boolean))].sort();
  const linkHits = new Set(symlinks.filter((l) => symlinkIsProtected(l, protectedTracked)).map((s) => normalise(s.link)));
  const protectedChanged = unique.filter((p) => classifyPath(p).status === "protected" || linkHits.has(normalise(p)));
  for (const l of linkHits) if (!protectedChanged.includes(l)) protectedChanged.push(l);
  protectedChanged.sort();
  const warnings = unique.filter((p) => classifyPath(p).status === "warn" && !linkHits.has(normalise(p)));
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

/**
 * Parse `git diff --raw -z` output. Paths are NUL-terminated and never quoted, so non-ASCII,
 * quote, backslash, tab or newline characters in a name survive intact (the default
 * core.quotePath output would hand back a C-quoted string that no path rule matches).
 * Rename/copy entries (R/C) carry two paths, source then destination; both are returned.
 * @param {string} out
 * @returns {{ srcMode: string; dstMode: string; dstSha: string; status: string; paths: string[] }[]}
 */
export function parseRawZ(out) {
  if (out === "") return [];
  const parts = (out.endsWith("\0") ? out.slice(0, -1) : out).split("\0");
  const entries = [];
  let i = 0;
  while (i < parts.length) {
    const head = parts[i];
    const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/.exec(head);
    if (!m) throw new Error(`unexpected git diff --raw -z record: ${JSON.stringify(head.slice(0, 80))}`);
    const status = m[5];
    const n = status === "R" || status === "C" ? 2 : 1;
    const paths = parts.slice(i + 1, i + 1 + n);
    if (paths.length !== n || paths.some((p) => !p)) throw new Error("truncated git diff --raw -z output");
    entries.push({ srcMode: m[1], dstMode: m[2], dstSha: m[4], status, paths });
    i += 1 + n;
  }
  return entries;
}

/** @param {string} base @param {string} head @param {string} cwd */
function rawDiff(base, head, cwd) {
  return parseRawZ(execFileSync("git", ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", `${base}...${head}`], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
}

/** Symlinks (mode 120000) that the PR adds or changes, with their link text at head. */
export function symlinksBetween(base, head = "HEAD", cwd = process.cwd()) {
  const links = [];
  for (const e of rawDiff(base, head, cwd)) {
    if (e.dstMode !== "120000" || e.status === "D") continue;
    const target = execFileSync("git", ["cat-file", "blob", e.dstSha], { cwd, encoding: "utf8" });
    links.push({ link: e.paths[e.paths.length - 1], target });
  }
  return links;
}

/** Every path touched between base and head; renames contribute both sides (--no-renames). */
export function changedPathsBetween(base, head = "HEAD", cwd = process.cwd()) {
  return [...new Set(rawDiff(base, head, cwd).flatMap((e) => e.paths))].filter(Boolean);
}

/** Protected files tracked at `head` (NUL-safe), so a symlink to a parent directory of evidence is caught. */
export function protectedTrackedAt(head = "HEAD", cwd = process.cwd()) {
  const out = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", head], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return out.split("\0").filter((p) => p && isProtectedPath(p));
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
    result = checkProtectedPaths(changedPathsBetween(base, head), parseLabels(process.env.PR_LABELS), symlinksBetween(base, head), protectedTrackedAt(head));
  } catch (err) {
    console.error(`protected-path check could not run: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  if (result.warnings.length > 0) {
    console.log(`warning: allowlisted computing scripts whose names mention a protected token changed (${result.warnings.length}); review that they do not alter recorded outputs:`);
    for (const p of result.warnings) console.log(`  ${p}`);
    if (process.env.GITHUB_ACTIONS) for (const p of result.warnings) console.log(`::warning file=${p}::allowlisted script name mentions a protected token; not blocked, review its outputs`);
  }
  if (result.protectedChanged.length === 0) {
    console.log("protected-path check: no held-out / blind / baseline / frozen / ground-truth paths changed");
    return;
  }
  console.log(`protected paths changed (${result.protectedChanged.length}):`);
  for (const p of result.protectedChanged) console.log(`  ${p}  (${classifyPath(p).status === "protected" ? classifyPath(p).reason : "symlink to a protected or out-of-repo target"})`);
  if (result.approved) {
    console.log(`label "${OWNER_LABEL}" present: allowed by explicit owner approval`);
    return;
  }
  console.error(`FAIL: these paths are frozen evidence. An owner must add the label "${OWNER_LABEL}" to allow this PR.`);
  process.exit(1);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main();
