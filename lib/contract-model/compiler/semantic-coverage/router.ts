/**
 * Phase 3E §154 - document-root traversal + high-recall semantic-region
 * router. Given a document's real StructuralIndex entry (whatever Phase 2A
 * actually parsed - the whole document root, never a hand-selected section
 * list, which is FORBIDDEN in this file per the task's own instruction),
 * decides which raw spans deserve semantic-unit hypothesis-generation
 * attention (router.ts's own job) versus deferring that decision to Layer
 * B/C (unit-hypothesis.ts / ai-inventory.ts). Deliberately favors recall:
 * a false positive here costs one wasted downstream hypothesis check; a
 * missed region is unrecoverable (task's own explicit tradeoff).
 *
 * INDEPENDENCE: reuses coverage-audit's own signal detectors
 * (detectIndependentSignals, countInlineEnumerationMarkers, the exported
 * HEADLINE_HEADING regex) and its raw-source-fallback path directly -
 * these are pure, generic, already-tested text-pattern utilities with zero
 * Phase 2B/2D conclusion dependency (the same reuse precedent Phase 3C's
 * own source-inventory.ts already established for
 * countInlineEnumerationMarkers). This file never imports discovery/*,
 * context-retrieval/*, semantic/compile.ts, semantic-verification/verify.ts,
 * or semantic-precedent/* - enforced by
 * tests/contract-model/semantic-coverage-independence.test.ts.
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { computeStructuralCoverage } from "../structural-coverage";
import { detectIndependentSignals, countInlineEnumerationMarkers } from "../coverage-audit/signals";
import { HEADLINE_HEADING } from "../coverage-audit/source-inventory";
import { partitionUncoveredSpan, scanRawSourceRegion } from "../coverage-audit/raw-source-fallback";
import { hashParts } from "../hashing";
import { SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION, type DocumentRoutingResult, type RoutedRegion, type RoutedRegionAdmissionReason, type RoutingClosureStats } from "./types";

const EXCERPT_LENGTH = 400;

// ---------------------------------------------------------------------------
// Phase 3F.1 Workstream A (F1) - hierarchical routing closure (task §6-18).
//
// Root cause (Phase 3F first-blind error taxonomy): the original router
// evaluated every structural node in complete isolation - a node was
// admitted only if ITS OWN text carried an independent signal, a headline
// heading, definitional language, or an unrepresented inline enumeration.
// Real DSGR structure showed the actual failure shape: an operative
// prohibition ("shall not ... except:") and its lettered exception-list
// items ("(a)", "(b)", "(c)") are SEPARATE STRUCTURAL NODES, each
// independently evaluated - a qualitative basket item with no inline
// dollar/percentage/keyword token of its own was silently never routed at
// all, so no amount of downstream materiality fixing (Workstream B) could
// recover it: routing, not classification, was the actual gap.
//
// Closure never replaces the local-signal seed pass above; it runs AFTER
// it, and only EXPANDS admission through bounded, evidence-based
// structural relationships to an already-admitted ("seed") node - never a
// package-specific lookup table (Architecture Invariants #29). Every
// closure-admitted region's admissionReasons/closureDepth/
// closureSourceNodeKey trace exactly which seed and which relationship
// justified it (task's own explainability requirement), and
// DocumentRoutingResult.closureStats records the resulting expansion so
// this mechanism is always measurably bounded, never an unbounded "route
// the whole document" walk (task §16/§46).
// ---------------------------------------------------------------------------

/** Hops from the nearest seed a closure admission may travel before the walk stops for that branch. */
export const MAX_CLOSURE_DEPTH = 3;
/** Per-seed safety valve: once a single seed's closure group reaches this many admitted nodes, further expansion from that seed stops (a disclosed, non-silent bound - RoutingClosureStats.capped records when this fires). */
export const MAX_CLOSURE_NODES_PER_SEED = 40;

/** A node's own trailing enumeration marker in its sectionRef ("6.01(b)" -> "(b)"), or null if the node is not itself a lettered/numbered enumerated item. */
const TRAILING_MARKER_RE = /\([^()]+\)$/;
function trailingMarker(sectionRef: string): string | null {
  return sectionRef.match(TRAILING_MARKER_RE)?.[0]?.toLowerCase() ?? null;
}

