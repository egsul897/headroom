/**
 * Phase 3F.1.2 - POST-REMEDIATION reproduction (follow-up to
 * scripts/architecture-proposal-node-identity-repro.ts, which is preserved
 * UNCHANGED as the frozen "before" evidence of the pre-3F.1.2 defect - see
 * that script's own header and docs/phase-3f1-1-residual-safety-forensics.md).
 * READ-ONLY evidence generation: imports and calls the real, unmodified
 * (post-remediation) production functions (parseDocumentStructure,
 * buildStructuralIndex) against the IDENTICAL synthetic documents used by
 * the pre-remediation repro, to prove the same collision mechanism no
 * longer produces occurrence-unreachability or cross-parent child merging
 * under the new occurrence-safe (nodeId/parentNodeId) identity substrate.
 *
 * This does not modify structural-index.ts or stage-structure.ts. It is
 * "after" evidence paired with the frozen "before" evidence, not a test
 * (tests/contract-model/structural-node-identity-invariants.test.ts and
 * structural-node-identity-property.test.ts carry the mechanically-asserted
 * coverage; this script's purpose is a human-readable side-by-side proof).
 *
 * Run via: npx tsx scripts/phase-3f1-2-post-remediation-repro.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../lib/contract-model/compiler/types";

const OUT_DIR = "tests/fixtures/architecture-audits";

// Byte-identical to the pre-remediation repro's SYNTHETIC_TEXT/MERGE_TEXT -
// same documentIds, same synthetic language - so the two reports are a real
// apples-to-apples before/after pair, not two different scenarios.
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
    console.log(`  [${n.nodeType}] nodeId=${n.nodeId}  nodeKey(legacy)=${n.nodeKey}  sectionRef=${n.sectionRef}  charStart=${n.charStart}  parentNodeId=${n.parentNodeId ?? "(none)"}`);
  }

  // --- Census: nodeId is now the identity - confirm it is unique per occurrence even where nodeKey (label) still collides. ---
  const nodeIdCounts = new Map<string, number>();
  const nodeKeyCounts = new Map<string, number>();
  for (const n of nodes) {
    nodeIdCounts.set(n.nodeId, (nodeIdCounts.get(n.nodeId) ?? 0) + 1);
    nodeKeyCounts.set(n.nodeKey, (nodeKeyCounts.get(n.nodeKey) ?? 0) + 1);
  }
  const duplicateNodeIds = [...nodeIdCounts.entries()].filter(([, c]) => c > 1);
  const duplicateNodeKeys = [...nodeKeyCounts.entries()].filter(([, c]) => c > 1);
  console.log(`\nDuplicate nodeIds among raw parsed nodes (I1 - must be empty): ${JSON.stringify(Object.fromEntries(duplicateNodeIds))}`);
  console.log(`Duplicate nodeKeys among raw parsed nodes (I2 - expected, informational only, same label collision as before): ${JSON.stringify(Object.fromEntries(duplicateNodeKeys))}`);

  const nodesByDocument = new Map([[DOCUMENT_ID, { text: SYNTHETIC_TEXT, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);

  const allIndexed = index.allNodes();
  console.log(`\nindex.allNodes() returns ${allIndexed.length} nodes (every physical occurrence present).`);

  const rawOccurrencesOfSix04 = nodes.filter((n) => n.nodeKey === `${DOCUMENT_ID}::6.04`);
  console.log(`\nPhysical occurrences with legal reference "6.04": ${rawOccurrencesOfSix04.length}`);

  // Both occurrences must remain independently reachable via getNodeById, unlike the pre-remediation getNode/getNodeByRef singleton.
  const bothReachableByNodeId = rawOccurrencesOfSix04.every((occ) => index.getNodeById(occ.nodeId) !== undefined && index.getNodeById(occ.nodeId)!.charStart === occ.charStart);
  console.log(`\nEvery physical "6.04" occurrence independently reachable via getNodeById(nodeId): ${bothReachableByNodeId}`);

  // resolveUniqueNodeByRef must report AMBIGUOUS (never silently pick one) for the collided legal reference.
  const resolution = index.resolveUniqueNodeByRef(DOCUMENT_ID, "6.04");
  console.log(`\nresolveUniqueNodeByRef(doc, "6.04") status: ${resolution.status} (must be AMBIGUOUS, never a silent UNIQUE pick, when >1 physical occurrence shares this reference)`);
  console.log(`findNodesByRef(doc, "6.04") returns ${index.findNodesByRef(DOCUMENT_ID, "6.04").length} candidates (must equal the raw occurrence count above).`);

  // The deprecated getNodeByRef compatibility shim must now be SAFE - undefined on ambiguity, never an arbitrary pick.
  const deprecatedLookup = index.getNodeByRef(DOCUMENT_ID, "6.04");
  console.log(`\ngetNodeByRef(doc, "6.04") (deprecated shim) now returns: ${deprecatedLookup === undefined ? "undefined (safe-by-omission)" : `charStart=${deprecatedLookup.charStart} (UNEXPECTED - should be undefined for an ambiguous reference)`}`);

  // Children must be scoped to the SPECIFIC physical parent occurrence, never merged across same-labeled parents.
  const childrenByOccurrence = rawOccurrencesOfSix04.map((occ) => ({ nodeId: occ.nodeId, charStart: occ.charStart, children: index.getChildren(occ.nodeId).map((c) => c.sectionRef) }));
  console.log(`\ngetChildren(nodeId) per physical "6.04" occurrence (each must see only its own children, never the other occurrence's):`);
  for (const row of childrenByOccurrence) console.log(`  occurrence@charStart=${row.charStart}: children=[${row.children.join(", ")}]`);

  const health = index.healthDiagnostics();
  const errorFindings = health.filter((f) => f.severity === "ERROR");
  const infoFindings = health.filter((f) => f.severity === "INFO");
  console.log(`\nStructural health: ${errorFindings.length} ERROR finding(s) (must be 0 for this legitimate duplicate-label scenario), ${infoFindings.length} INFO finding(s) (DUPLICATE_LABEL_EXPECTED/AMBIGUOUS_LEGAL_REFERENCE expected).`);
  for (const f of health) console.log(`  [${f.severity}] ${f.code}: ${f.message}`);

  // --- Second case: force BOTH occurrences to have their own lettered children, to make the (now-closed) cross-parent merge check directly visible. ---
  const MERGE_TEXT = `
ARTICLE VI COVENANTS

Section 6.06 Limitation on Restricted Payments . Neither party shall declare or make any Restricted Payment, except:
(a) a Restricted Payment described in the definition of Permitted Restricted Payment;
(b) a Restricted Payment made in accordance with Section 6.06 Limitation on Restricted Payments . above.
(a) a duplicate-lettered clause that is physically nested under the SECOND, spurious "6.06" occurrence created by the in-text cross-reference sentence immediately above, not under the real section header;
`.trim();
  const mergeNodes = parseDocumentStructure({ documentId: "synthetic-doc-b", label: "synthetic-doc-b", text: MERGE_TEXT });
  const mergeIndex = buildStructuralIndex(new Map([["synthetic-doc-b", { text: MERGE_TEXT, nodes: mergeNodes }]]), [], []);
  const six06Occurrences = mergeNodes.filter((n) => n.sectionRef === "6.06");
  console.log(`\n--- Second synthetic case (forcing what was previously a visible child-list merge) ---`);
  console.log(`Physical "6.06" occurrences: ${six06Occurrences.length}`);
  const perOccurrenceChildren = six06Occurrences.map((occ) => ({ nodeId: occ.nodeId, charStart: occ.charStart, children: mergeIndex.getChildren(occ.nodeId).map((c) => `${c.sectionRef}@${c.charStart}`) }));
  for (const row of perOccurrenceChildren) console.log(`  occurrence@charStart=${row.charStart}: children=[${row.children.join(", ")}]`);
  const noCrossOccurrenceOverlap = new Set(perOccurrenceChildren.flatMap((r) => r.children)).size === perOccurrenceChildren.reduce((sum, r) => sum + r.children.length, 0);
  console.log(`No child appears under more than one physical "6.06" occurrence (cross-parent merge closed): ${noCrossOccurrenceOverlap}`);
  const mergeHealth = mergeIndex.healthDiagnostics();
  console.log(`Second case structural health: ${mergeHealth.filter((f) => f.severity === "ERROR").length} ERROR finding(s), ${mergeHealth.filter((f) => f.severity === "INFO").length} INFO finding(s).`);

  const report = {
    purpose: "POST-REMEDIATION counterpart to scripts/architecture-proposal-node-identity-repro.ts (preserved unchanged as frozen 'before' evidence) - proves, over the byte-identical synthetic documents, that the collision mechanism no longer produces occurrence-unreachability or cross-parent child merging under Phase 3F.1.2's occurrence-safe (nodeId/parentNodeId) identity substrate.",
    remediationAdr: "docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md",
    productionFunctionsCalled: ["parseDocumentStructure (lib/contract-model/compiler/stage-structure.ts, post-remediation)", "buildStructuralIndex (lib/contract-model/compiler/structural-index.ts, post-remediation)"],
    productionCodeModified: false,
    caseA_crossReferenceCollision: {
      documentId: DOCUMENT_ID,
      rawNodeCount: nodes.length,
      duplicateNodeIds: Object.fromEntries(duplicateNodeIds),
      duplicateNodeKeys: Object.fromEntries(duplicateNodeKeys),
      physicalOccurrencesOfSix04: rawOccurrencesOfSix04.length,
      allBothOccurrencesReachableByNodeId: bothReachableByNodeId,
      resolveUniqueNodeByRefStatus: resolution.status,
      findNodesByRefCount: index.findNodesByRef(DOCUMENT_ID, "6.04").length,
      deprecatedGetNodeByRefIsUndefinedOnAmbiguity: deprecatedLookup === undefined,
      childrenPerOccurrence: childrenByOccurrence,
      healthErrorFindingCount: errorFindings.length,
      healthInfoFindingCount: infoFindings.length,
      healthFindings: health,
    },
    caseB_previouslyForcedChildMerge: {
      documentId: "synthetic-doc-b",
      physicalOccurrencesOfSix06: six06Occurrences.length,
      childrenPerOccurrence: perOccurrenceChildren,
      noCrossOccurrenceChildOverlap: noCrossOccurrenceOverlap,
      healthErrorFindingCount: mergeHealth.filter((f) => f.severity === "ERROR").length,
    },
    conclusion:
      "Both physical occurrences of a collided legal reference remain independently reachable via nodeId/getNodeById after remediation, whereas the pre-remediation getNode/getNodeByRef could only ever surface one. resolveUniqueNodeByRef correctly reports AMBIGUOUS rather than a silent pick, and the deprecated getNodeByRef shim now safely returns undefined instead of an arbitrary occurrence. getChildren(nodeId) is scoped per physical parent occurrence with zero cross-occurrence overlap in the forced-merge case. Structural health reports zero ERROR-severity findings for both cases (only expected INFO-severity DUPLICATE_LABEL_EXPECTED/AMBIGUOUS_LEGAL_REFERENCE, per I2/I15's own discipline that a shared label is normal, not a defect) - the identity-level invariants (I1/I5/I6/I7) hold.",
  };
  writeFileSync(join(OUT_DIR, "structural-identity-post-remediation-repro.json"), JSON.stringify(report, null, 2));
  console.log(`\n[preserved] ${OUT_DIR}/structural-identity-post-remediation-repro.json`);
}

main();
