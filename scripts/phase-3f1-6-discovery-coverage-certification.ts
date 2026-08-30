/**
 * Phase 3F.1.6 Section 14 - independent discovery-coverage certification.
 *
 * Re-runs the already-built, real (no new model calls) Phase 3E source-first
 * coverage framework against the real FWRG and LSB Article 6 fixtures (see
 * scripts/phase-3e-real-fwrg-regression.ts / phase-3e-real-lsb-regression.ts
 * for full evidence provenance), then buckets the result by CATEGORY
 * (section / material-claim / basket-exception / chapeau / dependency)
 * instead of one averaged number, and classifies every non-fully-represented
 * unit as UNDISCOVERED (Phase 2B discovery never produced any
 * DiscoveredCandidate corresponding to this MaterialSemanticUnit -
 * DangerousUnaccountedReason "NO_CANDIDATE_EVER_DISCOVERED") vs.
 * DISCOVERED_BUT_UNRESOLVED (a candidate/compiled result exists but never
 * reached FULLY_REPRESENTED_VERIFIED - reasons
 * CANDIDATE_DISCOVERED_NEVER_COMPILED / COMPILED_BUT_UNIT_OMITTED_FROM_IR /
 * COMPILED_BUT_MATERIALLY_MISREPRESENTED).
 *
 * Structural-proximity is explicitly NOT used as semantic credit anywhere in
 * this script: every "discovered" determination below is per-semanticUnitId
 * (content-derived from documentId + anchor span + detection signature),
 * never "some candidate exists somewhere in the same section".
 *
 * CATEGORY NOTE (disclosed limitation): MaterialSemanticUnit does not persist
 * its own generating detectionSignature (chapeau: / item: / whole-region:),
 * so "chapeau" vs "basket/exception" vs "plain material claim" is
 * reconstructed here from the unit's own persisted postureSignal +
 * detectedSignals fields (the same fields a downstream consumer would have
 * to use), not from a hidden internal tag. This is disclosed as a proxy,
 * not presented as exact ground truth:
 *   - basket/exception: postureSignal === "PERMISSION_SIGNAL" (this is
 *     exactly how unit-hypothesis.ts's own isExceptionItem->PERMISSION_SIGNAL
 *     mapping tags an enumerated exception/basket item - see
 *     classifyPostureSignal in unit-hypothesis.ts).
 *   - chapeau (proxy): PROHIBITION_SIGNAL/OBLIGATION_SIGNAL units whose own
 *     detectedSignals include "except"/"provided_that"/"subject_to"/
 *     "notwithstanding" (the umbrella clause that introduces the
 *     basket/exception list housed in the sibling PERMISSION_SIGNAL units).
 *   - material claim (broad): every PROHIBITION_SIGNAL/OBLIGATION_SIGNAL
 *     unit (chapeau is a disclosed subset of this bucket, not disjoint).
 *   - dependency discovery: NOT unit-level at all - uses the framework's own
 *     independent CrossSectionRelationshipFinding output (auditCrossSectionRelationships),
 *     which is exactly a cross-unit RELATIONSHIP-level check, separate from
 *     any single unit's own coverage state.
 *   - section coverage: structural-index SECTION-node count vs. sections
 *     with >=1 FULLY_REPRESENTED_* unit.
 *
 * Run via: npx tsx scripts/phase-3f1-6-discovery-coverage-certification.ts
 */
