/**
 * Bind XBRL financials to the metric names a computation actually asks for, ONLY where the agreement's own definition
 * is derivable from the filings. General rules (no per-issuer logic):
 *   - The name must map to a family by its words (assets / EBITDA / debt / interest expense / cash).
 *   - Its definition is looked up in the agreement text. A defined term whose definition carries any add-back,
 *     adjustment, pro forma or inclusion item not in the XBRL concept stays NEEDS_INPUT (the items are listed).
 *   - Undefined terms bind only for plain "total assets" (GAAP meaning). Everything else undefined stays NEEDS_INPUT.
 *   - EBITDA-family names never bind to the reported EBITDA base unless the definition is ONLY net income + interest +
 *     taxes + D&A with no adjustment items (and any defined net-income term it uses is itself unadjusted).
 *   - Net income / revenue are never bound (builders use cumulative contract net income, not TTM).
 */
import { metricInput, money, rationalFromString, type MetricInput } from "../../contract-model/definition-execution";
import type { FinancialValue, HeadroomInput, IssuerFinancials } from "./companyfacts";
import { evaluateDefinition, type DefinitionEvaluation } from "./definition-items";
import { optimizeConsolidatedEbitda, optimizerMetricBound } from "./ebitda-optimizer";

export const XBRL_SOURCE_PREFIX = "sec-xbrl:";

type Family = "TANGIBLE_ASSETS" | "ASSETS" | "EBITDA" | "DEBT" | "NET_DEBT" | "INTEREST" | "CASH" | "CAPITALIZATION" | "NET_WORTH";

