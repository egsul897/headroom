/**
 * Phase 3F.1.1 — root-cause diagnosis for the residual/false-credit case
 * populations. READ-ONLY: rebuilds the frozen structural index and
 * re-invokes the CURRENT (unmodified by this phase) router.ts/
 * unit-hypothesis.ts against it purely for forensic inspection - no
 * production code is changed, no new package is inspected.
 *
 * Key finding this script quantifies: stage1-all-nodes.json (permanent,
 * sealed Phase 3F artifact, never modified) contains 546 duplicate
 * nodeKeys (680 excess node instances) out of 3,469 distinct keys - a
 * real, pre-existing Phase 2A structural-index defect. buildStructuralIndex
 * (lib/contract-model/compiler/structural-index.ts) populates `byKey` via
 * `byKey.set(n.nodeKey, n)` while iterating nodes sorted by charStart
 * ascending - so for any duplicated nodeKey, only the LAST (highest
 * charStart) instance survives in the node-identity map, silently
 * discarding every earlier instance's own charStart/charEnd/heading -
 * while `childrenByParentKey` (a separate map, populated by simple
 * pushes) merges EVERY instance's children into one shared list
 * regardless of which physical duplicate they actually belong to. This
 * can put a child's charStart before the surviving parent's own
 * charStart, corrupting getNodeText(..., "OWN")'s boundary computation
 * into returning empty or wrong text.
 *
 * Run via: npx tsx scripts/phase-3f1-1-root-cause.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import type { DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { routeDocument } from "../lib/contract-model/compiler/semantic-coverage/router";
import type { RoutedRegion } from "../lib/contract-model/compiler/semantic-coverage/types";

const FIRST_BLIND_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const REGRESSION_DIR = "tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression";
const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";
const SRC_DIR = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f1-1-forensics";

const DOCS = [
  { documentId: "doc-a", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
  { documentId: "doc-b", file: "doc-b-2024-third-amendment.txt" },
  { documentId: "doc-c", file: "doc-c-2025-fourth-amendment.txt" },
  { documentId: "doc-d", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
];

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

interface ScorerResult {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  gtMateriality: string;
  unitType: string;
  discoveryMatch: string;
  auditMatch: string;
  auditMaterialityAssigned: string | null;
  coverageState: string | null;
  inDangerousUnaccounted: boolean;
  classification: string;
  matchedUnitIds: string[];
}
interface AuditUnit {
  semanticUnitId: string;
  anchors: { documentId: string; sectionRef: string | null; structuralNodeKey?: string | null }[];
  family: string;
  materiality: string;
  materialityReasoning?: string;
  contextuallyElevated?: boolean;
  detectedSignals?: string[];
  excerptText?: string;
}

function normalizeRef(ref: string): string {
  return ref.replace(/\s+/g, "");
}

async function main() {
  console.log("================ PHASE_3F_1_1_ROOT_CAUSE_DIAGNOSIS ================");

  // Rebuild the frozen structural index (same technique as the regression rerun).
  const allNodes = loadJson<StructuralNode[]>(join(FIRST_BLIND_DIR, "stage1-all-nodes.json"));
  const allDefinitions = loadJson<DetectedDefinition[]>(join(FIRST_BLIND_DIR, "stage1-all-definitions.json"));
  const allReferences = loadJson<DetectedReference[]>(join(FIRST_BLIND_DIR, "stage1-all-references.json"));
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of DOCS) {
    const text = readFileSync(join(SRC_DIR, doc.file), "utf-8");
    nodesByDocument.set(doc.documentId, { text, nodes: allNodes.filter((n) => n.documentId === doc.documentId) });
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  // --- Duplicate nodeKey census (a real, pre-existing, sealed Phase 3F artifact defect). ---
  const keyCounts = new Map<string, number>();
  for (const n of allNodes) keyCounts.set(n.nodeKey, (keyCounts.get(n.nodeKey) ?? 0) + 1);
  const duplicateKeys = [...keyCounts.entries()].filter(([, c]) => c > 1);
  console.log(`Total nodes: ${allNodes.length}, distinct nodeKeys: ${keyCounts.size}, duplicated nodeKeys: ${duplicateKeys.length}, excess duplicate instances: ${duplicateKeys.reduce((s, [, c]) => s + c - 1, 0)}`);

  // --- Re-derive routing regions (current, unmodified router.ts) for admission/closure evidence. ---
  const routingByDoc = new Map<string, RoutedRegion[]>();
  for (const doc of DOCS) {
    const result = routeDocument(doc.documentId, index);
    routingByDoc.set(doc.documentId, result.regions);
  }

  // --- Load the forensic scorer outputs already produced by phase-3f1-1-forensics.ts ---
  const original119 = loadJson<ScorerResult[]>(join(OUT_DIR, "original-119-canonical.json"));
  const algoA = new Map(loadJson<ScorerResult[]>(join(OUT_DIR, "raw-scorer-combination-A-original-x-firstblind.json")).map((r) => [r.gtUnitId, r] as const));
  const algoC = new Map(loadJson<ScorerResult[]>(join(OUT_DIR, "raw-scorer-combination-C-corrected-x-firstblind.json")).map((r) => [r.gtUnitId, r] as const));
  const algoD = new Map(loadJson<ScorerResult[]>(join(OUT_DIR, "raw-scorer-combination-D-corrected-x-regression.json")).map((r) => [r.gtUnitId, r] as const));

  const regressionCoverage = loadJson<{ documentDetails: { documentId: string; units: AuditUnit[] }[] }>(join(REGRESSION_DIR, "stage8-coverage-result.json"));
  const unitsByDocRegression = new Map(regressionCoverage.documentDetails.map((d) => [d.documentId, d.units] as const));

  const gtDescriptionById = new Map<string, string>();
  const gtUnitTypeById = new Map<string, string>();
  for (const doc of DOCS) {
    const gt = loadJson<{ articles: { units: { unitId: string; description: string; unitType: string }[] }[] }>(join(GT_DIR, `ground-truth-${doc.documentId}.json`));
    for (const art of gt.articles) for (const u of art.units) {
      gtDescriptionById.set(u.unitId, u.description);
      gtUnitTypeById.set(u.unitId, u.unitType);
    }
  }

  interface CaseForensics {
    gtUnitId: string;
    documentId: string;
    sectionRef: string;
    nodeKey: string;
    nodeKeyDuplicateCount: number;
    node: { charStart: number; charEnd: number; heading: string } | null;
    ownTextLength: number;
    ownTextEmpty: boolean;
    childrenCount: number;
    hasChildBeforeParentAnomaly: boolean;
    routedAsRegion: boolean;
    admissionReasons: string[];
    closureDepth: number | null;
    bestRegressionUnitMateriality: string | null;
    bestRegressionUnitContextuallyElevated: boolean | null;
    bestRegressionUnitFamily: string | null;
    bestRegressionUnitDetectedSignals: string[] | null;
    algoA_classification: string;
    algoC_classification: string;
    algoD_classification: string;
    disposition: "RESOLVED_BY_3F1" | "STILL_DANGEROUS" | "SCORER_ARTIFACT_CORRECTED" | "GROUND_TRUTH_AMBIGUITY" | "SOURCE_EXTRACTION_LIMITATION" | "OTHER_EXPLICITLY_JUSTIFIED";
    isFalseCreditSuspect: boolean;
    primaryRootCause: string;
    secondaryRootCauses: string[];
    rootCauseEvidence: string;
    gtDescription: string;
  }

  const cases: CaseForensics[] = [];

  for (const orig of original119) {
    const gtId = orig.gtUnitId;
    const resA = algoA.get(gtId)!;
    const resC = algoC.get(gtId)!;
    const resD = algoD.get(gtId)!;
    const documentId = orig.documentId;
    const sectionRef = orig.sectionRef;
    const nodeKey = `${documentId}::${normalizeRef(sectionRef)}`;
    const dupCount = keyCounts.get(nodeKey) ?? 0;
    const node = index.getNode(nodeKey);
    const ownText = node ? index.getNodeText(nodeKey, "OWN") : "";
    const children = node ? index.getChildren(nodeKey) : [];
    const hasChildBeforeParentAnomaly = node ? children.some((c) => c.charStart < node.charStart) : false;

    const regions = routingByDoc.get(documentId) ?? [];
    const region = regions.find((r) => r.structuralNodeKey === nodeKey);

    const cIsViolation = resC.classification.startsWith("VIOLATION_");
    const dIsViolation = resD.classification.startsWith("VIOLATION_");

    let disposition: CaseForensics["disposition"];
    if (!cIsViolation) disposition = "SCORER_ARTIFACT_CORRECTED";
    else if (!dIsViolation) disposition = "RESOLVED_BY_3F1";
    else disposition = "STILL_DANGEROUS";

    // Best regression unit among the D-scorer's matched pool (may include union'd descendants).
    const regUnits = (unitsByDocRegression.get(documentId) ?? []).filter((u) => resD.matchedUnitIds.includes(u.semanticUnitId));
    const order: Record<string, number> = { CRITICAL: 0, MATERIAL: 1, REVIEW_UNCERTAIN: 2, INFORMATIONAL: 3 };
    regUnits.sort((a, b) => (order[a.materiality] ?? 9) - (order[b.materiality] ?? 9));
    const bestReg = regUnits[0];
    const bestRegExactSectionMatch = bestReg?.anchors[0]?.sectionRef === sectionRef;

    // Heuristic false-credit suspicion: the D-scorer's best unit is NOT anchored at the
    // gt unit's own exact sectionRef (i.e. it came from the descendant union, not the
    // exact match) AND the gt unit's own unitType suggests a general/chapeau-shaped claim.
    const isChapeauShaped = /chapeau|lead-in|flush|overriding|general/i.test(gtId) || /general prohibition|no loan party will|flush/i.test(gtDescriptionById.get(gtId) ?? "");
    const isFalseCreditSuspect = disposition === "SCORER_ARTIFACT_CORRECTED" && !bestRegExactSectionMatch && isChapeauShaped;

    cases.push({
      gtUnitId: gtId,
      documentId,
      sectionRef,
      nodeKey,
      nodeKeyDuplicateCount: dupCount,
      node: node ? { charStart: node.charStart, charEnd: node.charEnd, heading: node.heading } : null,
      ownTextLength: ownText.length,
      ownTextEmpty: ownText.trim().length === 0,
      childrenCount: children.length,
      hasChildBeforeParentAnomaly,
      routedAsRegion: !!region,
      admissionReasons: region?.admissionReasons ?? [],
      closureDepth: region?.closureDepth ?? null,
      bestRegressionUnitMateriality: bestReg?.materiality ?? null,
      bestRegressionUnitContextuallyElevated: bestReg?.contextuallyElevated ?? null,
      bestRegressionUnitFamily: bestReg?.family ?? null,
      bestRegressionUnitDetectedSignals: bestReg?.detectedSignals ?? null,
      algoA_classification: resA.classification,
      algoC_classification: resC.classification,
      algoD_classification: resD.classification,
      disposition,
      isFalseCreditSuspect,
      primaryRootCause: "PENDING",
      secondaryRootCauses: [],
      rootCauseEvidence: "",
      gtDescription: gtDescriptionById.get(gtId) ?? "",
    });
  }

  // --- Automated primary root-cause classification, applied only to STILL_DANGEROUS cases
  // (per task's own instruction, root causes are assigned to the residual dangerous
  // population - scorer-artifact/resolved cases get their own disposition category
  // instead, not a routing/materiality root cause). ---
  for (const c of cases) {
    if (c.disposition !== "STILL_DANGEROUS") continue;

    const reasons: string[] = [];
    let primary = "R21_OTHER_NEW_ARCHITECTURAL_GAP";

    const hasDuplicateNodeKey = c.nodeKeyDuplicateCount > 1;
    const ownTextCorrupted = c.ownTextEmpty || c.hasChildBeforeParentAnomaly;

    if (c.node === null) {
      // No structural node exists at this exact sectionRef at all - the hierarchy
      // itself never captured this provision as its own addressable node. This is
      // upstream of routing entirely: router.ts can only iterate index.allNodes(),
      // so a provision Phase 2A never parsed into its own node can never become a
      // seed, no matter how the router/closure logic is tuned. Distinct from a true
      // router-seed-miss (where the node exists but earns no admission reason).
      primary = "R17_STRUCTURAL_PARSER_EFFECT";
      reasons.push(`no structural node exists for sectionRef "${c.sectionRef}" anywhere in stage1-all-nodes.json - Phase 2A's lettered-subsection detector did not create this address as its own node (sibling letters under the same parent often did), so it is structurally unreachable by any router/materiality logic regardless of how those layers are tuned`);
    } else if (!c.routedAsRegion) {
      primary = "R1_ROUTER_SEED_MISS";
      reasons.push(`node ${c.nodeKey} exists (own text length ${c.ownTextLength}) but was never admitted as a routed region (no seed, no closure reached it)`);
    } else if (hasDuplicateNodeKey && ownTextCorrupted) {
      primary = "R17_STRUCTURAL_PARSER_EFFECT";
      reasons.push(`nodeKey ${c.nodeKey} has ${c.nodeKeyDuplicateCount} colliding structural-index instances (byKey last-writer-wins + childrenByParentKey cross-contamination) - OWN text ${c.ownTextEmpty ? "is empty" : "boundary is corrupted by a child charStart preceding the surviving node's own charStart"}`);
    } else if (c.bestRegressionUnitMateriality === null) {
      primary = "R8_UNIT_HYPOTHESIS_MISS";
      reasons.push(`region was routed (admissionReasons: ${c.admissionReasons.join(",")}) but no semantic unit at all was matched by the scorer for this address`);
    } else if (c.algoD_classification === "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED" && c.bestRegressionUnitContextuallyElevated === false) {
      if (c.admissionReasons.some((r) => r === "CHILD_OF_ROUTED_COVENANT_REGION" || r === "SIBLING_IN_ROUTED_EXCEPTION_LIST")) {
        primary = "R11_MATERIALITY_INHERITANCE_NOT_TRIGGERED";
        // Check whether the immediate parent (the node the floor would have needed
        // to read as "operative + materially significant") itself suffers the same
        // duplicate-nodeKey/empty-OWN-text corruption - if so, the floor's own logic
        // is not at fault, it correctly declined to elevate FROM a parent whose own
        // materiality was itself corrupted by R17, and R17 is recorded as a
        // secondary cause rather than double-counted as primary.
        const parentNode = index.getParent(c.nodeKey);
        if (parentNode) {
          const parentDupCount = keyCounts.get(parentNode.nodeKey) ?? 0;
          const parentOwnText = index.getNodeText(parentNode.nodeKey, "OWN");
          if (parentDupCount > 1 && parentOwnText.trim().length === 0) {
            reasons.push(`parent node ${parentNode.nodeKey} (dup count ${parentDupCount}) also has empty OWN text - the floor correctly found no operative/material parent to inherit from, because the parent's own materiality is itself corrupted by the same structural-index defect`);
            c.secondaryRootCauses.push("R17_STRUCTURAL_PARSER_EFFECT");
          } else {
            reasons.push(`unit is a closure-admitted child (${c.admissionReasons.join(",")}) but was not floored to MATERIAL - parent ${parentNode.nodeKey} exists with real own text, so this is a genuine floor-selectivity gap, not a downstream structural-parser effect`);
          }
        } else {
          reasons.push(`unit is a closure-admitted child (${c.admissionReasons.join(",")}) but was not floored to MATERIAL and no parent node could be resolved at all`);
        }
      } else {
        primary = "R10_MATERIALITY_LOCAL_CLASSIFICATION_ERROR";
        reasons.push(`unit's own local materiality classification (${c.bestRegressionUnitMateriality}) is below ground truth, with no closure/inheritance relationship applicable`);
      }
    } else if (c.algoD_classification === "VIOLATION_UNREPRESENTED_NOT_FLAGGED") {
      primary = "R14_RECONCILIATION_MATCHING_FAILURE";
      reasons.push(`an inventoried unit exists (materiality ${c.bestRegressionUnitMateriality}) but coverage/dangerous-unaccounted logic did not flag it`);
    } else if (c.algoD_classification === "VIOLATION_NO_AUDIT_MATCH") {
      if (hasDuplicateNodeKey) {
        primary = "R17_STRUCTURAL_PARSER_EFFECT";
        reasons.push(`nodeKey ${c.nodeKey} has ${c.nodeKeyDuplicateCount} colliding instances; no adequately-anchored unit reachable at any level`);
      } else if (!c.routedAsRegion) {
        primary = "R1_ROUTER_SEED_MISS";
      } else {
        primary = "R2_ROUTER_CLOSURE_BOUNDARY_MISS";
        reasons.push(`region was routed but no unit exists at this address or any exact/parent/descendant match`);
      }
    }

    c.primaryRootCause = primary;
    c.rootCauseEvidence = reasons.join("; ") || "classified by elimination against the remaining evidence signals";
  }

  preserve("case-forensics-all-119", cases);

  const stillDangerous = cases.filter((c) => c.disposition === "STILL_DANGEROUS");
  const primaryCounts = new Map<string, number>();
  for (const c of stillDangerous) primaryCounts.set(c.primaryRootCause, (primaryCounts.get(c.primaryRootCause) ?? 0) + 1);
  console.log("\n=== Primary root-cause distribution (residual STILL_DANGEROUS population) ===");
  for (const [k, v] of [...primaryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v} (${((v / stillDangerous.length) * 100).toFixed(1)}%)`);
  }
  console.log(`Total STILL_DANGEROUS: ${stillDangerous.length}`);

  const falseCreditSuspects = cases.filter((c) => c.isFalseCreditSuspect);
  console.log(`\nFalse-credit suspects among SCORER_ARTIFACT_CORRECTED (${cases.filter((c) => c.disposition === "SCORER_ARTIFACT_CORRECTED").length} total): ${falseCreditSuspects.length}`);

  preserve("duplicate-nodekey-census", { totalNodes: allNodes.length, distinctNodeKeys: keyCounts.size, duplicatedNodeKeyCount: duplicateKeys.length, excessDuplicateInstances: duplicateKeys.reduce((s, [, c]) => s + c - 1, 0), duplicateKeys: duplicateKeys.map(([k, c]) => ({ nodeKey: k, instanceCount: c })) });
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
