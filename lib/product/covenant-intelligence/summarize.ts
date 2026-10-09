/**
 * Document covenant summaries from substantive provision analysis.
 * DISCOVERED ≠ VERIFIED. Never invents capacity or legal permission.
 */

import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  StructuralNodeRecord,
} from "../../knowledge-factory/types";
import { analyzeProvision, type ProvisionAnalysis, type ProvisionPosture } from "./analyze-provision";

export type CovenantCategoryKey =
  | "DEBT_INCURRENCE"
  | "LIENS_SECURED_DEBT"
  | "RESTRICTED_PAYMENTS_INVESTMENTS"
  | "ASSET_SALES"
  | "AFFILIATE_TRANSACTIONS"
  | "GUARANTEES"
  | "MERGERS_FUNDAMENTAL_CHANGES"
  | "FINANCIAL_MAINTENANCE"
  | "EVENTS_OF_DEFAULT"
  | "BASKETS_EXCEPTIONS_CONDITIONS"
  | "OTHER";

export const COVENANT_CATEGORY_LABELS: Record<CovenantCategoryKey, string> = {
  DEBT_INCURRENCE: "Debt incurrence",
  LIENS_SECURED_DEBT: "Liens and secured debt",
  RESTRICTED_PAYMENTS_INVESTMENTS: "Restricted payments and investments",
  ASSET_SALES: "Asset sales",
  AFFILIATE_TRANSACTIONS: "Affiliate transactions",
  GUARANTEES: "Guarantees",
  MERGERS_FUNDAMENTAL_CHANGES: "Mergers and fundamental changes",
  FINANCIAL_MAINTENANCE: "Financial maintenance covenants",
  EVENTS_OF_DEFAULT: "Events of default",
  BASKETS_EXCEPTIONS_CONDITIONS: "Relevant baskets, exceptions, conditions and defined terms",
  OTHER: "Other provisions",
};

/** Persisted summary item — same shape consumed by Ask Headroom. */
export interface CovenantSummaryItem {
  category: CovenantCategoryKey;
  categoryLabel: string;
  sectionRef: string;
  heading: string;
  posture: ProvisionPosture;
  plainEnglish: string;
  restriction: string | null;
  permissions: string[];
  coveredEntities: string[];
  exceptions: string[];
  conditions: string[];
  materialBasketsThresholds: string[];
  draftingPatterns: string[];
  operativeLanguageExcerpt: string;
  sourceCitation: string;
  governingAgreement: string;
  families: string[];
  relatedDefinedTerms: string[];
  applicableDefinitions: Array<{ term: string; excerpt: string; resolved?: boolean }>;
  entityScope: {
    borrower: boolean;
    guarantor: boolean;
    restrictedSubsidiary: boolean;
    unrestrictedSubsidiary: boolean;
    notes: string[];
  };
  crossReferences: string[];
  dependencies: string[];
  epistemicStatus: "DISCOVERED_CANDIDATE" | "STRUCTURE_ONLY";
  interpretationNote: string;
  unresolvedQuestions: string[];
  /** Full structured analysis — Ask and UI share this object. */
  analysis: ProvisionAnalysis;
}

export interface DocumentCovenantSummary {
  schemaVersion: "product.covenant-summary.v2";
  sourceId: string;
  governingAgreement: string;
  issuerName?: string;
  issuerCik: string;
  documentClass: string;
  generatedAt: string;
  promotedToLegalTruth: 0;
  note: string;
  countsByCategory: Record<string, number>;
  items: CovenantSummaryItem[];
  definedTermsSample: Array<{ term: string; excerpt: string }>;
}

function entityScopeFromAnalysis(a: ProvisionAnalysis): CovenantSummaryItem["entityScope"] {
  const joined = a.coveredEntities.join(" ").toLowerCase();
  return {
    borrower: /\bborrower\b/.test(joined),
    guarantor: /\bguarantor/.test(joined),
    restrictedSubsidiary: /\brestricted subsidiar/.test(joined),
    unrestrictedSubsidiary: /\bunrestricted subsidiar/.test(joined),
    notes: a.entityScopeNotes,
  };
}

