/**
 * Versioned, extensible covenant taxonomy for the knowledge factory.
 * Supports multiple classifications and UNKNOWN. Does not force every
 * provision into a known family.
 */

import type { KnowledgeTaxonomyFamily } from "../types";

export const TAXONOMY_VERSION = "covenant-taxonomy.v1";

export interface TaxonomyFamilyDef {
  family: KnowledgeTaxonomyFamily;
  label: string;
  aliases: string[];
  headingPatterns: RegExp[];
  bodyPatterns: RegExp[];
}

export const TAXONOMY_FAMILIES: TaxonomyFamilyDef[] = [
  {
    family: "INDEBTEDNESS",
    label: "Indebtedness",
    aliases: ["debt", "permitted indebtedness"],
    headingPatterns: [/\bIndebtedness\b/i, /\bLimitation on Indebtedness\b/i],
    bodyPatterns: [/\bPermitted\s+Indebtedness\b/i, /\bshall not\s+(?:incur|create|assume).{0,40}Indebtedness\b/i],
  },
  {
    family: "LIENS",
    label: "Liens",
    aliases: ["permitted liens", "negative pledge"],
    headingPatterns: [/\bLiens?\b/i],
    bodyPatterns: [/\bPermitted\s+Liens?\b/i, /\bshall not\s+(?:create|incur|suffer).{0,40}Lien\b/i],
  },
  {
    family: "RESTRICTED_PAYMENTS",
    label: "Restricted payments",
    aliases: ["dividends", "rp"],
    headingPatterns: [/\bRestricted\s+Payments?\b/i],
    bodyPatterns: [/\bdeclare\s+or\s+pay.{0,40}dividend\b/i],
  },
  {
    family: "INVESTMENTS",
    label: "Investments",
    aliases: ["permitted investments"],
    // Do not match "Investment Company Act" (Reg U / representation sections).
    headingPatterns: [/\bInvestments?\b(?!\s+Company\b)/i],
    bodyPatterns: [/\bPermitted\s+Investments?\b/i, /\bMake or hold any Investments?\b/i],
  },
  {
    family: "ASSET_SALES",
    label: "Asset sales",
    aliases: ["dispositions"],
    headingPatterns: [/\bAsset\s+Sales?\b/i, /\bDispositions?\b/i],
    bodyPatterns: [/\breinvestment\b/i],
  },
  {
    family: "AFFILIATE_TRANSACTIONS",
    label: "Affiliate transactions",
    aliases: [],
    headingPatterns: [/\bAffiliate\s+Transactions?\b/i],
    bodyPatterns: [/\barm'?s[-\s]?length\b/i],
  },
  {
    family: "FUNDAMENTAL_CHANGES",
    label: "Fundamental changes",
    aliases: ["mergers", "consolidations"],
    headingPatterns: [/\bFundamental\s+Changes?\b/i, /\bMergers?\b/i],
    bodyPatterns: [/\bmerge\s+or\s+consolidate\b/i],
  },
  {
    family: "JUNIOR_DEBT_PREPAYMENTS",
    label: "Junior-debt prepayments",
    aliases: ["restricted debt payments", "subordinated prepayments"],
    headingPatterns: [/\b(?:Junior|Subordinated|Restricted\s+Debt)\b/i],
    bodyPatterns: [/\bprepay.{0,40}(?:Junior|Subordinated)\b/i],
  },
  {
    family: "FINANCIAL_MAINTENANCE_COVENANTS",
    label: "Financial maintenance covenants",
    aliases: ["financial covenants"],
    headingPatterns: [/\bFinancial\s+Covenants?\b/i],
    bodyPatterns: [/\bMaximum\s+(?:Total\s+)?(?:Net\s+)?Leverage\b/i, /\bminimum\s+interest\s+coverage\b/i],
  },
  {
    family: "GUARANTEES",
    label: "Guarantees",
    aliases: ["guaranties"],
    headingPatterns: [/\bGuarant(?:y|ee|ees)\b/i],
    bodyPatterns: [/\bGuarantee\s+Obligation\b/i],
  },
  {
    family: "RESTRICTED_SUBSIDIARIES",
    label: "Restricted subsidiaries",
    aliases: [],
    headingPatterns: [/\bRestricted\s+Subsidiar/i],
    bodyPatterns: [/\bRestricted\s+Subsidiary\b/i],
  },
  {
    family: "UNRESTRICTED_SUBSIDIARIES",
    label: "Unrestricted subsidiaries",
    aliases: [],
    headingPatterns: [/\bUnrestricted\s+Subsidiar/i],
    bodyPatterns: [/\bdesignate.{0,40}Unrestricted\b/i],
  },
  {
    family: "DESIGNATIONS",
    label: "Designations",
    aliases: [],
    headingPatterns: [/\bDesignation\b/i],
    bodyPatterns: [/\bdesignate\s+any\s+Subsidiary\b/i],
  },
  {
    family: "EVENTS_OF_DEFAULT",
    label: "Events of default",
    aliases: ["eod"],
    headingPatterns: [/\bEvents?\s+of\s+Default\b/i],
    bodyPatterns: [/\bEvent\s+of\s+Default\b/i],
  },
  {
    family: "MANDATORY_PREPAYMENTS",
    label: "Mandatory prepayments",
    aliases: ["ecf", "excess cash flow"],
    headingPatterns: [/\bMandatory\s+Prepayments?\b/i],
    bodyPatterns: [/\bExcess\s+Cash\s+Flow\b/i],
  },
  {
    family: "INCREMENTAL_DEBT_AND_FACILITIES",
    label: "Incremental debt and facilities",
    aliases: ["incremental equivalent debt"],
    headingPatterns: [/\bIncremental\b/i],
    bodyPatterns: [/\bIncremental\s+(?:Facility|Equivalent)\b/i],
  },
  {
    family: "AVAILABLE_AMOUNT_AND_BUILDER_BASKETS",
    label: "Available Amount and builder baskets",
    aliases: ["builder basket", "cumulative credit"],
    headingPatterns: [/\bAvailable\s+Amount\b/i],
    bodyPatterns: [/\bAvailable\s+Amount\b/i, /\bbuilder\s+basket\b/i],
  },
  {
    family: "RATIO_BASED_PERMISSIONS",
    label: "Ratio-based permissions",
    aliases: ["leverage-based"],
    headingPatterns: [/\bLeverage\s+Ratio\b/i],
    bodyPatterns: [/\bpro\s+forma.{0,40}Leverage\b/i, /\b\d+(?:\.\d+)?\s*(?:x|to\s*1)\b/i],
  },
  {
    family: "SHARED_CAPACITY_PROVISIONS",
    label: "Shared-capacity provisions",
    aliases: ["shared baskets"],
    headingPatterns: [/\bshared\b/i],
    bodyPatterns: [/\b(?:shared|aggregate(?:d)?)\s+(?:basket|capacity)\b/i],
  },
  {
    family: "GENERAL_CONDITIONS_AND_EXCEPTIONS",
    label: "General conditions and exceptions",
    aliases: ["provisos", "provided that"],
    headingPatterns: [/\bConditions?\b/i],
    bodyPatterns: [/\bprovided\s+that\b/i, /\bno\s+Default\b/i, /\bpro\s+forma\s+compliance\b/i],
  },
];

export function classifyFamiliesFromText(text: string, heading = ""): KnowledgeTaxonomyFamily[] {
  const headingHits: KnowledgeTaxonomyFamily[] = [];
  const bodyHits: KnowledgeTaxonomyFamily[] = [];
  const hay = `${heading}\n${text}`;
  for (const def of TAXONOMY_FAMILIES) {
    // Heading patterns apply ONLY to the structural heading — not the body lead.
    // Matching /\bInvestments?\b/ against body text falsely tagged Confidentiality /
    // Indemnification sections that mention the Investment Company Act.
    const headingHit = heading.length > 0 && def.headingPatterns.some((re) => re.test(heading));
    const bodyHit = def.bodyPatterns.some((re) => re.test(hay));
    if (headingHit) {
      headingHits.push(def.family);
    } else if (bodyHit) {
      bodyHits.push(def.family);
    }
  }
  // Heading-aligned families win primary slot so "Investments, Loans and Advances"
  // is not classified as INDEBTEDNESS merely because the body mentions debt.
  const seen = new Set<KnowledgeTaxonomyFamily>();
  const families: KnowledgeTaxonomyFamily[] = [];
  for (const f of [...headingHits, ...bodyHits]) {
    if (seen.has(f)) continue;
    seen.add(f);
    families.push(f);
  }
  if (families.length === 0) return ["UNKNOWN"];
  return families;
}
