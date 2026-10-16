/**
 * Line-item evaluation of an agreement's Consolidated EBITDA / Interest Expense definition against XBRL facts.
 * General rules only (no per-issuer logic, no AI):
 *   - The definition is split into enumerated line items; each gets a sign from the group it sits in
 *     ("plus … to the extent deducted" → add-back, "minus / less … to the extent increasing" → deduction).
 *   - Items map to us-gaap concepts by their words (D&A, ShareBasedCompensation, impairments, restructuring, loss on
 *     extinguishment, amortization of intangibles, interest income, capitalized interest …).
 *   - EXACT: every item maps fully. LOWER_BOUND: every unmapped (or partly mapped / capped) item is an add-back that
 *     can only raise the total. NEEDS_INPUT: any unmapped deduction, any two-sided item (gains or losses, pro forma
 *     acquisition / disposition adjustments, net amounts that can turn negative), or an undefined / adjusted base.
 */
import { borrowerInput, type IssuerFinancials } from "./companyfacts";
import { gainDeduction } from "./ebitda-optimizer";

export type DefinitionKind = "EBITDA" | "INTEREST";
export type ItemSign = "+" | "-" | "?";
export interface DefinitionItem { label: string; text: string; sign: ItemSign; coverage: "FULL" | "PARTIAL" | "NONE" | "HEADER"; concepts: Array<{ concept: string; value: string }>; value: string; note: string }
export interface DefinitionEvaluation { kind: DefinitionKind; term: string; status: "EXACT" | "LOWER_BOUND" | "NEEDS_INPUT"; value: string | null; base: { concept: string; value: string } | null; items: DefinitionItem[]; missing: string[]; reason: string; periodEnd: string | null }

const ENT: Record<string, string> = { ldquo: '"', rdquo: '"', quot: '"', nbsp: " ", amp: "&", rsquo: "'", lsquo: "'" };
export function plainText(text: string): string {
  return text.replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => { const c = /^x/i.test(n) ? parseInt(n.slice(1), 16) : parseInt(n, 10); return c === 147 || c === 148 || c === 0x201c || c === 0x201d ? '"' : c === 160 ? " " : String.fromCharCode(c); })
    .replace(/&([a-z]+);/gi, (m, n: string) => ENT[n.toLowerCase()] ?? m).replace(/[“”\u0093\u0094]/g, '"').replace(/\s+/g, " ");
}

export function findDefinitionText(text: string, term: string): string | null {
  const t = plainText(text);
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const m = new RegExp(`"\\s*${esc}\\s*"\\s*(?:shall\\s+)?(?:mean|means|shall\\s+have\\s+the\\s+meaning)\\b`, "i").exec(t);
  if (!m) return null;
  // Real Consolidated EBITDA schedules routinely run 8k–25k+ chars of add-backs before the next
  // defined term. Search the remainder for the next `"Term" means` opener (no 8k/3k cutoffs).
  const after = t.slice(m.index + m[0].length);
  const next = /"\s*[A-Z][^"]{1,80}"\s*(?:shall\s+)?(?:means?|has the meaning|shall have the meaning)\b/.exec(after);
  const end = next ? m[0].length + next.index : Math.min(m[0].length + after.length, 100_000);
  return t.slice(m.index, m.index + end).trim();
}

/**
 * The agreement's primary EBITDA-family earnings measure: a defined term whose body is a net-income
 * (or EBIT) schedule with interest/tax and D&A-style add-backs. Labels vary (EBITDA, Consolidated
 * Adjusted EBITDA, Consolidated Cash Flow, EBITDAX, …). Excess Cash Flow, Acquired/Disposed EBITDA,
 * LTM wrappers, and Pro Forma-only wrappers are never selected. Prefer Consolidated EBITDA when present.
 */
export function findEbitdaMeasureTerm(text: string): string | null {
  const t = plainText(text);
  const hits: Array<{ term: string; rank: number }> = [];
  const opener = /"\s*([^"]{2,80}?)\s*"\s*(?:shall\s+)?(?:mean|means|shall\s+have\s+the\s+meaning|has\s+the\s+meaning)\b/gi;
  for (const m of t.matchAll(opener)) {
    const term = m[1]!.replace(/\s+/g, " ").trim();
    const rank = ebitdaMeasureRank(term);
    if (rank == null) continue;
    const def = findDefinitionText(text, term);
    if (!def || !looksLikeEbitdaSchedule(def)) continue;
    hits.push({ term, rank });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.rank - a.rank || a.term.length - b.term.length);
  return hits[0]!.term;
}

/** Higher = more preferred primary measure. null = not a candidate label. */
function ebitdaMeasureRank(term: string): number | null {
  const n = term.replace(/\s+/g, " ").trim();
  // Period wrappers / components / excess cash flow / ratios — never the primary schedule.
  if (/^(?:LTM|TTM|Trailing|Four\s+Quarter)\s+/i.test(n)) return null;
  if (/\b(?:Acquired|Disposed|Pro\s+Forma|Closing\s+Date|Annualized|Specified|Commensurate|Budgeted|Lost)\b/i.test(n)) return null;
  if (/Excess\s+Cash\s+Flow|Retained\s+Excess|Cash\s+Flow\s+(?:Period|Amount|Application|Priority)|Available\s+for\s+Debt/i.test(n)) return null;
  if (/\bRatio\b|\bCoverage\b|\bLeverage\b|\bMultiple\b/i.test(n)) return null;
  if (/^Consolidated\s+EBITDA$/i.test(n)) return 100;
  if (/^Consolidated\s+Adjusted\s+EBITDA$/i.test(n) || /^Adjusted\s+Consolidated\s+EBITDA$/i.test(n)) return 90;
  if (/^Consolidated\s+EBITDAR$/i.test(n)) return 88;
  if (/^Consolidated\s+EBITDAX$/i.test(n)) return 85;
  if (/^EBITDAR$/i.test(n)) return 82;
  if (/^EBITDAX$/i.test(n)) return 80;
  if (/^EBITDA$/i.test(n)) return 78;
  if (/^Operating\s+EBITDA$/i.test(n)) return 70;
  if (/^Adjusted\s+Cash\s+EBITDA$/i.test(n)) return 65;
  if (/^Adjusted\s+EBITDA$/i.test(n)) return 60;
  if (/^Consolidated\s+Cash\s+Flow$/i.test(n)) return 50;
  // Fail-closed: no catch-all "*EBITDA*" — segment/issuer-specific wrappers (PSG EBITDA, etc.) stay null.
  return null;
}

