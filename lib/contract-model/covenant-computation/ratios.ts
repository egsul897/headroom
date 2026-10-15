/**
 * Contract-defined ratio computation on the Phase-4A spine.
 *
 * A ratio is computed only when the bound documents contain a
 * "means the ratio of … to …" definition. Otherwise NEEDS_INPUT (named
 * but undefined) or UNKNOWN (not named). Interest coverage is never
 * substituted for fixed-charge coverage.
 */

import type { IRExpression, SourceProvenance } from "../ir/types";
import { fixtureInputResolver } from "../runtime/input-resolver";
import { evaluateLeverageOrCoverageRatio } from "../runtime/leverage-ratio";
import { rational, rationalFromNumber, rationalFromString, subtract, toCanonicalString } from "../runtime/decimal";
import type { MetricInput, SerializedRuntimeValue } from "../runtime/types";
import type { EvaluationResult } from "../runtime/types";
import { classifyRatioIncurrencePermission } from "../compiler/ratio-incurrence/classify";
import type {
  BasketClause,
  CitedAmount,
  ComputationPackage,
  ComputationStatus,
  ComputedRatio,
  PackageDocument,
  RatioDirection,
  RatioKey,
  RatioThreshold,
} from "./types";
import { CERTIFICATION } from "./types";
import { citedIn, norm } from "./text";
import { plainText } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { clauseRatioTerm, clauseRatioThreshold } from "./ratio-terms";
import type { BoundInputs } from "./bind-inputs";

interface CatalogEntry {
  ratioKey: RatioKey;
  displayName: string;
  names: readonly string[];
  kind: "LEVERAGE" | "COVERAGE";
}

