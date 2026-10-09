/**
 * Phase 2 term coverage — distinguishes EXACT gap terms from conceptual families.
 *
 * Exact-term targets must match the instrument's own defined label (normalized).
 * Conceptual families group near-formulations for discovery only (never equivalence).
 */

import type { TermFamily } from "./priority-terms";
import { PRIORITY_TERM_FAMILIES } from "./priority-terms";

/** Phase-2 gap terms that must be tracked as exact labels when present. */
export const PHASE2_EXACT_GAP_TERMS = [
  "Available Equity Amount",
  "Cumulative Credit",
  "Incremental Cap",
  "Free and Clear Incremental Amount",
  "Permitted Acquisition",
  "Permitted Ratio Debt",
  "Permitted Refinancing",
  "Designated Non-Cash Consideration",
  "Consolidated First Lien Debt",
  "Consolidated Net Leverage Ratio",
  "Pro Forma Basis",
  "Pro Forma Effect",
  "Excess Cash Flow",
  "Applicable Amount",
] as const;

export type Phase2ExactGapTerm = (typeof PHASE2_EXACT_GAP_TERMS)[number];

/**
 * Additional conceptual families for broader covenant / financial-definition coverage.
 * Distinct from PHASE2_EXACT_GAP_TERMS — a hit on a family variant is NOT an exact-term hit.
 */
export const PHASE2_BROADER_FAMILIES: TermFamily[] = [
  {
    canonical: "Cumulative Credit",
    normalizedVariants: ["cumulative credit", "cumulative available amount"],
    groupingRationale: "Builder-basket alternate labels; not assumed equivalent to Available Amount.",
  },
  {
    canonical: "Applicable Amount",
    normalizedVariants: ["applicable amount", "applicable rp amount"],
    groupingRationale: "Capacity wrappers sometimes labeled Applicable Amount rather than Available Amount.",
  },
  {
    canonical: "Available Equity Amount",
    normalizedVariants: ["available equity amount", "available equity proceeds amount", "equity proceeds amount"],
    groupingRationale: "Equity-funded capacity overlays.",
  },
  {
    canonical: "Incremental Cap",
    normalizedVariants: ["incremental cap", "incremental facility cap", "maximum incremental facilities amount"],
    groupingRationale: "Incremental capacity ceilings; Free and Clear limbs may be separate exact terms.",
  },
  {
    canonical: "Free and Clear Incremental Amount",
    normalizedVariants: [
      "free and clear incremental amount",
      "fixed incremental amount",
      "free and clear amount",
    ],
    groupingRationale: "Non-ratio incremental limbs; Fixed Incremental Amount is a common near-label, not a legal equivalent.",
  },
  {
    canonical: "Permitted Acquisition",
    normalizedVariants: ["permitted acquisition", "permitted acquisitions"],
    groupingRationale: "Acquisition permission wrappers.",
  },
  {
    canonical: "Permitted Ratio Debt",
    normalizedVariants: ["permitted ratio debt", "ratio debt", "ratio-based indebtedness"],
    groupingRationale: "Ratio-gated indebtedness permissions.",
  },
  {
    canonical: "Designated Non-Cash Consideration",
    normalizedVariants: ["designated non-cash consideration", "designated noncash consideration"],
    groupingRationale: "Asset-sale proceeds classification.",
  },
  {
    canonical: "Consolidated First Lien Debt",
    normalizedVariants: [
      "consolidated first lien debt",
      "consolidated first lien indebtedness",
      "first lien indebtedness",
      "first lien debt",
    ],
    groupingRationale: "First-lien numerators; distinct from Consolidated Secured Debt in many instruments.",
  },
  {
    canonical: "Consolidated Net Leverage Ratio",
    normalizedVariants: [
      "consolidated net leverage ratio",
      "consolidated leverage ratio",
      "net leverage ratio",
    ],
    groupingRationale: "Net leverage tests; may coincide with or differ from Total Net Leverage Ratio labeling.",
  },
  {
    canonical: "Pro Forma Basis",
    normalizedVariants: ["pro forma basis", "pro forma basis hereof"],
    groupingRationale: "Calculation convention definition.",
  },
  {
    canonical: "Pro Forma Effect",
    normalizedVariants: ["pro forma effect", "pro forma effects"],
    groupingRationale: "Give-pro-forma-effect convention; not the same term as Pro Forma Basis.",
  },
  {
    canonical: "Payment Conditions",
    normalizedVariants: ["payment conditions", "restricted payment conditions"],
    groupingRationale: "RP/investment gate packages.",
  },
  {
    canonical: "Consolidated Interest Expense",
    normalizedVariants: ["consolidated interest expense", "interest expense"],
    groupingRationale: "Interest addback / coverage inputs.",
  },
  {
    canonical: "Capital Expenditures",
    normalizedVariants: ["capital expenditures", "consolidated capital expenditures"],
    groupingRationale: "ECF and coverage inputs.",
  },
  {
    canonical: "Net Proceeds",
    normalizedVariants: ["net proceeds", "net cash proceeds"],
    groupingRationale: "Asset-sale / ECF proceeds concepts.",
  },
  {
    canonical: "Indebtedness",
    normalizedVariants: ["indebtedness"],
    groupingRationale: "Core debt concept definition.",
  },
  {
    canonical: "Lien",
    normalizedVariants: ["lien", "liens"],
    groupingRationale: "Core lien concept definition.",
  },
  {
    canonical: "Subsidiary",
    normalizedVariants: ["subsidiary", "subsidiaries"],
    groupingRationale: "Entity perimeter building block.",
  },
  {
    canonical: "Wholly Owned Subsidiary",
    normalizedVariants: ["wholly owned subsidiary", "wholly-owned subsidiary"],
    groupingRationale: "Ownership qualifier for guarantor/investment rules.",
  },
  {
    canonical: "Change of Control",
    normalizedVariants: ["change of control", "change in control"],
    groupingRationale: "EOD / mandatory prepayment trigger definition.",
  },
  {
    canonical: "Material Adverse Effect",
    normalizedVariants: ["material adverse effect", "material adverse change"],
    groupingRationale: "MAE qualifier used across covenants and EOD.",
  },
  {
    canonical: "Cash Equivalents",
    normalizedVariants: ["cash equivalents", "permitted cash equivalents"],
    groupingRationale: "Liquidity / netting inputs.",
  },
  {
    canonical: "Disqualified Equity Interests",
    normalizedVariants: ["disqualified equity interests", "disqualified stock"],
    groupingRationale: "Equity treated as debt-like.",
  },
  {
    canonical: "Excluded Subsidiary",
    normalizedVariants: ["excluded subsidiary", "excluded subsidiaries"],
    groupingRationale: "Guarantor-coverage exclusions.",
  },
];

