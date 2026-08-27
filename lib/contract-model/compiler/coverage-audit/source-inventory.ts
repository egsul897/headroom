/**
 * Phase 2E - independent source-side coverage inventory (task §5/§6/§7).
 *
 * INDEPENDENCE: this module imports ONLY Phase 2A's StructuralIndex (raw
 * structural navigation over source text - allowed low-level
 * infrastructure per the independence contract) plus this phase's own
 * signals.ts/materiality.ts/identity.ts. It never imports
 * discovery/pipeline.ts, discovery/pass-*.ts, discovery/types.ts, or
 * context-retrieval/pipeline.ts - mechanically enforced by
 * tests/contract-model/coverage-audit-independence.test.ts. It never reads
 * a DiscoveredCandidate or a CovenantContextBundle. Candidate generation
 * here is over-inclusive by design (task §7 - "deliberately over-select
 * enough to protect recall"), but bounded to nodes with at least one real
 * independent signal (never "every paragraph is covenant material").
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { classifyMateriality } from "./materiality";
import { computeRegionId } from "./identity";
import { countInlineEnumerationMarkers, detectIndependentSignals, type SignalHit } from "./signals";
import { COVERAGE_AUDIT_ALGORITHM_VERSION, type CoverageRegion, type CoverageRegionRole } from "./types";

const HEADLINE_HEADING = /\b(?:Indebtedness|Liens?|Restricted Payments?|Investments?|Dispositions?|Asset Sales?|Affiliate Transactions?|Financial Covenants?|Guarant(?:y|ies|ee)|Security|Subsidiar(?:y|ies)|Merger|Consolidation|Fundamental Changes?|Change of Control|Sale.?Leaseback|Subordinat|Refinanc)/i;

const EXCERPT_LENGTH = 400;

function probableRole(signals: SignalHit[], node: StructuralNode, hasUnrepresentedMultiItem: boolean): CoverageRegionRole {
  const names = new Set(signals.map((s) => s.name));
  // Headline classification is a FALLBACK, not a priority match - a section
  // literally titled "Indebtedness"/"Liens"/etc. is the norm for every real
  // covenant section, so checking it first would swallow every more
  // specific role below into one generic bucket. It is only used when no
  // more specific independent signal fired at all (mirroring Phase 2B's
  // own "must never be dropped merely because chapeau text is signal-free"
  // rationale for headline sections, without letting it mask real signals).
  // Cap/basket/ratio-shaped economic mechanics are checked BEFORE the bare
  // "shall not" prohibition signal - "shall not exceed $X" is common cap
  // phrasing that would otherwise always mask the more specific
  // SHARED_CAP/BUILDER_GROWER/RATIO_TEST role beneath a generic prohibition.
  if (names.has("grower_basket") || names.has("builder_basket")) return "BUILDER_GROWER_CANDIDATE";
  if (names.has("shared_cap") || names.has("aggregate_amount")) return "SHARED_CAP_CANDIDATE";
  if (names.has("ratio_expression") || names.has("leverage_threshold") || names.has("coverage_threshold") || names.has("ratio_basket")) return "RATIO_TEST_CANDIDATE";
  if (names.has("shall_not") || names.has("may_not") || names.has("will_not") || names.has("shall_not_permit")) return "GENERAL_PROHIBITION_CANDIDATE";
  if (names.has("except") || names.has("provided_that") || names.has("notwithstanding")) return "EXCEPTION_CANDIDATE";
  if (names.has("no_default_condition") || names.has("pro_forma_compliance") || names.has("so_long_as") || names.has("subject_to") || names.has("unless") || names.has("only_if")) return "CONDITION_CANDIDATE";
  if (names.has("permit_permitted") || names.has("shall_be_permitted") || names.has("may_permissive")) return hasUnrepresentedMultiItem ? "BASKET_CANDIDATE" : "PERMISSION_CANDIDATE";
  if (names.has("restricted_subsidiary_mechanic")) return "ENTITY_SCOPE_CANDIDATE";
  if (names.has("reclassification") || names.has("redesignation") || names.has("refinancing")) return "AMENDMENT_MECHANIC_CANDIDATE";
  if (names.has("ebitda") || names.has("total_assets") || names.has("consolidated_assets") || names.has("available_amount")) return "CALCULATION_CANDIDATE";
  if (node.nodeType === "SECTION" && HEADLINE_HEADING.test(node.heading)) return "HEADLINE_SECTION_CANDIDATE";
  return "OTHER_ECONOMIC_SIGNAL";
}

export interface SourceInventoryOptions {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
}

/**
 * Independently inventories every structural region (SECTION/SUBSECTION/
 * CLAUSE/SUBCLAUSE, plus DEFINITION-shaped nodes if the index exposes
 * them as nodes) in one document whose OWN text fires at least one real
 * independent signal. Does not assume material content exists only in a
 * conventional covenant article (task §5's own instruction) - every node
 * in the document is scanned equally, headline or not.
 */