export const RATIO_CATALOG: readonly CatalogEntry[] = [
  { ratioKey: "TOTAL_NET_LEVERAGE", displayName: "Total Net Leverage Ratio", names: ["Total Net Leverage Ratio", "Consolidated Total Net Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "TOTAL_GROSS_LEVERAGE", displayName: "Total Leverage Ratio", names: ["Total Leverage Ratio", "Consolidated Total Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "SECURED_NET_LEVERAGE", displayName: "Secured Net Leverage Ratio", names: ["Secured Net Leverage Ratio", "Consolidated Secured Net Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "SECURED_GROSS_LEVERAGE", displayName: "Secured Leverage Ratio", names: ["Secured Leverage Ratio", "Consolidated Secured Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "FIRST_LIEN_NET_LEVERAGE", displayName: "First Lien Net Leverage Ratio", names: ["First Lien Net Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "FIRST_LIEN_GROSS_LEVERAGE", displayName: "First Lien Leverage Ratio", names: ["First Lien Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "FIXED_CHARGE_COVERAGE", displayName: "Fixed Charge Coverage Ratio", names: ["Fixed Charge Coverage Ratio", "Consolidated Fixed Charge Coverage Ratio"], kind: "COVERAGE" },
  { ratioKey: "INTEREST_COVERAGE", displayName: "Interest Coverage Ratio", names: ["Interest Coverage Ratio", "Consolidated Interest Coverage Ratio"], kind: "COVERAGE" },
  { ratioKey: "LEVERAGE", displayName: "Leverage Ratio", names: ["Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "SENIOR_LEVERAGE", displayName: "Senior Leverage Ratio", names: ["Senior Leverage Ratio"], kind: "LEVERAGE" },
  { ratioKey: "NET_LEVERAGE", displayName: "Net Leverage Ratio", names: ["Net Leverage Ratio"], kind: "LEVERAGE" },
];


interface ParsedDefinition {
  ratioName: string;
  excerpt: string;
  documentId: string;
  numeratorMetrics: string[];
  subtrahendMetrics: string[];
  denominatorMetrics: string[];
}

export function computeRatios(pkg: ComputationPackage, bound: BoundInputs): ComputedRatio[] {
  const definitions = pkg.documents.flatMap((doc) => parseDefinitions(doc));
  const catalog = catalogWith(definitions);
  const thresholds = collectThresholds(pkg, catalog);
  return catalog.map((entry) =>
    computeOne(pkg, entry, definitions, thresholds, bound, catalog),
  );
}

/**
 * The static catalog plus every ratio the agreement itself defines ("“Total Secured Leverage Ratio” means the ratio
 * of …") under a name no static entry carries. Each defined ratio is its own entry, keyed by its own name.
 */
export function catalogWith(definitions: readonly ParsedDefinition[]): CatalogEntry[] {
  const out: CatalogEntry[] = [...RATIO_CATALOG];
  for (const d of definitions) {
    if (out.some((e) => e.names.some((n) => namesEqual(n, d.ratioName)))) continue;
    out.push({ ratioKey: `DEFINED:${d.ratioName.replace(/\s+/g, " ")}`, displayName: d.ratioName, names: [d.ratioName], kind: /coverage|interest|fixed\s+charge/i.test(d.ratioName) ? "COVERAGE" : "LEVERAGE" });
  }
  return out;
}

function computeOne(
  pkg: ComputationPackage,
  entry: CatalogEntry,
  definitions: ParsedDefinition[],
  thresholds: Map<RatioKey, RatioThreshold[]>,
  bound: BoundInputs,
  catalog: readonly CatalogEntry[] = RATIO_CATALOG,
): ComputedRatio {
  const stableKey = `${pkg.packageKey}:${entry.ratioKey}`;
  const named = pkg.documents.find((doc) => entry.names.some((name) => nameAppears(doc.text, name, catalog)));
  const definition = definitions.find((d) => entry.names.some((name) => namesEqual(d.ratioName, name)));
  const entryThresholds = thresholds.get(entry.ratioKey) ?? [];
  const refused = refusedReported(entry, bound);

  if (!named && !definition) {
    return empty(stableKey, entry, "UNKNOWN", "Ratio name is not in the bound package texts.", entryThresholds, refused);
  }
  if (!definition) {
    return empty(
      stableKey,
      entry,
      "NEEDS_INPUT",
      "The ratio is named, but no 'means the ratio of … to …' definition is in the bound texts.",
      entryThresholds.map((t) => ({ ...t, headroomStatus: "NEEDS_INPUT", headroomCanonical: null })),
      refused,
      ["contract definition"],
    );
  }

  const required = [...definition.numeratorMetrics, ...definition.subtrahendMetrics, ...definition.denominatorMetrics];
  const unbound = required.filter((name) => !bound.metrics.some((metric) => metric.metricKey.toLowerCase() === name.toLowerCase()));
  const malformed = definition.numeratorMetrics.length !== 1 || definition.denominatorMetrics.length !== 1;
  if (malformed || unbound.length > 0) {
    const missing = malformed ? ["definition arithmetic", ...unbound] : unbound;
    return {
      ...empty(
        stableKey,
        entry,
        "NEEDS_INPUT",
        malformed
          ? "Definition is cite-bound, but the ratio-of sentence is not one numerator over one denominator. No proxy was substituted."
          : `Definition is cite-bound. Unbound operands: ${unbound.join(", ")}. No proxy was substituted.`,
        entryThresholds.map((t) => ({ ...t, headroomStatus: "NEEDS_INPUT", headroomCanonical: null })),
        refused,
        missing,
      ),
      definitionExcerpt: definition.excerpt,
      definitionDocumentId: definition.documentId,
    };
  }

  const expression = buildExpression(pkg, definition, bound.metrics);
  const evaluation = evaluateLeverageOrCoverageRatio({
    expression,
    ratioKind: entry.kind,
    inputs: fixtureInputResolver({ metrics: bound.metrics }),
    context: { companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, asOf: pkg.asOf },
  });
  const status = statusOf(evaluation);
  const canonical = status === "COMPUTED" ? canonicalOf(evaluation.value) : null;
  const numerator = citedMetrics(
    [definition.numeratorMetrics[0]!, ...definition.subtrahendMetrics],
    bound.metrics,
    definition.documentId,
  );
  const denominator = citedMetrics(definition.denominatorMetrics, bound.metrics, definition.documentId);
  const withHeadroom = entryThresholds.map((t) => attachHeadroom(t, canonical));

  return {
    stableKey,
    ratioKey: entry.ratioKey,
    displayName: entry.displayName,
    status,
    certification: CERTIFICATION,
    canonical,
    numerator,
    denominator,
    definitionExcerpt: definition.excerpt,
    definitionDocumentId: definition.documentId,
    expression,
    missingInputs: status === "COMPUTED" ? [] : evaluation.missingInputs.map((m) => m.key),
    thresholds: withHeadroom,
    refusedReported: refused,
    note:
      status === "COMPUTED"
        ? "Evaluated with evaluateLeverageOrCoverageRatio. Not certified."
        : "Definition is cite-bound; one or more operands are not bound. No proxy was substituted.",
  };
}

function empty(
  stableKey: string,
  entry: CatalogEntry,
  status: ComputationStatus,
  note: string,
  thresholds: RatioThreshold[],
  refused: ComputedRatio["refusedReported"],
  missingInputs: string[] = [],
): ComputedRatio {
  return {
    stableKey,
    ratioKey: entry.ratioKey,
    displayName: entry.displayName,
    status,
    certification: CERTIFICATION,
    canonical: null,
    numerator: [],
    denominator: [],
    definitionExcerpt: null,
    definitionDocumentId: null,
    expression: null,
    missingInputs,
    thresholds,
    refusedReported: refused,
    note,
  };
}

function refusedReported(entry: CatalogEntry, bound: BoundInputs): ComputedRatio["refusedReported"] {
  if (entry.ratioKey !== "TOTAL_NET_LEVERAGE") return null;
  const reported = bound.reportedRatios.find((r) => r.family === "LEVERAGE_RATIO");
  if (!reported) return null;
  return {
    canonical: reported.canonical,
    citationExcerpt: reported.citationExcerpt,
    sourceDocumentId: reported.sourceDocumentId,
    reason: "Certificate-reported leverage is not a contract-defined calculation.",
  };
}

const RATIO_HEADER = /[“"]\s*([A-Z][^"”]{2,120}?\bRatio)\s*[”"]\s*(?:shall\s+mean|means)\b/g;
const NEXT_DEFINITION = /[“"]\s*[A-Z][^"”]{1,120}[”"]\s*(?:shall\s+(?:mean|have\s+the\s+meaning)|means|has\s+the\s+meaning)\b/;

export function parseDefinitions(doc: PackageDocument): ParsedDefinition[] {
  const text = norm(plainText(doc.text));
  const header = new RegExp(RATIO_HEADER.source, "g");
  const out: ParsedDefinition[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text)) !== null) {
    const ratioName = match[1]!.replace(/\s+/g, " ").trim();
    let window = text.slice(match.index, Math.min(text.length, match.index + 4000));
    const next = NEXT_DEFINITION.exec(window.slice(match[0].length));
    if (next) window = window.slice(0, match[0].length + next.index);
    const ratioAt = window.search(/\bthe\s+(?:ratio|quotient)\s+(?:of|obtained\s+by\s+dividing)\b/i);
    if (ratioAt < 0 || ratioAt > 600) continue;
    const after = window.slice(ratioAt);
    // "the ratio of (a) X to (b) Y", "the quotient obtained by dividing (x) X by (y) Y", or un-enumerated "X to Y".
    const lead = String.raw`\bthe\s+(?:ratio|quotient)\s+(?:of|obtained\s+by\s+dividing)\s+`;
    const split = after.match(new RegExp(`${lead}([\\s\\S]*?)\\s+(?:to|by|divided\\s+by)\\s+(\\((?:y|ii|2|b|B|II)\\))`))
      ?? after.match(new RegExp(`${lead}([\\s\\S]{3,400}?)\\s+(?:to|divided\\s+by)\\s+()(?=(?:the\\s+)?(?:Consolidated\\s+)?(?:[A-Z][A-Za-z\\-]*\\s+){0,4}(?:EBITDA\\w*|EBIT|Interest|Fixed\\s+Charges|Debt|Indebtedness|Capitalization|Assets|Net\\s+Worth|Income|Cash\\s+Flow)\\b)`));
    if (!split || split.index == null || !split[1]) continue;
    const numeratorRaw = split[1].trim();
    const denominatorStart = split.index + split[0].length;
    const rest = after.slice(denominatorStart);
    let end = sentenceEnd(rest);
    if (end < 0) end = rest.length;
    const denominatorRaw = rest.slice(0, end).trim();
    // "the excess of (i) Debt over (ii) Unrestricted Cash" is Debt minus Cash.
    const minusAt = numeratorRaw.search(/\b(?:minus|less|over)\b/i);
    const left = minusAt < 0 ? numeratorRaw : numeratorRaw.slice(0, minusAt);
    const right = minusAt < 0 ? "" : numeratorRaw.slice(minusAt);
    const denominatorHead = denominatorRaw.split(/\bpro\s+forma\b|\bfor\s+(?:the|such|any|each)\b|\bas\s+of\b|\bin\s+each\s+case\b|[;,]/i)[0] ?? denominatorRaw;
    const excerpt = window.slice(0, ratioAt + denominatorStart + end + 1).trim();
    out.push({
      ratioName,
      excerpt,
      documentId: doc.documentId,
      numeratorMetrics: metricsIn(left, text),
      subtrahendMetrics: metricsIn(right, text),
      denominatorMetrics: metricsIn(denominatorHead, text),
    });
    header.lastIndex = match.index + Math.max(excerpt.length, 1);
  }
  return out;
}

function sentenceEnd(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ".") continue;
    if (i > 0 && /\d/.test(text[i - 1]!)) continue;
    const tail = text.slice(i + 1, i + 3);
    if (tail.length === 0 || /^\s/.test(tail)) return i;
  }
  return -1;
}

const FINANCIAL_HEAD = /(?:Debt|Indebtedness|EBITDA\w*|EBIT|Interest(?:\s+Expense|\s+Charges)?|Expense|Charges|Income|Cash(?:\s+Equivalents)?|Assets|Liabilities|Obligations|Rentals?|Capitalization|Net\s+Worth|Revenues?|Cash\s+Flow|Amount)$/;
const NOT_OPERAND = /^(?:the|a|an|such|any|each|all|on|of|to|by)\s+/i;

/**
 * The defined-term operands of one side of a ratio, generically: each run of capitalized words ("Consolidated Total
 * Net Debt", "Consolidated EBITDA") that ends in a financial head noun. A run joined by "and" / "of" is kept whole when
 * the whole run is itself a defined term in the document ("Cash and Cash Equivalents").
 */
function metricsIn(phrase: string, docText = ""): string[] {
  // Parenthetical qualifiers ("(exclusive of Indebtedness under …)") are not operands.
  let flat = phrase, prev = "";
  while (flat !== prev) { prev = flat; flat = flat.replace(/\((?![ivxlIVXL]{1,5}\)|[a-zA-Z]{1,2}\)|\d{1,2}\))[^()]{3,}\)/g, " "); }
  // A side that narrows its debt by security or ranking ("Indebtedness that is secured by a Lien") names a subset the
  // term alone does not: it is not one plain operand.
  const qualified = /\b(?:that\s+is|which\s+is|to\s+the\s+extent)\s+(?:secured|subordinated)|\bsecured\s+by\b|\bsecured\s+on\b/i.test(flat);
  const cleaned = flat.replace(/\((?:[ivxlIVXL]{1,5}|[a-zA-Z]{1,2}|\d{1,2})\)/g, " ").replace(/\s+/g, " ");
  const out: string[] = [];
  const run = /(?:[A-Z][A-Za-z\-]*|EBITDA\w*)(?:\s+(?:(?:and|of|to)\s+)?(?:[A-Z][A-Za-z\-]*|EBITDA\w*))*/g;
  for (const m of cleaned.matchAll(run)) {
    let term = m[0].replace(NOT_OPERAND, "").trim();
    const defined = (t: string) => docText && new RegExp(`[“"]\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\s*[”"]\\s*(?:shall\\s+)?(?:mean|means|has\\s+the\\s+meaning)`, "i").test(docText);
    if (/\s(?:and|of|to)\s/.test(term) && !defined(term)) {
      // Keep the parts that are operands on their own.
      for (const part of term.split(/\s+(?:and|of|to)\s+/)) if (FINANCIAL_HEAD.test(part) && !/^(?:the|The)$/.test(part)) out.push(part);
      continue;
    }
    if (FINANCIAL_HEAD.test(term) && !/^(?:Amount)$/.test(term)) out.push(term);
  }
  const terms = [...new Set(out)];
  return qualified && !terms.some((t) => /secured|lien|senior/i.test(t)) ? [...terms, "(qualified subset)"] : terms;
}

