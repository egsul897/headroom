/**
 * Pure FCCR condition evaluation. Kept free of prisma imports so
 * it is unit-testable in isolation.
 */

/**
 * Decide whether a known FCCR satisfies an FCCR condition string.
 * Returns null when the condition states no decidable FCCR
 * threshold (caller leaves it unsatisfied).
 *
 * The old code took the FIRST number in the condition string as
 * the threshold: "Section 6.10 requires a Fixed Charge Coverage
 * Ratio of at least 1.25" used 6.10 (the section ref) as the
 * threshold, and "FCCR for the 12 months ended ..." used 12 (the
 * period length). Both made a satisfiable condition look
 * unsatisfied. This finds the threshold AFTER the FCCR phrase,
 * attached to a qualifier ("at least", "not less than", "of", ...),
 * and honors direction: "not to exceed / at most" is an upper
 * bound (satisfied when FCCR <= threshold), the rest are lower
 * bounds (FCCR >= threshold).
 */
export function fccrConditionSatisfied(condition: string, knownFccr: number): boolean | null {
  if (!/Fixed Charge Coverage Ratio|FCCR/i.test(condition)) return null;
  const m = condition.match(
    /(?:Fixed Charge Coverage Ratio|FCCR)[\s\S]{0,200}?(not less than|not more than|not to exceed|at least|at most|minimum|>=|≥|<=|≤|>|<|of)\s*(\d+(?:\.\d+)?)/i,
  );
  if (!m) return null;
  const qualifier = (m[1] ?? "").toLowerCase();
  const threshold = Number(m[2]);
  if (!Number.isFinite(threshold)) return null;
  const upper = /not more than|not to exceed|at most|<=|≤|</.test(qualifier);
  return upper ? knownFccr <= threshold : knownFccr >= threshold;
}