export function buildSourceCoverageInventory(documentId: string, index: StructuralIndex, options: SourceInventoryOptions): CoverageRegion[] {
  const nodes = index.allNodes().filter((n) => n.documentId === documentId);
  const regions: CoverageRegion[] = [];

  for (const node of nodes) {
    const ownText = index.getNodeText(node.nodeKey, "OWN");
    const signals = detectIndependentSignals(ownText);
    const isHeadline = node.nodeType === "SECTION" && HEADLINE_HEADING.test(node.heading);
    if (signals.length === 0 && !isHeadline) continue;

    const childRefs = new Set(index.getChildren(node.nodeKey).map((c) => c.sectionRef.toLowerCase().replace(/^.*\(/, "(")));
    // Exclude this node's OWN leading marker (e.g. node "6.02(i)" naturally
    // opens with the literal text "(i)") from the unrepresented count - that
    // marker identifies the node itself, not an unrepresented sibling item.
    const ownLeadingMarker = node.sectionRef.match(/\([^()]+\)$/)?.[0]?.toLowerCase();
    const inlineMarkers = countInlineEnumerationMarkers(ownText).filter((m) => m !== ownLeadingMarker);
    const unrepresentedMarkers = inlineMarkers.filter((m) => !childRefs.has(m));
    const possibleUnstructuredMultiItem = unrepresentedMarkers.length >= 2;

    const signalNames = signals.map((s) => s.name).sort();
    regions.push({
      regionId: computeRegionId(documentId, node.nodeKey, signalNames.join(",")),
      companyId: options.companyId,
      packageKey: options.packageKey,
      instrumentKey: options.instrumentKey,
      documentId,
      structuralNodeKey: node.nodeKey,
      sectionRef: node.sectionRef,
      sourceCitation: `${documentId}::${node.sectionRef}`,
      excerptText: ownText.slice(0, EXCERPT_LENGTH),
      detectedSignals: signalNames,
      probableRole: probableRole(signals, node, possibleUnstructuredMultiItem),
      possibleUnstructuredMultiItem,
      inlineEnumeratedItemCount: unrepresentedMarkers.length,
      auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
      provenance: `independent structural scan of ${node.nodeType} ${node.sectionRef}'s own text - no discovery/context-retrieval output consulted`,
    });
  }

  return regions;
}

/** Convenience: materiality per region, computed lazily from its own detectedSignals (re-derives the SignalHit shape from the stored names, since CoverageRegion only stores flat names for serialization stability). */
export function regionMateriality(region: CoverageRegion): ReturnType<typeof classifyMateriality> {
  const reconstructed: SignalHit[] = region.detectedSignals.map((name) => ({ name, category: inferCategory(name) }));
  return classifyMateriality(reconstructed);
}

function inferCategory(name: string): SignalHit["category"] {
  if (["shall_not", "may_not", "will_not", "permit_permitted", "except", "provided_that", "notwithstanding", "subject_to", "so_long_as", "may_permissive", "shall_be_permitted", "shall_not_permit", "unless", "only_if"].includes(name)) return "PROHIBITORY_PERMISSIVE";
  if (["currency_value", "percentage", "ratio_expression", "greater_of", "lesser_of", "aggregate_amount", "fixed_amount", "ebitda", "total_assets", "consolidated_assets", "available_amount", "builder_concept", "leverage_threshold", "coverage_threshold", "cap_language", "annual_limit", "cumulative_limit"].includes(name)) return "ECONOMIC";
  if (["grower_basket", "builder_basket", "ratio_basket", "shared_cap", "anti_duplication", "reclassification", "redesignation", "refinancing", "no_default_condition", "pro_forma_compliance", "mandatory_prepayment", "asset_sale_sweep", "cure_right", "acquisition_permission", "restricted_subsidiary_mechanic"].includes(name)) return "MECHANIC";
  return "FAMILY_HEADLINE";
}
