/**
 * Before/after comparison across base vs amendment summary items.
 * Surfaces differences; does not silently choose operative language.
 */

import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import type { AmendmentPackageView } from "./amendment-package";

export interface AmendmentCompareRow {
  sectionRef: string;
  category: string;
  changeKind: "ADDED_IN_AMENDMENT" | "PRESENT_IN_BASE_ONLY" | "BOTH_PRESENT" | "THRESHOLD_OR_TEXT_SHIFT";
  baseHeading?: string;
  amendmentHeading?: string;
  baseExcerpt?: string;
  amendmentExcerpt?: string;
  note: string;
}

export interface AmendmentCompareView {
  operativeResolution: AmendmentPackageView["operativeResolution"];
  rows: AmendmentCompareRow[];
  unresolvedReasons: string[];
  note: string;
}

type ItemWithDoc = CovenantSummaryItem & { sourceId: string; documentTitle: string };

export function compareAmendmentSummaries(params: {
  amendmentPackage: AmendmentPackageView | null;
  items: ItemWithDoc[];
}): AmendmentCompareView {
  const ap = params.amendmentPackage;
  if (!ap || ap.baseCandidates.length === 0 || ap.amendmentDocuments.length === 0) {
    return {
      operativeResolution: ap?.operativeResolution ?? "NO_DOCUMENTS",
      rows: [],
      unresolvedReasons: ap?.unresolvedReasons ?? ["No base+amendment pair available for comparison."],
      note: "Upload a base agreement and an amendment to enable before/after comparison.",
    };
  }

  const baseIds = new Set(ap.baseCandidates.map((b) => b.sourceId));
  const amdIds = new Set(ap.amendmentDocuments.map((a) => a.sourceId));
  const baseItems = params.items.filter((i) => baseIds.has(i.sourceId));
  const amdItems = params.items.filter((i) => amdIds.has(i.sourceId));

  const baseBySec = new Map(baseItems.map((i) => [i.sectionRef, i]));
  const amdBySec = new Map(amdItems.map((i) => [i.sectionRef, i]));
  const allSecs = Array.from(new Set([...baseBySec.keys(), ...amdBySec.keys()])).sort();

  const rows: AmendmentCompareRow[] = [];
  for (const sec of allSecs) {
    const b = baseBySec.get(sec);
    const a = amdBySec.get(sec);
    if (b && !a) {
      rows.push({
        sectionRef: sec,
        category: b.category,
        changeKind: "PRESENT_IN_BASE_ONLY",
        baseHeading: b.heading,
        baseExcerpt: b.operativeLanguageExcerpt.slice(0, 220),
        note: "Section analyzed in base document; no matching section analysis in amendment document (may be unamended, not re-extracted, or superseded).",
      });
    } else if (a && !b) {
      rows.push({
        sectionRef: sec,
        category: a.category,
        changeKind: "ADDED_IN_AMENDMENT",
        amendmentHeading: a.heading,
        amendmentExcerpt: a.operativeLanguageExcerpt.slice(0, 220),
        note: "Section analysis appears in amendment document without a matching base section analysis.",
      });
    } else if (a && b) {
      const basketShift =
        JSON.stringify(b.materialBasketsThresholds) !== JSON.stringify(a.materialBasketsThresholds);
      const textShift = b.operativeLanguageExcerpt.slice(0, 120) !== a.operativeLanguageExcerpt.slice(0, 120);
      rows.push({
        sectionRef: sec,
        category: a.category,
        changeKind: basketShift || textShift ? "THRESHOLD_OR_TEXT_SHIFT" : "BOTH_PRESENT",
        baseHeading: b.heading,
        amendmentHeading: a.heading,
        baseExcerpt: b.operativeLanguageExcerpt.slice(0, 180),
        amendmentExcerpt: a.operativeLanguageExcerpt.slice(0, 180),
        note: basketShift
          ? "Basket/threshold signals differ between base and amendment analyses — review original language; precedence may be unresolved."
          : textShift
            ? "Operative excerpt differs — compare citations; do not assume amendment is operative without effectiveness evidence."
            : "Both documents have analyses for this section reference; confirm which version governs.",
      });
    }
  }

  return {
    operativeResolution: ap.operativeResolution,
    rows: rows.slice(0, 40),
    unresolvedReasons: ap.unresolvedReasons,
    note: "Before/after rows are discovery comparisons of persisted analyses. UNRESOLVED_PRECEDENCE means Headroom will not select the operative version.",
  };
}
