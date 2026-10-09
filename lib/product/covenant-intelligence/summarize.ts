/**
 * Plain-English covenant category summaries from discovered candidates.
 * DISCOVERED ≠ VERIFIED. Never invents capacity or legal permission.
 */

import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
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

export interface EntityScopeSignals {
  borrower: boolean;
  guarantor: boolean;
  restrictedSubsidiary: boolean;
  unrestrictedSubsidiary: boolean;
  notes: string[];
}

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
  applicableDefinitions: Array<{ term: string; excerpt: string }>;
  entityScope: EntityScopeSignals;
  materialBasketsThresholds: string[];
  crossReferences: string[];
  dependencies: string[];
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

function detectEntityScope(excerpt: string, heading: string): EntityScopeSignals {
  const hay = `${heading} ${excerpt}`.toLowerCase();
  const notes: string[] = [];
  const borrower = /\bborrower\b/.test(hay);
  const guarantor = /\bguarantor/.test(hay);
  const restrictedSubsidiary = /\brestricted subsidiar/.test(hay);
  const unrestrictedSubsidiary = /\bunrestricted subsidiar/.test(hay);
  if (borrower) notes.push("Text references the Borrower.");
  if (guarantor) notes.push("Text references Guarantor(s).");
  if (restrictedSubsidiary) notes.push("Text references Restricted Subsidiaries.");
  if (unrestrictedSubsidiary) notes.push("Text references Unrestricted Subsidiaries.");
  if (notes.length === 0) {
    notes.push("Entity scope not clearly stated in the excerpt — full section review required.");
  }
  return { borrower, guarantor, restrictedSubsidiary, unrestrictedSubsidiary, notes };
}

function detectBasketsAndThresholds(excerpt: string): string[] {
  const hits: string[] = [];
  const money = excerpt.match(/\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?/gi) ?? [];
  for (const m of money.slice(0, 6)) hits.push(`Amount/threshold: ${m.trim()}`);
  if (/\bgreater of\b/i.test(excerpt)) hits.push("Greater-of basket construct detected.");
  if (/\bbuilder\b|\bavailable amount\b|\bcumulative credit\b/i.test(excerpt)) {
    hits.push("Builder / Available Amount construct detected.");
  }
  if (/\bexcept(?:ion|ing)?\b|\bprovided that\b|\bso long as\b/i.test(excerpt)) {
    hits.push("Exception or condition language detected.");
  }
  if (/\bleverage\b|\bcoverage\b|\bfixed charge\b/i.test(excerpt)) {
    hits.push("Ratio-based condition or threshold language detected.");
  }
  return hits.slice(0, 8);
}

function detectDependencies(excerpt: string, crossRefs: string[], definedTerms: string[]): string[] {
  const deps: string[] = [];
  for (const ref of crossRefs.slice(0, 6)) {
    deps.push(`Depends on / references ${ref}`);
  }
  for (const term of definedTerms.slice(0, 4)) {
    deps.push(`Meaning controlled by definition of “${term}”`);
  }
  if (/\bsubject to\b|\bin accordance with\b|\bas defined in\b/i.test(excerpt)) {
    deps.push("Operative effect appears contingent on another provision or definition.");
  }
  if (deps.length === 0) {
    deps.push("No explicit cross-provision dependency identified in the excerpt.");
  }
  return deps.slice(0, 8);
}

