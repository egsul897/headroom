/**
 * Phase 3F §9/§169 - seal the frozen first-blind run's artifacts with a
 * machine-readable, content-hashed integrity manifest, written AFTER the
 * run finished (scripts/phase-3f-first-blind-run.ts) and BEFORE any
 * ground truth is authored (task #170) or any scoring happens (#171) -
 * so anyone can later prove scoring referred to this exact original
 * output, not a silently corrected or re-run version.
 *
 * Run via: npx tsx scripts/phase-3f-seal-first-run.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const RUN_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const MANIFEST_PATH = join(RUN_DIR, "phase-3f-first-run-integrity-manifest.json");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const entries = readdirSync(RUN_DIR)
    .filter((name) => name.endsWith(".json") && name !== "phase-3f-first-run-integrity-manifest.json")
    .sort();

  const files = entries.map((name) => {
    const path = join(RUN_DIR, name);
    const stat = statSync(path);
    return { path: `${RUN_DIR}/${name}`, bytes: stat.size, sha256: sha256(path) };
  });

  const aggregateHash = createHash("sha256").update(files.map((f) => `${f.path}:${f.sha256}`).join("\n")).digest("hex");

  const finalSummary = JSON.parse(readFileSync(join(RUN_DIR, "final-summary.json"), "utf-8"));

  const gitCommitsForRunArtifacts = execSync(
    `git log --format=%H -- ${RUN_DIR} scripts/phase-3f-first-blind-run.ts`,
    { encoding: "utf-8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  const headSha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();

  const manifest = {
    manifestId: "PHASE_3F_FIRST_RUN_INTEGRITY_MANIFEST",
    recordedAt: new Date().toISOString(),
    runId: finalSummary.runId,
    runFinishedAt: finalSummary.finishedAt,
    statement:
      "This manifest hashes every artifact produced by the frozen, zero-manual-selection first-blind pipeline run (scripts/phase-3f-first-blind-run.ts) against the DSGR unseen package, recorded immediately after the run finished and before any ground truth was authored (task #170) or any scoring was performed (#171). Any subsequent scoring, diagnosis, or report MUST reference these exact hashes - a re-run, edit, or regeneration of any listed file after this manifest was recorded would change its hash and must be treated as a violation of the frozen-run discipline, not silently accepted as equivalent.",
    sealedAtGitCommit: headSha,
    gitCommitsCarryingRunArtifacts: gitCommitsForRunArtifacts,
    fileCount: files.length,
    aggregateHash,
    files,
    finalSummaryRecap: {
      totalCostUsd: finalSummary.totalCostUsd,
      budgetCeilingUsd: finalSummary.budgetCeilingUsd,
      documentsProcessed: finalSummary.documentsProcessed,
      totalStructuralNodes: finalSummary.totalStructuralNodes,
      totalDiscoveredCandidates: finalSummary.totalDiscoveredCandidates,
      eligibleForCompilation: finalSummary.eligibleForCompilation,
      candidatesCompiled: finalSummary.candidatesCompiled,
      candidatesVerified: finalSummary.candidatesVerified,
      candidatesFullyVerified: finalSummary.candidatesFullyVerified,
      packageCoverageStatus: finalSummary.packageCoverageStatus,
    },
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Sealed ${files.length} artifacts.`);
  console.log(`Aggregate hash: ${aggregateHash}`);
  console.log(`Manifest written to ${MANIFEST_PATH}`);
}

main();
