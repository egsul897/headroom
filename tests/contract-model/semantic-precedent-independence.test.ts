/**
 * Phase 3D - mechanical independence enforcement, mirroring
 * semantic-verification-independence.test.ts's own proven technique (a
 * static regex-over-import-lines check) applied to
 * lib/contract-model/compiler/semantic-precedent/.
 *
 * Forbidden anywhere in this module: semantic/grading.ts (Phase 3B's
 * benchmark-comparison tool - ExpectedRuleShape ground truth must never
 * leak into precedent generalization, which would turn "reviewed
 * precedent" into "memorized benchmark answers" - task §9/§58's own
 * anti-memorization requirement), semantic/compile.ts (the precedent
 * system consumes already-produced compiler output/snapshots - it must
 * never re-derive its own IR by calling the compiler directly), and
 * semantic/caller.ts (any AI-assisted generalization call in this module
 * must go through llm-caller.ts's provider-abstract StageCaller, exactly
 * as semantic-verification/reviewer.ts already does - never the
 * compiler's own internal caller).
 *
 * Allowed: ir/ types, llm-caller.ts, hashing.ts, semantic/types.ts and
 * semantic-verification/types.ts (shared type definitions only).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PRECEDENT_DIR = path.join(__dirname, "../../lib/contract-model/compiler/semantic-precedent");

const FORBIDDEN_ANYWHERE = [/semantic\/grading["']/, /semantic\/compile["']/, /semantic\/caller["']/, /semantic\/package-compile["']/];

function importLines(file: string): string[] {
  const content = fs.readFileSync(path.join(PRECEDENT_DIR, file), "utf-8");
  return content.split("\n").filter((l) => /^\s*import\b/.test(l));
}

describe("Phase 3D independence: mechanical enforcement", () => {
  it("the semantic-precedent module directory exists", () => {
    expect(fs.existsSync(PRECEDENT_DIR)).toBe(true);
  });

  it("no semantic-precedent module imports the compiler's own grading/compile/caller/package-compile modules, even type-only", () => {
    const allFiles = fs.readdirSync(PRECEDENT_DIR).filter((f) => f.endsWith(".ts"));
    expect(allFiles.length).toBeGreaterThan(0);
    for (const file of allFiles) {
      const lines = importLines(file);
      for (const pattern of FORBIDDEN_ANYWHERE) {
        const offending = lines.filter((l) => pattern.test(l));
        expect(offending, `${file} must never import a module matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
      }
    }
  });

  it("no semantic-precedent module actually calls compileCovenantToIR anywhere in its own source", () => {
    const allFiles = fs.readdirSync(PRECEDENT_DIR).filter((f) => f.endsWith(".ts"));
    for (const file of allFiles) {
      const content = fs.readFileSync(path.join(PRECEDENT_DIR, file), "utf-8");
      expect(/compileCovenantToIR\s*\(/.test(content), `${file} must never actually invoke compileCovenantToIR`).toBe(false);
    }
  });

  it("SemanticSignature has no company/document/package/section identity field (task §9/§11 - retrieval must not primarily key on identity)", () => {
    const content = fs.readFileSync(path.join(PRECEDENT_DIR, "types.ts"), "utf-8");
    const match = content.match(/export interface SemanticSignature \{[\s\S]*?\n\}/);
    expect(match, "SemanticSignature interface not found").toBeTruthy();
    const body = match![0].toLowerCase();
    for (const forbidden of ["companyid", "documentid", "packageid", "sectionref", "instrumentkey", "sourcedocumentid"]) {
      expect(body.includes(forbidden), `SemanticSignature must not declare a ${forbidden} field`).toBe(false);
    }
  });
});
