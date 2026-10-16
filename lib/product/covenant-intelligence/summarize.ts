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
  alternativeInterpretations?: string[];
  assumptions?: string[];
  judgmentCalls?: string[];
  /** Set when workspace counsel accepted/edited this item. */
  reviewerDecision?: "ACCEPTED" | "EDITED" | "REJECTED";
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
  /**
   * Build that produced this summary (Vercel git commit SHA, "dev"
   * elsewhere). General rule: every computed artifact records its
   * producer build, so the UI can tell a stale analysis (produced by
   * older code, e.g. before a correctness fix) from a current one.
   * Absent on summaries stored before this rule — those are stale.
   */
  analyzerBuild?: string;
  promotedToLegalTruth: 0;
  note: string;
  countsByCategory: Record<string, number>;
  items: CovenantSummaryItem[];
  definedTermsSample: Array<{ term: string; excerpt: string }>;
  /**
   * General rule: silent truncation is a lie. countsByCategory counts
   * EVERY candidate, but items is capped at 120 — without these fields
   * the counts and the listed items disagreed with no explanation.
   * totalItemsBeforeCap is the pre-cap item count; truncated is true
   * when the cap dropped items.
   */
  totalItemsBeforeCap: number;
  truncated: boolean;
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
    alternativeInterpretations: analysis.alternativeInterpretations,
    assumptions: analysis.assumptions,
    judgmentCalls: analysis.judgmentCalls,
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

  const peripheralHeading =
    /\b(?:notice|notices|miscellaneous|governing law|counterpart|severability|waivers? of jury|expenses|indemnif|assignments?|successors|effectiveness|conditions?\s+precedent|representations|schedules?|exhibits?)\b/i;

  const ranked = [...params.candidates].sort((a, b) => {
    const ah = `${a.excerpt ?? ""} ${(a.signals ?? []).join(" ")}`;
    const bh = `${b.excerpt ?? ""} ${(b.signals ?? []).join(" ")}`;
    const ap = peripheralHeading.test(ah) ? 1 : 0;
    const bp = peripheralHeading.test(bh) ? 1 : 0;
    if (ap !== bp) return ap - bp; // primary covenants before peripheral
    return b.discoveryScore - a.discoveryScore;
  });
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
    // Numeric collation: plain lexicographic order put "10.01"
    // before "6.02" (Article 10 listed before Article 6).
    return a.sectionRef.localeCompare(b.sectionRef, undefined, { numeric: true });
  });

  return {
    schemaVersion: "product.covenant-summary.v2",
    sourceId: params.sourceId,
    governingAgreement: params.documentTitle,
    issuerName: params.issuerName,
    issuerCik: params.issuerCik,
    documentClass: params.documentClass,
    generatedAt: new Date().toISOString(),
    analyzerBuild: currentAnalyzerBuild(),
    promotedToLegalTruth: 0,
    note: "AI-first interpretations for customer counsel review. DISCOVERED ≠ counsel-approved. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE capacity. PRECEDENT ≠ OPERATIVE AUTHORITY. Summaries and Ask share the same persisted analysis objects.",
    countsByCategory,
    items: items.slice(0, 120),
    totalItemsBeforeCap: items.length,
    truncated: items.length > 120,
    definedTermsSample: params.definitions.slice(0, 40).map((d) => ({
      term: d.term,
      excerpt: (d.excerpt ?? "").slice(0, 240),
    })),
  };
}

export function summarizeFromStoredMetadata(metadata: unknown): DocumentCovenantSummary | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const cs = (metadata as Record<string, unknown>).covenantSummary;
  if (!cs || typeof cs !== "object" || Array.isArray(cs)) return null;
  // Stored summaries are untrusted input: a summary missing its items
  // array (older version, partial write, corrupt metadata) must
  // degrade to "not analyzed", not crash callers on items.length.
  const items = (cs as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;
  return cs as DocumentCovenantSummary;
}

/**
 * Build identifier for the analyzer code producing summaries. Vercel
 * injects the git commit SHA at build and runtime; anything else is
 * "dev". Stable within a deploy, changes on every deploy — exactly
 * what staleness detection needs. (The older KNOWLEDGE_FACTORY_VERSION
 * constant never changes, so it cannot serve this purpose.)
 */
export function currentAnalyzerBuild(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
}

/**
 * True when a stored summary was produced by older analyzer code (or
 * predates build stamping entirely). A missing summary is not stale —
 * it is absent. Callers surface this as "re-analyze for the latest
 * corrections", never as an error.
 */
export function isSummaryStale(summary: DocumentCovenantSummary | null): boolean {
  if (!summary) return false;
  return !summary.analyzerBuild || summary.analyzerBuild !== currentAnalyzerBuild();
}
