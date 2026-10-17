/**
 * Pure legacy-simulation kind selection for Ask transaction
 * analysis. Kept free of prisma imports so it is unit-testable
 * in isolation.
 */
import type { TransactionDraft } from "./parse-transaction-draft";

export type LegacyAskKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "DEBT_REPAYMENT"
  | "ELIGIBLE_EQUITY_CONTRIBUTION";

/**
 * Which legacy-engine kind to simulate for an Ask question.
 *
 * Rule 62: the repayment override must fire only when repayment
 * IS the transaction. The old code matched /repay|prepay|pay
 * down/ anywhere, so "Can we incur $50M secured debt to repay
 * existing notes?" simulated as DEBT_REPAYMENT — the wrong
 * direction (repayment frees capacity; incurrence consumes
 * it) and the repayment branch skips restriction evaluation.
 * When the question describes raising new capital (an
 * incurrence verb, or a "new debt/loan/notes" phrase),
 * repayment is the use of proceeds and the draft kind
 * (incurrence) is the transaction to simulate.
 */
export function legacyKindFromQuestion(
  question: string,
  draftKind: TransactionDraft["kind"],
): LegacyAskKind | null {
  const q = question.toLowerCase();
  const raisesNewCapital =
    /\b(incur|borrow|issue|raise|draw)\b/.test(q) ||
    /\bnew (debt|loan|notes?|facility|financing|borrowing)\b/.test(q);
  if (!raisesNewCapital && /repay|prepay|pay down/.test(q)) return "DEBT_REPAYMENT";
  if (/equity contribution|eligible equity|equity infusion/.test(q)) {
    return "ELIGIBLE_EQUITY_CONTRIBUTION";
  }
  if (
    draftKind === "SECURED_DEBT" ||
    draftKind === "UNSECURED_DEBT" ||
    draftKind === "RESTRICTED_PAYMENT" ||
    draftKind === "INVESTMENT"
  ) {
    return draftKind;
  }
  return null;
}
