/**
 * Phase 2E §2 - mechanical independence enforcement. Statically inspects
 * the coverage-audit module's own source files' import statements and
 * fails if any independent-inventory-generation module imports a Phase
 * 2B/2D CONCLUSION module (the discovery pipeline/passes, or the
 * context-retrieval pipeline/structural-context/definition-graph/
 * reference-context/cross-document-context modules). Low-level structural
 * infrastructure (structural-index.ts, structural-references.ts,
 * structural-definitions.ts) and Phase 2C's package-graph TOPOLOGY types
 * remain allowed everywhere, per the independence contract (task §2).
 *
 * Comparison-stage modules (discovery-comparison.ts, context-comparison.ts)
 * are allowed to import discovery/types.ts and context-retrieval/types.ts
 * (type-only, to know the shape of the real output they compare against)
 * but never the pipeline/pass modules themselves.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const AUDIT_DIR = path.join(__dirname, "../../lib/contract-model/compiler/coverage-audit");

const FORBIDDEN_ANYWHERE = [/discovery\/pipeline/, /discovery\/pass-a-signals/, /discovery\/pass-b-semantic/, /discovery\/pass-c-neighborhood/, /discovery\/pass-d-reconcile/, /context-retrieval\/pipeline/, /context-retrieval\/structural-context/, /context-retrieval\/definition-graph/, /context-retrieval\/reference-context/, /context-retrieval\/cross-document-context/, /context-retrieval\/state/, /context-retrieval\/identity/];

/** Modules that build the INDEPENDENT inventory - must never import Phase 2B/2D real output types OR conclusion modules at all, not even type-only. */
const INVENTORY_GENERATION_FILES = ["source-inventory.ts", "signals.ts", "materiality.ts", "context-inventory.ts"];

const FORBIDDEN_FOR_INVENTORY_GENERATION = [...FORBIDDEN_ANYWHERE, /discovery\/types/, /context-retrieval\/types/];

function importLines(file: string): string[] {
  const content = fs.readFileSync(path.join(AUDIT_DIR, file), "utf-8");
  return content.split("\n").filter((l) => /^\s*import\b/.test(l));
}

describe("Phase 2E independence: mechanical enforcement (task §2)", () => {
  const allFiles = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith(".ts"));

  it("no coverage-audit module imports a Phase 2B/2D pipeline/pass conclusion module", () => {
    for (const file of allFiles) {
      const lines = importLines(file);
      for (const pattern of FORBIDDEN_ANYWHERE) {
        const offending = lines.filter((l) => pattern.test(l));
        expect(offending, `${file} must never import a module matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
      }
    }
  });

  it.each(INVENTORY_GENERATION_FILES)("independent-inventory-generation module %s never imports Phase 2B/2D types or conclusions, even type-only", (file) => {
    expect(fs.existsSync(path.join(AUDIT_DIR, file)), `expected ${file} to exist`).toBe(true);
    const lines = importLines(file);
    for (const pattern of FORBIDDEN_FOR_INVENTORY_GENERATION) {
      const offending = lines.filter((l) => pattern.test(l));
      expect(offending, `${file} (independent inventory generation) must never import anything matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
    }
  });

  it("comparison-stage modules exist and are the only files permitted to import discovery/types or context-retrieval/types", () => {
    const comparisonFiles = ["discovery-comparison.ts", "context-comparison.ts", "definition-audit.ts"];
    for (const file of comparisonFiles) {
      expect(fs.existsSync(path.join(AUDIT_DIR, file))).toBe(true);
    }
    for (const file of allFiles) {
      const lines = importLines(file);
      const touchesConclusionTypes = lines.some((l) => /discovery\/types|context-retrieval\/types/.test(l));
      if (touchesConclusionTypes) {
        expect(comparisonFiles.includes(file) || file === "pipeline.ts", `${file} imports a Phase 2B/2D type but is not a declared comparison-stage module`).toBe(true);
      }
    }
  });

  it("independent inventory modules import only low-level structural infrastructure and this phase's own modules", () => {
    const allowedPrefixes = [/^\.\//, /^\.\.\/structural-index/, /^\.\.\/structural-references/, /^\.\.\/structural-definitions/, /^\.\.\/hashing/, /^\.\.\/types/, /^\.\.\/package-graph\/types/, /^@prisma\/client/, /^node:/];
    for (const file of INVENTORY_GENERATION_FILES) {
      const lines = importLines(file);
      for (const line of lines) {
        const match = line.match(/from\s+["']([^"']+)["']/);
        if (!match) continue;
        const spec = match[1]!;
        const ok = allowedPrefixes.some((p) => p.test(spec));
        expect(ok, `${file} imports "${spec}" which is not on the low-level-infrastructure allowlist`).toBe(true);
      }
    }
  });
});
