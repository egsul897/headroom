/**
 * Phase 3E §155 - Layer A/B: deterministic semantic-unit hypothesis
 * generation. Takes the router's own admitted regions (router.ts) and
 * splits each into one or more MaterialSemanticUnit hypotheses - never
 * forced 1:1 with a structural node (task §7). The concrete motivating
 * case (task's own worked example): a single "shall not... except:"
 * section enumerating several carve-outs, one of which states its own
 * numeric dollar limitation, is modeled as an umbrella prohibition unit
 * PLUS one separately-represented PERMISSION unit per enumerated
 * carve-out - a carve-out with a stated cap is a basket in its own right,
 * structurally, even when it appears inside a longer prose list of
 * otherwise unlimited/qualitative carve-outs.
 *
 * INDEPENDENCE: reuses coverage-audit/signals.ts's detectIndependentSignals
 * directly (a pure, generic, already-tested text-pattern utility with zero
 * Phase 2B/2D conclusion dependency - the same reuse precedent router.ts
 * and Phase 3C's source-inventory.ts both already established). The
 * enumerated-item splitter below is independently authored against this
 * task's own §7/§13 requirement, not derived from
 * coverage-audit/signals.ts's own countInlineEnumerationMarkers (which
 * returns deduplicated marker names only, not the positions this layer
 * needs to actually split text into item spans) - inevitable vocabulary
 * overlap with that function's own "genuine item" gap heuristic is
 * expected, since both address the same real drafting pattern.
 *
 * This file never imports discovery/*, context-retrieval/*, semantic/
 * compile.ts, semantic-verification/verify.ts, or semantic-precedent/* -
 * enforced by tests/contract-model/semantic-coverage-independence.test.ts.
 */
import type { StructuralIndex } from "../structural-index";
import { detectIndependentSignals, detectAmendmentAndDefinitionalSignals, type SignalHit } from "../coverage-audit/signals";
import { computeSemanticUnitId } from "./identity";
import type { DocumentRoutingResult, DetectedPostureSignal, MaterialSemanticUnit, MaterialUnitFamily, RoutedRegion, SemanticUnitMateriality, SourceAnchor } from "./types";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "./types";

/** Merges the two signal families coverage-audit/signals.ts exposes - detectIndependentSignals' own PROHIBITORY_PERMISSIVE/ECONOMIC/MECHANIC/FAMILY_HEADLINE set plus the DEFINITIONAL category from detectAmendmentAndDefinitionalSignals (deliberately kept out of the former by that module's own design for its unrelated fallback-path purpose, but genuinely needed here so a real "X means..." definition is classified DEFINITIONAL_SIGNAL rather than falling through to whatever weaker signal happens to co-occur in the same clause). */
function detectAllSignals(text: string): SignalHit[] {
  return [...detectIndependentSignals(text), ...detectAmendmentAndDefinitionalSignals(text).filter((s) => s.category === "DEFINITIONAL")];
}

// ---------------------------------------------------------------------------
// Enumerated-item splitting (task §7/§13)
// ---------------------------------------------------------------------------

const ENUMERATION_MARKER = /\((?:[ivxlcdm]{1,6}|[a-z]{1,2}|\d{1,3})\)/gi;
const MIN_GAP_CHARS = 12;
const SUBSTANTIVE_NEARBY_GAP = /[$%]|greater of|lesser of|shall not|provided|so long as|notwithstanding|except|Indebtedness|Investment|Restricted Payment|Lien|Disposition/i;

interface MarkerOccurrence {
  marker: string;
  start: number;
  end: number;
}