import { writeFileSync } from "node:fs";
import { loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";
import { documentIdFor, loadRealDiscoveredCandidates, loadRealCompiledResults, type RealPackage } from "./phase-3e-real-package-regression";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import { routeDocument } from "../lib/contract-model/compiler/semantic-coverage/router";
import type { MaterialSemanticUnit, DangerousUnaccountedSemanticUnit, DocumentCoverageResult } from "../lib/contract-model/compiler/semantic-coverage/types";

type Category = "MATERIAL_CLAIM_BROAD" | "CHAPEAU_PROXY" | "BASKET_EXCEPTION" | "CONDITION_ONLY" | "OTHER_UNCLASSIFIED_SIGNAL";

function categorize(u: MaterialSemanticUnit): Category[] {
  const cats: Category[] = [];
  if (u.postureSignal === "PERMISSION_SIGNAL") cats.push("BASKET_EXCEPTION");
  if (u.postureSignal === "PROHIBITION_SIGNAL" || u.postureSignal === "OBLIGATION_SIGNAL") {
    cats.push("MATERIAL_CLAIM_BROAD");
    const chapeauMarkers = ["except", "provided_that", "subject_to", "notwithstanding"];
    if (u.detectedSignals.some((s) => chapeauMarkers.includes(s))) cats.push("CHAPEAU_PROXY");
  }
  if (u.postureSignal === "CONDITION_ONLY_SIGNAL") cats.push("CONDITION_ONLY");
  if (cats.length === 0) cats.push("OTHER_UNCLASSIFIED_SIGNAL");
  return cats;
}

interface CategoryBucketResult {
  category: string;
  totalUnits: number;
  fullyRepresented: number;
  discoveredButUnresolved: number;
  undiscovered: number;
  rawFullyRepresentedFraction: number;
}

function bucketByCategory(doc: DocumentCoverageResult): CategoryBucketResult[] {
  const byId = new Map(doc.units.map((u) => [u.semanticUnitId, u] as const));
  const dangerById = new Map(doc.dangerousUnaccounted.map((d) => [d.semanticUnitId, d] as const));
  const stateById = new Map(doc.coverageEntries.map((e) => [e.semanticUnitId, e.coverageState] as const));

  const totals = new Map<Category, { total: number; full: number; unresolved: number; undiscovered: number }>();
  const touch = (cat: Category) => {
    if (!totals.has(cat)) totals.set(cat, { total: 0, full: 0, unresolved: 0, undiscovered: 0 });
    return totals.get(cat)!;
  };

  for (const u of doc.units) {
    const cats = categorize(u);
    const state = stateById.get(u.semanticUnitId);
    const danger = dangerById.get(u.semanticUnitId);
    for (const cat of cats) {
      const bucket = touch(cat);
      bucket.total += 1;
      if (state === "FULLY_REPRESENTED_VERIFIED" || state === "FULLY_REPRESENTED_REVIEW_REQUIRED") bucket.full += 1;
      if (danger) {
        if (danger.reason === "NO_CANDIDATE_EVER_DISCOVERED") bucket.undiscovered += 1;
        else bucket.unresolved += 1;
      }
    }
  }

  return [...totals.entries()].map(([category, v]) => ({
    category,
    totalUnits: v.total,
    fullyRepresented: v.full,
    discoveredButUnresolved: v.unresolved,
    undiscovered: v.undiscovered,
    rawFullyRepresentedFraction: v.total > 0 ? v.full / v.total : 0,
  }));
}

function dangerousByReason(list: DangerousUnaccountedSemanticUnit[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of list) out[d.reason] = (out[d.reason] ?? 0) + 1;
  return out;
}

async function certifyPackage(pkg: RealPackage) {
  const documentId = documentIdFor(pkg);
  const { index } = loadFwrgLsbStructuralIndex();
  const allNodes = index.allNodes().filter((n) => n.documentId === documentId);
  const sectionNodes = allNodes.filter((n) => n.nodeType === "SECTION");

  const discoveredCandidates = loadRealDiscoveredCandidates(pkg);
  const compiledResults = loadRealCompiledResults(pkg, discoveredCandidates);

  const result = await runSemanticCoverageAudit({
    companyId: `${pkg}-cert-3f1-6`,
    packageKey: `${pkg}-cert-package`,
    instrumentKey: null,
    index,
    documents: [{ documentId }],
    discoveredCandidates,
    compiledResults,
    verifiedCandidateRefs: new Set(),
    operativeState: null,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });

  const doc = result.packageCoverage.documents[0]!;
  const detail = result.documentDetails[0]!;

  // Section coverage: sections with >=1 FULLY_REPRESENTED_* unit anchored to them.
  const stateById = new Map(doc.coverageEntries.map((e) => [e.semanticUnitId, e.coverageState] as const));
  const fullyRepSectionNodeIds = new Set<string>();
  const anyUnitSectionNodeIds = new Set<string>();
  for (const u of doc.units) {
    for (const a of u.anchors) {
      if (!a.structuralNodeId) continue;
      anyUnitSectionNodeIds.add(a.structuralNodeId);
      const state = stateById.get(u.semanticUnitId);
      if (state === "FULLY_REPRESENTED_VERIFIED" || state === "FULLY_REPRESENTED_REVIEW_REQUIRED") fullyRepSectionNodeIds.add(a.structuralNodeId);
    }
  }
  // Roll anchored node ids up to enclosing SECTION nodes (anchors can be on SUBSECTION/CLAUSE nodes).
  function enclosingSectionId(nodeId: string): string | null {
    const node = index.getNodeById(nodeId);
    if (!node) return null;
    if (node.nodeType === "SECTION") return node.nodeId;
    const ancestors = index.getAncestors(nodeId);
    for (let i = ancestors.length - 1; i >= 0; i--) {
      if (ancestors[i]!.nodeType === "SECTION") return ancestors[i]!.nodeId;
    }
    return null;
  }
  const sectionsWithAnyUnit = new Set([...anyUnitSectionNodeIds].map(enclosingSectionId).filter((x): x is string => !!x));
  const sectionsFullyRepresented = new Set([...fullyRepSectionNodeIds].map(enclosingSectionId).filter((x): x is string => !!x));

  // Routing-layer chapeau/basket-sibling admission counts (independent of unit hypothesis).
  const routing = routeDocument(documentId, index);
  const admissionCounts: Record<string, number> = {};
  for (const r of routing.regions) for (const reason of r.admissionReasons) admissionCounts[reason] = (admissionCounts[reason] ?? 0) + 1;

  const categoryBuckets = bucketByCategory(doc);

  return {
    package: pkg,
    documentId,
    structuralSectionCount: sectionNodes.length,
    totalStructuralNodeCount: allNodes.length,
    realDiscoveredCandidateCount: discoveredCandidates.length,
    realCompiledResultCount: compiledResults.length,
    sectionCoverage: {
      sectionsWithAtLeastOneHypothesizedUnit: sectionsWithAnyUnit.size,
      sectionsWithAtLeastOneFullyRepresentedUnit: sectionsFullyRepresented.size,
      totalSections: sectionNodes.length,
      fullyRepresentedSectionFraction: sectionNodes.length > 0 ? sectionsFullyRepresented.size / sectionNodes.length : 0,
    },
    routingLayerAdmissionCounts: admissionCounts,
    routingClosureStats: routing.closureStats,
    categoryBuckets,
    dependencyDiscovery: {
      totalCrossSectionRelationshipSignalsDetected: detail.crossSectionFindings.length,
      foundInCompiledIR: detail.crossSectionFindings.filter((f) => f.found).length,
      notFoundInCompiledIR: detail.crossSectionFindings.filter((f) => !f.found).length,
      findings: detail.crossSectionFindings.map((f) => ({ relationshipType: f.relationshipType, found: f.found, reasoning: f.reasoning })),
    },
    overallDocument: {
      totalMaterialSemanticUnits: doc.units.length,
      rawFullyRepresentedFraction: doc.rawFullyRepresentedFraction,
      materialityWeightedFullyRepresentedFraction: doc.materialityWeightedFullyRepresentedFraction,
      gateStatus: doc.gateStatus,
      dangerousUnaccountedTotal: doc.dangerousUnaccounted.length,
      dangerousUnaccountedByReason: dangerousByReason(doc.dangerousUnaccounted),
      coverageStateBreakdown: (() => {
        const out: Record<string, number> = {};
        for (const e of doc.coverageEntries) out[e.coverageState] = (out[e.coverageState] ?? 0) + 1;
        return out;
      })(),
      familySummaries: doc.familySummaries,
    },
    packageStatus: result.packageCoverage.status,
    packageStatusReasons: result.packageCoverage.statusReasons,
  };
}

async function main() {
  const fwrg = await certifyPackage("fwrg");
  const lsb = await certifyPackage("lsb");
  const output = { generatedAt: new Date().toISOString(), packages: [fwrg, lsb] };
  writeFileSync("/tmp/phase-3f1-6-section14-raw.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
