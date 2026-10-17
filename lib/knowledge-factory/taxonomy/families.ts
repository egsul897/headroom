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

export /**
 * An event-of-default trigger. Drafters write it several ways, not
 * only "constitutes an Event of Default": "shall be an Event of
 * Default", "is an Event of Default", "shall be deemed (to be) an
 * Event of Default", and "shall constitute a Default" are all
 * trigger phrasings. "Shall NOT be an Event of Default" (waiver
 * language) is deliberately not matched — the "shall be" adjacency
 * requirement excludes it.
 *
 * These two patterns are ALSO the EVENTS_OF_DEFAULT body patterns
 * below: a body that merely MENTIONS "Event of Default" (a
 * cross-reference — "not constituting an Event of Default under
 * Section 8.01(h)" — or a carve-out) is not an EoD trigger, and
 * tagging it EVENTS_OF_DEFAULT inverts its meaning (a liens
 * exception becomes "non-operative"). The family means "IS a
 * trigger", not "mentions EoD".
 */
const EOD_TRIGGER = /\bconstitutes?\s+(?:an\s+Event\s+of\s+Default|a\s+Default)\b/i;
const EOD_BE_TRIGGER =
  /\b(?:shall\s+be|is|shall\s+be\s+deemed\s+(?:to\s+be\s+)?)\s+(?:an\s+)?Event\s+of\s+Default\b/i;