function itemFromAnalysis(
  analysis: ProvisionAnalysis,
  governingAgreement: string,
): CovenantSummaryItem {
  return {
    category: analysis.category,
    categoryLabel: analysis.categoryLabel,
    sectionRef: analysis.sectionRef,
    heading: analysis.heading,
    posture: analysis.posture,
    plainEnglish: analysis.plainEnglish,
    restriction: analysis.restriction,
    permissions: analysis.permissions,
    coveredEntities: analysis.coveredEntities,
    exceptions: analysis.exceptions,
    conditions: analysis.conditions,
    materialBasketsThresholds: analysis.basketsAndThresholds,
    draftingPatterns: analysis.draftingPatterns,
    operativeLanguageExcerpt: analysis.operativeLanguageExcerpt,
    sourceCitation: analysis.sourceCitation,
    governingAgreement,
    families: analysis.families,
    relatedDefinedTerms: analysis.applicableDefinitions.map((d) => d.term),
    applicableDefinitions: analysis.applicableDefinitions,
    entityScope: entityScopeFromAnalysis(analysis),
    crossReferences: analysis.crossReferences,
    dependencies: analysis.dependencies,
    epistemicStatus: analysis.epistemicStatus,
    interpretationNote: analysis.interpretationNote,
    unresolvedQuestions: analysis.unresolved,
    analysis,
  };
}

export function buildDocumentCovenantSummary(params: {
  sourceId: string;
  documentTitle: string;
  issuerName?: string;
  issuerCik: string;
  documentClass: string;
  candidates: CovenantCandidateRecord[];
  definitions: DefinitionRecord[];
  structuralNodes: StructuralNodeRecord[];
  crossReferences?: CrossReferenceRecord[];
}): DocumentCovenantSummary {
  const items: CovenantSummaryItem[] = [];
  const countsByCategory: Record<string, number> = {};

  const ranked = [...params.candidates].sort((a, b) => b.discoveryScore - a.discoveryScore);
  for (const c of ranked) {
    const analysis = analyzeProvision({
      sourceId: params.sourceId,
      documentTitle: params.documentTitle,
      candidate: c,
      definitions: params.definitions,
      structuralNodes: params.structuralNodes,
      crossReferences: params.crossReferences,
    });
    countsByCategory[analysis.category] = (countsByCategory[analysis.category] ?? 0) + 1;
    items.push(itemFromAnalysis(analysis, params.documentTitle));
  }

  const preferredOrder = Object.keys(COVENANT_CATEGORY_LABELS) as CovenantCategoryKey[];
  items.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.category);
    const bi = preferredOrder.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.sectionRef.localeCompare(b.sectionRef);
  });

  return {
    schemaVersion: "product.covenant-summary.v2",
    sourceId: params.sourceId,
    governingAgreement: params.documentTitle,
    issuerName: params.issuerName,
    issuerCik: params.issuerCik,
    documentClass: params.documentClass,
    generatedAt: new Date().toISOString(),
    promotedToLegalTruth: 0,
    note: "DISCOVERED ≠ VERIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE. PRECEDENT ≠ OPERATIVE AUTHORITY. Summaries and Ask share the same persisted analysis objects.",
    countsByCategory,
    items: items.slice(0, 120),
    definedTermsSample: pickDefinedTermsSample(params.definitions, 80),
  };
}

/** Prefer material financing terms in the persisted sample used by Ask. */
function pickDefinedTermsSample(
  definitions: DefinitionRecord[],
  limit: number,
): Array<{ term: string; excerpt: string }> {
  const material =
    /ebitda|indebtedness|leverage|coverage|restricted\s+payment|permitted\s+(?:lien|investment|acquisition)|administrative\s+agent|total\s+net|consolidated\s+net\s+income/i;
  const ranked = [...definitions].sort((a, b) => {
    const am = material.test(a.term) ? 0 : 1;
    const bm = material.test(b.term) ? 0 : 1;
    if (am !== bm) return am - bm;
    return b.term.length - a.term.length;
  });
  const out: Array<{ term: string; excerpt: string }> = [];
  const seen = new Set<string>();
  for (const d of ranked) {
    const key = d.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term: d.term, excerpt: (d.excerpt ?? "").slice(0, 280) });
    if (out.length >= limit) break;
  }
  return out;
}

export function summarizeFromStoredMetadata(metadata: unknown): DocumentCovenantSummary | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const cs = (metadata as Record<string, unknown>).covenantSummary;
  if (!cs || typeof cs !== "object") return null;
  return cs as DocumentCovenantSummary;
}
