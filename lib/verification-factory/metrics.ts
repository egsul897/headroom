/**
 * Quality metrics — always report denominators alongside false-favorable counts.
 */

import { CVF_METRICS_VERSION, CVF_VERSION } from "./version";
import type { CaseExecutionResult, CvfMetrics, FixtureClass, VerificationLane } from "./types";

export function aggregateMetrics(results: CaseExecutionResult[]): CvfMetrics {
  const lanes: Partial<Record<VerificationLane, number>> = {};
  const fixtureClasses: Record<FixtureClass, number> = {
    PUBLIC_DEVELOPMENT: 0,
    FROZEN_REGRESSION: 0,
    BLIND_AUTHENTIC_HOLDOUT: 0,
    NEWLY_ACQUIRED_UNSEEN: 0,
  };
  const byMechanic: CvfMetrics["byMechanic"] = {};
  const structureFamilies = new Set<string>();
  const packages = new Set<string>();

  let correctFavorable = 0;
  let correctRefusals = 0;
  let incorrectFavorable = 0;
  let incorrectRefusals = 0;
  let materialRestrictionOmissions = 0;
  let incorrectFinancialCalculations = 0;
  let unsupportedSemanticClaims = 0;
  let unresolvedCases = 0;

  for (const r of results) {
    lanes[r.lane] = (lanes[r.lane] ?? 0) + 1;
    fixtureClasses[r.fixtureClass] = (fixtureClasses[r.fixtureClass] ?? 0) + 1;
    for (const f of r.structureFamilies) structureFamilies.add(f);
    const m = byMechanic[r.lane] ?? { executions: 0, incorrectFavorable: 0 };
    m.executions += 1;
    if (r.grade === "INCORRECT_FAVORABLE") m.incorrectFavorable += 1;
    byMechanic[r.lane] = m;

    switch (r.grade) {
      case "CORRECT_FAVORABLE":
        correctFavorable += 1;
        break;
      case "CORRECT_REFUSAL":
        correctRefusals += 1;
        break;
      case "INCORRECT_FAVORABLE":
        incorrectFavorable += 1;
        break;
      case "INCORRECT_REFUSAL":
        incorrectRefusals += 1;
        break;
      case "MATERIAL_OMISSION":
        materialRestrictionOmissions += 1;
        break;
      case "INCORRECT_FINANCIAL":
        incorrectFinancialCalculations += 1;
        break;
      case "UNSUPPORTED_SEMANTIC":
        unsupportedSemanticClaims += 1;
        break;
      case "UNRESOLVED":
        unresolvedCases += 1;
        break;
      default:
        break;
    }
    if (r.materialOmissions.length) materialRestrictionOmissions += r.materialOmissions.length;
  }

  // Unique packages approximated from structure family tags prefixed package:
  for (const f of structureFamilies) {
    if (f.startsWith("package:")) packages.add(f.slice("package:".length));
  }

  return {
    version: CVF_METRICS_VERSION,
    factoryVersion: CVF_VERSION,
    totalExecutions: results.length,
    uniqueAuthenticScenarios: results.filter(
      (r) =>
        r.fixtureClass === "BLIND_AUTHENTIC_HOLDOUT" ||
        r.fixtureClass === "NEWLY_ACQUIRED_UNSEEN" ||
        r.structureFamilies.some((f) => f.startsWith("authentic:")),
    ).length,
    uniqueFinancingPackages: packages.size,
    independentGroundTruthCases: results.length,
    correctFavorable,
    correctRefusals,
    incorrectFavorable,
    incorrectRefusals,
    materialRestrictionOmissions,
    incorrectFinancialCalculations,
    unsupportedSemanticClaims,
    unresolvedCases,
    denominators: {
      casesWithIndependentGt: results.length,
      structureFamilies: structureFamilies.size,
      fixtureClasses,
      lanes,
    },
    byMechanic,
    note:
      "Zero incorrectFavorable is only meaningful with denominators (casesWithIndependentGt, structureFamilies, fixtureClasses). Do not optimize for pass counts.",
  };
}

export function formatMetricsReport(m: CvfMetrics): string {
  const lines = [
    `# CVF Metrics (${m.version})`,
    ``,
    `| Metric | Value |`,
    `|---|---:|`,
    `| Total executions | ${m.totalExecutions} |`,
    `| Unique authentic scenarios | ${m.uniqueAuthenticScenarios} |`,
    `| Unique financing packages | ${m.uniqueFinancingPackages} |`,
    `| Independent GT cases | ${m.independentGroundTruthCases} |`,
    `| Correct favorable | ${m.correctFavorable} |`,
    `| Correct refusals | ${m.correctRefusals} |`,
    `| **Incorrect favorable** | **${m.incorrectFavorable}** |`,
    `| Incorrect refusals | ${m.incorrectRefusals} |`,
    `| Material restriction omissions | ${m.materialRestrictionOmissions} |`,
    `| Incorrect financial calculations | ${m.incorrectFinancialCalculations} |`,
    `| Unsupported semantic claims | ${m.unsupportedSemanticClaims} |`,
    `| Unresolved cases | ${m.unresolvedCases} |`,
    `| Structure families (denominator) | ${m.denominators.structureFamilies} |`,
    ``,
    m.note,
  ];
  return lines.join("\n");
}
