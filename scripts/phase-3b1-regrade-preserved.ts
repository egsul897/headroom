/**
 * Phase 3B.1 (task §32-33) - ZERO-COST regrading of Phase 3B's preserved
 * real-regression output (tests/fixtures/unseen-packages/
 * phase-3b-real-regression-run/run-1787866714176.json) using the NEW
 * IR-aware content-based grader (grading.ts's gradeRules/matchExpectedToCompiled,
 * task §17-28). Makes NO model calls and reuses the EXACT SAME hand-authored
 * ground truth (CASES, imported from phase-3b-real-regression.ts) against
 * the SAME preserved compiled output - only the matching/grading algorithm
 * changed. This is the "regrade all 12 original cases with the new grader
 * using preserved output" requirement - the live compiler is never re-run
 * for this step, and FWRG/LSB are never called again just to regrade.
 *
 * Run via: npx tsx scripts/phase-3b1-regrade-preserved.ts
 */
import { readFileSync } from "node:fs";
import { CASES } from "./phase-3b-real-regression";
import { gradeRule, gradeRules, summarizeGrading, type ExpectedRuleShape, type SemanticErrorFinding } from "../lib/contract-model/compiler/semantic/grading";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import type { IRRule } from "../lib/contract-model/ir/types";

const PRESERVED_RUN_PATH = "tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json";

interface PreservedRun {
  results: { id: string; result: SemanticCompilationResult }[];
}

function main() {
  const preserved: PreservedRun = JSON.parse(readFileSync(PRESERVED_RUN_PATH, "utf-8"));
  const resultsById = new Map(preserved.results.map((r) => [r.id, r.result]));

  const allFindings: SemanticErrorFinding[] = [];
  const expectationsMap = new Map<string, ExpectedRuleShape>();
  const allResults: SemanticCompilationResult[] = [];

  console.log(`Regrading ${CASES.length} preserved cases from ${PRESERVED_RUN_PATH} with the Phase 3B.1 IR-aware grader (zero-cost, no model calls)\n`);

  for (const c of CASES) {
    const result = resultsById.get(c.id);
    if (!result) {
      console.error(`MISSING preserved result for case ${c.id} - cannot regrade`);
      continue;
    }
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

    console.log(`--- ${c.id} ---`);
    if (findings.length === 0) console.log("  (no findings)");
    for (const f of findings) console.log(`  [${f.dangerous ? "DANGEROUS" : "flagged"}] ${f.category} (${f.ref}): ${f.detail}`);
  }

  const summary = summarizeGrading(allResults, expectationsMap, allFindings);

  console.log("\n================ PHASE 3B.1 PRESERVED-OUTPUT REGRADE SUMMARY ================");
  console.log(`Findings by category:`, summary.byCategory);
  console.log(`Dangerous unflagged findings: ${summary.dangerousCount} / ${summary.findings.length} total findings`);
  console.log(`COMPLETE precision: ${summary.completePrecision === null ? "n/a" : (summary.completePrecision * 100).toFixed(1) + "%"}`);

  // Task §40's own explicit success criterion: lsb-6.13's omission must survive as MISSED_RULE
  // under the new grader, from the PRESERVED output, with no package-specific logic anywhere
  // in the grader itself (grading.ts never mentions "lsb" or "6.13").
  const lsb613Missed = summary.findings.filter((f) => f.ref.startsWith("lsb-6.13") && f.category === "MISSED_RULE");
  console.log(`\nlsb-6.13 preserved-adversarial check: ${lsb613Missed.length} MISSED_RULE finding(s) for lsb-6.13's baskets (expect 2, both dangerous)`);
  for (const f of lsb613Missed) console.log(`  ${f.ref}: dangerous=${f.dangerous}`);

  // Task §17's own confirmed grading-bug regression check: lsb-6.11's $500,000 basket must no
  // longer produce a false WRONG_THRESHOLD finding now that matching is content-based.
  const lsb611Findings = summary.findings.filter((f) => f.ref === "lsb-6.11-restricted-payments");
  console.log(`\nlsb-6.11 false-positive regression check: ${lsb611Findings.length} finding(s) for lsb-6.11 (expect 0 - the $500,000 basket is correctly matched to result.rules[4])`);
  for (const f of lsb611Findings) console.log(`  [${f.category}] ${f.detail}`);
}

main();
