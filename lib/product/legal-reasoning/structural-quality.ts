/**
 * Workspace structural-quality rollup over persisted covenant summaries.
 * Improves classification / coverage diagnostics without rewriting hashes or operative history.
 */

import type { CovenantCategoryKey, CovenantSummaryItem, DocumentCovenantSummary } from "../covenant-intelligence/summarize";
import { detectPatternsInText } from "../../knowledge-factory/patterns/library";
import { buildPartyIdentity, type NormalizedPartyIdentity } from "./party-identity";

export interface ProvisionIntelligenceRow {
  sourceId: string;
  documentTitle: string;
  documentClass: string;
  sectionRef: string;
  category: CovenantCategoryKey;
  hasRestriction: boolean;
  hasPermission: boolean;
  hasException: boolean;
  hasCondition: boolean;
  definitionCount: number;
  unresolvedDefinitions: number;
  patternIds: string[];
  citationPresent: boolean;
  unknownOrAmbiguous: boolean;
}

export interface StructuralQualityReport {
  documentsWithProvisionIntelligence: number;
  provisionRows: number;
  byCategory: Record<string, number>;
  unknownOrAmbiguousProvisions: number;
  definitionResolution: {
    termsSampled: number;
    resolved: number;
    unresolved: number;
    resolutionRate: number;
  };
  amendmentGraph: {
    amendmentDocuments: number;
    linkedPackages: number;
    unresolvedOperative: number;
  };
  patternCoverage: Record<string, number>;
  parties: NormalizedPartyIdentity[];
  limitations: string[];
}

type SourceMeta = {
  sourceId: string;
  title: string;
  documentClass: string;
  issuerName?: string | null;
  issuerCik?: string | null;
  issuerTicker?: string | null;
  metadata: Record<string, unknown>;
};

function summaryOf(meta: Record<string, unknown>): DocumentCovenantSummary | null {
  const s = meta.covenantSummary;
  if (!s || typeof s !== "object") return null;
  return s as DocumentCovenantSummary;
}

function isUnknownOrAmbiguous(item: CovenantSummaryItem): boolean {
  if (item.category === "OTHER") return true;
  if (/unknown|ambiguous|unclear|not determinable/i.test(item.plainEnglish)) return true;
  if (item.posture === "UNRESOLVED" && !item.restriction && item.permissions.length === 0) return true;
  return false;
}

