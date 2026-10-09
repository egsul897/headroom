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
import {
  analyzeProvision,
  extractBaskets,
  type ProvisionAnalysis,
  type ProvisionPosture,
} from "./analyze-provision";

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

  // Surface grower / shared-capacity mechanics buried in Permitted * definitions
  // onto the matching negative-covenant summary items (common IG / mid-market drafting).
  for (const d of params.definitions) {
    if (!/^Permitted (?:Liens?|Investments?|Indebtedness)\b/i.test(d.term)) continue;
    const excerpt = d.excerpt || "";
    if (!/\bgreater of\b|\btaken together with\b/i.test(excerpt)) continue;
    const growerHits = [
      ...excerpt.matchAll(
        /greater\s+of\s*\(\s*(?:x|i|A)\s*\)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?\s*(?:and|or|,)\s*\(\s*(?:y|ii|B)\s*\)\s*(?:[a-z\s-]+percent\s*)?\(?\s*([\d.]+)\s*%\s*\)?\s*of\s+([A-Za-z][A-Za-z0-9\s.%]{1,60})/gi,
      ),
    ];
    const labels: string[] = [];
    for (const m of growerHits.slice(0, 4)) {
      const dollars = /million|billion/i.test(m[2] || "")
        ? `$${m[1]} ${m[2]}`
        : `$${m[1]}`;
      labels.push(`Greater-of / grower basket: ${dollars} and ${m[3]}% of ${m[4]}`.replace(/\s+/g, " "));
    }
    if (!labels.length && /\bgreater of\b/i.test(excerpt)) {
      const clip = excerpt.match(/greater\s+of\b[\s\S]{0,140}/i);
      if (clip) labels.push(`Greater-of construct: ${clip[0].replace(/\s+/g, " ").slice(0, 140)}`);
    }
    if (/\btaken together with\b/i.test(excerpt)) {
      labels.push("Shared / aggregated capacity or cross-clause stacking language present.");
    }
    if (!labels.length) continue;
    for (const item of items) {
      const matchLien = /Lien/i.test(d.term) && item.category === "LIENS_SECURED_DEBT";
      const matchInv =
        /Investment/i.test(d.term) && item.category === "RESTRICTED_PAYMENTS_INVESTMENTS";
      const matchDebt = /Indebtedness/i.test(d.term) && item.category === "DEBT_INCURRENCE";
      if (!matchLien && !matchInv && !matchDebt) continue;
      if (item.posture !== "GENERAL_PROHIBITION" && !/^(?:limitations?\s+on\s+)?(?:liens?|investments?|indebtedness)\b/i.test(item.heading)) {
        continue;
      }
      for (const label of labels) {
        if (!item.materialBasketsThresholds.includes(label)) {
          item.materialBasketsThresholds = [...item.materialBasketsThresholds, label].slice(0, 18);
        }
      }
      const dep = `Basket mechanics also appear in definition of “${d.term}”`;
      if (!item.dependencies.includes(dep)) {
        item.dependencies = [...item.dependencies, dep].slice(0, 12);
      }
    }
  }

  // Attach builder / Available Amount / NOA / Incremental definition pointers
  // and merge quantitative/relationship mechanics extracted from those defs.
  for (const d of params.definitions) {
    const isBuilder = /Available Amount|Builder Basket/i.test(d.term);
    const isNoa = /Not Otherwise Applied/i.test(d.term);
    const isIncremental =
      /Incremental (?:Amount|Cap)|Fixed Incremental|Ratio Incremental|Voluntary Prepayment Incremental|Cash-Capped Incremental|Ratio-Based Incremental|Prepayment-Based Incremental|Prepayment Incremental|Incremental Prepayment/i.test(
        d.term,
      );
    if (!isBuilder && !isNoa && !isIncremental) continue;

    // Only treat "has the meaning specified in Section X" as a section pointer —
    // do not grab the first Section cite inside a full "means … pursuant to Section" body.
    const meaningSpecified = d.excerpt.match(
      /(?:has the )?meaning specified in Section\s+([\d.]+(?:\([a-z0-9]+\))?)/i,
    )?.[1];
    const meaningAssignedToCap =
      /meaning assigned to such term in the definition of\s*[“"]?Incremental Cap/i.test(d.excerpt);

    const label = isNoa
      ? `Not Otherwise Applied / builder netting referenced (via definition “${d.term}”).`
      : isIncremental
        ? `Incremental path construct referenced (via definition “${d.term}”).`
        : `Builder / Available Amount construct referenced (via definition “${d.term}”).`;

    // Full mechanics from operative definitions (e.g. Maravai Incremental Cap)
    // plus pointer labels for builder aliases ("meaning specified in Section …").
    const defMechanics = extractBaskets(`${d.term}. ${d.excerpt}`).filter((b) =>
      /Incremental|Available Amount|Builder|NOA |Anti-stack|reclassif|Shared \/|Greater-of|Ratio threshold|limb:|election/i.test(
        b,
      ),
    );

    for (const item of items) {
      const sectionHit =
        meaningSpecified != null &&
        (item.sectionRef === meaningSpecified ||
          item.sectionRef.startsWith(meaningSpecified) ||
          meaningSpecified.startsWith(item.sectionRef) ||
          // 7.05(a)(y) should attach to parent §7.05 / §7.05(a) items
          (meaningSpecified.includes("(") &&
            (item.sectionRef === meaningSpecified.split("(")[0] ||
              meaningSpecified.startsWith(`${item.sectionRef}(`))));
      const topicalHit =
        meaningSpecified == null &&
        ((isBuilder &&
          (/Available Amount|Restricted Payment|Investment/i.test(
            `${item.heading} ${item.plainEnglish} ${(item.materialBasketsThresholds ?? []).join(" ")}`,
          ) ||
            item.posture === "GENERAL_PROHIBITION")) ||
          (isNoa &&
            /Available Amount|Not Otherwise Applied/i.test(
              `${item.heading} ${item.plainEnglish} ${(item.materialBasketsThresholds ?? []).join(" ")}`,
            )) ||
          (isIncremental &&
            (/incremental/i.test(item.heading) ||
              item.category === "DEBT_INCURRENCE" ||
              meaningAssignedToCap ||
              /Incremental path|Incremental Amount|Incremental Cap/i.test(
                (item.materialBasketsThresholds ?? []).join(" "),
              ))));

      if (!sectionHit && !topicalHit) continue;

      if (!item.materialBasketsThresholds.includes(label)) {
        item.materialBasketsThresholds = [...item.materialBasketsThresholds, label].slice(0, 20);
      }
      for (const mech of defMechanics.slice(0, 8)) {
        if (!item.materialBasketsThresholds.includes(mech)) {
          item.materialBasketsThresholds = [...item.materialBasketsThresholds, mech].slice(0, 22);
        }
      }
      const dep = `Meaning controlled by definition of “${d.term}”`;
      if (!item.dependencies.includes(dep)) {
        item.dependencies = [...item.dependencies, dep].slice(0, 12);
      }

      if (isNoa) {
        const sections = d.excerpt.match(/Section\s+[\dA-Za-z.()-]+|clause\s+\([^)]+\)/gi) ?? [];
        if (sections.length) {
          const noaLabel = `NOA deductions / prior applications: ${sections.slice(0, 4).join("; ")}`;
          if (!item.materialBasketsThresholds.includes(noaLabel)) {
            item.materialBasketsThresholds = [...item.materialBasketsThresholds, noaLabel].slice(0, 22);
          }
        }
      }
    }
  }

  // Propagate relationship clips to sibling sectionRefs so a budgeted-out
  // lettered basket does not erase Anti-stacking scope / AA limbs from Ask.
  propagateRelationshipClips(items);

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
    items: selectBalancedSummaryItems(items, 120),
    definedTermsSample: pickDefinedTermsSample(params.definitions, 80),
  };
}

