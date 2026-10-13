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
];

interface ParsedDefinition {
  ratioName: string;
  excerpt: string;
  documentId: string;
  numeratorPhrase: string;
  denominatorPhrase: string;
  /** Present when the numerator is "A minus B". */
  numeratorSubtrahend: string | null;
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

  const expression = buildExpression(pkg, definition);
  const evaluation = evaluateLeverageOrCoverageRatio({
    expression,
    ratioKind: entry.kind,
    inputs: fixtureInputResolver({ metrics: bound.metrics }),
    context: { companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, asOf: pkg.asOf },
  });
  const status = statusOf(evaluation);
  const canonical = status === "COMPUTED" ? canonicalOf(evaluation.value) : null;
  const numerator = citedSide(definition, "numerator", bound.metrics, definition.documentId);
  const denominator = citedSide(definition, "denominator", bound.metrics, definition.documentId);
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
  const re = /["“']([^"”']{3,120})["”']\s+means\s+the\s+ratio\s+of\s+(.+?)\s+to\s+(.+?)(?:,|\.|$)/gi;
  const out: ParsedDefinition[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const numeratorRaw = m[2]!.trim();
    const split = numeratorRaw.match(/^(.+?)\s+(?:minus|less)\s+(.+)$/i);
    out.push({
      ratioName: m[1]!.trim(),
      excerpt: m[0].trim(),
      documentId: doc.documentId,
      numeratorPhrase: (split?.[1] ?? numeratorRaw).trim(),
      numeratorSubtrahend: split?.[2]?.trim() ?? null,
      denominatorPhrase: m[3]!.trim(),
    });
  }
  return out;
}

function buildExpression(pkg: ComputationPackage, definition: ParsedDefinition): IRExpression {
  const p: SourceProvenance = {
    documentId: definition.documentId,
    sourceNodeKey: null,
    sourceCitation: definition.ratioName,
    excerpt: definition.excerpt,
  };
  const num = metricRef(pkg, definition.numeratorPhrase, `${definition.ratioName}:num`, p);
  const den = metricRef(pkg, definition.denominatorPhrase, `${definition.ratioName}:den`, p);
  const numerator: IRExpression = definition.numeratorSubtrahend
    ? {
        kind: "SUBTRACT",
        type: "MONEY",
        left: num,
        right: metricRef(pkg, definition.numeratorSubtrahend, `${definition.ratioName}:sub`, p),
        exprId: `cc:${definition.ratioName}:net`,
        provenance: p,
      }
    : num;
  return {
    kind: "DIVIDE",
    type: "RATIO",
    numerator,
    denominator: den,
    exprId: `cc:${definition.ratioName}:ratio`,
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

function citedSide(
  definition: ParsedDefinition,
  side: "numerator" | "denominator",
  metrics: readonly MetricInput[],
  documentId: string,
): CitedAmount[] {
  const names =
    side === "denominator"
      ? [definition.denominatorPhrase]
      : [definition.numeratorPhrase, ...(definition.numeratorSubtrahend ? [definition.numeratorSubtrahend] : [])];
  const out: CitedAmount[] = [];
  for (const name of names) {
    const metric = metrics.find((m) => m.metricKey.toLowerCase() === name.toLowerCase());
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
    const row: RatioThreshold = {
      sectionRef: basket.sectionRef,
      sourceDocumentId: basket.documentId,
      citationExcerpt: basket.operativeText,
      raw: classified.thresholdRaw ?? "",
      canonical,
      direction,
      comparator: classified.comparator,
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
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i").test(text);
}

function namesEqual(a: string, b: string): boolean {
  return norm(a).toLowerCase() === norm(b).toLowerCase();
}

export function documentContaining(documents: readonly PackageDocument[], excerpt: string): PackageDocument | undefined {
  return documents.find((d) => citedIn(d.text, excerpt));
}
