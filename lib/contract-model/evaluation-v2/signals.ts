/**
 * Evaluation Methodology V2 — Layer 1: deterministic signal correspondence.
 *
 * Phase 3F.1.5. This layer reads TEXT AND STRUCTURED CONTENT ONLY. It never
 * reads a section number, a node key, a parent/child relationship, or a
 * document position. Everything here is derived from what a provision
 * actually says.
 *
 * The layer's job is to produce support / conflict / missing evidence. It
 * deliberately does NOT decide semantic equivalence on its own — that is
 * semantic-correspondence.ts's job, which consumes these signals dimension by
 * dimension.
 *
 * All patterns are drafting patterns (how credit agreements and indentures are
 * written), never fixture-specific: no company name, no package id, no
 * benchmark section number, and no known threshold appears anywhere below.
 */
import type {
  ActionTag,
  ComparisonDirection,
  ConditionTag,
  EntityScopeTag,
  ExceptionTag,
  InstrumentTag,
  LegalPosture,
  MetricTag,
  NumericFigure,
  ProvisionRole,
  SemanticSignals,
} from "./types";

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(text: string): string {
  return normalizeText(text).toLowerCase();
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const MONEY_RE = /(?:(US\$|C\$|CAD\s?\$|USD\s?\$|\$)\s?)([0-9][0-9,]*(?:\.[0-9]+)?)(\s*(million|billion|mm|bn))?/gi;
const BARE_LARGE_NUMBER_RE = /\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)\b/g;
const PERCENT_RE = /([0-9]+(?:\.[0-9]+)?)\s?%/g;
const RATIO_RE = /([0-9]+(?:\.[0-9]+)?)\s?(?:to|:)\s?([0-9]+(?:\.[0-9]+)?)|\b([0-9]+(?:\.[0-9]+)?)x\b/gi;

function currencyOf(symbol: string | undefined): string {
  const s = (symbol ?? "").toUpperCase().replace(/\s/g, "");
  if (s.startsWith("C$") || s.startsWith("CAD")) return "CAD";
  return "USD";
}

function scaleOf(suffix: string | undefined): number {
  const s = (suffix ?? "").trim().toLowerCase();
  if (s === "million" || s === "mm") return 1_000_000;
  if (s === "billion" || s === "bn") return 1_000_000_000;
  return 1;
}

export function extractAmounts(text: string): NumericFigure[] {
  const t = normalizeText(text);
  const out: NumericFigure[] = [];
  const seen = new Set<string>();
  for (const m of t.matchAll(MONEY_RE)) {
    const value = Number((m[2] ?? "").replace(/,/g, "")) * scaleOf(m[4]);
    if (!Number.isFinite(value) || value <= 0) continue;
    const currency = currencyOf(m[1]);
    const key = `${currency}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "MONEY", value, currency, basis: null, raw: m[0] });
  }
  // Bare grouped numbers ("10,000,000") that a summary sometimes writes without a
  // currency symbol. Only accepted at >= 1,000 so ordinary counts never become money.
  for (const m of t.matchAll(BARE_LARGE_NUMBER_RE)) {
    const raw = m[1] ?? "";
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 1000) continue;
    const key = `USD:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "MONEY", value, currency: "USD", basis: null, raw });
  }
  return out;
}

/** Metric names as they are actually drafted, mapped to a canonical tag. */
const METRIC_PATTERNS: ReadonlyArray<[RegExp, MetricTag]> = [
  [/\b(consolidated\s+)?(adjusted\s+)?ebitda\b/i, "EBITDA"],
  [/\b(consolidated\s+)?total\s+assets\b/i, "TOTAL_ASSETS"],
  [/\bnet\s+tangible\s+assets\b/i, "NET_TANGIBLE_ASSETS"],
  [/\bconsolidated\s+net\s+income\b/i, "CONSOLIDATED_NET_INCOME"],
  [/\b(total|consolidated)\s+revenue(s)?\b/i, "TOTAL_REVENUE"],
  [/\bconsolidated\s+total\s+debt\b/i, "CONSOLIDATED_TOTAL_DEBT"],
  [/\bavailable\s+amount\b/i, "AVAILABLE_AMOUNT"],
  [/\bborrowing\s+base\b/i, "BORROWING_BASE"],
  [/\b(excess\s+)?availability\b/i, "AVAILABILITY"],
  [/\btotal\s+net\s+leverage\s+ratio\b/i, "TOTAL_NET_LEVERAGE_RATIO"],
  [/\bsecured\s+net\s+leverage\s+ratio\b/i, "SECURED_NET_LEVERAGE_RATIO"],
  [/\bfirst\s+lien\s+(net\s+)?leverage\s+ratio\b/i, "FIRST_LIEN_LEVERAGE_RATIO"],
  [/\bsenior\s+secured\s+leverage\s+ratio\b/i, "SENIOR_SECURED_LEVERAGE_RATIO"],
  [/\binterest\s+coverage\s+ratio\b/i, "INTEREST_COVERAGE_RATIO"],
  [/\bfixed\s+charge\s+coverage\s+ratio\b/i, "FIXED_CHARGE_COVERAGE_RATIO"],
  [/\bfccr\b/i, "FIXED_CHARGE_COVERAGE_RATIO"],
];

export function extractMetrics(text: string): MetricTag[] {
  const t = normalizeText(text);
  const out = new Set<MetricTag>();
  for (const [re, tag] of METRIC_PATTERNS) if (re.test(t)) out.add(tag);
  return [...out];
}

/** The metric a percentage is taken *of* — read from the words immediately following the "%". */
function percentBasis(t: string, matchIndex: number, matchLength: number): MetricTag | null {
  const tail = t.slice(matchIndex + matchLength, matchIndex + matchLength + 90);
  const ofMatch = /^\s*(?:of|based on)\s+(.{0,70})/i.exec(tail);
  const scope = ofMatch?.[1] ?? tail;
  for (const [re, tag] of METRIC_PATTERNS) if (re.test(scope)) return tag;
  return null;
}