export function assessStructuralQuality(sources: SourceMeta[]): StructuralQualityReport {
  const rows: ProvisionIntelligenceRow[] = [];
  const byCategory: Record<string, number> = {};
  const patternCoverage: Record<string, number> = {};
  let termsSampled = 0;
  let resolved = 0;
  let unresolved = 0;
  let amendmentDocuments = 0;
  let linkedPackages = 0;
  let unresolvedOperative = 0;
  const parties: NormalizedPartyIdentity[] = [];
  let docsWithIntel = 0;

  for (const src of sources) {
    const summary = summaryOf(src.metadata);
    if (summary?.items?.length) docsWithIntel += 1;

    const docClass = (src.documentClass || summary?.documentClass || "OTHER").toUpperCase();
    if (/AMENDMENT|RESTATEMENT|SUPPLEMENTAL/.test(docClass)) amendmentDocuments += 1;

    const pkg = src.metadata.amendmentPackage as { linked?: boolean; operativeResolution?: string } | undefined;
    if (pkg?.linked) linkedPackages += 1;
    if (pkg?.operativeResolution === "UNRESOLVED_PRECEDENCE") unresolvedOperative += 1;

    parties.push(
      buildPartyIdentity({
        issuerName: src.issuerName ?? summary?.issuerName,
        issuerCik: src.issuerCik ?? summary?.issuerCik,
        issuerTicker: src.issuerTicker,
      }),
    );

    for (const d of summary?.definedTermsSample ?? []) {
      termsSampled += 1;
      // Sampled terms from structural extract are treated as resolved when excerpt present.
      if (d.excerpt?.trim()) resolved += 1;
      else unresolved += 1;
    }

    for (const item of summary?.items ?? []) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
      const text = [
        item.heading,
        item.plainEnglish,
        item.restriction ?? "",
        ...(item.permissions ?? []),
        ...(item.exceptions ?? []),
        ...(item.conditions ?? []),
      ].join(" ");
      const patternIds = detectPatternsInText(text);
      for (const p of patternIds) patternCoverage[p] = (patternCoverage[p] ?? 0) + 1;

      const unresolvedDefs = (item.applicableDefinitions ?? []).filter((d) => d.resolved === false).length;
      unresolved += unresolvedDefs;
      resolved += (item.applicableDefinitions ?? []).filter((d) => d.resolved !== false && d.excerpt).length;
      termsSampled += (item.applicableDefinitions ?? []).length;

      rows.push({
        sourceId: src.sourceId,
        documentTitle: src.title || summary?.governingAgreement || src.sourceId,
        documentClass: docClass,
        sectionRef: item.sectionRef,
        category: item.category,
        hasRestriction: Boolean(item.restriction?.trim()),
        hasPermission: (item.permissions ?? []).length > 0,
        hasException: (item.exceptions ?? []).length > 0,
        hasCondition: (item.conditions ?? []).length > 0,
        definitionCount: (item.applicableDefinitions ?? []).length || (item.relatedDefinedTerms ?? []).length,
        unresolvedDefinitions: unresolvedDefs,
        patternIds,
        citationPresent: Boolean(item.sourceCitation?.trim() || item.operativeLanguageExcerpt?.trim()),
        unknownOrAmbiguous: isUnknownOrAmbiguous(item),
      });
    }
  }

  const denom = resolved + unresolved;
  return {
    documentsWithProvisionIntelligence: docsWithIntel,
    provisionRows: rows.length,
    byCategory,
    unknownOrAmbiguousProvisions: rows.filter((r) => r.unknownOrAmbiguous).length,
    definitionResolution: {
      termsSampled,
      resolved,
      unresolved,
      resolutionRate: denom ? resolved / denom : 0,
    },
    amendmentGraph: {
      amendmentDocuments,
      linkedPackages,
      unresolvedOperative,
    },
    patternCoverage,
    parties: parties.slice(0, 40),
    limitations: [
      "Report reads persisted KnowledgeSource metadata — does not rewrite document hashes or operative versions.",
      "UNKNOWN/OTHER provisions remain queued for counsel; they are not force-classified.",
      "Amendment linkage depends on existing amendmentPackage / relationship discovery.",
    ],
  };
}

/** Convenience: provision rows needing counsel classification attention. */
export function collectAmbiguousProvisions(sources: SourceMeta[]): ProvisionIntelligenceRow[] {
  const report = assessStructuralQuality(sources);
  void report;
  const out: ProvisionIntelligenceRow[] = [];
  for (const src of sources) {
    const summary = summaryOf(src.metadata);
    for (const item of summary?.items ?? []) {
      if (!isUnknownOrAmbiguous(item)) continue;
      out.push({
        sourceId: src.sourceId,
        documentTitle: src.title || summary?.governingAgreement || src.sourceId,
        documentClass: (src.documentClass || "OTHER").toUpperCase(),
        sectionRef: item.sectionRef,
        category: item.category,
        hasRestriction: Boolean(item.restriction?.trim()),
        hasPermission: (item.permissions ?? []).length > 0,
        hasException: (item.exceptions ?? []).length > 0,
        hasCondition: (item.conditions ?? []).length > 0,
        definitionCount: (item.relatedDefinedTerms ?? []).length,
        unresolvedDefinitions: 0,
        patternIds: detectPatternsInText(`${item.heading} ${item.plainEnglish}`),
        citationPresent: Boolean(item.sourceCitation?.trim()),
        unknownOrAmbiguous: true,
      });
    }
  }
  return out.slice(0, 100);
}