/** Definition body must read as NI/EBIT + interest-or-tax + D&A/depletion add-backs (not a mere wrapper). */
function looksLikeEbitdaSchedule(def: string): boolean {
  const body = def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning|has\s+the\s+meaning)\s*,?\s*/i, "");
  // Base: net income / EBIT / operating income; UK-style "consolidated profits"; formula "earnings before interest".
  if (!/net\s+income|\bEBIT\b|operating\s+income|consolidated\s+profits?\b|earnings\s+before\s+interest/i.test(body)) return false;
  if (!(/\binterest\b|fixed\s+charges|finance\s+charges/i.test(body) || /\btax(?:es|able|ation)?\b/i.test(body))) return false;
  // Indentures often say "Consolidated Non-Cash Charges" instead of spelling depreciation/amortization.
  if (!/depreciation|amortization|depletion|non-?cash\s+charges/i.test(body)) return false;
  const addBack = /\bplus\b|\bincreased\b|\badding\s+thereto\b|\badding\b|\badjusted\s+by\b|\bthe\s+sum\b|before\s+deducting/i.test(body);
  // Pro Forma wrapper of another EBITDA term with no own add-back schedule.
  if (/\bon\s+a\s+Pro\s+Forma\s+Basis\b/i.test(body) && !addBack) return false;
  return true;
}


const item = (fin: IssuerFinancials, concept: string): bigint | null => {
  const v = fin.values.find((x) => x.metric === "item" && x.concept === concept);
  return v ? BigInt(v.value) : null;
};
const firstItem = (fin: IssuerFinancials, cs: string[]) => { for (const c of cs) { const v = item(fin, c); if (v != null) return { concept: c, value: v }; } return null; };
const DA = ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"];
const IE = ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"];
const II = ["InvestmentIncomeInterest", "InterestIncomeOther"];

/** Enumerators "(a)", "(ii)", "(B)", "(3)" that start a line item (not "clause (k)" / "Section 7.01(b)" references). */
const ENUM = /\((?:[ivxl]{1,5}|[a-z]{1,2}|[A-Z]{1,2}|\d{1,2})\)(?=\s)/g;

export function segments(body: string): Array<{ label: string; text: string; lead: string }> {
  const out: Array<{ label: string; text: string; lead: string }> = [];
  const hits: Array<{ at: number; label: string }> = [];
  for (const m of body.matchAll(ENUM)) {
    const before = body.slice(Math.max(0, m.index! - 60), m.index!);
    if (/(?:\b(?:clauses?|Sections?|Articles?|paragraphs?)\s*(?:\d[\d.]*)?\s*(?:\([^)]{1,5}\)\s*(?:,|and|or|through|to)?\s*)*|\d)$/i.test(before)) continue;
    hits.push({ at: m.index!, label: m[0] });
  }
  const lead = body.slice(0, hits[0]?.at ?? body.length);
  out.push({ label: "(lead)", text: lead, lead: "" });
  hits.forEach((h, i) => out.push({ label: h.label, text: body.slice(h.at + h.label.length, hits[i + 1]?.at ?? body.length).trim(), lead: "" }));
  return out;
}

/** Group-level sign markers outside parentheses in a segment, in order. */
export function markers(text: string): ItemSign[] {
  let depth = 0, flat = "";
  for (const ch of text) { if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1); else if (depth === 0) flat += ch; }
  const out: ItemSign[] = [];
  for (const m of flat.matchAll(/\b(plus|minus|less|reduced\s+by|before\s+deducting|deducting|subtracting|to\s+the\s+extent\s+(?:deducted|decreasing|reducing|included\s+as\s+an?\s+expense)|to\s+the\s+extent\s+(?:increasing|added|included\s+in\s+(?:arriving|determining|calculating))|excluding|net\s+of|including)\b/gi)) {
    const w = m[1]!.toLowerCase();
    // "before deducting X" is an add-back (UK LMA style), not a subtraction.
    out.push(/^(plus|including|before\s+deducting)|deducted|decreasing|reducing|as an? expense/.test(w) ? "+" : "-");
  }
  return out;
}

