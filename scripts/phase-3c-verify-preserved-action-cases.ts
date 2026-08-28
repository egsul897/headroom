/**
 * Phase 3C (task §21) - REAL, minimal, user-authorized verification of the
 * PRESERVED Phase 3B real-regression output for the two confirmed action-
 * misclassification cases (correct economics, wrong action label:
 * fwrg-6.01-g-i expected GUARANTEE_DEBT got OTHER; fwrg-6.04-a-x expected
 * PAY_DIVIDEND got OTHER). No recompilation - the exact preserved IR is
 * reused as the proposed representation being checked.
 *
 * This requires a REAL adversarial semantic review (Layer 2) because action-
 * classification fidelity is inherently a semantic judgment Layer 1's
 * purely numeric/structural reconciliation cannot make (task §21's own
 * "the verifier should independently detect when source language clearly
 * implies an action inconsistent with OTHER" - a reading-comprehension
 * task, not a regex match).
 *
 * Success criterion (task §21): the verifier reports a WRONG_ACTION finding
 * for each case WITHOUT being told the expected action label anywhere in
 * production code, while NOT treating the (already-correct) economics as
 * wrong just because the action differs.
 *
 * Run via: npx tsx --env-file=.env.local scripts/phase-3c-verify-preserved-action-cases.ts
 * (or DRY_RUN=1 to validate case resolution at zero cost first)
 */
import { readFileSync } from "node:fs";
import { CASES, buildCompilerInputForCase, loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import type { VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";

const PRESERVED_RUN_PATH = "tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json";
const TARGET_CASE_IDS = ["fwrg-6.01-g-i", "fwrg-6.04-a-x"];

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const caller = getStageCaller();
  console.log(`Phase 3C action-classification adversarial check - provider=${caller.providerName} model=${caller.model} synthetic=${caller.isSynthetic} dryRun=${dryRun}`);
  if (caller.isSynthetic && !dryRun) {
    console.error("No real credential found - refusing to run with a synthetic caller. Run via: npx tsx --env-file=.env.local scripts/phase-3c-verify-preserved-action-cases.ts (or DRY_RUN=1).");
    process.exit(1);
  }

  const preserved: { results: { id: string; result: SemanticCompilationResult }[] } = JSON.parse(readFileSync(PRESERVED_RUN_PATH, "utf-8"));
  const { index, exactTermsByDocument } = loadFwrgLsbStructuralIndex();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  for (const caseId of TARGET_CASE_IDS) {
    const preservedResult = preserved.results.find((r) => r.id === caseId)?.result;
    const c = CASES.find((c) => c.id === caseId);
    if (!preservedResult || !c) {
      console.error(`SKIP ${caseId}: missing preserved result or CASES entry`);
      continue;
    }
    const compilerInput = buildCompilerInputForCase(c, index, exactTermsByDocument);
    if (!compilerInput) {
      console.error(`SKIP ${caseId}: could not rebuild compiler input`);
      continue;
    }

    console.log(`\n--- verifying ${caseId} (§${compilerInput.sourceSectionRef}) ---`);
    console.log(`  preserved rule action(s): ${preservedResult.rules.map((r) => r.action).join(", ")}`);
    if (dryRun) {
      console.log(`  [dry run] operativeSourceText (${compilerInput.operativeSourceText.length} chars): ${compilerInput.operativeSourceText.slice(0, 200)}...`);
      continue;
    }

    const input: VerificationInput = { compilerInput, compilationResult: preservedResult };
    const result = await verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: caller });

    console.log(`  status=${result.status} semanticReviewInvoked=${result.semanticReviewInvoked}`);
    for (const f of result.findings) {
      console.log(`  [${f.severity}] ${f.findingType} (method=${f.verificationMethod}): ${f.verifierReasoning}`);
    }

    const wrongActionFindings = result.findings.filter((f) => f.findingType === "WRONG_ACTION");
    const wrongAmountFindings = result.findings.filter((f) => f.findingType === "WRONG_AMOUNT" || f.findingType === "WRONG_PERCENT" || f.findingType === "WRONG_METRIC");
    console.log(`  WRONG_ACTION findings: ${wrongActionFindings.length}, WRONG_AMOUNT/PERCENT/METRIC findings (should be 0 - economics were correct): ${wrongAmountFindings.length}`);

    const t = caller.lastTelemetry();
    if (t) {
      totalInputTokens += t.inputTokens ?? 0;
      totalOutputTokens += t.outputTokens ?? 0;
      totalCostUsd += t.calculatedCostUsd ?? 0;
      console.log(`  telemetry: inputTokens=${t.inputTokens} outputTokens=${t.outputTokens} costUsd=${t.calculatedCostUsd?.toFixed(4)}`);
    }
  }

  if (!dryRun) {
    console.log(`\n=== TOTAL: inputTokens=${totalInputTokens} outputTokens=${totalOutputTokens} costUsd=$${totalCostUsd.toFixed(4)} ===`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
