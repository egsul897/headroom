/**
 * Phase 3B.1 (task §32-33) - the MINIMAL real, paid revalidation rerun.
 * Explicit user authorization obtained before running this against the real
 * model. Scope is deliberately narrow, per the task's own cost-discipline
 * requirement ("do not rerun all 12 merely for convenience if grading can
 * operate on preserved output" - already done, zero-cost, in
 * scripts/phase-3b1-regrade-preserved.ts):
 *
 *   - fwrg-6.10-a               (confirmed MODEL_SCHEMA_FAILURE/transport truncation in Phase 3B)
 *   - lsb-6.01-general-ratio-gated (confirmed MODEL_SCHEMA_FAILURE/transport truncation in Phase 3B)
 *   - lsb-6.11-restricted-payments (confirmed tool-under-use case: rules (b)/(c) were marked
 *     UNSUPPORTED/MISSING_CONTEXT without an observed getReferencedProvision/getDefinition call)
 *
 * Reuses the EXACT SAME ground truth (CASES) and document/context-building
 * logic (loadFwrgLsbStructuralIndex/buildCompilerInputForCase) as the
 * original Phase 3B real regression - never a forked copy - so the only
 * variable between this run and the preserved Phase 3B run is the Phase
 * 3B.1 compiler fix itself (raised MAX_TOKENS + partial-output recovery +
 * retrieval-before-give-up nudge, bumped ALGORITHM/PROMPT/TOOL_POLICY
 * versions so the cache never silently reuses stale Phase 3B output for
 * these exact inputs).
 *
 * Run via: npx tsx --env-file=.env.local scripts/phase-3b1-real-revalidation-rerun.ts
 * (or DRY_RUN=1 to validate section resolution at zero cost first)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { buildCompilerInputForCase, loadFwrgLsbStructuralIndex, CASES } from "./phase-3b-real-regression";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { gradeRule, gradeRules, summarizeGrading, type ExpectedRuleShape, type SemanticErrorFinding } from "../lib/contract-model/compiler/semantic/grading";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";

/**
 * fwrg-6.10-a already completed successfully in an earlier invocation of this script (before the
 * Gateway key's budget cap was hit) - its real result is preserved in
 * tests/fixtures/unseen-packages/phase-3b1-real-revalidation-rerun/run-1787870304722.json, so this
 * retry (after the user raised the budget) targets only the 2 cases that failed with a 402 quota
 * error, never spending again on a case that already produced a real, valid result.
 */
const TARGET_CASE_IDS = ["lsb-6.01-general-ratio-gated", "lsb-6.11-restricted-payments"];

