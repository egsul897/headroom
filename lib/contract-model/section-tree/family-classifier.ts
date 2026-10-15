/**
 * General covenant-family classifier. Deterministic, no AI, no per-issuer logic.
 *
 * Signals, strongest first:
 *   1. lead-in prohibition: the verb + object of the section's opening prohibition
 *      ("shall not ... create, incur ... any Lien" → LIENS), including "No <party> shall ..." forms;
 *   2. heading keywords (title of the section, or the enclosing article when the section has none);
 *   3. defined terms the lead-in relies on ("Permitted Liens", "Restricted Payment", "Asset Sale", ...).
 * A heading alone is weak: it only classifies when the lead-in is prohibitive or a ratio test, so
 * "Investment Company Act" reps and "Non-Impairment of Liens" mechanics are not covenants.
 */
export const COVENANT_FAMILIES = [
  "DEBT", "LIENS", "RESTRICTED_PAYMENTS", "INVESTMENTS", "ASSET_SALES", "AFFILIATE_TRANSACTIONS",
  "FUNDAMENTAL_CHANGES", "PREPAYMENTS", "FINANCIAL_RATIOS",
] as const;
export type CovenantFamily = (typeof COVENANT_FAMILIES)[number];

export interface FamilyVerdict {
  family: CovenantFamily | null;
  score: number;
  /** Every family scoring >= 3 (a combined "Merger, Consolidation or Sale of Assets" section is both). */
  families: CovenantFamily[];
  evidence: string[];
}

