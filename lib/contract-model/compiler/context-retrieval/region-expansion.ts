/**
 * Phase 2E.1 - generalized referenced-region expansion policy (remediation
 * task §5/§7). A resolved structural node's OWN text is not always
 * self-contained: real operative content routinely continues into a
 * descendant the structural parser did not separate as a sibling (a
 * single "swallowing" child holding the actual substance), or is spread
 * across several real, independently-drafted child clauses. Blindly using
 * only OWN text silently drops that continuation; blindly using full
 * DESCENDANTS text for every multi-child node risks retrieving large,
 * irrelevant fan-out. This module picks a bounded middle ground using
 * structural evidence only - never company/section-specific rules:
 *
 * - Zero children: OWN text is already everything (DESCENDANTS === OWN).
 * - Exactly one child: the child is definitionally pure continuation, not
 *   fan-out - always included, recursively, up to a depth cap.
 * - Multiple children: only children whose OWN text carries a real
 *   operative/economic/legal signal are included; excluded children are
 *   reported back so the caller can disclose the omission (never silently
 *   drop material content without a trace - task §7/§10).
 */
import type { StructuralIndex } from "../structural-index";

const OPERATIVE_SIGNAL = /[$£€]\s?[\d,]+|%|\bgreater of\b|\blesser of\b|\bshall not\b|\bmay not\b|\bwill not\b|\bpermit(?:ted)?\b|\bprovided(?:,?\s+(?:that|further|however))\b|\bexcept(?:\s+that|\s+as)?\b|\bnotwithstanding\b|\bso long as\b|\bratio\b|\bEBITDA\b|\bTest Period\b|\bpro forma\b|\baggregate\b|\bcalculat/i;

const MAX_EXPANSION_DEPTH = 4;
/**
 * A node with more than this many direct children is a genuine multi-basket
 * enumeration (real FWRG/LSB negative-covenant sections routinely list 20-40
 * independently operative baskets) - measured directly during this
 * remediation's own construction: a bare operative-signal filter does NOT
 * meaningfully bound a section at this scale, since most real baskets
 * legitimately carry SOME economic/legal signal, so "signal-filtered
 * fan-out" degrades into "retrieve nearly the entire section" exactly the
 * behavior task §9/§15 forbid. Below this threshold (a small, bounded set
 * of paired sub-conditions under one clause - the real 2-3-child shape
 * this remediation's own findings showed), signal-filtered inclusion is
 * safe and proportionate; at or above it, only the node's own OWN text is
 * used and no descendant is auto-included, full stop - a human/downstream
 * consumer can still navigate to any specific child by its own citation.
 */
const MAX_CHILDREN_FOR_MULTI_CHILD_EXPANSION = 3;

export interface RegionExpansionResult {
  text: string;
  /** Descendant nodeKeys whose own text was folded into `text`, in traversal order. */
  includedNodeKeys: string[];
  /** Descendant nodeKeys considered (a real child of an included multi-child node) but excluded because their own text showed no operative signal - disclosed, never silently dropped without a trace. */
  excludedNodeKeys: string[];
}

function expandRecursive(index: StructuralIndex, nodeKey: string, depth: number): RegionExpansionResult {
  const ownText = index.getNodeText(nodeKey, "OWN");
  if (depth >= MAX_EXPANSION_DEPTH) return { text: ownText, includedNodeKeys: [], excludedNodeKeys: [] };

  const children = index.getChildren(nodeKey);
  if (children.length === 0) return { text: ownText, includedNodeKeys: [], excludedNodeKeys: [] };

  if (children.length === 1) {
    const child = children[0]!;
    const sub = expandRecursive(index, child.nodeKey, depth + 1);
    return { text: `${ownText} ${sub.text}`.trim(), includedNodeKeys: [child.nodeKey, ...sub.includedNodeKeys], excludedNodeKeys: sub.excludedNodeKeys };
  }

  if (children.length > MAX_CHILDREN_FOR_MULTI_CHILD_EXPANSION) {
    // A genuine multi-basket fan-out - never auto-expanded (see the
    // threshold's own doc comment). OWN text only, no per-child disclosure.
    return { text: ownText, includedNodeKeys: [], excludedNodeKeys: [] };
  }

  let text = ownText;
  const included: string[] = [];
  const excluded: string[] = [];
  for (const child of children) {
    const childOwn = index.getNodeText(child.nodeKey, "OWN");
    if (OPERATIVE_SIGNAL.test(childOwn)) {
      text += ` ${childOwn}`;
      included.push(child.nodeKey);
    } else {
      excluded.push(child.nodeKey);
    }
  }
  return { text: text.trim(), includedNodeKeys: included, excludedNodeKeys: excluded };
}

/** Entry point: bounded expansion of one structural node's own retrievable region. */
export function expandReferencedRegion(index: StructuralIndex, nodeKey: string): RegionExpansionResult {
  return expandRecursive(index, nodeKey, 0);
}