async function main() {
  const { index, exactTermsByDocument } = loadFwrgLsbStructuralIndex();
  const targetCases = CASES.filter((c) => TARGET_CASE_IDS.includes(c.id));
  if (targetCases.length !== TARGET_CASE_IDS.length) {
    console.error(`Expected ${TARGET_CASE_IDS.length} target cases, found ${targetCases.length} - CASES may have changed. Aborting.`);
    process.exit(1);
  }

  const dryRun = process.env.DRY_RUN === "1";
  const caller = getSemanticCaller();
  console.log(`Phase 3B.1 minimal real revalidation rerun - provider=${caller.providerName} model=${caller.model} synthetic=${caller.isSynthetic} dryRun=${dryRun}`);
  console.log(`Target cases (${targetCases.length}): ${TARGET_CASE_IDS.join(", ")}\n`);
  if (caller.isSynthetic && !dryRun) {
    console.error("No real credential found - refusing to run with a synthetic caller. Run via: npx tsx --env-file=.env.local scripts/phase-3b1-real-revalidation-rerun.ts (or DRY_RUN=1).");
    process.exit(1);
  }

  const allFindings: SemanticErrorFinding[] = [];
  const expectationsMap = new Map<string, ExpectedRuleShape>();
  const allResults: { id: string; result: SemanticCompilationResult }[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLatencyMs = 0;
  let totalCostUsd = 0;
  let totalToolCalls = 0;

  for (const c of targetCases) {
    const compilerInput = buildCompilerInputForCase(c, index, exactTermsByDocument);
    if (!compilerInput) continue;

    console.log(`\n--- compiling ${c.id} (${c.kind === "section" ? `§${c.sectionRef}` : c.termName}) ---`);
    if (dryRun) {
      console.log(`  [dry run] operativeSourceText (${compilerInput.operativeSourceText.length} chars): ${compilerInput.operativeSourceText.slice(0, 200)}...`);
      console.log(`  [dry run] contextBundle items: ${compilerInput.contextBundle.items.length}, unresolvedDependencies: ${compilerInput.contextBundle.unresolvedDependencies.length}`);
      continue;
    }

    let result: SemanticCompilationResult;
    try {
      result = await compileCovenantToIR(compilerInput);
    } catch (err) {
      console.error(`ERROR compiling ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    console.log(`status=${result.status} rules=${result.rules.length} definitions=${result.definitions.length} failureReasons=${result.failureReasons.join(",") || "(none)"}`);
    for (const rule of result.rules) console.log(`  rule ${rule.ruleId.slice(0, 20)}... action=${rule.action} posture=${rule.posture} sufficiency=${rule.sufficiency}`);
    for (const def of result.definitions) console.log(`  definition ${def.termName} sufficiency=${def.sufficiency}`);
    console.log(`  toolCallLog (${result.toolCallLog.length}): ${result.toolCallLog.map((t) => t.toolName).join(", ") || "(none)"}`);
    if (result.telemetry) {
      totalInputTokens += result.telemetry.inputTokens ?? 0;
      totalOutputTokens += result.telemetry.outputTokens ?? 0;
      totalLatencyMs += result.telemetry.latencyMs;
      totalCostUsd += result.telemetry.calculatedCostUsd ?? 0;
    }
    totalToolCalls += result.toolCallLog.length;
    allResults.push({ id: c.id, result });

    if (c.kind === "definition") {
      const compiledAsRule = result.definitions[0]
        ? ({ action: null, posture: "N_A", capacityExpression: result.definitions[0].calculationExpression, sufficiency: result.definitions[0].sufficiency, conditions: [] } as never)
        : undefined;
      allFindings.push(...gradeRule(compiledAsRule, c.expected[0]!));
      expectationsMap.set(c.expected[0]!.ref, c.expected[0]!);
    } else {
      for (const exp of c.expected) expectationsMap.set(exp.ref, exp);
      allFindings.push(...gradeRules(result.rules, c.expected));
    }
  }

  if (dryRun) return;

  const summary = summarizeGrading(
    allResults.map((r) => r.result),
    expectationsMap,
    allFindings
  );

  console.log("\n================ PHASE 3B.1 MINIMAL REAL REVALIDATION RERUN SUMMARY ================");
  console.log(`Provider: ${caller.providerName} / ${caller.model}`);
  console.log(`Cases attempted: ${targetCases.length}, results collected: ${allResults.length}`);
  console.log(`Total input tokens: ${totalInputTokens}, output tokens: ${totalOutputTokens}`);
  console.log(`Total calculated cost (PROJECTED): $${totalCostUsd.toFixed(4)}`);
  console.log(`Total latency: ${totalLatencyMs}ms, total tool calls: ${totalToolCalls}`);
  console.log("\nAll findings:");
  for (const f of summary.findings) console.log(`  [${f.dangerous ? "DANGEROUS" : "flagged"}] ${f.category} (${f.ref}): ${f.detail}`);

  console.log("\n--- Transport reliability check (task §32) ---");
  for (const id of ["fwrg-6.10-a", "lsb-6.01-general-ratio-gated"]) {
    const r = allResults.find((r) => r.id === id)?.result;
    const truncated = r?.failureReasons.includes("OUTPUT_TRUNCATED") || r?.failureReasons.includes("MODEL_SCHEMA_FAILURE");
    console.log(`  ${id}: status=${r?.status ?? "MISSING"} failureReasons=${r?.failureReasons.join(",") || "(none)"} -> ${truncated ? "STILL TRUNCATED/SCHEMA-FAILED" : "NO LONGER TRUNCATED"}`);
  }

  console.log("\n--- Tool discipline check (task §32) ---");
  const lsb611 = allResults.find((r) => r.id === "lsb-6.11-restricted-payments")?.result;
  console.log(`  lsb-6.11-restricted-payments toolCallLog: ${lsb611?.toolCallLog.map((t) => t.toolName).join(", ") || "(none)"}`);

  const outDir = "tests/fixtures/unseen-packages/phase-3b1-real-revalidation-rerun";
  mkdirSync(outDir, { recursive: true });
  const outFile = `${outDir}/run-${Date.now()}.json`;
  writeFileSync(outFile, JSON.stringify({ provider: caller.providerName, model: caller.model, totalInputTokens, totalOutputTokens, totalCostUsd, totalLatencyMs, totalToolCalls, summary, results: allResults }, null, 2));
  console.log(`\nFull results written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