/**
 * Cap summary items without letting DEBT/LIEN volume extinguish RP, asset-sale,
 * or financial-maintenance families (a real failure mode on large A&R CAs).
 */
function propagateRelationshipClips(items: CovenantSummaryItem[]): void {
  const clipRe =
    /^(?:Anti-stacking scope:|Anti-stacking paired clauses:|Available Amount limb:|Available Amount builder defined at Section|Reclassification election:|Incremental limb:|Incremental election order:|NOA deductions)/i;
  const byParent = new Map<string, CovenantSummaryItem[]>();
  for (const item of items) {
    const parent = item.sectionRef.replace(/\([a-z0-9]+\).*$/i, "").replace(/\.$/, "");
    const list = byParent.get(parent) ?? [];
    list.push(item);
    byParent.set(parent, list);
  }
  for (const group of byParent.values()) {
    if (group.length < 2) continue;
    const clips = new Set<string>();
    for (const item of group) {
      for (const b of item.materialBasketsThresholds ?? []) {
        if (clipRe.test(b)) clips.add(b);
      }
    }
    if (!clips.size) continue;
    for (const item of group) {
      for (const clip of clips) {
        if (!item.materialBasketsThresholds.includes(clip)) {
          item.materialBasketsThresholds = [...item.materialBasketsThresholds, clip].slice(0, 22);
        }
      }
    }
  }
}

