/**
 * WS-PAR ownership boundary checker.
 *
 * Usage:
 *   npx tsx scripts/parallel-agents/check-ownership-boundaries.ts --workstream WS-CKF --files <path>...
 *   git diff --name-only origin/main...HEAD | npx tsx scripts/parallel-agents/check-ownership-boundaries.ts --workstream WS-PAR --stdin
 *
 * Exit 0 when every changed file is allowed for the workstream; exit 1 on violation.
 * Reads docs/architecture/parallel-agents/01-workstream-map.json only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Workstream = {
  workstreamId: string;
  exclusiveOwn?: string[];
  mustNotTouch?: string[];
  extendViaNewSiblingOnly?: string[];
  status?: string;
};

type WorkstreamMap = {
  workstreams: Workstream[];
};

function parseArgs(argv: string[]): {
  workstreamId: string;
  files: string[];
  stdin: boolean;
} {
  let workstreamId = "";
  let stdin = false;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workstream") {
      workstreamId = argv[++i] ?? "";
    } else if (arg === "--files") {
      // remaining until next flag
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        files.push(argv[++i]);
      }
    } else if (arg === "--stdin") {
      stdin = true;
    }
  }
  if (!workstreamId) {
    throw new Error("Required: --workstream <WS-ID>");
  }
  return { workstreamId, files, stdin };
}

function normalizeExclusiveGlob(glob: string): string {
  return glob.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
}

function pathMatchesGlob(filePath: string, glob: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (glob.endsWith("/**")) {
    const prefix = normalizeExclusiveGlob(glob);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (glob.endsWith("/*")) {
    const prefix = normalizeExclusiveGlob(glob);
    if (normalized === prefix) return true;
    if (!normalized.startsWith(`${prefix}/`)) return false;
    return !normalized.slice(prefix.length + 1).includes("/");
  }
  return normalized === glob;
}

function main(): void {
  const { workstreamId, files: argFiles, stdin } = parseArgs(process.argv.slice(2));
  const map = JSON.parse(
    readFileSync(resolve(process.cwd(), "docs/architecture/parallel-agents/01-workstream-map.json"), "utf8"),
  ) as WorkstreamMap;
  const ws = map.workstreams.find((w) => w.workstreamId === workstreamId);
  if (!ws) {
    throw new Error(`Unknown workstream: ${workstreamId}`);
  }
  if (ws.status === "UNASSIGNED") {
    throw new Error(`Workstream ${workstreamId} is UNASSIGNED; refuse file claims`);
  }

  let files = [...argFiles];
  if (stdin) {
    const raw = readFileSync(0, "utf8");
    files.push(
      ...raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }
  files = [...new Set(files.map((f) => f.replace(/\\/g, "/")))];

  const exclusive = ws.exclusiveOwn ?? [];
  const forbidden = ws.mustNotTouch ?? [];
  const siblingOnly = new Set(ws.extendViaNewSiblingOnly ?? []);
  const violations: string[] = [];

  for (const file of files) {
    if (siblingOnly.has(file)) {
      violations.push(`${file}: listed extendViaNewSiblingOnly — edit via new sibling module, not in-place rewrite`);
      continue;
    }
    if (forbidden.some((g) => pathMatchesGlob(file, g))) {
      violations.push(`${file}: matches mustNotTouch for ${workstreamId}`);
      continue;
    }
    // Docs/tests outside exclusiveOwn are allowed only if not forbidden; production lib/scripts
    // outside exclusiveOwn are violations for this checker (force explicit ownership claims).
    const isOwned = exclusive.some((g) => pathMatchesGlob(file, g));
    const underLibOrScripts = file.startsWith("lib/") || file.startsWith("scripts/");
    if (underLibOrScripts && !isOwned) {
      violations.push(`${file}: production path not in exclusiveOwn for ${workstreamId}`);
    }
  }

  if (violations.length > 0) {
    console.error(`Ownership violations for ${workstreamId}:`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`OK: ${files.length} file(s) within ${workstreamId} ownership boundaries`);
}

main();
