/**
 * Section-tree basket candidates (general logic; no per-issuer branches).
 *
 * For real document text only (never the candidate-excerpt composite): every CLAUSE node whose
 * role is BASKET or EXCEPTION_PROVISO becomes a basket whose operative text is an EXACT span of
 * the document — the whole clause when it is a leaf, otherwise its lead-in up to the first child
 * (children are emitted on their own). Family comes from the enclosing section title through the
 * same resolver the regional extractor uses; sections that resolve to OTHER (mechanics, definitions,
 * boilerplate) are skipped. Enabled unless CLF_TREE_BASKETS=0.
 */
import { resolveFamily } from "../../contract-model/covenant-computation/extract-baskets";
import type { BasketClause } from "../../contract-model/covenant-computation/types";
import { parseSectionTree, sectionOf } from "../../contract-model/section-tree/parse";
import { roleOf } from "../../contract-model/section-tree/semantics";
import type { LearnedRuleSet } from "../learned-rules/types";

export function treeBaskets(documentId: string, text: string, rules?: LearnedRuleSet): BasketClause[] {
  const tree = parseSectionTree(text);
  const out: BasketClause[] = [];
  for (const node of tree.nodes) {
    if (node.kind !== "CLAUSE") continue;
    const sec = sectionOf(tree, node);
    if (!sec || sec.status === "FAIL_CLOSED") continue;
    const role = roleOf(tree, text, node);
    if (role !== "BASKET" && role !== "EXCEPTION_PROVISO") continue;
    // Only covenant sections: a "$"/"%" clause in borrowing mechanics or definitions is not a basket.
    const family = resolveFamily(sec.title ?? "", rules);
    if (family === "OTHER") continue;
    const firstChild = node.childIds.map((id) => tree.byId.get(id)!).sort((a, b) => a.start - b.start)[0];
    const end = firstChild ? firstChild.start : node.end;
    const span = text.slice(node.start, end).trim();
    if (span.length < 24) continue;
    out.push({
      stableKey: `tree-${node.path}`,
      sectionRef: `Section ${sec.label} ${node.path}`,
      covenantFamily: family,
      documentId,
      operativeText: span,
      role: "PERMISSION",
    });
  }
  return out;
}