function plainEnglishFor(params: {
  families: string[];
  heading: string;
  excerpt: string;
  sectionRef: string;
  entityScope: EntityScopeSignals;
  baskets: string[];
  dependencies: string[];
}): string {
  const primary = params.families[0] ?? "UNKNOWN";
  const cat = FAMILY_TO_CATEGORY[primary] ?? "OTHER";
  const label = COVENANT_CATEGORY_LABELS[cat];
  const clip = params.excerpt.replace(/\s+/g, " ").trim().slice(0, 320);
  const scopeBits: string[] = [];
  if (params.entityScope.borrower) scopeBits.push("Borrower");
  if (params.entityScope.guarantor) scopeBits.push("Guarantor(s)");
  if (params.entityScope.restrictedSubsidiary) scopeBits.push("Restricted Subsidiaries");
  if (params.entityScope.unrestrictedSubsidiary) scopeBits.push("Unrestricted Subsidiaries");
  const scope =
    scopeBits.length > 0
      ? `Apparent scope signals: ${scopeBits.join(", ")}.`
      : "Scope (Borrower / Guarantor / Restricted Subsidiary) is not explicit in the excerpt.";
  const basketNote =
    params.baskets.length > 0
      ? ` Material baskets/thresholds/exceptions signaled: ${params.baskets.slice(0, 3).join("; ")}.`
      : "";
  const depNote =
    params.dependencies[0] && !params.dependencies[0].startsWith("No explicit")
      ? ` Dependency: ${params.dependencies[0]}.`
      : "";
  return (
    `Section ${params.sectionRef} (“${params.heading.slice(0, 100)}”) appears to impose or condition ` +
    `${label.toLowerCase()} restrictions or permissions. ${scope}${basketNote}${depNote} ` +
    `Source-backed substance: “${clip}${params.excerpt.length > 320 ? "…" : ""}”. ` +
    `This explains discovered text; it is not a determination of current operative permission or capacity.`
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

function applicableDefinitions(
  terms: string[],
  defs: DefinitionRecord[],
): Array<{ term: string; excerpt: string }> {
  const out: Array<{ term: string; excerpt: string }> = [];
  for (const term of terms) {
    const d = defs.find((x) => x.term.toLowerCase() === term.toLowerCase());
    if (d) out.push({ term: d.term, excerpt: (d.excerpt ?? "").slice(0, 240) });
  }
  return out;
}

function crossRefsForCandidate(
  nodeId: string | undefined,
  excerpt: string,
  xrefs: CrossReferenceRecord[],
): string[] {
  const fromNode = nodeId
    ? xrefs.filter((x) => x.fromNodeId === nodeId).map((x) => x.rawReference)
    : [];
  const fromText =
    excerpt.match(/\b(?:Section|Article|§)\s*[\dA-Za-z.()-]+/g)?.map((s) => s.trim()) ?? [];
  return Array.from(new Set([...fromNode, ...fromText])).slice(0, 10);
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
  const xrefs = params.crossReferences ?? [];

  const ranked = [...params.candidates].sort((a, b) => b.discoveryScore - a.discoveryScore);
  for (const c of ranked) {
    const primary = c.families[0] ?? "UNKNOWN";
    const category = FAMILY_TO_CATEGORY[primary] ?? "OTHER";
    countsByCategory[category] = (countsByCategory[category] ?? 0) + 1;
    const { sectionRef, heading } = sectionForNode(c.nodeId, params.structuralNodes);
    const terms = relatedTerms(c.excerpt, params.definitions);
    const entityScope = detectEntityScope(c.excerpt, heading);
    const materialBasketsThresholds = detectBasketsAndThresholds(c.excerpt);
    const crossReferences = crossRefsForCandidate(c.nodeId, c.excerpt, xrefs);
    const dependencies = detectDependencies(c.excerpt, crossReferences, terms);
    const unresolvedQuestions = [
      "Whether this provision is currently operative after amendments",
      "Whether exceptions/carve-outs fully neutralize the restriction",
      "Whether required defined terms resolve to a complete calculation",
    ];
    if (dependencies.some((d) => d.startsWith("Depends on"))) {
      unresolvedQuestions.push("Whether referenced provisions are present and currently operative in the package");
    }
    if (!entityScope.borrower && !entityScope.guarantor && !entityScope.restrictedSubsidiary) {
      unresolvedQuestions.push("Missing clear entity-scope language in the retrieved excerpt");
    }

    items.push({
      category,
      categoryLabel: COVENANT_CATEGORY_LABELS[category],
      sectionRef,
      heading,
      plainEnglish: plainEnglishFor({
        families: c.families,
        heading,
        excerpt: c.excerpt,
        sectionRef,
        entityScope,
        baskets: materialBasketsThresholds,
        dependencies,
      }),
      operativeLanguageExcerpt: c.excerpt.slice(0, 600),
      sourceCitation: `${params.sourceId} · ${sectionRef}`,
      governingAgreement: params.documentTitle,
      families: c.families,
      relatedDefinedTerms: terms,
      applicableDefinitions: applicableDefinitions(terms, params.definitions),
      entityScope,
      materialBasketsThresholds,
      crossReferences,
      dependencies,
      epistemicStatus: "DISCOVERED_CANDIDATE",
      interpretationNote:
        "Classification and plain-English restatement are discovery aids grounded in extracted text. They are not legal advice and do not establish executable permission or capacity.",
      unresolvedQuestions,
    });
  }

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
