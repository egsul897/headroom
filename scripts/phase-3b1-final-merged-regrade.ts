/**
 * Phase 3B.1 (task §32-33/§41) - the FINAL merged regrade: for the 9 cases
 * never rerun (unaffected by the transport/tool-discipline fixes, or where
 * rerunning would violate the task's own minimality instruction), use the
 * PRESERVED Phase 3B output; for the 3 cases in the minimal real
 * revalidation scope (fwrg-6.10-a, lsb-6.01-general-ratio-gated,
 * lsb-6.11-restricted-payments), use the FRESH real Phase 3B.1 output. Every
 * case is graded with the SAME new IR-aware content-based grader
 * (gradeRules/gradeRule). This is the single source of truth for Phase
 * 3B.1's final report metrics.
 */
import { readFileSync, readdirSync } from "node:fs";
import { CASES } from "./phase-3b-real-regression";
import { gradeRule, gradeRules, summarizeGrading, type ExpectedRuleShape, type SemanticErrorFinding } from "../lib/contract-model/compiler/semantic/grading";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import type { IRRule } from "../lib/contract-model/ir/types";

const PRESERVED_PHASE_3B_RUN = "tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json";
const REVALIDATION_RERUN_DIR = "tests/fixtures/unseen-packages/phase-3b1-real-revalidation-rerun";
const REVALIDATED_CASE_IDS = new Set(["fwrg-6.10-a", "lsb-6.01-general-ratio-gated", "lsb-6.11-restricted-payments"]);

interface RunFile {
  results: { id: string; result: SemanticCompilationResult }[];
}

function main() {
  const preserved: RunFile = JSON.parse(readFileSync(PRESERVED_PHASE_3B_RUN, "utf-8"));
  const resultsById = new Map(preserved.results.map((r) => [r.id, r.result]));

  // Overlay every revalidation-rerun file (both the fwrg-6.10-a success and the later 2-case
  // retry) so the freshest real result for each of the 3 revalidated cases wins.
  const rerunFiles = readdirSync(REVALIDATION_RERUN_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort(); // filenames are run-<timestamp>.json - lexical sort == chronological
  for (const file of rerunFiles) {
    const run: RunFile = JSON.parse(readFileSync(`${REVALIDATION_RERUN_DIR}/${file}`, "utf-8"));
    for (const r of run.results) resultsById.set(r.id, r.result);
  }

  const allFindings: SemanticErrorFinding[] = [];
  const expectationsMap = new Map<string, ExpectedRuleShape>();
  const allResults: SemanticCompilationResult[] = [];
  const sourceById: Record<string, "PRESERVED_PHASE_3B" | "FRESH_PHASE_3B1_REVALIDATION"> = {};

  for (const c of CASES) {
    const result = resultsById.get(c.id);
    if (!result) {
      console.error(`MISSING result for case ${c.id}`);
      continue;
    }
    sourceById[c.id] = REVALIDATED_CASE_IDS.has(c.id) ? "FRESH_PHASE_3B1_REVALIDATION" : "PRESERVED_PHASE_3B";
    allResults.push(result);

    let findings: SemanticErrorFinding[];
    if (c.kind === "definition") {
      const compiledAsRule = result.definitions[0]
        ? ({ action: null, posture: "N_A", capacityExpression: result.definitions[0].calculationExpression, sufficiency: result.definitions[0].sufficiency, conditions: [] } as unknown as IRRule)
        : undefined;
      findings = gradeRule(compiledAsRule, c.expected[0]!);
      expectationsMap.set(c.expected[0]!.ref, c.expected[0]!);
    } else {
      for (const exp of c.expected) expectationsMap.set(exp.ref, exp);
      findings = gradeRules(result.rules, c.expected);
    }
    allFindings.push(...findings);

    console.log(`--- ${c.id} [${sourceById[c.id]}] ---`);
    console.log(`  status=${result.status} rules=${result.rules.length} definitions=${result.definitions.length} failureReasons=${result.failureReasons.join(",") || "(none)"}`);
    if (findings.length === 0) console.log("  (no findings)");
    for (const f of findings) console.log(`  [${f.dangerous ? "DANGEROUS" : "flagged"}] ${f.category} (${f.ref}): ${f.detail}`);
  }

  const summary = summarizeGrading(allResults, expectationsMap, allFindings);

  console.log("\n================ PHASE 3B.1 FINAL MERGED REGRADE SUMMARY ================");
  console.log(`Cases: ${CASES.length} total, ${Object.values(sourceById).filter((s) => s === "FRESH_PHASE_3B1_REVALIDATION").length} freshly revalidated, ${Object.values(sourceById).filter((s) => s === "PRESERVED_PHASE_3B").length} preserved from Phase 3B`);
  console.log(`Findings by category:`, summary.byCategory);
  console.log(`Dangerous unflagged findings: ${summary.dangerousCount} / ${summary.findings.length} total findings`);
  console.log(`COMPLETE precision: ${summary.completePrecision === null ? "n/a" : (summary.completePrecision * 100).toFixed(1) + "%"}`);

  console.log("\n--- Transport reliability (task §41 metric) ---");
  for (const id of ["fwrg-6.10-a", "lsb-6.01-general-ratio-gated"]) {
    const r = resultsById.get(id)!;
    const stillTruncated = r.failureReasons.includes("OUTPUT_TRUNCATED") || (r.failureReasons.includes("MODEL_SCHEMA_FAILURE") && r.rules.length === 0);
    console.log(`  ${id}: Phase 3B=FAILED(MODEL_SCHEMA_FAILURE/truncation) -> Phase 3B.1=${r.status}(${r.failureReasons.join(",") || "none"}) -> ${stillTruncated ? "STILL BROKEN" : "FIXED"}`);
  }

  console.log("\n--- Tool discipline (task §41 metric) ---");
  const lsb611 = resultsById.get("lsb-6.11-restricted-payments")!;
  console.log(`  lsb-6.11-restricted-payments toolCallLog (${lsb611.toolCallLog.length}): ${lsb611.toolCallLog.map((t) => `${t.toolName}(${JSON.stringify(t.input)})`).join(", ")}`);
  const attemptedReferencedProvision = lsb611.toolCallLog.some((t) => t.toolName === "getReferencedProvision");
  const attemptedDefinition = lsb611.toolCallLog.some((t) => t.toolName === "getDefinition");
  console.log(`  attempted getReferencedProvision: ${attemptedReferencedProvision}, attempted getDefinition: ${attemptedDefinition} (both were ZERO in the preserved Phase 3B run)`);

  console.log("\n--- lsb-6.13 preserved-adversarial check (task §40) ---");
  const lsb613Missed = summary.findings.filter((f) => f.ref.startsWith("lsb-6.13") && f.category === "MISSED_RULE");
  for (const f of lsb613Missed) console.log(`  ${f.ref}: dangerous=${f.dangerous}`);
}

main();
