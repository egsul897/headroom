/**
 * Plain-English covenant category summaries from discovered candidates.
 * DISCOVERED ≠ VERIFIED. Never invents capacity or legal permission.
 */

import type {
  CovenantCandidateRecord,
  DefinitionRecord,
  StructuralNodeRecord,
} from "../../knowledge-factory/types";

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

const FAMILY_TO_CATEGORY: Record<string, CovenantCategoryKey> = {
  INDEBTEDNESS: "DEBT_INCURRENCE",
  INCREMENTAL_DEBT_AND_FACILITIES: "DEBT_INCURRENCE",
  RATIO_BASED_PERMISSIONS: "DEBT_INCURRENCE",
  LIENS: "LIENS_SECURED_DEBT",
  RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  INVESTMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  ASSET_SALES: "ASSET_SALES",
  AFFILIATE_TRANSACTIONS: "AFFILIATE_TRANSACTIONS",
  GUARANTEES: "GUARANTEES",
  FUNDAMENTAL_CHANGES: "MERGERS_FUNDAMENTAL_CHANGES",
  FINANCIAL_MAINTENANCE_COVENANTS: "FINANCIAL_MAINTENANCE",
  EVENTS_OF_DEFAULT: "EVENTS_OF_DEFAULT",
  AVAILABLE_AMOUNT_AND_BUILDER_BASKETS: "BASKETS_EXCEPTIONS_CONDITIONS",
  SHARED_CAPACITY_PROVISIONS: "BASKETS_EXCEPTIONS_CONDITIONS",
  GENERAL_CONDITIONS_AND_EXCEPTIONS: "BASKETS_EXCEPTIONS_CONDITIONS",
  MANDATORY_PREPAYMENTS: "DEBT_INCURRENCE",
  JUNIOR_DEBT_PREPAYMENTS: "DEBT_INCURRENCE",
  RESTRICTED_SUBSIDIARIES: "OTHER",
  UNRESTRICTED_SUBSIDIARIES: "OTHER",
  DESIGNATIONS: "OTHER",
};

export interface CovenantSummaryItem {
  category: CovenantCategoryKey;
  categoryLabel: string;
  sectionRef: string;
  heading: string;
  plainEnglish: string;
  operativeLanguageExcerpt: string;
  sourceCitation: string;
  governingAgreement: string;
  families: string[];
  relatedDefinedTerms: string[];
  epistemicStatus: "DISCOVERED_CANDIDATE" | "STRUCTURE_ONLY";
  interpretationNote: string;
  unresolvedQuestions: string[];
}

export interface DocumentCovenantSummary {
  schemaVersion: "product.covenant-summary.v1";
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

function sectionForNode(
  nodeId: string | undefined,
  nodes: StructuralNodeRecord[],
): { sectionRef: string; heading: string } {
  if (!nodeId) return { sectionRef: "n/a", heading: "Document body" };
  const n = nodes.find((x) => x.nodeId === nodeId);
  return {
    sectionRef: n?.sectionRef || n?.heading || nodeId,
    heading: n?.heading || n?.sectionRef || "Untitled provision",
  };
}

function plainEnglishFor(families: string[], heading: string, excerpt: string): string {
  const primary = families[0] ?? "UNKNOWN";
  const cat = FAMILY_TO_CATEGORY[primary] ?? "OTHER";
  const label = COVENANT_CATEGORY_LABELS[cat];
  const clip = excerpt.replace(/\s+/g, " ").trim().slice(0, 280);
  return (
    `This provision appears to address ${label.toLowerCase()} ` +
    `(classified from heading “${heading.slice(0, 80)}”). ` +
    `Source-backed excerpt: “${clip}${excerpt.length > 280 ? "…" : ""}”. ` +
    `This is a discovery summary, not a determination of what the borrower may or may not do.`
  );
}

function relatedTerms(excerpt: string, defs: DefinitionRecord[]): string[] {
  const hits: string[] = [];
  for (const d of defs.slice(0, 200)) {
    if (d.term.length < 3) continue;
    if (excerpt.toLowerCase().includes(d.term.toLowerCase())) hits.push(d.term);
    if (hits.length >= 8) break;
  }
  return hits;
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
}): DocumentCovenantSummary {
  const items: CovenantSummaryItem[] = [];
  const countsByCategory: Record<string, number> = {};

  const ranked = [...params.candidates].sort((a, b) => b.discoveryScore - a.discoveryScore);
  for (const c of ranked) {
    const primary = c.families[0] ?? "UNKNOWN";
    const category = FAMILY_TO_CATEGORY[primary] ?? "OTHER";
    countsByCategory[category] = (countsByCategory[category] ?? 0) + 1;
    const { sectionRef, heading } = sectionForNode(c.nodeId, params.structuralNodes);
    items.push({
      category,
      categoryLabel: COVENANT_CATEGORY_LABELS[category],
      sectionRef,
      heading,
      plainEnglish: plainEnglishFor(c.families, heading, c.excerpt),
      operativeLanguageExcerpt: c.excerpt.slice(0, 600),
      sourceCitation: `${params.sourceId} · ${sectionRef}`,
      governingAgreement: params.documentTitle,
      families: c.families,
      relatedDefinedTerms: relatedTerms(c.excerpt, params.definitions),
      epistemicStatus: "DISCOVERED_CANDIDATE",
      interpretationNote:
        "Classification and plain-English restatement are discovery aids. They are not legal advice and do not establish executable permission or capacity.",
      unresolvedQuestions: [
        "Whether this provision is currently operative after amendments",
        "Whether exceptions/carve-outs fully neutralize the restriction",
        "Whether required defined terms resolve to a complete calculation",
      ],
    });
  }

  // Prefer one strong item per category first for UI readability, keep rest ordered.
  const preferredOrder = Object.keys(COVENANT_CATEGORY_LABELS) as CovenantCategoryKey[];
  items.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.category);
    const bi = preferredOrder.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.sectionRef.localeCompare(b.sectionRef);
  });

  return {
    schemaVersion: "product.covenant-summary.v1",
    sourceId: params.sourceId,
    governingAgreement: params.documentTitle,
    issuerName: params.issuerName,
    issuerCik: params.issuerCik,
    documentClass: params.documentClass,
    generatedAt: new Date().toISOString(),
    promotedToLegalTruth: 0,
    note: "DISCOVERED ≠ VERIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE. PRECEDENT ≠ OPERATIVE AUTHORITY.",
    countsByCategory,
    items: items.slice(0, 120),
    definedTermsSample: params.definitions.slice(0, 40).map((d) => ({
      term: d.term,
      excerpt: (d.excerpt ?? "").slice(0, 240),
    })),
  };
}

export function summarizeFromStoredMetadata(metadata: unknown): DocumentCovenantSummary | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const cs = (metadata as Record<string, unknown>).covenantSummary;
  if (!cs || typeof cs !== "object") return null;
  return cs as DocumentCovenantSummary;
}