function boundKey(name: string, metrics: readonly MetricInput[]): string {
  return metrics.find((metric) => metric.metricKey.toLowerCase() === name.toLowerCase())?.metricKey ?? name;
}

function buildExpression(pkg: ComputationPackage, definition: ParsedDefinition, metrics: readonly MetricInput[]): IRExpression {
  const p: SourceProvenance = {
    documentId: definition.documentId,
    sourceNodeKey: null,
    sourceCitation: definition.ratioName,
    excerpt: definition.excerpt,
  };
  const minuend = metricRef(pkg, boundKey(definition.numeratorMetrics[0]!, metrics), `${definition.ratioName}:num`, p);
  const subtrahend = definition.subtrahendMetrics.length
    ? sumOf(pkg, definition.subtrahendMetrics.map((name) => boundKey(name, metrics)), `${definition.ratioName}:sub`, p)
    : null;
  const numerator: IRExpression = subtrahend
    ? {
        kind: "SUBTRACT",
        type: "MONEY",
        left: minuend,
        right: subtrahend,
        exprId: `cc:${definition.ratioName}:net`,
        provenance: p,
      }
    : minuend;
  return {
    kind: "DIVIDE",
    type: "RATIO",
    numerator,
    denominator: metricRef(pkg, boundKey(definition.denominatorMetrics[0]!, metrics), `${definition.ratioName}:den`, p),
    exprId: `cc:${definition.ratioName}:ratio`,
    provenance: p,
  };
}