export function extractPercentages(text: string): NumericFigure[] {
  const t = normalizeText(text);
  const out: NumericFigure[] = [];
  const seen = new Set<string>();
  for (const m of t.matchAll(PERCENT_RE)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const basis = percentBasis(t, m.index ?? 0, m[0].length);
    const key = `${value}:${basis ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "PERCENT", value, currency: null, basis, raw: m[0] + (basis ? ` of ${basis}` : "") });
  }
  return out;
}

const RATIO_METRIC_TAGS: ReadonlySet<MetricTag> = new Set<MetricTag>([
  "TOTAL_NET_LEVERAGE_RATIO",
  "SECURED_NET_LEVERAGE_RATIO",
  "FIRST_LIEN_LEVERAGE_RATIO",
  "SENIOR_SECURED_LEVERAGE_RATIO",
  "INTEREST_COVERAGE_RATIO",
  "FIXED_CHARGE_COVERAGE_RATIO",
]);

/** The ratio metric nearest to a "x.xx to 1.00" expression, searched in a bounded window on both sides. */
function ratioMetricNear(t: string, index: number): MetricTag | null {
  const window = t.slice(Math.max(0, index - 160), index + 160);
  for (const [re, tag] of METRIC_PATTERNS) {
    if (RATIO_METRIC_TAGS.has(tag) && re.test(window)) return tag;
  }
  return null;
}

export function extractRatios(text: string): NumericFigure[] {
  const t = normalizeText(text);
  const out: NumericFigure[] = [];
  const seen = new Set<string>();
  for (const m of t.matchAll(RATIO_RE)) {
    let value: number;
    if (m[1] !== undefined && m[2] !== undefined) {
      const denom = Number(m[2]);
      if (!Number.isFinite(denom) || denom === 0) continue;
      value = Number(m[1]) / denom;
    } else if (m[3] !== undefined) {
      value = Number(m[3]);
    } else {
      continue;
    }
    if (!Number.isFinite(value)) continue;
    const basis = ratioMetricNear(t, m.index ?? 0);
    const key = `${value.toFixed(4)}:${basis ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "RATIO", value, currency: null, basis, raw: m[0] });
  }
  return out;
}

export function extractTimePeriods(text: string): string[] {
  const t = lower(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(four|4|two|2|twelve|12|eight|8)\s+(consecutive\s+)?(fiscal\s+)?(quarters|months)\b/g)) out.add(normalizeText(m[0]));
  for (const m of t.matchAll(/\btrailing\s+(twelve|12|four|4)[- ](months?|quarters?)\b/g)) out.add(normalizeText(m[0]));
  for (const m of t.matchAll(/\bwithin\s+([0-9]{1,3})\s+(business\s+)?days\b/g)) out.add(normalizeText(m[0]));
  for (const m of t.matchAll(/\b([0-9]{1,3})\s+(business\s+)?days\b/g)) out.add(normalizeText(m[0]));
  return [...out];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const ACTION_PATTERNS: ReadonlyArray<[RegExp, ActionTag]> = [
  [/\b(incur|incurrence|create|assume|suffer to exist|become or remain liable)\b[^.;]{0,60}\b(indebtedness|debt|borrowings)\b/i, "INCUR_DEBT"],
  [/\bindebtedness\b[^.;]{0,40}\b(permitted|prohibit|incur|assume|outstanding)\b/i, "INCUR_DEBT"],
  [/\bguarant(y|ee|ies|ees|eeing)\b/i, "GUARANTEE_OBLIGATION"],
  [/\b(create|incur|assume|permit to exist)\b[^.;]{0,40}\blien(s)?\b/i, "CREATE_LIEN"],
  [/\blien(s)?\b[^.;]{0,40}\b(permitted|prohibit|securing)\b/i, "CREATE_LIEN"],
  [/\b(make|hold|purchase|acquire|permit to exist)\b[^.;]{0,60}\b(investment|loan|advance)s?\b/i, "MAKE_INVESTMENT"],
  [/\binvestments?\b/i, "MAKE_INVESTMENT"],
  [/\b(permitted\s+)?acquisition(s)?\b/i, "ACQUIRE_BUSINESS"],
  [/\b(dispose|disposition|sell|sale|convey|transfer|divest)\w*\b[^.;]{0,40}\b(asset|propert|equity interest)/i, "DISPOSE_ASSET"],
  [/\b(asset sale|disposition)s?\b/i, "DISPOSE_ASSET"],
  [/\bsale\s+(and|-)\s?leaseback\b/i, "SALE_LEASEBACK"],
  [/\b(restricted payment|dividend|distribution|repurchase|redeem)\w*\b/i, "RESTRICTED_PAYMENT"],
  [/\b(prepay|repurchase|redeem|defease|retire)\w*\b[^.;]{0,60}\b(junior|subordinated|unsecured|material)\s+indebtedness\b/i, "PREPAY_JUNIOR_DEBT"],
  [/\bcertain payments? of indebtedness\b/i, "PREPAY_JUNIOR_DEBT"],
  [/\b(voluntary|mandatory)\s+prepayment\b/i, "PREPAY_LOANS"],
  [/\bprepay\w*\b[^.;]{0,30}\b(loans|borrowings|term loans|revolving)\b/i, "PREPAY_LOANS"],
  [/\b(merge|merger|consolidat|amalgamat|liquidat|dissolv|fundamental change)\w*\b/i, "MERGE_CONSOLIDATE"],
  [/\b(change|line)\s+(in|of)\s+business\b/i, "CHANGE_BUSINESS"],
  [/\b(transaction|arrangement)s?\s+with\s+(any\s+)?affiliate/i, "TRANSACT_WITH_AFFILIATE"],
  [/\brestrictive agreement|prohibit\w*\s+(the\s+)?ability\s+of|burdensome agreement/i, "ENTER_RESTRICTIVE_AGREEMENT"],
  [/\bamend\w*\b[^.;]{0,50}\b(material|organizational|subordinated)\s+(document|indebtedness|agreement)/i, "AMEND_MATERIAL_DOCUMENT"],
  [/\bswap agreement|hedging agreement|derivative\b/i, "ENTER_SWAP"],
  [/\bdesignat\w*\b[^.;]{0,50}\bunrestricted subsidiar/i, "DESIGNATE_UNRESTRICTED_SUBSIDIARY"],
  [/\b(maintain|permit|comply with)\b[^.;]{0,60}\b(leverage|coverage)\s+ratio\b/i, "MAINTAIN_FINANCIAL_RATIO"],
  [/\bfinancial covenants?\b/i, "MAINTAIN_FINANCIAL_RATIO"],
  [/\b(deliver|furnish)\w*\b[^.;]{0,60}\b(financial statement|compliance certificate|report)/i, "DELIVER_FINANCIAL_REPORT"],
  [/\bnotice(s)? of\b|\bprompt(ly)? written notice\b/i, "GIVE_NOTICE"],
  [/\binsurance\b/i, "MAINTAIN_INSURANCE"],
  [/\btax(es)?\b[^.;]{0,30}\b(pay|payment|obligation)/i, "PAY_TAXES"],
  [/\b(collateral|security interest|pledge)\b[^.;]{0,60}\b(grant|provide|perfect)/i, "GRANT_COLLATERAL"],
  [/\b(additional collateral|further assurances|guarantee requirement)\b/i, "GRANT_COLLATERAL"],
  [/\b(commitment|borrowing|loan)s?\b[^.;]{0,40}\b(increase|request|made|available)\b/i, "BORROW_OR_COMMIT"],
  [/\b(assign|assignment|participation|transfer)\b[^.;]{0,40}\b(rights|obligations|interest)\b/i, "ASSIGN_TRANSFER_RIGHTS"],
  [/\buse of proceeds\b|\bproceeds\s+(shall|will|may)\s+be\s+used\b/i, "USE_PROCEEDS"],
  [/\b(existence|corporate existence|conduct of business)\b[^.;]{0,30}\bmaintain|preserve\b/i, "MAINTAIN_EXISTENCE"],
  [/\b(interest|fees)\b[^.;]{0,30}\b(payable|pay|accru)/i, "PAY_FEES_OR_INTEREST"],
  [/\b(event of default|remedies|acceleration)\b/i, "EXERCISE_REMEDIES"],
  [/\bissue\w*\b[^.;]{0,40}\b(equity interests|capital stock|shares)\b/i, "ISSUE_EQUITY"],
  [/\bfiscal (year|quarter)\b[^.;]{0,30}\bchange\b/i, "CHANGE_FISCAL_PERIOD"],
  [/\bcompliance with laws?\b|\bsanctions|anti-corruption|erisa\b/i, "COMPLY_WITH_LAW"],
];