function findGenuineMarkers(text: string): MarkerOccurrence[] {
  const re = new RegExp(ENUMERATION_MARKER.source, ENUMERATION_MARKER.flags);
  const occurrences: MarkerOccurrence[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    occurrences.push({ marker: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  const genuine: MarkerOccurrence[] = [];
  for (let i = 0; i < occurrences.length; i++) {
    const cur = occurrences[i]!;
    const nextStart = i + 1 < occurrences.length ? occurrences[i + 1]!.start : text.length;
    const gapText = text.slice(cur.end, nextStart);
    if (gapText.trim().length >= MIN_GAP_CHARS || SUBSTANTIVE_NEARBY_GAP.test(gapText)) genuine.push(cur);
  }
  return genuine;
}

export interface EnumeratedSplit {
  chapeauText: string;
  chapeauEnd: number;
  items: { marker: string; start: number; end: number; text: string }[];
}

/**
 * Splits region text into a chapeau (the umbrella text before the first
 * genuine enumerated item) plus one span per genuine item. Returns null
 * when fewer than two genuine markers are found (task's own "never force
 * 1:1" cuts both ways - a region with zero or one enumerated item is left
 * as a single unit, not artificially split).
 */
export function splitEnumeratedItems(text: string): EnumeratedSplit | null {
  const markers = findGenuineMarkers(text);
  if (markers.length < 2) return null;
  const items = markers.map((marker, i) => {
    const nextStart = i + 1 < markers.length ? markers[i + 1]!.start : text.length;
    return { marker: marker.marker, start: marker.start, end: nextStart, text: text.slice(marker.end, nextStart) };
  });
  return { chapeauText: text.slice(0, markers[0]!.start), chapeauEnd: markers[0]!.start, items };
}

// ---------------------------------------------------------------------------
// Family classification (task §9) - open taxonomy, headingHint checked
// first (most reliable - a real section heading like "6.01 Indebtedness"),
// falling back to the unit's own text. Generic keyword matching only - no
// company/package-specific term appears here (Architecture Invariants #29).
// ---------------------------------------------------------------------------

const FAMILY_KEYWORDS: { family: MaterialUnitFamily; re: RegExp }[] = [
  { family: "INDEBTEDNESS", re: /\bIndebtedness\b/i },
  { family: "LIENS", re: /\bLiens?\b/i },
  { family: "RESTRICTED_PAYMENTS", re: /\bRestricted Payments?\b/i },
  { family: "INVESTMENTS", re: /\bInvestments?\b/i },
  { family: "ACQUISITIONS", re: /\bAcquisitions?\b/i },
  { family: "ASSET_SALES", re: /\bAsset Sales?\b/i },
  { family: "DISPOSITIONS", re: /\bDispositions?\b/i },
  { family: "SALE_LEASEBACKS", re: /\bSale.?Leaseback/i },
  { family: "FINANCIAL_COVENANTS", re: /\bFinancial Covenants?\b/i },
  { family: "MANDATORY_PREPAYMENTS", re: /\bMandatory Prepayments?\b/i },
  { family: "REPORTING_INFORMATION", re: /\b(?:Reporting Requirements?|Financial Statements)\b/i },
  { family: "FUNDAMENTAL_CHANGES", re: /\b(?:Fundamental Changes?|Merger|Consolidation)\b/i },
  { family: "AFFILIATE_TRANSACTIONS", re: /\bAffiliate Transactions?\b/i },
  { family: "GUARANTOR_REQUIREMENTS", re: /\bGuarantor Requirements?\b/i },
  { family: "GUARANTEES", re: /\bGuarant(?:y|ies|ee)\b/i },
  { family: "COLLATERAL_SECURITY", re: /\b(?:Collateral|Security Agreement|Security Interest)\b/i },
  { family: "CHANGE_OF_CONTROL", re: /\bChange of Control\b/i },
  { family: "EVENTS_OF_DEFAULT", re: /\bEvents? of Default\b/i },
  { family: "RATING_TRIGGERS", re: /\bRating\b/i },
  { family: "SPRINGING_COVENANTS", re: /\bSpringing\b/i },
];

export function classifyFamily(text: string, headingHint: string | null): { family: MaterialUnitFamily; evidence: string | null } {
  if (headingHint) {
    for (const { family, re } of FAMILY_KEYWORDS) {
      if (re.test(headingHint)) return { family, evidence: `heading "${headingHint}" matched ${family}` };
    }
  }
  for (const { family, re } of FAMILY_KEYWORDS) {
    if (re.test(text)) return { family, evidence: `unit text matched ${family} keyword` };
  }
  return { family: "OTHER_UNCLASSIFIED", evidence: "no known family keyword matched heading or unit text - genuinely novel or non-covenant material" };
}

// ---------------------------------------------------------------------------
// Posture-signal + materiality classification (task §8/§10)
// ---------------------------------------------------------------------------

export function classifyPostureSignal(signals: SignalHit[], isExceptionItem: boolean): DetectedPostureSignal {
  const names = new Set(signals.map((s) => s.name));
  // An enumerated item nested inside an exception/carve-out list is a permission by
  // construction, even when its own text carries no independent "may"/"permit" wording
  // of its own (task's own worked example: "(a) Indebtedness ... not to exceed $X" reads
  // as a bare description, but structurally IS the permission the chapeau's "except:" grants).
  if (isExceptionItem) return "PERMISSION_SIGNAL";
  if (names.has("shall_not") || names.has("may_not") || names.has("will_not") || names.has("shall_not_permit")) return "PROHIBITION_SIGNAL";
  if (names.has("permit_permitted") || names.has("shall_be_permitted") || names.has("may_permissive")) return "PERMISSION_SIGNAL";
  if (names.has("quoted_term_means") || names.has("quoted_term_colon")) return "DEFINITIONAL_SIGNAL";
  if (names.has("so_long_as") || names.has("subject_to") || names.has("unless") || names.has("only_if")) return "CONDITION_ONLY_SIGNAL";
  if (names.has("reclassification") || names.has("redesignation") || names.has("refinancing")) return "AMENDMENT_MECHANIC_SIGNAL";
  if (names.has("ebitda") || names.has("total_assets") || names.has("consolidated_assets")) return "CALCULATION_SIGNAL";
  return "UNCLEAR_SIGNAL";
}

const ECONOMIC_SIGNAL_NAMES = new Set(["currency_value", "percentage", "ratio_expression", "greater_of", "lesser_of", "aggregate_amount", "fixed_amount", "cap_language", "annual_limit", "cumulative_limit"]);
const REAL_MECHANIC_SIGNAL_NAMES = new Set(["grower_basket", "builder_basket", "ratio_basket", "shared_cap", "anti_duplication", "reclassification", "redesignation", "refinancing", "no_default_condition", "pro_forma_compliance", "mandatory_prepayment", "asset_sale_sweep", "cure_right", "acquisition_permission", "restricted_subsidiary_mechanic", "shall_not", "may_not", "will_not", "except", "provided_that", "notwithstanding", "subject_to", "so_long_as"]);

/**
 * Phase 3F.1 §27/F2 - a bare cross-reference to another provision's own
 * economics ("permitted under Section 6.04", "described in clause (c) of
 * the definition of Permitted Indebtedness") carries no local numeric or
 * keyword signal of its own, but is not confidently unimportant either -
 * the referenced provision may itself be materially significant, and this
 * unit cannot resolve that without following the reference. Generic
 * pattern only (no package-specific term list, Architecture Invariants
 * #29) - never upgrades past REVIEW_UNCERTAIN on its own; a genuine
 * upgrade to MATERIAL/CRITICAL still requires either a local signal or the
 * contextual floor (applyContextualMaterialityFloor).
 */
const CROSS_REFERENCE_PATTERN = /\b(?:permitted|described|set forth|referred to|as defined)\s+(?:under|pursuant to|in|by)\s+(?:clause|Section|paragraph|the definition of)\b/i;

export function classifyMateriality(signals: SignalHit[], ownText?: string): { materiality: SemanticUnitMateriality; reasoning: string } {
  const names = signals.map((s) => s.name);
  const economicHit = names.find((n) => ECONOMIC_SIGNAL_NAMES.has(n));
  if (economicHit) return { materiality: "CRITICAL", reasoning: `unit's own text carries an independent economic signal (${economicHit}) - an omission here could change a capacity/permission conclusion` };
  const mechanicHit = names.find((n) => REAL_MECHANIC_SIGNAL_NAMES.has(n));
  if (mechanicHit) return { materiality: "MATERIAL", reasoning: `unit's own text carries a real legal/mechanic signal (${mechanicHit}) with no independent numeric value of its own` };
  if (names.length > 0) return { materiality: "REVIEW_UNCERTAIN", reasoning: `unit's own text carries only weak/headline-shaped signal(s) (${names.join(", ")}) - materiality could not be confidently classified` };
  if (ownText && CROSS_REFERENCE_PATTERN.test(ownText)) return { materiality: "REVIEW_UNCERTAIN", reasoning: "unit's own text is a bare cross-reference to another provision's economics with no independent local signal - the referenced provision may itself be material, so this is not confidently unimportant" };
  return { materiality: "INFORMATIONAL", reasoning: "unit's own text carries no independently detected legal or economic signal" };
}

// ---------------------------------------------------------------------------
// Region -> unit(s) (task §7/§8)
// ---------------------------------------------------------------------------

interface HypothesisContext {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  operativeVersionRef: string | null;
}

function buildUnit(input: {
  ctx: HypothesisContext;
  anchors: SourceAnchor[];
  excerptText: string;
  signals: SignalHit[];
  isExceptionItem: boolean;
  headingHint: string | null;
  fromRawSourceFallback: boolean;
  detectionSignature: string;
}): MaterialSemanticUnit {
  const posture = classifyPostureSignal(input.signals, input.isExceptionItem);
  const { materiality, reasoning } = classifyMateriality(input.signals, input.excerptText);
  const { family, evidence } = classifyFamily(input.excerptText, input.headingHint);
  const signalNames = input.signals.map((s) => s.name).sort();
  return {
    semanticUnitId: computeSemanticUnitId(input.anchors, input.detectionSignature),
    companyId: input.ctx.companyId,
    packageKey: input.ctx.packageKey,
    instrumentKey: input.ctx.instrumentKey,
    operativeVersionRef: input.ctx.operativeVersionRef,
    granularity: "SEMANTIC_UNIT",
    anchors: input.anchors,
    family,
    familyEvidence: evidence,
    postureSignal: posture,
    materiality,
    materialityReasoning: reasoning,
    contextuallyElevated: false,
    excerptText: input.excerptText.slice(0, 500),
    detectedSignals: signalNames,
    fromRawSourceFallback: input.fromRawSourceFallback,
    detectionMethod: "STRUCTURAL_HYPOTHESIS",
    aiInventoryPromptVersion: null,
    confidence: input.fromRawSourceFallback ? "LOW" : materiality === "REVIEW_UNCERTAIN" ? "MEDIUM" : "HIGH",
    uncertaintyReasons: input.fromRawSourceFallback ? ["derived from raw-source fallback path - no structural node anchors this unit"] : [],
    inventoryAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
    provenance: `deterministic Layer A/B hypothesis over ${input.fromRawSourceFallback ? "raw-source-fallback" : "structural"} region - no discovery/context-retrieval/compiler/verifier/precedent output consulted`,
  };
}

/**
 * Hypothesizes one or more MaterialSemanticUnits from a single routed
 * region's own full text (task §7 - never forced 1:1 with the region's own
 * structural node). `fullText` must be the region's real OWN text (the
 * router's own excerptText is truncated for display and must never be used
 * for splitting - see the caller below).
 */
export function hypothesizeUnitsForRegion(region: RoutedRegion, fullText: string, headingHint: string | null, ctx: HypothesisContext, parentIsExceptionChapeau = false): MaterialSemanticUnit[] {
  const baseAnchor: SourceAnchor = {
    documentId: region.documentId,
    structuralNodeKey: region.structuralNodeKey,
    sectionRef: region.sectionRef,
    charStart: region.charStart,
    charEnd: region.charEnd,
    sourceCitation: region.structuralNodeKey ? `${region.documentId}::${region.sectionRef}` : `${region.documentId}::raw[${region.charStart}-${region.charEnd}]`,
  };

  const split = splitEnumeratedItems(fullText);
  if (!split) {
    // task's own worked example applies even when the structural parser has ALREADY split
    // an "except: (a)...(b)...(c)..." list into separate child nodes (the common real-parser
    // case - see router.ts's own possibleUnstructuredMultiItem handling of the opposite
    // scenario) - a region whose PARENT node's own text is the exception chapeau is itself
    // the permission that chapeau grants, even though no text-level split happens HERE.
    const signals = detectAllSignals(fullText);
    return [
      buildUnit({
        ctx,
        anchors: [baseAnchor],
        excerptText: fullText,
        signals,
        isExceptionItem: parentIsExceptionChapeau,
        headingHint,
        fromRawSourceFallback: region.fromRawSourceFallback,
        detectionSignature: `whole-region:${signals.map((s) => s.name).sort().join(",")}`,
      }),
    ];
  }

  const chapeauSignals = detectAllSignals(split.chapeauText);
  const chapeauIsException = chapeauSignals.some((s) => s.name === "except");
  const units: MaterialSemanticUnit[] = [
    buildUnit({
      ctx,
      anchors: [{ ...baseAnchor, charEnd: baseAnchor.charStart + split.chapeauEnd }],
      excerptText: split.chapeauText,
      signals: chapeauSignals,
      isExceptionItem: false,
      headingHint,
      fromRawSourceFallback: region.fromRawSourceFallback,
      detectionSignature: `chapeau:${chapeauSignals.map((s) => s.name).sort().join(",")}`,
    }),
  ];

  for (const item of split.items) {
    const itemSignals = detectAllSignals(item.text);
    units.push(
      buildUnit({
        ctx,
        anchors: [{ ...baseAnchor, charStart: baseAnchor.charStart + item.start, charEnd: baseAnchor.charStart + item.end }],
        excerptText: item.text,
        signals: itemSignals,
        isExceptionItem: chapeauIsException,
        headingHint,
        fromRawSourceFallback: region.fromRawSourceFallback,
        detectionSignature: `item:${item.marker}:${itemSignals.map((s) => s.name).sort().join(",")}`,
      })
    );
  }

  return units;
}

function findNearestHeading(index: StructuralIndex, nodeKey: string): string | null {
  const node = index.getNode(nodeKey);
  if (node?.nodeType === "SECTION" && node.heading) return node.heading;
  const ancestors = index.getAncestors(nodeKey);
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!;
    if (a.nodeType === "SECTION" && a.heading) return a.heading;
  }
  return null;
}

/**
 * Hypothesizes units for every region a single document's routing pass
 * admitted (router.ts's own DocumentRoutingResult). Fetches each region's
 * REAL full text from the StructuralIndex (or the document's raw text for
 * a raw-source-fallback region) - never the router's own truncated
 * excerptText.
 */
function parentIsExceptionChapeau(index: StructuralIndex, nodeKey: string): boolean {
  const parent = index.getParent(nodeKey);
  if (!parent) return false;
  const parentOwnText = index.getNodeText(parent.nodeKey, "OWN");
  return detectAllSignals(parentOwnText).some((s) => s.name === "except");
}

const MATERIALITY_RANK: Record<SemanticUnitMateriality, number> = { CRITICAL: 3, MATERIAL: 2, REVIEW_UNCERTAIN: 1, INFORMATIONAL: 0 };
/** Floor tier applied by context (task §21/§22) - MATERIAL, never CRITICAL: CRITICAL is reserved for a unit's own INDEPENDENT economic significance (types.ts's own documented reasoning for the 4-tier split), so mere structural nesting under a CRITICAL parent never itself manufactures a second CRITICAL unit. */
const CONTEXTUAL_FLOOR: SemanticUnitMateriality = "MATERIAL";

/**
 * Phase 3F.1 §19-23/F2 - the core fix for the confirmed materiality-
 * misclassification defect: classifyMateriality (above) is necessarily
 * local-only (it runs per-unit, before sibling/parent units exist yet).
 * This document-level PASS runs after every region in the document has
 * been hypothesized, so it can look up each unit's real structural PARENT
 * unit (if the parent was itself admitted and hypothesized - which,
 * combined with Workstream A's routing-closure fix, it now reliably is for
 * a genuine operative parent) and apply a materiality FLOOR when the
 * parent is itself operative and materially significant.
 *
 * SELECTIVE, NOT UNIVERSAL (task §22/§55's explicit requirement): the
 * floor applies only when the PARENT's own materiality already reached
 * CRITICAL/MATERIAL AND the parent's own posture is PROHIBITION_SIGNAL,
 * OBLIGATION_SIGNAL, or the parent fires the "except" signal (a genuine
 * operative restriction/obligation/exception-list chapeau) - a boilerplate
 * or purely definitional parent (materiality INFORMATIONAL/REVIEW_UNCERTAIN,
 * or posture DEFINITIONAL/CONDITION_ONLY/UNCLEAR with no "except") never
 * elevates its children. The floor never LOWERS a unit's own local
 * materiality (a unit with its own independent CRITICAL signal keeps it),
 * and never manufactures a second CRITICAL merely by nesting (see
 * CONTEXTUAL_FLOOR above).
 */
export function applyContextualMaterialityFloor(units: MaterialSemanticUnit[], index: StructuralIndex): MaterialSemanticUnit[] {
  if (units.length === 0) return units;

  // The MOST materially-significant unit at each structural node - a node
  // occasionally yields >1 unit (splitEnumeratedItems' own chapeau+items),
  // and the chapeau (not a low-materiality sibling item) is what should
  // represent that node's own materiality/posture for floor purposes.
  const bestUnitByNodeKey = new Map<string, MaterialSemanticUnit>();
  for (const u of units) {
    const nodeKey = u.anchors[0]?.structuralNodeKey;
    if (!nodeKey) continue;
    const existing = bestUnitByNodeKey.get(nodeKey);
    if (!existing || MATERIALITY_RANK[u.materiality] > MATERIALITY_RANK[existing.materiality]) bestUnitByNodeKey.set(nodeKey, u);
  }

  return units.map((unit) => {
    const nodeKey = unit.anchors[0]?.structuralNodeKey;
    if (!nodeKey) return unit; // raw-source-fallback units have no structural parent to inherit from
    const parentNode = index.getParent(nodeKey);
    if (!parentNode) return unit;
    const parentUnit = bestUnitByNodeKey.get(parentNode.nodeKey);
    if (!parentUnit) return unit; // parent was never admitted/hypothesized - nothing to inherit from (a genuine remaining routing gap, Workstream A's own concern)

    const parentIsOperative = parentUnit.postureSignal === "PROHIBITION_SIGNAL" || parentUnit.postureSignal === "OBLIGATION_SIGNAL" || parentUnit.detectedSignals.includes("except");
    const parentIsMaterialEnough = parentUnit.materiality === "CRITICAL" || parentUnit.materiality === "MATERIAL";

    if (!parentIsOperative || !parentIsMaterialEnough) return unit;
    if (MATERIALITY_RANK[unit.materiality] >= MATERIALITY_RANK[CONTEXTUAL_FLOOR]) return unit; // already at/above the floor - nothing to elevate, and the reasoning already reflects its own real basis

    return {
      ...unit,
      materiality: CONTEXTUAL_FLOOR,
      materialityReasoning: `${unit.materialityReasoning} | ELEVATED to ${CONTEXTUAL_FLOOR} by contextual floor (Phase 3F.1 §19-21): structural child of ${parentNode.nodeKey} (parent materiality ${parentUnit.materiality}, posture ${parentUnit.postureSignal}) - a nested item under an operative restriction/obligation/exception list carries real legal or economic effect regardless of whether its own text independently states a number.`,
      contextuallyElevated: true,
    };
  });
}

export function hypothesizeUnitsForDocument(routing: DocumentRoutingResult, index: StructuralIndex, ctx: HypothesisContext): MaterialSemanticUnit[] {
  const units: MaterialSemanticUnit[] = [];
  for (const region of routing.regions) {
    const fullText = region.structuralNodeKey ? index.getNodeText(region.structuralNodeKey, "OWN") : (index.getDocumentText(region.documentId) ?? "").slice(region.charStart, region.charEnd);
    const headingHint = region.structuralNodeKey ? findNearestHeading(index, region.structuralNodeKey) : null;
    const parentException = region.structuralNodeKey ? parentIsExceptionChapeau(index, region.structuralNodeKey) : false;
    units.push(...hypothesizeUnitsForRegion(region, fullText, headingHint, ctx, parentException));
  }
  return applyContextualMaterialityFloor(units, index);
}
