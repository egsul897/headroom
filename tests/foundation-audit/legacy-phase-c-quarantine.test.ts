/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Section U (Legacy Phase C
 * quarantine). Mirrors the audit's own manual reachability grep
 * (docs/phase-3f1-3-foundation-assurance-audit.md §U: "zero imports of
 * orchestrator.ts/service.ts/validators.ts anywhere under app/
 * (grep-confirmed)... Mechanically, no [guardrail]... Recommended (not
 * implemented): an ESLint no-restricted-imports rule plus a grep-based
 * import-boundary test mirroring this audit's own reachability check.")
 * as a permanent, mechanical, CI-enforced check rather than a one-time
 * manual grep that nobody re-runs.
 *
 * The legacy 11-stage Phase C compiler
 * (lib/contract-model/compiler/orchestrator.ts's own `runContractCompiler`
 * entry point, plus its RULE_EXTRACTION/VERIFICATION/PROMOTION stages, and
 * the legacy query/validation layer only it populates —
 * lib/contract-model/service.ts / lib/contract-model/validators.ts) has a
 * real, disclosed, never-closed dangerous-unflagged error rate (25.0% ->
 * 15.625%, both above its own required <=5% safety gate — see
 * docs/HEADROOM-ROADMAP.md §1 "The pre-Phase-2 'Phase C' compiler"). It is
 * NOT repaired here (quarantine only, no repair) — this test only proves it
 * stays unreachable from app/, paired with the mirroring
 * .eslintrc.json `no-restricted-imports` override.
 *
 * Two tests:
 *  1. The REAL check — scans the repo's actual app/ directory and asserts
 *     zero violations. This is the regression gate: it fails the moment a
 *     future session wires the legacy pipeline into app/.
 *  2. A self-test proving the detector itself is not vacuously passing —
 *     it builds a throwaway fixture directory (NEVER under the real app/)
 *     containing exactly the kind of violating imports test 1 forbids, and
 *     asserts the same detector function catches every one of them, with
 *     the right file/kind attribution.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

type QuarantineViolationKind = "SERVICE_IMPORT" | "VALIDATORS_IMPORT" | "RUN_CONTRACT_COMPILER_IMPORT";

interface QuarantineViolation {
  file: string;
  kind: QuarantineViolationKind;
  snippet: string;
}

/** Any static `import ... from "..."` or dynamic `import("...")`/`require("...")` naming a quarantined module - matched on the resolved specifier text (relative or `@/`-aliased), not on a resolved filesystem path, exactly mirroring how the .eslintrc.json `no-restricted-imports` `patterns.group` globs match. */
const SERVICE_OR_VALIDATORS_IMPORT = /import\s+[\s\S]*?from\s+["']([^"']*\/contract-model\/(service|validators)(?:\.tsx?)?)["']|require\(\s*["']([^"']*\/contract-model\/(service|validators)(?:\.tsx?)?)["']\s*\)/g;
const ORCHESTRATOR_IMPORT = /import\s+([\s\S]*?)from\s+["']([^"']*\/contract-model\/compiler\/orchestrator(?:\.tsx?)?)["']/g;

/** Walks `rootDir` for `.ts`/`.tsx` files and returns every quarantine violation found - a real, unmocked filesystem+regex scan of source text, the same class of mechanism the audit's own manual grep used. */
function findQuarantineViolations(rootDir: string): QuarantineViolation[] {
  const violations: QuarantineViolation[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // Directory doesn't exist (e.g. no app/ in a fixture) - nothing to scan.
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const content = readFileSync(full, "utf-8");
      const relPath = relative(process.cwd(), full);

      for (const m of content.matchAll(SERVICE_OR_VALIDATORS_IMPORT)) {
        const which = (m[2] ?? m[4]) === "service" ? "SERVICE_IMPORT" : "VALIDATORS_IMPORT";
        violations.push({ file: relPath, kind: which, snippet: m[0].trim() });
      }
      for (const m of content.matchAll(ORCHESTRATOR_IMPORT)) {
        const importClause = m[1] ?? "";
        if (/\brunContractCompiler\b/.test(importClause)) {
          violations.push({ file: relPath, kind: "RUN_CONTRACT_COMPILER_IMPORT", snippet: m[0].trim() });
        }
      }
    }
  }
  walk(rootDir);
  return violations;
}

describe("Section U — legacy Phase C compiler quarantine: app/ must never import the legacy entry point or its legacy query/validation layer", () => {
  it("REAL CHECK: the repo's actual app/ directory contains zero imports of runContractCompiler, service.ts, or validators.ts", () => {
    const appDir = join(process.cwd(), "app");
    const violations = findQuarantineViolations(appDir);
    // If this ever fails, a future session has wired the legacy 11-stage
    // compiler (never-closed 25.0% -> 15.625% dangerous-unflagged error
    // rate, both above its own required <=5% gate) back into a live surface
    // - see docs/HEADROOM-ROADMAP.md §1. Remove the offending import; do not
    // relax this test.
    expect(violations).toEqual([]);
  });

  describe("self-test: the detector is not vacuously passing", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "quarantine-detector-fixture-"));
    afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

    it("catches a runContractCompiler import, a service.ts import, and a validators.ts import in a throwaway fixture tree (never under real app/)", () => {
      const fixtureApp = join(fixtureRoot, "app", "some-route");
      mkdirSync(fixtureApp, { recursive: true });
      writeFileSync(
        join(fixtureApp, "route.ts"),
        [
          `import { runContractCompiler } from "../../../lib/contract-model/compiler/orchestrator";`,
          `import { listCompanyRules } from "@/lib/contract-model/service";`,
          `import { validateRule } from "../../../lib/contract-model/validators";`,
          ``,
          `export function probe() { return { runContractCompiler, listCompanyRules, validateRule }; }`,
          ``,
        ].join("\n")
      );
      // A sibling file with only legitimate imports (current-generation
      // stage functions + orchestrator's own non-quarantined type export)
      // must NOT be flagged - the detector targets the specific quarantined
      // names/modules, not the whole compiler/ directory.
      writeFileSync(
        join(fixtureApp, "safe.ts"),
        [
          `import { parseDocumentStructure } from "../../../lib/contract-model/compiler/stage-structure";`,
          `import type { CompilerRunOptions } from "../../../lib/contract-model/compiler/orchestrator";`,
          ``,
          `export function safe(opts: CompilerRunOptions) { return { parseDocumentStructure, opts }; }`,
          ``,
        ].join("\n")
      );

      const violations = findQuarantineViolations(fixtureRoot);
      const kinds = violations.map((v) => v.kind).sort();
      expect(kinds).toEqual(["RUN_CONTRACT_COMPILER_IMPORT", "SERVICE_IMPORT", "VALIDATORS_IMPORT"]);
      expect(violations.every((v) => v.file.includes("route.ts"))).toBe(true);
      expect(violations.some((v) => v.file.includes("safe.ts"))).toBe(false);
    });

    it("does not flag a fixture app/ directory with zero quarantined imports", () => {
      const cleanFixture = mkdtempSync(join(tmpdir(), "quarantine-detector-clean-fixture-"));
      try {
        const cleanApp = join(cleanFixture, "app");
        mkdirSync(cleanApp, { recursive: true });
        writeFileSync(join(cleanApp, "page.tsx"), `export default function Page() { return null; }\n`);
        expect(findQuarantineViolations(cleanFixture)).toEqual([]);
      } finally {
        rmSync(cleanFixture, { recursive: true, force: true });
      }
    });
  });
});
