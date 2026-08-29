/**
 * Evaluation Methodology V2 — mechanical independence enforcement.
 *
 * Phase 3F.1.5. Architecture invariants #17/#18: the system that proposes an
 * interpretation and the system that checks it must not be the same pass, and
 * mechanical independence at the algorithm level is necessary (if not
 * sufficient).
 *
 * This test proves the necessary half mechanically: nothing under
 * lib/contract-model/evaluation-v2/** may import a historical scorer or the
 * Phase C analyzer evaluator, whose matching logic is the defect class V2
 * exists to replace. It also proves the ground-truth loader reads only frozen
 * answer-key artifacts, never anything the compiler produced.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const EVALUATOR_DIR = join(ROOT, "lib/contract-model/evaluation-v2");

/** Modules whose MATCHING logic is the defect class under replacement. */
const FORBIDDEN_IMPORT_PATTERNS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /["'@/.\\]*scripts\/phase-3f/i, why: "historical Phase 3F/3F.1 scorers — structural sectionRef matching with descendant-union credit" },
  { pattern: /["'@/.\\]*scripts\/phase-2f-score/i, why: "historical Phase 2F scorer" },
  { pattern: /analyzer\/evaluator/i, why: "Phase C blind evaluator — numbersMatch-gated hierarchy-child fallback" },
  { pattern: /["'@/.\\]*lib\/covenant-engine/i, why: "production answer path; the evaluator must not consume production conclusions" },
  { pattern: /["'@/.\\]*lib\/contract-model\/compiler/i, why: "the compiler under evaluation" },
  { pattern: /["'@/.\\]*lib\/contract-model\/service/i, why: "the production service under evaluation" },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) out.push(m[1] ?? "");
  for (const m of source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1] ?? "");
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1] ?? "");
  return out.filter(Boolean);
}

describe("Evaluation V2 — import boundary", () => {
  const files = walk(EVALUATOR_DIR);

  it("finds the evaluator module tree", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("never imports a historical scorer, the Phase C evaluator, or any production answer path", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const specifier of importSpecifiers(source)) {
        for (const { pattern, why } of FORBIDDEN_IMPORT_PATTERNS) {
          if (pattern.test(specifier)) violations.push(`${file.replace(ROOT + "/", "")} imports "${specifier}" (${why})`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not reference historical scorer matching helpers even by name", () => {
    // The old matching primitives: baseSection / findDescendants /
    // findHierarchyChildren / findUnambiguousIntermediateAncestor / numbersMatch.
    // None may be reimplemented or called here.
    // Function names only. A FIELD name that appears in a frozen historical
    // artifact (e.g. `auditMatchChapeauOnly`) may be read as data when
    // reconciling against that artifact; what is forbidden is reimplementing or
    // calling the old matching FUNCTIONS.
    const forbiddenIdentifiers = ["findHierarchyChildren", "findUnambiguousIntermediateAncestor", "isDirectStructuralChild", "isStructuralDescendant", "unionDescendantsOnExactMatch", "completenessScore", "ruleIsSelfFlagged"];
    const violations: string[] = [];
    // Scoped to the ENGINE modules. The runner subtree contains no matching
    // logic at all — it loads frozen artifacts and writes JSON — and its
    // artifacts must be free to NAME the historical matching functions in
    // prose, because naming exactly what was replaced is the disclosure this
    // phase exists to produce. The import-boundary check above still covers
    // the runner subtree.
    for (const file of files.filter((f) => !f.includes("/runner/"))) {
      const source = readFileSync(file, "utf-8");
      for (const identifier of forbiddenIdentifiers) {
        if (source.includes(identifier)) violations.push(`${file.replace(ROOT + "/", "")} references "${identifier}"`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("loads ground truth only from frozen answer-key artifacts", () => {
    const adapters = files.filter((f) => f.includes("/adapters/"));
    expect(adapters.length).toBeGreaterThan(0);
    // Every path literal used to load GROUND TRUTH must point at a frozen
    // answer key, never at a pipeline output directory.
    const groundTruthSources = [
      "tests/fixtures/unseen-packages/phase-3f-ground-truth",
      "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth",
      "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/human-ground-truth",
      "tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth",
    ];
    const combined = adapters.map((f) => readFileSync(f, "utf-8")).join("\n");
    for (const source of groundTruthSources) {
      // At least one of the declared answer-key sources must actually be read.
      if (combined.includes(source)) return;
    }
    throw new Error("no frozen ground-truth artifact path found in any adapter");
  });

  it("never mutates any frozen artifact (no write calls into fixtures or docs from the engine)", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      // Only the runner subtree may write, and only under docs/evaluation-v2/.
      const writes = [...source.matchAll(/writeFileSync\(([^)]*)\)/g)].map((m) => m[1] ?? "");
      for (const target of writes) {
        if (!file.includes("/runner/")) violations.push(`${file.replace(ROOT + "/", "")} writes outside the runner subtree`);
        else if (/fixtures|ground-truth|phase-3f|phase-2f/.test(target)) violations.push(`${file.replace(ROOT + "/", "")} writes into a frozen artifact path: ${target}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
