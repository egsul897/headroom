/**
 * Independence contract: precedent-comparison is a sidecar.
 * It may reuse read-only knowledge interfaces (evaluation-v2 signals) but must
 * not import production legal-engine write paths, IR persistence, compiler
 * callers, or Prisma client mutation surfaces.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "lib/precedent-comparison");

const FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  /from\s+["'][^"']*covenant-engine["']/,
  /from\s+["'][^"']*lib\/solver/,
  /from\s+["'][^"']*compiler\/persistence/,
  /from\s+["'][^"']*compiler\/semantic\/compile/,
  /from\s+["'][^"']*compiler\/semantic\/caller/,
  /from\s+["'][^"']*compiler\/semantic\/precedent-integration/,
  /from\s+["']@prisma\/client["'].*PrismaClient/,
  /new\s+PrismaClient\b/,
  /from\s+["'][^"']*lib\/prisma["']/,
];

/** Allowed knowledge-interface reuse — evaluation-v2 signals only. */
const ALLOWED_CONTRACT_MODEL_IMPORT = /from\s+["']\.\.\/contract-model\/evaluation-v2\//;

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "corpus") continue;
      out.push(...walkTsFiles(p));
    } else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("precedent-comparison import boundary", () => {
  it("does not import production legal-engine write/compile/solver/prisma paths", () => {
    const files = walkTsFiles(ROOT);
    expect(files.length).toBeGreaterThan(5);
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const re of FORBIDDEN_IMPORT_PATTERNS) {
        if (re.test(src)) violations.push(`${file}: matched ${re}`);
      }
      // Any deeper contract-model import beyond evaluation-v2 must be justified.
      for (const m of src.matchAll(/from\s+["'](\.\.\/contract-model\/[^"']+)["']/g)) {
        const spec = m[1]!;
        if (!spec.startsWith("../contract-model/evaluation-v2/")) {
          violations.push(`${file}: non-evaluation-v2 contract-model import ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("reuses evaluation-v2 signals as the knowledge interface", () => {
    const knowledge = readFileSync(join(ROOT, "knowledge.ts"), "utf8");
    expect(ALLOWED_CONTRACT_MODEL_IMPORT.test(knowledge)).toBe(true);
    expect(knowledge).toMatch(/extractSignals/);
    expect(knowledge).toMatch(/normalizeText/);
  });
});
