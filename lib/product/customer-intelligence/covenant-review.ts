/**
 * Customer covenant review workspace — aggregates persisted v2 analyses.
 * Same objects as Ask / document summaries. No parallel interpretation.
 */

import {
  getLatestAmendmentPackage,
  listCustomerDocumentIntelligence,
  type CustomerDocumentIntelligence,
} from "./load";
import type { AmendmentPackageView } from "./amendment-package";
import type { CovenantCategoryKey, CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { COVENANT_CATEGORY_LABELS } from "../covenant-intelligence/summarize";
import {
  buildCovenantDependencyGraph,
  type CovenantDependencyGraph,
} from "./dependency-graph";
import {
  compareAmendmentSummaries,
  type AmendmentCompareView,
} from "./amendment-compare";

export interface CovenantReviewCategoryBlock {
  category: CovenantCategoryKey;
  categoryLabel: string;
  items: Array<CovenantSummaryItem & { sourceId: string; documentId: string; documentTitle: string }>;
}

export interface CovenantReviewWorkspace {
  companyId: string;
  documentCount: number;
  analyzedOkCount: number;
  failedCount: number;
  totalSummaries: number;
  executive: {
    headline: string;
    materialRestrictions: string[];
    materialPermissions: string[];
    unresolved: string[];
  };
  categories: CovenantReviewCategoryBlock[];
  documents: CustomerDocumentIntelligence[];
  amendmentPackage: AmendmentPackageView | null;
  dependencyGraph: CovenantDependencyGraph;
  amendmentCompare: AmendmentCompareView;
}

function pickMaterial(items: CovenantReviewCategoryBlock["items"], limit: number): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.posture === "GENERAL_PROHIBITION" || item.posture === "MAINTENANCE_TEST") {
      if (item.restriction) out.push(`§${item.sectionRef}: ${item.restriction}`);
      else out.push(`§${item.sectionRef}: ${item.plainEnglish.split(". ")[0]}.`);
    }
    if (out.length >= limit) break;
  }
  return out;
}

function pickPermissions(items: CovenantReviewCategoryBlock["items"], limit: number): string[] {
  const out: string[] = [];
  for (const item of items) {
    for (const p of item.permissions ?? []) {
      out.push(`§${item.sectionRef}: ${p}`);
      if (out.length >= limit) return out;
    }
    for (const b of item.materialBasketsThresholds ?? []) {
      out.push(`§${item.sectionRef} basket: ${b}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function loadCovenantReviewWorkspace(companyId: string): Promise<CovenantReviewWorkspace> {
  const documents = await listCustomerDocumentIntelligence(companyId);
  const amendmentPackage = await getLatestAmendmentPackage(companyId);
  const analyzedOkCount = documents.filter((d) => d.analysisOk).length;
  const failedCount = documents.filter((d) => !d.analysisOk && d.extractionStatus !== "PENDING").length;

  const byCategory = new Map<CovenantCategoryKey, CovenantReviewCategoryBlock>();
  let totalSummaries = 0;

  for (const doc of documents) {
    if (!doc.summary) continue;
    for (const item of doc.summary.items) {
      totalSummaries += 1;
      const cat = item.category;
      let block = byCategory.get(cat);
      if (!block) {
        block = {
          category: cat,
          categoryLabel: COVENANT_CATEGORY_LABELS[cat] ?? item.categoryLabel,
          items: [],
        };
        byCategory.set(cat, block);
      }
      block.items.push({
        ...item,
        sourceId: doc.sourceId,
        documentId: doc.documentId,
        documentTitle: doc.filename,
      });
    }
  }

  const preferred = Object.keys(COVENANT_CATEGORY_LABELS) as CovenantCategoryKey[];
  const categories = preferred
    .filter((c) => byCategory.has(c))
    .map((c) => byCategory.get(c)!)
    .map((block) => ({
      ...block,
      items: [...block.items].sort((a, b) => a.sectionRef.localeCompare(b.sectionRef)),
    }));

  const allItems = categories.flatMap((c) => c.items);
  const materialRestrictions = pickMaterial(allItems, 8);
  const materialPermissions = pickPermissions(allItems, 8);
  const unresolved = Array.from(
    new Set(
      allItems.flatMap((i) => (i.unresolvedQuestions ?? []).slice(0, 1).map((u) => `§${i.sectionRef}: ${u}`)),
    ),
  ).slice(0, 8);

  const headline =
    analyzedOkCount === 0
      ? "No financing documents have been successfully analyzed in this workspace yet."
      : `${analyzedOkCount} document(s) analyzed with ${totalSummaries} source-backed covenant summaries. Capacity is not computed from discovery alone.`;

  if (amendmentPackage?.operativeResolution === "UNRESOLVED_PRECEDENCE") {
    unresolved.unshift(`Amendment package: ${amendmentPackage.unresolvedReasons.join("; ") || "precedence unresolved"}`);
  }

  const dependencyGraph = buildCovenantDependencyGraph(allItems);
  const amendmentCompare = compareAmendmentSummaries({
    amendmentPackage,
    items: allItems,
  });

  return {
    companyId,
    documentCount: documents.length,
    analyzedOkCount,
    failedCount,
    totalSummaries,
    executive: {
      headline,
      materialRestrictions,
      materialPermissions,
      unresolved,
    },
    categories,
    documents,
    amendmentPackage,
    dependencyGraph,
    amendmentCompare,
  };
}
