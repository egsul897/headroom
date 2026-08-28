/**
 * Phase 3C - mechanical independence enforcement (task §4's own "at
 * minimum add an import-boundary or architectural test preventing the
 * verifier from calling the Phase 3B compilation function to generate its
 * own verification conclusions"). Mirrors
 * tests/contract-model/coverage-audit-independence.test.ts's exact
 * technique - a static regex-over-import-lines check, not a runtime
 * sandbox - applied to lib/contract-model/compiler/semantic-verification/.
 *
 * Forbidden anywhere in this module: semantic/compile.ts
 * (compileCovenantToIR - the compiler's own entry point - the verifier must
 * never re-derive its own conclusions by invoking the compiler),
 * semantic/caller.ts (RealSemanticCaller/getSemanticCaller - the compiler's
 * own model-calling loop; this module has its own, separate caller),
 * semantic/normalize.ts and semantic/package-compile.ts (compiler
 * internals), and semantic/grading.ts (Phase 3B's benchmark-comparison
 * tool - ExpectedRuleShape ground truth has no role in production
 * verification, which has no ground truth to compare against).
 *
 * Allowed: semantic/tools.ts (pure read-only Phase 2 data-access wrappers,
 * not compiler reasoning), semantic/types.ts (shared type definitions),
 * anything under lib/contract-model/ir/ (the IR itself, being verified),
 * and low-level structural infrastructure.
 *
 * Phase 3D addition (task §21's own correlation-risk requirement, decided
 * in tests/contract-model/semantic-precedent-verifier-integration-decision.test.ts):
 * semantic-precedent/ is ALSO forbidden here. Feeding the same reviewed-
 * precedent evidence that may have influenced the compiler's own proposal
 * into this independent adversarial reviewer would remove the very
 * independence this Independence Contract exists to guarantee - a
 * misleading precedent could then cause the compiler AND its own "second
 * opinion" to agree on the same mistake (the dangerous correlated-failure
 * mode task §21 names explicitly). This is a permanent V1 decision, not an
 * oversight - do not remove this line to "wire up" precedent for the
 * verifier without redoing that correlation-risk analysis first.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const VERIFIER_DIR = path.join(__dirname, "../../lib/contract-model/compiler/semantic-verification");

const FORBIDDEN_ANYWHERE = [/semantic\/compile["']/, /semantic\/caller["']/, /semantic\/normalize["']/, /semantic\/package-compile["']/, /semantic\/grading["']/, /semantic-precedent\//];

function importLines(file: string): string[] {
  const content = fs.readFileSync(path.join(VERIFIER_DIR, file), "utf-8");
  return content.split("\n").filter((l) => /^\s*import\b/.test(l));
}

describe("Phase 3C independence: mechanical enforcement (task §4)", () => {
  it("the semantic-verification module directory exists", () => {
    expect(fs.existsSync(VERIFIER_DIR)).toBe(true);
  });

  it("no semantic-verification module imports the compiler's own compile/caller/normalize/package-compile/grading modules, even type-only", () => {
    const allFiles = fs.readdirSync(VERIFIER_DIR).filter((f) => f.endsWith(".ts"));
    expect(allFiles.length).toBeGreaterThan(0);
    for (const file of allFiles) {
      const lines = importLines(file);
      for (const pattern of FORBIDDEN_ANYWHERE) {
        const offending = lines.filter((l) => pattern.test(l));
        expect(offending, `${file} must never import a module matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
      }
    }
  });

  it("no semantic-verification module actually CALLS compileCovenantToIR anywhere in its own source (defense in depth beyond the import check - doc-comment disclosure of the Independence Contract itself, which names the forbidden function, is not a call and is exempt, exactly as the Anti-Benchmark-Gaming Contract distinguishes disclosure prose from decision logic)", () => {
    const allFiles = fs.readdirSync(VERIFIER_DIR).filter((f) => f.endsWith(".ts"));
    for (const file of allFiles) {
      const content = fs.readFileSync(path.join(VERIFIER_DIR, file), "utf-8");
      expect(/compileCovenantToIR\s*\(/.test(content), `${file} must never actually invoke compileCovenantToIR`).toBe(false);
    }
  });
});
