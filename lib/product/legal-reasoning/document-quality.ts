/**
 * Per-document quality scoring for financing corpus prioritization.
 * Favors substantive / diverse structures over raw document count.
 */

import type { CovenantSummaryItem, DocumentCovenantSummary } from "../covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../covenant-intelligence/corpus-quality";
import { detectPatternsInText } from "../../knowledge-factory/patterns/library";

export interface DocumentQualityScore {
  sourceId: string;
  score: number;
  components: {
    substantiveFinancing: number;
    provisionCoverage: number;
    categoryDiversity: number;
    definitionDensity: number;
    citationIntegrity: number;
    patternRichness: number;
    unknownPenalty: number;
  };
  underrepresentedSignals: string[];
  notes: string[];
}

const CORE_CATEGORIES = [
  "DEBT_INCURRENCE",
  "LIENS_SECURED_DEBT",
  "RESTRICTED_PAYMENTS_INVESTMENTS",
  "ASSET_SALES",
  "FINANCIAL_MAINTENANCE",
] as const;

export function scoreDocumentQuality(params: {
  sourceId: string;
  documentClass: string;
  documentTitle: string;
  exhibitFilename?: string;
  provenance?: string;
  issuerName?: string | null;
  byteSize?: number | null;
  summary: DocumentCovenantSummary | null;
}): DocumentQualityScore {
  const notes: string[] = [];
  const underrepresentedSignals: string[] = [];
  const substantive = isSubstantiveFinancingPrecedent({
    sourceId: params.sourceId,
    documentClass: params.documentClass,
    documentTitle: params.documentTitle,
    exhibitFilename: params.exhibitFilename ?? params.documentTitle,
    provenance: params.provenance ?? "sec-edgar",
    issuerName: params.issuerName,
    byteSize: params.byteSize ?? undefined,
  })
    ? 1
    : 0;

  const items = params.summary?.items ?? [];
  const provisionCoverage = Math.min(1, items.length / 20);
  const cats = new Set(items.map((i) => i.category));
  const categoryDiversity = CORE_CATEGORIES.filter((c) => cats.has(c)).length / CORE_CATEGORIES.length;
  const defCount = items.reduce(
    (n, i) => n + (i.applicableDefinitions?.length ?? 0) + (i.relatedDefinedTerms?.length ?? 0),
    0,
  ) + (params.summary?.definedTermsSample?.length ?? 0);
  const definitionDensity = Math.min(1, defCount / 25);
  const cited = items.filter((i) => i.sourceCitation?.trim() || i.operativeLanguageExcerpt?.trim()).length;
  const citationIntegrity = items.length ? cited / items.length : 0;

  const patternIds = new Set<string>();
  for (const i of items) {
    for (const p of detectPatternsInText(
      `${i.heading} ${i.plainEnglish} ${(i.materialBasketsThresholds ?? []).join(" ")}`,
    )) {
      patternIds.add(p);
    }
  }
  const patternRichness = Math.min(1, patternIds.size / 8);
  const unknown = items.filter(
    (i) => i.category === "OTHER" || (i.posture === "UNRESOLVED" && !i.restriction && !i.permissions.length),
  ).length;
  const unknownPenalty = items.length ? Math.min(0.4, unknown / items.length) : 0.2;

  if (!cats.has("FINANCIAL_MAINTENANCE")) underrepresentedSignals.push("missing_financial_maintenance");
  if (!cats.has("RESTRICTED_PAYMENTS_INVESTMENTS")) underrepresentedSignals.push("missing_rp_investments");
  if (![...patternIds].some((p) => /shared-capacity|reclassification|builder|incremental/.test(p))) {
    underrepresentedSignals.push("sparse_advanced_basket_patterns");
  }
  if (params.documentClass === "UNKNOWN") underrepresentedSignals.push("unknown_document_class");

  const score = Number(
    (
      substantive * 0.25 +
      provisionCoverage * 0.2 +
      categoryDiversity * 0.2 +
      definitionDensity * 0.1 +
      citationIntegrity * 0.15 +
      patternRichness * 0.15 -
      unknownPenalty
    ).toFixed(3),
  );

  if (substantive === 0) notes.push("Not classified as substantive financing precedent");
  if (items.length === 0) notes.push("No provision-level summary");

  return {
    sourceId: params.sourceId,
    score: Math.max(0, Math.min(1, score)),
    components: {
      substantiveFinancing: substantive,
      provisionCoverage,
      categoryDiversity,
      definitionDensity,
      citationIntegrity,
      patternRichness,
      unknownPenalty,
    },
    underrepresentedSignals,
    notes,
  };
}

/** Soft reclassify OTHER provisions using heading/body heuristics — never force. */
export function suggestCategoryForUnknown(item: CovenantSummaryItem): {
  suggested: CovenantSummaryItem["category"] | null;
  confidence: number;
  rationale: string;
} {
  if (item.category !== "OTHER" && item.posture !== "UNRESOLVED") {
    return { suggested: null, confidence: 0, rationale: "Already categorized" };
  }
  const hay = `${item.heading}\n${item.plainEnglish}\n${item.operativeLanguageExcerpt}`.toLowerCase();
  const rules: Array<{ cat: CovenantSummaryItem["category"]; re: RegExp; conf: number }> = [
    { cat: "DEBT_INCURRENCE", re: /\b(indebtedness|incur|permitted indebtedness)\b/, conf: 0.7 },
    { cat: "LIENS_SECURED_DEBT", re: /\b(lien|collateral|permitted liens?)\b/, conf: 0.7 },
    { cat: "RESTRICTED_PAYMENTS_INVESTMENTS", re: /\b(restricted payment|dividend|investment|unrestricted subsidiar)\b/, conf: 0.7 },
    { cat: "ASSET_SALES", re: /\b(asset sale|disposition|reinvest)\b/, conf: 0.65 },
    { cat: "FINANCIAL_MAINTENANCE", re: /\b(financial covenant|leverage ratio|interest coverage|cure)\b/, conf: 0.7 },
    { cat: "GUARANTEES", re: /\b(guarant(ee|y)|guarantor)\b/, conf: 0.65 },
    { cat: "EVENTS_OF_DEFAULT", re: /\b(event of default|acceleration)\b/, conf: 0.7 },
    { cat: "BASKETS_EXCEPTIONS_CONDITIONS", re: /\b(available amount|builder|basket|provided that|except)\b/, conf: 0.6 },
  ];
  for (const r of rules) {
    if (r.re.test(hay)) {
      return {
        suggested: r.cat,
        confidence: r.conf,
        rationale: `Heuristic match for ${r.cat} — counsel confirmation required before treating as classified`,
      };
    }
  }
  return { suggested: null, confidence: 0, rationale: "No high-confidence reclassification signal" };
}
