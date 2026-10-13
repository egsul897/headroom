/**
 * Provision-level covenant family + transaction action from legal context.
 *
 * Fixed-dollar discovery finds dollar caps; it must NOT assume every cap is
 * indebtedness. Family/action are derived from operative text signals.
 * Ambiguous or unsupported families refuse executable publication.
 */

export type CovenantFamilyId =
  | "INDEBTEDNESS"
  | "LIENS"
  | "INVESTMENTS"
  | "RESTRICTED_PAYMENTS"
  | "ASSET_SALES";

export type TransactionActionId =
  | "INCUR_DEBT"
  | "CREATE_LIEN"
  | "MAKE_INVESTMENT"
  | "MAKE_RESTRICTED_PAYMENT"
  | "DISPOSE_ASSET";

export type ProvisionLegalContextStatus =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "UNSUPPORTED";

export type ProvisionLegalContext = {
  status: ProvisionLegalContextStatus;
  family: CovenantFamilyId | null;
  action: TransactionActionId | null;
  signals: string[];
  refusalReason: string | null;
};

const FAMILY_PATTERNS: ReadonlyArray<{
  family: CovenantFamilyId;
  action: TransactionActionId;
  re: RegExp;
  signal: string;
}> = [
  {
    family: "LIENS",
    action: "CREATE_LIEN",
    re: /\b(?:Liens?|Encumbrances?|Security\s+Interest|Pledge)\b/i,
    signal: "lien_encumbrance",
  },
  {
    family: "INVESTMENTS",
    action: "MAKE_INVESTMENT",
    re: /\b(?:Investments?|Acquisitions?\s+of\s+(?:equity|stock|capital\s+stock)|loans?\s+to\s+(?:any\s+)?(?:Person|Subsidiary))\b/i,
    signal: "investment",
  },
  {
    family: "RESTRICTED_PAYMENTS",
    action: "MAKE_RESTRICTED_PAYMENT",
    re: /\b(?:Restricted\s+Payments?|Dividends?|Distributions?\s+on\s+(?:Equity|Capital\s+Stock)|repurchase(?:s|ing)?\s+of\s+(?:Equity|Capital\s+Stock)|redemption\s+of\s+(?:Equity|Capital\s+Stock))\b/i,
    signal: "restricted_payment",
  },
  {
    family: "ASSET_SALES",
    action: "DISPOSE_ASSET",
    re: /\b(?:Asset\s+Sales?|Disposition(?:s)?\s+of\s+(?:any\s+)?(?:Property|Assets?)|sell(?:s|ing)?\s+(?:any\s+)?(?:Property|Assets?))\b/i,
    signal: "asset_sale",
  },
  {
    family: "INDEBTEDNESS",
    action: "INCUR_DEBT",
    re: /\b(?:Indebtedness|Funded\s+Indebtedness|Debt(?:\s+Facilities)?|borrow(?:s|ing|ings)?|Incur(?:s|red|rence)?)\b/i,
    signal: "indebtedness",
  },
];

/**
 * Classify covenant family and transaction action from provision operative text.
 * Multiple distinct family hits → AMBIGUOUS (refuse). Zero hits → UNSUPPORTED.
 */
export function classifyProvisionLegalContext(operativeText: string): ProvisionLegalContext {
  const text = operativeText?.trim() ?? "";
  if (!text) {
    return {
      status: "UNSUPPORTED",
      family: null,
      action: null,
      signals: [],
      refusalReason: "Empty operative text — cannot establish covenant family.",
    };
  }

  const hits = FAMILY_PATTERNS.filter((p) => p.re.test(text));
  const uniqueFamilies = [...new Set(hits.map((h) => h.family))];

  if (uniqueFamilies.length === 0) {
    return {
      status: "UNSUPPORTED",
      family: null,
      action: null,
      signals: [],
      refusalReason:
        "No provision-level indebtedness/lien/investment/restricted-payment/asset-sale context — refuse executable claim.",
    };
  }

  if (uniqueFamilies.length > 1) {
    return {
      status: "AMBIGUOUS",
      family: null,
      action: null,
      signals: hits.map((h) => h.signal),
      refusalReason: `Ambiguous covenant families [${uniqueFamilies.join(", ")}] — refuse rather than assume indebtedness.`,
    };
  }

  const hit = hits[0]!;
  return {
    status: "RESOLVED",
    family: hit.family,
    action: hit.action,
    signals: [hit.signal],
    refusalReason: null,
  };
}

/** Section attribution must be provision-scoped — FULL_DOCUMENT alone is never executable. */
export function isProvisionScopedAttribution(sourceSectionRef: string | null | undefined): boolean {
  const ref = sourceSectionRef?.trim() ?? "";
  if (!ref) return false;
  if (ref === "FULL_DOCUMENT" || ref === "WHOLE_AGREEMENT") return false;
  return true;
}