/** Local signals whose presence marks a seed as an operative restriction/obligation/exception scope - the only seeds allowed to trigger CHILD_OF_ROUTED_COVENANT_REGION closure. Deliberately excludes HEADLINE_SECTION/DEFINITION_NODE/UNSTRUCTURED_MULTI_ITEM-only admissions and non-operative signals (e.g. bare FAMILY_HEADLINE hits): closure exists to recover exception-list items under a REAL restriction, not to expand every routed node's descendants. */
const OPERATIVE_CLOSURE_TRIGGER_SIGNALS = new Set(["shall_not", "may_not", "will_not", "shall_not_permit", "except", "permit_permitted", "shall_be_permitted"]);

/** A trailing continuation paragraph ("provided, that...", "notwithstanding the foregoing...") that qualifies an already-routed provision without necessarily carrying its own independent signal or enumeration marker. Generic legal-drafting pattern, never package-specific. */
const TRAILING_PROVISO_RE = /^\s*(?:provided,?\s+(?:that|further|however)\b|notwithstanding the foregoing\b)/i;

interface ClosureCandidate {
  node: StructuralNode;
  reason: RoutedRegionAdmissionReason;
  depth: number;
  /** Phase 3F.1.2 - the physical occurrence identity of the seed/closure node that justified this admission. Never the label-shaped nodeKey. */
  sourceNodeId: string;
}

/**
 * Expands a document's seed regions through bounded structural closure.
 * Returns only the NEWLY admitted regions (seeds are untouched by the
 * caller) plus boundedness stats covering the whole pass.
 *
 * Phase 3F.1.2 - every identity-bearing map/set below is keyed by `nodeId`
 * (real physical occurrence identity), never `nodeKey` (a label two
 * distinct physical occurrences can share). This directly closes the
 * R1_ROUTER_SEED_MISS / closure-boundary residual population Phase 3F.1.1's
 * forensic report traced to this file: under the pre-3F.1.2 label-keyed
 * scheme, `getParent`/`getChildren` could silently resolve to the wrong
 * physical ancestor/sibling set whenever a node's own label collided with
 * another occurrence's, corrupting every closure reason below without any
 * error or signal.
 */
