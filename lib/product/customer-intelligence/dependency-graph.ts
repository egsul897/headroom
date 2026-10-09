/**
 * Source-backed cross-covenant dependency edges from persisted summary items.
 * Does not invent permissions across regimes.
 */

import type { CovenantCategoryKey, CovenantSummaryItem } from "../covenant-intelligence/summarize";

export type DependencyEdgeKind =
  | "DEBT_TO_LIEN"
  | "RP_TO_INVESTMENT"
  | "CROSS_REFERENCE"
  | "SHARED_CATEGORY"
  | "DEFINITION";

export interface CovenantDependencyEdge {
  kind: DependencyEdgeKind;
  fromSectionRef: string;
  fromCategory: CovenantCategoryKey;
  toSectionRef: string;
  toCategory: CovenantCategoryKey;
  rationale: string;
  fromDocumentTitle: string;
  toDocumentTitle: string;
}

export interface CovenantDependencyGraph {
  edgeCount: number;
  edges: CovenantDependencyEdge[];
  cycles: string[];
  note: string;
}

type ItemRef = CovenantSummaryItem & { sourceId: string; documentTitle: string };

function sectionKey(item: ItemRef): string {
  return `${item.sourceId}::${item.sectionRef}`;
}

/** Build edges among analyzed provisions in one workspace. */
export function buildCovenantDependencyGraph(items: ItemRef[]): CovenantDependencyGraph {
  const edges: CovenantDependencyEdge[] = [];
  const bySection = new Map<string, ItemRef>();
  for (const item of items) {
    bySection.set(item.sectionRef.toLowerCase(), item);
    bySection.set(sectionKey(item).toLowerCase(), item);
  }

  const debt = items.filter((i) => i.category === "DEBT_INCURRENCE");
  const liens = items.filter((i) => i.category === "LIENS_SECURED_DEBT");
  const rp = items.filter((i) => i.category === "RESTRICTED_PAYMENTS_INVESTMENTS");

  for (const d of debt) {
    for (const l of liens.slice(0, 4)) {
      edges.push({
        kind: "DEBT_TO_LIEN",
        fromSectionRef: d.sectionRef,
        fromCategory: d.category,
        toSectionRef: l.sectionRef,
        toCategory: l.category,
        rationale:
          "Secured debt typically requires independent satisfaction of both Indebtedness and Liens regimes — permission under one is not permission under the other.",
        fromDocumentTitle: d.documentTitle,
        toDocumentTitle: l.documentTitle,
      });
    }
  }

  // RP ↔ investment language within the same family (self-edges via distinct sections)
  for (let i = 0; i < rp.length; i++) {
    for (let j = i + 1; j < Math.min(rp.length, i + 3); j++) {
      const a = rp[i]!;
      const b = rp[j]!;
      const hay = `${a.heading} ${a.plainEnglish} ${b.heading} ${b.plainEnglish}`.toLowerCase();
      if (/investment|unrestricted|restricted payment|dividend/.test(hay)) {
        edges.push({
          kind: "RP_TO_INVESTMENT",
          fromSectionRef: a.sectionRef,
          fromCategory: a.category,
          toSectionRef: b.sectionRef,
          toCategory: b.category,
          rationale:
            "Restricted payments and investments often share baskets, builder amounts, or designation conditions — treat jointly when analyzing either.",
          fromDocumentTitle: a.documentTitle,
          toDocumentTitle: b.documentTitle,
        });
      }
    }
  }

  for (const item of items) {
    for (const ref of (item.crossReferences ?? []).slice(0, 4)) {
      const m = ref.match(/(?:section|§)\s*([0-9]+(?:\.[0-9]+)?[a-z0-9().-]*)/i);
      if (!m) continue;
      const targetRef = m[1]!;
      const target = items.find(
        (t) =>
          t.sectionRef === targetRef ||
          t.sectionRef.startsWith(targetRef) ||
          targetRef.startsWith(t.sectionRef),
      );
      if (!target || target === item) continue;
      edges.push({
        kind: "CROSS_REFERENCE",
        fromSectionRef: item.sectionRef,
        fromCategory: item.category,
        toSectionRef: target.sectionRef,
        toCategory: target.category,
        rationale: `Cross-reference in source text: ${ref.slice(0, 120)}`,
        fromDocumentTitle: item.documentTitle,
        toDocumentTitle: target.documentTitle,
      });
    }
    for (const dep of (item.dependencies ?? []).slice(0, 2)) {
      const m = dep.match(/(?:section|§)\s*([0-9]+(?:\.[0-9]+)?[a-z0-9().-]*)/i);
      if (!m) continue;
      const targetRef = m[1]!;
      const target = items.find((t) => t.sectionRef === targetRef || t.sectionRef.startsWith(targetRef));
      if (!target || target === item) continue;
      edges.push({
        kind: "CROSS_REFERENCE",
        fromSectionRef: item.sectionRef,
        fromCategory: item.category,
        toSectionRef: target.sectionRef,
        toCategory: target.category,
        rationale: dep.slice(0, 160),
        fromDocumentTitle: item.documentTitle,
        toDocumentTitle: target.documentTitle,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniq = edges.filter((e) => {
    const k = `${e.kind}|${e.fromSectionRef}|${e.toSectionRef}|${e.rationale.slice(0, 40)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const cycles = detectSimpleCycles(uniq);

  return {
    edgeCount: uniq.length,
    edges: uniq.slice(0, 40),
    cycles,
    note: "Edges are discovery-backed relationship hints for review. They do not authorize transactions or establish shared capacity.",
  };
}

function detectSimpleCycles(edges: CovenantDependencyEdge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.fromSectionRef === e.toSectionRef) continue;
    const list = adj.get(e.fromSectionRef) ?? [];
    list.push(e.toSectionRef);
    adj.set(e.fromSectionRef, list);
  }
  const cycles: string[] = [];
  for (const [start, neighbors] of adj) {
    for (const mid of neighbors) {
      const next = adj.get(mid) ?? [];
      if (next.includes(start)) {
        const label = [start, mid, start].join(" → ");
        if (!cycles.includes(label) && cycles.length < 8) cycles.push(label);
      }
    }
  }
  return cycles;
}
