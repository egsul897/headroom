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
const PROHIBITION_CI = /\b(?:shall|will|may)\s+not\b|^\s*(?:\([a-z0-9]+\)\s*)?(?:incur|create|make|declare|sell|enter into|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|cause or make|directly or indirectly)\b/i;
const IMPERATIVE = /^\s*(?:\([a-z0-9]+\)\s*)?(?:incur|create|make|declare|sell|enter into|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|cause or make|directly or indirectly)\b/i;
/** Case-sensitive "No <Party> [nor any <Party>] shall": the head must be a capitalized party noun, not a condition. */
const NOT_PARTY_HEAD = /^(?:Default|Event|Events|Lien|Liens|Material|Change|Notice|Amendment|Provision|Payment|Proceeds|Responsible|Termination|Waiver|Consent|Action|Claim|Person|Prepayment|Borrowing|Loan(?! Part)|Advance|Letter|Interest|Fee|Commitment|Holder|Holders|Lender|Lenders|Trustee|Agent|Bank|Purchaser|Noteholder)\b/;
const NO_PARTY_RE = /\b[Nn]o\s+([A-Z][\w-]*)((?:\s+[\w’'-]+){0,12}?)\s+(shall|will|may)\b/g;
/** Parentheticals removed (with their length kept), so carve-outs neither count as head tokens nor shift offsets. */
function stripParens(s: string): string { return s.replace(/\([^()]{0,200}\)/g, (m) => " ".repeat(m.length)).replace(/ {2,}/g, (m) => " ".repeat(m.length)); }
function noPartyMatches(lead: string): RegExpMatchArray[] {
  return [...stripParens(lead).replace(/\s{2,}/g, (m) => " ".repeat(m.length)).matchAll(NO_PARTY_RE)].filter((m) => !NOT_PARTY_HEAD.test(m[1]! + m[2]!));
}
const PROHIBITION = { test: (lead: string) => PROHIBITION_CI.test(lead) || noPartyMatches(lead).length > 0 };

/** The prohibition binds an obligor: not the trustee, agents, lenders or holders, and not a passive "shall not be required/deemed". */
const NON_OBLIGOR = /\b(?:trustees?|agents?|holders?|lenders?|banks?|purchasers?|registrar|noteholders?|collateral agent|arrangers?)\b/i;
function obligorBound(lead: string): boolean {
  const PASSIVE = /^\s+be\s+(?:required|deemed|responsible|liable|obligated|construed)/;
  const head = lead.slice(0, 450);
  for (const m of head.matchAll(/\b(?:shall|will|may)\s+not\b/gi)) {
    if (PASSIVE.test(head.slice(m.index! + m[0].length))) continue;
    const subject = head.slice(Math.max(0, m.index! - 70), m.index!).split(/[.;:]/).pop() ?? "";
    if (!NON_OBLIGOR.test(subject)) return true;
  }
  for (const m of noPartyMatches(head)) {
    if (PASSIVE.test(head.slice(m.index! + m[0].length))) continue;
    if (!NON_OBLIGOR.test(m[1]! + m[2]!)) return true;
  }
  return false;
}
const RATIO_SUBJECT = /\b(?:ratio|liquidity|net worth|financial covenants?)\b/i;
const RATIO_LIMIT = /\b(?:greater|less|more|lower|higher)\s+than\b|\bto\s+(?:exceed|be\s+(?:less|lower|greater|more|higher)\b)|\bat\s+least\b|\bmaintain\b|\b(?:not|never)\s+(?:permit|exceed)\b|\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.0+)?\b|\bshall apply\b/i;

const VERB_OBJECT: Array<[CovenantFamily, RegExp]> = [
  ["LIENS", /\b(?:create|incur|assume|suffer|permit)\b[^.;]{0,160}\b(?:liens?|mortgages?|pledges?|security interests?|encumbrances?)\b(?!\s+(?:net|leverage|obligations|notes|credit|facility|term|secured)\b)/i],
  ["DEBT", /\b(?:create|incur|issue|assume|guarantee|become\s+(?:directly\s+or\s+indirectly\s+)?liable)\b[^.;]{0,160}\b(?:indebtedness|debt|disqualified stock|preferred stock)\b/i],
  ["RESTRICTED_PAYMENTS", /\b(?:declare|pay|make)\b[^.;]{0,120}\b(?:dividends?|distributions?|restricted (?:junior )?payments?)\b|\b(?:purchase|redeem|retire|acquire)\b[^.;]{0,80}\b(?:equity interests?|capital stock|shares)\b/i],
  ["INVESTMENTS", /\b(?:make|hold|acquire)\b[^.;]{0,80}\b(?:investments?|advances?|loans?\s+to|capital contributions?)\b/i],
  ["PREPAYMENTS", /\b(?:prepay|redeem|repurchase|defease|retire)\b[^.;]{0,160}\b(?:subordinated|junior|second lien|unsecured)\b[^.;]{0,40}\b(?:indebtedness|debt|notes)\b/i],
  ["FUNDAMENTAL_CHANGES", /\btransactions? of merger\b|\b(?:merge|consolidate|amalgamate|liquidate|dissolve|wind\s+up)\b(?!\s+(?:EBITDA|Net|Total))/i],
  ["ASSET_SALES", /\b(?:sell|lease|transfer|convey|dispose|assign)\b[^.;]{0,300}?\b(?:assets?|propert(?:y|ies)|equity interests? (?:in|of) any (?:restricted )?subsidiar)|\b(?:make|consummate|effect)\b[^.;]{0,40}\b(?:Asset Sales?|Asset Dispositions?)\b/i],
  ["AFFILIATE_TRANSACTIONS", /\btransactions?\b[^.;]{0,220}\b(?:with|involving|to)\b[^.;]{0,60}\baffiliates?\b/i],
];

const HEADING: Array<[CovenantFamily, RegExp]> = [
  ["PREPAYMENTS", /prepayments?.*(?:debt|indebtedness)|(?:junior|subordinated)[^,]*(?:payment|prepay)|payments? of (?:certain )?(?:debt|indebtedness)/i],
  ["LIENS", /\bliens?\b|negative pledge|\bencumbrances?\b/i],
  ["DEBT", /\b(?:indebtedness|debt|borrowings?)\b/i],
  ["RESTRICTED_PAYMENTS", /restricted (?:junior )?payments?|dividends?|distributions?/i],
  ["INVESTMENTS", /\binvestments?\b|loans?,? advances|acquisitions/i],
  ["ASSET_SALES", /asset sales?|asset transfers?|transfers? of assets|dispositions?|sale of assets|disposal|sale[- ]leaseback|sales? of (?:property|assets)/i],
  ["AFFILIATE_TRANSACTIONS", /affiliates?/i],
  ["FUNDAMENTAL_CHANGES", /fundamental changes?|mergers?|\bconsolidations?\b|consolidate\b/i],
  ["FINANCIAL_RATIOS", /financial (?:condition )?covenants?|\bratios?\b|minimum liquidity|net worth|fixed charge/i],
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
  const lead = operativeWindow(leadIn).slice(0, 700);
  return IMPERATIVE.test(lead) || (PROHIBITION.test(lead) && obligorBound(lead));
}

/**
 * Reading window: 700 chars from the operative sentence. A survival preamble ("From and after the Effective Date,
 * X hereby agrees, that, so long as any Loan remains outstanding ..., that X will not ...") can run past 700 chars;
 * when the lead-in opens with one, read from the clause after its closing "that" (searched within 2000 chars).
 */
export function operativeWindow(leadIn: string): string {
  const head = leadIn.slice(0, 2000);
  if (/^\s*(?:\([a-z0-9]+\)\s*)?(?:from and after|so long as|until|at all times)\b/i.test(head) || /^\s*[^.;]{0,200}\bhereby (?:covenants?|agrees?)\b/i.test(head)) {
    const op = /\b(?:shall|will)\s+(?:not\s+)?(?:permit|maintain|cause|suffer|create|incur|make|declare|pay|enter|merge|sell|furnish|deliver)\b/i.exec(head.slice(100));
    if (op) {
      const at = op.index + 100;
      const thats = [...head.slice(0, at).matchAll(/,?\s*that[,:]?\s+/gi)];
      const cut = thats.length ? thats[thats.length - 1]!.index! + thats[thats.length - 1]![0].length : 0;
      if (cut > 0) return head.slice(cut);
    }
  }
  return leadIn;
}

/** A temporal lead ("From the Amendment No. 1 Effective Date and prior to September 30, 2022, declare or pay ...") before an article imperative. */
const TEMPORAL_LEAD = /^[\s.:]*(?:\([a-z0-9]+\)\s*)?(?:from|after|prior to|until|at any time|during)\b[^;:]{0,200}?,\s*(?=(?:incur|create|make|declare|sell|enter into|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|directly or indirectly)\b)/i;
/**
 * Conditional permission: "The Issuer may consolidate with or merge ... and may permit ..., provided that / only if ..."
 * (indenture merger covenants). Restrictive in substance: the act is allowed only on the stated conditions.
 */
const CONDITIONAL_PERMISSION = /^\s*(?:\([a-z0-9]+\)\s*)?(?:the\s+)?(?:issuer|company|borrower|parent|guarantor|obligor)s?\s+(?:shall\s+not\s+|may\s+(?:not\s+)?)?(?:consolidate|merge|amalgamate|convey|transfer|sell|lease)\b[^]{0,1800}?\b(?:only if|provided,? that|if|unless|so long as)\b/i;

/**
 * A run-in sub-caption before an article imperative ("Consolidated Leverage Ratio. Permit the Consolidated Leverage
 * Ratio ... to exceed ...", "Minimum Liquidity. Maintain Liquidity of at least ..."): short Title-Case words ending in a
 * period, then a capitalized operative verb. The caption is heading text; the operative lead starts at the verb.
 */
const SUBCAPTION = /^\s*(?:\([a-z0-9]+\)\s*)?((?:[A-Z][\w’'&/-]*|of|on|and|or|to|the|in)(?:\s+(?:[A-Z][\w’'&/-]*|of|on|and|or|to|the|in)){0,7})\s*\.\s+(?=(?:Permit|Maintain|Incur|Create|Make|Declare|Sell|Enter|Merge|Pay|Prepay|Purchase|Transfer|Consolidate|Dispose|Cause|Directly)\b)/;

export function classifyCovenantFamily(args: { title: string | null; leadIn: string; parentTitle?: string | null; covenantContext?: boolean }): FamilyVerdict {
  const sub = SUBCAPTION.exec(args.leadIn);
  if (sub) args = { ...args, leadIn: args.leadIn.slice(sub[0].length), title: [args.title, sub[1]].filter(Boolean).join("; ") || null };
  const raw = operativeWindow(args.leadIn).replace(TEMPORAL_LEAD, "");
  const lead = (CONDITIONAL_PERMISSION.test(raw) && !/\b(?:shall|will|may)\s+not\b/i.test(raw.slice(0, 120)) ? raw.replace(/\bmay\s+(?=consolidate|merge|amalgamate|convey|transfer|sell|lease)/i, "shall not, except as provided below, ") : raw).slice(0, 700);
  const prohibitive = PROHIBITION.test(lead);
  // The ratio subject is read from the operative test verb, past any "so long as any Loan remains outstanding ...,
  // that" survival preamble.
  const testAt = Math.max(0, lead.search(/\b(?:shall|will)\s+(?:not\s+)?(?:permit|maintain|cause|suffer)\b/i));
  const ratio = (RATIO_SUBJECT.test(lead.slice(0, 450)) || RATIO_SUBJECT.test(lead.slice(testAt, testAt + 250))) && RATIO_LIMIT.test(lead);
  const scores = new Map<CovenantFamily, number>();
  const evidence: string[] = [];
  const add = (f: CovenantFamily, w: number, why: string) => { scores.set(f, (scores.get(f) ?? 0) + w); evidence.push(`${f}:${why}`); };

  if (prohibitive) {
    // Only the first prohibition sentence counts as the lead-in object.
    // Article-imperative leads ("Enter into any transaction ...") start at 0; otherwise at the first prohibition.
    const ci = /(?:shall|will|may)\s+not\b/i.exec(lead), np = noPartyMatches(lead)[0];
    const m = IMPERATIVE.test(lead) ? { index: 0 } : [ci, np].filter(Boolean).sort((a, b) => a!.index! - b!.index!)[0] ?? null;
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
  // A leading clause caption ("(a) Mergers, Consolidations, Disposal of Assets, Etc. The Borrower will not ...") is
  // heading text of the section too.
  const caption = /^\s*\([a-z]\)\s+([A-Z][^.\n]{3,90}?)\s*\.\s/.exec(args.leadIn)?.[1] ?? "";
  const heading = [args.title || args.parentTitle || "", caption].filter(Boolean).join("; ");
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

/**
 * Families named by one enumerated covenant item under a negative stem ("shall not ... take any of the following
 * actions: (ii) cause or permit the Company to incur ... any Indebtedness") or negated inside the item ("(vi) ...
 * not engage in any transaction with any Affiliate"). Verb-object test only; no title keywords.
 */
export function negatedItemFamilies(item: string, underNegativeStem: boolean): CovenantFamily[] {
  const out: CovenantFamily[] = [];
  // Where a negation governs: the item start under a "shall not ... the following:" stem, else every in-item
  // "shall/will/may not" or list-position "not" ("; and not engage in"), never a conditional ("so long as ... does not").
  const starts: number[] = underNegativeStem ? [0] : [];
  for (const m of item.matchAll(/(?:\b(?:shall|will|may)\s+|(?:^|[;,]|\band)\s*)not\s+(?:to\s+)?/gi)) {
    if (/\b(?:so long as|if|unless|until|provided)\b[^;]*$/i.test(item.slice(0, m.index!))) continue;
    starts.push(m.index! + m[0].length);
  }
  for (const [f, re] of VERB_OBJECT) {
    if (f === "ASSET_SALES" && /all or substantially all/i.test(item)) continue; // a fundamental change
    if (f === "INVESTMENTS" && /\b(?:proceeds|swingline|lenders?|advances? to be made|borrowing)\b/i.test(item)) continue; // lending mechanics
    // The family's verb/object must start right at the governed position (adverbs / "engage in any" allowed).
    if (starts.some((st) => { const m = re.exec(item.slice(st, st + 400)); return !!m && m.index <= (st === 0 && underNegativeStem ? 60 : 40); })) out.push(f);
  }
  return out;
}
