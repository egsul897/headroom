/**
 * Evaluation Methodology V2 — full artifact regeneration.
 *
 * Phase 3F.1.5. Regenerates every artifact this evaluator owns, in the order
 * they depend on each other. Artifacts 08, 13 and 14 are deliberately NOT
 * written here: 08 belongs to the independent second-pass adjudicator, and
 * 13/14 belong to the orchestrator after that review completes.
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/run-all.ts
 */
import { runAdversarial } from "./run-adversarial";
import { runCrossDataset } from "./run-cross-dataset";
import { runDsgr } from "./run-dsgr";
import { runReproducibility } from "./run-reproducibility";
import { writeDiffClassification } from "./write-diff-classification";
import { writeSpecArtifacts } from "./write-spec";

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const started = Date.now();
  const written: { path: string; sha256: string; bytes: number }[] = [];

  console.log("[1/6] specification + independence matrix");
  written.push(...writeSpecArtifacts(repoRoot));

  console.log("[2/6] adversarial synthetic suite");
  const adversarial = await runAdversarial(repoRoot);
  written.push(...adversarial.writtenArtifacts);
  console.log(`      ${adversarial.passed} passed, ${adversarial.failed} failed`);

  console.log("[3/6] DSGR historical validation + false-credit reconciliation + stratified sample");
  const dsgr = await runDsgr(repoRoot);
  written.push(...dsgr.writtenArtifacts);
  console.log(`      ${dsgr.result.units.length} units; dangerousUnaccountedV2=${dsgr.result.metrics.dangerousUnaccountedCount}`);

  console.log("[4/6] cross-dataset generalization (FWRG / LSB / CONMED)");
  const cross = await runCrossDataset(repoRoot);
  written.push(...cross.writtenArtifacts);

  console.log("[5/6] reproducibility + cost");
  const repro = await runReproducibility(repoRoot);
  written.push(...repro.writtenArtifacts);
  console.log(`      ${repro.identical ? "fresh and replay dispositions are identical" : "DIFFERENCES FOUND"}`);

  console.log("[6/6] diff classification");
  written.push(...writeDiffClassification(repoRoot));

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s. Artifacts:`);
  for (const a of written.sort((a, b) => a.path.localeCompare(b.path))) console.log(`  ${a.path}  ${a.bytes} bytes  sha256=${a.sha256.slice(0, 16)}…`);
}

void main();