function sumOf(pkg: ComputationPackage, names: string[], exprId: string, p: SourceProvenance): IRExpression {
  if (names.length === 1) return metricRef(pkg, names[0]!, exprId, p);
  return {
    kind: "SUM",
    type: "MONEY",
    operands: names.map((name, index) => metricRef(pkg, name, `${exprId}:${index}`, p)),
    exprId: `cc:${exprId}`,
    provenance: p,
  };
}

function metricRef(pkg: ComputationPackage, name: string, exprId: string, p: SourceProvenance): IRExpression {
  return {
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName: name,
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    resolvedDefinitionId: null,
    exprId: `cc:${exprId}`,
    provenance: p,
  };
}

function citedMetrics(names: readonly string[], metrics: readonly MetricInput[], documentId: string): CitedAmount[] {
  const out: CitedAmount[] = [];
  for (const name of names) {
    const metric = metrics.find((item) => item.metricKey.toLowerCase() === name.toLowerCase());
    if (!metric || metric.value.type !== "MONEY") continue;
    out.push({
      metricName: metric.metricKey,
      canonical: toCanonicalString(metric.value.amount),
      currency: metric.value.currency,
      citationExcerpt: metric.provenance.note ?? name,
      sourceDocumentId: metric.provenance.source || documentId,
    });
  }
  return out;
}

