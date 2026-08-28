/**
 * ARCHITECTURE CHANGE PROPOSAL — Structural Node Identity & Index Integrity
 * (follow-up to Phase 3F.1.1's residual forensics). READ-ONLY: imports and
 * calls the real, unmodified production functions (parseDocumentStructure,
 * buildStructuralIndex) against a small SYNTHETIC document — no DSGR-specific
 * language, names, or section numbers — to prove, in isolation, that a
 * repeated section-number STRING at two distinct physical source locations
 * collides into one nodeKey and (a) makes one physical occurrence
 * unreachable via getNode/getNodeByRef, and (b) merges both occurrences'
 * children into one shared child list keyed by the same collided label.
 *
 * This does not modify structural-index.ts or stage-structure.ts. It proves
 * the failure mechanism described in Phase 3F.1.1's forensic report
 * (docs/phase-3f1-1-residual-safety-forensics.md) using a minimal, general
 * case: a cross-reference sentence that happens to match the SECTION header
 * regex, followed later by the section's real header with the same number.
 * This is a generalized instance of "any two source occurrences that
 * produce the same (documentId, sectionRef) pair" — ToC entries, malformed
 * duplicate numbering, and spurious in-text regex matches are all instances
 * of the same underlying mechanism, not separate bugs.
 *
 * Run via: npx tsx scripts/architecture-proposal-node-identity-repro.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../lib/contract-model/compiler/types";

const OUT_DIR = "tests/fixtures/architecture-audits";

// A synthetic 2-section, generalized document. Section "6.04" is
// deliberately mentioned TWICE in a way that satisfies stage-structure.ts's
// own SECTION_PATTERNS[0] (`Section\s+(\d+\.\d+)\.?\s+(Title)\s*\.`) both
// times: once inside an ordinary in-text cross-reference sentence (which
// the regex cannot distinguish from a real heading — it is not
// line-anchored, and a cross-reference to a capitalized section title
// followed by a period is structurally indistinguishable from a heading),
// and once as the section's real, later heading with real lettered clauses
// beneath it. Section "6.05" is included as a normal, non-colliding control
// to show unaffected sections behave correctly.
const SYNTHETIC_TEXT = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur any obligation except as permitted under Section 6.04 Limitation on Distributions . Such incurrence shall in all cases remain subject to the other provisions of this Article.

Section 6.04 Limitation on Distributions . Neither party shall make any distribution of assets, except:
(a) a distribution payable solely in additional units of its own equity;
(b) a distribution to fund ordinary operating expenses incurred in the ordinary course of business.

Section 6.05 Limitation on Investments . Neither party shall make any investment, except:
(a) an investment in a wholly-owned subsidiary formed after the date hereof;
(b) an investment consisting of cash and cash equivalents.
`.trim();

const DOCUMENT_ID = "synthetic-doc-a";

function main() {
  const nodes: StructuralNode[] = parseDocumentStructure({ documentId: DOCUMENT_ID, label: DOCUMENT_ID, text: SYNTHETIC_TEXT });

  console.log(`\nparseDocumentStructure produced ${nodes.length} raw nodes.\n`);
  for (const n of nodes) {
    console.log(`  [${n.nodeType}] nodeKey=${n.nodeKey}  sectionRef=${n.sectionRef}  charStart=${n.charStart}  parentSectionRef=${n.parentSectionRef ?? "(none)"}`);
  }

  // --- Census: does the "6.04" nodeKey appear more than once among the raw parsed nodes? ---
  const keyCounts = new Map<string, number>();
  for (const n of nodes) keyCounts.set(n.nodeKey, (keyCounts.get(n.nodeKey) ?? 0) + 1);
  const duplicateKeys = [...keyCounts.entries()].filter(([, c]) => c > 1);
  console.log(`\nDuplicate nodeKeys among raw parsed nodes: ${JSON.stringify(Object.fromEntries(duplicateKeys))}`);

  // --- Build the real production index over this synthetic document ---
  const nodesByDocument = new Map([[DOCUMENT_ID, { text: SYNTHETIC_TEXT, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);

  const allIndexed = index.allNodes();
  console.log(`\nindex.allNodes() returns ${allIndexed.length} nodes (every physical occurrence IS present in the flat list).`);

  // The two physical "6.04" occurrences, straight from the raw parse (not through the identity map).
  const rawOccurrencesOfSix04 = nodes.filter((n) => n.nodeKey === `${DOCUMENT_ID}::6.04`);
  console.log(`\nPhysical occurrences with nodeKey "${DOCUMENT_ID}::6.04": ${rawOccurrencesOfSix04.length}`);
  for (const occ of rawOccurrencesOfSix04) {
    console.log(`  charStart=${occ.charStart} charEnd=${occ.charEnd} — heading-region text starts: "${SYNTHETIC_TEXT.slice(occ.charStart, occ.charStart + 60).replace(/\n/g, "\\n")}..."`);
  }

  // getNode/getNodeByRef can only ever return ONE of them — proving occurrence B is unreachable by identity lookup even though it still physically exists in allNodes().
  const resolvedBySingletonLookup = index.getNodeByRef(DOCUMENT_ID, "6.04");
  console.log(`\ngetNodeByRef(doc, "6.04") resolves to the occurrence at charStart=${resolvedBySingletonLookup?.charStart} (the LAST one by charStart — the earlier occurrence is now unreachable through any identity-based lookup, though it still exists in allNodes()).`);

  // Children merge: getChildren("synthetic-doc-a::6.04") is keyed by the SAME collided label as the parent, so it returns whichever children were pushed under that label — regardless of which physical "6.04" occurrence they actually belong to.
  const childrenOfCollidedKey = index.getChildren(`${DOCUMENT_ID}::6.04`);
  console.log(`\ngetChildren("${DOCUMENT_ID}::6.04") returns ${childrenOfCollidedKey.length} node(s): ${childrenOfCollidedKey.map((c) => c.sectionRef).join(", ")}`);
  console.log(`(In this minimal example the cross-reference sentence occurrence has no lettered children of its own, so no cross-parent MERGE is visible here — but the OCCURRENCE-UNREACHABILITY defect is already proven: the cross-reference-sentence occurrence of "6.04" can never be retrieved by getNode/getNodeByRef, only by scanning allNodes() and re-deriving physical identity out-of-band.)`);

  // A second, sharper case: force BOTH occurrences to have their own lettered children, to make the cross-parent MERGE itself directly visible.
  const MERGE_TEXT = `
ARTICLE VI COVENANTS

Section 6.06 Limitation on Restricted Payments . Neither party shall declare or make any Restricted Payment, except:
(a) a Restricted Payment described in the definition of Permitted Restricted Payment;
(b) a Restricted Payment made in accordance with Section 6.06 Limitation on Restricted Payments . above.
(a) a duplicate-lettered clause that is physically nested under the SECOND, spurious "6.06" occurrence created by the in-text cross-reference sentence immediately above, not under the real section header;
`.trim();
  const mergeNodes = parseDocumentStructure({ documentId: "synthetic-doc-b", label: "synthetic-doc-b", text: MERGE_TEXT });
  const mergeKeyCounts = new Map<string, number>();
  for (const n of mergeNodes) mergeKeyCounts.set(n.nodeKey, (mergeKeyCounts.get(n.nodeKey) ?? 0) + 1);
  const mergeDuplicates = [...mergeKeyCounts.entries()].filter(([, c]) => c > 1);
  console.log(`\n--- Second synthetic case (forcing a visible child-list merge) ---`);
  console.log(`Duplicate nodeKeys: ${JSON.stringify(Object.fromEntries(mergeDuplicates))}`);
  const mergeIndex = buildStructuralIndex(new Map([["synthetic-doc-b", { text: MERGE_TEXT, nodes: mergeNodes }]]), [], []);
  const mergedChildren = mergeIndex.getChildren("synthetic-doc-b::6.06");
  console.log(`getChildren("synthetic-doc-b::6.06") returns ${mergedChildren.length} children: ${mergedChildren.map((c) => `${c.sectionRef}@${c.charStart}`).join(", ")}`);
  console.log(`(If more than one child shares the same lettered marker/sectionRef "6.06(a)" here, that is itself a SECOND collision one level down — proving the defect recurses at every nesting level, not just the top SECTION level.)`);

  const report = {
    purpose: "Minimal, generalized (non-DSGR) synthetic reproduction of the structural-index nodeKey collision mechanism identified in Phase 3F.1.1's forensic report.",
    productionFunctionsCalled: ["parseDocumentStructure (lib/contract-model/compiler/stage-structure.ts)", "buildStructuralIndex (lib/contract-model/compiler/structural-index.ts)"],
    productionCodeModified: false,
    caseA_crossReferenceCollision: {
      documentId: DOCUMENT_ID,
      rawNodeCount: nodes.length,
      duplicateNodeKeys: Object.fromEntries(duplicateKeys),
      physicalOccurrencesOfCollidedKey: rawOccurrencesOfSix04.map((n) => ({ charStart: n.charStart, charEnd: n.charEnd, nodeType: n.nodeType })),
      allNodesCount: allIndexed.length,
      getNodeByRefResolvesToCharStart: resolvedBySingletonLookup?.charStart ?? null,
      earlierOccurrenceUnreachableViaIdentityLookup: rawOccurrencesOfSix04.length > 1,
      childrenOfCollidedKeyCount: childrenOfCollidedKey.length,
    },
    caseB_forcedChildMerge: {
      documentId: "synthetic-doc-b",
      rawNodeCount: mergeNodes.length,
      duplicateNodeKeys: Object.fromEntries(mergeDuplicates),
      mergedChildrenOfCollidedKey: mergedChildren.map((c) => ({ sectionRef: c.sectionRef, charStart: c.charStart })),
    },
    conclusion:
      "A repeated (documentId, sectionRef) STRING pair — arising from any source occurrence that satisfies the same heading regex twice (cross-reference sentence, table-of-contents entry, malformed duplicate numbering, amendment-quoted text) — collides into one nodeKey. buildStructuralIndex's byKey map silently retains only the last-charStart occurrence (earlier occurrences become permanently unreachable via getNode/getNodeByRef despite still existing in allNodes()), while childrenByParentKey merges every occurrence's children into one shared list keyed by the same collided label, with no ownership check against which physical occurrence a child actually descends from. This is a general property of the current nodeKey construction (documentId + normalized sectionRef, stage-structure.ts line ~244) — not a DSGR-specific artifact.",
  };
  writeFileSync(join(OUT_DIR, "structural-identity-collision-repro.json"), JSON.stringify(report, null, 2));
  console.log(`\n[preserved] ${OUT_DIR}/structural-identity-collision-repro.json`);
}

main();
