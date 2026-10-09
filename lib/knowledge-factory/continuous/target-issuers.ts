/**
 * Diversity-first issuer targeting for Neon massive corpus expansion.
 * Prefer underrepresented document classes and issuers not yet dense in Neon.
 */

export interface ExpandTarget {
  ticker: string;
  priorityClasses: string[];
  debtHint: string;
  rationale: string;
}

/** Sparse-class / diversity priority — not limited to CONMED/Chewy demos. */
export const DIVERSITY_EXPAND_TARGETS: ExpandTarget[] = [
  // ABL / borrowing-base heavy
  { ticker: "GPK", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT", "AMENDMENT"], debtHint: "ABL", rationale: "ABL sparse in Neon" },
  { ticker: "SEE", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT", "SECURITY_AGREEMENT"], debtHint: "ABL", rationale: "ABL / packaging borrower" },
  { ticker: "URI", priorityClasses: ["CREDIT_AGREEMENT", "TERM_LOAN_AGREEMENT", "AMENDMENT"], debtHint: "TLB", rationale: "equipment rental leveraged credit" },
  { ticker: "WHR", priorityClasses: ["REVOLVING_CREDIT_AGREEMENT", "CREDIT_AGREEMENT"], debtHint: "IG_MIXED", rationale: "IG revolver coverage" },
  // Intercreditor / secured packages
  { ticker: "BALL", priorityClasses: ["INTERCREDITOR_AGREEMENT", "INDENTURE", "CREDIT_AGREEMENT"], debtHint: "HY", rationale: "HY + credit package" },
  { ticker: "CCK", priorityClasses: ["INDENTURE", "CREDIT_AGREEMENT", "AMENDMENT"], debtHint: "HY", rationale: "HY indenture diversity" },
  { ticker: "LYV", priorityClasses: ["CREDIT_AGREEMENT", "INDENTURE", "INTERCREDITOR_AGREEMENT"], debtHint: "HY", rationale: "live entertainment leveraged" },
  { ticker: "WBD", priorityClasses: ["INDENTURE", "CREDIT_AGREEMENT", "SUPPLEMENTAL_INDENTURE"], debtHint: "HY", rationale: "media HY stack" },
  // Term loans / acquisition financing
  { ticker: "IR", priorityClasses: ["TERM_LOAN_AGREEMENT", "CREDIT_AGREEMENT", "AMENDMENT"], debtHint: "TLB", rationale: "industrial TLB" },
  { ticker: "TDG", priorityClasses: ["CREDIT_AGREEMENT", "INDENTURE", "AMENDMENT"], debtHint: "HY", rationale: "aerospace leveraged" },
  { ticker: "HLT", priorityClasses: ["CREDIT_AGREEMENT", "REVOLVING_CREDIT_AGREEMENT", "INDENTURE"], debtHint: "MIXED", rationale: "hotel credit + notes" },
  // Convertible / hybrid-adjacent public notes
  { ticker: "NET", priorityClasses: ["INDENTURE", "SUPPLEMENTAL_INDENTURE"], debtHint: "CONVERTIBLE", rationale: "convertible notes indenture" },
  { ticker: "CRWD", priorityClasses: ["INDENTURE", "CREDIT_AGREEMENT"], debtHint: "CONVERTIBLE", rationale: "tech convertible / credit" },
  { ticker: "DDOG", priorityClasses: ["INDENTURE", "CREDIT_AGREEMENT"], debtHint: "CONVERTIBLE", rationale: "tech convertible" },
  // IG revolvers / investment-grade
  { ticker: "JNJ", priorityClasses: ["REVOLVING_CREDIT_AGREEMENT", "INDENTURE"], debtHint: "IG", rationale: "IG revolver" },
  { ticker: "PEP", priorityClasses: ["REVOLVING_CREDIT_AGREEMENT", "INDENTURE"], debtHint: "IG", rationale: "IG credit" },
  { ticker: "KO", priorityClasses: ["REVOLVING_CREDIT_AGREEMENT", "INDENTURE"], debtHint: "IG", rationale: "IG credit" },
  { ticker: "PG", priorityClasses: ["REVOLVING_CREDIT_AGREEMENT", "INDENTURE"], debtHint: "IG", rationale: "IG credit" },
  { ticker: "NEE", priorityClasses: ["INDENTURE", "CREDIT_AGREEMENT"], debtHint: "IG", rationale: "utility indenture" },
  // Airlines / transport (amendment-rich)
  { ticker: "LUV", priorityClasses: ["CREDIT_AGREEMENT", "AMENDMENT", "RESTATEMENT"], debtHint: "MIXED", rationale: "airline credit amendments" },
  { ticker: "DAL", priorityClasses: ["CREDIT_AGREEMENT", "AMENDMENT", "INDENTURE"], debtHint: "MIXED", rationale: "airline financing" },
  { ticker: "FDX", priorityClasses: ["CREDIT_AGREEMENT", "REVOLVING_CREDIT_AGREEMENT"], debtHint: "IG", rationale: "transport IG credit" },
  // Additional mid-market / specialty
  { ticker: "PTON", priorityClasses: ["CREDIT_AGREEMENT", "INDENTURE", "AMENDMENT"], debtHint: "HY", rationale: "specialty credit" },
  { ticker: "GDDY", priorityClasses: ["CREDIT_AGREEMENT", "TERM_LOAN_AGREEMENT", "AMENDMENT"], debtHint: "TLB", rationale: "tech TLB" },
  { ticker: "MCK", priorityClasses: ["TERM_LOAN_AGREEMENT", "CREDIT_AGREEMENT", "INDENTURE"], debtHint: "MIXED", rationale: "healthcare distribution term loan" },
  { ticker: "ACN", priorityClasses: ["CREDIT_AGREEMENT", "REVOLVING_CREDIT_AGREEMENT"], debtHint: "IG", rationale: "services IG credit" },
  { ticker: "ALK", priorityClasses: ["CREDIT_AGREEMENT", "AMENDMENT"], debtHint: "MIXED", rationale: "airline credit" },
  { ticker: "CHEF", priorityClasses: ["CREDIT_AGREEMENT", "ABL_AGREEMENT"], debtHint: "ABL", rationale: "foodservice ABL-adjacent" },
  { ticker: "AEO", priorityClasses: ["CREDIT_AGREEMENT", "ABL_AGREEMENT", "AMENDMENT"], debtHint: "ABL", rationale: "retail ABL" },
  { ticker: "MRVI", priorityClasses: ["CREDIT_AGREEMENT", "AMENDMENT"], debtHint: "TLB", rationale: "life sciences credit" },
];

const CLASS_KEYWORDS: Record<string, RegExp> = {
  ABL_AGREEMENT: /\b(?:asset[- ]based|abl|borrowing base)\b/i,
  INTERCREDITOR_AGREEMENT: /\bintercreditor\b/i,
  GUARANTEE_AGREEMENT: /\b(?:guarantee|guaranty)(?:\s+and\s+collateral)?\s+agreement\b/i,
  SECURITY_AGREEMENT: /\b(?:security|pledge|collateral)\s+agreement\b/i,
  REVOLVING_CREDIT_AGREEMENT: /\brevolving\s+credit\b/i,
  TERM_LOAN_AGREEMENT: /\bterm\s+loan\b/i,
  INDENTURE: /\bindenture\b/i,
  SUPPLEMENTAL_INDENTURE: /\bsupplemental\s+indenture\b/i,
  AMENDMENT: /\bamendment\b/i,
  RESTATEMENT: /\b(?:amended and restated|restatement)\b/i,
  CREDIT_AGREEMENT: /\bcredit\s+agreement\b/i,
};

/** Score a discovered exhibit against desired sparse classes (higher = prefer download). */
export function scoreExhibitForTargets(
  title: string,
  filename: string,
  priorityClasses: string[],
): number {
  const hay = `${title} ${filename}`;
  let score = 0;
  for (const cls of priorityClasses) {
    const re = CLASS_KEYWORDS[cls];
    if (re?.test(hay)) score += 10;
  }
  // General financing signal
  if (/\b(?:credit agreement|indenture|intercreditor|security agreement|term loan|revolving)\b/i.test(hay)) {
    score += 3;
  }
  // Prefer larger material contracts over tiny side letters when class unknown
  if (/\bex-?(?:10|4)\b/i.test(filename)) score += 1;
  return score;
}