/** Opening prohibition: "shall/will not", "No X shall", "may not", or an article-imperative lead. */
const PROHIBITION = /\b(?:shall|will|may)\s+not\b|\bno\s+[A-Z][\w-]*(?:\s+[\w’'-]+){0,12}?\s+(?:shall|will|may)\b|^\s*(?:\([a-z0-9]+\)\s*)?(?:incur|create|make|declare|sell|enter into|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|directly or indirectly)\b/i;
const IMPERATIVE = /^\s*(?:\([a-z0-9]+\)\s*)?(?:incur|create|make|declare|sell|enter into|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|directly or indirectly)\b/i;
/** The prohibition binds an obligor: not the trustee, agents, lenders or holders, and not a passive "shall not be required/deemed". */
const NON_OBLIGOR = /\b(?:trustees?|agents?|holders?|lenders?|banks?|purchasers?|registrar|noteholders?|collateral agent|arrangers?)\b/i;
function obligorBound(lead: string): boolean {
  const re = /\b(?:shall|will|may)\s+not\b(?!\s+be\s+(?:required|deemed|responsible|liable|obligated|construed))|\b[Nn]o\s+([A-Z][\w-]*(?:\s+[\w’'-]+){0,12}?\s+)(?:shall|will|may)\b(?!\s+be\s+(?:required|deemed|responsible|liable|obligated|construed))/g;
  for (const m of lead.slice(0, 450).matchAll(re)) {
    const subject = m[1] ?? lead.slice(Math.max(0, (m.index ?? 0) - 70), m.index ?? 0).split(/[.;:]/).pop() ?? "";
    if (!NON_OBLIGOR.test(subject)) return true;
  }
  return false;
}
const RATIO_SUBJECT = /\b(?:ratio|liquidity|net worth|financial covenants?)\b/i;
const RATIO_LIMIT = /\b(?:greater|less|more|lower|higher)\s+than\b|\bat\s+least\b|\bmaintain\b|\b(?:not|never)\s+(?:permit|exceed)\b|\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.0+)?\b|\bshall apply\b/i;

const VERB_OBJECT: Array<[CovenantFamily, RegExp]> = [
  ["LIENS", /\b(?:create|incur|assume|suffer|permit)\b[^.;]{0,160}\b(?:liens?|mortgages?|pledges?|security interests?|encumbrances?)\b(?!\s+(?:net|leverage|obligations|notes|credit|facility|term|secured)\b)/i],
  ["DEBT", /\b(?:create|incur|issue|assume|guarantee|become\s+(?:directly\s+or\s+indirectly\s+)?liable)\b[^.;]{0,160}\b(?:indebtedness|debt|disqualified stock|preferred stock)\b/i],
  ["RESTRICTED_PAYMENTS", /\b(?:declare|pay|make)\b[^.;]{0,120}\b(?:dividends?|distributions?|restricted payments?)\b|\b(?:purchase|redeem|retire|acquire)\b[^.;]{0,80}\b(?:equity interests?|capital stock|shares)\b/i],
  ["INVESTMENTS", /\b(?:make|hold|acquire)\b[^.;]{0,80}\b(?:investments?|advances?|loans?\s+to|capital contributions?)\b/i],
  ["PREPAYMENTS", /\b(?:prepay|redeem|repurchase|defease|retire)\b[^.;]{0,160}\b(?:subordinated|junior|second lien|unsecured)\b[^.;]{0,40}\b(?:indebtedness|debt|notes)\b/i],
  ["FUNDAMENTAL_CHANGES", /\btransactions? of merger\b|\b(?:merge|consolidate|amalgamate|liquidate|dissolve|wind\s+up)\b(?!\s+(?:EBITDA|Net|Total))/i],
  ["ASSET_SALES", /\b(?:sell|lease|transfer|convey|dispose|assign)\b[^.;]{0,120}\b(?:assets?|propert(?:y|ies)|equity interests? (?:in|of) any (?:restricted )?subsidiar)/i],
  ["AFFILIATE_TRANSACTIONS", /\btransactions?\b[^.;]{0,220}\b(?:with|involving|to)\b[^.;]{0,60}\baffiliates?\b/i],
];

const HEADING: Array<[CovenantFamily, RegExp]> = [
  ["PREPAYMENTS", /prepayments?.*(?:debt|indebtedness)|(?:junior|subordinated)[^,]*(?:payment|prepay)|payments? of (?:certain )?(?:debt|indebtedness)/i],
  ["LIENS", /\bliens?\b|negative pledge|\bencumbrances?\b/i],
  ["DEBT", /\b(?:indebtedness|debt|borrowings?)\b/i],
  ["RESTRICTED_PAYMENTS", /restricted payments?|dividends?|distributions?/i],
  ["INVESTMENTS", /\binvestments?\b|loans?,? advances|acquisitions/i],
  ["ASSET_SALES", /asset sales?|dispositions?|sale of assets|disposal|sale[- ]leaseback|sales? of (?:property|assets)/i],
  ["AFFILIATE_TRANSACTIONS", /affiliates?/i],
  ["FUNDAMENTAL_CHANGES", /fundamental changes?|mergers?|\bconsolidations?\b|consolidate\b/i],
  ["FINANCIAL_RATIOS", /financial (?:condition )?covenants?|\bratio\b|minimum liquidity|net worth|fixed charge/i],
];

const DEFINED: Array<[CovenantFamily, RegExp]> = [
  ["LIENS", /\bPermitted (?:Liens|Encumbrances)\b/],
  ["DEBT", /\bPermitted (?:Indebtedness|Debt)\b|\bRatio Debt\b/],
  ["RESTRICTED_PAYMENTS", /\bRestricted Payments?\b|\bPermitted Payments?\b/],
  ["INVESTMENTS", /\bPermitted Investments?\b/],
  ["ASSET_SALES", /\bAsset Sales?\b|\bAsset Dispositions?\b|\bPermitted Dispositions?\b/],
  ["AFFILIATE_TRANSACTIONS", /\bAffiliate Transactions?\b/],
];

/**
 * Structural covenant context (no title keywords): a section's lead-in is an obligor-bound prohibition or an
 * article-imperative. A section sits in a covenant run when an adjacent sibling section is one too.
 */
export function isObligorProhibitionLead(leadIn: string): boolean {
  const lead = leadIn.slice(0, 700);
  return IMPERATIVE.test(lead) || (PROHIBITION.test(lead) && obligorBound(lead));
}

export function classifyCovenantFamily(args: { title: string | null; leadIn: string; parentTitle?: string | null; covenantContext?: boolean }): FamilyVerdict {
  const lead = args.leadIn.slice(0, 700);
  const prohibitive = PROHIBITION.test(lead);
  const ratio = RATIO_SUBJECT.test(lead.slice(0, 450)) && RATIO_LIMIT.test(lead);
  const scores = new Map<CovenantFamily, number>();
  const evidence: string[] = [];
  const add = (f: CovenantFamily, w: number, why: string) => { scores.set(f, (scores.get(f) ?? 0) + w); evidence.push(`${f}:${why}`); };

  if (prohibitive) {
    // Only the first prohibition sentence counts as the lead-in object.
    // Article-imperative leads ("Enter into any transaction ...") start at 0; otherwise at the first prohibition.
    const m = IMPERATIVE.test(lead) ? { index: 0 } : /(?:shall|will|may)\s+not\b|\bno\s+[A-Z][\w-]*(?:\s+[\w’'-]+){0,12}?\s+(?:shall|will|may)\b/i.exec(lead);
    // The object may follow a colon and a first enumerated clause ("shall not: (i) declare or pay any dividend").
    const from = lead.slice(m?.index ?? 0);
    const sentence = from.slice(0, Math.min(450, (from.search(/\.\s/) + 1) || 450));
    if (IMPERATIVE.test(lead) || obligorBound(lead)) {
      const hit = VERB_OBJECT.filter(([, re]) => re.test(sentence)).map(([f]) => f);
      // "Lien securing Indebtedness" / "prepay Junior Indebtedness" name debt as the object's qualifier, not a debt covenant.
      // A titled section whose heading names no covenant family ("Use of Proceeds", "Post-Closing") needs more
      // than its lead-in: the lead-in object alone scores 2 there.
      const titledOffFamily = !!args.title && !HEADING.some(([, re]) => re.test(args.title!));
      for (const f of hit) if (!(f === "DEBT" && (hit.includes("LIENS") || hit.includes("PREPAYMENTS")))) add(f, titledOffFamily ? 2 : 3, "lead-in");
    }
  }
  const titledOffFamilyAll = !!args.title && !HEADING.some(([, re]) => re.test(args.title!));
  if (ratio) add("FINANCIAL_RATIOS", titledOffFamilyAll ? 2 : 3, "ratio-test");
  const heading = args.title || args.parentTitle || "";
  if (prohibitive || ratio) {
    // Every heading family counts (combined sections: "Restricted Payments; Certain Payments of Indebtedness").
    // Own heading + an obligor-bound prohibition is enough on its own (3); a parent heading is weaker (2).
    const own = !!args.title;
    const obligor = IMPERATIVE.test(lead) || obligorBound(lead);
    const seen = new Set<CovenantFamily>();
    for (const [f, re] of HEADING) {
      if (!re.test(heading) || seen.has(f)) continue;
      if (f === "DEBT" && /\b(?:junior|subordinated|senior)\s+(?:indebtedness|debt)\b/i.test(heading) && !/incurrence|limitation on (?:indebtedness|debt)/i.test(heading)) continue;
      if (f === "DEBT" && seen.has("PREPAYMENTS") && !/\b(?:incurrence|limitation on (?:indebtedness|debt))\b/i.test(heading)) continue;
      seen.add(f);
      // Own heading + obligor-bound prohibition inside a covenant run (or an imperative lead) is self-sufficient.
      // Context is structural (adjacent obligor-prohibition sibling, supplied by the caller), never a title keyword.
      const covenantContext = IMPERATIVE.test(lead) || args.covenantContext === true;
      add(f, own && obligor && covenantContext ? 3 : 2, own ? "heading" : "parent-heading");
    }
    for (const [f, re] of DEFINED) if (re.test(lead)) add(f, 1, "defined-term");
  }
  let best: CovenantFamily | null = null, score = 0;
  for (const [f, s] of scores) if (s > score) { best = f; score = s; }
  // Need at least a heading+lead-in agreement or a strong lead-in alone.
  if (score < 3) best = null;
  // Secondary families need their own heading support ("Merger, Consolidation, or Sale of Assets").
  const families = best ? [best, ...[...scores].filter(([f, s]) => f !== best && s >= 3 && evidence.includes(`${f}:heading`)).map(([f]) => f)] : [];
  return { family: best, score, families, evidence };
}