const GAIN_LIKE = /\b(?:gains?|income|credits?|benefits?|refunds?|reversals?)\b/i;
export const COST_LIKE = /\b(?:expenses?|loss(?:es)?|charges?|costs?|fees?|deductions?|write-?(?:offs?|downs?)|impairments?|amortization|depreciation|depletion|taxes|tax\s+expense|provision|compensation|savings|synerg\w*|premiums?|commissions?|interest)\b/i;
export const TWO_SIDED = /\bpro\s+forma\b(?![^.;]{0,80}\b(?:cost\s+savings|synerg|run[- ]rate))|\b(?:acquired|disposed|acquisition|disposition)\b[^.;]{0,120}\b(?:as\s+if|beginning\s+of)\b|\bgains?\s+(?:or|and|\/)\s+loss|\bloss(?:es)?\s+(?:or|and|\/)\s+gains?|\bincome\s+\(?(?:or|and)\s+loss|\(loss\)|\bforeign\s+(?:currency|exchange)|\bmark[- ]to[- ]market(?:\s+valuation)?(?:\s+of\s+(?:any\s+)?Hedg\w*)?|\b(?:gains?|losses?|income)\b[^.;]{0,40}\bHedg\w*|\bHedg\w*[^.;]{0,40}\b(?:gains?|losses?|income|mark[- ]to[- ]market)/i;
export const CAPPED = /\bnot\s+(?:to\s+)?exceed|\bshall\s+not\s+exceed|\bin\s+an\s+(?:aggregate\s+)?amount\s+(?:not|up\s+to)|\bcapped\b|\bmaximum\s+of\b/i;
export const QUALIFIED = /\bother\s+than\b|\bexcluding\b|\bexcept\b|\bsolely\b|\bonly\s+to\s+the\s+extent\b|\bcash\s+portion|\bnet\s+of\b/i;
export const HEADER = /^(?:,|\s)*(?:(?:the\s+)?following(?:\s+(?:items|amounts))?|without\s+duplication|\(?\s*(?:and\s+)?(?:excluding|including)\s+(?:the\s+effect\s+of)?\s*\)?|to\s+the\s+extent|the\s+sum\s+of|in\s+each\s+case|plus|minus|less|and|for\s+such\s+period|of\s+such\s+Person|:|,|\s)+/i;

export interface MapResult { concepts: Array<{ concept: string; value: bigint }>; residueStop: RegExp[] }

export function mapEbitdaItem(t: string, fin: IssuerFinancials, text: string, depth: number): MapResult | "TWO_SIDED" | null {
  const r: MapResult = { concepts: [], residueStop: [] };
  const add = (c: { concept: string; value: bigint } | null, re: RegExp) => { if (c) { r.concepts.push(c); r.residueStop.push(re); } };
  if (/\bextraordinary\b/i.test(t) && !/non-?recurring|unusual/i.test(t)) { r.concepts.push({ concept: "extraordinary items (eliminated from US GAAP by ASU 2015-01)", value: 0n }); r.residueStop.push(/extraordinary\s+(?:loss(?:es)?|items?|charges?)(?:\s+in\s+accordance\s+with\s+GAAP)?/gi); }
  // "penalties and interest relating to such taxes" / minority interest are not InterestExpense — do not steal IE.
  const taxPenaltyInterest = /\b(?:penalties?\s+and\s+)?interest\s+(?:relating\s+to|on|with\s+respect\s+to)\s+(?:such\s+)?(?:taxes?|Tax)|\btaxes?\b[^.;]{0,80}\b(?:penalties?\s+and\s+)?interest\b/i.test(t);
  const minorityInterest = /\b(?:minority|non-?controlling)\s+interest\b/i.test(t);
  const interestExpenseCue = /\binterest\s+(?:expense|charges?)\b|\bInterest\s+Expense\b|\bFixed\s+Charges\b/i.test(t) && !minorityInterest;
  const tI = t.replace(/\b(?:equity|minority|non-?controlling|profits?|ownership|membership|partnership|carried|economic|voting)\s+interests?\b|\binterests?\s+(?:in|of)\s+(?:any|such|the)\b|\binterests\b/gi, " ");
  if (/\binterest\b/i.test(tI) && !minorityInterest && !/interest\s+income/i.test(t.replace(/net\s+of\s+interest\s+income/i, "")) && (interestExpenseCue || !taxPenaltyInterest)) {
    const term = /"?((?:Consolidated\s+)?(?:Total\s+)?(?:Net\s+)?Interest\s+Expense)"?/.exec(t)?.[1];
    if (term && /[A-Z]/.test(term[0]!) && depth < 2) {
      const ev = evaluateDefinition("INTEREST", term, text, fin, depth + 1);
      if (ev.status !== "NEEDS_INPUT" && ev.value != null) {
        add({ concept: `${term} (${ev.status})`, value: BigInt(ev.value) }, /(?:Consolidated\s+)?(?:Total\s+)?(?:Net\s+)?Interest\s+Expense/gi);
        if (ev.status === "LOWER_BOUND") r.residueStop.push(/^$/);
        (r as MapResult & { lowerBound?: boolean }).lowerBound = ev.status === "LOWER_BOUND";
      } else {
        // Defined Interest Expense often excludes MTM hedges etc.; when the full definition is not
        // derivable, XBRL interest expense still evidences the core add-back (partial / floor).
        const ie = firstItem(fin, IE);
        const defNets = (() => { const d = findDefinitionText(text, term); return !!d && /\bNet\s+Interest\b|net\s+of|interest\s+income|\bless\b|\bminus\b|\bgains?\b|\bincome\s+from\b/i.test(d.replace(/deducted\s+in\s+(?:the\s+)?(?:calculation|computation|determination)\s+of\s+(?:Consolidated\s+)?Net\s+Income/gi, " ")); })();
        // Gross filed interest overstates a defined net-of-income figure: not a floor → two-sided (fail closed).
        // An exclusion ("excluding the non-cash amortization of deferred financing fees", "other than …") shrinks the
        // defined figure below gross filed interest: gross is not a floor either.
        const defExcludes = (() => { const d = findDefinitionText(text, term); return !!d && /\bexclud|\bother\s+than\b|\bexcept\b|\bshall\s+not\s+include\b/i.test(d); })();
        if (ie && (defNets || defExcludes)) return "TWO_SIDED";
        if (!ie) {
          // No XBRL interest: a referenced definition that is plain (gross) interest expense, with no netting of
          // income / gains, is non-negative — an unevidenced one-sided add-back (claim 0), not a two-sided line.
          const def = findDefinitionText(text, term);
          const oneSided = !!def && !/\bNet\s+Interest\b|net\s+of|interest\s+income|\bless\b|\bminus\b|\bgains?\b|\bincome\s+from\b/i.test(def.replace(/deducted\s+in\s+(?:the\s+)?(?:calculation|computation|determination)\s+of\s+(?:Consolidated\s+)?Net\s+Income/gi, " "));
          return oneSided ? null : "TWO_SIDED";
        }
        add(ie, /(?:Consolidated\s+)?(?:Total\s+)?(?:Net\s+)?Interest\s+Expense/gi);
        (r as MapResult & { lowerBound?: boolean }).lowerBound = true;
      }
    } else {
      const ie = firstItem(fin, IE);
      if (/net\s+of\s+interest\s+income/i.test(t)) {
        const ii = firstItem(fin, II);
        if (ie && ii) {
          r.concepts.push(ie, { concept: ii.concept, value: -ii.value });
          r.residueStop.push(/(?:consolidated\s+)?interest\s+expense|\(?net\s+of\s+interest\s+income\)?/gi);
        } else if (ie && /\b(?:total\s+)?interest\s+expense\b/i.test(t) && /to\s+the\s+extent\s+not\s+reflected\s+in\s+such\s+(?:total\s+)?interest\s+expense/i.test(t)) {
          // "net of interest income" qualifies the hedge residue after the interest-expense core — claim IE.
          add(ie, /(?:consolidated\s+)?(?:total\s+)?interest\s+(?:expense|charges)/gi);
          (r as MapResult & { lowerBound?: boolean }).lowerBound = true;
        } else if (!ie || !ii) return "TWO_SIDED";
      } else add(ie, /(?:consolidated\s+)?(?:total\s+)?interest\s+(?:expense|charges)/gi);
    }
  }
  // Fixed Charges / finance charges ≥ interest expense: XBRL interest is a lower bound on that add-back.
  if (/(?:\bFixed\s+Charges\b|\b(?:net\s+)?finance\s+charges?\b)/i.test(t) && !r.concepts.length) {
    const ie = firstItem(fin, IE);
    if (ie) { add(ie, /\bFixed\s+Charges\b|\b(?:net\s+)?finance\s+charges?\b/gi); (r as MapResult & { lowerBound?: boolean }).lowerBound = true; }
  }
  if (/\btax(?:es)?\b/i.test(t) && !/tax\s+(?:credits?|benefits?|refunds?)/i.test(t)) {
    // Exact only when every tax named is an income tax; other taxes (franchise, withholding, "other taxes") are not in
    // the filed income-tax figure → the line is a one-sided floor.
    const rest = t.replace(/\btax(?:es)?(?:\s+expense)?\s+(?:(?:based\s+on|measured\s+by)\s+(?:income|profits)(?:,?\s+(?:or|and)\s+(?:profits|capital|income))*|imposed\s+on\s+(?:income|profits))/gi, " ")
      .replace(/\b(?:(?:federal|state|local|foreign|provincial|national|U\.?S\.?)(?:,|\s+and|\s+or)?\s+)*income\s+tax(?:es)?(?:\s+(?:expense|provision))?/gi, " ");
    if (/\btax(?:es)?\b|franchise/i.test(rest) || /\b(?:based\s+on|measured\s+by)\b[^;.]{0,40}\bcapital\b/i.test(t)) (r as MapResult & { lowerBound?: boolean }).lowerBound = true;
  }
  if (/\btax(?:es)?\b/i.test(t) && !/tax\s+(?:credits?|benefits?|refunds?)/i.test(t)) add(firstItem(fin, ["IncomeTaxExpenseBenefit"]), /(?:consolidated\s+)?(?:provision\s+for\s+)?(?:(?:federal|state|local|foreign|provincial|national)(?:,|\s+and|\s+or)?\s+)*(?:income\s+)?tax(?:es)?(?:\s+expense)?(?:,?\s+to\s+the\s+extent\s+based\s+on\s+income\s+or\s+profits)?|based\s+on\s+income|profits?/gi);
  const daAll = /depreciation/i.test(t);
  // Amortization of premiums / deferred financing fees lives inside interest expense — not D&A.
  const amortFinancing = /amortization\s+of\s+(?:premiums?|(?:deferred\s+)?(?:financing|debt|original\s+issue|OID|discount))/i.test(t)
    || (/amortization/i.test(t) && /(?:deferred\s+)?financing\s+fees?/i.test(t));
  const interestExpenseLine = /\binterest\s+(?:expense|charges?)\b/i.test(t) && !daAll;
  if (daAll) add(firstItem(fin, DA), /(?:all\s+amounts\s+attributable\s+to\s+)?(?:depreciation|amortization|depletion)(?:,?\s+(?:and|or)\s+(?:depreciation|amortization|depletion))*(?:\s+expense)?/gi);
  else if (/amortization/i.test(t) && !amortFinancing && !interestExpenseLine) add(firstItem(fin, /intangible/i.test(t) ? ["AmortizationOfIntangibleAssets"] : DA), /amortization(?:\s+expense)?(?:\s+of\s+(?:other\s+)?intangibles?(?:\s+assets)?)?/gi);
  if (/(?:stock|equity|share)[- ]based\s+compensation|stock\s+options?|equity\s+awards?|non-?cash\s+(?:stock\s+)?compensation|stock\s+compensation/i.test(t)) add(firstItem(fin, ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"]), /(?:non-?cash\s+)?(?:expense\s+recorded\s+with\s+respect\s+to\s+)?(?:stock|equity|share)[- ]based\s+compensation(?:\s+expense)?|non-?cash\s+(?:stock\s+)?compensation(?:\s+(?:expense|deduction))?|stock\s+compensation(?:\s+expense)?|stock\s+options?(?:\s+or\s+other\s+equity-based\s+compensation)?|equity\s+awards?/gi);
  if (/impairment/i.test(t)) {
    if (/goodwill/i.test(t)) add(firstItem(fin, ["GoodwillImpairmentLoss"]), /(?:non-?cash\s+)?impairment(?:\s+loss(?:es)?)?(?:\s+of)?\s+goodwill/gi);
    if (/intangible/i.test(t)) add(firstItem(fin, ["ImpairmentOfIntangibleAssetsExcludingGoodwill", "ImpairmentOfIntangibleAssetsIndefinitelivedExcludingGoodwill"]), /(?:or\s+other\s+)?intangibles?(?:\s+assets)?/gi);
    if (!/goodwill|intangible/i.test(t)) add(firstItem(fin, ["AssetImpairmentCharges"]), /(?:non-?cash\s+)?(?:asset\s+)?impairment(?:\s+charges?|\s+loss(?:es)?)?/gi);
  }
  if (/restructuring/i.test(t)) add(firstItem(fin, ["RestructuringCharges"]), /restructuring(?:\s+charges?|\s+costs?|\s+expenses?)?/gi);
  if (/extinguishment|early\s+(?:retirement|repayment|redemption)\s+of\s+(?:debt|Indebtedness)/i.test(t)) {
    const g = firstItem(fin, ["GainsLossesOnExtinguishmentOfDebt"]);
    if (g) { r.concepts.push({ concept: `${g.concept} (losses only)`, value: g.value < 0n ? -g.value : 0n }); r.residueStop.push(/(?:the\s+amount\s+of\s+all\s+)?(?:expenses?|loss(?:es)?|charges?)\s+(?:associated\s+with|from|on|relating\s+to)\s+(?:the\s+)?(?:early\s+)?extinguishment\s+of\s+(?:Indebtedness|debt)/gi); }
  }
  return r.concepts.length ? r : null;
}

export const STOP = /\b(?:the|a|an|of|and|or|any|all|such|its|their|in|for|to|on|with|by|from|that|this|each|case|period|amount|amounts|consolidated|person|borrower|parent|company|subsidiaries|subsidiary|group|restricted|required|taken|pursuant|gaap|accordance|recorded|respect|other|non-?cash|expense|expenses|charges?|losses?|attributable|which|was|were|is|be|been|deducted|determining|net|income|calculating|arriving|at|as|so|without|duplication|extent|solely|aggregate)\b/gi;

/** The definition split into its lead (base) and enumerated line items; items[i] of evaluateDefinition is segs[i + 1]. */
export function definitionSegments(kind: DefinitionKind, term: string, text: string): Array<{ label: string; text: string; lead: string }> | null {
  const def = findDefinitionText(text, term);
  if (!def) return null;
  const body = def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*,?\s*/i, "").replace(/^(?:for|with\s+respect\s+to)\s+any\s+(?:period|Person)[^,]{0,120},\s*/i, "");
  const segs = segments(body);
  // "(i) the sum of (a) CNI plus (b)…": when the lead names no base, fold the first NI/EBIT/operating-income
  // item into the lead (may sit under a "sum of" wrapper, not only at segs[1]).
  const baseRe = kind === "EBITDA" ? /net\s+income|\bEBIT\b|operating\s+income/i : /interest/i;
  if (kind === "EBITDA" && !baseRe.test(segs[0]!.text)) {
    const idx = segs.findIndex((s, i) => i > 0 && baseRe.test(s.text));
    if (idx > 0) { segs[0] = { ...segs[0]!, text: `${segs[0]!.text} ${segs[idx]!.text}` }; segs.splice(idx, 1); }
  } else if (!baseRe.test(segs[0]!.text) && segs[1] && baseRe.test(segs[1].text)) {
    segs[0] = { ...segs[0]!, text: `${segs[0]!.text} ${segs[1].text}` }; segs.splice(1, 1);
  }
  return segs;
}

export function evaluateDefinition(kind: DefinitionKind, term: string, text: string, fin: IssuerFinancials, depth = 0): DefinitionEvaluation {
  const res = (status: DefinitionEvaluation["status"], reason: string, extra: Partial<DefinitionEvaluation> = {}): DefinitionEvaluation =>
    ({ kind, term, status, value: null, base: null, items: [], missing: [], reason, periodEnd: fin.anchor ?? null, ...extra });
  const segs = definitionSegments(kind, term, text);
  if (!segs) return res("NEEDS_INPUT", `"${term}" is not defined in the agreement text`);
  const lead = segs[0]!.text;

  // ---- base ----
  let base: { concept: string; value: bigint } | null = null;
  const items: DefinitionItem[] = [];
  if (kind === "EBITDA") {
    const niTerm = /"?((?:Consolidated\s+)?(?:Adjusted\s+)?Net\s+Income)"?/i.exec(lead)?.[1];
    const ebit = /\b(EBIT|Consolidated\s+EBIT|Consolidated\s+Operating\s+Income)\b/.exec(lead)?.[1];
    const bareOperatingIncome = !niTerm && !ebit && /\boperating\s+income\b/i.test(lead);
    if (niTerm) {
      const capital = /^[A-Z]/.test(niTerm) && /[A-Z]/.test(niTerm.split(/\s+/).at(-1)![0]!);
      if (capital) {
        const ni = findDefinitionText(text, niTerm);
        if (!ni) return res("NEEDS_INPUT", `base "${niTerm}" is not defined in this document`);
        // Extraordinary items no longer exist under US GAAP (ASU 2015-01): excluding them changes nothing.
        const niBody = ni.replace(/after\s+any\s+deduction\s+for\s+minority\s+interests[^)]*\)?/i, "")
          .replace(/\(?\s*(?:but\s+)?(?:excluding|exclusive\s+of|other\s+than|before)\s+(?:any\s+)?extraordinary\s+(?:gains?|loss(?:es)?|items?)(?:\s+(?:and|or|but\s+including|and\s+including)\s+(?:any\s+)?extraordinary\s+(?:gains?|loss(?:es)?|items?))?\s*\)?/gi, " ");
        const cni = cniAdjustments(niBody.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*,?\s*/i, ""), fin);
        if ("reason" in cni) return res("NEEDS_INPUT", `base "${niTerm}": ${cni.reason}`);
        const v0 = firstItem(fin, ["NetIncomeLoss", "ProfitLoss"]);
        if (!v0) return res("NEEDS_INPUT", "no exact TTM net income in XBRL");
        base = { concept: `${v0.concept}${cni.adjust.map((a) => ` - ${a.concept}`).join("")}`, value: cni.adjust.reduce((acc, a) => acc - a.value, v0.value) };
        if (cni.lower.length) items.push({ label: "(base)", text: niTerm, sign: "+", coverage: "PARTIAL", concepts: cni.adjust.map((a) => ({ concept: a.concept, value: (-a.value).toString() })), value: "0", note: `net income base is a lower bound: ${cni.lower.join("; ")}` });
      }
      if (!base) {
      const v = firstItem(fin, ["NetIncomeLoss", "ProfitLoss"]);
      if (!v) return res("NEEDS_INPUT", "no exact TTM net income in XBRL");
      base = v;
      }
    } else if (ebit && depth < 2) {
      const ev = evaluateDefinition("EBITDA", ebit, text, fin, depth + 1);
      if (ev.status === "NEEDS_INPUT") return res("NEEDS_INPUT", `base "${ebit}": ${ev.reason}`);
      base = { concept: `${ebit} (${ev.status})`, value: BigInt(ev.value!) };
      if (ev.status === "LOWER_BOUND") items.push({ label: "(base)", text: ebit, sign: "+", coverage: "PARTIAL", concepts: [], value: "0", note: `base is a lower bound: ${ev.missing.join("; ")}` });
    } else if (bareOperatingIncome) {
      // "operating income as reported in the Borrower's consolidated financial statements"
      const v = firstItem(fin, ["OperatingIncomeLoss"]);
      if (!v) return res("NEEDS_INPUT", "no exact TTM operating income in XBRL");
      base = v;
    } else if (/\bconsolidated\s+profits?\b/i.test(lead) && /before\s+taxation|before\s+tax/i.test(lead)) {
      // UK-style "consolidated profits … before taxation" — same economic base as net income / ProfitLoss.
      const v = firstItem(fin, ["ProfitLoss", "NetIncomeLoss"]);
      if (!v) return res("NEEDS_INPUT", "no exact TTM profit/net income in XBRL");
      base = v;
    } else if (/earnings\s+before\s+interest/i.test(lead)) {
      // Formula-only "earnings before interest, taxes, depreciation, amortization" — reconstruct from filings.
      const ni = firstItem(fin, ["NetIncomeLoss", "ProfitLoss"]);
      const ie = firstItem(fin, IE);
      const tax = firstItem(fin, ["IncomeTaxExpenseBenefit"]);
      const da = firstItem(fin, DA);
      if (!ni || !ie || !tax || !da) return res("NEEDS_INPUT", "earnings-before formula: missing NI/interest/tax/D&A in XBRL");
      const parts = [ni, ie, tax.value > 0n ? tax : { concept: tax.concept, value: 0n }, da];
      base = { concept: `earnings before IE/tax/D&A (${parts.map((p) => p.concept).join("+")})`, value: parts.reduce((a, p) => a + (p.value > 0n ? p.value : 0n), 0n) };
      // Further lead add-backs (non-cash charges, etc.) stay open — never invent them.
      if (/non-?cash|impairment|stock|equity|share[- ]based|write-?(?:offs?|downs?)/i.test(lead)) {
        items.push({ label: "(base)", text: lead.slice(0, 200), sign: "+", coverage: "PARTIAL", concepts: [], value: "0", note: "formula EBITDA reconstructed from filings; further lead add-backs need input" });
      }
    } else return res("NEEDS_INPUT", "definition does not start from net income or a defined EBIT");
  } else {
    if (!/interest/i.test(lead)) return res("NEEDS_INPUT", "interest definition has no interest-expense base");
    const v = firstItem(fin, IE);
    if (!v) return res("NEEDS_INPUT", "no exact TTM interest expense in XBRL");
    base = v;
    if (TWO_SIDED.test(lead) || /\bgains?\b/i.test(lead)) return res("NEEDS_INPUT", "interest base carries a two-sided adjustment");
    if (/\bexclud|\bshall\s+not\s+include\b/i.test(lead.replace(/\([^)]*\)/g, " "))) return res("NEEDS_INPUT", "interest definition excludes an item not in XBRL");
    const paren = /\((?:excluding|other\s+than|net\s+of|less)\b[^)]*\)/i.exec(lead) ?? /,?\s*(?:net\s+of|less)\s+(?:any\s+)?(?:cash\s+)?interest\s+income\b/i.exec(lead);
    if (paren && !/interest\s+income/i.test(paren[0])) return res("NEEDS_INPUT", `interest base excludes an item not in XBRL: "${paren[0].slice(0, 100)}"`);
    if (paren) { const ii = firstItem(fin, II); if (!ii) return res("NEEDS_INPUT", "net of interest income, but no XBRL interest income"); items.push({ label: "(net)", text: paren[0], sign: "-", coverage: "FULL", concepts: [{ concept: ii.concept, value: ii.value.toString() }], value: (-ii.value).toString(), note: "" }); }
    if (/capitaliz/i.test(lead)) { const c = firstItem(fin, ["InterestCostsCapitalized"]); items.push({ label: "(cap)", text: "capitalized interest", sign: "+", coverage: c ? "FULL" : "NONE", concepts: c ? [{ concept: c.concept, value: c.value.toString() }] : [], value: (c?.value ?? 0n).toString(), note: "GAAP InterestExpense is net of capitalized interest" }); }
  }

  // ---- line items ----
  let sign: ItemSign = "+";
  for (const m of markers(lead)) sign = m;
  if (kind === "EBITDA" && /\bincreas/i.test(lead) && !/\bdecreas|deducted/i.test(lead)) sign = "-";
  // "net income … excluding the following (but only to the extent included in NI): (A) D&A; (B) interest; (C) tax"
  // — "excluding" here means add-back (REIT/indenture drafting), not a subtraction from the sum.
  if (kind === "EBITDA" && /net\s+income/i.test(lead) && /\bexcluding\s+the\s+following\b/i.test(lead) && /to\s+the\s+extent\s+included/i.test(lead)) sign = "+";
  const used = new Set<string>();
  for (const s of segs.slice(1)) {
    const t = s.text;
    const header = /\bthe\s+following\b|:\s*$/.test(t) && t.length < 300;
    // A group header ("(b) the following, to the extent included in calculating Net Income:") sets the sign of the
    // items under it. Inside an item, qualifiers ("excluding", "net of") do not flip the group; only a trailing
    // connector ("…; minus") does.
    if (header) { for (const m of markers(t)) sign = m; if (/\bto\s+the\s+extent\s+(?:increasing|included\s+in)/i.test(t)) sign = "-"; }
    const groupSign = sign;
    if (!header) for (const m of markers(t.slice(-30))) sign = m;
    if (header) { items.push({ label: s.label, text: t.slice(0, 160), sign: groupSign, coverage: "HEADER", concepts: [], value: "0", note: "group header" }); continue; }
    const descr = t.replace(HEADER, "").trim();
    if (descr.length < 3 || (!COST_LIKE.test(descr) && !GAIN_LIKE.test(descr) && HEADER.test(t))) { items.push({ label: s.label, text: t.slice(0, 160), sign: groupSign, coverage: "HEADER", concepts: [], value: "0", note: "group header" }); continue; }
    const it: DefinitionItem = { label: s.label, text: t.slice(0, 240), sign: groupSign, coverage: "NONE", concepts: [], value: "0", note: "" };
    items.push(it);
    if (kind === "INTEREST") {
      if (groupSign === "-") { if (/interest\s+income/i.test(t)) { const ii = firstItem(fin, II); if (ii) { it.coverage = "FULL"; it.concepts.push({ concept: ii.concept, value: ii.value.toString() }); it.value = (-ii.value).toString(); continue; } } it.note = "unmapped deduction"; continue; }
      if (/amortization\s+of\s+(?:deferred\s+)?(?:financing|debt|original|discount)|non-?cash\s+interest|interest\s+component\s+of\s+(?:capital|finance)\s+lease/i.test(t)) { it.coverage = "FULL"; it.note = "already within GAAP interest expense"; continue; }
      if (/capitaliz/i.test(t)) { const c = firstItem(fin, ["InterestCostsCapitalized"]); if (c) { it.coverage = "FULL"; it.concepts.push({ concept: c.concept, value: c.value.toString() }); it.value = c.value.toString(); } else it.note = "unmapped add (capitalized interest)"; continue; }
      if (GAIN_LIKE.test(t) && !COST_LIKE.test(t)) { it.sign = "?"; it.note = "income-like item"; continue; }
      it.note = "unmapped inclusion (raises interest expense)"; continue;
    }
    if (TWO_SIDED.test(t)) { it.sign = "?"; it.note = "two-sided adjustment"; continue; }
    if (groupSign === "+" && GAIN_LIKE.test(t.replace(/net\s+of\s+interest\s+income|based\s+on\s+income|income\s+tax(?:es)?|determining\s+(?:Consolidated\s+)?Net\s+Income|(?:Consolidated\s+)?Net\s+Income|decreasing\s+\w+\s+Net\s+Income/gi, "")) && !COST_LIKE.test(t)) { it.sign = "?"; it.note = "income/gain-like item in an add-back group"; continue; }
    if (groupSign === "-") {
      // A deduction that is exactly one filed gain item is modelled from filings (gain deducted; a net loss deducts 0).
      const gd = gainDeduction(t, fin);
      if (gd) { it.coverage = "FULL"; it.concepts.push({ concept: gd.concept, value: gd.value.toString() }); it.value = (-gd.value).toString(); it.note = "deduction from exact filed gain"; continue; }
      it.note = "unmapped deduction"; continue;
    }
    const mapped = CAPPED.test(t) ? null : mapEbitdaItem(t, fin, text, depth);
    if (mapped === "TWO_SIDED") { it.sign = "?"; it.note = "referenced definition not derivable (could lower the total)"; continue; }
    if (!mapped) { it.note = CAPPED.test(t) ? "capped add-back (counted as 0 in the lower bound)" : COST_LIKE.test(t) ? "unmapped add-back" : "unclassified item"; if (!COST_LIKE.test(t)) it.sign = "?"; continue; }
    const fresh = mapped.concepts.filter((c) => !used.has(c.concept));
    fresh.forEach((c) => used.add(c.concept));
    it.concepts = fresh.map((c) => ({ concept: c.concept, value: c.value.toString() }));
    it.value = fresh.reduce((a, c) => a + c.value, 0n).toString();
    let residue = t; for (const re of mapped.residueStop) residue = residue.replace(re, " ");
    residue = residue.replace(/\([^)]*\)/g, " ").replace(STOP, " ").replace(/[^A-Za-z]+/g, " ").trim();
    const lb = (mapped as MapResult & { lowerBound?: boolean }).lowerBound;
    // A losses-only figure read from a net gain/(loss) fact understates gross losses: a floor, never exact.
    const lossesOnly = fresh.some((c) => /\(losses only\)/.test(c.concept));
    it.coverage = residue.length <= 12 && !QUALIFIED.test(t) && !lb && !lossesOnly ? "FULL" : "PARTIAL";
    if (QUALIFIED.test(t)) { it.coverage = "PARTIAL"; it.concepts = []; it.value = "0"; it.note = "qualified add-back (other than / solely …): mapped amount may overstate, counted as 0"; continue; }
    it.note = it.coverage === "FULL" ? "mapped" : `partly mapped; unmapped remainder "${residue.slice(0, 60)}"`;
  }
  // D&A total subsumes its components; restructuring and asset impairments may overlap → take the larger.
  const all = items.flatMap((i) => i.concepts.map((c) => ({ i, c })));
  if (all.some((x) => DA.includes(x.c.concept))) for (const x of all) if (["AmortizationOfIntangibleAssets", "Depreciation"].includes(x.c.concept)) { x.i.value = (BigInt(x.i.value) - BigInt(x.c.value)).toString(); x.i.note += "; within D&A total"; x.c.value = "0"; }
  const rs = all.find((x) => x.c.concept === "RestructuringCharges"), ai = all.find((x) => x.c.concept === "AssetImpairmentCharges");
  let overlap = false;
  if (rs && ai) { const small = BigInt(rs.c.value) < BigInt(ai.c.value) ? rs : ai; small.i.value = (BigInt(small.i.value) - BigInt(small.c.value)).toString(); small.i.note += "; may overlap restructuring/impairment, larger kept"; small.c.value = "0"; small.i.coverage = "PARTIAL"; overlap = true; }

  const bad = items.filter((i) => i.coverage !== "HEADER" && (i.sign === "?" || (i.sign === "-" && i.coverage !== "FULL")));
  const short = (i: DefinitionItem) => `${i.label} ${i.text.replace(HEADER, "").slice(0, 70)}`;
  if (bad.length) return res("NEEDS_INPUT", `items that could lower the total are not in XBRL: ${bad.slice(0, 3).map((i) => `${short(i)} [${i.note}]`).join("; ")}`, { items, base: base && { concept: base.concept, value: base.value.toString() }, missing: bad.map(short) });
  const total = items.reduce((a, i) => a + BigInt(i.value), base!.value);
  const open = items.filter((i) => i.coverage === "NONE" || i.coverage === "PARTIAL");
  const status = open.length || overlap ? "LOWER_BOUND" : "EXACT";
  return res(status, status === "EXACT" ? "every line item maps to XBRL" : `${open.length} add-back item(s) not (fully) in XBRL; total is a lower bound`, { value: total.toString(), items, base: { concept: base!.concept, value: base!.value.toString() }, missing: open.map(short) });
}