export function extractActions(text: string): ActionTag[] {
  const t = normalizeText(text);
  const out = new Set<ActionTag>();
  for (const [re, tag] of ACTION_PATTERNS) if (re.test(t)) out.add(tag);
  return [...out];
}

// ---------------------------------------------------------------------------
// Covenant family and object/resource
//
// Classified by THIS evaluator from the provision's own words, on BOTH sides,
// so the comparison is apples-to-apples and never inherits the production
// pipeline's own label as if it were truth.
// ---------------------------------------------------------------------------

const FAMILY_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bfinancial covenant|leverage ratio|coverage ratio|fixed charge|maintain(ed)? a ratio\b/i, "FINANCIAL_COVENANTS"],
  [/\bevent of default|acceleration|remedies\b/i, "EVENTS_OF_DEFAULT"],
  [/\bmeans\b|\bhas the meaning\b|\bdefined term\b|\bfor purposes of (this|the) (agreement|definition)\b/i, "DEFINITIONS_CALCULATION_RULES"],
  [/\bsale\s+(and|-)\s?leaseback\b/i, "SALE_LEASEBACKS"],
  [/\b(dispos|asset sale|divest)\w*\b/i, "ASSET_SALES"],
  [/\brestricted payment|dividend|distribution on|repurchase of (equity|capital stock)\b/i, "RESTRICTED_PAYMENTS"],
  [/\b(investment|loan or advance|advances to)\b/i, "INVESTMENTS"],
  [/\bpermitted acquisition|acquisition of\b/i, "ACQUISITIONS"],
  [/\blien(s)?\b/i, "LIENS"],
  [/\bguarant(y|ee|ies|ees)\b/i, "GUARANTEES"],
  [/\bindebtedness|borrowed money\b/i, "INDEBTEDNESS"],
  [/\bmandatory prepayment|prepay\w*\b/i, "MANDATORY_PREPAYMENTS"],
  [/\bmerge|consolidat|amalgamat|fundamental change|dissolution\b/i, "FUNDAMENTAL_CHANGES"],
  [/\baffiliate transaction|transactions? with (any )?affiliate\b/i, "AFFILIATE_TRANSACTIONS"],
  [/\bcollateral|security interest|pledge|perfection\b/i, "COLLATERAL_SECURITY"],
  [/\bunrestricted subsidiar|designat\w* .{0,30}subsidiar\b/i, "SUBSIDIARY_DESIGNATIONS"],
  [/\bchange of control\b/i, "CHANGE_OF_CONTROL"],
  [/\bamendment|waiver|consent of (the )?(required )?lenders\b/i, "AMENDMENT_WAIVER_CONSENT"],
  [/\bnotice of\b|\bprompt(ly)? (written )?notice\b/i, "NOTICE_REQUIREMENTS"],
  [/\bfinancial statement|compliance certificate|report(ing)?\b/i, "REPORTING_INFORMATION"],
  [/\brestricted subsidiar|loan part(y|ies)|entity scope\b/i, "ENTITY_SCOPE_RESTRICTIONS"],
];

export function classifyFamily(text: string): string {
  const t = normalizeText(text);
  for (const [re, family] of FAMILY_PATTERNS) if (re.test(t)) return family;
  return "OTHER_UNCLASSIFIED";
}

const OBJECT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bindebtedness|debt\b/i, "INDEBTEDNESS"],
  [/\blien(s)?\b/i, "LIEN"],
  [/\binvestment(s)?\b/i, "INVESTMENT"],
  [/\bdispos\w*|asset sale\b/i, "DISPOSITION"],
  [/\brestricted payment|dividend|distribution\b/i, "RESTRICTED_PAYMENT"],
  [/\bguarant(y|ee|ies|ees)\b/i, "GUARANTEE"],
  [/\bequity interest|capital stock|shares\b/i, "EQUITY_INTEREST"],
  [/\bagreement|arrangement|contract\b/i, "AGREEMENT"],
  [/\bsubsidiar(y|ies)\b/i, "SUBSIDIARY"],
  [/\bcollateral|security interest\b/i, "COLLATERAL"],
  [/\bintellectual property\b/i, "INTELLECTUAL_PROPERTY"],
  [/\bcommitment(s)?|loan(s)?|borrowing(s)?\b/i, "LOAN_OR_COMMITMENT"],
  [/\bfinancial statement|certificate|report\b/i, "REPORT_OR_CERTIFICATE"],
  [/\bratio\b/i, "FINANCIAL_RATIO"],
  [/\bswap agreement|hedg\w*\b/i, "SWAP"],
  [/\btax(es)?\b/i, "TAX"],
  [/\binsurance\b/i, "INSURANCE"],
  [/\bproceeds\b/i, "PROCEEDS"],
];

export function extractObjects(text: string): string[] {
  const t = normalizeText(text);
  const out = new Set<string>();
  for (const [re, tag] of OBJECT_PATTERNS) if (re.test(t)) out.add(tag);
  return [...out];
}

// ---------------------------------------------------------------------------
// Legal posture
// ---------------------------------------------------------------------------

