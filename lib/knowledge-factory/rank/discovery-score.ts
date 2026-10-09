/**
 * Discovery ranking — prioritizes documents likely to contain substantive
 * covenant language. Score is a discovery aid, not a legal conclusion.
 */

import type { DiscoveryRankResult, KnowledgeTaxonomyFamily } from "../types";

interface RankSignal {
  name: string;
  family?: KnowledgeTaxonomyFamily;
  weight: number;
  re: RegExp;
}

const SIGNALS: RankSignal[] = [
  { name: "financial_covenants", family: "FINANCIAL_MAINTENANCE_COVENANTS", weight: 4, re: /\bFinancial\s+Covenant/i },
  { name: "negative_covenants", family: "GENERAL_CONDITIONS_AND_EXCEPTIONS", weight: 3, re: /\bNegative\s+Covenant/i },
  { name: "debt_incurrence", family: "INDEBTEDNESS", weight: 4, re: /\b(?:incur|Indebtedness)\b.{0,40}\b(?:permit|basket|greater of)\b|\bPermitted\s+Indebtedness\b/i },
  { name: "liens", family: "LIENS", weight: 3.5, re: /\b(?:Liens?|Permitted\s+Liens?)\b/i },
  { name: "restricted_payments", family: "RESTRICTED_PAYMENTS", weight: 4, re: /\bRestricted\s+Payments?\b/i },
  { name: "investments", family: "INVESTMENTS", weight: 3.5, re: /\b(?:Investments?|Permitted\s+Investments?)\b/i },
  { name: "asset_sales", family: "ASSET_SALES", weight: 3, re: /\b(?:Asset\s+Sales?|Dispositions?)\b/i },
  { name: "affiliate_transactions", family: "AFFILIATE_TRANSACTIONS", weight: 2.5, re: /\bAffiliate\s+Transactions?\b/i },
  { name: "junior_debt_prepayments", family: "JUNIOR_DEBT_PREPAYMENTS", weight: 3.5, re: /\b(?:Junior|Subordinated).{0,40}(?:Prepay|Redeem|Repurchase)|Restricted\s+Debt\s+Payments?\b/i },
  { name: "guarantees", family: "GUARANTEES", weight: 2.5, re: /\bGuarant(?:y|ee|ees)\b/i },
  { name: "ebitda_definitions", family: "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS", weight: 3.5, re: /\b(?:Consolidated\s+)?EBITDA\b/i },
  { name: "leverage_ratios", family: "RATIO_BASED_PERMISSIONS", weight: 3.5, re: /\b(?:Total\s+)?(?:Net\s+)?Leverage\s+Ratio\b|\bInterest\s+Coverage\s+Ratio\b/i },
  { name: "available_amount", family: "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS", weight: 4, re: /\bAvailable\s+Amount\b|\bbuilder\s+basket\b/i },
  { name: "incremental_facilities", family: "INCREMENTAL_DEBT_AND_FACILITIES", weight: 3.5, re: /\bIncremental\s+(?:Facility|Equivalent|Commitments?)\b/i },
  // Relationship language only — bare "aggregate amount" is not shared capacity.
  {
    name: "shared_baskets",
    family: "SHARED_CAPACITY_PROVISIONS",
    weight: 4,
    re: /\b(?:shared\s+(?:basket|capacity|pool)|combined\s+with|together\s+with\b[\s\S]{0,200}?\b(?:pursuant\s+to|under)\s+(?:Sections?|clauses?)|without\s+duplication)\b/i,
  },
  { name: "anti_stacking", family: "SHARED_CAPACITY_PROVISIONS", weight: 3.5, re: /\b(?:without\s+duplication|anti[-\s]?stack(?:ing)?|not\s+be\s+double[-\s]?counted)\b/i },
  { name: "grower_basket", family: "INDEBTEDNESS", weight: 3, re: /\b\d+(?:\.\d+)?\s*%\s+of\s+(?:Consolidated\s+)?(?:EBITDA|Total\s+Assets)\b/i },
  { name: "amendments_cross_refs", family: "GENERAL_CONDITIONS_AND_EXCEPTIONS", weight: 2, re: /\b(?:Amendment|amends|Section\s+\d+\.\d+)\b/i },
  { name: "unrestricted_subsidiaries", family: "UNRESTRICTED_SUBSIDIARIES", weight: 2.5, re: /\bUnrestricted\s+Subsidiar/i },
  { name: "events_of_default", family: "EVENTS_OF_DEFAULT", weight: 2, re: /\bEvents?\s+of\s+Default\b/i },
  { name: "mandatory_prepayments", family: "MANDATORY_PREPAYMENTS", weight: 2.5, re: /\bMandatory\s+Prepayments?\b/i },
];

export function scoreDiscoveryPotential(text: string, metaHaystack = ""): DiscoveryRankResult {
  const haystack = `${metaHaystack}\n${text}`;
  const signals: string[] = [];
  const families = new Set<KnowledgeTaxonomyFamily>();
  let score = 0;
  for (const s of SIGNALS) {
    if (s.re.test(haystack)) {
      signals.push(s.name);
      score += s.weight;
      if (s.family) families.add(s.family);
    }
  }
  // Soft length prior: very short docs rarely carry full covenant packages.
  if (text.length > 50_000) score += 2;
  else if (text.length > 10_000) score += 1;
  return {
    score: Math.round(score * 10) / 10,
    signals,
    families: [...families],
  };
}
