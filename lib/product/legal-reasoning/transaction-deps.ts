/**
 * Contractual dependency traversal for a contemplated transaction kind.
 * Walks the existing covenant dependency graph — does not invent permissions.
 */
import {
  buildCovenantDependencyGraph,
  type CovenantDependencyEdge,
  type CovenantDependencyGraph,
} from "../customer-intelligence/dependency-graph";
import type { CovenantCategoryKey, CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { detectPatternsInText } from "../../knowledge-factory/patterns/library";

export type TransactionKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ACQUISITION"
  | "ASSET_SALE"
  | "REFINANCING"
  | "LIABILITY_MANAGEMENT"
  | "SUBSIDIARY_DESIGNATION";

const SEED_CATEGORIES: Record<TransactionKind, CovenantCategoryKey[]> = {
  SECURED_DEBT: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
  UNSECURED_DEBT: ["DEBT_INCURRENCE"],
  RESTRICTED_PAYMENT: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
  INVESTMENT: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
  ACQUISITION: ["DEBT_INCURRENCE", "RESTRICTED_PAYMENTS_INVESTMENTS", "LIENS_SECURED_DEBT"],
  ASSET_SALE: ["ASSET_SALES", "RESTRICTED_PAYMENTS_INVESTMENTS"],
  REFINANCING: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
  LIABILITY_MANAGEMENT: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT", "RESTRICTED_PAYMENTS_INVESTMENTS"],
  SUBSIDIARY_DESIGNATION: ["RESTRICTED_PAYMENTS_INVESTMENTS", "BASKETS_EXCEPTIONS_CONDITIONS"],
};

export interface TaggedProvision {
  sourceId: string;
  documentTitle: string;
  sectionRef: string;
  category: CovenantCategoryKey;
  heading: string;
  patternIds: string[];
  role: "RESTRICTION_CANDIDATE" | "PERMISSION_CANDIDATE" | "DEFINITION" | "RELATED";
}

export interface TransactionDependencyBundle {
  transactionKind: TransactionKind;
  seedCategories: CovenantCategoryKey[];
  graph: CovenantDependencyGraph;
  traversedEdges: CovenantDependencyEdge[];
  provisions: TaggedProvision[];
  missingCategories: CovenantCategoryKey[];
  patternHits: string[];
  limitations: string[];
}

type ItemRef = CovenantSummaryItem & { sourceId: string; documentTitle: string };

function roleFor(category: CovenantCategoryKey, text: string): TaggedProvision["role"] {
  if (
    category === "BASKETS_EXCEPTIONS_CONDITIONS" ||
    /\b(?:means|defined|definition)\b/i.test(text)
  ) {
    if (/\bmeans\b/i.test(text) && !/shall not|may not/i.test(text)) return "DEFINITION";
  }
  if (/shall not|may not|no .* shall|prohibited/i.test(text)) return "RESTRICTION_CANDIDATE";
  if (/provided that|except|permitted|so long as/i.test(text)) return "PERMISSION_CANDIDATE";
  return "RELATED";
}

/** Map free-text Ask / exercise questions onto a transaction kind seed. */
export function inferTransactionKind(question: string): TransactionKind | null {
  const s = question.toLowerCase();
  if (/liability\s+management|exchange\s+offer|open[\s-]market\s+purchase|debt\s+repurchase/.test(s)) {
    return "LIABILITY_MANAGEMENT";
  }
  if (/designate|unrestricted\s+subsidiar/.test(s)) return "SUBSIDIARY_DESIGNATION";
  if (/refinanc/.test(s)) return "REFINANCING";
  if (/asset\s+sale|disposition|reinvest/.test(s)) return "ASSET_SALE";
  if (/acquisition|acquire/.test(s)) return "ACQUISITION";
  if (/restricted\s+payment|dividend|distribution|share\s+repurchase/.test(s)) {
    return "RESTRICTED_PAYMENT";
  }
  if (/investment/.test(s)) return "INVESTMENT";
  if (/secured|lien|collateral/.test(s)) return "SECURED_DEBT";
  if (/incur|borrow|indebtedness|unsecured|debt/.test(s)) return "UNSECURED_DEBT";
  return null;
}

/**
 * Retrieve provisions and dependency edges relevant to a transaction kind.
 * BFS from seed categories along the discovery dependency graph (depth-limited).
 */
export function retrieveTransactionDependencies(params: {
  transactionKind: TransactionKind;
  items: ItemRef[];
  maxDepth?: number;
}): TransactionDependencyBundle {
  const maxDepth = params.maxDepth ?? 2;
  const seedCategories = SEED_CATEGORIES[params.transactionKind];
  const graph = buildCovenantDependencyGraph(params.items);
  const seedItems = params.items.filter((i) => seedCategories.includes(i.category));
  const missingCategories = seedCategories.filter((c) => !params.items.some((i) => i.category === c));

  const visited = new Set<string>();
  const queue: Array<{ sectionRef: string; depth: number }> = seedItems.map((i) => ({
    sectionRef: i.sectionRef,
    depth: 0,
  }));
  const keptEdges: CovenantDependencyEdge[] = [];

  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur.sectionRef)) continue;
    visited.add(cur.sectionRef);
    if (cur.depth >= maxDepth) continue;
    for (const e of graph.edges) {
      if (e.fromSectionRef !== cur.sectionRef && e.toSectionRef !== cur.sectionRef) continue;
      keptEdges.push(e);
      const next = e.fromSectionRef === cur.sectionRef ? e.toSectionRef : e.fromSectionRef;
      if (!visited.has(next)) queue.push({ sectionRef: next, depth: cur.depth + 1 });
    }
  }

  const provisions: TaggedProvision[] = [];
  const patternHits = new Set<string>();
  for (const item of params.items) {
    if (!visited.has(item.sectionRef) && !seedCategories.includes(item.category)) continue;
    const text = `${item.heading} ${item.plainEnglish} ${(item.materialBasketsThresholds ?? []).join(" ")}`;
    const patternIds = detectPatternsInText(text);
    for (const p of patternIds) patternHits.add(p);
    provisions.push({
      sourceId: item.sourceId,
      documentTitle: item.documentTitle,
      sectionRef: item.sectionRef,
      category: item.category,
      heading: item.heading,
      patternIds,
      role: roleFor(item.category, text),
    });
  }

  const limitations = [
    "Traversal uses discovery-backed edges and summary text — not certified Phase 3 IR.",
    "Pattern hits are structural hypotheses, never executable permissions.",
    "AI-proposed pathways require counsel review before Permission compilation.",
  ];
  if (missingCategories.length) {
    limitations.push(`Missing seed categories in workspace summaries: ${missingCategories.join(", ")}`);
  }

  return {
    transactionKind: params.transactionKind,
    seedCategories,
    graph,
    traversedEdges: keptEdges.slice(0, 60),
    provisions: provisions.slice(0, 80),
    missingCategories,
    patternHits: [...patternHits].sort(),
    limitations,
  };
}