/** Union of Phase-1 priority + Phase-2 broader families (conceptual grouping). */
export const ALL_EXTRACTION_FAMILIES: TermFamily[] = (() => {
  const byCanonical = new Map<string, TermFamily>();
  for (const f of [...PRIORITY_TERM_FAMILIES, ...PHASE2_BROADER_FAMILIES]) {
    const existing = byCanonical.get(f.canonical);
    if (!existing) {
      byCanonical.set(f.canonical, f);
      continue;
    }
    const variants = new Set([...existing.normalizedVariants, ...f.normalizedVariants]);
    byCanonical.set(f.canonical, {
      ...existing,
      normalizedVariants: [...variants],
      groupingRationale: existing.groupingRationale,
    });
  }
  return [...byCanonical.values()];
})();

const VARIANT_TO_CANONICAL = new Map<string, string>();
for (const family of ALL_EXTRACTION_FAMILIES) {
  for (const v of family.normalizedVariants) VARIANT_TO_CANONICAL.set(v, family.canonical);
}

export function canonicalFamilyForExpanded(normalizedTerm: string): string | null {
  return VARIANT_TO_CANONICAL.get(normalizedTerm.toLowerCase().replace(/\s+/g, " ").trim()) ?? null;
}

export function isExtractableNormalizedTerm(normalizedTerm: string): boolean {
  return canonicalFamilyForExpanded(normalizedTerm) !== null;
}

export function normalizeTermLabel(term: string): string {
  return term.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Exact-gap coverage: only counts when the instrument's exact normalized label matches. */
export function exactGapCoverage(normalizedTermsPresent: Iterable<string>): Record<Phase2ExactGapTerm, number> {
  const present = new Set([...normalizedTermsPresent].map(normalizeTermLabel));
  const out = {} as Record<Phase2ExactGapTerm, number>;
  for (const term of PHASE2_EXACT_GAP_TERMS) {
    out[term] = present.has(normalizeTermLabel(term)) ? 1 : 0;
  }
  // Count occurrences across examples by caller if needed; here presence is 0/1 per term set.
  return out;
}

export function countExactGapHits(examples: Array<{ exactTerm: string; normalizedTerm: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const gap of PHASE2_EXACT_GAP_TERMS) counts[gap] = 0;
  const gapNorm = new Map(PHASE2_EXACT_GAP_TERMS.map((t) => [normalizeTermLabel(t), t]));
  for (const ex of examples) {
    const g = gapNorm.get(ex.normalizedTerm);
    if (g) counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
}
