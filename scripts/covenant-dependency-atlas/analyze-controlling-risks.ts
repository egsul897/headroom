/**
 * Controlling-restriction risk investigation → source-backed defect cards
 * for production owners. Does not invent resolution targets.
 */

import type { AtlasEdge } from "./schema";
import { classifyUnresolvedEdges, type ClassifiedUnresolved } from "./classify-unresolved";

export type DefectCategory =
  | "MISSING_DEFINITIONS"
  | "AMENDMENT_TARGET_RESOLUTION"
  | "STRUCTURAL_PARSING_FAILURE"
  | "REMOTE_CONDITIONS"
  | "SHARED_CAPACITY"
  | "RECLASSIFICATION"
  | "CROSS_DOCUMENT_RESTRICTIONS"
  | "AMBIGUOUS_REFERENCE"
  | "OTHER";

export interface DefectCard {
  cardId: string;
  category: DefectCategory;
  priority: "P0" | "P1" | "P2";
  edgeId: string;
  documentId: string;
  kind: string;
  rootCause: string;
  title: string;
  evidenceExcerpt: string | null;
  sourceFile: string | null;
  sectionRef: string | null;
  unresolvedReason: string | null;
  recommendedOwner: string;
  doNotInfer: string;
}

export interface ControllingRiskReport {
  totalOpenControllingRisks: number;
  byCategory: Record<DefectCategory, number>;
  defectCards: DefectCard[];
  prioritizedSummary: { category: DefectCategory; count: number; priority: "P0" | "P1" | "P2" }[];
}

function categoryOf(row: ClassifiedUnresolved): DefectCategory {
  if (row.rootCause === "MISSING_DEFINITION") return "MISSING_DEFINITIONS";
  if (row.rootCause === "AMENDMENT_TARGET_RESOLUTION") return "AMENDMENT_TARGET_RESOLUTION";
  if (row.rootCause === "STRUCTURAL_PARSING_FAILURE") return "STRUCTURAL_PARSING_FAILURE";
  if (row.rootCause === "MISSING_EXTERNAL_DOCUMENT" || row.kind === "COVENANT_TO_CROSS_DOCUMENT") return "CROSS_DOCUMENT_RESTRICTIONS";
  if (row.kind === "COVENANT_TO_SHARED_BASKET") return "SHARED_CAPACITY";
  if (row.kind === "RECLASSIFICATION") return "RECLASSIFICATION";
  if (row.kind === "COVENANT_TO_CONDITION") return "REMOTE_CONDITIONS";
  if (row.rootCause === "AMBIGUOUS_REFERENCE") return "AMBIGUOUS_REFERENCE";
  return "OTHER";
}

function priorityOf(cat: DefectCategory): "P0" | "P1" | "P2" {
  if (cat === "REMOTE_CONDITIONS" || cat === "SHARED_CAPACITY" || cat === "CROSS_DOCUMENT_RESTRICTIONS" || cat === "RECLASSIFICATION") {
    return "P0";
  }
  if (cat === "AMENDMENT_TARGET_RESOLUTION" || cat === "AMBIGUOUS_REFERENCE" || cat === "MISSING_DEFINITIONS") return "P1";
  return "P2";
}

function ownerOf(cat: DefectCategory): string {
  switch (cat) {
    case "MISSING_DEFINITIONS":
      return "Definition Encyclopedia + Structural Compiler";
    case "AMENDMENT_TARGET_RESOLUTION":
      return "Structural Compiler / package-graph relationship-resolution";
    case "STRUCTURAL_PARSING_FAILURE":
      return "Structural Compiler (stage-structure)";
    case "REMOTE_CONDITIONS":
      return "IPV-21 remediation owner + reference resolver";
    case "SHARED_CAPACITY":
      return "Covenant Knowledge / shared-basket modeling";
    case "RECLASSIFICATION":
      return "Discovery + legal-rule owners (no Atlas fabrication)";
    case "CROSS_DOCUMENT_RESTRICTIONS":
      return "Package-graph / CKF cross-document identity";
    case "AMBIGUOUS_REFERENCE":
      return "Structural reference resolver (duplicate TOC/body paths)";
    default:
      return "Atlas coordination";
  }
}

export function analyzeControllingRisks(edges: AtlasEdge[]): ControllingRiskReport {
  const report = classifyUnresolvedEdges(edges);
  const riskRows = report.all.filter((r) => r.controllingRestrictionRisk);
  const byCategory = {
    MISSING_DEFINITIONS: 0,
    AMENDMENT_TARGET_RESOLUTION: 0,
    STRUCTURAL_PARSING_FAILURE: 0,
    REMOTE_CONDITIONS: 0,
    SHARED_CAPACITY: 0,
    RECLASSIFICATION: 0,
    CROSS_DOCUMENT_RESTRICTIONS: 0,
    AMBIGUOUS_REFERENCE: 0,
    OTHER: 0,
  } satisfies Record<DefectCategory, number>;

  const defectCards: DefectCard[] = [];
  for (const row of riskRows) {
    const category = categoryOf(row);
    byCategory[category] += 1;
    const span = row.sourceSpans[0];
    defectCards.push({
      cardId: `defect:${row.edgeId.slice(0, 48)}`,
      category,
      priority: priorityOf(category),
      edgeId: row.edgeId,
      documentId: row.documentId,
      kind: row.kind,
      rootCause: row.rootCause,
      title: `${category}: ${row.kind} remains ${row.resolution}`,
      evidenceExcerpt: span?.excerpt ?? null,
      sourceFile: span?.sourceFile ?? null,
      sectionRef: span?.sectionRef ?? null,
      unresolvedReason: row.unresolvedReason,
      recommendedOwner: ownerOf(category),
      doNotInfer: "Do not invent amendment/section/definition targets without unique structural evidence.",
    });
  }

  // Sort cards: P0 first, then by category count relevance; keep all but summarize top
  const priorityRank = { P0: 0, P1: 1, P2: 2 };
  defectCards.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.category.localeCompare(b.category));

  const prioritizedSummary = (Object.keys(byCategory) as DefectCategory[])
    .map((category) => ({ category, count: byCategory[category], priority: priorityOf(category) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.count - a.count);

  return {
    totalOpenControllingRisks: riskRows.length,
    byCategory,
    defectCards,
    prioritizedSummary,
  };
}
