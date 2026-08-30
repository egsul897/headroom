/**
 * Bounded, grep-based static guard for the catastrophic database-destroying
 * patterns named in docs/test-infrastructure-incident-2026-08-30.md.
 * Deliberately NOT a full SQL/AST analyzer (see that doc's §17) - it exists
 * to catch specific, already-named catastrophic shapes, not to replace code
 * review. Run via `npx tsx scripts/check-destructive-db-patterns.ts`; exits
 * non-zero (and lists every match) if anything is found.
 *
 * What it catches:
 *  1. `company.deleteMany()` / `deleteMany({})` / `deleteMany({ where: {} })`
 *     - a Prisma deleteMany with no scoping predicate at all.
 *  2. `const where = <cond> ? {...} : {}` - the pattern that SILENTLY
 *     produces an unscoped deleteMany when the condition is false.
 *  3. `migrate dev`, `migrate reset`, or `db push` anywhere OUTSIDE this
 *     project's one sanctioned ephemeral-database helper
 *     (lib/testing/ephemeral-db.ts, which uses `migrate deploy` only) - this
 *     is the ACTUAL mechanism that caused the 2026-08-30 incident (see
 *     09-root-cause-analysis.json), so it is weighted as a hard failure,
 *     not a suggestion.
 *  4. Raw `TRUNCATE`/`DROP SCHEMA`/`DROP TABLE` SQL outside that same file.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["tests", "scripts", "lib", "app", "prisma"];
const ALLOWED_MIGRATE_TOOLING_FILE = "lib/testing/ephemeral-db.ts";

interface Finding {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

function listFiles(): string[] {
  const out = execFileSync("git", ["ls-files", ...SCAN_DIRS], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .filter((f) => f && /\.(ts|tsx|js|jsx|sql|json|yml|yaml)$/.test(f))
    .filter((f) => !f.includes("node_modules"));
}

const CHECKS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bdeleteMany\s*\(\s*\)/, label: "deleteMany() with no argument at all" },
  { pattern: /\bdeleteMany\s*\(\s*\{\s*\}\s*\)/, label: "deleteMany({}) - empty options object" },
  { pattern: /\bdeleteMany\s*\(\s*\{\s*where\s*:\s*\{\s*\}\s*\}\s*\)/, label: "deleteMany({ where: {} }) - empty predicate" },
  { pattern: /const\s+where\s*=\s*[^;]*\?\s*\{[^}]*\}\s*:\s*\{\s*\}/, label: "ternary collapsing a where-clause to {} in the false branch" },
  { pattern: /\bmigrate\s+dev\b/, label: "`prisma migrate dev` - creates a shadow DB and can auto-reset on drift in non-interactive environments (the 2026-08-30 incident's own mechanism)" },
  { pattern: /\bmigrate\s+reset\b/, label: "`prisma migrate reset` - unconditional destructive reset" },
  { pattern: /\bdb\s+push\b(?!\s+is)/, label: "`prisma db push` - bypasses migration history, can drop data-holding columns/tables silently" },
  // Uppercase-only and requires a following SQL keyword/identifier-in-quotes shape,
  // so the common lowercase `truncate(text)` JS helper (and prose mentioning it)
  // never matches - only actual SQL statement text does.
  { pattern: /\bTRUNCATE\s+(TABLE\s+)?"?\w/, label: "raw TRUNCATE SQL statement" },
  { pattern: /\bDROP\s+SCHEMA\s+"?\w/, label: "raw DROP SCHEMA SQL statement" },
  { pattern: /\bDROP\s+TABLE\s+"?\w/, label: "raw DROP TABLE SQL statement" },
];

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const relFile of listFiles()) {
    const abs = join(ROOT, relFile);
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      for (const { pattern, label } of CHECKS) {
        if (!pattern.test(line)) continue;
        const isMigrateToolingCheck = label.startsWith("`prisma migrate") || label.startsWith("`prisma db push");
        if (isMigrateToolingCheck && relFile === ALLOWED_MIGRATE_TOOLING_FILE) continue;
        // Allow the pattern to appear inside a comment/doc explaining why it must NOT be used
        // (this file itself, CODEX-HANDOFF.md-style prose, the initialize-neon.yml header comment)
        // — recognized by the line starting a comment marker before the match.
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("-")) continue;
        findings.push({ file: relFile, line: i + 1, pattern: label, text: line.trim() });
      }
    }
  }
  return findings;
}

function main() {
  const findings = scan();
  if (findings.length === 0) {
    console.log("check-destructive-db-patterns: no catastrophic patterns found.");
    process.exit(0);
  }
  console.error(`check-destructive-db-patterns: ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${relative(ROOT, join(ROOT, f.file))}:${f.line} — ${f.pattern}\n    ${f.text}\n`);
  }
  process.exit(1);
}

main();