function categoryPriorityScore(item: CovenantSummaryItem): number {
  let s = 0;
  if (item.posture === "GENERAL_PROHIBITION") s += 12;
  if (item.posture === "MAINTENANCE_TEST") s += 6;
  if (/\brestricted\s+payments?\b/i.test(item.heading)) s += 14;
  if (/^(?:limitation on\s+)?indebtedness\b/i.test(item.heading)) s += 12;
  if (/^(?:limitation on\s+)?liens?\b/i.test(item.heading)) s += 12;
  if (/^investments?\b/i.test(item.heading)) s += 8;
  // Prefer parent sections over lettered baskets when filling the per-category budget.
  if (/^\d+(?:\.\d+)?\([a-z0-9]+\)$/i.test(item.sectionRef)) s -= 4;
  if ((item.materialBasketsThresholds?.length ?? 0) > 0) s += 2;
  // Keep relationship-rich excerpts in the capped summary (training defect:
  // Gibraltar anti-stack scope clips were extracted then dropped by the budget).
  const baskets = (item.materialBasketsThresholds ?? []).join("\n");
  if (/Anti-stacking scope:/i.test(baskets)) s += 14;
  if (/Reclassification election:|Divide-and-classify/i.test(baskets)) s += 10;
  if (/Available Amount limb:|builder defined at Section/i.test(baskets)) s += 8;
  if (/Incremental limb:|Incremental election order:|Incremental path:/i.test(baskets)) s += 8;
  return s;
}

function selectBalancedSummaryItems(
  items: CovenantSummaryItem[],
  limit: number,
): CovenantSummaryItem[] {
  const material: CovenantCategoryKey[] = [
    "DEBT_INCURRENCE",
    "LIENS_SECURED_DEBT",
    "RESTRICTED_PAYMENTS_INVESTMENTS",
    "ASSET_SALES",
    "FINANCIAL_MAINTENANCE",
    "EVENTS_OF_DEFAULT",
    "GUARANTEES",
    "MERGERS_FUNDAMENTAL_CHANGES",
  ];
  const perCat = Math.max(8, Math.floor(limit / (material.length + 2)));
  const picked: CovenantSummaryItem[] = [];
  const seen = new Set<string>();
  const keyOf = (i: CovenantSummaryItem) => `${i.category}|${i.sectionRef}|${i.heading}`;

  for (const cat of material) {
    const ranked = items
      .filter((i) => i.category === cat)
      .slice()
      .sort((a, b) => categoryPriorityScore(b) - categoryPriorityScore(a));
    for (const item of ranked.slice(0, perCat)) {
      const k = keyOf(item);
      if (seen.has(k)) continue;
      seen.add(k);
      picked.push(item);
      if (picked.length >= limit) return picked;
    }
  }
  for (const item of items) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
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
