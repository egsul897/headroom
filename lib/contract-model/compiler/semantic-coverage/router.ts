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
import { SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION, type DocumentRoutingResult, type RoutedRegion, type RoutedRegionAdmissionReason } from "./types";

const EXCERPT_LENGTH = 400;

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
    const ownText = index.getNodeText(node.nodeKey, "OWN");
    const signals = detectIndependentSignals(ownText);
    const signalNames = signals.map((s) => s.name).sort();
    const isHeadline = node.nodeType === "SECTION" && HEADLINE_HEADING.test(node.heading ?? "");
    const isDefinition = isDefinitionNode(node, ownText);

    const childRefs = new Set(index.getChildren(node.nodeKey).map((c) => c.sectionRef.toLowerCase().replace(/^.*\(/, "(")));
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
      regionId: computeRoutedRegionId(documentId, node.nodeKey, 0, ownText.length),
      documentId,
      structuralNodeKey: node.nodeKey,
      sectionRef: node.sectionRef,
      charStart: 0,
      charEnd: ownText.length,
      excerptText: ownText.slice(0, EXCERPT_LENGTH),
      detectedSignals: signalNames,
      admissionReasons,
      fromRawSourceFallback: false,
      routingAlgorithmVersion: SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION,
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
        sectionRef: null,
        charStart: result.region.charStart,
        charEnd: result.region.charEnd,
        excerptText: result.region.text.slice(0, EXCERPT_LENGTH),
        detectedSignals: signalNames,
        admissionReasons: ["RAW_SOURCE_FALLBACK"],
        fromRawSourceFallback: true,
        routingAlgorithmVersion: SEMANTIC_COVERAGE_ROUTING_ALGORITHM_VERSION,
      });
    }
  }

  return {
    documentId,
    structuralHealth: coverage.health,
    healthReasons: coverage.healthReasons,
    regions,
    totalNodesScanned: nodes.length,
    admittedNodeCount,
  };
}

/** Routes every document in the package/instrument - task §154's own whole-package traversal requirement (never routing is invoked per-candidate, only per-document-root). */
export function routePackageDocuments(documentIds: string[], index: StructuralIndex): DocumentRoutingResult[] {
  return documentIds.map((documentId) => routeDocument(documentId, index));
}