export function familyOfMetricName(name: string): Family | null {
  // A possessive owner ("the Issuer's Consolidated Total Assets") names the same measure.
  const n = stripPossessiveOwner(name);
  if (/^(?:consolidated\s+)?(?:total\s+)?tangible\s+assets$/i.test(n)) return "TANGIBLE_ASSETS";
  if (/^(?:consolidated\s+)?tangible\s+net\s+worth$/i.test(n)) return "NET_WORTH";
  if (/tangible|net assets|current assets|fixed assets|eligible|receivable|inventor/i.test(n)) return null;
  if (/^(?:the\s+)?(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?assets$/i.test(n) || /^total consolidated assets$/i.test(n)) return "ASSETS";
  if (/^(?:(?:LTM|TTM|Trailing|Four\s+Quarter)\s+)?(?:consolidated\s+)?(?:adjusted\s+)?EBITDA$/i.test(n)) return "EBITDA";
  if (/^(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?(?:funded\s+)?(?:debt|indebtedness)$/i.test(n)) return "DEBT";
  if (/^(?:consolidated\s+)?(?:total\s+)?net\s+(?:funded\s+)?(?:debt|indebtedness)$/i.test(n)) return "NET_DEBT";
  if (/^(?:consolidated\s+)?(?:total\s+)?capitali[sz]ation$/i.test(n)) return "CAPITALIZATION";
  // Any other defined debt term ("Debt to Capitalization Ratio Indebtedness") is gated by its own definition; ranking
  // and security subsets never bind.
  if (/(?:Debt|Indebtedness)$/.test(n) && !/secured|lien|senior|subordinat|junior|non-?funding|net\b|recourse|vehicle|project|securiti/i.test(n)) return "DEBT";
  if (/^(?:consolidated\s+)?(?:tangible\s+)?(?:net\s+worth|(?:share|stock)holders[’']?\s+equity)$/i.test(n)) return "NET_WORTH";
  if (/^(?:consolidated\s+)?(?:total\s+)?interest expense$/i.test(n)) return "INTEREST";
  if (/^(?:unrestricted\s+)?cash(?: and cash equivalents)?$/i.test(n)) return "CASH";
  return null;
}

const FAMILY_INPUT: Record<Family, HeadroomInput> = { TANGIBLE_ASSETS: "totalAssets", ASSETS: "totalAssets", EBITDA: "reportedEbitdaBase", DEBT: "totalDebt", NET_DEBT: "totalDebt", INTEREST: "interestExpense", CASH: "cash", CAPITALIZATION: "totalDebt", NET_WORTH: "equity" };

/** Items that make a definition non-derivable from XBRL. Each match is reported as the NEEDS_INPUT reason. */
const NON_DERIVABLE: Array<[string, RegExp]> = [
  ["pro forma adjustment", /\bpro\s+forma\b/i],
  ["non-cash items", /\bnon-?cash\b/i],
  ["extraordinary / unusual / non-recurring items", /\b(?:extraordinary|unusual|non-?recurring|infrequent)\b/i],
  ["restructuring / transaction / integration costs", /\b(?:restructuring|transaction\s+(?:costs|expenses|fees)|integration|severance|synerg)/i],
  ["stock-based compensation", /\b(?:stock|equity)[- ]based\s+compensation\b/i],
  ["impairment / write-offs", /\b(?:impairment|write-?(?:offs?|downs?))\b/i],
  ["gains / losses on sales or hedges", /\b(?:gains?|loss(?:es)?)\s+(?:on|from|attributable)\b/i],
  ["acquisition / disposition adjustments", /\b(?:Permitted\s+Acquisition|acquired|disposed|acquisition|disposition)\b/i],
  ["unrestricted / excluded subsidiaries", /\bUnrestricted\s+Subsidiar|\bexcluded\s+subsidiar/i],
  ["guarantees / letters of credit / hedges", /\b(?:guarant|letters?\s+of\s+credit|hedg|swap\s+(?:contract|agreement)|derivative)/i],
  ["lease obligations", /\b(?:capital(?:ized)?|finance)\s+lease/i],
  ["deferred purchase price / earn-outs", /\b(?:deferred\s+purchase\s+price|earn-?outs?)\b/i],
  ["preferred / disqualified stock", /\b(?:Disqualified|preferred)\s+(?:Stock|Equity|Capital)/i],
  ["intangibles / goodwill", /\b(?:goodwill|intangible)/i],
  ["netting / exclusions", /\b(?:less|minus|net\s+of|excluding|other\s+than)\b/i],
  ["restrictions on cash", /\b(?:restricted|subject\s+to\s+(?:a\s+)?Lien|pledged|encumbered)\b/i],
];

const ENTITY: Record<string, string> = { ldquo: '"', rdquo: '"', quot: '"', nbsp: " ", amp: "&", rsquo: "'", lsquo: "'" };
function plain(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => {
      const c = n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      return c === 147 || c === 148 || c === 0x201c || c === 0x201d ? '"' : c === 160 ? " " : String.fromCharCode(c);
    })
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITY[n.toLowerCase()] ?? m)
    .replace(/[“”\u0093\u0094]/g, '"')
    .replace(/\s+/g, " ");
}

/** The agreement's own definition of `term` (from `"Term" means` to the next defined term), or null. */
/** Drop a leading "the Issuer's " / "Company's " owner so the defined measure name remains. */
function stripPossessiveOwner(name: string): string {
  return name.replace(/\s+/g, " ").trim().replace(/^(?:the\s+)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?['’]s\s+/, "");
}

export function findDefinition(text: string, term: string): string | null {
  const t = plain(text);
  const tryTerm = (term: string): string | null => {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const m = new RegExp(`"\\s*${esc}\\s*"\\s*(?:shall\\s+)?(?:mean|means|shall\\s+have\\s+the\\s+meaning)\\b`, "i").exec(t);
    if (!m) return null;
    // Same as findDefinitionText: long schedules exceed 6k; search the remainder for the next
    // defined-term opener (no 6k/2.5k cutoffs).
    const after = t.slice(m.index + m[0].length);
    const next = /"\s*[A-Z][^"]{1,80}"\s*(?:shall\s+)?(?:means?|has the meaning|shall have the meaning)\b/.exec(after);
    const end = next ? m[0].length + next.index : Math.min(m[0].length + after.length, 100_000);
    return t.slice(m.index, m.index + end).trim();
  };
  return tryTerm(term) ?? (() => { const s = stripPossessiveOwner(term); return s !== term ? tryTerm(s) : null; })();
}

export interface BindDecision {
  /** Capitalization = debt + equity: the lower-bounded debt term it grows with (a debt/capitalization ratio rises with it). */
  growsWith?: string;
  metricName: string; family: Family | null;
  /** LOWER_BOUND: bound at a value the true metric is at least (only unmapped add-backs remain). */
  status: "BOUND" | "LOWER_BOUND" | "NEEDS_INPUT";
  reason: string; definition: string | null; input?: FinancialValue;
  evaluation?: DefinitionEvaluation;
}

export function decide(metricName: string, text: string, fin: IssuerFinancials): BindDecision {
  const family = familyOfMetricName(metricName);
  if (!family) return { metricName, family, status: "NEEDS_INPUT", reason: "not a filing-derivable metric family", definition: null };
  if (family === "DEBT" || family === "NET_DEBT") return decideDebt(metricName, family, text, fin);
  if (family === "NET_WORTH") return decideNetWorth(metricName, text, fin);
  if (family === "ASSETS" || family === "TANGIBLE_ASSETS") { const d = decideAssets(metricName, family, text, fin); if (d) return d; }
  if (family === "TANGIBLE_ASSETS") return { metricName, family, status: "NEEDS_INPUT", reason: "tangible assets definition is not total assets less goodwill and intangibles", definition: findDefinition(text, metricName)?.slice(0, 400) ?? null };
  if (family === "CAPITALIZATION") return decideCapitalization(metricName, text, fin);
  if (family === "EBITDA" || family === "INTEREST") {
    // Line-item evaluation of the agreement's own definition (definition-items.ts). A trailing-period wrapper
    // ("LTM EBITDA" means Consolidated EBITDA for the most recent four fiscal quarters) is the wrapped term over the
    // same trailing four quarters the filings' TTM uses.
    let term = metricName;
    if (family === "EBITDA" && /^(?:LTM|TTM|Trailing|Four\s+Quarter)\s+/i.test(metricName)) {
      const w = findDefinition(text, metricName);
      const inner = w && /(?:four|4)\s+(?:\(\s*4\s*\)\s+)?(?:consecutive\s+)?(?:fiscal\s+)?quarters|twelve[- ]month|trailing/i.test(w) ? /"[^"]+"\s*(?:shall\s+)?means?\s*,?\s*(?:for\s+any\s+[^,]{0,60},\s*)?(?:the\s+)?((?:Consolidated\s+)?(?:Adjusted\s+)?EBITDA)\b/i.exec(w)?.[1] : null;
      if (!inner) return { metricName, family, status: "NEEDS_INPUT", reason: `trailing-period wrapper "${metricName}" does not read as the defined EBITDA over four quarters`, definition: w?.slice(0, 300) ?? null };
      term = inner;
    }
    const ev = evaluateDefinition(family, term, text, fin);
    // EBITDA family: the optimizer sizes the agreement's own schedule (caps, filing add-backs). MAXIMUM → exact;
    // a supported floor with no omitted two-sided line → lower bound. Anything weaker stays NEEDS_INPUT.
    if (family === "EBITDA" && ev.status !== "EXACT") {
      const ob = optimizerMetricBound(optimizeConsolidatedEbitda(term, text, fin));
      if (ob && (ob.status === "BOUND" || ev.status === "NEEDS_INPUT" || ev.value == null || BigInt(ob.value) > BigInt(ev.value))) {
        const input: FinancialValue = { metric: "reportedEbitdaBase", concept: `optimizer: ${metricName} (${ob.basis})`, periodType: "TTM", periodStart: null, periodEnd: fin.anchor ?? "", value: ob.value, unit: "USD",
          accession: [...new Set(fin.values.filter((v) => v.metric === "item").map((v) => v.accession))].slice(0, 1).join(""), form: "", filed: "", derivation: `EBITDA optimizer ${ob.basis}: ${ob.reason}` };
        return { metricName, family, status: ob.status, reason: `EBITDA optimizer ${ob.basis}: ${ob.reason}`, definition: null, input,
          evaluation: { kind: "EBITDA", term, status: ob.status === "BOUND" ? "EXACT" : "LOWER_BOUND", value: ob.value, base: null, items: [], missing: ob.missing, reason: ob.reason, periodEnd: fin.anchor ?? null } };
      }
    }
    if (ev.status === "NEEDS_INPUT" || ev.value == null) return { metricName, family, status: "NEEDS_INPUT", reason: ev.reason, definition: null, evaluation: ev };
    const input: FinancialValue = { metric: family === "EBITDA" ? "reportedEbitdaBase" : "interestExpense", concept: `parsed definition: ${metricName}`, periodType: "TTM", periodStart: null, periodEnd: ev.periodEnd ?? "", value: ev.value, unit: "USD",
      accession: [...new Set(fin.values.filter((v) => v.metric === "item").map((v) => v.accession))].slice(0, 1).join(""), form: "", filed: "", derivation: `${ev.status}: ${ev.base?.concept} ${ev.base?.value} ${ev.items.filter((i) => i.value !== "0").map((i) => `${BigInt(i.value) < 0n ? "-" : "+"} ${i.concepts.map((c) => c.concept).join("/")} ${i.value.replace("-", "")}`).join(" ")}` };
    return { metricName, family, status: ev.status === "EXACT" ? "BOUND" : "LOWER_BOUND", reason: ev.reason + (ev.missing.length ? `; not in XBRL: ${ev.missing.slice(0, 4).join(" | ")}` : ""), definition: null, input, evaluation: ev };
  }
  const input = fin.values.find((v) => v.metric === FAMILY_INPUT[family]);
  const def = findDefinition(text, metricName);
  if (!input) return { metricName, family, status: "NEEDS_INPUT", reason: `XBRL ${FAMILY_INPUT[family]} not derivable: ${fin.missing.find((m) => m.metric === FAMILY_INPUT[family])?.reason ?? "absent"}`, definition: def };
  if (!def) {
    // Only a lower-case (plain-language) "total assets" binds without a definition. A capitalized term is a defined
    // term whose definition is elsewhere (base agreement / indenture): NEEDS_INPUT until that definition is parsed.
    if (family === "ASSETS" && /^(?:the\s+)?(?:consolidated\s+)?total\s+assets$/.test(metricName)) return { metricName, family, status: "BOUND", reason: "plain-language total assets (not a defined term); GAAP balance-sheet total", definition: null, input };
    return { metricName, family, status: "NEEDS_INPUT", reason: "term is not defined in the agreement text; definition needed", definition: null };
  }
  const body = def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*/i, "");
  const hits = NON_DERIVABLE.filter(([, re]) => re.test(body)).map(([label]) => label);
  // "total assets", or "the assets and properties of X … determined on a consolidated basis in accordance with GAAP".
  const assetsLike = /total\s+assets/i.test(body) || (/\bassets\s+and\s+properties\b/i.test(body) && /in\s+accordance\s+with\s+GAAP/i.test(body));
  if (family === "ASSETS" && !assetsLike) hits.push("definition is not balance-sheet total assets");
  // Restricted-group totals and internal / month-end statements are not the consolidated filing figure.
  if (family === "ASSETS" && /\bRestricted\s+Subsidiar/i.test(body)) hits.push("restricted-group scope (filing is the whole consolidated group)");
  if (family === "ASSETS" && /\binternal\b|\bmonth-?end\b/i.test(body)) hits.push("internal / month-end statements, not the filed balance sheet");
  if (hits.length) return { metricName, family, status: "NEEDS_INPUT", reason: `definition has non-derivable items: ${[...new Set(hits)].join("; ")}`, definition: def.slice(0, 400) };
  return { metricName, family, status: "BOUND", reason: "definition is derivable from the XBRL concept", definition: def.slice(0, 400), input };
}

/** Debt the agreement's definition counts that consolidated XBRL debt may not: any of these make a filing figure no bound. */
const DEBT_NARROWING: Array<[string, RegExp]> = [
  ["unrestricted / excluded / non-recourse subsidiaries", /\bUnrestricted\s+Subsidiar|\bExcluded\s+Subsidiar|\bnon-?recourse|\bNon-?Guarantor/i],
  ["securitization / receivables financing", /\bsecuriti[sz]ation|\breceivables?\s+(?:financ|facilit|program)|\bfactoring/i],
  ["secured / lien / ranking subset", /\b(?:secured\s+by|that\s+is\s+secured|first\s+lien|second\s+lien|senior\s+secured|subordinated)\b/i],
  ["exclusion of borrowed money", /\b(?:excluding|exclusive\s+of|excluded\s+from|be\s+excluded|other\s+than|except|shall\s+not\s+include|does\s+not\s+include|but\s+not)\b[^.;]{0,140}\b(?:Indebtedness|Debt|borrow|notes|loans|bonds|debentures)/i],
  ["netting", /\b(?:minus|less|net\s+of|reduced\s+by)\b/i],
];

/**
 * Contract debt from filings, generically. The XBRL figure is long-term debt (current + noncurrent, carrying amount):
 * borrowed money of the consolidated group. When the agreement's definition counts at least that (borrowed money of
 * the consolidated group, with nothing carved out and no ranking subset), contract debt is AT LEAST the XBRL figure:
 * leases, letters of credit, guarantees and other items the definition adds only raise it. A premium in the carrying
 * amount, a narrowing, or a scope the filing does not report leaves it NEEDS_INPUT.
 * Net debt ("Debt minus unrestricted cash") is that lower bound minus total XBRL cash, which is at least the
 * unrestricted cash netted, so the difference is still a lower bound.
 */
function decideDebt(metricName: string, family: "DEBT" | "NET_DEBT", text: string, fin: IssuerFinancials, depth = 0): BindDecision {
  const na = (reason: string, definition: string | null = null): BindDecision => ({ metricName, family, status: "NEEDS_INPUT", reason, definition });
  const debt = fin.values.find((v) => v.metric === "totalDebt");
  if (!debt) return na(`XBRL totalDebt not derivable: ${fin.missing.find((m) => m.metric === "totalDebt")?.reason ?? "absent"}`);
  const prem = fin.values.find((v) => v.metric === "debtPremium");
  if (prem && BigInt(prem.value) > 0n) return na("XBRL carrying amount includes an unamortized premium (above principal)");
  const def = findDefinition(text, metricName);
  if (!def) return na("term is not defined in the agreement text; definition needed");
  const body = def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*/i, "");
  if (family === "NET_DEBT") {
    const m = /^([\s\S]*?)\b(?:minus|less|net\s+of|reduced\s+by)\b([\s\S]*)$/i.exec(body);
    if (!m) return na("net debt definition has no stated netting", def.slice(0, 400));
    if (!/\bcash\b/i.test(m[2]!) || !/\bunrestricted\b|\bnot\s+(?:subject\s+to\s+any\s+Lien|restricted)\b|\bfree\s+and\s+clear\b/i.test(m[2]!)) return na("netted cash is not limited to unrestricted cash", def.slice(0, 400));
    if (/\bmarketable\b|\bPermitted\s+Investments\b|\bTemporary\s+Cash\s+Investments\b|\bUnrestricted\s+Subsidiar/i.test(m[2]!)) return na("netting covers holdings the filing figure may not include", def.slice(0, 400));
    // The filing figure must be at least what the agreement nets. Plain cash is within XBRL cash and cash equivalents
    // (restricted cash is reported apart); "Cash Equivalents" / investments can run to a year, so they need the XBRL
    // total that includes short-term investments.
    const broad = /equivalents|investments?|securities/i.test(m[2]!);
    const cash = fin.values.find((v) => v.metric === (broad ? "cashAndShortTermInvestments" : "cash"));
    if (!cash) return na(broad ? "netted cash includes cash equivalents / investments; no XBRL cash + short-term investments figure" : "no XBRL cash at the balance-sheet instant");
    const inner = /((?:Consolidated\s+)?(?:Total\s+)?(?:Consolidated\s+)?(?:Funded\s+)?(?:Debt|Indebtedness))\b/.exec(m[1]!)?.[1];
    if (!inner || depth > 1) return na("gross debt term in the net debt definition not found", def.slice(0, 400));
    const gross = familyOfMetricName(inner) === "DEBT" && findDefinition(text, inner) ? decideDebt(inner, "DEBT", text, fin, depth + 1) : decideDebtBody(inner, m[1]!, def, text, debt);
    if (gross.status === "NEEDS_INPUT" || !gross.input) return na(`gross debt "${inner}": ${gross.reason}`, def.slice(0, 400));
    if (debt.periodEnd !== cash.periodEnd) return na("debt and cash are not at one balance-sheet instant");
    const value = (BigInt(gross.input.value) - BigInt(cash.value)).toString();
    const input: FinancialValue = { ...gross.input, concept: `${gross.input.concept} - ${cash.concept}`, value, accession: [...new Set([gross.input.accession, cash.accession])].join("+"),
      derivation: `${gross.input.derivation} minus ${cash.concept} ${cash.value} at ${cash.periodEnd} (XBRL figure >= unrestricted cash netted)` };
    return { metricName, family, status: "LOWER_BOUND", reason: `net debt lower bound: ${gross.reason}`, definition: def.slice(0, 400), input,
      evaluation: { kind: "EBITDA", term: metricName, status: "LOWER_BOUND", value, base: null, items: [], missing: [...(gross.evaluation?.missing ?? []), "cash netted is at most total XBRL cash"], reason: "net debt lower bound", periodEnd: debt.periodEnd } };
  }
  return decideDebtBody(metricName, body, def, text, debt);
}

function decideDebtBody(metricName: string, body: string, def: string, text: string, debt: FinancialValue): BindDecision {
  const na = (reason: string): BindDecision => ({ metricName, family: "DEBT", status: "NEEDS_INPUT", reason, definition: def.slice(0, 400) });
  const hits = DEBT_NARROWING.filter(([, re]) => re.test(body)).map(([l]) => l);
  if (hits.length) return na(`debt definition narrows what the filing reports: ${hits.join("; ")}`);
  // Scope: the consolidated group. "Restricted Subsidiaries" when the agreement has Unrestricted Subsidiaries is a subset.
  if (/\bRestricted\s+Subsidiar/i.test(body) && /"\s*Unrestricted\s+Subsidiary\s*"\s*(?:shall\s+)?means/i.test(text.replace(/[“”]/g, '"'))) return na("scope is the restricted group; the filing consolidates unrestricted subsidiaries");
  if (!/\bborrowed\s+money\b|\bIndebtedness\b|\bDebt\b|\bnotes\b|\bloans\b/i.test(body)) return na("debt definition does not count borrowed money");
  if (!/\bconsolidated\b|\bSubsidiaries\b/i.test(body)) return na("debt definition is not stated for the consolidated group");
  // A referenced "Indebtedness" / "Debt" definition must not carve out borrowed money either.
  for (const ref of ["Indebtedness", "Debt"]) {
    if (ref === metricName || !new RegExp(`\\b${ref}\\b`).test(body)) continue;
    const rd = findDefinition(text, ref);
    if (!rd) continue;
    const rhits = DEBT_NARROWING.filter((_, i) => i === 0 || i === 1 || i === 3).filter(([, re]) => re.test(rd)).map(([l]) => l);
    if (rhits.length) return na(`referenced "${ref}" definition narrows borrowed money: ${rhits.join("; ")}`);
  }
  if (/CapitalLease/i.test(debt.concept) && !/\b(?:capital(?:ized)?|finance)\s+lease|\bIndebtedness\b/i.test(body)) return na("XBRL debt includes lease obligations the definition does not count");
  const input: FinancialValue = { ...debt, derivation: `${debt.derivation} (carrying amount; contract debt counts at least this borrowed money)` };
  return { metricName, family: "DEBT", status: "LOWER_BOUND", reason: "definition counts the consolidated group's borrowed money with no carve-out; XBRL long-term debt is a lower bound", definition: def.slice(0, 400), input,
    evaluation: { kind: "EBITDA", term: metricName, status: "LOWER_BOUND", value: debt.value, base: null, items: [], missing: ["debt items beyond XBRL long-term debt (leases, letters of credit, guarantees, short-term borrowings)"], reason: "debt lower bound", periodEnd: debt.periodEnd } };
}

/**
 * Total assets (or total assets less goodwill and intangibles) of the whole consolidated group, as shown on the latest
 * balance sheet: exact from the XBRL instant. A pro forma proviso for testing a transaction does not change the
 * standing balance-sheet figure, so the definition is read up to it. Restricted-group scope, internal or month-end
 * statements, or any other adjustment → null (the generic rule decides, normally NEEDS_INPUT).
 */
function decideAssets(metricName: string, family: "ASSETS" | "TANGIBLE_ASSETS", text: string, fin: IssuerFinancials): BindDecision | null {
  const def = findDefinition(text, metricName);
  if (!def) return null;
  let body = def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*,?\s*/i, "");
  body = body.split(/[;,]?\s*(?:\(\s*)?(?:provided\b|and,?\s+in\s+the\s+case\s+of\s+any\s+determination|calculated\s+on\s+a\s+pro\s+forma|which\s+may\s+be\s+calculated\s+on\s+a\s+pro\s+forma|giving\s+pro\s+forma\s+effect|and\s+after\s+giving\b)/i)[0]!;
  body = body.replace(/^with\s+respect\s+to\s+any\s+Person(?:\s+as\s+of\s+any\s+date)?\s*,?\s*/i, "");
  body = body.replace(/^as\s+of\s+(?:any|the)\s+date(?:\s+of\s+determination)?\s*,?\s*/i, "");
  body = body.replace(/\s*,?\s*(?:delivered|filed|prepared)\s+pursuant\b[\s\S]*$/i, "");
  body = body.replace(/\s+for\s+which\b[\s\S]*$/i, "");
  if (/\bRestricted\s+Subsidiar|\binternal|\bmonth-?end\b|\bpro\s+forma|\bUnrestricted|\bexcluded?\s+subsidiar|\bForeign|\bDomestic|\bGuarantor|\bRegulated\s+Subsidiar/i.test(body)) return null;
  const tangible = family === "TANGIBLE_ASSETS";
  if (tangible) {
    if (!(/goodwill/i.test(body) && /intangible/i.test(body))) return null;
    if (/\bdeferred\s+financ|\bNon-Recourse|\bother\s+than\b|\bless\b[\s\S]*\band\s+\(\s*[2-9]\s*\)/i.test(body)) return null;
  } else if (/\b(?:less|minus|excluding|after\s+deducting)\b/i.test(body)) {
    return null;
  }
  // Strip owner + GAAP / balance-sheet wrappers; remainder must be "total assets" (+ less GI).
  let core = body;
  core = core.replace(/\bof\s+(?:the\s+)?(?:Company|Parent|Issuer|Borrower|Holdings|Parent\s+Guarantor)(?:\s+and\s+(?:its|their)\s+(?:consolidated\s+)?Subsidiaries)?\b/gi, " ");
  core = core.replace(/\bon\s+a\s+consolidated\s+basis\b/gi, " ");
  core = core.replace(/\bdetermined(?:\s+on\s+a\s+consolidated\s+basis)?(?:\s+in\s+accordance\s+with\s+GAAP)?\b/gi, " ");
  core = core.replace(/\bin\s+accordance\s+with\s+GAAP\b/gi, " ");
  core = core.replace(/\bas\s+of\s+such\s+date\b|\bat\s+such\s+date\b|\bof\s+such\s+Person\b/gi, " ");
  core = core.replace(/\bin\s+each\s+case(?:\s+that\s+is\s+or\s+would\s+be)?\b/gi, " ");
  core = core.replace(/\bthat\s+is\s+or\s+would\s+be\b/gi, " ");
  core = core.replace(/\b(?:as\s+)?(?:shown|reflected|set\s+forth)\s+on\s+(?:the\s+)?(?:most\s+recent(?:ly\s+(?:available|delivered))?\s+)?(?:consolidated\s+)?balance\s+sheet\b/gi, " ");
  core = core.replace(/\bas\s+at\s+(?:the\s+end\s+of\s+)?(?:the\s+)?most\s+recent(?:ly\s+ended)?\s+(?:fiscal\s+)?quarter\b/gi, " ");
  core = core.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const assetsCore = /^(?:the\s+)?(?:aggregate\s+amount\s+of\s+)?(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?(?:total\s+)?assets$/i;
  const tangCore = /^(?:the\s+)?(?:aggregate\s+amount\s+of\s+)?(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?(?:total\s+)?assets\s+(?:less|minus|excluding|after\s+deducting(?:\s+therefrom)?)\s+(?:the\s+sum\s+of\s+)?(?:the\s+)?(?:all\s+)?(?:goodwill|(?:other\s+)?intangible\s+assets)(?:\s*,?\s*and\s+(?:the\s+)?(?:all\s+)?(?:other\s+)?(?:goodwill|(?:other\s+)?intangible\s+assets))?$/i;
  if (tangible) { if (!tangCore.test(core)) return null; }
  else if (!assetsCore.test(core)) return null;
  const assets = fin.values.find((v) => v.metric === "totalAssets");
  if (!assets) return { metricName, family, status: "NEEDS_INPUT", reason: "no XBRL total assets", definition: def.slice(0, 400) };
  if (!tangible) return { metricName, family, status: "BOUND", reason: "definition is consolidated GAAP total assets on the latest balance sheet; exact from XBRL", definition: def.slice(0, 400), input: assets };
  const gw = fin.values.find((v) => v.metric === "goodwill"), ia = fin.values.find((v) => v.metric === "intangiblesExGoodwill");
  if (!gw || !ia) return { metricName, family, status: "NEEDS_INPUT", reason: "no XBRL goodwill and intangible assets at the balance-sheet instant", definition: def.slice(0, 400) };
  if (gw.periodEnd !== assets.periodEnd || ia.periodEnd !== assets.periodEnd) return { metricName, family, status: "NEEDS_INPUT", reason: "assets, goodwill and intangibles are not at one instant", definition: def.slice(0, 400) };
  const value = (BigInt(assets.value) - BigInt(gw.value) - BigInt(ia.value)).toString();
  return { metricName, family, status: "BOUND", reason: "definition is total assets less goodwill and intangibles; exact from XBRL", definition: def.slice(0, 400),
    input: { ...assets, concept: `${assets.concept} - ${gw.concept} - ${ia.concept}`, value, derivation: `${assets.concept} ${assets.value} - ${gw.concept} ${gw.value} - ${ia.concept} ${ia.value} at ${assets.periodEnd}` } };
}


/** Equity the agreement defines as GAAP shareholders' equity (optionally less goodwill and intangibles): exact from XBRL. */
function equityFrom(body: string, text: string, fin: IssuerFinancials): { input: FinancialValue } | { reason: string } {
  const nci = /non-?controlling|minority/i.test(body) && !/\b(?:excluding|other\s+than|less)\b[^.;]{0,40}(?:non-?controlling|minority)/i.test(body);
  const eq = fin.values.find((v) => v.metric === (nci ? "equityInclNci" : "equity"));
  if (!eq) return { reason: `no XBRL ${nci ? "equity including noncontrolling interests" : "stockholders' equity"} at the balance-sheet instant` };
  if (/\bRestricted\s+Subsidiar/i.test(body) && /"\s*Unrestricted\s+Subsidiary\s*"\s*(?:shall\s+)?means/i.test(text.replace(/[“”]/g, '"'))) return { reason: "scope is the restricted group; the filing consolidates unrestricted subsidiaries" };
  const tangible = /goodwill|intangible/i.test(body);
  // Anything beyond equity (and, for tangible net worth, goodwill and intangibles) is not in the filing figure.
  const rest = body.replace(/\([^)]*\)/g, " ").replace(/goodwill|intangibles?(?:\s+assets)?(?:\s*\(net\))?|net\s+of\s+amortization/gi, " ");
  if (/\bplus\b|\badd\b|\bexclud\w*|\bother\s+than\b|\bDisqualified\b|\btreasury\b|\baccumulated\s+other\s+comprehensive|\bmark-to-market|\bdeferred\b|\bpast\s+due|\bwrite-?(?:ups?|downs?)/i.test(rest)) return { reason: "net worth definition adjusts equity by items not in the filing figure" };
  if (!tangible) return { input: eq };
  const gw = fin.values.find((v) => v.metric === "goodwill"), ia = fin.values.find((v) => v.metric === "intangiblesExGoodwill");
  if (!gw || !ia) return { reason: "no XBRL goodwill and intangible assets at the balance-sheet instant" };
  if (gw.periodEnd !== eq.periodEnd || ia.periodEnd !== eq.periodEnd) return { reason: "equity, goodwill and intangibles are not at one instant" };
  return { input: { ...eq, concept: `${eq.concept}-${gw.concept}-${ia.concept}`, value: (BigInt(eq.value) - BigInt(gw.value) - BigInt(ia.value)).toString(), accession: [...new Set([eq.accession, gw.accession, ia.accession])].join("+"), derivation: `${eq.concept} ${eq.value} - ${gw.concept} ${gw.value} - ${ia.concept} ${ia.value} at ${eq.periodEnd}` } };
}

function decideNetWorth(metricName: string, text: string, fin: IssuerFinancials): BindDecision {
  const def = findDefinition(text, metricName);
  const plainName = /^(?:the\s+)?(?:consolidated\s+)?(?:total\s+)?(?:share|stock)holders[’']?\s+equity$/i.test(metricName);
  if (!def && !plainName) return { metricName, family: "NET_WORTH", status: "NEEDS_INPUT", reason: "term is not defined in the agreement text; definition needed", definition: null };
  const body = def ? def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*/i, "") : "total stockholders' equity determined on a consolidated basis in accordance with GAAP";
  if (!/\b(?:share|stock)holders[’']?\s+equity\b|\bnet\s+worth\b|total\s+assets[^.;]{0,40}(?:over|minus|less)[^.;]{0,20}total\s+liabilities/i.test(body)) return { metricName, family: "NET_WORTH", status: "NEEDS_INPUT", reason: "net worth definition is not balance-sheet equity", definition: def?.slice(0, 400) ?? null };
  const r = equityFrom(body.replace(/total\s+assets[^.;]{0,40}(?:over|minus|less)[^.;]{0,20}total\s+liabilities/i, "stockholders' equity"), text, fin);
  if ("reason" in r) return { metricName, family: "NET_WORTH", status: "NEEDS_INPUT", reason: r.reason, definition: def?.slice(0, 400) ?? null };
  return { metricName, family: "NET_WORTH", status: "BOUND", reason: "definition is GAAP equity (less goodwill and intangibles where stated); exact from XBRL", definition: def?.slice(0, 400) ?? null, input: r.input };
}

/** "Total Capitalization" = <debt term> + shareholders' equity: debt lower bound + exact equity, growing with that debt term. */
function decideCapitalization(metricName: string, text: string, fin: IssuerFinancials): BindDecision {
  const na = (reason: string, def: string | null = null): BindDecision => ({ metricName, family: "CAPITALIZATION", status: "NEEDS_INPUT", reason, definition: def });
  const def = findDefinition(text, metricName);
  if (!def) return na("term is not defined in the agreement text; definition needed");
  const body = def.replace(/^"[^"]+"\s*(?:shall\s+)?(?:means?|shall\s+have\s+the\s+meaning)\s*/i, "");
  const m = /\bsum\b[^.]*?(?:\(\s*(?:a|i|1|x)\s*\)\s*)?(?:the\s+)?([A-Z][A-Za-z ]{2,80}?(?:Debt|Indebtedness))\b([\s\S]*?)(?:\band\b|\bplus\b)\s*(?:\(\s*(?:b|ii|2|y)\s*\)\s*)?([\s\S]*)$/.exec(body);
  if (!m) return na("capitalization definition is not debt plus equity", def.slice(0, 400));
  const debtTerm = m[1]!.trim().replace(/^(?:aggregate\s+)?/i, "");
  const eqPart = m[3]!;
  if (/\bplus\b|\band\s+\(\s*(?:c|iii|3|z)\s*\)/i.test(eqPart)) return na("capitalization adds more than debt and equity", def.slice(0, 400));
  const debt = decideDebt(debtTerm, familyOfMetricName(debtTerm) === "NET_DEBT" ? "NET_DEBT" : "DEBT", text, fin);
  if (debt.status === "NEEDS_INPUT" || !debt.input) return na(`debt term "${debtTerm}": ${debt.reason}`, def.slice(0, 400));
  const eq = equityFrom(eqPart, text, fin);
  if ("reason" in eq) return na(eq.reason, def.slice(0, 400));
  if (BigInt(eq.input.value) <= 0n) return na("equity is not positive; capitalization ratio direction is not monotone", def.slice(0, 400));
  if (eq.input.periodEnd !== debt.input.periodEnd) return na("debt and equity are not at one balance-sheet instant", def.slice(0, 400));
  const value = (BigInt(debt.input.value) + BigInt(eq.input.value)).toString();
  const input: FinancialValue = { ...debt.input, concept: `${debt.input.concept}+${eq.input.concept}`, value, accession: [...new Set([debt.input.accession, eq.input.accession])].join("+"), derivation: `(${debt.input.derivation}) + ${eq.input.derivation}` };
  return { metricName, family: "CAPITALIZATION", status: "LOWER_BOUND", growsWith: debtTerm, reason: `capitalization = "${debtTerm}" (lower bound) + equity (exact)`, definition: def.slice(0, 400), input,
    evaluation: { kind: "EBITDA", term: metricName, status: "LOWER_BOUND", value, base: null, items: [], missing: debt.evaluation?.missing ?? [], reason: "capitalization lower bound", periodEnd: debt.input.periodEnd } };
}

export function toMetricInput(d: BindDecision): MetricInput | null {
  if (d.status === "NEEDS_INPUT" || !d.input) return null;
  const v = d.input;
  return metricInput(d.metricName, money(rationalFromString(v.value), "USD", { exprId: null, inputKeys: [v.metric], rawSource: v.value }),
    { source: `${XBRL_SOURCE_PREFIX}${v.accession}`, sourceVersion: v.filed, note: `${v.derivation} [${v.concept}, ${v.periodType} ending ${v.periodEnd}]` },
    // Period / as-of live in the provenance note: the computation's as-of is the package date, and the latest filed
    // period is what a current-capacity read uses. Binding them here would make every lookup miss.
    null, null);
}

/** Exact rescale of an XBRL (whole-USD) metric into USD_MILLIONS for clauses written in millions. Non-XBRL inputs are untouched. */
export function xbrlInUnit(m: MetricInput, wantMillions: boolean): MetricInput {
  if (!m.provenance.source?.startsWith(XBRL_SOURCE_PREFIX) || m.value.type !== "MONEY") return m;
  const isMillions = m.value.currency === "USD_MILLIONS";
  if (isMillions === wantMillions) return m;
  const rawSource = String((m.value as { lineage?: { rawSource?: unknown } }).lineage?.rawSource ?? "");
  if (!/^-?\d+$/.test(rawSource)) return m;
  const s = rawSource.replace("-", "");
  const sign = rawSource.startsWith("-") ? "-" : "";
  const millions = sign + (s.length > 6 ? s.slice(0, -6) : "0") + "." + s.padStart(7, "0").slice(-6);
  return { ...m, value: money(rationalFromString(wantMillions ? millions : rawSource), wantMillions ? "USD_MILLIONS" : "USD", { exprId: null, inputKeys: [m.metricKey], rawSource }) };
}
