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
import { parseCovenantLevel } from "./covenant-levels";
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

/** Longest first is not required; overlap is dropped in metricsIn. */
const OPERANDS = [
  "Consolidated Fixed Charges",
  "Consolidated Interest Expense",
  "Consolidated EBITDA",
  "Eligible Cash Equivalents",
  "Unrestricted Cash",
  "First Lien Debt",
  "Net Indebtedness",
  "Senior Indebtedness",
  "Secured Debt",
  "Net Debt",
  "Interest Expense",
  "Total Assets",
  "EBITDA",
] as const;

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
  const thresholds = collectThresholds(pkg);
  return RATIO_CATALOG.map((entry) =>
    computeOne(pkg, entry, definitions, thresholds, bound),
  );
}

function computeOne(
  pkg: ComputationPackage,
  entry: CatalogEntry,
  definitions: ParsedDefinition[],
  thresholds: Map<RatioKey, RatioThreshold[]>,
  bound: BoundInputs,
): ComputedRatio {
  const stableKey = `${pkg.packageKey}:${entry.ratioKey}`;
  const named = pkg.documents.find((doc) => entry.names.some((name) => nameAppears(doc.text, name)));
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

export function parseDefinitions(doc: PackageDocument): ParsedDefinition[] {
  const text = norm(doc.text);
  const header = /[“"]([^"”]{3,140})[”"]\s+(?:shall\s+mean|means)\b/gi;
  const out: ParsedDefinition[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text)) !== null) {
    const ratioName = match[1]!.replace(/\s+/g, " ").trim();
    if (!RATIO_CATALOG.some((entry) => entry.names.some((name) => namesEqual(name, ratioName)))) continue;
    const window = text.slice(match.index, Math.min(text.length, match.index + 4000));
    const ratioAt = window.search(/\bthe\s+ratio\s+of\b/i);
    if (ratioAt < 0 || ratioAt > 500) continue;
    const after = window.slice(ratioAt);
    const split = after.match(/\bthe\s+ratio\s+of\s+([\s\S]*?)\s+to\s+(\((?:y|ii|2|b)\))/i);
    if (!split || split.index == null || !split[1]) continue;
    const numeratorRaw = split[1].trim();
    const denominatorStart = split.index + split[0].length;
    const rest = after.slice(denominatorStart);
    const end = sentenceEnd(rest);
    if (end < 0) continue;
    const denominatorRaw = rest.slice(0, end).trim();
    const minusAt = numeratorRaw.search(/\b(?:minus|less)\b/i);
    const left = minusAt < 0 ? numeratorRaw : numeratorRaw.slice(0, minusAt);
    const right = minusAt < 0 ? "" : numeratorRaw.slice(minusAt);
    const denominatorHead = denominatorRaw.split(/\bpro\s+forma\b/i)[0] ?? denominatorRaw;
    const excerpt = window.slice(0, ratioAt + denominatorStart + end + 1).trim();
    out.push({
      ratioName,
      excerpt,
      documentId: doc.documentId,
      numeratorMetrics: metricsIn(left),
      subtrahendMetrics: metricsIn(right),
      denominatorMetrics: metricsIn(denominatorHead),
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

function metricsIn(phrase: string): string[] {
  const hits: Array<{ index: number; name: string }> = [];
  for (const name of OPERANDS) {
    const re = new RegExp(`(?<![A-Za-z])${name.replace(/\s+/g, "\\s+")}(?![A-Za-z])`, "gi");
    for (const match of phrase.matchAll(re)) {
      if (match.index == null) continue;
      hits.push({ index: match.index, name });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  const kept: Array<{ index: number; end: number; name: string }> = [];
  for (const hit of hits) {
    const end = hit.index + hit.name.length;
    if (kept.some((prior) => hit.index < prior.end && end > prior.index)) continue;
    kept.push({ index: hit.index, end, name: hit.name });
  }
  return kept.map((hit) => hit.name);
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

function collectThresholds(pkg: ComputationPackage): Map<RatioKey, RatioThreshold[]> {
  const map = new Map<RatioKey, RatioThreshold[]>();
  for (const basket of pkg.baskets) {
    const classified = classifyRatioIncurrencePermission(basket.operativeText);
    if (classified.class === "NOT_RATIO_INCURRENCE" || !classified.ratioName) continue;
    if (classified.thresholdNumerator == null || classified.thresholdDenominator == null || !classified.comparator) continue;
    const entry = RATIO_CATALOG.find((c) => c.names.some((n) => namesEqual(n, classified.ratioName!)));
    if (!entry) continue;
    const direction: RatioDirection =
      classified.comparator === "AT_LEAST" || classified.comparator === "GREATER_THAN" ? "MIN" : "MAX";
    const canonical = toCanonicalString(
      rational(
        rationalFromNumber(classified.thresholdNumerator).num * rationalFromNumber(classified.thresholdDenominator).den,
        rationalFromNumber(classified.thresholdDenominator).num * rationalFromNumber(classified.thresholdNumerator).den,
      ),
    );
    // Unified-grammar confirmation (PR #383 wiring): the covenant-level
    // parser reads the same clause with its section family. When it
    // fully agrees this is an INCURRENCE level at the same value, the
    // row carries testKind. When it instead determines — at the same
    // value — that the clause is a MAINTENANCE level, the clause is
    // not an incurrence threshold at all and must not be collected as
    // one (it surfaces through maintenanceLevels instead). Any other
    // outcome leaves the row exactly as the classifier built it, with
    // testKind unconfirmed.
    const parsed = parseCovenantLevel({
      text: basket.operativeText,
      sectionFamily: basket.covenantFamily,
      ratioName: classified.ratioName,
    });
    if (parsed.status === "DETERMINED" && parsed.level === canonical && parsed.testKind === "MAINTENANCE") continue;
    const row: RatioThreshold = {
      sectionRef: basket.sectionRef,
      sourceDocumentId: basket.documentId,
      citationExcerpt: basket.operativeText,
      raw: classified.thresholdRaw ?? "",
      canonical,
      direction,
      comparator: classified.comparator,
      ...(parsed.status === "DETERMINED" && parsed.level === canonical && parsed.testKind === "INCURRENCE"
        ? { testKind: "INCURRENCE" as const }
        : {}),
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

function nameAppears(text: string, name: string): boolean {
  const names = RATIO_CATALOG.flatMap((entry) => [...entry.names]);
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
    if (!buried) return true;
  }
  return false;
}

function namesEqual(a: string, b: string): boolean {
  return norm(a).toLowerCase() === norm(b).toLowerCase();
}

export function documentContaining(documents: readonly PackageDocument[], excerpt: string): PackageDocument | undefined {
  return documents.find((d) => citedIn(d.text, excerpt));
}
