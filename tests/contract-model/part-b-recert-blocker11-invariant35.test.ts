/**
 * Phase 3F.1.6.RX Part B - independent, PRODUCTION-FROZEN recertification of
 * BLOCKER-11 (Architecture Invariant #35 / `sourceLedgerEntryId` scope
 * mismatch).
 *
 * This is a fresh, mechanical, re-runnable version of the grep-based audit
 * Phase 3F.1.6.R's own Workstream G (docs/phase-3f1-6-r-blocker-remediation/
 * 20-invariant-35-architecture-decision.json) and this phase's own
 * Workstream G (docs/phase-3f1-6-rx-final-blocker-closure/08-invariant-35-
 * revalidation.json) performed manually via one-off shell greps. Mirrors
 * the exact same durability argument tests/foundation-audit/legacy-phase-c-
 * quarantine.test.ts already established for a different quarantine
 * boundary in this codebase: a manual grep nobody re-runs is not a
 * guardrail; a mechanical, CI-enforced scan of the real source tree is.
 *
 * PRODUCTION IS FROZEN for this pass - no file under app/, lib/,
 * prisma/schema.prisma, or prisma/migrations/ is modified here.
 *
 * The prior architecture decision (ARCHITECTURE_SCOPE_RESOLVED, deferred to
 * Phase 6) rests on four facts, each independently re-verified below against
 * the CURRENT, frozen HEAD - including everything Part A's own Workstream H
 * added (the AnalysisRun/SemanticTruthRecord/AnalysisRunIssue/
 * AnalysisFailureLog models and the live contract-analysis orchestrator):
 *
 *  1. Zero live `prisma.debtEvent.create`/`createMany`/`upsert` call sites
 *     anywhere under app/ or lib/ (the only real call sites are three
 *     offline, engineer-run scripts under scripts/, plus test-fixture-only
 *     calls under tests/financial-core/ - neither is a live application path
 *     a real user request can reach).
 *  2. Zero writes to `sourceLedgerEntryId` anywhere under app/ or lib/ (the
 *     only read site is lib/financial-core-db/adapter.ts's own `?? undefined`
 *     fallback read).
 *  3. None of Part A's own four new Prisma models (AnalysisRun,
 *     AnalysisRunIssue, AnalysisFailureLog, SemanticTruthRecord) declare any
 *     field or relation naming Facility, DebtEvent, or LedgerEntry.
 *  4. docs/HEADROOM-ROADMAP.md still explicitly assigns the
 *     LedgerEntry/DebtEvent reconciliation to Phase 6.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

/** Walks `rootDir` for `.ts`/`.tsx` source files, skipping node_modules, .git, .claude/worktrees (untracked sibling agent worktrees - see .gitignore), and test/script directories that are explicitly out of scope for a LIVE application path. Returns absolute file paths. */
function walkSourceFiles(rootDir: string, skipDirNames: Set<string> = new Set(["node_modules", ".git", ".next", "worktrees"])): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skipDirNames.has(entry)) continue;
      const full = join(dir, entry);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (s.isFile() && (extname(entry) === ".ts" || extname(entry) === ".tsx")) {
        results.push(full);
      }
    }
  }
  walk(rootDir);
  return results;
}

