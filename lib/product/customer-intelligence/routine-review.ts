/**
 * Exception-based review: which summary items need a counsel
 * decision, and which are routine supported interpretations that
 * auto-compile without mandatory individual approval.
 *
 * Prisma-free (same reason as grant-types.ts / formula-parse.ts)
 * so the classifier is unit-testable and usable from the
 * coverage evaluator without pulling in the Prisma client.
 *
 * A routine item is one the pipeline supports end-to-end with no
 * judgment call left open:
 * - it carries grant types AND compiles cleanly to a MODELED
 *   Permission (formula + threshold, no missing fields), OR to a
 *   testable maintenance-ratio provision; AND
 * - after Rule 206 drops pure cap restatements, it carries NO
 *   remaining eligibility conditions (any remaining condition
 *   maps to an UNKNOWN CUSTOM_STATE_PREDICATE — counsel must
 *   resolve it before the basket can clear); AND
 * - its posture is determined (an UNRESOLVED-posture item with a
 *   clear amount still needs counsel to confirm what the
 *   provision does).
 *
 * Everything else is an exception for counsel: INCOMPLETE
 * formulas, unparseable ratios, UNKNOWN conditions, undetermined
 * posture, or a basket-shaped item the grant classifier missed
 * (baskets/conditions present but no grant types — the item may
 * constrain capacity and the classifier may have missed it).
 *
 * Routine items auto-compile as SYSTEM-accepted (never labeled
 * counsel-verified). Counsel can still inspect, edit, or reject
 * any item — a counsel decision supersedes the system acceptance.
 * Exceptions never auto-compile; counsel's decision triggers
 * their compile.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { isCapRestatementCondition, parseFormulaFromItem } from "./formula-parse";
import { grantTypesForItem } from "./grant-types";
import { parseMaintenanceRatio } from "./maintenance-ratio";

/** True when the item compiles to a MODELED Permission or a testable ratio provision. */
export function compilesCleanly(item: CovenantSummaryItem): boolean {
  if (grantTypesForItem(item).length > 0) {
    return parseFormulaFromItem(item).modelingStatus === "MODELED";
  }
  // No grants: a maintenance-ratio item still compiles (to a
  // CovenantProvision, not a Permission) when the ratio parses.
  return parseMaintenanceRatio(item) != null;
}

/** True when the item needs NO counsel decision (routine supported interpretation). */
export function isRoutineItem(item: CovenantSummaryItem): boolean {
  const grants = grantTypesForItem(item);
  if (grants.length === 0) {
    // No grants: a maintenance-ratio item still compiles (to a
    // CovenantProvision, not a Permission) when the ratio parses —
    // routine when it carries no conditions and its posture is
    // determined. The Rule 206 cap filter does NOT apply here: the
    // ratio threshold is a multiple, not a dollar amount, so a
    // dollar-amount comparison against it would be a unit error —
    // any condition on a ratio item makes it an exception.
    const ratio = parseMaintenanceRatio(item);
    if (ratio != null) {
      if ((item.conditions?.length ?? 0) > 0) return false;
      if (item.posture === "UNRESOLVED") return false;
      return true;
    }
    // No capacity signal. Routine only when the item carries no
    // basket/condition signal at all — a basket-shaped item the
    // classifier missed is an exception (it may constrain capacity).
    const basketShaped =
      (item.materialBasketsThresholds?.length ?? 0) > 0 ||
      (item.conditions?.length ?? 0) > 0;
    if (basketShaped) return false;
    return true;
  }
  if (!compilesCleanly(item)) return false;
  // Category/grant agreement: the category classifier and the grant
  // classifier are independent signals. When they disagree — a DEBT
  // grant on a MERGERS/OTHER-category item (e.g. a Successors clause
  // whose "assume Indebtedness" language minted DEBT, or Letters of
  // Credit mechanics minting DEBT) — which classifier is right is a
  // judgment call for counsel. The item is NOT suppressed (it still
  // appears, still compiles on counsel's decision) — it just does
  // not auto-accept. At least one grant must agree with the
  // category: Rule 177 dual-grants (DEBT + linked LIEN in a debt
  // section) stay routine because the DEBT grant agrees. The
  // BASKETS bucket is family-agnostic by definition, so any grant
  // there agrees.
  const GRANT_CATEGORIES: Record<string, string[]> = {
    DEBT_INCURRENCE: ["DEBT_INCURRENCE"],
    LIEN: ["LIENS_SECURED_DEBT"],
    RESTRICTED_PAYMENT: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    INVESTMENT: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
  };
  const categoryAgrees =
    item.category === "BASKETS_EXCEPTIONS_CONDITIONS" ||
    grants.some((g) => (GRANT_CATEGORIES[g] ?? []).includes(item.category));
  if (!categoryAgrees) return false;
  // MODELED with a remaining (UNKNOWN) condition still needs counsel.
  const parsed = parseFormulaFromItem(item);
  const remainingConditions = (item.conditions ?? []).filter(
    (c) => !isCapRestatementCondition(String(c), parsed.thresholdValue),
  );
  if (remainingConditions.length > 0) return false;
  // Undetermined posture needs counsel confirmation even when the
  // amount parses (e.g. a thin lien item whose DEBT grant was
  // laundered by boilerplate — the amount is clear but what the
  // provision does is not).
  if (item.posture === "UNRESOLVED") return false;
  return true;
}

/** Exception units in a summary: items that need a counsel decision. */
export function exceptionItems(items: CovenantSummaryItem[]): CovenantSummaryItem[] {
  return items.filter((i) => !isRoutineItem(i));
}
