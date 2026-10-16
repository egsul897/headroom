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
 * Scope: status gating + reporting, plus the maximum-capacity
 * ceiling (Rule 189). `maximumCapacity` is capped by the
 * ratio-implied ceiling: the largest amount at which every
 * APPLICABLE maintenance test still passes. The cap is applied
 * BEFORE the election re-validation in
 * `computeMaximumCapacityFromEvaluations`, so the capped
 * amount is re-validated as an election amount exactly like
 * any other candidate maximum (a lower amount can only
 * improve every ratio — leverage post-ratio rises with
 * amount, coverage post-ratio falls — so re-validation never
 * re-breaches a ratio). A test that is UNKNOWN at the
 * candidate amount (coverage with no assumed new-debt rate)
 * is amount-independent, so NO ceiling can be proven and the
 * maximum-capacity answer degrades to REVIEW_REQUIRED
 * (fail-closed, consistent with the status gating).
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

/**
 * Rule 189: the maintenance-ratio ceiling for a candidate
 * maximum-capacity amount. Returns the candidate unchanged
 * when every applicable test already passes at it; bisects
 * [0, amount] for the largest amount where all applicable
 * tests pass when any test fails at it (valid because each
 * test's post-transaction ratio is monotone in amount:
 * leverage rises, coverage falls); INDETERMINATE when any
 * applicable test is UNKNOWN (coverage with a missing/zero
 * assumed new-debt rate is amount-independent, so no
 * ceiling can be proven at any amount).
 */
export type RatioCeilingResult =
  | { kind: "UNCAPPED"; amount: number }
  | { kind: "CAPPED"; amount: number }
  | { kind: "INDETERMINATE"; reason: string };

export function applyRatioCeiling(
  amount: number,
  provisions: RatioProvision[],
  financials: FinancialSnapshotInput,
  secured: boolean,
): RatioCeilingResult {
  if (provisions.length === 0) return { kind: "UNCAPPED", amount };
  const applicableAt = (a: number): RatioTestResult[] =>
    evaluateRatioTests(provisions, financials, a, secured).filter((t) => t.applies);
  const atAmount = applicableAt(amount);
  const unknown = atAmount.find((t) => t.status === "UNKNOWN");
  if (unknown) {
    return {
      kind: "INDETERMINATE",
      reason: `Maintenance ratio test ${unknown.sectionRef} (${unknown.basketName}) cannot be evaluated (missing assumed new-debt rate); no ratio-safe capacity ceiling can be proven.`,
    };
  }
  if (atAmount.every((t) => t.status === "SATISFIED")) return { kind: "UNCAPPED", amount };
  let lo = 0;
  let hi = amount;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const tests = applicableAt(mid);
    if (tests.some((t) => t.status === "UNKNOWN")) {
      return {
        kind: "INDETERMINATE",
        reason: "A maintenance ratio test became unevaluable while bisecting the ratio-safe ceiling; no ratio-safe capacity ceiling can be proven.",
      };
    }
    if (tests.every((t) => t.status === "SATISFIED")) lo = mid;
    else hi = mid;
  }
  return { kind: "CAPPED", amount: lo };
}
