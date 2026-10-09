/**
 * Clause-level precedent search over the mass-precedent retrieval index.
 * Returns agreement identity + family hits — never fabricates market frequency stats.
 * Never substitutes precedent language for the operative customer contract.
 */

import { searchPrecedents, type PrecedentSearchResult } from "../precedent-search";

export type PrecedentClauseQuery =
  | "ratio_debt"
  | "reclassification"
  | "builder_basket"
  | "incremental_facility"
  | "available_amount"
  | "restricted_payment_exceptions"
  | "ratio_lien"
  | "acquisition_financing_liens"
  | "shared_capacity"
  | "anti_stacking"
  | "grower_basket"
  | "mfn"
  | "mandatory_prepayment"
  | "financial_maintenance"
  | "investment_exceptions"
  | "asset_sales"
  | "events_of_default"
  | "guarantor_restrictions";

const QUERY_MAP: Record<
  PrecedentClauseQuery,
  { q: string; family?: string; note: string }
> = {
  ratio_debt: {
    q: "leverage",
    family: "RATIO_BASED_PERMISSIONS",
    note: "Comparable ratio debt family hits from public corpus index.",
  },
  reclassification: {
    q: "reclassif",
    family: "GENERAL_CONDITIONS_AND_EXCEPTIONS",
    note: "Agreements with reclassification language in the index.",
  },
  builder_basket: {
    q: "available amount",
    family: "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS",
    note: "Builder / Available Amount formulations (index-level, not full clause text).",
  },
  incremental_facility: {
    q: "incremental",
    family: "INCREMENTAL_DEBT_AND_FACILITIES",
    note: "Incremental facility / equivalent debt documents for drafting comparison.",
  },
  available_amount: {
    q: "available amount",
    family: "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS",
    note: "Available Amount definition carriers.",
  },
  restricted_payment_exceptions: {
    q: "restricted payment",
    family: "RESTRICTED_PAYMENTS",
    note: "RP exception carriers — compare operative customer RP section separately.",
  },
  ratio_lien: {
    q: "lien",
    family: "LIENS",
    note: "Lien permissions potentially ratio-conditioned.",
  },
  acquisition_financing_liens: {
    q: "acquisition",
    family: "LIENS",
    note: "Lien permissions potentially tied to acquisition financing.",
  },
  shared_capacity: {
    q: "shared",
    family: "SHARED_CAPACITY_PROVISIONS",
    note: "Shared-capacity / aggregate ceiling carriers — check operative stacking separately.",
  },
  anti_stacking: {
    q: "without duplication",
    family: "SHARED_CAPACITY_PROVISIONS",
    note: "Anti-stacking / without-duplication analogies; never copy thresholds into customer rules.",
  },
  grower_basket: {
    q: "Consolidated EBITDA",
    family: "INDEBTEDNESS",
    note: "Grower / percentage-of-EBITDA basket carriers (definition + indebtedness families).",
  },
  mfn: {
    q: "most favored",
    family: "INCREMENTAL_DEBT_AND_FACILITIES",
    note: "MFN / most-favored-nation incremental facility analogies.",
  },
  mandatory_prepayment: {
    q: "mandatory",
    family: "MANDATORY_PREPAYMENTS",
    note: "Mandatory prepayment provision carriers.",
  },
  financial_maintenance: {
    q: "financial covenant",
    family: "FINANCIAL_MAINTENANCE_COVENANTS",
    note: "Financial maintenance covenant carriers (distinct from ratio incurrence permissions).",
  },
  investment_exceptions: {
    q: "investment",
    family: "INVESTMENTS",
    note: "Investment permission / exception carriers.",
  },
  asset_sales: {
    q: "asset sale",
    family: "ASSET_SALES",
    note: "Asset sale covenant carriers including reinvestment / excess proceeds themes.",
  },
  events_of_default: {
    q: "event of default",
    family: "EVENTS_OF_DEFAULT",
    note: "Events of default carriers for cross-default / acceleration comparison.",
  },
  guarantor_restrictions: {
    q: "guarantor",
    family: "GUARANTEES",
    note: "Guarantee / guarantor restriction carriers; subsidiary eligibility remains operative-specific.",
  },
};

export interface PrecedentClauseHit extends PrecedentSearchResult {
  query: PrecedentClauseQuery;
  draftingDifferenceHints: string[];
  authorityNote: string;
}

export function searchPrecedentClauses(params: {
  query: PrecedentClauseQuery;
  excludeIssuerCik?: string;
  limit?: number;
  repoRoot?: string;
}): PrecedentClauseHit[] {
  const cfg = QUERY_MAP[params.query];
  // Prefer family-filtered hits; fall back to text query alone when family filter is too sparse.
  let hits = searchPrecedents({
    q: cfg.q,
    family: cfg.family,
    excludeIssuerCik: params.excludeIssuerCik,
    limit: params.limit ?? 15,
    repoRoot: params.repoRoot,
  });
  if (!hits.length) {
    hits = searchPrecedents({
      q: cfg.q,
      excludeIssuerCik: params.excludeIssuerCik,
      limit: params.limit ?? 15,
      repoRoot: params.repoRoot,
    });
  }

  return hits.map((h, i, arr) => {
    const draftingDifferenceHints: string[] = [];
    if (i > 0 && arr[0]) {
      const a = arr[0];
      if (a.documentClass !== h.documentClass) {
        draftingDifferenceHints.push(`Document class differs: ${h.documentClass} vs ${a.documentClass}`);
      }
      const famDelta = h.families.filter((f) => !a.families.includes(f));
      if (famDelta.length) {
        draftingDifferenceHints.push(`Additional families vs top hit: ${famDelta.slice(0, 4).join(", ")}`);
      }
      if (a.filingDate && h.filingDate && a.filingDate !== h.filingDate) {
        draftingDifferenceHints.push(`Filing date ${h.filingDate} vs ${a.filingDate}`);
      }
    }
    return {
      ...h,
      query: params.query,
      draftingDifferenceHints,
      authorityNote:
        "PRECEDENT ≠ OPERATIVE AUTHORITY. Index hits are for comparison only; do not copy into the customer rulebook. Market frequency statistics are not computed.",
    };
  });
}

export function listPrecedentClauseQueries(): PrecedentClauseQuery[] {
  return Object.keys(QUERY_MAP) as PrecedentClauseQuery[];
}