const PROHIBITION_RE = /\b(no\s+(loan party|borrower|company|subsidiary|obligor)\b[^.]{0,60}\bwill\b|shall not|will not|may not|prohibit\w*|nor (will|shall) it permit|not permit|refrain from)\b/i;
const PERMISSION_VERBS =
  "incur|make|create|pay|dispose|declare|enter|acquire|sell|transfer|issue|designate|prepay|guarantee|hold|purchase|amend|repurchase|redeem|grant|form|consummate|become|assume|permit|reclassify|divide";
const PERMISSION_RE = new RegExp(
  `\\b(is|are) permitted\\b|\\bmay\\b(?!\\s+not)(?:\\s+\\w+){0,3}\\s+(?:${PERMISSION_VERBS})\\b|\\bshall be (?:entitled|permitted) to\\b|\\bis allowed\\b|\\bcarve[- ]?out\\b|\\bpermits\\b|\\bpermitting\\b`,
  "i",
);
const OBLIGATION_RE = /\b(shall (deliver|furnish|maintain|pay|provide|cause|give|comply|keep|preserve)|will (deliver|furnish|maintain|pay|provide|cause)|must\b|is required to\b|agrees to\b|shall be required to\b)/i;
const DEFINITION_RE = /\b(means|shall mean|has the meaning|is defined as|definition of)\b/i;
/**
 * Only a clause that DECLARES an Event of Default counts. The mere phrase
 * "no Default or Event of Default shall exist" is a CONDITION on some other
 * provision, not an Event of Default clause — conflating the two mislabels
 * every conditioned basket in a credit agreement.
 */
const EOD_DECLARING_RE =
  /\b(shall|will) constitute an? (event of )?default\b|\bit shall be an event of default\b|\bthe following (?:events|shall)[^.]{0,80}\bevents? of default\b|\bevents? of default\b\s*[.:]\s*(?:if|the|each|any)/i;
const REP_RE = /\brepresent(s|ation)?\s+and\s+warrant|\brepresents that\b/i;
/**
 * A provision IS a condition only when it is drafted as one. "so long as",
 * "provided that" and "only if" appear inside baskets, covenants and
 * definitions alike — treating them as posture evidence would relabel every
 * conditioned basket in a credit agreement as a condition.
 */
const CONDITION_RE = /\bcondition(s)? precedent\b|\bit shall be a condition\b|\bsubject to (the )?satisfaction of\b|\bthe following conditions (?:shall be|are) satisfied\b/i;

/**
 * A declared unit type / role is the OTHER side's own statement about what
 * kind of provision this is. It is used only where the text alone is silent —
 * enumerated baskets are routinely drafted as bare noun phrases ("(k)
 * Investments in joint ventures ... not to exceed $18,000,000") with no verb
 * at all, and refusing to read a posture there would suppress a large and
 * entirely legitimate class of matches. Applied symmetrically to ground truth
 * and candidates so neither side gets an advantage from its own labels.
 */
const DECLARED_TYPE_POSTURE: Readonly<Record<string, LegalPosture>> = {
  BASKET: "PERMISSION",
  EXCEPTION: "PERMISSION",
  PERMISSION: "PERMISSION",
  PROVISO: "PERMISSION",
  RATIO_BASED_PERMISSION: "PERMISSION",
  REFINANCING_PERMISSION: "PERMISSION",
  BUILDER: "PERMISSION",
  SHARED_CAP: "PERMISSION",
  LIABILITY_CAP: "PERMISSION",
  QUANTITATIVE_PERMISSION: "PERMISSION",
  GENERAL_PROHIBITION: "PROHIBITION",
  PROHIBITION: "PROHIBITION",
  COVENANT: "OBLIGATION",
  OTHER_OPERATIVE: "OBLIGATION",
  QUALITATIVE_OBLIGATION: "OBLIGATION",
  GUARANTEE_OBLIGATION: "OBLIGATION",
  SECURITY_GRANT: "OBLIGATION",
  CONDITION: "CONDITION",
  DEFINITION: "DEFINITION",
  DEFINITIONAL_DEPENDENCY_CANDIDATE: "DEFINITION",
  CALCULATION_RULE: "DEFINITION",
  EVENT_OF_DEFAULT: "EVENT_OF_DEFAULT",
  TRIGGER: "EVENT_OF_DEFAULT",
  REPRESENTATION: "REPRESENTATION",
  // FINANCIAL_TEST / RATIO_TEST are deliberately ABSENT: a ratio test is a
  // measurement, not a deontic statement, and inferring a posture from the
  // label alone would manufacture a posture inversion out of a labelling
  // choice. Where the drafting itself says "shall not permit ... to exceed" or
  // "shall maintain ... of at least", the text path above already supplies it.
};

export function extractPosture(text: string, declaredType?: string | null): LegalPosture {
  const t = normalizeText(text);
  let fromText: LegalPosture = "UNDETERMINED";
  if (DEFINITION_RE.test(t) && !PROHIBITION_RE.test(t) && !PERMISSION_RE.test(t)) fromText = "DEFINITION";
  else if (EOD_DECLARING_RE.test(t)) fromText = "EVENT_OF_DEFAULT";
  else if (REP_RE.test(t)) fromText = "REPRESENTATION";
  else if (PROHIBITION_RE.test(t)) fromText = "PROHIBITION";
  else if (PERMISSION_RE.test(t)) fromText = "PERMISSION";
  else if (OBLIGATION_RE.test(t)) fromText = "OBLIGATION";
  else if (CONDITION_RE.test(t)) fromText = "CONDITION";
  if (fromText !== "UNDETERMINED") return fromText;
  const declared = (declaredType ?? "").toUpperCase().trim();
  return DECLARED_TYPE_POSTURE[declared] ?? "UNDETERMINED";
}

/**
 * Deontic direction. The posture dimension's job is to catch an INVERSION
 * (a permission presented as the restriction it carves out of, or vice versa).
 * A restriction drafted in the negative voice ("shall not permit the ratio to
 * be less than 3.00x") and the same restriction drafted in the positive voice
 * ("shall maintain a ratio of at least 3.00x") are the same legal claim; the
 * subject/action and object dimensions carry the discrimination between
 * genuinely different mandatory provisions.
 */
export type PostureClass = "RESTRICTIVE" | "PERMISSIVE" | "NEUTRAL" | "UNDETERMINED";

export function postureClass(posture: LegalPosture): PostureClass {
  switch (posture) {
    case "PROHIBITION":
    case "OBLIGATION":
      return "RESTRICTIVE";
    case "PERMISSION":
      return "PERMISSIVE";
    case "UNDETERMINED":
      return "UNDETERMINED";
    default:
      return "NEUTRAL";
  }
}

