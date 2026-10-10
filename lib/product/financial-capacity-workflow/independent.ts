/**
 * Independent expectations authored from contractual formulas + Neon
 * financial inputs — never from engine output under test.
 *
 * Coherent CA §6.11 TNL ≤ 4.25x:
 *   room = 4.25 × EBITDA − (totalDebt − cash)
 * Coherent Notes builder (§3.4(a)(C)):
 *   capacity = starter + cniShare×max(0,CNI) + equityProceeds (when included)
 * Ledger RP pool usage reduces waterfall step remaining, not the builder
 * provision's headline capacity.
 */

export const COHERENT_INDEPENDENT = {
  companyId: "coherent",
  asOf: "2026-06-30",
  financials: {
    ebitda: 1700,
    cash: 1162,
    totalDebt: 3258,
    securedDebt: 2221,
    interestExpense: 190,
    cumulativeNetIncome: 520,
    equityProceedsSinceIssue: 2150,
    assumedNewDebtRatePct: 6.5,
  },
  /** CA §6.11 TNL room at seed financials — package-wide UNSECURED binding, not secured. */
  tnlRoom: 4.25 * 1700 - (3258 - 1162), // 5129
  /** Notes MILA secured SSNL ≤ 3.00x room — package-wide SECURED binding. */
  milaSecuredRoom: 3.0 * 1700 - (2221 - 1162), // 4041
  /**
   * Builder Available Amount: max(330, 0.25×EBITDA) + 0.5×CNI + equityProceeds
   * = max(330,425) + 260 + 2150 = 2835.
   */
  builderHeadline: Math.max(330, 0.25 * 1700) + 0.5 * 520 + 2150, // 2835
  /** Known ledger RP debit (dividends) against shared Available Amount pool. */
  ledgerRpDebit: 150,
  notesIndentureId: "coherent-2029-notes-indenture",
  creditAgreementId: "coherent-credit-agreement-2022",
  termLoanAId: "coh-facility-tla-2030",
} as const;

export function expectedTnlRoom(args: {
  ebitda: number;
  totalDebt: number;
  cash: number;
  threshold?: number;
}): number {
  const threshold = args.threshold ?? 4.25;
  return threshold * args.ebitda - (args.totalDebt - args.cash);
}

export function expectedMilaSecuredRoom(args: {
  ebitda: number;
  securedDebt: number;
  cash: number;
  threshold?: number;
}): number {
  const threshold = args.threshold ?? 3.0;
  return threshold * args.ebitda - (args.securedDebt - args.cash);
}