// An EoD TITLE heading: "Events of Default", "Article VIII Events of
// Default", "Section 8.01 Events of Default", "Events of Default —
// Remedies". The structural parser sometimes uses a clause sentence
// as the heading ("Liens ... not constituting an Event of Default
// under Section 8.01(h)") — a bare "Event of Default" mention in
// such a heading is a cross-reference/negation, not the EoD
// section, so the heading pattern requires the title form.
const EOD_TITLE =
  /^\s*(?:ARTICLE|Article|SECTION|Section|\u00a7)?\s*(?:[IVXLC\d.]+\s*(?:[-:\u2013\u2014]\s*)?)?Events?\s+of\s+Default(?:\s*[-:\u2013\u2014]\s*.{0,40})?\s*$/i;

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
    bodyPatterns: [
      /\bdeclare\s+or\s+pay.{0,40}dividend\b/i,
      // Tax distributions: pass-through borrowers distribute
      // cash for members'/partners' tax on the borrower's
      // taxable income — an RP species with no other RP word
      // in the clause (census step 5). (A bare "pay dividends"
      // pattern is NOT used: restrictive-agreement chapeaus
      // enumerate dividend-paying as the restricted act, and
      // the pattern minted RP for that whole population.)
      /\bdistributions?\b[^.;]{0,80}\btaxable income\b/i,
      /\btax distributions?\b/i,
    ],
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
    headingPatterns: [/\bAsset\s+Sales?\b/i, /\bDispositions?\b/i, /\bSale\s+and\s+Leaseback\b/i, /\bSale-Leaseback\b/i],
    bodyPatterns: [
      /\breinvestment\b/i,
      /\bsale\s+and\s+leaseback\b/i,
      /\bsale-leaseback\b/i,
      // The canonical operative disposition frame — a prong
      // permitting disposition of all or substantially all
      // assets is an asset-sale permission even when a later
      // limb of the same prong also permits a merger.
      /\bdispose\s+of\s+all\s+or\s+substantially\s+all\b/i,
    ],
  },
  {
    family: "AFFILIATE_TRANSACTIONS",
    label: "Affiliate transactions",
    aliases: [],
    // Sections are titled both ways ("Affiliate Transactions"
    // and "Transactions with Affiliates" / "Limitation on
    // Transactions with Affiliates") — the census's K4h items
    // carried the second form verbatim and matched nothing.
    headingPatterns: [/\bAffiliate\s+Transactions?\b/i, /\bTransactions?\s+with\s+Affiliates?\b/i],
    // Operative shapes only (census step 5): a transaction
    // WITH an Affiliate. The old bare arm's-length pattern
    // minted this family as PRIMARY for any clause reciting
    // the standard (an employee-loans prong of an Investments
    // section was the corpus's only AFFILIATE primary) — the
    // arm's-length recital is the covenant's CONDITION, not
    // its detection signal.
    bodyPatterns: [
      /\btransactions?\b[^.;]{0,60}\bwith\s+(?:any\s+)?Affiliates?\b/i,
      /\bAffiliate\s+Transactions?\b/i,
    ],
  },
  {
    // Census step 6: the restrictive-agreements covenant (the
    // "burdensome agreements" / subsidiary-distributions
    // covenant) had NO family: its stem and its exception
    // clauses carried only mention families, so the whole
    // covenant population sat in OTHER across agreements.
    // Titles as drafted: "Restrictive Agreements",
    // "Burdensome Agreements", and the functional title
    // "Subsidiary Distributions" (the covenant restricts
    // agreements that block subsidiaries' distributions,
    // loans, and transfers to the borrower).
    family: "RESTRICTIVE_AGREEMENTS",
    label: "Restrictive agreements",
    aliases: ["burdensome agreements", "subsidiary distributions"],
    headingPatterns: [
      /\bRestrictive\s+Agreements?\b/i,
      /\bBurdensome\s+Agreements?\b/i,
      /\bSubsidiary\s+Distributions?\b/i,
    ],
    bodyPatterns: [
      // The chapeau shape: entering into any agreement that
      // prohibits or limits a subsidiary's ability to pay
      // dividends / make distributions / transfer assets.
      /\benter into\b[^.;]{0,90}\b(?:prohibits?|limits?|restricts?)\b[^.;]{0,50}\bability\b/i,
      /\bprohibits?\s+or\s+limits?\b[^.;]{0,60}\bability\b/i,
    ],
  },
  {
    family: "FUNDAMENTAL_CHANGES",
    label: "Fundamental changes",
    aliases: ["mergers", "consolidations"],
    headingPatterns: [/\bFundamental\s+Changes?\b/i, /\bMergers?\b/i],
    bodyPatterns: [
      /\bmerge\s+or\s+consolidate\b/i,
      // Verb chains as actually drafted (census step 5):
      // "merge, amalgamate or consolidate", "merge into or
      // consolidate with", "merge with or consolidate into".
      // Every chain requires a consolidation word — a bare
      // "consolidated" (Consolidated EBITDA / Total Assets)
      // never matches.
      /\bmerge,?\s+amalgamate\s+or\s+consolidate\b/i,
      /\bmerge\s+into\s+or\s+consolidate\s+with\b/i,
      // Post-2017 LSTA fundamental-changes drafting includes
      // consummating a Division (the J.Crew-era defined term).
      /\bconsummate\s+a\s+Division\b/i,
    ],
  },
  {
    family: "JUNIOR_DEBT_PREPAYMENTS",
    label: "Junior-debt prepayments",
    aliases: ["restricted debt payments", "subordinated prepayments"],
    headingPatterns: [
      /\b(?:Junior|Subordinated|Restricted\s+Debt)\b/i,
      // The same covenant species titled by its function:
      // "Payments of Certain Indebtedness" (the restricted
      // debt payments section where the title names no junior
      // class).
      /\bPayments?\s+of\s+(?:Certain\s+)?Indebtedness\b/i,
    ],
    bodyPatterns: [
      /\bprepay.{0,40}(?:Junior|Subordinated)\b/i,
    ],
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
    headingPatterns: [/\bGuarant(?:y|ee|ees)\b/i, /\bKeepwell\b/i],
    // No bare "keepwell" body pattern: keepwell sections are
    // titled "Keepwell" (the heading pattern carries them, and
    // the operative clause names the Qualified ECP Guarantor);
    // a body pattern also fires on schedule-merged items whose
    // text merely lists the section head.
    bodyPatterns: [/\bGuarantee\s+Obligation\b/i, /\bQualified\s+ECP\s+Guarantor\b/i],
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
    headingPatterns: [EOD_TITLE],
    // Trigger phrasings only — see the EOD_TRIGGER comment above.
    bodyPatterns: [EOD_TRIGGER, EOD_BE_TRIGGER],
  },
  {
    family: "MANDATORY_PREPAYMENTS",
    label: "Mandatory prepayments",
    aliases: ["ecf", "excess cash flow"],
    headingPatterns: [/\bMandatory\s+Prepayments?\b/i],
    // The operative shape only: "shall prepay". Optional
    // prepayments are drafted "may prepay" / "shall have the
    // right to prepay" — neither matches. (The comma-adjunct
    // form used by isMandatoryPrepaymentShape is NOT a family
    // pattern: as a positive signal it matches notice and
    // termination text — "shall notify ... in the case of
    // prepayment of" — and mints the family for mechanics.
    // There it only ever BLOCKS a mechanics gate, the
    // fail-closed direction; here it would mint.)
    bodyPatterns: [
      /\bExcess\s+Cash\s+Flow\b/i,
      /\bshall\s+prepay\b/i,
    ],
  },
  {
    family: "INCREMENTAL_DEBT_AND_FACILITIES",
    label: "Incremental debt and facilities",
    aliases: ["incremental equivalent debt"],
    headingPatterns: [/\bIncremental\b/i],
    // The defined-term regime's full surface (census step 5):
    // clauses work the "Incremental Increase" / "Incremental
    // Agreements" / "Incremental Extensions" terms far more
    // often than the literal "Incremental Facility".
    bodyPatterns: [
      /\bIncremental\s+(?:Facility|Equivalent|Increase|Agreements?|Extensions?|Loans?|Commitments?|Term Loans?|Revolving)\b/i,
    ],
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
 * Recover a section's full title from its excerpt lead when the
 * structural node's heading is a truncated fragment of it. EDGAR
 * segmentation routinely splits a title across lines and the
 * parser keeps only the first fragment ("Transactions" for
 * "Transactions with Affiliates", "Sale" for "Sale and Leaseback
 * Transactions", "Increase" for "Increase in Aggregate
 * Commitments"). The excerpt itself opens with the full title
 * ("Section 6.07 Limitation on Transactions with Affiliates .
 * The Borrower will not ...").
 *
 * Conservative by construction: a title is recovered only when
 * the excerpt lead — after a leading section marker — begins
 * with the node heading as a strict prefix and continues with
 * more title text before the first sentence terminator. The
 * recovered title is advisory classification evidence (family
 * heading tests, section-subject arbitration); it never
 * rewrites the node's stored heading.
 */
export function recoverSectionTitle(excerpt: string, heading: string): string | undefined {
  const norm = (excerpt ?? "").replace(/\s+/g, " ").trim();
  if (!norm) return undefined;
  const marker = norm.match(/^(?:section|§)?\s*[0-9]+(?:\.[0-9]+)*[a-z]?(?:\s*\([a-z0-9]+\))?\.?\s+/i);
  if (!marker) return undefined;
  const rest = norm.slice(marker[0].length);
  let end = rest.search(/\s\.\s/);
  if (end < 0) {
    const m2 = rest.match(/^.{3,120}?\.\s+(?=[A-Z(])/);
    end = m2 ? m2[0].length - 2 : -1;
  }
  if (end < 0) return undefined;
  const title = rest.slice(0, end).replace(/\s+/g, " ").trim();
  const h = (heading ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (h.length < 3) return undefined;
  if (!title.toLowerCase().startsWith(h)) return undefined;
  if (title.length <= h.length + 2) return undefined;
  if (title.length > 140) return undefined;
  // Two title shapes name something OTHER than the section's
  // operative subject and must not drive classification:
  // "Amendment of Indebtedness" is a meta-covenant (it restricts
  // amending debt documents — the Indebtedness is its OBJECT,
  // not a debt permission), and a title ending in "Rule(s)"
  // names an external regulatory regime ("Outbound Investment
  // Rule" — the Investment is the regime's name, not an
  // investments covenant).
  if (/^Amendment\b/i.test(title)) return undefined;
  if (/\bRules?$/i.test(title)) return undefined;
  return title;
}


export function isEventOfDefaultTrigger(heading = "", text = ""): boolean {
  return EOD_TRIGGER.test(text) || EOD_BE_TRIGGER.test(text) || EOD_TITLE.test(heading);
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
  // Rule 69: heading evidence outranks body evidence. The old
  // code returned families in taxonomy order, so a body-pattern
  // match for an early-taxonomy family beat a heading match for
  // the section's true family — e.g. a GUARANTEES section whose
  // body mentioned "reinvestment" came back [ASSET_SALES,
  // GUARANTEES], and analyzeProvision takes families[0] as the
  // primary family, miscategorizing the section as ASSET_SALES.
  // The heading is the section's identity; heading matches list
  // first (in taxonomy order), then body-only matches.
  const headingFamilies: KnowledgeTaxonomyFamily[] = [];
  const bodyFamilies: KnowledgeTaxonomyFamily[] = [];
  for (const def of TAXONOMY_FAMILIES) {
    // Heading patterns match only the section's own heading. They used to
    // also match the first 400 chars of body text, so a table-of-contents
    // excerpt — which lists many sections' headings — collected every
    // family named in the TOC.
    const headingHit = def.headingPatterns.some((re) => re.test(heading));
    const bodyHit = def.bodyPatterns.some((re) => re.test(text));
    if (headingHit) headingFamilies.push(def.family);
    else if (bodyHit) bodyFamilies.push(def.family);
  }
  families.push(...headingFamilies, ...bodyFamilies);
  if (families.length === 0) return ["UNKNOWN"];
  return stripCatchAllFallback(families);
}

/**
 * Rule 155: GENERAL_CONDITIONS_AND_EXCEPTIONS is a fallback label, never a
 * co-label. Phase-2 precedent aggregates showed it on 3,472 of 4,590
 * candidates (~76%) — not because three quarters of covenant language is
 * "general conditions", but because the catch-all is injected by generic
 * signals: the classifier's heading pattern `/\bConditions?\b/i` (matches
 * "Conditions to Borrowing", "Conditions Precedent", ...) and the
 * discovery ranker's `amendments_cross_refs` signal (matches any bare
 * "Section X.Y") and `negative_covenants` signal (matches the article
 * heading that contains the specific covenants). When a specific family
 * also matched, the catch-all must drop out — otherwise downstream
 * consumers that read families[0] (analyzeProvision) or count family
 * frequency see a catch-all-dominated taxonomy. When nothing specific
 * matched, the catch-all is kept: it is still the best available label.
 */
export function stripCatchAllFallback(
  families: KnowledgeTaxonomyFamily[],
): KnowledgeTaxonomyFamily[] {
  const hasSpecific = families.some(
    (f) => f !== "GENERAL_CONDITIONS_AND_EXCEPTIONS" && f !== "UNKNOWN",
  );
  if (!hasSpecific) return families;
  return families.filter((f) => f !== "GENERAL_CONDITIONS_AND_EXCEPTIONS");
}