function collectThresholds(pkg: ComputationPackage, catalog: readonly CatalogEntry[] = RATIO_CATALOG): Map<RatioKey, RatioThreshold[]> {
  const map = new Map<RatioKey, RatioThreshold[]>();
  for (const basket of pkg.baskets) {
    // The full ratio term in the clause and one stated threshold (shared with ratio-based baskets).
    const term = clauseRatioTerm(basket.operativeText);
    if (!term) continue;
    const t = clauseRatioThreshold(basket.operativeText);
    if (!t) continue;
    const entry = catalog.find((c) => c.names.some((n) => namesEqual(n, term)));
    if (!entry) continue;
    const direction: RatioDirection = t.comparator === "AT_LEAST" || t.comparator === "GREATER_THAN" ? "MIN" : "MAX";
    const canonical = toCanonicalString(
      rational(
        rationalFromNumber(t.num).num * rationalFromNumber(t.den).den,
        rationalFromNumber(t.den).num * rationalFromNumber(t.num).den,
      ),
    );
    const row: RatioThreshold = {
      sectionRef: basket.sectionRef,
      sourceDocumentId: basket.documentId,
      citationExcerpt: basket.operativeText,
      raw: t.raw,
      canonical,
      direction,
      comparator: t.comparator,
      headroomStatus: "NEEDS_INPUT",
      headroomCanonical: null,
    };
    const list = map.get(entry.ratioKey) ?? [];
    list.push(row);
    map.set(entry.ratioKey, list);
  }
  return map;
}