const EQUITY_METHOD = ["IncomeLossFromEquityMethodInvestments", "IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions"];
const ASSET_SALE = ["GainLossOnDispositionOfAssets", "GainLossOnSaleOfPropertyPlantEquipment", "GainLossOnDispositionOfAssets1"];
const EXTINGUISH = ["GainsLossesOnExtinguishmentOfDebt"];

/**
 * Net-income exclusions mapped to what the filings report. Each excluded item is:
 *  - gone under GAAP (extraordinary items, cumulative effect of accounting changes): no change;
 *  - losses / charges / expenses only: excluding them can only raise the contract figure, so net income stays a lower
 *    bound (noted, not blocking);
 *  - equity-method income of non-subsidiaries (except dividends received): minus the XBRL equity-method income, a lower
 *    bound because the dividends added back are not negative;
 *  - gains and losses on asset sales / debt extinguishment: minus the XBRL gain (exact);
 *  - anything else that can lower the figure (gains or income of other kinds, unrestricted or dividend-restricted
 *    subsidiaries, non-recurring items, pro forma): NEEDS_INPUT with the clause named.
 */
export function cniAdjustments(body: string, fin: IssuerFinancials): { adjust: Array<{ concept: string; value: bigint }>; lower: string[] } | { reason: string } {
  const flat = body.replace(/\bnet\s+income\s*\(\s*loss\s*\)/gi, "net income").replace(/\(\s*loss\s*\)/gi, "");
  // Exclusions start at "excluding" / "provided that" / "there shall be excluded" or the first enumerated item.
  const cut = flat.search(/\b(?:excluding|exclusive\s+of|but\s+excluding|provided(?:,\s*however)?,?\s+that|there\s+shall\s+(?:be\s+)?(?:excluded|not\s+be\s+included))\b|\((?:a|i|1)\)\s/i);
  const lead = cut < 0 ? flat : flat.slice(0, cut);
  if (/pro\s+forma|acquired|disposed|non-?recurring|unusual|Unrestricted\s+Subsidiar|discontinued/i.test(lead)) return { reason: `net income lead adjusts by items not in filings ("${/pro\s+forma|acquired|disposed|non-?recurring|unusual|Unrestricted\s+Subsidiar|discontinued/i.exec(lead)![0]}")` };
  if (cut < 0) return { adjust: [], lower: [] };
  const rest = flat.slice(cut);
  const parts = rest.split(/(?:;|,)\s*(?:and\s+|or\s+|plus\s+)?(?=\((?:[ivxl]{1,5}|[a-z]{1,2}|\d{1,2})\)\s)/i).flatMap((x) => x.split(/\s(?=\((?:[ivxl]{1,5}|[a-z]{1,2}|\d{1,2})\)\s)/i)).map((x) => x.trim()).filter((x) => x.length > 8);
  const adjust: Array<{ concept: string; value: bigint }> = [], lower: string[] = [], used = new Set<string>();
  // Borrower-supplied figure for an exclusion (by clause label or category), recorded with its source.
  let label = "";
  const consumed = new Set<string>();
  // One input answers one clause: a category key is used once; "OTHER" items need their clause label.
  const supplied = (cat: string) => { const b = borrowerInput(fin, [label && `CNI:${label}`, cat !== "OTHER" && `CNI:${cat}`].filter((k): k is string => !!k && !consumed.has(k.toUpperCase()))); if (!b) return false; consumed.add(b.key.toUpperCase()); const c = `borrower:${b.key} [${b.source}]`; if (!used.has(c)) { used.add(c); adjust.push({ concept: c, value: BigInt(b.value) }); } return true; };
  const take = (cs: string[], what: string, cat: string) => { const it = firstItem(fin, cs); if (!it) return supplied(cat) ? null : `${what} is excluded, but the filing reports no ${cs[0]} for the period (borrower input CNI:${cat} accepted)`; if (!used.has(it.concept)) { used.add(it.concept); adjust.push(it); } return null; };
  for (const raw of parts) {
    label = /^\(([ivxl]{1,5}|[a-z]{1,2}|\d{1,2})\)/i.exec(raw)?.[0] ?? "";
    const t = raw.replace(/^(?:excluding|exclusive\s+of|but\s+excluding|provided[^:()]*?(?:excluded|that)|there\s+shall\s+(?:be\s+)?excluded)[,:]?\s*(?:\(?\s*without\s+duplication\s*\)?,?\s*)?/i, "");
    if (t.length < 8) continue;
    // Connective text between exclusions ("(and excluding the effect of), without duplication:", "there shall be
    // excluded:", "[reserved]") names no item: it neither raises nor lowers net income.
    if (/^\[\s*reserved\s*\]/i.test(t.replace(/^\(?\w{1,4}\)\s*/, "")) || !t.replace(/\(?\s*(?:and\s+)?(?:excluding|exclusive\s+of)\s+(?:the\s+effect\s+of)?\s*\)?|\(?\s*without\s+duplication\s*\)?|(?:in\s+(?:computing|calculating)\s+(?:such\s+amount|(?:such\s+)?Consolidated\s+Net\s+Income)[^,:]*,?\s*)?there\s+(?:shall|will)\s+(?:not\s+)?be\s+(?:excluded|included)(?:\s+(?:therefrom|from\s+(?:the\s+calculation\s+of\s+)?(?:such\s+)?Consolidated\s+Net\s+Income|in\s+(?:such\s+)?Consolidated\s+Net\s+Income))?|to\s+the\s+extent\s+otherwise\s+included|the\s+effects?\s+of|Consolidated\s+Net\s+Income\s+shall\s+exclude|the\s+following(?:\s+will\s+be\s+excluded\s+in\s+computing\s+Consolidated\s+Net\s+Income)?/gi, " ").replace(/[^A-Za-z]+/g, "").length) continue;
    if (/cumulative\s+effect/i.test(t) && !/\bgains?\b[^.;]{0,40}(?:sale|disposition)|non-?recurring|unusual|Unrestricted/i.test(t)) continue;
    if (/\bextraordinary\b/i.test(t) && !/non-?recurring|unusual|infrequent|\bsales?\b|disposition/i.test(t)) continue;
    if (/equity\s+method|any\s+Person\s+(?:\(other\s+than|other\s+than|that\s+is\s+not)|not\s+a\s+(?:Restricted\s+)?Subsidiary|in\s+which\s+any\s+other\s+Person/i.test(t) && !/Unrestricted\s+Subsidiar/i.test(t)) {
      const e = take(EQUITY_METHOD, "equity-method income", "EQUITY_METHOD"); if (e) return { reason: e };
      if (/dividends?|distributions?/i.test(t)) lower.push("dividends from equity investees added back are not in XBRL");
      continue;
    }
    const gainsAndLosses = /\bgains?\b/i.test(t) && /\bloss(?:es)?\b/i.test(t);
    if (gainsAndLosses && /extinguishment|early\s+(?:retirement|repayment|redemption)|repurchase\s+of\s+(?:debt|Indebtedness)/i.test(t) && !/non-?recurring|unusual|asset|sale/i.test(t)) {
      // No extinguishment line in the period's filings → exclusion is a no-op (exact 0), not NEEDS_INPUT.
      const it = firstItem(fin, EXTINGUISH);
      if (it) { if (!used.has(it.concept)) { used.add(it.concept); adjust.push(it); } }
      else if (supplied("EXTINGUISHMENT")) { /* sourced borrower figure */ }
      continue;
    }
    if (gainsAndLosses && /(?:sale|disposition|disposal)s?\s+of\s+(?:any\s+)?(?:assets?|property|properties)|asset\s+(?:sales?|dispositions?)/i.test(t) && !/non-?recurring|unusual|extinguishment|hedg|currency|securities|discontinued/i.test(t)) {
      const it = firstItem(fin, ASSET_SALE);
      if (it) { if (!used.has(it.concept)) { used.add(it.concept); adjust.push(it); } }
      else if (supplied("ASSET_SALE")) { /* sourced borrower figure */ }
      continue;
    }
    // Excluding only losses / charges / expenses can only raise the contract figure.
    const cat = /Unrestricted\s+Subsidiar/i.test(t) ? "UNRESTRICTED_SUBSIDIARY" : /non-?recurring|unusual|infrequent|exceptional|one-?time|extraordinary/i.test(t) ? "NON_RECURRING" : /discontinued/i.test(t) ? "DISCONTINUED_OPERATIONS" : /equity\s+method|any\s+Person/i.test(t) ? "EQUITY_METHOD" : "OTHER";
    if (supplied(cat)) continue;
if (!/\bgains?\b|\bincome\b|\bcredits?\b|\bbenefits?\b|\bincreas|\bwrite-?ups?\b|Unrestricted\s+Subsidiar|dividends?|distributions?|pro\s+forma|acquired|accru/i.test(t) && /\bloss(?:es)?\b|\bcharges?\b|\bexpenses?\b|\bcosts?\b|\bwrite-?(?:offs?|downs?)\b|\bimpairments?\b/i.test(t)) { lower.push(`excluded losses/charges not in XBRL: ${t.slice(0, 60)}`); continue; }
    return { reason: `excludes an item that can lower net income and is not in filings: "${t.slice(0, 90)}" (borrower input CNI:${cat} or CNI:${label || "<clause>"} accepted)` };
  }
  return { adjust, lower };
}