// ---------------------------------------------------------------------------
// Provision role / breadth
//
// This is the dimension that makes "chapeau credited via an unrelated
// descendant basket" structurally impossible. It is derived from DRAFTING
// SHAPE ONLY: a chapeau announces a universal restriction and defers to an
// enumerated exception list; an enumerated exception is one item on that list.
// ---------------------------------------------------------------------------

const CHAPEAU_DEFERRAL_RE =
  /\bexcept\s*(:|as (?:otherwise )?(?:permitted|provided|expressly permitted)|for the following|as set forth (?:below|in clauses))|except as permitted by clauses|\bclauses \([a-z]+\) through \([a-z]+\)|\bthe foregoing shall not (?:apply|prohibit|restrict)|\bshall not (?:apply to|prohibit|restrict) \(?[a-z]?\)?/i;
const UNIVERSAL_OBJECT_RE =
  /\bany\s+(indebtedness|liens?|investments?|assets?|restricted payments?|agreements?|guarant(?:y|ee|ies|ees)|subsidiar(?:y|ies)|equity interests?|transactions?|dispositions?|property|obligations?)\b/i;
const FLUSH_OVERRIDE_RE = /\bnotwithstanding\s+(anything|any other|the foregoing|any provision)/i;
const PROVISO_RE = /^\s*(provided|provided,? however|provided further)\b|\bfor purposes of (this|the) (clause|section)\b|\bshall be (determined|calculated) without regard to\b/i;
const FINANCIAL_TEST_RE = /\b(permit|maintain|shall not permit)\b[^.]{0,80}\bratio\b[^.]{0,80}\b(to exceed|to be less than|of at least|greater than)\b|\bas (?:at|of) the last day of\b[^.]{0,80}\bratio\b/i;
const XREF_ONLY_RE = /^(see|refer to|as (?:defined|set forth) in)\b|\bcross[- ]reference\b/i;

export interface ProvisionRoleInput {
  text: string;
  /** Ground truth's or the candidate system's own declared unit type/role, if any. Used only as corroboration. */
  declaredType?: string | null;
  posture?: LegalPosture;
}

export function extractProvisionRole(input: ProvisionRoleInput): ProvisionRole {
  const t = normalizeText(input.text);
  const declared = (input.declaredType ?? "").toUpperCase();
  const posture = input.posture ?? extractPosture(t, input.declaredType ?? null);

  // Declared types that are unambiguous on their own face.
  if (declared === "DEFINITION" || declared === "ANALYZER_DEFINED_TERM" || declared === "DEFINITIONAL_DEPENDENCY_CANDIDATE") return "DEFINITION_OR_CALCULATION";
  if (declared === "EVENT_OF_DEFAULT" || declared === "TRIGGER") return "EVENT_OF_DEFAULT_CLAUSE";
  if (declared === "AMENDMENT_MECHANIC" || declared === "WAIVER") return "AMENDMENT_MECHANIC";
  if (declared === "CROSS_REFERENCE") return "CROSS_REFERENCE_ONLY";
  if (declared === "BOILERPLATE_SUMMARY") return "MECHANICAL_BOILERPLATE";
  if (declared === "REPRESENTATION") return "REPRESENTATION_CLAUSE";

  if (FLUSH_OVERRIDE_RE.test(t) && (posture === "PROHIBITION" || /\bmay not\b|\bno (loan party|borrower)\b/i.test(t))) return "FLUSH_OVERRIDE";
  if (XREF_ONLY_RE.test(t)) return "CROSS_REFERENCE_ONLY";
  if (FINANCIAL_TEST_RE.test(t) || declared === "FINANCIAL_TEST") return "FINANCIAL_MAINTENANCE_TEST";

  const defersToExceptionList = CHAPEAU_DEFERRAL_RE.test(t);
  const universalObject = UNIVERSAL_OBJECT_RE.test(t);
  if (posture === "PROHIBITION" && defersToExceptionList && universalObject) return "GENERAL_PROHIBITION_CHAPEAU";
  if (declared === "GENERAL_PROHIBITION" && posture === "PROHIBITION" && (defersToExceptionList || universalObject)) return "GENERAL_PROHIBITION_CHAPEAU";

  if (PROVISO_RE.test(t) || declared === "PROVISO") return "PROVISO_QUALIFIER";
  if (declared === "BASKET" || declared === "EXCEPTION" || declared === "PERMISSION" || declared === "RATIO_BASED_PERMISSION" || declared === "REFINANCING_PERMISSION" || declared === "SHARED_CAP" || declared === "BUILDER" || declared === "LIABILITY_CAP") {
    return "ENUMERATED_EXCEPTION";
  }
  if (posture === "PERMISSION") return "ENUMERATED_EXCEPTION";
  // A prohibition that does NOT reach a universal object is not thereby an
  // enumerated carve-out — it may simply be a specific prohibition. Saying
  // UNDETERMINED here is the honest answer; guessing NARROW would manufacture
  // a breadth conflict (or, worse, a breadth agreement) out of nothing.
  if (posture === "PROHIBITION") return universalObject ? "GENERAL_PROHIBITION_CHAPEAU" : "UNDETERMINED_ROLE";
  if (posture === "DEFINITION") return "DEFINITION_OR_CALCULATION";
  if (posture === "EVENT_OF_DEFAULT") return "EVENT_OF_DEFAULT_CLAUSE";
  if (posture === "REPRESENTATION") return "REPRESENTATION_CLAUSE";
  if (posture === "OBLIGATION" || declared === "COVENANT") return "AFFIRMATIVE_OBLIGATION";
  if (posture === "CONDITION" || declared === "CONDITION") return "CONDITION_PRECEDENT";
  return "UNDETERMINED_ROLE";
}

// ---------------------------------------------------------------------------
// Provision BREADTH
//
// The single most load-bearing signal in this evaluator. A universal
// restriction ("no Loan Party will ... any Indebtedness, except: ...") and one
// narrow enumerated carve-out under it ("(b) Indebtedness of any Borrower
// owing to any Restricted Subsidiary ...") are DIFFERENT LEGAL CLAIMS, even
// though they share a section number, a covenant family, a governed action and
// most of their vocabulary. Every historically-confirmed false credit in this
// repository's own forensic record is exactly this substitution.
//
// Breadth is read from drafting shape only — a universal object under a
// prohibitive construction versus an enumerated item — never from a section
// number, a parent/child relation, or a neighbouring unit's materiality.
// ---------------------------------------------------------------------------

