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
import { metricInput, money, rationalFromString } from "../../contract-model/definition-execution";
import type { MetricInput } from "../../contract-model/runtime/types";
import type { FinancialValue, HeadroomInput, IssuerFinancials } from "./companyfacts";
import { evaluateDefinition, type DefinitionEvaluation } from "./definition-items";

export const XBRL_SOURCE_PREFIX = "sec-xbrl:";

type Family = "ASSETS" | "EBITDA" | "DEBT" | "INTEREST" | "CASH";

export function familyOfMetricName(name: string): Family | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (/tangible|net assets|current assets|fixed assets|eligible|receivable|inventor/i.test(n)) return null;
  if (/^(?:the\s+)?(?:consolidated\s+)?(?:total\s+)?(?:consolidated\s+)?assets$/i.test(n) || /^total consolidated assets$/i.test(n)) return "ASSETS";
  if (/^(?:consolidated\s+)?(?:adjusted\s+)?EBITDA$/i.test(n)) return "EBITDA";
  if (/^(?:consolidated\s+)?(?:total\s+)?(?:funded\s+)?(?:debt|indebtedness)$/i.test(n)) return "DEBT";
  if (/^(?:consolidated\s+)?(?:total\s+)?interest expense$/i.test(n)) return "INTEREST";
  if (/^(?:unrestricted\s+)?cash(?: and cash equivalents)?$/i.test(n)) return "CASH";
  return null;
}

const FAMILY_INPUT: Record<Family, HeadroomInput> = { ASSETS: "totalAssets", EBITDA: "reportedEbitdaBase", DEBT: "totalDebt", INTEREST: "interestExpense", CASH: "cash" };

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
  if (family === "EBITDA" || family === "INTEREST") {
    // Line-item evaluation of the agreement's own definition (definition-items.ts).
    const ev = evaluateDefinition(family, metricName, text, fin);
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
