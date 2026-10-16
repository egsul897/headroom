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
    // "Debt" is the same covenant under a shorter name ("Limitation on
    // Debt", "shall not incur Debt", "Permitted Debt"). The patterns accept
    // the synonym only in the exact covenant shapes — a bare /\bDebt\b/
    // would mislabel "Junior Debt Prepayments", "Debt Service", and
    // "Debt-to-EBITDA" headings as Indebtedness.
    headingPatterns: [/\bIndebtedness\b/i, /\bLimitation on (?:Indebtedness|Debt)\b/i],
    bodyPatterns: [
      /\bPermitted\s+(?:Indebtedness|Debt)\b/i,
      /\bshall not\s+(?:incur|create|assume).{0,40}\b(?:Indebtedness|Debt)\b/i,
    ],
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
    headingPatterns: [/\bInvestments?\b/i],
    bodyPatterns: [/\bPermitted\s+Investments?\b/i],
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
    // A bare "3.0x" / "3.0 to 1" appears in rates, fees, and thresholds all
    // over an indenture; it must not by itself manufacture this family.
    bodyPatterns: [/\bpro\s+forma.{0,40}Leverage\b/i],
  },
  {
    family: "SHARED_CAPACITY_PROVISIONS",
    label: "Shared-capacity provisions",
    aliases: ["shared baskets"],
    headingPatterns: [/\bshared\b/i],
    bodyPatterns: [/\b(?:shared|aggregate(?:d)?)\s+basket\b/i],
  },
  {
    family: "GENERAL_CONDITIONS_AND_EXCEPTIONS",
    label: "General conditions and exceptions",
    aliases: ["provisos", "provided that"],
    // Heading-only: "provided that" / "no Default" / "pro forma compliance"
    // appear in nearly every operative section, so matching them in body
    // text manufactured this family (and a BASKETS_EXCEPTIONS_CONDITIONS
    // category) for defeasance, trustee, and administrative provisions.
    headingPatterns: [/\bConditions?\b/i],
    bodyPatterns: [],
  },
];

/**
 * Administrative / non-covenant provisions. These are real parts of an
 * indenture, but they are not operating covenants: defeasance is an
 * elective discharge mechanic, trustee/paying-agent sections are agency
 * mechanics, and interpretation clauses state how the document reads.
 * Labeling any of them a debt-incurrence prohibition or permission is a
 * false legal conclusion, so the classifier returns UNKNOWN for them and
 * candidate discovery drops them.
 */
const ADMINISTRATIVE_HEADING =
  /\b(?:defeasance|satisfaction and discharge|trustee|paying agent|registrar|authenticating agent|notices?|governing law|miscellaneous|counterparts?|severability|waiver of jury)\b/i;
const ADMINISTRATIVE_HEADING_PREFIX = /^\s*No\s+.*\b(?:interpretation|construction)\b/i;

export function isAdministrativeProvision(heading = "", _text = ""): boolean {
  return ADMINISTRATIVE_HEADING.test(heading) || ADMINISTRATIVE_HEADING_PREFIX.test(heading);
}

/**
 * An event-of-default trigger. Drafters write it several ways, not
 * only "constitutes an Event of Default": "shall be an Event of
 * Default", "is an Event of Default", "shall be deemed (to be) an
 * Event of Default", and "shall constitute a Default" are all
 * trigger phrasings. "Shall NOT be an Event of Default" (waiver
 * language) is deliberately not matched — the "shall be" adjacency
 * requirement excludes it.
 */
const EOD_TRIGGER = /\bconstitutes?\s+(?:an\s+Event\s+of\s+Default|a\s+Default)\b/i;
const EOD_BE_TRIGGER =
  /\b(?:shall\s+be|is|shall\s+be\s+deemed\s+(?:to\s+be\s+)?)\s+(?:an\s+)?Event\s+of\s+Default\b/i;

export function isEventOfDefaultTrigger(heading = "", text = ""): boolean {
  return EOD_TRIGGER.test(text) || EOD_BE_TRIGGER.test(text) || /\bEvents?\s+of\s+Default\b/i.test(heading);
}

export function classifyFamiliesFromText(text: string, heading = ""): KnowledgeTaxonomyFamily[] {
  // Administrative provisions never take a covenant family, no matter what
  // their body mentions (a defeasance section mentions the Trustee, money,
  // and provisos; none of that makes it a covenant).
  if (isAdministrativeProvision(heading, text)) return ["UNKNOWN"];
  // An EoD trigger is an EoD trigger even when its body mentions
  // Indebtedness, Liens, or a dollar threshold (e.g. §8.01(j) cross-default:
  // the Indebtedness is the trigger's subject, not a permission).
  if (isEventOfDefaultTrigger(heading, text)) return ["EVENTS_OF_DEFAULT"];
  const families: KnowledgeTaxonomyFamily[] = [];
  for (const def of TAXONOMY_FAMILIES) {
    // Heading patterns match only the section's own heading. They used to
    // also match the first 400 chars of body text, so a table-of-contents
    // excerpt — which lists many sections' headings — collected every
    // family named in the TOC.
    const hit =
      def.headingPatterns.some((re) => re.test(heading)) ||
      def.bodyPatterns.some((re) => re.test(text));
    if (hit) families.push(def.family);
  }
  if (families.length === 0) return ["UNKNOWN"];
  return families;
}
