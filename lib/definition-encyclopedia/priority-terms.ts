/**
 * Headroom Definition Encyclopedia — priority term families.
 *
 * Alternative spellings / near-formulations are grouped for discovery and
 * comparison only. Membership in a family NEVER asserts legal equivalence
 * across instruments (or even within one instrument).
 */

export interface TermFamily {
  /** Canonical label used for encyclopedia indexing (priority-term name). */
  canonical: string;
  /** Normalized spellings that may appear as independently defined terms. */
  normalizedVariants: string[];
  /** Short description of why variants are grouped (not an equivalence claim). */
  groupingRationale: string;
}

export const PRIORITY_TERM_FAMILIES: TermFamily[] = [
  {
    canonical: "Consolidated EBITDA",
    normalizedVariants: [
      "consolidated ebitda",
      "consolidated adjusted ebitda",
      "adjusted ebitda",
      "ebitda",
    ],
    groupingRationale:
      "EBITDA-style earnings metrics used as denominators for leverage and builder baskets; spellings and adjustment stacks differ by instrument.",
  },
  {
    canonical: "Consolidated Net Income",
    normalizedVariants: ["consolidated net income", "consolidated net income (loss)"],
    groupingRationale: "Starting point for most Consolidated EBITDA definitions.",
  },
  {
    canonical: "Consolidated Total Debt",
    normalizedVariants: [
      "consolidated total debt",
      "consolidated total indebtedness",
      "consolidated indebtedness",
    ],
    groupingRationale: "Numerator candidates for total leverage ratios; cash-netting and included instruments vary.",
  },
  {
    canonical: "Consolidated Secured Debt",
    normalizedVariants: [
      "consolidated secured debt",
      "consolidated secured indebtedness",
      "secured indebtedness",
    ],
    groupingRationale:
      "Secured-debt numerators / related concepts; Secured Indebtedness is often a broader or differently scoped term than Consolidated Secured Debt.",
  },
  {
    canonical: "First Lien Net Leverage Ratio",
    normalizedVariants: [
      "first lien net leverage ratio",
      "first lien leverage ratio",
      "senior secured net leverage ratio",
      "senior secured leverage ratio",
    ],
    groupingRationale: "First-lien / senior-secured leverage tests; lien priority and cash netting are not uniform.",
  },
  {
    canonical: "Total Net Leverage Ratio",
    normalizedVariants: [
      "total net leverage ratio",
      "total leverage ratio",
      "consolidated total net leverage ratio",
      "total rent adjusted net leverage ratio",
    ],
    groupingRationale: "All-in leverage ratios; rent-adjusted and cash-netted variants are drafting alternatives, not equivalents.",
  },
  {
    canonical: "Fixed Charge Coverage Ratio",
    normalizedVariants: ["fixed charge coverage ratio", "consolidated fixed charge coverage ratio"],
    groupingRationale: "Coverage tests; fixed-charge numerators/denominators and ABL vs TL usage differ.",
  },
  {
    canonical: "Available Amount",
    normalizedVariants: [
      "available amount",
      "cumulative credit",
      "available rp capacity amount",
      "builder amount",
    ],
    groupingRationale:
      "Builder / cumulative RP-investment capacity concepts; Available RP Capacity Amount and Cumulative Credit are related but not interchangeable labels.",
  },
  {
    canonical: "Available Equity Amount",
    normalizedVariants: ["available equity amount", "available equity proceeds amount"],
    groupingRationale: "Equity-funded capacity overlays, when separately defined.",
  },
  {
    canonical: "Excess Cash Flow",
    normalizedVariants: ["excess cash flow"],
    groupingRationale: "Mandatory prepayment and builder-contribution metric.",
  },
  {
    canonical: "Permitted Refinancing Indebtedness",
    normalizedVariants: [
      "permitted refinancing indebtedness",
      "permitted refinancing",
      "refinancing indebtedness",
    ],
    groupingRationale: "Refinance permission wrappers; principal caps, maturity, and lien-priority conditions vary.",
  },
  {
    canonical: "Incremental Amount",
    normalizedVariants: [
      "incremental amount",
      "incremental cap",
      "fixed incremental amount",
      "incremental availability",
    ],
    groupingRationale: "Incremental facility capacity; free-and-clear vs ratio-based limbs are instrument-specific.",
  },
  {
    canonical: "Restricted Subsidiary",
    normalizedVariants: ["restricted subsidiary"],
    groupingRationale: "Covenant perimeter inclusion.",
  },
  {
    canonical: "Unrestricted Subsidiary",
    normalizedVariants: ["unrestricted subsidiary"],
    groupingRationale: "Covenant perimeter exclusion / designation concept.",
  },
  {
    canonical: "Loan Party",
    normalizedVariants: ["loan party", "loan parties", "subsidiary loan party", "credit party", "obligor"],
    groupingRationale:
      "Obligor-set labels; Credit Party / Obligors / Loan Parties may bind different entity classes even when used similarly in negative covenants.",
  },
  {
    canonical: "Material Subsidiary",
    normalizedVariants: [
      "material subsidiary",
      "material domestic subsidiary",
      "material foreign subsidiary",
    ],
    groupingRationale: "Materiality thresholds for guarantor coverage and designations.",
  },
  {
    canonical: "Permitted Investments",
    normalizedVariants: ["permitted investments", "permitted investment"],
    groupingRationale: "Investment basket wrapper definitions.",
  },
  {
    canonical: "Permitted Liens",
    normalizedVariants: ["permitted liens", "permitted lien", "permitted encumbrances"],
    groupingRationale: "Lien basket wrappers; Permitted Encumbrances is a common alternate label.",
  },
  {
    canonical: "Default",
    normalizedVariants: ["default"],
    groupingRationale: "Pre-Event-of-Default default concept (often any Event of Default or condition that with notice/lapse would become one).",
  },
  {
    canonical: "Event of Default",
    normalizedVariants: ["event of default", "events of default"],
    groupingRationale: "Acceleration / enforcement trigger set.",
  },
];

const VARIANT_TO_CANONICAL = new Map<string, string>();
for (const family of PRIORITY_TERM_FAMILIES) {
  for (const variant of family.normalizedVariants) {
    VARIANT_TO_CANONICAL.set(variant, family.canonical);
  }
}

export function canonicalFamilyFor(normalizedTerm: string): string | null {
  return VARIANT_TO_CANONICAL.get(normalizedTerm.toLowerCase().replace(/\s+/g, " ").trim()) ?? null;
}

export function isPriorityNormalizedTerm(normalizedTerm: string): boolean {
  return canonicalFamilyFor(normalizedTerm) !== null;
}

export const PRIORITY_CANONICAL_TERMS = PRIORITY_TERM_FAMILIES.map((f) => f.canonical);
