/**
 * Covenant explorer catalog for CONMED demo — sourced from human ground truth.
 * Capacity labeled STRUCTURE_ONLY / NEEDS_FINANCIAL_INPUTS — never executable capacity.
 */

import {
  DOCUMENT_A_UNITS,
  PACKAGE_FACTS,
} from "../../../tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth";

export type CapacityDeterminationStatus =
  | "STRUCTURE_ONLY"
  | "NEEDS_FINANCIAL_INPUTS"
  | "RATIO_GATED_UNRESOLVED"
  | "OUT_OF_PACKAGE_UNRESOLVED"
  | "SCHEDULE_DEPENDENT_UNRESOLVED"
  | "PROHIBITION_STRUCTURE";

export interface CovenantExplorerRow {
  id: string;
  sectionRef: string;
  family: string;
  summary: string;
  realFigures: string[];
  isBasketLevel: boolean;
  parentUnit?: string;
  requiredDefinedTerms: string[];
  materiality: string;
  clarity: string;
  capacityStatus: CapacityDeterminationStatus;
  capacityExplanation: string;
  evidenceDocumentId: string;
  demoDocumentId: string;
}

export interface PackageFactRow {
  id: string;
  fact: string;
  evidenceDocumentId: string;
  evidenceCitation: string;
  clarity: string;
  demoDocumentId: string;
}

const DOC_MAP: Record<string, string> = {
  "conmed-doc-a-eighth-ar-credit-agreement": "conmed-demo-doc-a",
  "conmed-doc-b-guarantee-collateral-agreement": "conmed-demo-doc-b",
  "conmed-doc-c-second-amendment-2022": "conmed-demo-doc-c",
  "conmed-doc-d-first-omnibus-amendment-2026": "conmed-demo-doc-d",
};

function capacityFor(unit: (typeof DOCUMENT_A_UNITS)[number]): {
  capacityStatus: CapacityDeterminationStatus;
  capacityExplanation: string;
} {
  if (unit.sourceSectionRef.startsWith("7.1")) {
    return {
      capacityStatus: "NEEDS_FINANCIAL_INPUTS",
      capacityExplanation:
        "Maintenance ratios are known from source text, but pass/fail requires an approved financial snapshot (leverage, coverage, liquidity). No numeric compliance is asserted.",
    };
  }
  if (unit.realFigures.some((f) => /% of Consolidated|Pro Forma|to 1\.00/i.test(f))) {
    return {
      capacityStatus: "RATIO_GATED_UNRESOLVED",
      capacityExplanation:
        "Basket structure and figures are source-backed. Remaining capacity cannot be quantified without Consolidated Total Assets / EBITDA / leverage inputs and utilization ledger.",
    };
  }
  if (unit.realFigures.some((f) => /Schedule/i.test(f)) || /Schedule/i.test(unit.summary)) {
    return {
      capacityStatus: "SCHEDULE_DEPENDENT_UNRESOLVED",
      capacityExplanation:
        "Depends on a schedule or annex not fully modeled in this demo workspace.",
    };
  }
  if (unit.realFigures.length > 0 && unit.isBasketLevel) {
    return {
      capacityStatus: "NEEDS_FINANCIAL_INPUTS",
      capacityExplanation:
        "Dollar/grower basket ceilings are cited from the agreement. Utilized and remaining capacity are unknown — no default zero usage is assumed.",
    };
  }
  if (!unit.isBasketLevel && unit.family !== "OTHER") {
    return {
      capacityStatus: "PROHIBITION_STRUCTURE",
      capacityExplanation:
        "General prohibition / covenant family structure from Article VII. Exceptions and baskets listed separately. Not a capacity number.",
    };
  }
  return {
    capacityStatus: "STRUCTURE_ONLY",
    capacityExplanation:
      "Source-backed structural description only. Not executable legal capacity.",
  };
}

export function listConmedCovenantExplorerRows(): CovenantExplorerRow[] {
  return DOCUMENT_A_UNITS.filter((u) => u.id !== "a-7.7").map((unit) => {
    const { capacityStatus, capacityExplanation } = capacityFor(unit);
    return {
      id: unit.id,
      sectionRef: unit.sourceSectionRef,
      family: unit.family,
      summary: unit.summary,
      realFigures: unit.realFigures,
      isBasketLevel: unit.isBasketLevel,
      parentUnit: unit.parentUnit,
      requiredDefinedTerms: unit.requiredDefinedTerms,
      materiality: unit.materiality,
      clarity: unit.clarity,
      capacityStatus,
      capacityExplanation,
      evidenceDocumentId: unit.documentId,
      demoDocumentId: DOC_MAP[unit.documentId] ?? "conmed-demo-doc-a",
    };
  });
}

export function listConmedPackageFacts(): PackageFactRow[] {
  return PACKAGE_FACTS.map((f) => ({
    ...f,
    demoDocumentId: DOC_MAP[f.evidenceDocumentId] ?? "conmed-demo-doc-a",
  }));
}

export function getConmedCovenantById(id: string): CovenantExplorerRow | undefined {
  return listConmedCovenantExplorerRows().find((r) => r.id === id);
}