export function closeRoutedRegions(seedRegions: RoutedRegion[], nodes: StructuralNode[], index: StructuralIndex, documentId: string): { closureRegions: RoutedRegion[]; stats: RoutingClosureStats } {
  const nodeById = new Map(nodes.map((n) => [n.nodeId, n] as const));
  const admittedNodeIds = new Set(seedRegions.map((r) => r.structuralNodeId).filter((k): k is string => k !== null));
  const rootSeedOf = new Map<string, string>(); // nodeId -> the seed nodeId its closure group traces back to
  for (const seed of seedRegions) if (seed.structuralNodeId) rootSeedOf.set(seed.structuralNodeId, seed.structuralNodeId);

  const closureRegions: RoutedRegion[] = [];
  let capped = false;

  function admit(candidate: ClosureCandidate): void {
    if (admittedNodeIds.has(candidate.node.nodeId)) return;
    admittedNodeIds.add(candidate.node.nodeId);
    const root = rootSeedOf.get(candidate.sourceNodeId) ?? candidate.sourceNodeId;
    rootSeedOf.set(candidate.node.nodeId, root);
    const ownText = index.getNodeText(candidate.node.nodeId, "OWN");
    closureRegions.push({
      regionId: computeRoutedRegionId(documentId, candidate.node.nodeId, 0, ownText.length),
      documentId,
      structuralNodeKey: candidate.node.nodeKey,
      structuralNodeId: candidate.node.nodeId,
      sectionRef: candidate.node.sectionRef,
      charStart: 0,
      charEnd: ownText.length,
      excerptText: ownText.slice(0, EXCERPT_LENGTH),
      detectedSignals: detectIndependentSignals(ownText).map((s) => s.name).sort(),
      admissionReasons: [candidate.reason],
      fromRawSourceFallback: false,
      routingAlgorithmVersion: SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION,
      closureDepth: candidate.depth,
      closureSourceNodeKey: nodeById.get(candidate.sourceNodeId)?.nodeKey ?? null,
      closureSourceNodeId: candidate.sourceNodeId,
    });
  }

  for (const seed of seedRegions) {
    if (!seed.structuralNodeId) continue; // raw-source-fallback seed - no structural node to expand from
    const seedNode = nodeById.get(seed.structuralNodeId);
    if (!seedNode) continue;
    const isOperativeSeed = seed.detectedSignals.some((n) => OPERATIVE_CLOSURE_TRIGGER_SIGNALS.has(n));
    let seedGroupSize = 1; // the seed itself

    const withinBudget = () => seedGroupSize < MAX_CLOSURE_NODES_PER_SEED;

    // --- CHILD_OF_ROUTED_COVENANT_REGION: bounded BFS over descendants -----
    if (isOperativeSeed) {
      const queue: Array<{ node: StructuralNode; depth: number; sourceNodeId: string }> = index.getChildren(seedNode.nodeId).map((c) => ({ node: c, depth: 1, sourceNodeId: seedNode.nodeId }));
      while (queue.length > 0) {
        const { node, depth, sourceNodeId } = queue.shift()!;
        if (depth > MAX_CLOSURE_DEPTH) continue;
        if (!withinBudget()) {
          capped = true;
          continue;
        }
        if (!admittedNodeIds.has(node.nodeId)) {
          admit({ node, reason: "CHILD_OF_ROUTED_COVENANT_REGION", depth, sourceNodeId });
          seedGroupSize += 1;
        }
        // Only recurse further into a child's own children when the child is
        // itself an enumerated item (a nested sub-basket, e.g. "(b)(i)") -
        // bounds the walk to the exception-list shape this closure targets
        // rather than following every deep structural subtree.
        if (depth < MAX_CLOSURE_DEPTH && trailingMarker(node.sectionRef)) {
          for (const grandchild of index.getChildren(node.nodeId)) queue.push({ node: grandchild, depth: depth + 1, sourceNodeId: node.nodeId });
        }
      }
    }

    // --- SIBLING_IN_ROUTED_EXCEPTION_LIST -----------------------------------
    // For every admitted enumerated item that traces back to this seed,
    // pull in siblings under the same parent that share the same
    // enumerated-list shape but never independently qualified on their own.
    const enumeratedAdmittedForThisSeed = [seedNode, ...closureRegions.filter((r) => r.structuralNodeId && rootSeedOf.get(r.structuralNodeId) === seedNode.nodeId).map((r) => nodeById.get(r.structuralNodeId!)).filter((n): n is StructuralNode => !!n)].filter((n) => trailingMarker(n.sectionRef));
    for (const enumNode of enumeratedAdmittedForThisSeed) {
      const parent = index.getParent(enumNode.nodeId);
      if (!parent) continue;
      for (const sibling of index.getChildren(parent.nodeId)) {
        if (sibling.nodeId === enumNode.nodeId) continue;
        if (!trailingMarker(sibling.sectionRef)) continue;
        if (admittedNodeIds.has(sibling.nodeId)) continue;
        if (!withinBudget()) {
          capped = true;
          continue;
        }
        admit({ node: sibling, reason: "SIBLING_IN_ROUTED_EXCEPTION_LIST", depth: 1, sourceNodeId: enumNode.nodeId });
        seedGroupSize += 1;
      }
    }

    // --- CHAPEAU_OF_ROUTED_ENUMERATION --------------------------------------
    // The introductory clause governing an admitted enumerated item, when it
    // was not itself independently routed (e.g. an "as follows:" chapeau
    // with no prohibition/permission keyword of its own).
    const allAdmittedForThisSeedNow = [seedNode, ...closureRegions.filter((r) => r.structuralNodeId && rootSeedOf.get(r.structuralNodeId) === seedNode.nodeId).map((r) => nodeById.get(r.structuralNodeId!)).filter((n): n is StructuralNode => !!n)];
    for (const enumNode of allAdmittedForThisSeedNow.filter((n) => trailingMarker(n.sectionRef))) {
      const parent = index.getParent(enumNode.nodeId);
      if (!parent || admittedNodeIds.has(parent.nodeId)) continue;
      if (!withinBudget()) {
        capped = true;
        continue;
      }
      admit({ node: parent, reason: "CHAPEAU_OF_ROUTED_ENUMERATION", depth: 1, sourceNodeId: enumNode.nodeId });
      seedGroupSize += 1;

      // --- ANCESTOR_SCOPE_CONTEXT (bounded to exactly one further hop) -----
      const grandparent = index.getParent(parent.nodeId);
      if (grandparent && !admittedNodeIds.has(grandparent.nodeId) && (grandparent.nodeType === "SECTION" || grandparent.nodeType === "ARTICLE") && HEADLINE_HEADING.test(grandparent.heading ?? "") && withinBudget()) {
        admit({ node: grandparent, reason: "ANCESTOR_SCOPE_CONTEXT", depth: 2, sourceNodeId: parent.nodeId });
        seedGroupSize += 1;
      }
    }

    // --- TRAILING_PROVISO_OF_ROUTED_REGION ----------------------------------
    // A continuation paragraph immediately following an admitted node under
    // the same parent, qualifying it without its own independent signal.
    const admittedSoFarForThisSeed = [seedNode, ...closureRegions.filter((r) => r.structuralNodeId && rootSeedOf.get(r.structuralNodeId) === seedNode.nodeId).map((r) => nodeById.get(r.structuralNodeId!)).filter((n): n is StructuralNode => !!n)];
    for (const admittedNode of admittedSoFarForThisSeed) {
      const parent = index.getParent(admittedNode.nodeId);
      const siblingPool = parent ? index.getChildren(parent.nodeId) : nodes.filter((n) => n.parentNodeId === null);
      const next = siblingPool.find((s) => s.ordinal === admittedNode.ordinal + 1);
      if (!next || admittedNodeIds.has(next.nodeId)) continue;
      const nextOwnText = index.getNodeText(next.nodeId, "OWN");
      if (!TRAILING_PROVISO_RE.test(nextOwnText)) continue;
      if (!withinBudget()) {
        capped = true;
        continue;
      }
      admit({ node: next, reason: "TRAILING_PROVISO_OF_ROUTED_REGION", depth: 2, sourceNodeId: admittedNode.nodeId });
      seedGroupSize += 1;
    }
  }

  const groupSizeByRoot = new Map<string, number>();
  for (const key of admittedNodeIds) {
    const root = rootSeedOf.get(key) ?? key;
    groupSizeByRoot.set(root, (groupSizeByRoot.get(root) ?? 0) + 1);
  }
  const largestClosureGroupSize = groupSizeByRoot.size > 0 ? Math.max(...groupSizeByRoot.values()) : 0;
  const maxClosureDepth = closureRegions.length > 0 ? Math.max(...closureRegions.map((r) => r.closureDepth)) : 0;
  const seedRegionCount = seedRegions.length;

  return {
    closureRegions,
    stats: {
      seedRegionCount,
      closureAdmittedRegionCount: closureRegions.length,
      maxClosureDepth,
      largestClosureGroupSize,
      expansionFactor: closureRegions.length / Math.max(seedRegionCount, 1),
      capped,
    },
  };
}