export type ProvisionBreadth = "UNIVERSAL_RESTRICTION" | "NARROW_CARVEOUT" | "SPECIFIC_OBLIGATION" | "DEFINITIONAL" | "INDETERMINATE_BREADTH";

/** Text that opens with its own enumerator is, on its face, one item in a list. Handles nested openers such as "(b)(i) ...". */
const LEADING_ENUMERATOR_RE = /^\s*\(([a-z]{1,2}|[ivxlc]{1,5}|[0-9]{1,2})\)(\s|\()/i;

const NARROW_PERMISSION_RE = /\b(permits?|permitting|permitted|allows?|excepts?|carve[- ]?out|basket)\b/i;

export function extractProvisionBreadth(input: ProvisionRoleInput & { role?: ProvisionRole }): ProvisionBreadth {
  const t = normalizeText(input.text);
  const role = input.role ?? extractProvisionRole(input);
  const posture = input.posture ?? extractPosture(t, input.declaredType ?? null);

  if (role === "DEFINITION_OR_CALCULATION") return "DEFINITIONAL";
  if (role === "GENERAL_PROHIBITION_CHAPEAU" || role === "FLUSH_OVERRIDE") return "UNIVERSAL_RESTRICTION";
  if (role === "ENUMERATED_EXCEPTION" || role === "PROVISO_QUALIFIER") return "NARROW_CARVEOUT";
  if (role === "FINANCIAL_MAINTENANCE_TEST" || role === "AFFIRMATIVE_OBLIGATION" || role === "CONDITION_PRECEDENT" || role === "EVENT_OF_DEFAULT_CLAUSE" || role === "REPRESENTATION_CLAUSE") {
    return "SPECIFIC_OBLIGATION";
  }

  const leadsWithEnumerator = LEADING_ENUMERATOR_RE.test(t);
  const universalObject = UNIVERSAL_OBJECT_RE.test(t);
  const prohibitive = posture === "PROHIBITION";

  if (prohibitive && universalObject && !leadsWithEnumerator) return "UNIVERSAL_RESTRICTION";
  if (leadsWithEnumerator && !(prohibitive && universalObject)) return "NARROW_CARVEOUT";
  if (NARROW_PERMISSION_RE.test(t) && !prohibitive) return "NARROW_CARVEOUT";
  return "INDETERMINATE_BREADTH";
}

// ---------------------------------------------------------------------------
// Entity scope
// ---------------------------------------------------------------------------

const SCOPE_PATTERNS: ReadonlyArray<[RegExp, EntityScopeTag]> = [
  [/\bu\.?s\.?\s+(loan part|loan guarantor|borrower|subsidiar|obligor|guarantor|domestic)/i, "US_ENTITY_ONLY"],
  [/\b(united states)\s+(loan part|borrower|subsidiar|guarantor)/i, "US_ENTITY_ONLY"],
  [/\bcanadian\s+(loan part|loan guarantor|borrower|subsidiar|obligor|guarantor|dollar|prime)/i, "CANADIAN_ENTITY"],
  [/\bcanada\b/i, "CANADIAN_ENTITY"],
  [/\bunrestricted subsidiar/i, "UNRESTRICTED_SUBSIDIARY"],
  [/\brestricted subsidiar/i, "RESTRICTED_SUBSIDIARY"],
  [/\b(that is|are) not (a )?loan part/i, "NON_LOAN_PARTY_SUBSIDIARY"],
  [/\bnon-loan part/i, "NON_LOAN_PARTY_SUBSIDIARY"],
  [/\bforeign subsidiar/i, "FOREIGN_SUBSIDIARY"],
  [/\bloan part(y|ies)\b/i, "LOAN_PARTY"],
  [/\bborrower(s)?\b/i, "BORROWER"],
  [/\bthe company\b|\bparent\b/i, "COMPANY_PARENT"],
  [/\b(administrative agent|lender(s)?|issuing bank|swingline lender)\b/i, "LENDER_OR_AGENT"],
  [/\bsubsidiar(y|ies)\b/i, "ANY_SUBSIDIARY"],
];

/**
 * Negated entity phrases ("Restricted Subsidiaries that are not Loan Parties",
 * "other than a Loan Party") name an entity class in order to EXCLUDE it. The
 * excluded class must not also be recorded as an included scope, or a basket
 * available only to non-Loan-Parties would look like a basket available to Loan
 * Parties — an entity-scope error that materially overstates capacity.
 */
const NEGATED_ENTITY_RE = /\b(?:that (?:is|are) )?(?:not|other than)\s+(?:a |an |any )?((?:u\.?s\.?|canadian|foreign|domestic)\s+)?(loan part(?:y|ies)|borrowers?|restricted subsidiar(?:y|ies)|subsidiar(?:y|ies)|guarantors?)\b/gi;

export function extractScope(text: string): EntityScopeTag[] {
  const t = normalizeText(text);
  const out = new Set<EntityScopeTag>();
  const negated: string[] = [];
  const positiveText = t.replace(NEGATED_ENTITY_RE, (match) => {
    negated.push(match);
    return " ";
  });
  for (const negation of negated) {
    if (/loan part/i.test(negation)) out.add("NON_LOAN_PARTY_SUBSIDIARY");
  }
  for (const [re, tag] of SCOPE_PATTERNS) if (re.test(positiveText)) out.add(tag);
  return [...out];
}

// ---------------------------------------------------------------------------
// Instrument
// ---------------------------------------------------------------------------

const INSTRUMENT_PATTERNS: ReadonlyArray<[RegExp, InstrumentTag]> = [
  [/\bfirst[- ]lien\b/i, "FIRST_LIEN"],
  [/\bsecond[- ]lien\b/i, "SECOND_LIEN"],
  [/\bsubordinated\b/i, "SUBORDINATED"],
  [/\bjunior\b/i, "JUNIOR"],
  [/\bunsecured\b/i, "UNSECURED"],
  [/\bsecured\b/i, "SECURED"],
  [/\bsenior\b/i, "SENIOR"],
  [/\brevolving\b/i, "REVOLVING"],
  [/\bterm loan|term facility|term commitment\b/i, "TERM_LOAN"],
  [/\bletter(s)? of credit\b|\blc\b/i, "LETTER_OF_CREDIT"],
  [/\bswingline\b/i, "SWINGLINE"],
  [/\bcapital lease|finance lease\b/i, "CAPITAL_LEASE"],
  [/\bequity interests|capital stock\b/i, "EQUITY"],
];

export function extractInstruments(text: string): InstrumentTag[] {
  const t = normalizeText(text);
  const out = new Set<InstrumentTag>();
  for (const [re, tag] of INSTRUMENT_PATTERNS) if (re.test(t)) out.add(tag);
  // "unsecured" and "secured" are mutually informative: "unsecured" must not
  // also register SECURED via the substring, so drop SECURED when the only
  // evidence was the word "unsecured".
  if (out.has("UNSECURED") && !/\bsecured\b/i.test(normalizeText(text).replace(/\bunsecured\b/gi, ""))) out.delete("SECURED");
  return [...out];
}

// ---------------------------------------------------------------------------
// Conditions / exceptions
// ---------------------------------------------------------------------------

const CONDITION_PATTERNS: ReadonlyArray<[RegExp, ConditionTag]> = [
  [/\bno (event of )?default (shall|has|exists|would|then)\b|\babsence of (a )?default\b|\bno default or event of default\b/i, "NO_DEFAULT"],
  [/\bpayment conditions?\b/i, "PAYMENT_CONDITIONS"],
  [/\bpro forma (basis|compliance|effect)\b/i, "PRO_FORMA_COMPLIANCE"],
  [/\b(leverage|coverage|fixed charge)\s+ratio\b[^.]{0,80}\b(not (to )?exceed|at least|greater than|less than)\b/i, "RATIO_SATISFIED"],
  [/\bratio[- ]gated\b|\bsubject to .{0,30}ratio (test|condition)\b/i, "RATIO_SATISFIED"],
  [/\b(prior|prompt)\s+(written\s+)?notice\b|\bnotice to the administrative agent\b/i, "NOTICE_REQUIRED"],
  [/\b(consent|approval) of (the )?(required lenders|administrative agent)\b/i, "CONSENT_REQUIRED"],
  [/\bcompliance certificate\b|\bofficer'?s certificate\b/i, "CERTIFICATE_DELIVERY"],
  [/\bsolven(t|cy)\b/i, "SOLVENCY"],
  [/\bordinary course of business\b/i, "ORDINARY_COURSE_REQUIRED"],
  [/\bfair market value\b|\bfor fair value\b/i, "FAIR_MARKET_VALUE"],
  [/\b(at least\s+)?[0-9]{1,3}\s?%\s+(of (the )?consideration\s+)?in cash\b|\bcash consideration\b/i, "CASH_CONSIDERATION_MINIMUM"],
  [/\bsubordinat(ed|ion) (to|on terms)\b/i, "SUBORDINATION_REQUIRED"],
  [/\b(excess )?availability\b[^.]{0,60}\b(at least|not less than|exceeds)\b/i, "AVAILABILITY_TEST"],
];

export function extractConditions(text: string): ConditionTag[] {
  const t = normalizeText(text);
  const out = new Set<ConditionTag>();
  for (const [re, tag] of CONDITION_PATTERNS) if (re.test(t)) out.add(tag);
  return [...out];
}

const EXCEPTION_PATTERNS: ReadonlyArray<[RegExp, ExceptionTag]> = [
  [/\bordinary course of business\b/i, "ORDINARY_COURSE"],
  [/\bexcept as (otherwise )?permitted\b|\botherwise permitted (by|under)\b/i, "EXCEPT_AS_PERMITTED_ELSEWHERE"],
  [/\bnotwithstanding\b/i, "NOTWITHSTANDING_OVERRIDE"],
  [/\bexisting on the (closing|effective) date\b|\boutstanding on the (closing|effective) date\b|\bset forth on schedule\b/i, "GRANDFATHERED_EXISTING"],
  [/\bde minimis\b/i, "DE_MINIMIS"],
  [/\bpermitted acquisition\b/i, "PERMITTED_ACQUISITION_CARVEOUT"],
  [/\bintercompany\b/i, "INTERCOMPANY_CARVEOUT"],
];

export function extractExceptions(text: string): ExceptionTag[] {
  const t = normalizeText(text);
  const out = new Set<ExceptionTag>();
  for (const [re, tag] of EXCEPTION_PATTERNS) if (re.test(t)) out.add(tag);
  return [...out];
}

// ---------------------------------------------------------------------------
// Comparison direction / cap structure / misc drafting semantics
// ---------------------------------------------------------------------------

export function extractComparisonDirections(text: string): ComparisonDirection[] {
  const t = normalizeText(text);
  const out = new Set<ComparisonDirection>();
  if (/\b(not (to )?exceed|no greater than|no more than|less than or equal|maximum|shall not be greater)\b/i.test(t)) out.add("NOT_EXCEED");
  if (/\b(at least|not (?:be )?less than|minimum|no less than|greater than or equal|shall (?:not )?(?:be )?maintain(?:ed)? at)\b/i.test(t)) out.add("AT_LEAST");
  if (/\b(exceed(s|ing)?|greater than|in excess of)\b/i.test(t) && !/\bnot (to )?exceed\b/i.test(t)) out.add("EXCEED");
  if (/\bequal to\b/i.test(t)) out.add("EQUAL");
  return out.size > 0 ? [...out] : ["UNDETERMINED"];
}

export function extractCapStructure(text: string): SemanticSignals["capStructure"] {
  const t = normalizeText(text);
  if (/\bgreater of\b|\bhigher of\b/i.test(t)) return "GREATER_OF";
  if (/\blesser of\b|\blower of\b|\bsmaller of\b/i.test(t)) return "LESSER_OF";
  if (extractAmounts(t).length > 0 || extractPercentages(t).length > 0) return "SINGLE";
  return "NONE";
}

export function extractCrossReferences(text: string): string[] {
  const t = normalizeText(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/\bSections?\s+([0-9]+\.[0-9]+(?:\([a-z0-9ivx]+\))*)/gi)) out.add((m[1] ?? "").toLowerCase());
  for (const m of t.matchAll(/\bArticles?\s+([IVXLC]+)\b/g)) out.add((m[1] ?? "").toUpperCase());
  return [...out];
}

/** Defined terms as drafted: quoted terms and Title-Case multiword noun phrases. */
export function extractDefinedTerms(text: string): string[] {
  const t = normalizeText(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/"\s*([A-Z][A-Za-z0-9 '\-/&]{2,60}?)\s*"/g)) out.add(normalizeDefinedTerm(m[1] ?? ""));
  for (const m of t.matchAll(/\b([A-Z][a-z]+(?:\s+(?:of|and|the|to)\s+)?(?:\s[A-Z][a-z]+){1,4})\b/g)) {
    const term = normalizeDefinedTerm(m[1] ?? "");
    if (term.split(" ").length >= 2) out.add(term);
  }
  out.delete("");
  return [...out];
}

