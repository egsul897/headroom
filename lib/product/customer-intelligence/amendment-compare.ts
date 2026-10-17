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
  /**
   * General rule: silent truncation is a lie (mirrors the summary
   * shape from rule 7). totalRowsBeforeCap is the pre-cap row
   * count; truncated is true when the 40-row cap dropped rows.
   */
  totalRowsBeforeCap: number;
  truncated: boolean;
  /**
   * Amendment-internal scaffolding articles (normalized arabic),
   * derived from the FULL pre-cap row list (Rule 183c). The
   * resolver needs articles whose rows sit past the 40-row cap
   * (e.g. article IV "Closing Conditions" with subsections
   * 4.1(a)) — deriving from the capped rows misses them.
   */
  scaffoldingArticles: string[];
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
      totalRowsBeforeCap: 0,
      truncated: false,
      scaffoldingArticles: [],
    };
  }

  const baseIds = new Set(ap.baseCandidates.map((b) => b.sourceId));
  const amdIds = new Set(ap.amendmentDocuments.map((a) => a.sourceId));
  const baseItems = params.items.filter((i) => baseIds.has(i.sourceId));
  const amdItems = params.items.filter((i) => amdIds.has(i.sourceId));

  // Group by ref — do NOT collapse with a Map keyed by ref: one
  // document can legitimately carry two items under the same ref
  // (base + amendment versions of §6.01 in a single PDF), and two
  // base docs can share a ref. Collapsing silently picked one and
  // could emit a bindable SHIFT/ADDED row from an arbitrary pick.
  const groupByRef = (list: ItemWithDoc[]): Map<string, ItemWithDoc[]> => {
    const m = new Map<string, ItemWithDoc[]>();
    for (const i of list) m.set(i.sectionRef, [...(m.get(i.sectionRef) ?? []), i]);
    return m;
  };
  const baseBySec = groupByRef(baseItems);
  const amdBySec = groupByRef(amdItems);
  const allSecs = Array.from(new Set([...baseBySec.keys(), ...amdBySec.keys()])).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const rows: AmendmentCompareRow[] = [];
  for (const sec of allSecs) {
    const bList = baseBySec.get(sec) ?? [];
    const aList = amdBySec.get(sec) ?? [];
    const b = bList[0];
    const a = aList[0];
    if (bList.length > 1 || aList.length > 1) {
      // Duplicate refs on either side: the comparison is ambiguous.
      // Emit BOTH_PRESENT (never a bindable kind) with a duplicate
      // note so the resolver cannot bind from a collapsed pick.
      rows.push({
        sectionRef: sec,
        category: (a ?? b)!.category,
        changeKind: "BOTH_PRESENT",
        baseHeading: b?.heading,
        amendmentHeading: a?.heading,
        baseExcerpt: b?.operativeLanguageExcerpt.slice(0, 180),
        amendmentExcerpt: a?.operativeLanguageExcerpt.slice(0, 180),
        note: `Section ${sec} appears ${bList.length > 1 ? `${bList.length} times in base analysis` : ""}${bList.length > 1 && aList.length > 1 ? " and " : ""}${aList.length > 1 ? `${aList.length} times in amendment analysis` : ""} (duplicate section refs) — comparison not bound; counsel review required.`,
      });
      continue;
    }
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
      // Compare normalized FULL excerpts: the old 120-char prefix
      // comparison missed proviso/condition changes after char 120
      // (identical opening, different tail) and reported
      // BOTH_PRESENT — so the resolver never bound the amended text.
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const textShift = norm(b.operativeLanguageExcerpt) !== norm(a.operativeLanguageExcerpt);
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
    scaffoldingArticles: deriveScaffoldingArticles(rows),
    rows: rows.slice(0, 40),
    unresolvedReasons: ap.unresolvedReasons,
    note: "Before/after rows are discovery comparisons of persisted analyses. UNRESOLVED_PRECEDENCE means Headroom will not select the operative version.",
    totalRowsBeforeCap: rows.length,
    truncated: rows.length > 40,
  };
}

/** Roman-numeral articles ("IV") and arabic subsection refs ("4.1(a)") name the same article. */
function romanToArabic(t: string): string {
  const ROMAN: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6", VII: "7", VIII: "8", IX: "9", X: "10", XI: "11", XII: "12", XIII: "13", XIV: "14", XV: "15" };
  return ROMAN[t.toUpperCase()] ?? t;
}
export function articleOf(ref: string): string {
  return romanToArabic(ref.split(/[.(]/)[0] ?? ref);
}

/**
 * Amendment-internal scaffolding articles (Rule 183c): an
 * amendment document's sections are instructions or
 * amendment-internal scaffolding unless they demonstrably restate
 * a base section. Scaffolding articles are derived from the
 * amendment's own article-level items (e.g. an amendment item
 * [3] headed "Conditions Precedent" makes Article 3 scaffolding,
 * so [3.4] — a condition-precedent subsection — is scaffolding
 * too). The "Amendments" instruction container applies at ANY
 * level (an amendment numbers its articles as sections — §3.1
 * "Amendments" is the container, not operative content).
 * Headings carry newlines and can truncate mid-phrase, so
 * heading + excerpt are normalized before matching.
 */
export function deriveScaffoldingArticles(rows: AmendmentCompareRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.changeKind !== "ADDED_IN_AMENDMENT") continue;
    const headingOnly = (r.amendmentHeading ?? "").replace(/\s+/g, " ").trim();
    const headingNorm = `${r.amendmentHeading ?? ""} ${r.amendmentExcerpt ?? ""}`.replace(/\s+/g, " ").trim();
    if (/^\s*(?:Section\s+\S+\s+)?amendments?\s*$/i.test(headingOnly)) {
      out.add(articleOf(r.sectionRef));
      continue;
    }
    if (/[.(]/.test(r.sectionRef)) continue; // article-level only
    if (
      /\bconditions precedent\b|\bclosing conditions\b|\brepresentations and warranties\b|\bmiscellaneous\b|\beffectiveness\b|\bgeneral provisions\b|\bcounterparts\b|\bgoverning law\b|\bnotices\b|\bdefined terms\b/i.test(
        headingNorm,
      )
    ) {
      out.add(articleOf(r.sectionRef));
    }
  }
  return [...out];
}