function computeRoutedRegionId(documentId: string, key: string, charStart: number, charEnd: number): string {
  return hashParts([documentId, key, String(charStart), String(charEnd), SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION]);
}

function isDefinitionNode(node: StructuralNode, ownText: string): boolean {
  // Deliberately generic (never a package-specific term list, Architecture Invariants #29):
  // a node whose own opening text declares a definition, or whose section/heading itself
  // signals a definitions article, is admitted regardless of whether it also fires an
  // independent covenant signal - definitions materially affect covenant economics
  // (North Star §15) and must never be routed out merely because they read as "just a
  // defined term" with no prohibition/permission language of their own.
  return /^\s*["“][^"”]{1,80}["”]\s+(?:means|shall mean|has the meaning)/i.test(ownText) || /\bDefinitions?\b/i.test(node.heading ?? "");
}

/**
 * Routes ONE document's entire structural tree (task §154's own "document
 * root traversal, no hand-selected section hints"). Every node in the
 * index for this documentId is scanned - never a conventional-article
 * subset. Falls back to raw-text scanning of significant uncovered spans
 * when this document's own structural health is not STRUCTURE_HEALTHY,
 * reusing Phase 2F.1's raw-source-fallback.ts directly (Architecture
 * Invariants #18's disclosed shared-substrate mitigation).
 */
export function routeDocument(documentId: string, index: StructuralIndex): DocumentRoutingResult {
  const nodes = index.allNodes().filter((n) => n.documentId === documentId);
  const regions: RoutedRegion[] = [];
  let admittedNodeCount = 0;

  for (const node of nodes) {
    const ownText = index.getNodeText(node.nodeId, "OWN");
    const signals = detectIndependentSignals(ownText);
    const signalNames = signals.map((s) => s.name).sort();
    const isHeadline = node.nodeType === "SECTION" && HEADLINE_HEADING.test(node.heading ?? "");
    const isDefinition = isDefinitionNode(node, ownText);

    const childRefs = new Set(index.getChildren(node.nodeId).map((c) => c.sectionRef.toLowerCase().replace(/^.*\(/, "(")));
    const ownLeadingMarker = node.sectionRef.match(/\([^()]+\)$/)?.[0]?.toLowerCase();
    const inlineMarkers = countInlineEnumerationMarkers(ownText).filter((m) => m !== ownLeadingMarker);
    const unrepresentedMarkers = inlineMarkers.filter((m) => !childRefs.has(m));
    const hasUnstructuredMultiItem = unrepresentedMarkers.length >= 2;

    const admissionReasons: RoutedRegionAdmissionReason[] = [];
    if (signalNames.length > 0) admissionReasons.push("INDEPENDENT_SIGNAL");
    if (isHeadline) admissionReasons.push("HEADLINE_SECTION");
    if (isDefinition) admissionReasons.push("DEFINITION_NODE");
    if (hasUnstructuredMultiItem) admissionReasons.push("UNSTRUCTURED_MULTI_ITEM");
    if (admissionReasons.length === 0) continue;

    admittedNodeCount += 1;
    regions.push({
      regionId: computeRoutedRegionId(documentId, node.nodeId, 0, ownText.length),
      documentId,
      structuralNodeKey: node.nodeKey,
      structuralNodeId: node.nodeId,
      sectionRef: node.sectionRef,
      charStart: 0,
      charEnd: ownText.length,
      excerptText: ownText.slice(0, EXCERPT_LENGTH),
      detectedSignals: signalNames,
      admissionReasons,
      fromRawSourceFallback: false,
      routingAlgorithmVersion: SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION,
      closureDepth: 0,
      closureSourceNodeKey: null,
      closureSourceNodeId: null,
    });
  }

  const documentText = index.getDocumentText(documentId) ?? "";
  const coverage = computeStructuralCoverage(documentId, documentText, nodes);

  if (coverage.significantUncoveredSpans.length > 0) {
    const scanResults = coverage.significantUncoveredSpans.flatMap((span) => partitionUncoveredSpan(documentId, documentText, span, `document structural health is ${coverage.health} (${coverage.coveragePercent}% substantive coverage)`).map(scanRawSourceRegion));

    for (const result of scanResults) {
      if (!result.hasCovenantSignal && !result.hasAmendmentSignal && !result.hasDefinitionalSignal) continue;
      const signalNames = result.signals.map((s) => s.name).sort();
      regions.push({
        regionId: computeRoutedRegionId(documentId, "raw", result.region.charStart, result.region.charEnd),
        documentId,
        structuralNodeKey: null,
        structuralNodeId: null,
        sectionRef: null,
        charStart: result.region.charStart,
        charEnd: result.region.charEnd,
        excerptText: result.region.text.slice(0, EXCERPT_LENGTH),
        detectedSignals: signalNames,
        admissionReasons: ["RAW_SOURCE_FALLBACK"],
        fromRawSourceFallback: true,
        routingAlgorithmVersion: SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION,
        closureDepth: 0,
        closureSourceNodeKey: null,
        closureSourceNodeId: null,
      });
    }
  }

  const { closureRegions, stats: closureStats } = closeRoutedRegions(regions, nodes, index, documentId);
  regions.push(...closureRegions);
  admittedNodeCount += closureRegions.length;

  return {
    documentId,
    structuralHealth: coverage.health,
    healthReasons: coverage.healthReasons,
    regions,
    closureStats,
    totalNodesScanned: nodes.length,
    admittedNodeCount,
  };
}

/** Routes every document in the package/instrument - task §154's own whole-package traversal requirement (never routing is invoked per-candidate, only per-document-root). */
export function routePackageDocuments(documentIds: string[], index: StructuralIndex): DocumentRoutingResult[] {
  return documentIds.map((documentId) => routeDocument(documentId, index));
}
