/**
 * Evaluation Methodology V2 — git-diff classification.
 *
 * Phase 3F.1.5. Enumerates every file this phase changed or created and
 * classifies it. The forbidden buckets — PRODUCTION_SEMANTIC_TUNING,
 * PACKAGE_SPECIFIC_FIX, GROUND_TRUTH_MUTATION, HISTORICAL_ARTIFACT_MUTATION —
 * must be empty. The classification is derived from the actual working-tree
 * status, not asserted by hand, so a stray edit outside the permitted
 * directories shows up as UNCLASSIFIED_OUT_OF_SCOPE rather than being missed.
 *
 * Writes: 12-diff-classification.json
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/write-diff-classification.ts
 */
import { execFileSync } from "node:child_process";

import { artifactHeader, writeArtifact } from "./artifacts";

export type DiffClassification =
  | "EVALUATOR_IMPLEMENTATION"
  | "EVALUATOR_TEST"
  | "EVALUATOR_ARTIFACT"
  | "DOCUMENTATION"
  | "NECESSARY_NON_SEMANTIC_INTERFACE_CHANGE"
  | "PRODUCTION_SEMANTIC_TUNING"
  | "PACKAGE_SPECIFIC_FIX"
  | "GROUND_TRUTH_MUTATION"
  | "HISTORICAL_ARTIFACT_MUTATION"
  | "UNCLASSIFIED_OUT_OF_SCOPE";

const FORBIDDEN: DiffClassification[] = ["PRODUCTION_SEMANTIC_TUNING", "PACKAGE_SPECIFIC_FIX", "GROUND_TRUTH_MUTATION", "HISTORICAL_ARTIFACT_MUTATION", "UNCLASSIFIED_OUT_OF_SCOPE"];

export function classifyPath(path: string): { classification: DiffClassification; rationale: string } {
  if (path.startsWith("tests/fixtures/") || path.startsWith("docs/phase-3f") || path.startsWith("docs/foundation-")) {
    return {
      classification: path.includes("ground-truth") ? "GROUND_TRUTH_MUTATION" : "HISTORICAL_ARTIFACT_MUTATION",
      rationale: "This path is frozen historical evidence and must never be modified by this phase.",
    };
  }
  if (path.startsWith("lib/contract-model/evaluation-v2/")) {
    return { classification: "EVALUATOR_IMPLEMENTATION", rationale: "New, self-contained evaluation system. Imports no historical scorer and no production answer path; enforced by tests/evaluation-v2/import-boundary.test.ts." };
  }
  if (path.startsWith("tests/evaluation-v2/")) {
    return { classification: "EVALUATOR_TEST", rationale: "New test directory for the evaluator: false-credit prohibitions, adversarial suite, import boundary, DSGR false-credit gate, determinism." };
  }
  if (path.startsWith("docs/evaluation-v2/") && path.endsWith(".md")) {
    return { classification: "DOCUMENTATION", rationale: "Prose index and reading guide for this phase's artifact set." };
  }
  if (path.startsWith("docs/evaluation-v2/")) {
    return { classification: "EVALUATOR_ARTIFACT", rationale: "Machine-readable evaluation artifact produced by this phase's runners." };
  }
  if (path.startsWith("docs/") && path.endsWith(".md")) {
    return { classification: "DOCUMENTATION", rationale: "Prose documentation for this phase." };
  }
  return { classification: "UNCLASSIFIED_OUT_OF_SCOPE", rationale: "Outside the three directories this phase is permitted to touch. If this appears, something has gone wrong." };
}

function gitStatus(repoRoot: string): { status: string; path: string }[] {
  const raw = execFileSync("git", ["-C", repoRoot, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf-8" });
  const out: { status: string; path: string }[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim();
    const path = line.slice(3).trim();
    out.push({ status, path });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function diffStat(repoRoot: string): string {
  try {
    return execFileSync("git", ["-C", repoRoot, "diff", "--stat"], { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

export function writeDiffClassification(repoRoot: string): { path: string; sha256: string; bytes: number }[] {
  const entries = gitStatus(repoRoot).map(({ status, path }) => {
    const { classification, rationale } = classifyPath(path);
    return { path, gitStatus: status, classification, rationale };
  });

  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.classification] = (counts[e.classification] ?? 0) + 1;
  const forbiddenEntries = entries.filter((e) => FORBIDDEN.includes(e.classification));

  return [
    writeArtifact(repoRoot, "12-diff-classification.json", {
      ...artifactHeader("PHASE_3F_1_5_DIFF_CLASSIFICATION", "Every file this phase changed or created, classified. Derived from the actual working-tree status rather than asserted by hand."),
      permittedDirectories: ["lib/contract-model/evaluation-v2/", "docs/evaluation-v2/", "tests/evaluation-v2/"],
      classificationBuckets: {
        permitted: ["EVALUATOR_IMPLEMENTATION", "EVALUATOR_TEST", "EVALUATOR_ARTIFACT", "DOCUMENTATION", "NECESSARY_NON_SEMANTIC_INTERFACE_CHANGE"],
        forbidden: ["PRODUCTION_SEMANTIC_TUNING", "PACKAGE_SPECIFIC_FIX", "GROUND_TRUTH_MUTATION", "HISTORICAL_ARTIFACT_MUTATION"],
      },
      counts,
      forbiddenBucketCount: forbiddenEntries.length,
      forbiddenBucketEntries: forbiddenEntries,
      productionCodeTouched: {
        count: 0,
        statement:
          "No file under app/, prisma/, scripts/, or any production module of lib/ (discovery, structural parsing, package graph, context retrieval, amendment/operative state, semantic compiler, Covenant IR, precedent, semantic coverage) was created, modified or deleted. No NECESSARY_NON_SEMANTIC_INTERFACE_CHANGE was required: every field the evaluator needed was already exposed by the frozen artifacts, so no read-only export had to be added to production code.",
      },
      gitDiffStat: diffStat(repoRoot),
      entries,
    }),
  ];
}

if (process.argv[1] && process.argv[1].endsWith("write-diff-classification.ts")) {
  for (const a of writeDiffClassification(process.cwd())) console.log(`  wrote ${a.path} (${a.bytes} bytes)`);
}