export function attachHeadroom(threshold: RatioThreshold, actualCanonical: string | null): RatioThreshold {
  if (!actualCanonical) return { ...threshold, headroomStatus: "NEEDS_INPUT", headroomCanonical: null };
  const actual = parseCanonical(actualCanonical);
  const limit = parseCanonical(threshold.canonical);
  const headroom = threshold.direction === "MAX" ? subtract(limit, actual) : subtract(actual, limit);
  return { ...threshold, headroomStatus: "COMPUTED", headroomCanonical: toCanonicalString(headroom) };
}

export function parseCanonical(text: string) {
  if (text.includes("/")) {
    const [n, d] = text.split("/");
    if (!n || !d) throw new Error(`bad canonical ${text}`);
    return rational(BigInt(n), BigInt(d));
  }
  return rationalFromString(text);
}

export function canonicalOf(value: SerializedRuntimeValue | null): string | null {
  if (!value) return null;
  if (value.type === "MONEY") return value.amount;
  if (value.type === "RATIO" || value.type === "NUMBER") return value.value;
  if (value.type === "PERCENT") return value.fraction;
  if (value.type === "CAPACITY" && value.capacity.kind === "AMOUNT") return value.capacity.amount;
  return null;
}

function statusOf(evaluation: EvaluationResult): ComputationStatus {
  return evaluation.status === "EXECUTABLE" && evaluation.value ? "COMPUTED" : "NEEDS_INPUT";
}

function nameAppears(text: string, name: string, catalog: readonly CatalogEntry[] = RATIO_CATALOG): boolean {
  const names = catalog.flatMap((entry) => [...entry.names]);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "gi");
  for (const match of text.matchAll(re)) {
    if (match.index == null) continue;
    const buried = names.some((other) => {
      if (other.length <= name.length || !other.toLowerCase().endsWith(name.toLowerCase())) return false;
      const from = match.index! - (other.length - name.length);
      if (from < 0) return false;
      return text.slice(from, match.index! + name.length).toLowerCase() === other.toLowerCase();
    });
    if (buried) continue;
    // Part of a longer capitalized term the catalog does not list ("Consolidated First Lien Net Leverage Ratio",
    // "Senior Secured Leverage Ratio"): the shorter ratio is not named by that mention.
    const prev = /([A-Z][A-Za-z'’\-]*)\s+$/.exec(text.slice(Math.max(0, match.index - 40), match.index));
    if (prev && !NAME_LEADERS.test(prev[1]!)) continue;
    return true;
  }
  return false;
}

const NAME_LEADERS = /^(?:Consolidated|The|If|So|Such|Any|Each|Its|Their|Our|Pro|Forma|Basis|Borrower(?:'s|’s)?|Company(?:'s|’s)?|Section|Article|A|An|In|On|At|For|When|Where|Whether|Until|Unless|While|Upon|As|By|To|Of|Under|With|Without|No|Neither|Nor|Then|After|Before|And|Or|But|Applicable|Maximum|Minimum|Financial|Covenant|Covenants)$/;

/** Equal up to whitespace, case and a leading "Consolidated" ("Consolidated Leverage Ratio" = "Leverage Ratio"). */
export function namesEqual(a: string, b: string): boolean {
  const c = (x: string) => norm(x).toLowerCase().replace(/^consolidated\s+/, "");
  return c(a) === c(b);
}

export function documentContaining(documents: readonly PackageDocument[], excerpt: string): PackageDocument | undefined {
  return documents.find((d) => citedIn(d.text, excerpt));
}