export function normalizeDefinedTerm(term: string): string {
  return normalizeText(term).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set(
  ("a an the and or of to in on for with by that this those these is are be been being as at from any all such other otherwise shall will may must not no nor if then than " +
    "which who whom whose it its their there here into under over upon within without pursuant respect connection accordance including include includes included provided however " +
    "each every same more most less least also only but so up out off per via when where while whether what how much many one two three both either neither section article clause")
    .split(/\s+/),
);

/** Substantive content lemmas — supporting evidence for the object/resource dimension only. */
export function extractContentTerms(text: string): string[] {
  const t = lower(text).replace(/[^a-z0-9 ]/g, " ");
  const out = new Set<string>();
  for (const word of t.split(/\s+/)) {
    if (word.length < 4) continue;
    if (STOPWORDS.has(word)) continue;
    out.add(stem(word));
  }
  return [...out];
}

/** Deliberately minimal suffix stripping — enough to align "disposition"/"dispositions", never enough to conflate distinct legal terms. */
function stem(word: string): string {
  return word
    .replace(/(ies)$/, "y")
    .replace(/(sses|shes|ches|xes)$/, "s")
    .replace(/([^s])s$/, "$1")
    .replace(/(ing|ed)$/, "");
}

// ---------------------------------------------------------------------------
// Full extraction
// ---------------------------------------------------------------------------

export interface SignalExtractionInput {
  text: string;
  declaredType?: string | null;
  /** Additional structured hints from the candidate's own fields (family, role, entity scope, ...). */
  structuredHints?: string[];
}

export function extractSignals(input: SignalExtractionInput): SemanticSignals {
  const text = normalizeText(input.text);
  const hintText = normalizeText([text, ...(input.structuredHints ?? [])].join(" \n "));
  const posture = extractPosture(text, input.declaredType ?? null);
  const provisionRole = extractProvisionRole({ text, declaredType: input.declaredType ?? null, posture });
  return {
    amounts: extractAmounts(text),
    percentages: extractPercentages(text),
    ratios: extractRatios(text),
    capStructure: extractCapStructure(text),
    comparisonDirections: extractComparisonDirections(text),
    metrics: extractMetrics(hintText),
    definedTerms: extractDefinedTerms(text),
    actions: extractActions(hintText),
    posture,
    provisionRole,
    provisionBreadth: extractProvisionBreadth({ text, declaredType: input.declaredType ?? null, posture, role: provisionRole }),
    scope: extractScope(hintText),
    instruments: extractInstruments(hintText),
    timePeriods: extractTimePeriods(text),
    conditions: extractConditions(hintText),
    exceptions: extractExceptions(hintText),
    crossReferences: extractCrossReferences(text),
    capSharing: /\bshared with\b|\btogether with (any )?amounts\b|\bin reliance on\b|\bshared (basket|cap|capacity)\b|\baggregate(d)? with\b/i.test(hintText),
    builderGrower: /\bavailable amount\b|\bbuilder basket\b|\bcumulative (credit|amount)\b|\bgrower\b|\bgreater of .{0,40}% of\b/i.test(hintText),
    reclassification: /\breclassif\w*\b|\bdivide and classify\b|\bredesignat\w*\b/i.test(hintText),
    stepChange: /\bstep[- ]?up\b|\bshall increase to\b/i.test(hintText) ? "STEP_UP" : /\bstep[- ]?down\b|\bshall (decrease|step down) to\b/i.test(hintText) ? "STEP_DOWN" : null,
    paymentConditionsLanguage: /\bpayment conditions?\b/i.test(hintText),
    contentTerms: extractContentTerms(text),
  };
}

// ---------------------------------------------------------------------------
// Signal comparison helpers (support / conflict / missing)
// ---------------------------------------------------------------------------

export type SignalComparison = "SUPPORT" | "CONFLICT" | "MISSING_ON_CANDIDATE" | "NOT_ASSERTED_BY_GROUND_TRUTH";

export function compareTagSets<T>(groundTruth: readonly T[], candidate: readonly T[]): SignalComparison {
  if (groundTruth.length === 0) return "NOT_ASSERTED_BY_GROUND_TRUTH";
  if (candidate.length === 0) return "MISSING_ON_CANDIDATE";
  const candidateSet = new Set(candidate);
  return groundTruth.some((g) => candidateSet.has(g)) ? "SUPPORT" : "CONFLICT";
}

export function jaccard<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Overlap coefficient: |A intersect B| / min(|A|,|B|). Used for the
 * object/resource dimension because the two sides are routinely of very
 * different lengths — a two-line candidate excerpt against a paragraph-long
 * adjudicated description. Normalizing by the SMALLER set asks "is the shorter
 * statement contained in the longer one?", which is the right question, where
 * plain containment would penalize a correct candidate merely for being terse.
 */
export function overlapCoefficient<T>(a: readonly T[], b: readonly T[]): number {
  return overlapDetail(a, b).coefficient;
}

/**
 * The coefficient alone is inflated by very short candidates: a five-word
 * fragment sharing two words scores 0.40 on almost anything. The absolute count
 * of shared substantive terms is therefore reported alongside it, and the
 * object/resource dimension requires BOTH a high coefficient and a real number
 * of shared terms before it will say a candidate is about the same thing.
 */
export function overlapDetail<T>(a: readonly T[], b: readonly T[]): { coefficient: number; sharedCount: number; smallerSize: number } {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return { coefficient: 0, sharedCount: 0, smallerSize: 0 };
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  return { coefficient: inter / Math.min(setA.size, setB.size), sharedCount: inter, smallerSize: Math.min(setA.size, setB.size) };
}

/** Fraction of the ground truth's own content terms the candidate also carries. */
export function containment<T>(groundTruth: readonly T[], candidate: readonly T[]): number {
  if (groundTruth.length === 0) return 0;
  const candidateSet = new Set(candidate);
  let inter = 0;
  for (const g of new Set(groundTruth)) if (candidateSet.has(g)) inter += 1;
  return inter / new Set(groundTruth).size;
}

const NUMERIC_TOLERANCE = 0.005;

export function figuresEquivalent(a: NumericFigure, b: NumericFigure): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "MONEY" && (a.currency ?? "USD") !== (b.currency ?? "USD")) return false;
  // A percentage of EBITDA is NOT a percentage of Total Assets; a 4.00x leverage
  // test is NOT a 4.00x fixed-charge test. When BOTH sides name a basis and the
  // bases differ, the figures are not equivalent regardless of the numbers.
  if (a.basis && b.basis && a.basis !== b.basis) return false;
  const denom = Math.max(Math.abs(a.value), Math.abs(b.value), 1);
  return Math.abs(a.value - b.value) / denom < NUMERIC_TOLERANCE;
}
