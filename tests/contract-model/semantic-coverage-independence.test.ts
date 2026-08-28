/**
 * Phase 3E - mechanical independence enforcement (types.ts's own
 * Independence Contract). Statically inspects every source file under
 * lib/contract-model/compiler/semantic-coverage's own import statements and
 * fails if any independent-inventory-generation module (Layers A/B/C)
 * imports a Phase 2B/2D/3B/3C/3D CONCLUSION module. Uses the exact same
 * static regex-over-import-lines technique as
 * coverage-audit-independence.test.ts (Phase 2E) and
 * semantic-verification-independence.test.ts (Phase 3C) - not a runtime
 * sandbox.
 *
 * Low-level structural infrastructure (structural-index.ts,
 * structural-references.ts, structural-definitions.ts, raw-source-fallback
 * reused directly from coverage-audit/) and Phase 2C's package-graph
 * TOPOLOGY types remain allowed everywhere. Reconciliation-stage modules
 * (reconciliation.ts, family/document/package rollup) are the only files
 * permitted to import the compiled/verified IR and Phase 3B/3C/3D
 * conclusion types - and only type-only, per the same "comparison target,
 * never a discovery input" carve-out Phase 2E and Phase 3C both use.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MODULE_DIR = path.join(__dirname, "../../lib/contract-model/compiler/semantic-coverage");

const FORBIDDEN_ANYWHERE = [
  /discovery\/pipeline/,
  /discovery\/pass-a-signals/,
  /discovery\/pass-b-semantic/,
  /discovery\/pass-c-neighborhood/,
  /discovery\/pass-d-reconcile/,
  /context-retrieval\/pipeline/,
  /context-retrieval\/structural-context/,
  /context-retrieval\/definition-graph/,
  /context-retrieval\/reference-context/,
  /context-retrieval\/cross-document-context/,
  /context-retrieval\/state/,
  /semantic\/compile/,
  /semantic\/caller/,
  /semantic\/package-compile/,
  /semantic-verification\/verify/,
  /semantic-verification\/reviewer/,
  /semantic-precedent\//,
];

/** Layer A/B/C inventory-generation modules - must never import Phase 2B/2D/3B/3C/3D real output TYPES either, not even type-only (mirrors coverage-audit's own INVENTORY_GENERATION_FILES treatment). These file names are declared in advance here as the Independence Contract's own inventory-generation boundary; later tasks (§154-156) must create exactly these files (or extend this list) rather than silently placing inventory logic somewhere this test does not check. */
const INVENTORY_GENERATION_FILES = ["router.ts", "signals.ts", "unit-hypothesis.ts", "ai-inventory.ts", "freeze.ts"];

const FORBIDDEN_FOR_INVENTORY_GENERATION = [...FORBIDDEN_ANYWHERE, /discovery\/types/, /context-retrieval\/types/, /semantic\/types/, /semantic-verification\/types/, /semantic-precedent\/types/, /\.\.\/\.\.\/ir\/types/];

/** The only files allowed to import compiled/verified IR or Phase 3B/3C/3D conclusion types - and only type-only. */
const RECONCILIATION_FILES = ["reconciliation.ts", "family-coverage.ts", "document-coverage.ts", "package-coverage.ts", "cross-reference-audit.ts", "pipeline.ts"];

function importLines(file: string): string[] {
  const content = fs.readFileSync(path.join(MODULE_DIR, file), "utf-8");
  return content.split("\n").filter((l) => /^\s*import\b/.test(l));
}

function existingFiles(): string[] {
  if (!fs.existsSync(MODULE_DIR)) return [];
  return fs.readdirSync(MODULE_DIR).filter((f) => f.endsWith(".ts"));
}

describe("Phase 3E independence: mechanical enforcement (types.ts's Independence Contract)", () => {
  it("no semantic-coverage module imports a Phase 2B/2D/3B/3C/3D pipeline/pass/compiler/verifier/precedent conclusion module", () => {
    for (const file of existingFiles()) {
      const lines = importLines(file);
      for (const pattern of FORBIDDEN_ANYWHERE) {
        const offending = lines.filter((l) => pattern.test(l));
        expect(offending, `${file} must never import a module matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
      }
    }
  });

  it.each(INVENTORY_GENERATION_FILES.filter((f) => fs.existsSync(path.join(MODULE_DIR, f))))("independent-inventory-generation module %s never imports Phase 2B/2D/3B/3C/3D types or conclusions, even type-only", (file) => {
    const lines = importLines(file);
    for (const pattern of FORBIDDEN_FOR_INVENTORY_GENERATION) {
      const offending = lines.filter((l) => pattern.test(l));
      expect(offending, `${file} (independent inventory generation) must never import anything matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
    }
  });

  it("any file importing compiled IR or Phase 3B/3C/3D conclusion types is a declared reconciliation-stage module", () => {
    for (const file of existingFiles()) {
      const lines = importLines(file);
      const touchesConclusionTypes = lines.some((l) => /discovery\/types|context-retrieval\/types|semantic\/types|semantic-verification\/types|semantic-precedent\/types|\.\.\/\.\.\/ir\/types/.test(l));
      if (touchesConclusionTypes) {
        expect(RECONCILIATION_FILES.includes(file), `${file} imports a Phase 2B/2D/3B/3C/3D type but is not a declared reconciliation-stage module`).toBe(true);
      }
    }
  });

  it("this module's Independence Contract (types.ts header) exists and documents the allowed/forbidden inputs", () => {
    const typesPath = path.join(MODULE_DIR, "types.ts");
    expect(fs.existsSync(typesPath)).toBe(true);
    const content = fs.readFileSync(typesPath, "utf-8");
    expect(content).toContain("INDEPENDENCE CONTRACT");
    expect(content).toContain("FORBIDDEN as a source of truth");
    expect(content).toContain("FREEZE-BEFORE-LOAD");
    expect(content).toContain("SHARED-SUBSTRATE INDEPENDENCE");
  });
});
