/**
 * Solver-native ratio tests (Rule 185).
 *
 * A financial-maintenance covenant is a TEST, not a grant (Rule
 * 180): it compiles to a CovenantProvision with a ratio
 * formulaType, never a Permission. Until this rule, the solver
 * never saw those provisions — `runSolver` reported
 * `ratioTests: []` and a SOLVER_NATIVE document's per-document
 * result could claim CLEAR for a transaction that breaches a
 * maintenance covenant (the aggregate `simulateDebtIncurrence`
 * still blocked via the legacy `buildDebtRatioTests`, so the
 * overall answer was right while the per-document solver result
 * and its maximum-capacity were ratio-blind).
 *
 * The evaluation math mirrors `buildDebtRatioTests`
 * (lib/covenant-engine.ts) deliberately: same pro forma ratios,
 * same thresholds, same zero-rate fail-closed. A test that
 * diverges from the legacy math is a bug in one of the two —
 * the agreement test in tests/solver/ratio.test.ts pins it.
 *
 * Scope: status gating + reporting only. `maximumCapacity`
 * remains election-derived and is NOT capped by the
 * ratio-implied ceiling (capping would require re-evaluating
 * the winning election at the capped amount and rebuilding its
 * path); a TESTED amount's status is exact, the ceiling may
 * exceed the ratio-implied max.
 */
import type { FinancialSnapshotInput } from "../covenant-engine";
import type { RatioProvision, RatioTestResult } from "./types";

export function evaluateRatioTests(
  provisions: RatioProvision[],
  financials: FinancialSnapshotInput,
  amount: number,
  secured: boolean,
): RatioTestResult[] {
  const fin = financials;
  const results: RatioTestResult[] = [];
  for (const p of provisions) {
    const base = {
      permissionId: "",
      provisionId: p.id,
      documentId: p.documentId,
      sectionRef: p.sectionRef,
      basketName: p.basketName,
      threshold: p.thresholdValue,
    };
    if (p.formulaType === "LEVERAGE_RATIO_ROOM") {
      const basis = p.debtBasis ?? "total";
      // A secured-basis test does not apply to an unsecured deal.
      const applies = basis === "secured" ? secured : true;
      const basisDebt = basis === "secured" ? fin.securedDebt : fin.totalDebt;
      const addAmount = basis === "secured" ? (secured ? amount : 0) : amount;
      const pre = (basisDebt - fin.cash) / fin.ebitda;
      const post = (basisDebt + addAmount - fin.cash) / fin.ebitda;
      results.push({
        ...base,
        measure: basis === "secured" ? "Senior Secured Net Leverage Ratio" : "Total Net Leverage Ratio",
        applies,
        preTransactionRatio: pre,
        postTransactionRatio: post,
        status: !applies ? "SATISFIED" : post <= p.thresholdValue ? "SATISFIED" : "FAILED",
      });
    } else {
      // COVERAGE_RATIO_ROOM
      const rate = fin.assumedNewDebtRatePct / 100;
      const pre = fin.ebitda / fin.interestExpense;
      if (rate <= 0) {
        results.push({
          ...base,
          measure: "Fixed Charge / Interest Coverage",
          applies: true,
          preTransactionRatio: pre,
          status: "UNKNOWN",
          reason: `Assumed new-debt interest rate is zero or not set; cannot compute a pro forma coverage ratio for "${p.basketName}".`,
        });
        continue;
      }
      const post = fin.ebitda / (fin.interestExpense + amount * rate);
      results.push({
        ...base,
        measure: "Fixed Charge / Interest Coverage",
        applies: true,
        preTransactionRatio: pre,
        postTransactionRatio: post,
        status: post >= p.thresholdValue ? "SATISFIED" : "FAILED",
      });
    }
  }
  return results;
}
