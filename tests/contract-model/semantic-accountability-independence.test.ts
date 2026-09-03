/**
 * SEMANTIC ACCOUNTABILITY - mechanical independence enforcement (types.ts's
 * own Independence Contract; mission §4 and §28). Same static regex-over-
 * import-lines technique as coverage-audit-independence.test.ts,
 * semantic-verification-independence.test.ts and semantic-coverage-
 * independence.test.ts - not a runtime sandbox.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ACCOUNTABILITY_DIR = path.join(__dirname, "../../lib/contract-model/compiler/semantic-accountability");
const VERIFICATION_DIR = path.join(__dirname, "../../lib/contract-model/compiler/semantic-verification");

/** Pass A (source-only) files - may never see compiler output, the IR, the verifier, precedent, or Phase 2B/2D conclusions. */
const PASS_A_FILES = ["inventory.ts", "quantitative.ts", "source-context.ts", "prompt.ts", "wire-schema.ts", "reference-resolver.ts"];
const FORBIDDEN_FOR_PASS_A = [/semantic\/compile/, /semantic\/normalize/, /semantic\/caller/, /semantic\/package-compile/, /semantic\/types/, /semantic-verification\//, /semantic-precedent\//, /\/ir\//, /discovery\//, /context-retrieval\//];

/** Pass C files may read the final IR and compiler result types as COMPARISON TARGETS (type-only), never the compiler's own reasoning/model loop or the verifier. */
const PASS_C_FILES = ["reconciliation.ts", "rollup.ts"];
const FORBIDDEN_FOR_PASS_C = [/semantic\/compile/, /semantic\/caller/, /semantic\/package-compile/, /semantic-verification\//, /semantic-precedent\//];

function importLines(dir: string, file: string): string[] {
  return fs
    .readFileSync(path.join(dir, file), "utf-8")
    .split("\n")
    .filter((l) => /^\s*import\b/.test(l));
}

describe("Semantic accountability independence (mission §4/§28)", () => {
  it("every Pass A file exists and imports no compiler/IR/verifier/precedent/discovery/context-retrieval module", () => {
    for (const file of PASS_A_FILES) {
      expect(fs.existsSync(path.join(ACCOUNTABILITY_DIR, file)), `${file} must exist`).toBe(true);
      for (const line of importLines(ACCOUNTABILITY_DIR, file)) {
        for (const pattern of FORBIDDEN_FOR_PASS_A) expect(pattern.test(line), `${file}: forbidden import ${line}`).toBe(false);
      }
    }
  });

  it("Pass C files never import the compiler's model loop, compile entry point, or the verifier", () => {
    for (const file of PASS_C_FILES.filter((f) => fs.existsSync(path.join(ACCOUNTABILITY_DIR, f)))) {
      for (const line of importLines(ACCOUNTABILITY_DIR, file)) {
        for (const pattern of FORBIDDEN_FOR_PASS_C) expect(pattern.test(line), `${file}: forbidden import ${line}`).toBe(false);
      }
    }
  });

  it("Pass C only ever imports IR/compiler result types type-only (comparison target, never a discovery input)", () => {
    for (const file of PASS_C_FILES.filter((f) => fs.existsSync(path.join(ACCOUNTABILITY_DIR, f)))) {
      for (const line of importLines(ACCOUNTABILITY_DIR, file)) {
        if (/\/ir\/|semantic\/types/.test(line)) expect(/^\s*import\s+type\b/.test(line), `${file}: IR/compiler-type import must be type-only: ${line}`).toBe(true);
      }
    }
  });

  it("the independent verifier never consumes Pass A/Pass C conclusions (no semantic-verification file imports semantic-accountability)", () => {
    for (const file of fs.readdirSync(VERIFICATION_DIR).filter((f) => f.endsWith(".ts"))) {
      for (const line of importLines(VERIFICATION_DIR, file)) expect(/semantic-accountability/.test(line), `${file}: verifier must not import accountability: ${line}`).toBe(false);
    }
  });

  it("no accountability file references a known package identifier, benchmark section number, or benchmark amount in decision logic", () => {
    const banned = [/superior/i, /\bdsgr\b/i, /\blsb\b/i, /\bfwrg\b/i, /\briot\b/i, /\bconmed\b/i, /applicable rate/i, /maintenance liquidity/i, /secured net leverage/i];
    for (const file of fs.readdirSync(ACCOUNTABILITY_DIR).filter((f) => f.endsWith(".ts"))) {
      const content = fs.readFileSync(path.join(ACCOUNTABILITY_DIR, file), "utf-8");
      const codeOnly = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const re of banned) expect(re.test(codeOnly), `${file}: benchmark identifier ${re} in non-comment code`).toBe(false);
    }
  });
});