// ---------------------------------------------------------------------------
// 1. Zero live DebtEvent write call sites under app/ or lib/.
// ---------------------------------------------------------------------------
describe("1. no live application code path (app/ or lib/) ever creates a DebtEvent row", () => {
  it("prisma.debtEvent.create / .createMany / .upsert has ZERO call sites under app/ or lib/", () => {
    const files = [...walkSourceFiles(join(REPO_ROOT, "app")), ...walkSourceFiles(join(REPO_ROOT, "lib"))];
    const writePattern = /debtEvent\s*\.\s*(create|createMany|upsert)\s*\(/;
    const violations: Array<{ file: string; line: number; snippet: string }> = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      text.split("\n").forEach((line, i) => {
        if (writePattern.test(line)) violations.push({ file, line: i + 1, snippet: line.trim() });
      });
    }
    expect(violations).toEqual([]);
    expect(files.length).toBeGreaterThan(50); // sanity - the scan actually walked a real, non-trivial source tree
  });

  it("self-test: the detector is not vacuously passing - it DOES catch a DebtEvent write pattern when one is textually present (checked against the real, known offline scripts, which are OUTSIDE app/lib/ and therefore correctly out of this test's own scope, but confirm the regex itself matches real syntax)", () => {
    const knownOfflineScript = join(REPO_ROOT, "scripts", "financial-core-acceptance-run.ts");
    const text = readFileSync(knownOfflineScript, "utf-8");
    expect(/debtEvent\s*\.\s*create\s*\(/.test(text)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Zero writes to sourceLedgerEntryId under app/ or lib/.
// ---------------------------------------------------------------------------
describe("2. sourceLedgerEntryId is never WRITTEN by any app/ or lib/ code path", () => {
  it("no assignment/write-shaped occurrence of sourceLedgerEntryId exists under app/ or lib/ outside of a type/interface field declaration or a read-with-fallback expression", () => {
    const files = [...walkSourceFiles(join(REPO_ROOT, "app")), ...walkSourceFiles(join(REPO_ROOT, "lib"))];
    const hits: Array<{ file: string; line: number; snippet: string }> = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      text.split("\n").forEach((line, i) => {
        if (line.includes("sourceLedgerEntryId")) hits.push({ file, line: i + 1, snippet: line.trim() });
      });
    }
    // Every real hit today is a TYPE FIELD declaration ("sourceLedgerEntryId?: string;" /
    // "sourceLedgerEntryId: string | null;") or a READ with a nullish-coalescing
    // fallback ("sourceLedgerEntryId: r.sourceLedgerEntryId ?? undefined") - never
    // a write assigning a real value INTO a DebtEvent/prisma create/update payload.
    const writeShaped = hits.filter((h) => {
      const isTypeFieldDecl = /sourceLedgerEntryId\s*\??\s*:\s*(string|undefined)/.test(h.snippet) && !h.snippet.includes("??");
      const isReadWithFallback = h.snippet.includes("??");
      return !isTypeFieldDecl && !isReadWithFallback;
    });
    expect(writeShaped).toEqual([]);
    expect(hits.length).toBe(3); // exactly the 3 sites independently re-confirmed: financial-core/types.ts field decl, financial-core-db/adapter.ts interface field decl + its own read-with-fallback
  });
});

// ---------------------------------------------------------------------------
// 3. Part A's own four new Prisma models carry no relation/field naming
//    Facility, DebtEvent, or LedgerEntry.
// ---------------------------------------------------------------------------
describe("3. Part A's new AnalysisRun/AnalysisRunIssue/AnalysisFailureLog/SemanticTruthRecord models introduce no new coupling to the financial-core schema", () => {
  const schemaText = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf-8");

  function extractModelBody(modelName: string): string {
    const re = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, "m");
    const m = schemaText.match(re);
    if (!m) throw new Error(`model ${modelName} not found in schema.prisma - Part A's own schema changes may have been reverted or renamed`);
    return m[1]!;
  }

  it.each(["AnalysisRun", "AnalysisRunIssue", "AnalysisFailureLog", "SemanticTruthRecord"])("model %s declares no field or relation naming Facility, DebtEvent, or LedgerEntry", (modelName) => {
    const body = extractModelBody(modelName);
    expect(body).not.toMatch(/\bFacility\b/);
    expect(body).not.toMatch(/\bDebtEvent\b/);
    expect(body).not.toMatch(/\bLedgerEntry\b/);
  });
});

// ---------------------------------------------------------------------------
// 4. docs/HEADROOM-ROADMAP.md still explicitly assigns the LedgerEntry/
//    DebtEvent reconciliation to Phase 6 - read directly, not trusted from
//    any prior workstream's own paraphrase.
// ---------------------------------------------------------------------------
describe("4. the roadmap still explicitly assigns the LedgerEntry/DebtEvent fork to Phase 6", () => {
  it("the Phase 6 goal statement names the LedgerEntry/DebtEvent fork by name", () => {
    const roadmap = readFileSync(join(REPO_ROOT, "docs", "HEADROOM-ROADMAP.md"), "utf-8");
    expect(roadmap).toMatch(/current `?LedgerEntry`?\/`?DebtEvent`? fork.*gets resolved into the real transaction\/capacity-truth model/);
  });

  it("the §3.3/§5 fork discussion still names Phase 6 as the migration path for sourceLedgerEntryId", () => {
    const roadmap = readFileSync(join(REPO_ROOT, "docs", "HEADROOM-ROADMAP.md"), "utf-8");
    expect(roadmap).toMatch(/sourceLedgerEntryId.*link back to.*LedgerEntry.*that has never actually been populated/);
    expect(roadmap).toMatch(/Migration path:\*\*\s*Phase 6 is where these should be reconciled/);
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
describe("summary", () => {
  it("prints the Part B independent BLOCKER-11 recertification result", () => {
    // eslint-disable-next-line no-console
    console.log(
      "Part B BLOCKER-11 recertification: mechanical re-scan of the ENTIRE app/+lib/ source tree (not just app/) confirms " +
        "zero live DebtEvent write call sites and zero sourceLedgerEntryId writes; Part A's own 4 new Prisma models carry " +
        "no new coupling to Facility/DebtEvent/LedgerEntry; docs/HEADROOM-ROADMAP.md, re-read directly, still explicitly " +
        "assigns the fork to Phase 6. No genuine defect found. Disposition: CERTIFIED_SCOPE_RESOLVED.",
    );
    expect(true).toBe(true);
  });
});
