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

export const XBRL_SOURCE_PREFIX = "sec-xbrl:";

type Family = "ASSETS" | "EBITDA" | "DEBT" | "NET_DEBT" | "INTEREST" | "CASH";

export function familyOfMetricName(name: string): Family | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (/tangible|net assets|current assets|fixed assets|eligible|receivable|inventor/i.test(n)) return null;
  if (/^(?:the\s+)?(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?assets$/i.test(n) || /^total consolidated assets$/i.test(n)) return "ASSETS";
  if (/^(?:(?:LTM|TTM|Trailing|Four\s+Quarter)\s+)?(?:consolidated\s+)?(?:adjusted\s+)?EBITDA$/i.test(n)) return "EBITDA";
  if (/^(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?(?:funded\s+)?(?:debt|indebtedness)$/i.test(n)) return "DEBT";
  if (/^(?:consolidated\s+)?(?:total\s+)?net\s+(?:funded\s+)?(?:debt|indebtedness)$/i.test(n)) return "NET_DEBT";
  if (/^(?:consolidated\s+)?(?:total\s+)?interest expense$/i.test(n)) return "INTEREST";
  if (/^(?:unrestricted\s+)?cash(?: and cash equivalents)?$/i.test(n)) return "CASH";
  return null;
}

const FAMILY_INPUT: Record<Family, HeadroomInput> = { ASSETS: "totalAssets", EBITDA: "reportedEbitdaBase", DEBT: "totalDebt", NET_DEBT: "totalDebt", INTEREST: "interestExpense", CASH: "cash" };

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
export function findDefinition(text: string, term: string): string | null {
  const t = plain(text);
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const m = new RegExp(`"\\s*${esc}\\s*"\\s*(?:shall\\s+)?(?:mean|means|shall\\s+have\\s+the\\s+meaning)\\b`, "i").exec(t);
  if (!m) return null;
  const rest = t.slice(m.index, m.index + 6000);
  const next = /"\s*[A-Z][^"]{1,80}"\s*(?:shall\s+)?(?:means?|has the meaning|shall have the meaning)\b/.exec(rest.slice(m[0].length));
  return rest.slice(0, next ? m[0].length + next.index : 2500).trim();
}

export interface BindDecision {
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
  if (hits.length) return { metricName, family, status: "NEEDS_INPUT", reason: `definition has non-derivable items: ${[...new Set(hits)].join("; ")}`, definition: def.slice(0, 400) };
  return { metricName, family, status: "BOUND", reason: "definition is derivable from the XBRL concept", definition: def.slice(0, 400), input };
}

/** Debt the agreement's definition counts that consolidated XBRL debt may not: any of these make a filing figure no bound. */
const DEBT_NARROWING: Array<[string, RegExp]> = [
  ["unrestricted / excluded / non-recourse subsidiaries", /\bUnrestricted\s+Subsidiar|\bExcluded\s+Subsidiar|\bnon-?recourse|\bNon-?Guarantor/i],
  ["securitization / receivables financing", /\bsecuriti[sz]ation|\breceivables?\s+(?:financ|facilit|program)|\bfactoring/i],
  ["secured / lien / ranking subset", /\b(?:secured\s+by|that\s+is\s+secured|first\s+lien|second\s+lien|senior\s+secured|subordinated)\b/i],
  ["exclusion of borrowed money", /\b(?:excluding|exclusive\s+of|other\s+than|except|shall\s+not\s+include|does\s+not\s+include|but\s+not)\b[^.;]{0,140}\b(?:Indebtedness|Debt|borrow|notes|loans|bonds|debentures)/i],
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
